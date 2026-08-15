---
id: custo-e-escala
title: "Custo, cardinalidade e escala"
summary: "Onde o dinheiro vaza, a tabela do marco 04 agora com números reais, e a ADR de self-host contra SaaS que ninguém escreve antes da fatura."
estimatedMinutes: 45
references:
  - title: "Prometheus — Cardinality Management"
    url: https://prometheus.io/docs/practices/naming/
  - title: "Grafana — Control Loki Costs"
    url: https://grafana.com/docs/loki/latest/operations/storage/retention/
  - title: "OpenTelemetry — Sampling"
    url: https://opentelemetry.io/docs/concepts/sampling/
---

## O custo por sinal, com números

O marco 04 apresentou a tabela conceitual. Agora as ordens de grandeza, que são o que
decide onde cortar:

| Sinal | Volume relativo | Onde o custo mora | Alavanca principal |
| --- | --- | --- | --- |
| Métrica | baixo | **número de séries ativas** (memória) | cardinalidade |
| Log | **alto** | ingestão e armazenamento | nível e amostragem |
| Trace | médio-alto | ingestão e armazenamento | sampling |
| Profile | baixo | armazenamento | retenção |

A observação que reorganiza prioridades: **log costuma ser a maior fatia da conta**, e a
alavanca mais eficaz nem é técnica — é `DEBUG` ligado em produção. O `DEBUG` que alguém
ligou "só por hoje" para investigar algo, e que continua ligado três meses depois, é
provavelmente a maior economia disponível hoje no seu ambiente.

## Cardinalidade: onde o dinheiro vaza em métricas

A explosão é multiplicativa (marcos 04 e 07). Um label novo com 1.000 valores distintos
multiplica **todas** as séries daquela métrica por 1.000.

Os culpados de sempre:

- `user_id`, `payment_id`, `account_id`, `session_id`
- `url` com path variável (`/payments/9f2c-4a1b`) em vez de **template de rota**
  (`/payments/{id}`)
- mensagem de erro como label — texto livre é cardinalidade ilimitada
- `pod_name` em métrica de aplicação (o pod muda a cada deploy, e as séries antigas
  continuam ocupando memória até expirarem)

Diagnóstico no Prometheus:

```promql
topk(10, count by (__name__)({__name__=~".+"}))
```

E a API `/api/v1/status/tsdb` dá o resumo direto: as métricas com mais séries e os labels
com mais valores. Olhar isso uma vez por mês é barato e costuma revelar surpresas.

A regra prática: **identificador vai em log e trace, nunca em métrica.** Você não perde
informação — muda o sinal onde ela mora, e é justamente o sinal projetado para
alta cardinalidade.

## As alavancas, da mais eficaz à menos

**1. Nível de log por ambiente.** `INFO` em produção; `DEBUG` com prazo e responsável. É a
maior economia e a mais fácil.

**2. Amostragem de log repetitivo.** Uma falha que se repete 50 mil vezes por minuto
precisa de uma amostra e um contador, não de 50 mil linhas idênticas.

**3. Tail sampling de traces** (marco 06): 100% de erro, lentidão e valor alto; 5% do
resto. Redução de mais de 90% preservando o que serve para investigar.

**4. Drop de atributos no Collector.** Cada atributo removido é custo que não é pago em
todos os sinais adiante. É a alavanca do marco 06, e ela é implementável por quem opera,
sem tocar em código de aplicação.

**5. Retenção por classe.** Métrica 15 dias em alta resolução + agregada por mais tempo
(via Mimir); log de aplicação 15–30 dias; trace 7 dias; profile 7 dias; **auditoria,
anos e em outro lugar** (marco 09).

**6. Recording rules com downsampling.** Guardar o SLI pré-agregado por muito tempo custa
uma fração de guardar a série bruta — e é o que sustenta o painel de error budget de 30
dias.

## Self-host vs SaaS

A conta que quase ninguém faz honestamente, porque um dos lados é fácil de esquecer.

**Self-host** paga em computação, armazenamento e **pessoas**. O último é o que some das
planilhas: alguém opera Prometheus, Loki, Tempo, Mimir — atualiza, dimensiona, acorda
quando o ingester cai. É uma fração real de FTE, e ela existe mesmo nos meses em que nada
acontece.

