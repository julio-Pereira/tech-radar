---
id: collector-e-pipelines
title: "Collector, pipelines e Alloy"
summary: "O ponto onde você controla custo sem tocar em código: processors, a topologia agent + gateway, e por que tail sampling exige que o trace inteiro chegue no mesmo lugar."
estimatedMinutes: 45
references:
  - title: "OpenTelemetry — Collector"
    url: https://opentelemetry.io/docs/collector/
  - title: "OpenTelemetry — Collector Configuration"
    url: https://opentelemetry.io/docs/collector/configuration/
  - title: "Grafana Alloy"
    url: https://grafana.com/docs/alloy/latest/
---

## Por que existe um processo no meio

Exportar direto da aplicação para o backend funciona e tem quatro defeitos: o destino
fica **hardcoded** na configuração de cada serviço; não há onde filtrar, enriquecer ou
amostrar; cada aplicação abre suas próprias conexões com o backend; e mudar qualquer
coisa exige redeploy de tudo.

O **Collector** é o ponto de controle. E a consequência mais importante é econômica:
**é aqui que você reduz custo sem tocar em código** — o que significa que a decisão de
custo do marco 16 é implementável por quem opera, e não depende de um ciclo de
desenvolvimento por serviço.

## Receivers, processors, exporters

A configuração é um grafo declarativo:

```yaml
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }

processors:
  memory_limiter:              # PRIMEIRO, sempre
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 25
  attributes/limpeza:
    actions:
      - key: http.request.header.authorization
        action: delete
      - key: db.query.text
        action: delete
  resource:
    attributes:
      - key: deployment.environment.name
        value: prod
        action: upsert
  batch:                       # ÚLTIMO, sempre
    timeout: 5s
    send_batch_size: 8192

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, attributes/limpeza, resource, batch]
      exporters: [otlphttp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

**A ordem dos processors é a ordem de execução**, e duas posições não são negociáveis:

- **`memory_limiter` primeiro.** Sem ele, um pico de telemetria mata o Collector por OOM
  — e o Collector morto derruba a telemetria de todo mundo, exatamente durante o
  incidente que a gerou. Ele aplica backpressure e descarta antes de morrer, o que é a
  escolha certa.
- **`batch` por último.** Agrupar reduz drasticamente as chamadas ao backend. Qualquer
  processor depois dele opera sobre lotes já formados e o efeito muda.

O `attributes` processor é o que atende à **cardinalidade** do marco 04 e ao **PII** do
marco 17: apagar `Authorization`, apagar o texto da query, remover o atributo de alta
cardinalidade que ninguém consulta. Cada atributo removido aqui é dinheiro que não é
gasto adiante — e é a razão de o processor ser a ferramenta de custo mais direta que
existe.

## Agent + gateway

A topologia que escala:

```
app ──┐
app ──┼──► Collector agent (DaemonSet, um por nó)
app ──┘            │  enriquece com k8s.*, tira PII, lote inicial
                   ▼
           Collector gateway (Deployment, com HPA)
                   │  tail sampling, roteamento, agregação
                   ▼
              Tempo / Prometheus / Loki
