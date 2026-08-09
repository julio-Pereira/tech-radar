---
id: anatomia
title: "Anatomia: tópicos, partições, replicação e retenção"
summary: "Partição como unidade de ordem e de paralelismo, ISR e min.insync.replicas, compaction vs retenção por tempo, e por que Kafka é rápido sem mágica."
estimatedMinutes: 45
references:
  - title: "Apache Kafka — Replication"
    url: https://kafka.apache.org/documentation/#replication
  - title: "Apache Kafka — Log Compaction"
    url: https://kafka.apache.org/documentation/#compaction
  - title: "Apache Kafka — Topic Configs"
    url: https://kafka.apache.org/documentation/#topicconfigs
---

## A partição é a unidade de tudo

Um tópico não é nada — é um nome. A coisa real é a **partição**: um log ordenado,
imutável, com offsets crescentes, que vive num broker líder e é copiado para
seguidores.

E ela é a unidade de **duas** propriedades ao mesmo tempo, que é onde mora a tensão
central do dimensionamento:

- **Ordem.** Existe ordem *dentro* de uma partição. Não existe ordem entre partições.
  Ordem global, em Kafka, significa uma partição só — ou seja, um consumidor só.
- **Paralelismo.** Você escala consumindo com N consumidores em N partições. Mais
  partições, mais paralelismo possível.

Ou seja: **mais ordem custa menos paralelismo**. Todo desenho de tópico é essa
negociação, e ela se resolve na escolha da chave (marco 03) — a ordem que você quer
quase nunca é global, é *por entidade*.

## Réplicas, ISR e o botão que evita perder dinheiro

Cada partição tem um `replication.factor`. Uma réplica é **líder** (atende leitura e
escrita), as outras são seguidoras que copiam o log.

O **ISR** (*in-sync replicas*) é o subconjunto de réplicas que está suficientemente em
dia com o líder (`replica.lag.time.max.ms`). Só quem está no ISR pode virar líder numa
falha — e é aí que entra a configuração que separa um cluster de blog de um cluster de
fintech:

| Config | Onde vive | O que faz |
| --- | --- | --- |
| `replication.factor=3` | tópico | quantas cópias existem |
| `min.insync.replicas=2` | tópico/broker | quantas precisam confirmar para o `acks=all` ter sucesso |
| `acks=all` | **producer** | espera a confirmação do ISR inteiro |
| `unclean.leader.election.enable=false` | tópico/broker | proíbe réplica atrasada de virar líder |

`min.insync.replicas` **só tem efeito com `acks=all`**. Sem isso ele é decoração: o
producer com `acks=1` recebe sucesso assim que o líder grava, e se o líder morrer
antes de replicar, a mensagem simplesmente não existiu. Os dois botões são um par —
o marco 03 volta nisso do lado do producer.

O combo `RF=3` + `min.insync=2` tolera a perda de um broker sem parar a escrita e sem
perder mensagem confirmada. Com `RF=3` + `min.insync=3`, qualquer broker fora derruba
a produção — disponibilidade sacrificada sem ganho de durabilidade real.

**Unclean leader election** é a escolha explícita entre disponibilidade e corretude:
ligada, uma réplica atrasada pode virar líder e o log **trunca** — mensagens
confirmadas somem. Numa fintech isso fica desligado, e a resposta certa para "a
partição está offline" é consertar o broker, não aceitar perder registro financeiro.

## Retenção por tempo vs log compaction

Duas políticas, respondendo a duas perguntas diferentes:

- **`cleanup.policy=delete`** (padrão) — apaga segmentos mais velhos que
  `retention.ms` ou além de `retention.bytes`. É a política de um tópico de **eventos**:
  "o que aconteceu nos últimos 7 dias".
- **`cleanup.policy=compact`** — mantém, para cada chave, **pelo menos o último valor**.
  É a política de um tópico de **estado**: "qual o saldo atual de cada conta". Um
  registro com valor `null` (*tombstone*) marca a chave como deletada e some depois de
  `delete.retention.ms`.

