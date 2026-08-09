---
id: metricas-e-prometheus
title: "Métricas e Prometheus"
summary: "O modelo de dado que impõe cardinalidade baixa, por que histogram_quantile existe, e as armadilhas de PromQL que produzem gráfico errado sem erro."
estimatedMinutes: 55
references:
  - title: "Prometheus — Data Model"
    url: https://prometheus.io/docs/concepts/data_model/
  - title: "Prometheus — Querying Basics"
    url: https://prometheus.io/docs/prometheus/latest/querying/basics/
  - title: "Prometheus — Histograms and Summaries"
    url: https://prometheus.io/docs/practices/histograms/
  - title: "Grafana Mimir"
    url: https://grafana.com/docs/mimir/latest/
---

## O modelo de dado

Uma série temporal é identificada pelo **nome da métrica mais o conjunto de labels**:

```
http_server_request_duration_seconds_bucket{service="pix-gateway", method="POST",
    route="/payments", status="200", le="0.5"}
```

Mudou um label, é outra série. E o número total de séries é o **produto** das
cardinalidades — foi o que o marco 04 antecipou, e aqui a consequência é operacional: o
Prometheus mantém em memória os metadados de cada série ativa. Explosão de cardinalidade
não deixa o sistema lento, ela o **mata por OOM**.

Os quatro tipos:

- **Counter** — só sobe (e volta a zero no restart). `payments_total`. Nunca faça gráfico
  do valor bruto; use `rate()`.
- **Gauge** — sobe e desce. `hikari_connections_active`.
- **Histogram** — contadores por *bucket* cumulativo (`le`), mais `_sum` e `_count`. É o
  que permite calcular percentil **depois**, agregando.
- **Summary** — percentis calculados **na aplicação**. Baratos de consultar e
  **impossíveis de agregar** — exatamente o erro do marco 04. Se você precisa do p99 do
  serviço e não do pod, precisa de histogram.

### O reencontro do marco 04

> Lembra que percentil não soma nem tira média? É por isso que `histogram_quantile`
> opera sobre **buckets**, e não sobre percentis.

Cada instância exporta contagens por bucket. Contagens **somam** — isso é linear. Você
soma os buckets de todos os pods e só então interpola o percentil:

```promql
histogram_quantile(0.99,
  sum by (le, route) (rate(http_server_request_duration_seconds_bucket[5m]))
)
```

O `sum by (le, ...)` é obrigatório e é onde se erra: esquecer o `le` no `by` produz um
resultado sem sentido, e sem nenhum erro.

E a limitação a saber: o resultado é **interpolado dentro do bucket**. Se seus buckets são
`0.5` e `1.0` e a massa está em 0,9s, o p99 relatado tem a precisão que os buckets
permitem. Buckets precisam ser escolhidos em torno do SLO — de nada adianta um bucket em
10s quando o seu objetivo é 500ms. **Native histograms** (buckets exponenciais
automáticos) resolvem isso e são a direção do projeto.

## PromQL: o essencial e as armadilhas

**`rate()` vs `increase()` vs `irate()`.** `rate` dá a taxa por segundo média na janela e
é o que você quer em 95% dos casos. `increase` é o total na janela. `irate` usa só os dois
últimos pontos — bom para gráfico muito reativo, ruim para alerta (ele oscila).

**A janela precisa conter pelo menos 4 pontos de scrape.** Com scrape de 30s,
`rate(...[1m])` tem 2 pontos e produz gráfico cheio de buracos. A regra prática é
`[4 × scrape_interval]` ou mais — `[2m]` para scrape de 30s.

**Taxa de erro se calcula em cima de counters, nunca com o valor bruto:**

```promql
sum(rate(http_server_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_server_requests_total[5m]))
```

Dividir gauges de "erros" por "total" ignora o reset de contador no restart e mente
depois de todo deploy.

**A armadilha mais cara é a média de médias.** `avg(rate(...))` entre pods dá o mesmo erro
estatístico do marco 04: pondera igualmente um pod com 1.000 req/s e outro com 5.
Some numerador e denominador separadamente, e divida **no fim**.

**Recording rules** pré-calculam expressões caras. São necessárias para SLO
(marco 12): o burn rate multi-janela consulta 30 dias de dados, e sem recording rule cada
avaliação de alerta faz uma consulta pesada.

