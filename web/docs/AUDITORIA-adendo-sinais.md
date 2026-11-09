# Auditoria — adendo transversal: sinais de vagas reais (nov 2026)

O adendo leva às trilhas já publicadas o que quatro vagas de sênior pedem fora das trilhas de linguagem.
Ele tem cinco blocos:

1. Migração de agente proprietário para OpenTelemetry.
2. Tabela-índice de nuvem.
3. Desafios de linguagem no banco.
4. Grupo de linguagem na jornada `entrevista-senior`.
5. Proposta de trilha de IA na engenharia, **não executada** até a decisão do Julio.

Este documento registra o que foi conferido em cada fase, e como.

## Ordem de execução (decisão de 9 nov 2026)

- **Blocos 1, 3 e 4 agora.** Todos os marcos que eles citam já existem na `main`, inclusive os da
  `kotlin-backend`.
- **Bloco 2 depois.** Ele depende da trilha `aws-para-backend` (cada linha AWS da tabela aponta para um
  marco dela), que por sua vez vem depois da `terraform-e-iac`. O plano da `terraform-e-iac` ainda não
  foi compartilhado.
- **Bloco 5 não executado** até a decisão registrada.

## 1. Fase 0 — conferências e decisões

### Bloco 1: a tabela de fornecedores

Cada célula do esqueleto do plano foi conferida em documentação oficial, em 9 nov 2026. As páginas do
Datadog foram lidas diretamente. As da New Relic, da AWS e da Elastic foram conferidas pelos trechos
das páginas oficiais devolvidos pela busca, porque o *proxy* deste ambiente recusa esses domínios.

| Conceito | Datadog | New Relic | AWS | Elastic |
| --- | --- | --- | --- | --- |
| Entrada de OTLP | três caminhos: OTLP no Agent, DDOT Collector e *endpoint* OTLP direto (sem Agent) | *endpoint* OTLP nativo (`otlp.nr-data.net`, com variantes EU e FedRAMP), o caminho recomendado | ADOT Collector; *endpoints* OTLP nativos do CloudWatch para *traces* (host do X-Ray) e *logs*, e métricas OTLP em *preview* | *Managed OTLP Endpoint* (Elastic Cloud) ou EDOT Collector; o OTLP do APM Server virou legado, não recomendado para usuário novo |
| Métricas | Metrics | Metrics | CloudWatch Metrics | Metrics |
| *Logs* | Log Management | Logs (com *logs in context*) | CloudWatch Logs | Logs |
| *Traces* | APM | Distributed Tracing (no APM) | X-Ray; Application Signals por cima | APM |
| *Profiling* | Continuous Profiler | Continuous Profiling por agente (Java por JFR; Node.js e .NET em *preview*) | CodeGuru Profiler (sem aviso de fim de suporte encontrado) | Universal Profiling |
| SLO e *error budget* | Service Level Objectives | Service Levels (Service Level Management) | SLOs do Application Signals, com *burn rate* | SLOs |

Três diferenças entre o esqueleto e a conferência entram no texto do marco:

- **AWS.** O SDK e o *daemon* do X-Ray entraram em manutenção em 25 fev 2026, com fim de suporte em
  25 fev 2027. A AWS aponta o OpenTelemetry como o caminho de instrumentação. Na migração para OTel na
  AWS, o agente "proprietário" que sai é o SDK do X-Ray.
- **Datadog.** Dado vindo do SDK do OTel não alimenta alguns produtos proprietários, entre eles o
  Continuous Profiler, segundo a página de OTLP no Agent. A paridade de painéis precisa listar o que
  fica sem dado.
- **Elastic.** A ingestão OTLP direto no APM Server é legado. O caminho é o EDOT Collector ou o
  *endpoint* gerenciado.

**Fontes:**

