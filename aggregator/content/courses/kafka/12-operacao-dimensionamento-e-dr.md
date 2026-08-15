---
id: operacao-e-dr
title: "Operação, dimensionamento e DR"
summary: "Por que aumentar partição é fácil e diminuir não, tiered storage resolvendo o conflito de retenção, e o failover que precisa levar os offsets junto."
estimatedMinutes: 50
references:
  - title: "Apache Kafka — Operations"
    url: https://kafka.apache.org/documentation/#operations
  - title: "Apache Kafka — Tiered Storage"
    url: https://kafka.apache.org/documentation/#tiered_storage
  - title: "Apache Kafka — MirrorMaker 2"
    url: https://kafka.apache.org/documentation/#georeplication
  - title: "Strimzi — Kafka on Kubernetes"
    url: https://strimzi.io/documentation/
---

## Dimensionar: a assimetria das partições

Partição é a única decisão de dimensionamento que é **difícil de desfazer**.

Aumentar é uma chamada de API. Mas, como o marco 06 mostrou, o `hash(chave) % nº de
partições` muda e a ordem por chave quebra — então aumentar num tópico com ordem é uma
migração, não uma operação de escala.

**Diminuir é impossível.** Não existe comando. O caminho é criar um tópico novo, migrar
produtores e consumidores e apagar o antigo — com toda a coordenação que isso implica.

Daí o método: meça o throughput real por partição no seu hardware
(`kafka-producer-perf-test.sh`), calcule quantas você precisa hoje, e **dimensione com
folga para o crescimento previsto**, sem exagerar. Partição demais também custa: mais
arquivos abertos, mais requisições de replicação, rebalance mais lento, mais latência de
metadados.

Duas outras decisões estruturais:

- **Rack awareness** (`broker.rack`) — o Kafka distribui as réplicas entre racks/AZs, o
  que faz a perda de uma zona não levar todas as réplicas de uma partição. Sem isso, `RF=3`
  pode ter as três réplicas na mesma zona, e a durabilidade que você acha que tem não
  existe.
- **Quotas por cliente** (`client.id`/principal) — limite de banda de produção e consumo.
  É o que impede um consumidor com replay de 30 dias de saturar a rede do cluster e
  degradar o caminho do dinheiro. Numa fintech multi-time, quota não é opcional.

## Tiered storage

O conflito do marco 02 — o regulador quer anos, o disco do broker é caro — tem uma
resposta que amadureceu na série 4.x: **tiered storage**.

Os segmentos quentes ficam no disco local; os antigos são movidos para object storage
(S3/GCS) e continuam **acessíveis pelo mesmo consumidor**, com a mesma API. O consumidor
não sabe de onde o dado veio; só percebe latência maior ao ler o passado distante.

Duas consequências operacionais boas:

- Retenção longa deixa de exigir disco caro no broker.
- **Rebalanceamento e expansão ficam muito mais rápidos**, porque só o dado quente precisa
  ser copiado entre brokers. Adicionar um broker num cluster com dezenas de TB deixa de
  ser uma operação de dias.

Não substitui o sink para data lake (marco 11): o storage frio do Kafka continua sendo
Kafka, com o formato e a semântica do Kafka. Para análise em SQL e para retenção
regulatória com imutabilidade, o Parquet no data lake continua sendo o destino.

## Manutenção sem downtime

**Reassignment de partições** move réplicas entre brokers
(`kafka-reassign-partitions.sh`). É a operação que você faz ao adicionar broker, e ela
consome rede — use `--throttle`, sempre. Reassignment sem throttle durante o horário de
pico é um incidente autoinfligido clássico.

**Cruise Control** automatiza isso: monitora a distribuição de carga e propõe (ou executa)
rebalanceamentos para equilibrar. Em cluster grande, deixa de ser conveniência.

**Cordoning de broker** (série 4.3) permite marcar um broker para não receber novas
partições líderes — o equivalente ao `cordon` de nó do Kubernetes. É o que torna a
manutenção planejada limpa: você drena a liderança antes de reiniciar, em vez de deixar
o cluster reagir à queda.

**Rolling upgrade** é broker a broker, esperando o **ISR se recompor** entre um e outro.
O erro clássico é não esperar: reiniciar o segundo broker enquanto o primeiro ainda está
sincronizando derruba a partição abaixo do `min.insync.replicas` e a produção para. O
Strimzi faz essa verificação por você (marco 08 da trilha Kubernetes) — e é o principal
argumento a favor do operator.

## DR: o failover que quase ninguém testa

**MirrorMaker 2** replica tópicos entre clusters, tipicamente em modo ativo-passivo. Ele
copia mensagens, configurações de tópico e ACLs.