**Exemplars** anexam um `trace_id` a uma observação de bucket. É o que liga o gráfico de
latência ao trace da requisição lenta (marco 14) — o meio-termo prático mencionado no
marco 04 entre pilares e eventos largos.

## Escala e retenção

O Prometheus é **um processo com disco local**, deliberadamente. Isso é simples e é o
limite: retenção limitada pelo disco, sem HA de verdade (rodam-se dois em paralelo e eles
divergem levemente), sem visão global de vários clusters.

Quando isso aperta, **remote write** para **Mimir** (ou Thanos/Cortex): armazenamento de
longo prazo em object storage, consulta global, multi-tenancy, deduplicação de réplicas.

O critério de adoção: adote quando precisar de retenção longa, visão multi-cluster ou HA
real. Não adote porque parece mais profissional — Mimir é um sistema distribuído a
operar, e um Prometheus com 15 dias de retenção resolve a vida da maioria.

## Exemplo numa fintech

O padrão de métricas do `fin-platform`:

- **RED do `pix-gateway`** com histogram, labels `route`, `method`, `status`, `psp`.
  `psp` tem cardinalidade baixa (5 valores) e alto valor diagnóstico — é o recorte que
  responde "é o Itaú ou é a gente?".
- **Nunca** `payment_id`, `account_id` ou `cpf` como label. Isso é log e trace
  (marcos 09–10).
- **Buckets alinhados ao SLO**: se o objetivo é 500ms, buckets em
  `[0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5]` — densos em torno do alvo.
- **Recording rules** para o SLI de disponibilidade e o de latência, consumidos pelo
  painel de error budget do marco 12.

E a métrica que custa caro e vale: `payments_authorized_total` por `psp` e `bandeira`,
que alimenta a taxa de autorização — o "quarto sinal" do marco 03.

## Hands-on

**Tutorial — provar a agregação de buckets.** Este é o reencontro do marco 04, agora em
PromQL.

1. Suba Prometheus e o `pix-gateway` com 3 réplicas, exportando histogram de latência.
2. Gere carga **desbalanceada**: uma réplica com latência muito pior que as outras.
3. Calcule as três coisas e compare:
   - `avg(histogram_quantile(0.99, rate(..._bucket[5m])))` — a média dos p99 (**errado**);
   - `histogram_quantile(0.99, sum by (le) (rate(..._bucket[5m])))` — o p99 real
     (**certo**);
   - o p99 calculado a partir dos dados brutos, fora do Prometheus.
4. Anote os três números. O primeiro vai **subestimar** — os mesmos números do tutorial do
   marco 04, agora produzidos pela ferramenta.
5. Mude os buckets para longe do SLO e recalcule o p99. Veja a precisão piorar sem
   nenhum erro aparecer.

**Desafio — o painel de RED e as armadilhas.**

1. Construa RED do `pix-gateway`: taxa, erro (5xx separado de 4xx), duração p50/p95/p99
   **separada por sucesso e erro** (marco 03).
2. Crie recording rules para o SLI de disponibilidade e o de latência.

**Invariantes testáveis:**

- Reinicie um pod e prove que a taxa de erro **não** dá um pico artificial (é o teste de
  que você usou `rate()` sobre counter e não a diferença de gauges).
- Dispare uma tempestade de erros rápidos e prove, no painel, que o p99 de **sucesso**
  não melhora — se melhorar, você não separou por status.
- Reduza a janela de `rate` para menos de 4 scrapes e mostre os buracos no gráfico.
  Restaure e documente a janela mínima do seu scrape interval.

**Checagem.** (a) Por que summary não serve para o p99 de um serviço com várias
instâncias? (b) O que acontece se você esquecer `le` no `sum by` de um
`histogram_quantile`? (c) Por que `avg(rate(...))` entre pods está errado? (d) Seus
buckets vão até 10s e o SLO é 500ms — o que isso faz com o seu p99?

## Principais aprendizados

- Série é nome + labels, e o total é o produto das cardinalidades — explosão mata por OOM,
  não por lentidão.
- Histogram permite agregar (some buckets, nunca percentis); summary não agrega e por isso
  não serve para o p99 do serviço.
- Janela de `rate` com pelo menos 4 scrapes; taxa de erro sobre counters; nunca média de
  médias entre pods.
- Buckets alinhados ao SLO decidem a precisão do percentil; Mimir só quando retenção
  longa, multi-cluster ou HA real forem requisito.