**SaaS** paga por volume, com preço previsível por GB ou por série — e imprevisível no
total, porque o volume cresce com o tráfego e com cada instrumentação nova. Sem controle de
cardinalidade, a fatura surpreende, e o incentivo perverso é reduzir telemetria por custo,
não por utilidade.

O critério, sem torcida:

- **SaaS** quando o time é pequeno, o volume é moderado e a operação da plataforma não é
  seu diferencial. É a escolha certa com mais frequência do que engenheiros gostam de
  admitir.
- **Self-host** quando o volume é grande o bastante para a conta virar (o ponto de inflexão
  costuma estar em dezenas de TB por mês), quando há requisito de soberania de dado — que
  numa fintech regulada acontece — ou quando já existe equipe de plataforma.
- **Híbrido**, comum e defensável: métricas self-hosted (baratas, alto volume de consulta),
  traces e logs em SaaS (caros de operar em escala).

Escreva isso como **ADR** com números do seu ambiente e um gatilho de reversão. Sem o
documento, a decisão é tomada de novo a cada troca de liderança.

## Exemplo numa fintech

O caminho de redução no `fin-platform`, em ordem de execução e retorno:

1. **`DEBUG` desligado** em produção — maior economia, esforço quase zero.
2. **Auditoria de cardinalidade**: `payment_id` e `account_id` removidos de métricas e
   movidos para trace e log; `url` substituída por template de rota.
3. **Tail sampling** com as políticas do marco 06.
4. **Drop de atributos verbosos** no Collector, antes da ingestão.
5. **Retenção por classe**, com a auditoria separada em storage imutável.

E o princípio que evita o corte errado: **corte primeiro o que ninguém consulta.** Antes de
reduzir retenção de trace, verifique quantas consultas acessam dados com mais de 3 dias. A
telemetria que ninguém usa é 100% desperdício; a que alguém usa às 3h é barata a
praticamente qualquer preço.

O erro caro é cortar por pânico depois da fatura, e descobrir no incidente seguinte que o
sinal que faltava era justamente o que foi cortado.

## Hands-on

**Desafio — a auditoria de custo.**

1. Meça, por sinal, o volume ingerido por dia no `fin-platform` (ou no seu ambiente real).
   Monte a tabela: sinal, GB/dia, séries ativas, custo estimado.
2. Rode `topk(10, count by (__name__)({__name__=~".+"}))` e a API `/status/tsdb`.
   Identifique as **três** métricas com mais séries e o label culpado de cada uma.
3. Aplique as alavancas 1 a 4 da seção.

**Invariantes testáveis:**

- Volume total reduzido em **pelo menos 50%**. Meça antes e depois — não estime.
- **Nenhum dos alertas dos marcos 12 e 13 deixou de funcionar.** Rode os cenários de
  injeção do marco 13 depois do corte e confirme que os quatro alertas ainda disparam. Este
  é o critério que separa otimização de mutilação.
- **Todos os painéis do marco 14 continuam preenchidos.** Um gráfico vazio depois do corte
  é um sinal que você removeu sem saber que era usado.
- Os traces de **erro** continuam em 100% depois do sampling.

4. Documente o antes e depois com números, e a lista do que foi cortado e por quê.

**Complemento — a ADR.** Escreva `docs/adr/00X-self-host-vs-saas-observabilidade.md`:
volume atual e projetado para 12 meses, custo estimado das duas opções **incluindo a fração
de FTE** do self-host, a decisão, e o gatilho de reversão (volume, tamanho do time, ou
requisito regulatório). O critério de qualidade é a linha do FTE — é a que costuma estar
ausente.

**Checagem.** (a) Qual costuma ser a maior fatia da conta, e qual a alavanca mais fácil?
(b) Por que `url` com path variável explode a cardinalidade e template de rota não?
(c) Qual o critério para cortar telemetria sem se arrepender? (d) O que quase sempre falta
na conta do self-host?

## Principais aprendizados

- Log costuma ser a maior fatia, e `DEBUG` em produção é a maior economia disponível com o
  menor esforço.
- Cardinalidade é multiplicativa: identificador vai em log e trace, nunca em métrica — a
  informação não se perde, muda de sinal.
- Corte primeiro o que ninguém consulta, e prove que os alertas e painéis continuam
  funcionando depois do corte.
- A conta do self-host precisa incluir a fração de FTE que opera a plataforma; o híbrido é
  comum e defensável.
