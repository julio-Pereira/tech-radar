---
id: transacoes-distribuidas
title: "Transações distribuídas: o que existe e o que morreu"
summary: "Por que 2PC não pegou, o que NewSQL entrega de verdade, e por que a reconciliação — não a esperança — é o que torna a consistência eventual auditável."
estimatedMinutes: 55
references:
  - title: "Microservices.io — Saga pattern"
    url: https://microservices.io/patterns/data/saga.html
  - title: "Google Research — Spanner: Google's Globally-Distributed Database"
    url: https://research.google/pubs/pub39966/
  - title: "CockroachDB — Transaction Layer"
    url: https://www.cockroachlabs.com/docs/stable/architecture/transaction-layer.html
---

## 2PC por dentro, e as três falhas que o mataram

O protocolo de commit em duas fases faz exatamente o que o nome diz. Fase 1, **prepare**: o
coordenador pergunta a cada participante se ele consegue commitar; cada um grava a intenção de
forma durável e responde sim ou não, prometendo que conseguirá cumprir. Fase 2, **commit**: se
todos disseram sim, o coordenador manda commitar; se algum disse não, manda abortar.

No papel é elegante. Na prática, três problemas o tiraram do desenho dominante:

**Recursos ficam bloqueados durante o prepare.** Entre o "sim" e o comando final, cada
participante segura locks. Se o coordenador demora — ou some —, os locks ficam. Um pico de
latência no coordenador vira contenção em todos os bancos ao mesmo tempo.

**O coordenador é SPOF.** Se ele cai depois de receber os "sim" e antes de mandar o commit,
ninguém pode decidir sozinho: cada participante prometeu que consegue e não sabe o que os outros
responderam. O sistema fica **bloqueado**, e essa é a diferença entre 2PC e um protocolo de
consenso.

**A transação em dúvida exige gente.** O resultado prático das duas anteriores é uma transação
`prepared` pendurada, segurando locks, às três da manhã, esperando alguém decidir manualmente se
commita ou aborta — sem informação suficiente para ter certeza.

Some a isso que 2PC é síncrono e serializa a latência de todos os participantes, e você tem por
que ele sobreviveu apenas em nichos: mesmo datacenter, poucos participantes, volume moderado —
tipicamente banco mais fila, com XA num servidor de aplicação.

## A geração seguinte

O problema não foi abandonado; foi atacado por outros caminhos.

**Relógio confiável (Spanner).** Com TrueTime — relógio atômico e GPS, com incerteza declarada —
o commit espera o intervalo de incerteza passar, e com isso o sistema entrega transação
distribuída **externamente consistente**. É correto e custa hardware de datacenter e alguns
milissegundos por commit.

**Commit determinístico (Calvin).** Ordene as transações antes de executá-las; se todos os nós
executam a mesma sequência determinística, não é preciso negociar o commit. Elimina o
bloqueio do 2PC e exige conhecer os acessos de antemão.

**NewSQL (CockroachDB, YugabyteDB, TiDB).** Raft por range de dados, transação serializável
distribuída, SQL por cima. O que eles entregam é real, e o que eles cobram também: **cada commit
que atravessa ranges paga consenso**, o que significa múltiplos round-trips — dentro da região,
alguns milissegundos; entre regiões, dezenas. A escolha se resume a uma pergunta honesta: o seu
caminho quente tolera isso em cada escrita?

Para o `fin-store`, a resposta é o que se espera: NewSQL resolve o problema real de quem precisa
de escrita multi-região com garantia forte, e é caro demais para quem só queria evitar escrever
uma saga.

## O que o mercado escolheu

A resposta dominante não é uma transação melhor: é **não precisar de uma**. Fronteira de
agregado bem desenhada (`arquitetura-eventos/02`), transação local dentro dela, e entre
agregados uma saga com outbox e inbox (`arquitetura-eventos/08` e `arquitetura-eventos/09`).

O que se ganha: disponibilidade, latência baixa, acoplamento temporal zero. O que se paga:
estado intermediário visível, compensação com semântica de negócio, e a necessidade de
**provar** que o resultado final está certo.

A tabela de decisão, na ordem em que se deve tentar:

| Situação | Mecanismo | Observação |
| --- | --- | --- |
| Tudo dentro do mesmo agregado | transação local | é o objetivo do desenho, não o caso de sorte |
| Dois recursos, mesmo datacenter, volume baixo | transação distribuída (2PC/XA) | raríssimo, e precisa de justificativa escrita |
| Escrita multi-região com garantia forte | NewSQL | pague o consenso conscientemente |
| Processo de negócio com passos | **saga** | o default |
| Sistemas que não se coordenam | confiar e reconciliar | válido **com** reconciliação automatizada |

A última linha só é legítima com a palavra "automatizada". "A gente confere se der problema" não
é uma estratégia de consistência — é uma aposta.

## Reconciliação como cidadã de primeira classe

Consistência eventual sem reconciliação é fé. Com reconciliação, é uma garantia auditável: o
sistema pode divergir temporariamente, e existe um processo que **detecta** a divergência,
**quantifica** e **age**.

