# Projeto guia — pix-stream

> Componente do `fin-platform`, o sistema que atravessa as trilhas. Este arquivo não é
> um marco: é a especificação do projeto pessoal que você constrói enquanto lê a trilha.
> Os outros componentes são `pix-gateway` (spring-boot), `ledger-core` (go-fintech),
> `fin-flow` (arquitetura-eventos), `fin-watch` (observabilidade) e o repositório
> guarda-chuva `fin-platform` (kubernetes).

## O que você vai construir

O backbone de eventos de uma fintech de pagamentos: o `pix-gateway` inicia um pagamento,
publica o fato, o antifraude decide, o `ledger-core` lança em partida dobrada, e uma
projeção mantém o saldo por conta. Nada disso é exercício de laboratório — é o desenho
que quase toda fintech acaba tendo, e os problemas que você vai encontrar (duplicidade
sob `kill -9`, ordem por conta, schema que quebra o consumidor três semanas depois, DLQ
que ninguém olha) são os mesmos que aparecem em produção.

Você pode fazer esta trilha sem ter feito as vizinhas: o `pix-gateway` e o `ledger-core`
podem ser stubs de 50 linhas, desde que respeitem o **contrato** — um tópico, uma chave,
um schema. É o contrato que é o produto aqui, não o código dos vizinhos.

## Pré-requisitos

- Docker e Docker Compose (o cluster KRaft sobe em contêiner, sem ZooKeeper)
- JDK 21 ou Go 1.22+ — a escolha é sua; os exemplos da trilha usam os dois
- ~8 GB de RAM livres e ~10 GB de disco (o log cresce rápido quando você testa replay)
- `kcat` (antigo `kafkacat`) e os scripts `kafka-*.sh` da distribuição
- **Não precisa:** conta em cloud paga, Confluent Cloud, licença comercial. Schema
  Registry e Connect têm imagens open source suficientes para tudo aqui.

## Incrementos por marco

| Marco | Entrega | Como você prova que funciona |
| --- | --- | --- |
| 01 | Cluster KRaft de 1 nó no compose, repo criado | `kafka-metadata-quorum.sh --describe` mostra o controller |
| 02 | Tópicos `payments.initiated` / `.authorized` / `.dlq` com RF e partições justificados numa ADR | `kafka-topics.sh --describe` bate com a ADR |
| 03 | Producer do `pix-gateway` com `acks=all`, idempotência e chave = `accountId` | Teste que mata o broker no meio e não perde mensagem |
| 04 | Consumidor de antifraude em consumer group | Subir 2 réplicas e ver a divisão de partições no `--describe` do grupo |
| 05 | Commit de offset depois do efeito, com dedupe no destino | Teste com `kill -9` no consumidor: nenhum lançamento duplicado no ledger |
| 06 | Ordem por conta comprovada + rotina de replay | Replay de 1 dia produz saldo final idêntico ao original |
| 07 | Schema Registry + Avro, com compatibilidade `BACKWARD` | Consumidor da versão antiga continua lendo depois da evolução |
| 08 | Outbox relay no `pix-gateway`, retry escalonado e DLQ | Poison pill vai para a DLQ sem travar a partição |
| 09 | Projeção de saldo por conta com Kafka Streams | Saldo da projeção bate com a soma dos lançamentos do ledger |
| 10 | Fila de tarefas (geração de comprovante) fora do tópico particionado | Tarefa de 30s não bloqueia a fila de pagamentos |
| 11 | Sink JDBC com `insert.mode=upsert` para a base analítica | Replay não duplica linha no relatório |
| 12 | `broker.rack`, plano de DR e painel de lag do MirrorMaker | Derrubar um broker com produtor rodando e sobreviver |
| 13 | SASL + ACLs, `allow.everyone.if.no.acl.found=false`, crypto-shredding do CPF | Cliente sem ACL é negado; apagar a chave torna o histórico do titular ilegível |
| 14 | Alerta de lag por derivada e revisão de antipadrões | Alerta dispara na degradação e fica calado no pico de fim de mês |

## Definição de pronto (capstone)

- [ ] `docker compose up` sobe o cluster e os tópicos do zero, em máquina limpa
- [ ] Teste automatizado **prova** ausência de duplicidade sob `kill -9` do consumidor
- [ ] Replay de 1 dia de eventos produz saldo final idêntico ao anterior
- [ ] Evolução de schema entra sem quebrar o consumidor da versão anterior
- [ ] Apagar a chave de um titular torna o histórico daquele CPF ilegível, sem reescrever o log
- [ ] DLQ tem dono, alerta na primeira mensagem e caminho de reprocessamento testado
- [ ] Painel mostra lag **por partição** e tempo estimado de recuperação
- [ ] Uma ADR por bloco: RF e partições, semântica de entrega, contrato de schema, DR

## Game day

Provoque cada cenário e escreva um post-mortem de uma página — inclusive quando nada quebrar.

1. **Derrubar um broker** com o produtor rodando. O que acontece com `acks=all` e
   `min.insync.replicas=2`? E se você derrubar o segundo?
2. **Parar o consumidor por 30 minutos** durante carga. Quanto lag acumula, quanto tempo
   leva para zerar, e o seu alerta disse a verdade?
3. **Injetar uma poison pill** (mensagem com schema inválido) no tópico de pagamentos.
   Ela para a partição ou vai para a DLQ?
4. **Reprocessar do offset zero** com o consumidor idempotente. O saldo final muda?
   Se mudar, a idempotência é ilusão.
5. **Encher o disco do broker** limitando o volume. Você descobre pelo alerta ou pelo
   pagamento que parou?
