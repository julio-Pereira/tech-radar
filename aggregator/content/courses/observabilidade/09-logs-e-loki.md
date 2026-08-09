---
id: logs-e-loki
title: "Logs e Loki"
summary: "Log estruturado como pré-requisito, o modelo de índice que herdou a lição da cardinalidade, e por que log não é trilha de auditoria."
estimatedMinutes: 45
references:
  - title: "Grafana Loki — Documentation"
    url: https://grafana.com/docs/loki/latest/
  - title: "Grafana Loki — LogQL"
    url: https://grafana.com/docs/loki/latest/query/
  - title: "OpenTelemetry — Logs"
    url: https://opentelemetry.io/docs/concepts/signals/logs/
---

## Log estruturado, não frase

```
2026-08-09 14:32:01 ERRO Falha ao processar pagamento do cliente 12345 no PSP Itau
```

Isso é uma frase. Para responder "quantas falhas por PSP na última hora?" é preciso uma
expressão regular que quebra na primeira mudança de texto.

```json
{"timestamp":"2026-08-09T14:32:01Z","level":"error","message":"falha ao processar pagamento",
 "psp":"itau","payment_id":"pay_9f2","account_id":"acc_771","duration_ms":842,
 "trace_id":"4bf92f3577b34da6a3ce929d0e0e4736","service":"pix-gateway","version":"4.2.1"}
```

Isso é um dado. A pergunta vira uma consulta, e — mais importante — **perguntas que
ninguém previu** viram consultas (marco 01).

Três campos que não podem faltar, e cada um por um motivo diferente:

- **`trace_id`** — é o que liga o log ao trace e à métrica. Sem ele, os três sinais são
  três silos e a correlação é manual (marcos 05 e 14).
- **`service` e `version`** — "esse erro começou na versão nova?" é a pergunta mais útil
  depois de um deploy.
- **`level` consistente** — usado por todos os serviços com o mesmo significado.

E a regra que se aprende tarde: **`ERROR` é para o que exige ação humana.** Log de erro
que ninguém investiga treina o time a ignorar erros — a mesma dinâmica do alert fatigue
(marco 02), aplicada ao log. Falha de validação de entrada do cliente é `INFO` ou `WARN`,
não `ERROR`.

## O modelo do Loki

O Loki fez uma escolha diferente da dos indexadores tradicionais: **indexa apenas os
labels, não o conteúdo.** O texto é comprimido e guardado em object storage; a busca no
conteúdo é feita por varredura paralela do que os labels selecionaram.

O resultado é armazenamento barato e ingestão barata, com o custo de que a consulta é
mais rápida quando você filtra bem por label primeiro.

E isso significa que **o Loki herdou o problema da cardinalidade** das métricas — este é
o reencontro direto do marco 04:

> Cada combinação de labels vira um *stream*. `payment_id` como label é uma explosão de
> streams, e o Loki degrada da mesma forma que o Prometheus.

A divisão prática:

| Vai como **label** (baixa cardinalidade) | Vai no **conteúdo** (alta cardinalidade) |
| --- | --- |
| `service`, `namespace`, `pod`, `level`, `env` | `payment_id`, `account_id`, `trace_id`, mensagem |

`trace_id` no **conteúdo**, nunca como label — e o LogQL o encontra rápido, porque a
varredura já foi restringida pelos labels.

## LogQL

Duas etapas: selecionar streams por label, depois filtrar e transformar.

```logql
{service="pix-gateway", level="error"}
  | json
  | psp="itau"
  | duration_ms > 1000
```

E o que surpreende quem vem só de log: LogQL gera **métricas a partir de log**.

```logql
sum by (psp) (rate({service="pix-gateway"} | json | result="denied" [5m]))
```

Isso é útil e é uma armadilha de custo: calcular métrica varrendo log é ordens de
magnitude mais caro do que uma métrica de verdade. Use para exploração e para o que é
raro; o que vira painel permanente ou alerta deve virar uma métrica no marco 07.

## Retenção e volume

Log é o sinal mais caro por byte útil (marco 04), e o volume cresce com o tráfego — em
incidente, cresce mais, justamente quando você precisa dele.

Controles, do mais eficaz ao menos:

- **Nível por ambiente.** `DEBUG` em produção é a causa nº 1 de conta alta. E o `DEBUG`
  que alguém ligou "só por hoje" costuma continuar ligado.
- **Amostragem de log repetitivo.** Uma falha que se repete 50 mil vezes por minuto não
  precisa de 50 mil linhas; precisa de uma amostra e um contador.