Uma reconciliação séria tem cinco partes:

1. **Duas fontes independentes.** Comparar o banco com uma cópia dele não prova nada. As fontes
   precisam ter caminhos distintos — o ledger contra o extrato do parceiro, o total de
   lançamentos contra o total de eventos publicados.
2. **Uma chave de comparação estável** — o id de negócio, não o id técnico de nenhum dos lados.
3. **Uma classificação da divergência**: falta aqui, falta lá, valor diferente, duplicado. Cada
   classe tem uma causa provável e um destino diferente.
4. **Uma ação definida por classe.** Corrigir automaticamente, abrir tarefa, ou escalar. Uma
   divergência sem ação definida vira relatório que ninguém lê.
5. **Uma métrica publicada** — divergências por dia, valor total divergente, idade da mais
   antiga. Se o número não é acompanhado, a reconciliação está desligada e ninguém percebeu.

E o detalhe operacional que decide se ela funciona: **corte temporal claro**. Comparar "o dia de
ontem" exige saber exatamente onde o dia começa e termina nas duas fontes — e o marco 01 já
explicou por que isso não pode ser `BETWEEN` de timestamps de hosts diferentes.

## Exemplo numa fintech

**Transferência entre duas contas do mesmo banco.** Débito e crédito são dois lançamentos da
mesma transação contábil, e a invariante "a soma é zero" precisa valer sempre. É uma transação
local — desde que as duas contas estejam no mesmo banco, o que é uma decisão do marco 03. Se o
sharding as separou, você criou uma transação distribuída para a operação mais comum do produto,
que é como se transforma uma decisão de infraestrutura numa dívida de negócio.

**Transferência interbancária.** Não existe transação possível: o outro lado é outra instituição,
com outro sistema, atrás de uma janela de liquidação. É saga, obrigatoriamente. E o dinheiro
precisa existir contabilmente enquanto está em trânsito — numa conta transitória, que é o estado
intermediário tornado explícito em vez de escondido. Toda fintech que tentou esconder esse estado
acabou implementando-o depois, com pressa, durante uma auditoria.

**A reconciliação D+1** fecha o ciclo: todo lançamento do dia é comparado com o arquivo de
liquidação do parceiro. As divergências são classificadas, e a mais importante — "o parceiro
liquidou e nós não registramos" — tem correção automática, porque a alternativa é dinheiro sem
lançamento no fechamento.

## Hands-on

**Desafio — a reconciliação D+1 do `fin-store`.** Implemente o job e prove que ele funciona:

1. Gere o extrato do dia a partir do ledger e um arquivo de liquidação simulado do parceiro,
   com pelo menos 10 mil registros.
2. Injete **quatro divergências de propósito**, uma de cada classe: um lançamento que só existe
   no ledger, um que só existe no parceiro, um com valor diferente e um duplicado.
3. O job compara pela chave de negócio, classifica cada divergência e produz um relatório com
   contagem e valor total por classe.
4. Defina a ação de cada classe e implemente a que puder ser automática.
5. Rode o job **duas vezes** sobre o mesmo dia: o resultado precisa ser idêntico e não pode gerar
   correção em dobro.

**Invariantes testáveis**

1. As quatro divergências injetadas são detectadas e classificadas corretamente.
2. Rodar o job duas vezes produz o mesmo resultado e nenhuma correção duplicada.
3. O corte temporal é determinístico: reexecutar amanhã o dia de ontem dá exatamente o mesmo
   conjunto.
4. Existe uma métrica de divergências por dia, e um limiar que dispara alerta.

**Complemento.** Meça o custo: rode a reconciliação sobre 5 milhões de registros e cronometre.
Se ela não cabe na janela noturna, o problema não é a máquina — é o desenho da comparação
(varredura completa contra comparação incremental por partição do marco 07).

**Checagem**

1. Quais são as três falhas que tiraram o 2PC do desenho dominante, e qual delas exige
   intervenção humana?
2. O que o NewSQL entrega de verdade, e o que ele cobra em cada commit?
3. Por que "confiar e reconciliar" só é legítimo com a palavra "automatizada"?
4. Quais são as cinco partes de uma reconciliação séria, e o que acontece se faltar a quarta?

## Principais aprendizados

- 2PC bloqueia recursos no prepare, tem coordenador como SPOF e produz transação em dúvida que
  exige gente — por isso sobreviveu só em nichos.
- Spanner compra ordem com hardware, Calvin com determinismo, NewSQL com consenso por commit —
  todos reais, todos com preço de latência.
- O mercado escolheu não precisar de transação distribuída: agregado bem desenhado, transação
  local dentro, saga entre.
- Reconciliação é o que torna consistência eventual auditável: duas fontes independentes, chave
  estável, classificação, ação por classe e métrica publicada.
- Dinheiro em trânsito é estado contábil explícito; esconder o estado intermediário é adiar a
  implementação dele para o dia da auditoria.
