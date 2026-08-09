---
id: scheduling-e-recursos
title: "Scheduling, recursos e QoS"
summary: "requests vs limits, as classes de QoS, o CPU throttling que mata o p99 sem aparecer em nenhum gráfico de uso, e como o scheduler decide onde o pod cai."
estimatedMinutes: 55
references:
  - title: "Kubernetes — Resource Management for Pods and Containers"
    url: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
  - title: "Kubernetes — Pod Quality of Service Classes"
    url: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/
  - title: "Kubernetes — Assigning Pods to Nodes"
    url: https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/
---

## requests e limits são coisas diferentes

Elas parecem um par (mínimo e máximo). Não são: agem em momentos distintos, por
mecanismos distintos.

- **`requests`** é para o **scheduler**. É a reserva: o pod só cai num nó que tenha
  aquilo livre. Depois de agendado, o request não impede o container de usar mais.
- **`limits`** é para o **kubelet/cgroup**, em tempo de execução. É o teto forçado.

E o teto se comporta de forma **completamente diferente** para os dois recursos, o que é
a origem de metade dos incidentes deste marco:

| | CPU | Memória |
| --- | --- | --- |
| Natureza | compressível | **incompressível** |
| Ao bater no limite | **throttling** (o processo espera) | **OOMKill** (o processo morre) |
| Sintoma | p99 alto, sem erro | `CrashLoopBackOff`, código 137 |
| Visível em "uso de CPU/RAM"? | **não** | só como reinício |

Você não pode "devolver" memória já usada — daí a morte. Pode adiar CPU — daí a espera.

## CPU throttling: o assassino silencioso do p99

Este é o parágrafo que muda como você configura clusters.

O limite de CPU é implementado pelo CFS quota do cgroup: em cada **período de 100ms**, o
container recebe uma cota. Com `limits.cpu: 500m`, ele pode usar 50ms de CPU a cada
100ms. **Gastou a cota aos 30ms? Fica congelado pelos 70ms restantes.** Sem erro, sem
log, sem sinal.

O efeito perverso é que isso acontece mesmo com uso médio **baixo**. Um serviço que
consome 20% de CPU na média pode estar sendo throttled dezenas de vezes por minuto,
porque a carga real é feita de rajadas curtas: uma requisição chega, precisa de CPU por
15ms concentrados, e a cota do período acabou. O gráfico de "uso de CPU" mostra 20% e
está tudo bem; o p99 está em 2 segundos.

E o caso mais cruel: **aplicação multi-thread**. A cota é consumida por **todas** as
threads somadas. Uma JVM com 8 threads de GC num nó de 16 cores, com
`limits.cpu: 1`, queima a cota de 100ms em 12ms de tempo real. O pico de latência do
`pix-gateway` coincide com o GC, e ninguém entende por quê.

A métrica que revela é `container_cpu_cfs_throttled_periods_total` sobre
`container_cpu_cfs_periods_total` — a fração de períodos em que houve throttling.
Qualquer coisa acima de alguns por cento em serviço sensível a latência é problema.
(É o *saturation* do USE, na trilha de observabilidade: a fila que o "uso" não mostra.)

### Por que limite de CPU frequentemente é pior que não ter

A recomendação que soa herética e é defensável para serviço de latência crítica:
**defina `requests.cpu` com cuidado e não defina `limits.cpu`.**

O raciocínio: `requests` já garante o seu quinhão — o CFS *share* dá a você a proporção
reservada quando há disputa. O `limits` só acrescenta uma coisa: te impedir de usar CPU
**ociosa** do nó. Você está trocando latência real por previsibilidade que raramente
precisa.

Quando limitar CPU faz sentido: workload de batch (para não roubar o nó), ambiente
multi-tenant sem confiança entre times, e quando você precisa de QoS `Guaranteed` para
outra razão. Fora isso, a decisão merece ser questionada — e é uma boa ADR.

**Memória é o oposto:** `limits.memory` deve existir sempre. Sem ele, um vazamento
consome o nó inteiro e o kubelet começa a despejar pods **vizinhos**. Aqui o limite
protege os outros.

## Classes de QoS

Derivadas do que você declarou, não escolhidas:

- **`Guaranteed`** — todos os containers com requests **iguais** aos limits, para CPU e
  memória. Último a ser despejado.
- **`Burstable`** — tem requests, e limits diferentes ou ausentes. A maioria.
- **`BestEffort`** — nada declarado. **Primeiro a morrer** quando o nó fica sob pressão.

Nenhum workload de fintech deve ser `BestEffort`. É o valor padrão de quem esqueceu, e
é o pod que some primeiro exatamente durante o pico — quando o nó fica pressionado.

Quando o nó fica sem memória, o kubelet despeja na ordem: `BestEffort`, depois
`Burstable` que excedeu o request, depois `Guaranteed`. Ou seja: **um request de memória
honesto é o que te protege do despejo**, e não o limite.

## O scheduler

O ciclo é: **filtrar** os nós que servem (tem recurso? tolera o taint? bate o node
affinity?), depois **pontuar** os que sobraram e escolher o melhor.

