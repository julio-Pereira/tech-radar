---
id: actuator-observabilidade
title: "Actuator e Observabilidade"
summary: "Health, métricas e endpoints de produção — e o salto senior: a Micrometer Observation API (uma instrumentação → métrica + trace + log), tracing distribuído e alerta por burn rate."
estimatedMinutes: 40
references:
  - title: "Spring Boot Reference — Actuator"
    url: https://docs.spring.io/spring-boot/reference/actuator/index.html
  - title: "Micrometer — Observation API"
    url: https://docs.micrometer.io/micrometer/reference/observation.html
  - title: "OpenTelemetry Documentation"
    url: https://opentelemetry.io/docs/
  - title: "Google SRE Workbook — Alerting on SLOs"
    url: https://sre.google/workbook/alerting-on-slos/
---

## O que o Actuator entrega

O `spring-boot-starter-actuator` adiciona endpoints de produção sob `/actuator`:
`health` (a aplicação e suas dependências estão vivas?), `metrics`/`prometheus` (via
Micrometer), `info`, `loggers` (mudar nível em runtime). São a base para o Kubernetes
saber quando rotear tráfego e quando reiniciar um pod.

| Endpoint | Para que serve |
| --- | --- |
| `/actuator/health` | Liveness e readiness probes |
| `/actuator/prometheus` | Coleta de métricas pelo Prometheus |
| `/actuator/loggers` | Ajuste de nível de log sem redeploy |

## Liveness ≠ readiness

Um health check não pode mentir — nem para mais, nem para menos. O Boot separa duas
perguntas: **liveness** (estou vivo, ou preciso ser reiniciado?) e **readiness** (posso
atender agora?). Cada uma é um *grupo* de indicadores, exposto em
`/actuator/health/liveness` e `/actuator/health/readiness`. Por padrão, cada grupo
contém **só o estado interno da aplicação** (`livenessState`, `readinessState`) — um
indicador que você escreve aparece no `/actuator/health` agregado, mas não entra em
nenhum dos dois grupos até você pedir.

Um indicador customizado para o antifraude:

```java
import org.springframework.boot.health.contributor.Health;           // pacote novo no Boot 4
import org.springframework.boot.health.contributor.HealthIndicator;

@Component
class FraudCheckHealthIndicator implements HealthIndicator {
    private final FraudClient fraud;
    FraudCheckHealthIndicator(FraudClient fraud) { this.fraud = fraud; }

    @Override public Health health() {
        return fraud.isReachable()
            ? Health.up().build()
            : Health.down().withDetail("provider", "fraud-engine").build();
    }
}
```

Colocá-lo na readiness é uma linha:

```properties
management.endpoint.health.group.readiness.include=readinessState,fraudCheck
```

A pergunta é se você **deve**. O antifraude é um serviço **compartilhado**: todos os pods
do pix-gateway falam com o mesmo. Se ele cai e a readiness depende dele, **todos** os
pods ficam *not ready* ao mesmo tempo, o Service fica sem nenhum endpoint e o cliente
recebe erro de conexão — você transformou a queda de uma dependência em queda total, sem
chance de degradar com honestidade. Por isso a posição deste curso (e do capstone) é:

- **Readiness não inclui dependência externa compartilhada.** O antifraude fora vira
  circuito aberto e fallback honesto (marco 08), e o indicador continua no
  `/actuator/health` agregado, para dashboard e alerta.
- **Readiness inclui o que é do próprio pod** e que outro pod saudável não teria: ainda
  aquecendo cache, ainda sem conexão de banco própria, em shutdown.

O `include` existe para quando a dependência é, de fato, por pod — e para você ver no
tutorial a diferença que uma linha faz.

## O salto senior: a Observation API

Instrumentar *três vezes* — um contador aqui, um span de trace ali, um log acolá — é
retrabalho e gera sinais que não se correlacionam. A **Micrometer Observation API**
resolve isso: você instrumenta **uma vez** e obtém, da mesma observação, **métrica +
trace + log correlacionado**.

```java
Observation.createNotStarted("payment.initiate", registry)
    .lowCardinalityKeyValue("psp", req.psp())            // vira label de métrica
    .highCardinalityKeyValue("paymentId", id.toString()) // vira atributo de span
    .observe(() -> pspClient.initiate(req));
```

`lowCardinalityKeyValue` vira dimensão de métrica (poucos valores possíveis — nunca use
`paymentId` aqui, ou explode a cardinalidade do Prometheus). `highCardinalityKeyValue`
vira atributo do span de trace, onde alta cardinalidade é bem-vinda. Uma chamada, três
sinais coerentes.

## Tracing distribuído e exemplars

Com Micrometer Tracing exportando via **OpenTelemetry (OTLP)**, cada request ganha um
`traceId` propagado por todos os serviços. Você segue uma transação Pix do gateway →
antifraude → conciliação num único trace, e os **logs** já saem com o mesmo `traceId`
(via MDC) — do gráfico de latência ao log da requisição exata, em dois cliques.

