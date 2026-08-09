---
id: escala
title: "Escala: HPA, KEDA e autoscaler"
summary: "Por que CPU é o pior sinal para serviço I/O-bound, KEDA escalando por lag de Kafka, e o que fazer quando o pico chega antes do autoscaler."
estimatedMinutes: 50
references:
  - title: "Kubernetes — Horizontal Pod Autoscaling"
    url: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
  - title: "KEDA — Kubernetes Event-driven Autoscaling"
    url: https://keda.sh/docs/latest/
  - title: "Kubernetes — Cluster Autoscaler"
    url: https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler
---

## Duas escalas, e elas dependem uma da outra

- **Horizontal (HPA/KEDA)** — mais pods. É o caminho normal.
- **Vertical (VPA)** — pods maiores. Útil para *right-sizing* de requests (marco 14),
  mas em modo automático ele **recria o pod** para aplicar o novo tamanho, o que
  raramente se quer no caminho do dinheiro. Use em modo recomendação.
- **De nós (cluster autoscaler / Karpenter)** — mais máquinas, quando não há onde os
  pods novos caberem.

O detalhe que confunde: **HPA sem capacidade de nó não escala.** O HPA cria pods, os
pods ficam `Pending`, e só então o autoscaler de nós reage — e uma máquina nova leva de
1 a 4 minutos para entrar. O tempo total de resposta a um pico é a soma dos dois, não o
menor deles.

## HPA e o problema do sinal

O HPA v2 ajusta réplicas por uma fórmula simples:

```
réplicas desejadas = ceil( réplicas atuais × (métrica atual / métrica alvo) )
```

O que muda tudo é **qual métrica**.

### Por que CPU é o pior sinal para serviço I/O-bound

O `pix-gateway` passa a maior parte do tempo **esperando** — o banco, o PSP, o Kafka.
Quando ele fica sobrecarregado, o que cresce é a **fila de espera**, não o uso de CPU. A
CPU pode até *cair*, porque as threads estão bloqueadas em I/O em vez de trabalhando.

Resultado: o serviço está em colapso, a latência em 8s, e o HPA por CPU a 45% não faz
nada. Pior, na recuperação a CPU sobe (backlog sendo processado) e ele escala **depois**
que o problema passou.

CPU é bom sinal para trabalho CPU-bound: transcodificação, cálculo de risco, criptografia
em lote. Para serviço web típico, é o padrão errado que vem pronto.

### Sinais melhores

- **RPS por pod** (custom metric via Prometheus Adapter): direto e proporcional. Um pod
  aguenta 200 RPS, você tem 1.000 RPS → 5 pods. A aritmética é óbvia e por isso confiável.
- **Concorrência / requisições em voo**: o sinal mais fiel para I/O-bound — é o `L` do
  Little's Law (trilha de observabilidade, marco 04). É a fila, e a fila é o que dói.
- **Latência**: tentador e traiçoeiro. Latência alta pode vir da dependência, e escalar
  pods multiplica a carga sobre a dependência já sofrida. Escalar por latência sem
  entender a causa produz o *retry storm* em outro formato.
- **Lag de fila**: o melhor sinal para consumidor. É o assunto do KEDA, abaixo.

## KEDA: escalar consumidor por lag

O HPA nativo não sabe ler o lag de um consumer group do Kafka. O **KEDA** preenche essa
lacuna: ele é um operador que expõe métricas externas (Kafka, SQS, RabbitMQ, Postgres,
cron…) para o HPA, e adiciona **scale-to-zero**.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  scaleTargetRef:
    name: ledger-consumer
  minReplicaCount: 2
  maxReplicaCount: 6          # = nº de partições do tópico. Nunca mais.
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka-bootstrap:9092
        consumerGroup: ledger-projector
        topic: payments.initiated
        lagThreshold: "1000"
