---
id: objetos-essenciais
title: "Objetos essenciais e como ler um cluster"
summary: "Pod, ReplicaSet, Deployment, Service e Namespace; labels como o join do Kubernetes; e kubectl usado primeiro como ferramenta de leitura."
estimatedMinutes: 45
references:
  - title: "Kubernetes — Workloads"
    url: https://kubernetes.io/docs/concepts/workloads/
  - title: "Kubernetes — Labels and Selectors"
    url: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/
  - title: "Kubernetes — Recommended Labels"
    url: https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
---

## A pilha de controllers

O Pod é a unidade de execução: um ou mais containers que compartilham rede (mesmo IP,
mesmo `localhost`) e podem compartilhar volumes. E é **descartável por design** — um
pod nunca é reiniciado no lugar nem movido de nó; ele morre e outro nasce com outro IP.

Por isso você quase nunca cria um Pod diretamente. A pilha é uma cadeia de controllers,
cada um reconciliando o próximo:

```
Deployment  →  ReplicaSet  →  Pod
(versões e     (contagem      (execução)
 rollout)       de réplicas)
```

O **Deployment** gerencia ReplicaSets para dar rollout e rollback: numa mudança de
imagem ele cria um ReplicaSet novo, sobe pods nele e desce o antigo aos poucos
(marco 06). O ReplicaSet antigo fica com 0 réplicas — é ele que torna o rollback
instantâneo.

O **Service** dá um nome e um IP estáveis para um conjunto de pods que não param de
mudar. Sem ele, nada encontraria nada (marco 04).

O **Namespace** é a fronteira de nome, de quota (marco 14), de RBAC (marco 10) e de
NetworkPolicy (marco 11). Não é isolamento forte — é agrupamento com pontos de
aplicação de política.

## Labels: o `join` do Kubernetes

Não existe chave estrangeira em Kubernetes. Um Service não sabe o nome dos seus pods;
ele tem um **selector** de labels, e o conjunto de pods que casa com ele é resolvido
continuamente. O mesmo vale para ReplicaSet, NetworkPolicy, PodDisruptionBudget e
praticamente tudo que aponta para workloads.

Duas consequências práticas:

- **Um label errado é uma falha silenciosa.** O Service existe, tem IP, responde — com
  zero endpoints. Nada dá erro. `kubectl get endpointslices` é o diagnóstico, e ele é o
  primeiro comando quando "o Service não responde".
- **Dois workloads com o mesmo label são a mesma coisa** para quem seleciona. Um label
  copiado no `kubectl create` de um colega pode fazer o canary receber tráfego de
  produção.

Use o conjunto padronizado (`app.kubernetes.io/name`, `/instance`, `/version`,
`/component`, `/part-of`) em vez de inventar: ferramentas de terceiros já sabem lê-lo.

## `kubectl` como ferramenta de leitura

O erro do iniciante é usar `kubectl` para aplicar. O senior usa primeiro para **ler**:

| Comando | Para quê |
| --- | --- |
| `get -o yaml` | o objeto real, com o `status` que os controllers escreveram |
| `describe` | o objeto **mais os events relacionados**, em português de máquina |
| `get events --sort-by=.lastTimestamp` | a linha do tempo do que o cluster tentou fazer |
| `explain <recurso>.spec…` | o schema da API, sem sair do terminal |
| `diff -k overlays/dev` | **o que mudaria** se você aplicasse — antes de aplicar |
| `get endpointslices` | quem o Service realmente está enxergando |

`kubectl diff` é o mais subestimado da lista: ele transforma "acho que esse apply é
inofensivo" em fato, e é o mesmo mecanismo que o Argo CD usa para detectar drift
(marco 13).

E o hábito que vale mais que qualquer um deles: quando algo está errado, leia o
`status` e os events **antes** de mudar qualquer coisa. Metade dos incidentes de
Kubernetes é resolvida por um `describe` que ninguém leu.

## Imperativo, declarativo e por que `kubectl edit` é dívida

`kubectl run`, `kubectl scale`, `kubectl edit` mudam o cluster **agora**. São
excelentes para explorar e péssimos para operar, por um motivo que não é ideológico:
a mudança não existe em lugar nenhum a não ser no etcd.

Consequências concretas de um `kubectl edit` em produção:

- O próximo `apply` do pipeline **desfaz** a mudança, no pior momento possível.
- Com GitOps, o Argo CD reverte em segundos e ninguém entende por quê.
- A auditoria não tem o "por quê": há um registro de *quem* editou no audit log
  (marco 10), mas nenhuma justificativa, nenhum revisor, nenhum diff revisado.
- O cluster recriado do zero não terá aquela mudança — e ninguém vai lembrar dela.

A régua honesta: imperativo para **investigar** (`get`, `describe`, `logs`, `debug`),
declarativo para **mudar**. Se você precisou mudar à mão durante um incidente, o
follow-up obrigatório é o PR que torna a mudança permanente.

## Exemplo numa fintech

Namespace por domínio e labels de time/centro de custo desde o **dia 1**, não depois.
No `fin-platform`:

```yaml
metadata:
  namespace: payments
  labels:
    app.kubernetes.io/name: pix-gateway
    app.kubernetes.io/part-of: fin-platform
    fin.io/team: payments
    fin.io/cost-center: "4210"
    fin.io/data-classification: pii
```

Retrofitar isso depois é caro porque `selector` de Deployment é **imutável** — mudar
label de um workload existente significa recriá-lo. E cada um desses labels vira
insumo mais adiante: `team` e `cost-center` alimentam o rateio de FinOps (marco 14),
`data-classification` alimenta as policies de admissão (marco 09) e o desenho de
NetworkPolicy (marco 11).

## Hands-on

**Tutorial — o pix-gateway no cluster.** No `fin-platform`, em `base/pix-gateway/`:

1. Um Deployment com 3 réplicas do `pix-gateway` (use uma imagem stub se você não fez a
   trilha Spring Boot), com os labels da seção anterior.
2. Um Service ClusterIP apontando para ele.
3. `kubectl apply -k base/` e depois `kubectl get endpointslices` — confirme os 3 IPs.
4. `kubectl port-forward svc/pix-gateway 8080:8080` e faça uma requisição.
5. **Prove o self-healing:** `kubectl delete pod <um-deles>` e observe com
   `kubectl get pods -w`. Depois `kubectl get endpointslices` de novo: o IP velho saiu,
   o novo entrou — e o Service não mudou.
6. `git commit`.

**Desafio — o label quebrado.** Mude o `selector` do Service para um label que nenhum
pod tem. O Service continua existindo e respondendo (com erro de conexão). Diagnostique
usando **apenas comandos de leitura** e escreva a sequência exata de comandos que levou
ao diagnóstico, em ordem. O objetivo é o método, não o conserto.

**Checagem.** (a) Por que um Service com selector errado não gera nenhum evento de
erro? (b) O que exatamente torna o rollback de um Deployment instantâneo? (c) Você
escalou um Deployment com `kubectl scale` durante um pico — o que precisa acontecer
antes de você ir dormir?

## Principais aprendizados

- Pod é descartável; Deployment → ReplicaSet → Pod é a cadeia de controllers que dá
  rollout, contagem e execução.
- Labels são o único mecanismo de ligação: label errado é falha silenciosa, e
  `endpointslices` é o primeiro comando quando o Service "não responde".
- Leia antes de aplicar — `describe`, events e `kubectl diff` resolvem metade dos
  incidentes sem mudar nada.
- Imperativo para investigar, declarativo para mudar; `kubectl edit` em produção é uma
  mudança que o próximo apply apaga e que a auditoria não consegue explicar.