**Exemplars** costuram métrica e trace: um ponto no histograma de latência carrega o
`traceId` de uma requisição real daquele balde. Você vê o pico de p99 no Grafana e pula
direto para o trace que o causou — fim do "o gráfico subiu, e agora?".

## SLO e alerta por burn rate

O salto final é *no que* alertar. "CPU alta" é um alerta que acorda o time à toa: CPU
alta com latência boa e zero erro não é incidente. O senior alerta sobre o que o
**usuário sente**, definido por **SLO** (ex.: 99,9% das iniciações abaixo de 800ms num
mês). O **error budget** é o 0,1% restante; o alerta dispara por **burn rate** — a
velocidade com que você queima o budget. Queima rápida (vai estourar o mês em horas)
acorda alguém; queima lenta vira um ticket. Menos ruído, mais sinal.

## Segurança: exponha o mínimo

Ligando com o marco 09: Actuator mal exposto vaza segredo e permite alterar
comportamento em runtime. Restrinja a superfície e proteja com autenticação:

```properties
management.endpoints.web.exposure.include=health,prometheus
management.endpoint.health.show-details=when-authorized
```

Nunca exponha `env`, `heapdump` ou `loggers` publicamente.

## Exemplo numa fintech

No **pix-gateway**, uma iniciação vira **uma** `Observation` chamada `payment.initiate`.
Dela nascem: a métrica `payment.initiate` (label `psp`, para dashboards de latência por
PSP), um span de trace propagado até o antifraude (com `paymentId` de alta cardinalidade)
e logs correlacionados por `traceId`. O alerta não é "CPU alta" — é "estamos queimando o
error budget de latência da iniciação rápido demais", que aponta para o PSP degradado
antes que o cliente reclame.

## Mão na massa

**Tutorial — Actuator e a Observation API no `pix-gateway`.**

1. O Actuator já está no projeto desde o marco 01? Se não, adicione o starter. O
   endpoint `/actuator/prometheus` só existe com o registry do Prometheus no classpath:

   ```xml
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-actuator</artifactId>
   </dependency>
   <dependency>
     <groupId>io.micrometer</groupId>
     <artifactId>micrometer-registry-prometheus</artifactId>
   </dependency>
   ```

   ```properties
   management.endpoints.web.exposure.include=health,prometheus
   management.endpoint.health.probes.enabled=true
   ```

   (As URLs já estão liberadas no `SecurityConfig` do marco 09.)

2. Instrumente a iniciação com a Observation API. Injete o `ObservationRegistry` que o
   Boot configura e embrulhe a chamada ao service no controller:

   ```java
   return Observation.createNotStarted("payment.initiate", observations)
           .lowCardinalityKeyValue("psp", "psp-a")              // o PSP roteado
           .observe(() -> ResponseEntity.status(HttpStatus.CREATED)
                   .body(service.initiate(idemKey, req)));
   ```

   Faça uma iniciação e confira as métricas que nasceram dela — o nome com ponto vira
   `payment_initiate_seconds_count`, `..._sum` e `..._max` no Prometheus, com os labels
   `psp` e `error` (`none` quando deu certo, o nome da exceção quando não), além de um
   `payment_initiate_active_seconds_*` para as iniciações em andamento:

   ```bash
   curl localhost:8080/actuator/health
   curl localhost:8080/actuator/health/liveness
   curl localhost:8080/actuator/health/readiness
   curl localhost:8080/actuator/prometheus | grep payment_initiate
   ```

3. Implemente o `FraudCheckHealthIndicator` e prove as duas configurações num teste
   `@SpringBootTest(webEnvironment = RANDOM_PORT)` que troca o `FraudClient` por um
   `@MockitoBean` que sempre responde `false`.

**Invariantes testáveis.**

| Configuração | `/actuator/health` | `/liveness` | `/readiness` |
| --- | --- | --- | --- |
| padrão (sem `include`) | `503` DOWN | `200` UP | `200` UP |
| `group.readiness.include=readinessState,fraudCheck` | `503` DOWN | `200` UP | `503` DOWN |

A liveness nunca cai por causa do antifraude — reiniciar o pod não conserta um serviço
alheio. A primeira linha é a posição do curso; a segunda é o que acontece com **todos** os
pods ao mesmo tempo se você escolher a outra.

**Checagem.** (a) O que muda no Kubernetes se você ligar essa dependência à liveness
em vez da readiness? (b) Com três pods e o antifraude fora, quantos endpoints o Service
tem em cada linha da tabela? (c) Por que `paymentId` nunca deve virar
`lowCardinalityKeyValue`?

## Principais aprendizados

- Separe **liveness** de **readiness**. Os grupos começam só com o estado interno; um
  indicador entra neles por `include`. Dependência externa **compartilhada** não entra
  na readiness — derrubaria todos os pods juntos.
- A **Observation API** instrumenta uma vez e entrega métrica + trace + log
  correlacionado; cuide da **cardinalidade** (low para métrica, high para trace).
- **Tracing distribuído** (OTel) + **exemplars** ligam o gráfico ao trace à log da
  requisição exata.
- Alerte por **SLO/burn rate**, não por CPU. Exponha o mínimo do Actuator.