- **Retenção por classe.** Log de aplicação 15–30 dias; log de auditoria, anos, e **em
  outro lugar** (próxima seção).
- **Drop no Collector** (marco 06) — remover campos verbosos antes de ingerir.

## Log de aplicação ≠ trilha de auditoria

Distinção que numa fintech não é semântica, é regulatória.

**Log de aplicação** é telemetria: descartável, amostrável, com retenção curta, feito para
diagnóstico. Ninguém garante que ele está completo — e tudo bem, porque ele não precisa
estar.

**Trilha de auditoria** é registro: quem fez qual operação de negócio, quando, com qual
resultado. Precisa ser **completa** (não amostrável), **imutável** (não editável nem por
administrador), **retida por anos** e **íntegra** (comprovadamente não adulterada).

Guardar auditoria no Loki é um erro de categoria: retenção curta, sem imutabilidade, sem
garantia de completude. Auditoria vai para armazenamento com *object lock*, tabela
append-only ou serviço dedicado — e o marco 17 volta nisso.

A pergunta que separa os dois: *se essa linha sumir, é um incômodo no debug ou um problema
com o regulador?*

## Exemplo numa fintech

No `fin-platform`:

- **JSON estruturado** em todos os serviços, com `trace_id`, `service`, `version` e
  `psp` quando aplicável.
- **Nenhum PII em log.** Nada de CPF, PAN, nome ou e-mail. Identificadores internos
  opacos (`account_id`) apenas — e o marco 17 põe a redaction no Collector como segunda
  barreira, porque a primeira (disciplina do desenvolvedor) falha.
- **Labels do Loki**: `service`, `namespace`, `level`, `env`. Só.
- **Retenção**: 15 dias para aplicação; a trilha de auditoria vai para outro caminho, com
  retenção regulatória.
- **`ERROR` só com ação necessária** — o time investiga todo `ERROR`, e por isso o
  volume de `ERROR` precisa ser investigável.

O log de PAN é o caso mais caro: PCI-DSS proíbe, o dado fica replicado em todo lugar por
onde o log passou, e "apagar do log" é praticamente impossível depois. O único controle
que funciona é não escrever.

## Hands-on

**Desafio — a investigação que só o log responde.**

1. Suba Loki + Grafana. Faça `pix-gateway` e `ledger-core` emitirem JSON estruturado com
   `trace_id`.
2. Configure o agente para usar apenas os quatro labels da seção — e **nada** mais.
3. Injete uma falha específica: pagamentos acima de R$ 50 mil de um PSP específico falham
   por timeout.

**Invariantes testáveis:**

- Uma consulta LogQL isola exatamente essas falhas, filtrando por PSP e por valor,
  **sem regex sobre texto livre**.
- A partir de uma linha de log, você chega ao trace completo pelo `trace_id` (será
  fechado no marco 10).
- Nenhum log contém CPF, PAN ou nome — escreva um teste que varre a saída procurando
  padrão de CPF e **falha** se encontrar. Esse teste vale mais que a política escrita.

4. **A demonstração de cardinalidade.** Adicione `payment_id` como **label** e gere 50 mil
   pagamentos. Meça memória do Loki e latência de consulta antes e depois. Remova, mova
   para o conteúdo, e refaça a consulta por `payment_id` — ela continua funcionando, e
   rápido. Escreva 5 linhas sobre por quê.

**Complemento — auditoria vs aplicação.** Liste 10 eventos do `fin-platform` e classifique
cada um: log de aplicação ou trilha de auditoria? Para cada um da segunda categoria, diga
onde ele deveria estar guardado e por quanto tempo.

**Checagem.** (a) Por que `trace_id` vai no conteúdo e não como label do Loki? (b) O que
o Loki indexa, e qual a consequência para a consulta? (c) Quando gerar métrica a partir de
log é aceitável e quando não é? (d) Log de auditoria no Loki com 15 dias de retenção —
qual é o problema?

## Principais aprendizados

- Log estruturado com `trace_id`, `service` e `version` transforma pergunta imprevista em
  consulta; `ERROR` só para o que exige ação.
- O Loki indexa labels e varre o conteúdo — herdando a regra de cardinalidade do marco 04:
  identificador vai no conteúdo, nunca como label.
- LogQL gera métrica a partir de log; ótimo para exploração, caro demais para painel e
  alerta permanentes.
- Log de aplicação é descartável; trilha de auditoria precisa ser completa, imutável e
  retida por anos — em outro lugar.
