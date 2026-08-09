---
id: log-distribuido
title: "Kafka é um log distribuído (e por que isso muda tudo)"
summary: "A diferença entre log append-only e fila tradicional, o que o KRaft mudou na operação, e os casos em que Kafka é a ferramenta errada."
estimatedMinutes: 40
references:
  - title: "Apache Kafka — Design"
    url: https://kafka.apache.org/documentation/#design
  - title: "KRaft — Apache Kafka Without ZooKeeper"
    url: https://kafka.apache.org/documentation/#kraft
  - title: "Apache Kafka 4.0 Release Announcement"
    url: https://kafka.apache.org/blog
---

## Fila apaga, log não

A intuição que quase todo mundo traz de RabbitMQ, SQS ou JMS é: a mensagem entra na
fila, um consumidor pega, a mensagem **some**. O broker é dono do estado de consumo.

Kafka inverte isso. O tópico é um **log append-only** particionado: a mensagem é
escrita no fim do arquivo e fica lá até a retenção expirar — leitura não apaga nada.
Quem guarda a posição é o **consumidor**, num offset. Três consequências caem direto
disso, e são a razão de existir da ferramenta:

- **Replay.** Se o processador tinha um bug, você reposiciona o offset e reprocessa.
  Numa fila tradicional, aquela mensagem já não existe mais.
- **Múltiplos consumidores independentes.** O antifraude, o ledger e o data lake leem
  o mesmo `payments.initiated` sem saber um do outro, cada um no seu ritmo.
- **Auditoria natural.** O log *é* o histórico ordenado do que aconteceu, não uma
  reconstrução a partir de tabelas mutáveis.

O preço: você herda a responsabilidade pelo offset. Um commit no lugar errado vira
duplicidade ou perda — e é exatamente por isso que o Bloco B desta trilha existe.

## `pix-stream`: o produto que a trilha constrói

Todo marco entrega um incremento verificável no **`pix-stream`**, o backbone de
eventos que liga o `pix-gateway` (trilha Spring Boot) ao ledger/antifraude (trilha Go).
Você não precisa ter feito as outras trilhas: cada componente vizinho tem um stub no
`docker-compose`. O que atravessa as trilhas é o **contrato** — um tópico, um schema —
nunca o código.

O estado inicial é um cluster local de um broker e um tópico. No fim da trilha ele
tem Schema Registry, DLQ, mTLS, ACLs e um painel de lag.

## KRaft: o Kafka sem ZooKeeper

Até a série 3.x, o Kafka guardava metadados (quais tópicos existem, quem é líder de
qual partição, ACLs) num ZooKeeper à parte — outro sistema distribuído para instalar,
monitorar, versionar e acordar de madrugada.

O **KRaft** move esses metadados para dentro do próprio Kafka: um grupo de nós
**controllers** mantém um log de metadados replicado por Raft, e os brokers consomem
esse log. Como o ZooKeeper foi **removido** na série 4.x, esta trilha só usa KRaft —
o resto do conteúdo nem menciona ZooKeeper.

O que isso mudou na prática:

- **Um sistema a menos.** Mesmo binário, mesmo formato de log, mesma ferramenta de
  observação.
- **Failover de controller mais rápido**, porque o novo líder já tem o log de
  metadados em memória em vez de precisar lê-lo do ZooKeeper.
- **Mais partições por cluster** sem a propagação de metadados virar gargalo.
- Um nó pode ser `controller`, `broker` ou os dois (`combined`) — combinado é ótimo
  para o seu `kind`/Compose local e desaconselhado em produção.

Migração de cluster 3.x com ZooKeeper para KRaft existe e é documentada, mas é
operação, não conteúdo de trilha: se você mantém um cluster legado, o caminho é
`kafka.apache.org/documentation/#kraft` e uma janela de manutenção.

## Quando Kafka é a ferramenta errada

Metade dos incidentes de Kafka em fintech nasce de usá-lo onde não cabia:

- **RPC síncrono disfarçado.** Se o produtor publica e fica esperando a resposta num
  tópico de retorno para responder ao cliente HTTP, você construiu um RPC caro e
  frágil. Chame a API.
- **Fila de tarefas simples.** Enviar comprovante por e-mail não precisa de ordem nem
  de replay. Uma fila com ack individual (SQS, ou share groups — marco 10) resolve com
  menos operação.
- **Banco de dados.** Kafka não tem consulta por chave arbitrária, nem índice
  secundário, nem update. "Guardar o estado atual no tópico compactado e ler de lá" é
  um antipadrão que volta como incidente no marco 14.

A pergunta honesta: *eu preciso que mais de um consumidor leia isso, em ordem, e possa
reler amanhã?* Se as três não forem verdade, provavelmente não é Kafka.

## Exemplo numa fintech

Um ledger que recebe eventos de movimentação de um log imutável ganha de graça o que
o auditor pede: a sequência exata de intenções, com timestamp e sem sobrescrita. É
event sourcing "light" — você não precisa reconstruir todo o estado a partir de
eventos, mas tem o rastro para provar como chegou nele.

O contraste com a tabela `transacoes` mutável é o argumento inteiro: um `UPDATE`
apaga a história; um evento a preserva.

## Hands-on

**Tutorial — o estado inicial do `pix-stream`.** Suba um cluster KRaft de nó único com
a imagem oficial `apache/kafka` num `docker-compose.yml` (modo `combined`: o mesmo
processo é controller e broker). Depois:

1. `kafka-topics.sh --create --topic payments.initiated --partitions 3` e leia o
   `--describe`: anote quem é líder de cada partição.
2. Produza três mensagens pelo `kafka-console-producer.sh`.
3. Consuma com `kafka-console-consumer.sh --from-beginning` e **rode de novo**. As
   mensagens continuam lá — esse é o ponto do marco inteiro.
4. Consuma agora com `--group teste` duas vezes seguidas. Na segunda, nada aparece.
   Explique por escrito, em duas linhas, por que o comportamento mudou.
5. `git commit` do `docker-compose.yml` e do README com os comandos.

**Checagem.** (a) Onde ficou guardada a posição de leitura no passo 4, e em que
tópico? (b) O que acontece com as mensagens quando o consumidor do grupo `teste` é
deletado? (c) Cite um caso do seu trabalho atual que *não* deveria virar tópico.

## Principais aprendizados

- O log não apaga na leitura: replay, múltiplos consumidores e auditoria vêm daí — e
  a responsabilidade pelo offset também.
- KRaft removeu o ZooKeeper de vez na série 4.x; um sistema a menos e failover de
  metadados mais rápido.
- Kafka é a resposta errada para RPC disfarçado, fila de tarefas simples e banco de
  dados — as três aparecem de novo como antipadrões no marco 14.
