---
id: estado-e-operators
title: "Estado: StatefulSet, volumes e operators"
summary: "Identidade estável e por que ela importa, o critério honesto para não rodar banco no cluster, e operators como o padrão controller aplicado a software com estado."
estimatedMinutes: 50
references:
  - title: "Kubernetes — StatefulSets"
    url: https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/
  - title: "Kubernetes — Persistent Volumes"
    url: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
  - title: "Strimzi — Kafka on Kubernetes"
    url: https://strimzi.io/documentation/
---

## O que o StatefulSet garante (e o Deployment não)

Um Deployment trata pods como gado: nomes aleatórios, ordem irrelevante, volume
compartilhado ou nenhum. Software distribuído com estado precisa do contrário:

- **Identidade estável** — `kafka-0`, `kafka-1`, `kafka-2`. O nome sobrevive ao
  reinício, e com Service headless (marco 04) cada pod tem DNS próprio
  (`kafka-0.kafka-headless.ns.svc`). É o que permite a um broker anunciar um endereço que
  continua válido depois de ele morrer.
- **Ordem** — sobe 0, 1, 2; desce 2, 1, 0. Importa para quorum: subir todos de uma vez
  pode formar dois grupos que não se enxergam.
- **Volume próprio e persistente** — via `volumeClaimTemplates`, cada réplica ganha
  **seu** PVC, que sobrevive ao pod e é reanexado ao pod de mesmo índice.

E o que ele **não** faz, e é onde a expectativa quebra: o StatefulSet não sabe nada sobre
o seu software. Ele não elege líder, não faz backup, não valida se o quorum está
saudável antes de reiniciar o próximo pod. Ele garante *mecânica* — identidade, ordem,
disco. A **semântica** é problema de quem opera. É exatamente esse buraco que os
operators preenchem.

Detalhe que morde: deletar um StatefulSet **não** deleta os PVCs (proteção deliberada).
Recriar o StatefulSet reconecta aos dados antigos — ótimo quando é o que você quer,
péssimo quando você achou que tinha limpado o ambiente.

## PV, PVC e a verdade sobre reclaim policy

**PVC** é o pedido ("quero 100Gi, ReadWriteOnce"); **PV** é o volume real; a
**StorageClass** é quem provisiona sob demanda e define os parâmetros (tipo de disco,
IOPS, zona).

Três pontos que decidem incidentes:

- **`ReadWriteOnce` prende o pod a uma zona.** Um disco de bloco existe numa AZ. Se o pod
  precisa reagendar e a zona está fora, ele fica `Pending` — a alta disponibilidade que
  você achava ter no `topologySpreadConstraints` do marco 05 não se aplica ao dado.
- **`reclaimPolicy: Delete`** é o padrão da maioria das StorageClasses gerenciadas.
  Deletar o PVC **apaga o disco**. Para dado financeiro, use uma StorageClass com
  `Retain` e assuma a limpeza manual. O incômodo é o preço de não ter um `kubectl delete`
  irreversível.
- **`allowVolumeExpansion`** — crescer o volume é possível; encolher, não. Dimensione
  para crescer.

**Snapshot (`VolumeSnapshot`) não é backup.** Ele costuma viver no mesmo sistema de
armazenamento que o dado original: perdeu a conta, o storage, ou alguém rodou o comando
errado — perdeu os dois. Backup é cópia **fora** do domínio de falha, com restore
testado (marco 13).

## Quando NÃO rodar banco no cluster

A pergunta que gera briga, e ela tem critério.

Rodar Postgres no Kubernetes é tecnicamente viável e alguns operators são maduros. O
ponto é outro: **quem faz o failover às 3h da manhã de domingo?**

Um serviço gerenciado (RDS, Cloud SQL) te entrega backup automático, failover testado,
patch de segurança, replicação cross-AZ e um SLA contratual. Um operator no seu cluster
te entrega o software; a **operação continua sua** — e a operação de banco é uma
especialidade, não um YAML.

O critério honesto, em três perguntas:

1. **Equipe.** Existe alguém no time que sabe restaurar esse banco sob pressão, e essa
   pessoa está de plantão? Se a resposta é "o operator faz", não é resposta.
2. **SLA.** O RPO/RTO que o negócio exige é atingível com o que você consegue operar? Já
   mediu um restore real, cronometrado?
3. **Diferencial.** Você ganha algo que o gerenciado não dá — custo em escala grande,
   extensão específica, requisito de soberania de dado?

Se as três não forem claramente favoráveis, **use o gerenciado**. Numa fintech, o banco
do ledger quase nunca deveria estar no cluster.

