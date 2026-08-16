---
id: observabilidade-de-fluxo
title: "Observabilidade de fluxo: onde está o pagamento X?"
summary: "A árvore causal por correlationId e causationId, as métricas que só existem em EDA — idade do evento, sagas pendentes, eventos órfãos — e o painel que operações abre."
estimatedMinutes: 50
references:
  - title: "OpenTelemetry — Context propagation"
    url: https://opentelemetry.io/docs/concepts/context-propagation/
  - title: "OpenTelemetry — Span links"
    url: https://opentelemetry.io/docs/concepts/signals/traces/#span-links
  - title: "Google SRE Book — Monitoring Distributed Systems"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
---

## A pergunta que define o marco

Alguém do atendimento pergunta: **"onde está o pagamento do cliente X?"**. O relógio começa
a correr. Se a resposta exige abrir o banco de quatro serviços, você não tem observabilidade
de fluxo — tem log.

A trilha de observabilidade cobriu métricas, logs, traces e alertas. Este marco cobre o que
é específico de um sistema orientado a eventos: **um caso de negócio que atravessa horas,
processos e filas**, e que nenhum trace de requisição captura inteiro.

## A árvore causal

Dois campos do envelope (marco 05) fazem o trabalho:

- **`correlationId`** — o caso inteiro. Todos os eventos de um pagamento, do clique à
  liquidação, carregam o mesmo valor. É o que você digita na busca.
- **`causationId`** — a aresta. Aponta para o evento ou comando que causou **este** evento.

Com os dois, a lista vira árvore:

```
correlationId: pay-8f2c
├─ PagamentoIniciado         (causation: cmd-iniciar)
├─ RiscoAprovado             (causation: PagamentoIniciado)
├─ LiquidaçãoSolicitada      (causation: RiscoAprovado)
│  ├─ EnvioAoPSP tentativa 1 (causation: LiquidaçãoSolicitada) → timeout
│  └─ EnvioAoPSP tentativa 2 (causation: LiquidaçãoSolicitada) → ok
└─ ClienteNotificado         (causation: LiquidaçãoConfirmada)
```

Só com `correlationId` você teria os mesmos sete registros numa lista plana, e a pergunta
"o que causou a segunda tentativa?" continuaria sem resposta.

O erro que destrói isso é gerar um `correlationId` novo a cada salto — o que transforma uma
árvore em vinte troncos soltos. O `correlationId` nasce na borda e **nunca** é regenerado; o
`causationId` muda a cada evento, por definição.

No plano de traces, a ligação entre produtor e consumidor de um evento é um **span link**, e
não um span filho: o consumo pode acontecer minutos depois, e um span filho com essa duração
mentiria sobre a latência (`observabilidade/10` e `kafka/14` cobrem a mecânica).

## As métricas que só existem em EDA

RED e USE não têm nada a dizer sobre um processo que dura três horas. Estas têm:

| Métrica | O que revela | Alerta útil |
| --- | --- | --- |
| **Idade do evento no consumo** | `now − occurredAt`: quanto o sistema está atrás da realidade | acima da janela declarada no marco 04 |
| **Lag da projeção** | quanto o extrato está atrás do ledger | sintoma: "extrato 30s atrás" |
| **Sagas pendentes por faixa de idade** | processos parados que ninguém está vendo | qualquer saga aberta há > 30min |
| **Taxa de compensação** | quanto do fluxo está desfazendo em vez de fazer | subida súbita = algo quebrou a montante |
| **Eventos órfãos** | publicados e consumidos por ninguém | > 0 sem justificativa no catálogo |
| **Taxa de dedup no inbox** | quanta reentrega o sistema absorve | salto repentino = produtor com problema |

Duas delas merecem destaque. **Idade do evento** não é a mesma coisa que consumer lag: lag
mede mensagens acumuladas, idade mede tempo desde o fato — e é a idade que se compara com a
janela prometida ao cliente. **Taxa de compensação** é a métrica de negócio deste marco: uma
saga compensando é dinheiro voltando, e uma subida súbita costuma anteceder o telefonema.

## O painel de sagas

O painel deste marco não é da engenharia — é do **time de operações**. Ele responde três
perguntas, e nenhuma delas é sobre infraestrutura:

1. **Quantas sagas estão abertas agora?**
2. **Há quanto tempo?** — distribuição por faixa de idade, não a média (a média esconde a
   catástrofe, é a lição de `observabilidade/02`).
3. **Em que passo estão paradas?** — se vinte estão em `AGUARDANDO_PSP`, o problema tem nome
   e endereço.

Mais uma linha que vale ouro: a lista das sagas mais antigas, clicável, levando à árvore
causal daquele `correlationId`.