Compaction não é "apagar o antigo agora": o compactador roda em background sobre
segmentos fechados, então o log tem uma cauda suja por um tempo. Consumidor que assume
"só existe um registro por chave" quebra.

O tombstone volta no marco 13 como uma das ferramentas — insuficiente sozinha — para
o direito ao esquecimento da LGPD.

## Por que é rápido: design, não mágica

Vale entender porque explica os limites:

- **I/O sequencial.** Append no fim de arquivo é a operação mais rápida que existe num
  disco, inclusive SSD. Kafka nunca busca no meio para escrever.
- **Page cache.** O broker não mantém cache próprio em heap; ele grava e lê via page
  cache do SO. Por isso a heap do broker é modesta e a RAM da máquina importa muito.
- **Zero-copy.** `sendfile` manda bytes do page cache direto para o socket, sem passar
  pelo processo Java.
- **Batching e compressão no producer.** O lote é comprimido uma vez e trafega e é
  armazenado comprimido, ponta a ponta.

Corolário prático: **consumidor lento é caro**. Quem lê o que acabou de ser escrito
lê da RAM; quem está 6 horas atrás força leitura de disco e envenena o page cache dos
outros. Lag não é só atraso — é degradação do cluster inteiro.

## Exemplo numa fintech

Retenção de evento financeiro entra em conflito direto com a LGPD, e o conflito
aparece já aqui: o regulador quer o rastro por anos, o titular pode pedir o
esquecimento. Guardar `payments.authorized` por 5 anos no broker é caro e é passivo
jurídico.

A composição usual: retenção curta no tópico quente (7–30 dias, o que o replay
operacional precisa), sink para storage frio com retenção regulatória (marco 11), e
minimização de PII no evento desde o design. Fica para o marco 13 o caso difícil —
apagar de verdade dentro de um log imutável.

## Hands-on

**Desafio — dimensionar `payments.initiated`.** O `pix-stream` precisa suportar
**2.000 TPS** de pico com ordem garantida **por conta** e tolerância à perda de um
broker sem parar a escrita. Entregue um documento de meia página com:

1. Número de partições, com a conta que justifica (throughput por partição medido, não
   chutado — use `kafka-producer-perf-test.sh` no seu Compose para ter um número real)
   e a folga de crescimento, lembrando que **aumentar partição depois quebra a ordem
   por chave**.
2. `replication.factor`, `min.insync.replicas` e o `acks` correspondente, com a
   frase que explica o que cada um protege.
3. `cleanup.policy` e `retention.ms`, com a justificativa de negócio.
4. A resposta para: *o que quebra se um cliente sozinho for 30% do volume?*

**Invariante testável.** Crie o tópico com `RF=3`/`min.insync=2` num Compose de 3
brokers, produza com `acks=all`, derrube um broker e prove que a produção **continua**;
derrube o segundo e prove que ela **para com erro** em vez de aceitar em silêncio.

**Checagem.** (a) Por que `min.insync.replicas=2` não protege nada se o producer usa
`acks=1`? (b) Um tópico compactado garante exatamente um registro por chave? (c) Qual
o efeito, no p99 dos *outros* consumidores, de um consumidor 6h atrasado?

## Principais aprendizados

- Partição é unidade de ordem **e** de paralelismo ao mesmo tempo: mais ordem custa
  menos paralelismo, e a chave é onde essa negociação se resolve.
- `acks=all` + `min.insync.replicas=2` + `RF=3` + unclean election desligada é o combo
  de durabilidade; qualquer peça sozinha é falsa segurança.
- `delete` é política de tópico de evento, `compact` de tópico de estado — e compaction
  é assíncrona, não uma garantia instantânea.
- A velocidade vem de I/O sequencial, page cache e zero-copy — por isso consumidor
  atrasado degrada o cluster inteiro, não só a si mesmo.