```

Por que isso é o sinal certo: o lag mede exatamente o que importa — **o quanto você está
atrás do trabalho a fazer**. Ele sobe antes de qualquer SLA furar, é preditivo (trilha de
observabilidade, marco 03: saturação), e é imune ao problema do consumidor I/O-bound.

E o teto que **não** é opcional: `maxReplicaCount` nunca deve passar do número de
partições do tópico. Consumidores além disso ficam ociosos (marco 04 da trilha Kafka),
custam dinheiro e ainda participam de cada rebalance — piorando a recuperação em vez de
acelerá-la. Esse erro é comum e o KEDA não te protege dele.

## Autoscaler de nós, cold start e scale-to-zero

**Cluster Autoscaler** trabalha com node groups pré-definidos; **Karpenter** provisiona a
instância sob medida para os pods pendentes, o que costuma ser mais rápido e mais barato.

Os tempos reais, que definem o que é possível:

| Etapa | Ordem de grandeza |
| --- | --- |
| HPA percebe e cria o pod | 15–60s (janela de métrica + `stabilizationWindowSeconds`) |
| Nó novo provisionado e pronto | 1–4min |
| Imagem baixada | 10s–2min (depende do tamanho — argumento para distroless, marco 09) |
| App de fato pronta | boot da JVM + cache + pool |

**De 2 a 7 minutos** entre o pico começar e a capacidade nova atender. Se o seu pico sobe
em 30 segundos, o autoscaler **não vai te salvar** — e nenhuma configuração conserta isso.

**Scale-to-zero** (só com KEDA) é ótimo para consumidor de fila esporádica e péssimo para
API síncrona: a primeira requisição depois do zero espera o pod inteiro subir. Serve para
o job de conciliação noturna, não para a autorização.

Configure também o comportamento de descida: `scaleDown.stabilizationWindowSeconds`
generoso (300s é um bom começo). Escalar para baixo rápido demais produz *flapping* —
sobe, desce, sobe — e cada ciclo é um rebalance a mais no consumidor.

## Exemplo numa fintech

Pico de fim de mês e janela de compensação são **previsíveis**. Insistir em reagir a eles
com autoscaler reativo é escolher chegar atrasado todo mês.

O desenho do `fin-platform`:

- **Pré-escala agendada** — um `CronJob` (ou `KEDA cron` trigger) sobe o `minReplicaCount`
  15 minutos antes da janela conhecida. Custa algumas máquinas por algumas horas e elimina
  a corrida contra o cold start. É a solução mais barata e a menos elegante, e é a certa.
- **Sinal de negócio, não de infra.** A fila de liquidação crescendo é o gatilho; a CPU é
  consequência tardia.
- **KEDA por lag** no consumidor do ledger, com teto no número de partições.
- **`minReplicaCount` que nunca é 1** no caminho crítico — um pod é zero pods durante um
  rollout.

## Hands-on

**Tutorial — HPA por RPS, depois KEDA por lag.**

*Parte 1.* Instale o Prometheus Adapter e configure um HPA do `pix-gateway` por
**requisições por segundo por pod** (alvo: 60% da capacidade medida de um pod). Rode
carga crescente e registre: em quanto tempo o HPA reagiu, quantas réplicas, e qual foi o
p99 durante a subida.

*Compare:* refaça o mesmo teste com HPA por CPU a 70%. Anote a diferença de tempo de
reação. Se o seu serviço for I/O-bound, o HPA por CPU pode simplesmente **não escalar** —
e esse é o resultado que ensina.

*Parte 2.* Instale o KEDA e crie o `ScaledObject` acima para o consumidor de
`payments.initiated`. Pare o consumidor por 5 minutos para acumular lag, religue e
observe a escalada. `git commit`.

**Desafio — o teto de partições.** Configure `maxReplicaCount: 20` num tópico de 6
partições e produza um backlog grande.

**Invariantes testáveis:**

1. `kubectl get pods` mostra 20 réplicas, e o `kafka-consumer-groups --describe` mostra
   **14 sem partição atribuída**.
2. Meça o tempo para zerar o backlog com `maxReplicaCount: 20` e com
   `maxReplicaCount: 6`. **O tempo não melhora** com 20 — e provavelmente piora, por
   causa dos rebalances.
3. Escreva a ADR de 10 linhas: qual teto, por quê, e o que precisa acontecer no tópico
   antes de esse teto poder subir.

**Checagem.** (a) Por que a CPU pode **cair** quando um serviço I/O-bound satura? (b)
Qual o tempo real entre o pico começar e a capacidade nova atender, e o que isso implica
para um pico de 30 segundos? (c) Por que escalar por latência pode piorar o incidente?
(d) Scale-to-zero na API de autorização: por que não?

## Principais aprendizados

- CPU é o pior sinal para serviço I/O-bound: a fila cresce, a CPU não — escale por RPS,
  concorrência ou lag.
- KEDA traz lag de Kafka para o HPA e o teto de réplicas é o número de partições;
  ultrapassar custa dinheiro e piora o rebalance.
- Do pico à capacidade nova são 2–7 minutos; pico previsível se resolve com pré-escala
  agendada, não com autoscaler reativo.
- Escalar por latência sem saber a causa multiplica a carga sobre a dependência que já
  está sofrendo.