## Alerta de sintoma, aplicado a fluxo

A regra de `observabilidade/13` — alerta é por sintoma que o usuário sente, causa vai para
painel e runbook — se traduz assim em EDA:

| Em vez de… | Alerte por… |
| --- | --- |
| "consumer lag alto" | "sagas pendentes há mais de 30 minutos" |
| "erro no consumidor de liquidação" | "idade do evento acima da janela declarada" |
| "DLQ com mensagens" | "pagamentos sem estado terminal há mais de 1 hora" |

Lag alto durante um backfill legítimo não é incidente. Pagamento parado é incidente,
independentemente do que o lag esteja mostrando. A tradução, em uma frase: **alerte sobre o
processo de negócio, não sobre a mecânica que o transporta**.

## Exemplo numa fintech

O regulador pergunta: *todo pagamento iniciado terminou em um estado terminal?*

É uma pergunta de conformidade, e ela é respondível por construção se o sistema for
desenhado para isso. O estado terminal de um pagamento é um conjunto fechado — liquidado,
recusado, estornado, expirado — e a métrica é:

```
pagamentos_iniciados(dia) − pagamentos_em_estado_terminal(dia) = pendentes
```

Se `pendentes` não converge para zero dentro da janela, existem pagamentos perdidos no meio
do caminho. Ter esse número num painel muda a conversa com o regulador: em vez de "vamos
levantar", a resposta é "hoje foram 4, todos resolvidos em até 2h, aqui está a lista".

E o efeito interno é maior que o externo: o número obriga o desenho a fechar. Todo caminho
precisa terminar em algum lugar — inclusive o do erro, inclusive o do timeout, inclusive o
do estorno fora da janela do marco 09.

## Hands-on

**Desafio — responder "onde está o pagamento X?" em menos de 30 segundos, sem abrir o
banco.**

1. Garanta que todo evento do `fin-flow` carrega `correlationId` (nascido na borda, nunca
   regenerado) e `causationId`.
2. Propague o contexto de trace entre produtor e consumidor, ligando o consumo por span link.
3. Exponha as seis métricas da tabela, com labels de cardinalidade baixa — `tipo`, `passo`,
   `resultado`. **Nunca** `accountId` como label (é a lição de `observabilidade/08`; o caso
   individual mora em log e trace).
4. Construa o painel de sagas com as três perguntas e a lista das mais antigas.
5. Crie o alerta "saga aberta há mais de 30 minutos" e o de "pagamentos sem estado terminal".
6. Cronometre: pegue um `correlationId` e responda em que passo o pagamento está. Se passou
   de 30 segundos, o painel não está pronto.

**Invariantes testáveis**

1. Todo evento publicado tem `correlationId` e `causationId` não nulos — um teste no
   produtor prova isso.
2. O `correlationId` de um pagamento é o mesmo do primeiro ao último evento da cadeia.
3. A árvore causal de um pagamento pode ser reconstruída apenas com os eventos, sem
   consultar o banco de nenhum serviço.
4. Nenhuma métrica de fluxo usa identificador de conta ou de pagamento como label.
5. Existe pelo menos um alerta cuja condição é a idade de um processo, não um erro.

**Complemento.** Injete uma falha que deixe uma saga pendurada em `AGUARDANDO_PSP` e
cronometre quanto tempo até alguém (ou algum alerta) perceber. Esse número é o seu MTTD para
o modo de falha mais comum de EDA — o silêncio.

**Checagem**

1. O que `causationId` acrescenta que `correlationId` sozinho não dá?
2. Qual a diferença entre idade do evento e consumer lag, e qual das duas se compara com a
   janela prometida ao cliente?
3. Por que o painel de sagas é do time de operações, e quais três perguntas ele responde?
4. Como se responde ao regulador que todo pagamento iniciado terminou — e por que essa
   métrica melhora o desenho, não só o relatório?

## Principais aprendizados

- `correlationId` dá o caso e `causationId` dá a aresta: juntos reconstroem a árvore causal.
  Regenerar o `correlationId` a cada salto transforma a árvore em troncos soltos.
- Idade do evento, lag da projeção, sagas pendentes, taxa de compensação, eventos órfãos e
  taxa de dedup são as métricas que RED e USE não cobrem.
- O painel de sagas é de operações: quantas abertas, há quanto tempo, paradas em que passo —
  distribuição, nunca média.
- Alerte sobre o processo de negócio ("saga pendente há 30min"), não sobre a mecânica que o
  transporta ("consumer lag alto").
- "Todo pagamento iniciado terminou em estado terminal?" é a métrica que obriga o desenho a
  fechar todos os caminhos, inclusive os de erro.
