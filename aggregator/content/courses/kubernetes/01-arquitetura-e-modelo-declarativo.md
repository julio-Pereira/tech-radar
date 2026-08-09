---
id: arquitetura
title: "Arquitetura do cluster e o modelo declarativo"
summary: "O loop de reconciliação como a ideia que explica 80% do comportamento do Kubernetes, os componentes que o executam, e por que auditoria gosta de infra declarativa."
estimatedMinutes: 45
references:
  - title: "Kubernetes — Cluster Architecture"
    url: https://kubernetes.io/docs/concepts/architecture/
  - title: "Kubernetes — Controllers"
    url: https://kubernetes.io/docs/concepts/architecture/controller/
  - title: "Kubernetes — Version Skew Policy"
    url: https://kubernetes.io/releases/version-skew-policy/
---

## A ideia central: reconciliação

Se você aprender uma coisa só desta trilha, que seja esta: **tudo em Kubernetes é um
controller rodando um laço**.

```
para sempre:
    desejado  = ler a spec da API
    observado = ler o mundo real
    se diferente: agir para aproximar
```

Você não *executa* nada no Kubernetes. Você **declara** o estado desejado num objeto,
e um controller trabalha continuamente para tornar o mundo igual à declaração. Nunca
há uma transação "deu certo" — há convergência, que pode levar tempo, oscilar ou nunca
completar.

Isso explica quase todo comportamento que parece estranho no começo:

- Você deletou um pod e ele voltou → o controller do ReplicaSet viu 2 quando queria 3.
- Você editou algo à mão e a mudança sumiu → outro controller (ou o Argo CD) reconciliou
  de volta para a declaração.
- O `kubectl apply` retornou na hora, mas nada mudou ainda → a API aceitou a declaração;
  a convergência é assíncrona.
- Um pod fica `Pending` para sempre sem erro → nenhum controller falhou; o estado
  desejado simplesmente ainda não é satisfazível.

E explica o modelo mental de debug do marco 12: quando algo não acontece, a pergunta
não é "que comando falhou?", é **"qual controller deveria estar agindo, e o que ele
está vendo?"**. A resposta quase sempre está em `kubectl describe` e nos events.

## Quem executa esse laço

**Control plane:**

- **API server** — a **única** porta de entrada. Nada, nem o kubelet, nem o scheduler,
  fala com o etcd direto. Ele autentica, autoriza (RBAC, marco 10), passa por admission
  (marco 09), valida e persiste. Toda superfície de segurança do cluster passa por aqui.
- **etcd** — o banco de chave-valor que guarda o estado declarado. É o único componente
  com estado, o que faz dele o alvo do backup (marco 13) e do encryption at rest
  (marco 03).
- **Scheduler** — decide *em qual nó* um pod novo cabe. Ele só escreve o campo
  `nodeName`; quem cria o container é o kubelet.
- **Controller-manager** — a coleção de controllers embutidos (Deployment, ReplicaSet,
  Node, Job…), cada um rodando o laço acima.

**Em cada nó:**

- **kubelet** — o agente que assiste os pods atribuídos ao seu nó, pede ao runtime que
  os crie, roda as probes (marco 06) e reporta status de volta.
- **CRI** (containerd/CRI-O) — quem realmente cria o container. O Docker não é mais o
  runtime.
- **kube-proxy** (ou o CNI substituindo-o via eBPF) — programa as regras que fazem o IP
  de um Service virar um pod real (marco 04).

Repare que o kubelet **puxa** o trabalho do API server em vez de recebê-lo por push. É
o que permite ao nó reconectar e se reconciliar sozinho depois de uma partição de rede.

## Versionamento é rotina, não projeto

Kubernetes lança cerca de **três versões por ano** e mantém suporte **N-2** — ou seja,
uma versão sai de suporte em pouco mais de um ano. A trilha usa **1.36 (2026)** como
baseline e cita a versão só aqui e no glossário; o resto do conteúdo evita amarrar em
número para não envelhecer.

A consequência operacional é a lição, não o número: **você vai fazer upgrade de cluster
várias vezes por ano, para sempre.** Um cluster que só é atualizado "quando der" acumula
duas ou três versões de dívida e o upgrade vira um projeto de risco — exatamente o que
uma fintech não pode agendar. Upgrade precisa ser rotina ensaiada (marco 13).