E aqui está a parte que separa um plano de DR real de um slide: **replicar mensagens não
é suficiente**. O consumidor que faz failover precisa saber **onde parar de ler** no
cluster de destino, e os offsets **não são iguais** entre clusters — a mesma mensagem pode
estar no offset 1.000 na origem e 987 no destino, porque a replicação começou depois.

O MirrorMaker 2 mantém um mapeamento (`RemoteClusterUtils` / checkpoints de offset) que
traduz de um para o outro. Se o seu plano de failover não usa esse mapeamento, o resultado
é reprocessar horas de eventos ou pular horas — e num ledger, os dois são incidentes.

Os números a definir com o negócio:

- **RPO** — quanto dado você aceita perder. Com replicação assíncrona, é o lag do
  MirrorMaker no momento da queda. Meça-o continuamente; ele é o seu RPO real, não o
  contratado.
- **RTO** — quanto tempo até estar operando no destino. Inclui redirecionar produtores e
  consumidores, o que raramente é automático.

E o backup: no Kafka, o que importa preservar é a **configuração** (tópicos, ACLs, quotas,
schemas do Registry) tanto quanto o dado. Config vive em Git (é o mesmo argumento GitOps
do marco 13 da trilha Kubernetes); os schemas do Schema Registry precisam de backup
próprio — perder o Registry torna ilegível todo o dado Avro do cluster.

## Exemplo numa fintech

Janela de indisponibilidade contratada e plano de continuidade são exigências do
regulador, não boas práticas. O que isso significa concretamente para o `pix-stream`:

- **Rolling upgrade ensaiado** em homologação antes de produção, com produtor rodando e
  medição de zero perda.
- **RPO medido**: o lag do MirrorMaker em painel, com alerta — porque o RPO real é esse
  número, não o do documento.
- **Failover testado**, incluindo a tradução de offsets. Um exercício por trimestre, com
  o tempo cronometrado.
- **Quotas** por time, para que o replay de um squad não afete a liquidação.
- **Backup do Schema Registry** junto com o do cluster.

## Hands-on

**Tutorial — rolling restart sem perder mensagem.**

1. Cluster de 3 brokers no Compose (ou Strimzi no `kind`), tópico com `RF=3` e
   `min.insync.replicas=2`.
2. Produtor contínuo com `acks=all`, contando sucessos e falhas.
3. Reinicie os brokers **um a um**, esperando o ISR se recompor entre eles
   (`kafka-topics.sh --describe` mostra o ISR).
4. **Invariante:** zero falha no produtor e zero mensagem perdida — conte na origem e no
   destino.
5. **Agora o contraexemplo:** reinicie dois brokers em sequência **sem** esperar o ISR.
   Registre o que acontece com o produtor. É o erro que o operator existe para evitar.
6. `git commit` do runbook com os comandos e a verificação.

**Desafio — dimensionar e provar o throttle.**

1. Meça o throughput real de uma partição no seu ambiente com
   `kafka-producer-perf-test.sh`. Documente o número.
2. Adicione um broker ao cluster e faça o reassignment **sem** `--throttle`, com o
   produtor rodando. Meça o p99 do produtor durante a operação.
3. Refaça com `--throttle` dimensionado. Compare os dois p99.
4. Escreva 5 linhas no runbook sobre qual throttle usar e em qual janela.

**Complemento — o failover honesto.** Suba um segundo cluster e um MirrorMaker 2.
Produza 10.000 mensagens, consuma metade com um grupo, e simule a queda da origem.

**Invariantes testáveis:** ao subir o consumidor no cluster de destino usando o
mapeamento de offsets, ele processa **exatamente** as 5.000 restantes — nem reprocessa as
5.000 já feitas, nem pula nenhuma. Depois repita **ignorando** o mapeamento e registre
quantas foram reprocessadas ou perdidas. Essa diferença é o marco.

**Checagem.** (a) Por que diminuir o número de partições não tem comando? (b) O que
`broker.rack` protege que `RF=3` sozinho não protege? (c) Por que os offsets diferem entre
o cluster de origem e o de destino? (d) Qual é o seu RPO real numa replicação assíncrona?

## Principais aprendizados

- Aumentar partição quebra a ordem por chave e diminuir é impossível: dimensione com folga
  medida, não chutada.
- Rack awareness e quotas são o que fazem `RF=3` e o multi-tenancy significarem algo de
  verdade.
- Tiered storage resolve retenção longa e acelera expansão, sem substituir o sink para o
  data lake.
- Rolling upgrade espera o ISR entre brokers; e o failover de DR precisa traduzir offsets,
  senão reprocessa ou pula horas de eventos.
