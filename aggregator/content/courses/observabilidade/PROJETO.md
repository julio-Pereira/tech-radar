# Projeto guia — fin-watch

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> `fin-watch` é a camada que observa os outros componentes — `pix-gateway`,
> `ledger-core`, `pix-stream` — e o cluster onde eles rodam.

## O que você vai construir

O stack de observabilidade de uma fintech, instrumentado de ponta a ponta: OpenTelemetry
nos serviços, Collector em agente e gateway, Prometheus para métricas, Loki para logs,
Tempo para traces, Pyroscope para profiles, Grafana costurando tudo. Em cima disso, o que
de fato importa: SLIs que medem o que o cliente sente, alertas por burn rate, painéis de
três níveis, e uma trilha de auditoria que **não** mora no stack de telemetria.

O critério de sucesso não é ter as ferramentas de pé — é responder, durante um incidente
simulado, à pergunta "o que está errado e por quê" em menos de cinco minutos, com alguém
que não construiu os painéis.

## Pré-requisitos

- Docker e Docker Compose, ou o `kind` da trilha de kubernetes (os dois funcionam)
- ~10 GB de RAM livres — Prometheus e Tempo são os pesados
- Um gerador de carga (`k6`, `vegeta` ou `hey`) e algo que injete latência e erro
- Pelo menos um serviço instrumentável: use o `pix-gateway` ou `ledger-core` das trilhas
  vizinhas, ou um stub de 100 linhas que sirva `/payments` com falha injetável
- **Não precisa:** Datadog, New Relic, Grafana Cloud pago. Tudo aqui é open source e local.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Stack de pé + sonda sintética (black-box) da jornada de pagamento | Derrubar o DNS do serviço: métricas internas verdes, sonda vermelha |
| 02 | SLA, SLO e error budget escritos para o fluxo de pagamento | A conta da disponibilidade em série do caminho crítico está no repo |
| 03 | Painel RED do serviço e USE do nó | Latência de erro separada da de sucesso no histograma |
| 04 | Histogramas com buckets densos em torno do SLO | p99 agregado calculado de buckets, não de média de p99 |
| 05 | OTel SDK nos serviços, semantic conventions, contexto propagado no Kafka | Trace atravessa produtor e consumidor pelos headers |
| 06 | Collector em agente (DaemonSet) + gateway, com `memory_limiter` primeiro | Tail sampling guarda 100% dos erros, com roteamento por trace-id |
| 07 | Métricas no Prometheus, com recording rules do SLI | `histogram_quantile` com `le` no `sum by` — e o teste que pega o erro |
| 08 | Taxa de autorização por PSP e invariante contábil como métrica | Alerta dispara quando a soma dos lançamentos não fecha em zero |
| 09 | Logs estruturados no Loki, `trace_id` no conteúdo (nunca como label) | Do trace para o log do mesmo request em um clique |
| 10 | Traces no Tempo, span link no consumo assíncrono | Waterfall mostra o buraco entre spans, e você sabe o que ele é |
| 11 | Profiling contínuo ligado ao período do trace | Span de 800ms com filhos de 200ms leva ao profile certo |
| 12 | SLI como razão de eventos, error budget e a policy acordada | Consumo de budget constante sem incidente vira investigação |
| 13 | Alertas por burn rate (janela longa `and` curta), revisão dos existentes | Alerta cala no pico legítimo e grita na degradação de 0,5% |
| 14 | Painéis nos três níveis, exemplars ligando métrica → trace, tudo no Git | Alguém que não construiu acha a direção certa em 1 minuto |
| 15 | Runbook de incidente: impacto → mitigar → diagnosticar, e post-mortem blameless | Um incidente simulado do alerta ao RCA, documentado |
| 16 | Corte de custo com base em uso, sem perder sinal | Depois do corte, os alertas ainda disparam nos cenários injetados |
| 17 | Redaction de PII no agente, `account_id` opaco, auditoria fora do stack | Nenhum CPF na telemetria, e o recorte por cliente continua funcionando |

## Definição de pronto (capstone)

- [ ] Um incidente injetado é **detectado pela sonda ou pelo alerta**, não pelo cliente
- [ ] O painel de plantão leva alguém que não o construiu à causa em ≤ 1 minuto
- [ ] Métrica → exemplar → trace → log → profile, tudo navegável sem copiar horário à mão
- [ ] SLI é razão de eventos, com recording rules versionadas no Git
- [ ] Alerta por burn rate, com taxa de acionáveis medida acima de 50%
- [ ] Post-mortem blameless de um incidente real ou simulado, com MTTD e MTTR
- [ ] Nenhum dado pessoal na telemetria, comprovado por busca; auditoria em storage separado
- [ ] Uma ADR por bloco: escolha do stack, política de amostragem, SLO e budget, custo

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Injetar 20% de erro** numa dependência. Quanto tempo até o alerta? O p99 melhorou
   enquanto o sistema piorava?
2. **Injetar latência** de 2s no banco. A fila explodiu como a Little's Law prevê? O
   autoscaler ajudou ou piorou?
3. **Quebrar antes da sua instrumentação** — pare o DNS ou o balanceador. Os painéis
   ficam verdes? Só a sonda sintética pega isso.
4. **Estourar a cardinalidade** de propósito (coloque um id em label) e observe o
   Prometheus. Quanto tempo até você perceber, e quanto custou?
5. **Desligar metade da telemetria** e rodar os cenários de novo. Os alertas ainda
   disparam? O que você cortou era desperdício ou era o próximo incidente?