O corolário mais desconfortável é sobre dependências. Em **março de 2026 o projeto
aposentou o Ingress NGINX** — o controller de entrada mais usado do ecossistema por
quase uma década, sem sucessor drop-in. Quem tratou "Ingress" como algo permanente
herdou uma migração não planejada. É por isso que esta trilha ensina **Gateway API**
(marco 04) e não Ingress legado, e por que o marco 14 fecha com uma ADR: toda
dependência de plataforma tem prazo de validade, e o trabalho de techlead é saber qual
é o de cada uma.

## Exemplo numa fintech

Por que um regulador gosta de infraestrutura declarativa: o cluster deixa de ser um
lugar onde pessoas digitam comandos e passa a ser a **consequência de um repositório
Git**. Isso entrega, de graça, o que a auditoria pede e que normalmente é caro de
produzir:

- **Quem mudou o quê, quando e por quê** — o histórico de commits, com autor e PR.
- **Aprovação segregada** — quem escreveu não é quem aprovou (SoD, marco 10), provado
  pelo review no PR.
- **Reprodutibilidade** — o ambiente pode ser recriado do zero a partir do repo, o que
  é metade de um plano de continuidade (marco 13).

A pergunta que separa os dois mundos: *"esse cluster de produção pode ser recriado
inteiro a partir do Git, sem ninguém lembrar de nada?"*. No fim desta trilha, a resposta
para o `fin-platform` é sim.

## O `fin-platform`: o projeto guia

Cada marco entrega um incremento verificável num repositório GitOps chamado
**`fin-platform`**, que sobe o `pix-gateway` (trilha Spring Boot), o `ledger-core`
(trilha Go) e o Kafka (trilha Kafka) num cluster local `kind`. Você não precisa ter
feito as outras trilhas — os componentes vizinhos têm imagens stub documentadas.

**Nada nesta trilha exige conta em cloud paga.** Onde a nuvem muda a resposta
(LoadBalancer real, IRSA/Workload Identity, cluster autoscaler), o conteúdo explica a
diferença em vez de fingir que simulou.

## Hands-on

**Tutorial — o estado inicial.** Suba um cluster `kind` de **3 nós** (1 control-plane,
2 workers) e crie o repositório `fin-platform` com a estrutura
`base/`, `overlays/dev/`, `overlays/prod/`, `docs/adr/`. Depois:

1. `kubectl get nodes -o wide` — identifique o papel de cada nó.
2. `kubectl get pods -n kube-system` — encontre o API server, o etcd, o scheduler, o
   controller-manager e o kube-proxy. Note que o kubelet **não** está aí: ele é um
   processo do nó, não um pod.
3. `kubectl get pod <api-server> -n kube-system -o yaml` e leia campo a campo:
   `spec` (o que você declarou) vs `status` (o que o controller observou). Essa divisão
   é o modelo inteiro.
4. `kubectl explain deployment.spec.strategy` — a documentação vive na própria API.
5. `git commit` do `kind.yaml` e do README.

**Desafio — provar a reconciliação.** Crie um Deployment com 3 réplicas. Delete um pod
e cronometre quanto tempo até existirem 3 de novo. Depois **pause** o
controller-manager (`kubectl -n kube-system delete pod` do controller-manager não serve:
ele volta — use `docker exec` no nó control-plane para mover o manifesto estático para
fora de `/etc/kubernetes/manifests/`), delete um pod outra vez e observe que **nada
acontece**. Restaure o manifesto e veja a reconciliação alcançar o atraso de uma vez só.
Escreva 5 linhas sobre o que isso prova.

**Checagem.** (a) Quem escreve o campo `nodeName` de um pod, e quem cria o container?
(b) Por que `kubectl apply` retornar sucesso não significa que a mudança aconteceu?
(c) Sua empresa usa Ingress NGINX em produção hoje — qual é o primeiro parágrafo do
e-mail que você escreve amanhã?

## Principais aprendizados

- Tudo é um controller reconciliando estado desejado com observado; quando algo não
  acontece, pergunte qual controller deveria agir e o que ele está vendo.
- O API server é a única porta de entrada, e o etcd é o único componente com estado —
  logo, o alvo de RBAC, admission, backup e encryption at rest.
- Cadência de ~3 releases/ano com suporte N-2 torna upgrade rotina; a aposentadoria do
  Ingress NGINX em 2026 é o lembrete de que dependência de plataforma tem prazo.
- Infra declarativa em Git entrega autoria, aprovação segregada e reprodutibilidade —
  a evidência que a auditoria pede, sem trabalho extra.