O contraponto justo: para software **projetado** para o Kubernetes, com operator maduro —
Kafka via Strimzi é o caso — a conta muda, porque o operator de fato encapsula a
operação e o software já assume um ambiente elástico.

## Operators e CRDs

Um **CRD** estende a API do Kubernetes com um tipo novo. Um **operator** é o controller
que reconcilia esse tipo — o mesmo laço do marco 01, aplicado a conhecimento operacional
específico.

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
spec:
  kafka:
    replicas: 3
    config:
      min.insync.replicas: 2
      default.replication.factor: 3
```

O que o Strimzi faz por trás disso é o que um StatefulSet cru não faria: rolling restart
que **espera o ISR se recompor** antes de reiniciar o próximo broker, rebalanceamento de
partições com Cruise Control, rotação de certificados, criação de tópicos e usuários por
CRD (`KafkaTopic`, `KafkaUser`).

É o padrão da trilha inteira aparecendo mais uma vez: o conhecimento operacional vira
**código que reconcilia**, em vez de um runbook que alguém executa às 3h.

O critério para adotar um operator: ele é mantido, tem base de usuários real, e você
consegue entender o que ele faz quando falha. Operator abandonado é pior que nenhum —
você herdou um sistema distribuído que ninguém conhece.

## Exemplo numa fintech

Dado financeiro com backup **testado** e restore **cronometrado**. As duas palavras
carregam o peso:

- *Testado* — restore que nunca foi executado é uma hipótese. A taxa de descoberta de
  backup quebrado no primeiro restore real é alta o bastante para ser assustadora.
- *Cronometrado* — o RTO é um número medido, não uma estimativa. O regulador pergunta
  quanto tempo leva para voltar; "algumas horas" não é resposta.

E a frase para colar na parede: **PVC não é backup.** Nem snapshot. Nem replicação — a
replicação copia o `DELETE` errado para todas as réplicas em milissegundos.

## Hands-on

**Desafio — Kafka via Strimzi que sobrevive ao delete do pod.** No `fin-platform`:

1. Instale o operator Strimzi no `kind`.
2. Crie um `Kafka` KRaft de **3 brokers** com `min.insync.replicas: 2` e
   `default.replication.factor: 3` — os mesmos números do marco 02 da trilha Kafka, agora
   como declaração.
3. Crie o tópico `payments.initiated` via CRD `KafkaTopic`, não via CLI. Confirme que ele
   aparece no `kafka-topics.sh --list` — a reconciliação funcionando.
4. Produza **10.000** mensagens com `acks=all`.

**Invariantes testáveis:**

- `kubectl delete pod <broker>-1` → o pod volta com **o mesmo nome**, reanexa o **mesmo
  PVC**, e o consumo das 10.000 mensagens está **completo e na ordem** por partição.
- Com um produtor rodando continuamente, faça o rolling restart pelo operator
  (`kubectl annotate ... strimzi.io/manual-rolling-update=true`). **Zero** erro no
  produtor. Compare com o que aconteceria se você derrubasse os 3 brokers em paralelo —
  descreva, não execute com o produtor ligado.
- `kubectl delete kafka` seguido de recriação: os PVCs sobreviveram e o dado voltou.
  (Faça isso **por último** e entenda que é a demonstração do comportamento que morde no
  ambiente de desenvolvimento.)

**Complemento — a ADR.** Escreva `docs/adr/00X-banco-do-ledger.md`: o Postgres do
`ledger-core` roda no cluster ou é gerenciado? Use as três perguntas da seção, responda
cada uma com o seu contexto real de trabalho, e defina o gatilho de reversão.

**Checagem.** (a) Por que `ReadWriteOnce` limita a alta disponibilidade que o topology
spread do marco 05 prometia? (b) Por que snapshot não é backup? (c) O que o Strimzi faz
num rolling restart que um StatefulSet cru não faria? (d) Você deletou o StatefulSet e
os dados continuam lá — bug ou feature?

## Principais aprendizados

- StatefulSet garante identidade, ordem e volume próprio — mecânica, não semântica; o
  operator é quem traz o conhecimento operacional.
- `reclaimPolicy: Delete` apaga o disco junto com o PVC, e `ReadWriteOnce` prende o pod a
  uma zona.
- Banco no cluster se decide por equipe, SLA e diferencial — se as três não forem
  favoráveis, use o gerenciado.
- PVC, snapshot e replicação não são backup: backup é cópia fora do domínio de falha,
  com restore testado e cronometrado.
