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

Um health check não pode mentir. Se o antifraude do pix-gateway está fora, o pod ainda
responde HTTP mas **não deve** receber tráfego. Modele **readiness** (posso atender?)
separada de **liveness** (estou vivo ou preciso reiniciar?) com um indicador customizado:

```java
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

Cuidado: um readiness que depende de uma dependência não-crítica derruba o pod à toa.
Modele como *readiness* só o que, faltando, torna o serviço incapaz de atender.

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

## Principais aprendizados

- Separe **liveness** de **readiness**; modele como readiness só a dependência sem a
  qual o serviço não atende.
- A **Observation API** instrumenta uma vez e entrega métrica + trace + log
  correlacionado; cuide da **cardinalidade** (low para métrica, high para trace).
- **Tracing distribuído** (OTel) + **exemplars** ligam o gráfico ao trace à log da
  requisição exata.
- Alerte por **SLO/burn rate**, não por CPU. Exponha o mínimo do Actuator.