- **Datadog:**
  - [OpenTelemetry](https://docs.datadoghq.com/opentelemetry/);
  - [OTLP no Agent](https://docs.datadoghq.com/opentelemetry/otlp_ingest_in_the_agent.md);
  - [DDOT](https://docs.datadoghq.com/opentelemetry/setup/ddot_collector.md);
  - [OTLP direto](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest.md);
  - [Profiler](https://docs.datadoghq.com/profiler/);
  - [SLOs](https://docs.datadoghq.com/service_management/service_level_objectives/).
- **New Relic:**
  - [OTLP](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/);
  - [Service levels](https://docs.newrelic.com/docs/service-level-management/consume-slm/);
  - [Profiling com JFR](https://docs.newrelic.com/docs/apm/agents/java-agent/features/real-time-profiling-java-using-jfr-metrics/);
  - [notas de out 2026](https://docs.newrelic.com/docs/release-notes/docs-release-notes/docs-10-9-2026/).
- **AWS:**
  - [OTLP Endpoints](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html);
  - [SLOs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html);
  - [ADOT](https://aws-otel.github.io/docs/introduction);
  - [fim de suporte do SDK do X-Ray](https://docs.aws.amazon.com/xray/latest/devguide/xray-daemon-eos.html).
- **Elastic:**
  - [OpenTelemetry com Elastic APM](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry);
  - [intake do APM Server](https://www.elastic.co/docs/solutions/observability/apm/opentelemetry-intake-api);
  - [endpoint OTLP](https://www.elastic.co/docs/manage-data/ingest/otlp-endpoint);
  - [visão geral](https://www.elastic.co/docs/solutions/observability).

### Bloco 1: o envio duplo, provado localmente

Para o Complemento do marco `observabilidade/05`, o laboratório usou:

- um OpenTelemetry Collector contrib 0.139.0 com dois exportadores OTLP: Tempo 2.6.1 e Jaeger 2.11.0;
- um gerador em Go (SDK do OTel 1.38.0), que grava os `trace_id` enviados;
- um *script* que confere cada `trace_id` nas APIs dos dois destinos.

Tudo roda em Docker, sem conta em nuvem.

| Cenário | Tempo | Jaeger | Resultado do *script* |
| --- | ---: | ---: | --- |
| os dois destinos no ar, 200 *traces* | 200 | 200 | paridade (saída 0) |
| Jaeger fora durante o envio, de volta em seguida (*retry* padrão) | 100 | 100 | paridade: a fila de *retry* do exportador segurou e entregou |
| Jaeger fora por mais tempo que o *retry* (`max_elapsed_time: 10s`, só no teste) | 100 | 0 | falha (saída 1); o Collector registra `Exporting failed. Dropping data.` |

Um efeito colateral virou conteúdo. A primeira tentativa do terceiro cenário tinha
`max_elapsed_time` menor que `max_interval`. Com isso, o Collector **não subiu**
(`invalid configuration`), e os **dois** destinos ficaram sem dado. No envio duplo, uma configuração
inválida derruba o caminho antigo junto com o novo, e por isso a configuração precisa ser validada na
esteira.

### Bloco 3: desafios e linguagens

- **`cache-lru-ttl` e `transferencia-sem-deadlock`** já existem no banco, em Java, desde o PR #128. O
  Bloco 3 acrescenta a variante Go de cada um, com `-race` no `check-lld.sh`, e os pré-requisitos Go
  (`go-fintech/03` e `go-fintech/09`).
- **Kotlin no `check-lld.sh`: não estender.** O *script* e o job do CI conhecem `go/` e `java/`
  (Maven). Uma variante `kotlin/` traria o plugin Kotlin ao job, e o desafio Kotlin equivalente já
  existe: o pipeline do marco `kotlin-backend/07`, com os mesmos invariantes (pendentes limitados, ordem
  por chave, DLQ). O `pipeline-com-backpressure` sai só em Go, e o enunciado aponta para o marco 07 como
  variante Kotlin.
- **Marcos citados como pré-requisito**, todos conferidos na `main`:
  - `go-fintech/03`, `/06`, `/07` e `/09`;
  - `java-e-jvm/03`;
  - `concorrencia-e-recursos/04`;
  - `kotlin-backend/07`;
  - `lideranca-tecnica/07` ("Mentoria, delegação e feedback") e `/08` ("Escrita, rituais e
    reuniões").

### Bloco 4: a jornada

- **Os nove `ref` do grupo de linguagem existem**, com estes títulos:
  - `go-fintech/03` "Slices, maps e strings: a semântica que derruba entrevista";
  - `go-fintech/04` "Interfaces, tipos e generics com critério";
  - `go-fintech/07` "Goroutines em produção: vazamento, cancelamento e limites";
  - `go-fintech/14` "Runtime, performance e profiling";
  - `java-e-jvm/02` "Objetos, igualdade e imutabilidade";
  - `java-e-jvm/03` "Coleções por dentro";
  - `java-e-jvm/08` "Memória e GC";
  - `spring-boot/13` "Programação reativa a fundo";
  - `kotlin-backend/06` "Concorrência estruturada e cancelamento".
- **"Escolha um".** O formato de `paths` não marca um grupo inteiro como escolha única, mas aceita
  `optional` por etapa. A decisão: as nove etapas entram como `optional: true`, e o `why` da primeira
  diz em uma frase que se escolhe a linguagem da vaga.
- **Ordem de pré-requisitos.** O compilador confere a ordem dos pré-requisitos entre trilhas no
  caminho. O grupo entra entre "Código e LLD" e "Domínio fintech como diferencial", e o teste vai
  confirmar que a ordem continua válida.

### Bloco 2: adiado

A tabela "conceito → serviço" e as pontes para `aws-para-backend` ficam para depois daquela trilha,
como o próprio plano prevê.
