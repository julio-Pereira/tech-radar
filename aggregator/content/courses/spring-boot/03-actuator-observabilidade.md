---
id: actuator-observabilidade
title: "Actuator e Observabilidade"
summary: "Health checks, métricas e endpoints de produção — e como expô-los sem vazar dado sensível."
estimatedMinutes: 30
references:
  - title: "Spring Boot Reference — Actuator"
    url: https://docs.spring.io/spring-boot/reference/actuator/index.html
  - title: "Micrometer — Application Observability"
    url: https://micrometer.io/
---

## O que o Actuator entrega

O `spring-boot-starter-actuator` adiciona endpoints prontos de produção sob `/actuator`:
`health` (a aplicação está viva e suas dependências também?), `metrics` e `prometheus`
(via Micrometer), `info`, `loggers` (mudar nível de log em runtime) e outros. São a base
para que orquestradores como o Kubernetes saibam quando rotear tráfego e quando reiniciar
um pod.

| Endpoint | Para que serve |
| --- | --- |
| `/actuator/health` | Liveness e readiness probes |
| `/actuator/prometheus` | Coleta de métricas pelo Prometheus |
| `/actuator/loggers` | Ajuste de nível de log sem redeploy |

## Exemplo numa fintech

No serviço de **autorização de transações**, o health check não pode mentir: se o
provedor antifraude está fora, o pod ainda responde HTTP mas **não deve** receber
tráfego. Modele isso com readiness separado da liveness e um indicador customizado:

```java
@Component
class FraudCheckHealthIndicator implements HealthIndicator {
    private final FraudClient fraud;

    FraudCheckHealthIndicator(FraudClient fraud) { this.fraud = fraud; }

    @Override
    public Health health() {
        return fraud.isReachable()
            ? Health.up().build()
            : Health.down().withDetail("provider", "fraud-engine").build();
    }
}
```

Para métricas, conte o que o negócio observa — taxa de autorização, latência p99 por
bandeira — com Micrometer:

```java
meterRegistry.counter("payment.authorized",
    "card_network", network).increment();
```

## Segurança: exponha o mínimo

Endpoints do Actuator podem vazar configuração e segredos. Numa fintech, restrinja a
superfície e proteja com autenticação:

```properties
management.endpoints.web.exposure.include=health,prometheus
management.endpoint.health.show-details=when-authorized
```

Nunca exponha `env`, `heapdump` ou `loggers` publicamente — eles revelam variáveis de
ambiente e permitem alterar o comportamento da aplicação em runtime.

## Principais aprendizados

- Separe **liveness** de **readiness**; modele dependências críticas como health indicators.
- Métricas de negócio com Micrometer contam mais que CPU/memória sozinhas.
- Exponha apenas os endpoints necessários e proteja-os — Actuator mal configurado é
  superfície de ataque.