As ferramentas que você usa de fato:

- **`nodeAffinity`** — "quero nó com SSD" (`required` filtra, `preferred` só pontua).
- **`podAntiAffinity`** — "não ponha duas réplicas minhas no mesmo nó". Com
  `topologyKey: kubernetes.io/hostname` para nó, `topology.kubernetes.io/zone` para AZ.
  Use `requiredDuringScheduling` quando é requisito de disponibilidade — mas saiba que
  com `required` e nós insuficientes o pod fica `Pending` para sempre.
- **`topologySpreadConstraints`** — a forma moderna e mais expressiva: "espalhe
  uniformemente entre zonas, tolerando desvio de no máximo 1"
  (`maxSkew`), com `whenUnsatisfiable: DoNotSchedule` ou `ScheduleAnyway`.
- **`taints` e `tolerations`** — o inverso: o **nó** repele pods que não o toleram. É
  como se reserva hardware (nós com GPU, nós de banco de dados).
- **`priorityClassName` e preempção** — pod de prioridade alta **despeja** pods de
  prioridade baixa para caber. Numa fintech: a autorização tem prioridade sobre o
  relatório noturno, e isso é declarado, não torcido.

### PodDisruptionBudget

O PDB limita disrupções **voluntárias** (drain de nó, upgrade de cluster, rollout):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 2          # ou maxUnavailable: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: pix-gateway
```

O `kubectl drain` **bloqueia** em vez de derrubar o pod que violaria o PDB. Duas
armadilhas: PDB com `minAvailable` igual ao número de réplicas trava qualquer drain
para sempre (e o upgrade do cluster para em cima dele); e o PDB **não protege** contra
disrupção involuntária — nó que morre, morre.

## Exemplo numa fintech

O serviço de autorização não pode dividir nó com job de batch. O batch de conciliação
consome CPU em rajada e enche o page cache; a autorização quer latência previsível.
No `fin-platform`:

- Nós dedicados com **taint** `workload=batch:NoSchedule`; o batch tolera, a autorização
  não.
- **`topologySpreadConstraints`** por zona no `pix-gateway`, `maxSkew: 1`, para
  sobreviver à perda de uma AZ com capacidade suficiente. (No `kind` você simula
  rotulando os nós com zonas fictícias — o objeto é idêntico, o que muda é quem põe o
  label.)
- **PDB `minAvailable: 2`** com 3 réplicas: o drain espera, o serviço continua.
- **`priorityClass`** alta na autorização: se faltar capacidade, o relatório é que sai.

## Hands-on

**Tutorial — ver o throttling.** Este é o experimento que mais muda intuição na trilha:

1. Deploy do `pix-gateway` **sem** `limits.cpu`. Rode `hey` ou `k6` com carga constante
   por 3 minutos. Anote p50, p99 e o **uso médio de CPU**.
2. Adicione `limits.cpu: 500m` (deixe o request igual ao uso médio observado). Repita a
   mesma carga.
3. Compare os três números. O uso médio de CPU será parecido; o **p99 vai explodir**.
4. Confirme a causa em vez de supor: consulte
   `rate(container_cpu_cfs_throttled_periods_total[1m]) / rate(container_cpu_cfs_periods_total[1m])`.
   Esse é o número que prova o diagnóstico.
5. Escreva 5 linhas no `docs/adr/` do `fin-platform`: limitar CPU no `pix-gateway`, sim
   ou não, com o gatilho de reversão. `git commit`.

**Desafio — sobreviver ao drain.** Configure o `pix-gateway` com 3 réplicas,
`podAntiAffinity` por hostname e um PDB. Depois:

**Invariantes testáveis:**

1. `kubectl get pods -o wide` mostra as 3 réplicas em **3 nós distintos**.
2. Com carga rodando, `kubectl drain <nó>` completa **e** o teste de carga registra
   **zero** requisições perdidas e ao menos 2 réplicas `Ready` o tempo todo.
3. Agora mude o PDB para `minAvailable: 3` e prove que o `drain` **trava**
   indefinidamente. Explique em duas linhas por que isso quebraria o upgrade do cluster.

**Checagem.** (a) Seu container usa 20% de CPU na média e o p99 está péssimo — qual
métrica você olha? (b) Por que `limits.memory` deve existir e `limits.cpu` é
discutível? (c) Um pod `BestEffort` sumiu durante o pico: por quê? (d) Qual PDB torna o
upgrade do cluster impossível?

## Principais aprendizados

- `requests` é para o scheduler, `limits` é para o cgroup em runtime; CPU é
  compressível (throttling), memória não (OOMKill).
- Throttling acontece com uso médio baixo, é invisível no gráfico de uso, e piora com
  aplicação multi-thread — `container_cpu_cfs_throttled_periods_total` é o diagnóstico.
- QoS é derivada do que você declarou; `BestEffort` morre primeiro, e request de memória
  honesto é o que protege do despejo.
- Anti-affinity/topology spread + PDB é o par que sustenta um drain sem queda — e um PDB
  apertado demais trava o upgrade do cluster.