```

- **Agent** (DaemonSet) — perto da app, salto de rede curto. É onde o
  `k8sattributes` processor enriquece a telemetria com `k8s.pod.name`,
  `k8s.namespace.name` e os labels do pod, porque é o único ponto que sabe de qual pod o
  dado veio. Também é o lugar certo para tirar PII: **o mais cedo possível**, para o dado
  sensível não trafegar.
- **Gateway** (Deployment, escalável) — concentra, faz o que precisa de visão global, e é
  o único que fala com o backend. Reduz o número de conexões de milhares para dezenas.

Para o `fin-platform` local, um Collector só resolve. A topologia importa quando o volume
cresce ou quando o tail sampling entra — e aí ela deixa de ser opcional.

O **OTel Operator** automatiza isso no Kubernetes: um CRD `OpenTelemetryCollector` gere o
DaemonSet e o Deployment, e o `Instrumentation` **injeta a auto-instrumentação por
annotation** no pod — a instrumentação vira configuração de plataforma, não mudança de
aplicação. É o padrão operator do marco 08 da trilha Kubernetes aplicado à telemetria.

## Amostragem: head vs tail

Guardar todo trace é caro (marco 04). A pergunta é **quando decidir** o que guardar.

**Head sampling** — decide no começo, na aplicação, antes de saber o que vai acontecer.
Barato e previsível (`OTEL_TRACES_SAMPLER_ARG=0.1` guarda 10%), com um defeito fatal para
investigação: **é aleatório em relação ao que interessa**. O trace do erro que você
precisa tem 10% de chance de existir.

**Tail sampling** — decide no fim, com o trace completo em mãos:

```yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: todos-os-erros
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: lentos
        type: latency
        latency: { threshold_ms: 1000 }
      - name: pagamentos-altos
        type: numeric_attribute
        numeric_attribute: { key: fin.amount_cents, min_value: 5000000 }
      - name: amostra-do-resto
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
```

Guarde **100% dos erros e dos lentos**, e 5% do tráfego saudável. Você paga uma fração e
mantém o que serve para investigar.

E a restrição que decide a arquitetura: **todos os spans de um trace precisam chegar no
mesmo Collector** para a decisão ser possível. Com vários gateways atrás de um balanceador
comum, os spans se espalham e o tail sampling decide sobre traces parciais — silenciosamente
errado. A solução é o `loadbalancing` exporter, que roteia por `trace-id` para o gateway
certo. É a razão nº 1 de o gateway existir como camada separada.

Custos a saber: o `decision_wait` segura os spans em memória (mais memória, e um atraso
até o trace aparecer na UI), e um trace que passa desse tempo é decidido incompleto.

## Alloy como alternativa

O **Grafana Alloy** é o sucessor do Promtail e do Grafana Agent — um coletor que fala
OTLP e Prometheus, com configuração em HCL e um modelo de componentes com fluxo explícito
entre eles.

Critério, sem torcida:

| Prefira o **OTel Collector** | Prefira o **Alloy** |
| --- | --- |
| quer neutralidade de fornecedor | a stack já é toda Grafana |
| YAML e ecossistema OTel puro | prefere a linguagem de componentes e o debug visual |
| tail sampling com `loadbalancing` | quer service discovery no estilo Prometheus integrado |

Os dois fazem o essencial. O erro caro é rodar os dois em pipelines diferentes por
acidente histórico, e ninguém saber por onde um dado passa.

## Exemplo numa fintech

O `pix-gateway` emite 40 mil spans por minuto no pico. Guardar tudo é caro e inútil — 99%
são pagamentos que deram certo em 80ms e ninguém vai olhar.

A pipeline do `fin-platform`:

1. **Agent no nó** — `k8sattributes` enriquece, `attributes` **remove PII antes de sair do
   nó** (CPF, PAN, `Authorization`), `batch`.
2. **Gateway** — `tail_sampling` com as políticas acima: todo erro, toda transação acima
   de R$50 mil, tudo acima de 1s, 5% do resto.
3. **Métricas continuam 100%.** São baratas e agregadas — é o trace que se amostra, nunca
   a métrica. Confundir isso é perder o sinal que dispara o alerta.

A conta cai mais de 90% e o que se perde são traces de sucesso rápido. O que **não** se
pode perder: o trace de qualquer coisa que falhou, demorou ou moveu muito dinheiro.

## Hands-on

**Tutorial — a pipeline mínima.**

1. Suba um Collector no Compose com receiver OTLP, `memory_limiter` → `attributes` →
   `batch`, e exporters para Tempo e Prometheus.
2. Aponte o `pix-gateway` e o `ledger-core` para ele (só variável de ambiente).
3. Adicione ao `attributes` a remoção de `http.request.header.authorization`. Prove, no
   trace, que o header **não** chega ao backend.
4. Habilite o `debug` exporter com `verbosity: detailed` e observe o dado bruto passando —
   é a ferramenta nº 1 quando "não chega nada no Grafana".
5. `git commit` do `otel-collector-config.yaml`.

**Desafio — tail sampling que preserva o que importa.** Configure as quatro políticas da
seção.

**Invariantes testáveis** — gere 10.000 requisições, sendo 9.900 rápidas e bem-sucedidas,
50 com erro, 30 lentas (>1s) e 20 com `fin.amount_cents > 5000000`:

1. **100%** dos 50 traces com erro estão no Tempo. Nenhum a menos.
2. **100%** dos 30 lentos e dos 20 de valor alto estão lá.
3. Os traces de sucesso rápido no Tempo são **~5%** dos 9.900 (±2 pontos).
4. O volume total caiu **>90%** em relação a guardar tudo. Meça, não estime.

Depois, o experimento que ensina o resto: rode **dois** gateways atrás de um Service comum
(sem `loadbalancing` exporter) e repita. Meça quantos dos 50 erros sobreviveram — vai ser
menos de 100%, porque cada gateway decidiu sobre um trace parcial. Conserte com o
`loadbalancing` exporter e prove que voltou a 100%. **Esse é o aprendizado do marco**: a
configuração parecia certa e estava perdendo justamente os traces que importam.

**Checagem.** (a) Por que `memory_limiter` primeiro e `batch` por último? (b) Por que
head sampling é ruim para investigar incidente? (c) O que acontece com o tail sampling se
os spans de um trace caírem em gateways diferentes? (d) Por que se amostra trace e não
métrica?

## Principais aprendizados

- O Collector é onde se controla destino, formato e **custo** sem tocar em código —
  `attributes` é a ferramenta de custo mais direta que existe.
- `memory_limiter` primeiro (Collector morto derruba a telemetria durante o incidente),
  `batch` por último.
- Agent enriquece com `k8s.*` e tira PII cedo; gateway concentra e é o único que pode
  fazer tail sampling.
- Tail sampling guarda 100% de erro, lentidão e valor alto com 5% do resto — mas só
  funciona se o trace inteiro chegar no mesmo Collector.
