---
id: dados-gerenciados-rds-aurora-dynamodb
title: "Dados gerenciados: RDS, Aurora e DynamoDB"
summary: "Banco gerenciado tira a operação, não a decisão: failover, capacidade e custo continuam sendo seus. RDS × Aurora, Multi-AZ × réplica de leitura, failover de 60 a 120 s no Multi-AZ de instância e abaixo de 35 s no de cluster, o pool que precisa se recuperar sozinho (medido), DynamoDB na operação — escrita condicional (50 concorrentes, 1 item) e transação de até 100 ações, tudo ou nada (medido) — e o plano que exige criptografia, PITR e proteção contra exclusão."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [dados, confiabilidade]
references:
  - title: "Amazon RDS — Failing over a Multi-AZ DB instance"
    url: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html
  - title: "Amazon RDS — Failing over a Multi-AZ DB cluster"
    url: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts-failover.html
  - title: "Amazon DynamoDB — Transactions: how it works"
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
  - title: "Amazon DynamoDB — Constraints"
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html
---

## O que o gerenciado tira, e o que deixa

Um banco gerenciado tira de você a instalação, o *patch*, o *backup* e a troca de disco. Ele **não** tira
três decisões:

- **o que acontece no *failover***, e como a aplicação sobrevive a ele;
- **quanta capacidade** o banco tem, e quem paga pelo pico;
- **quanto custa**, por instância, por armazenamento, por E/S e por réplica.

O modelo de dados está nas trilhas neutras:

- Postgres em escala: `dados-distribuidos/07`;
- modelagem por acesso, no estilo Dynamo: `dados-distribuidos/18`.

Este marco trata da operação na AWS.

## RDS × Aurora

| | RDS (Postgres, MySQL...) | Aurora (compatível com Postgres ou MySQL) |
| --- | --- | --- |
| Armazenamento | volume EBS da instância | volume distribuído entre três AZs, compartilhado pelas réplicas |
| Réplicas | réplicas de leitura com replicação assíncrona | réplicas no mesmo volume, com atraso baixo |
| *Failover* | para a *standby* (Multi-AZ) | para uma réplica do *cluster* |
| Custo | instância + armazenamento | instância + armazenamento + E/S (ou o modo de E/S otimizada) |

**Multi-AZ não é réplica de leitura.** No RDS, o **Multi-AZ de instância** mantém uma *standby* síncrona em
outra AZ, que **não atende leitura**: ela existe para o *failover*. A **réplica de leitura** é assíncrona e
atende leitura, mas pode estar atrasada. O **Multi-AZ de *cluster*** tem duas *standby* que também atendem
leitura. Os tempos de *failover* da documentação, conferidos em 10 nov 2026:

- **de 60 a 120 s** no Multi-AZ de instância (mais, com transações grandes ou recuperação longa);
- **abaixo de 35 s** no Multi-AZ de *cluster*.

## O *failover* do lado da aplicação

No *failover*, o *endpoint* DNS do banco passa a apontar para a nova primária. A aplicação vê três
coisas:

- as conexões abertas morrem;
- as novas resolvem o DNS de novo;
- a transação em andamento falha e precisa de nova tentativa.

Um ***pool* que segura conexões mortas** entrega uma conexão inútil ao próximo pedido. Medido no
laboratório (Postgres reiniciado com o *pool* aberto, 20 gravações depois da volta):

| *Pool* | Gravações que falharam | Confirmadas que se perderam |
| --- | ---: | ---: |
| sem verificação de conexão | 4 (uma por conexão morta no *pool*) | 0 |
| com verificação antes de entregar | 1 | 0 |

O *pool* se recuperou sem reiniciar a aplicação, e nenhuma transação confirmada se perdeu. Mas a falha
existiu, e o código precisa de *retry* com idempotência para a operação que pegou a conexão morta. O
**RDS Proxy** fica entre a aplicação e o banco, segura as conexões dos clientes durante o *failover* e
encurta o tempo que a aplicação vê. O dimensionamento do *pool* segue `concorrencia-e-recursos/07`.

**Backup e PITR.** O RDS e o Aurora fazem *backup* automático, com **recuperação a um instante**
(*point-in-time recovery*, PITR) dentro da janela de retenção. Restaurar cria uma **instância nova**, não
volta a atual. O RPO, o RTO e o teste de restauração estão em `dados-distribuidos/12`. O cache gerenciado
(ElastiCache, MemoryDB) segue os padrões de `dados-distribuidos/09`.

## DynamoDB na operação

**Sob demanda × provisionado.** No **sob demanda**, você paga por requisição, e a tabela absorve picos sem
planejamento. No **provisionado**, você declara unidades de leitura e escrita (com *auto scaling*), e é mais
barato para carga previsível. Uma tabela nova ou com carga incerta começa sob demanda.

**Partição quente.** O DynamoDB distribui os itens em partições pela chave de partição. Uma chave que
concentra o tráfego, como "todos os lançamentos do dia numa chave `2026-11-10`", estrangula a partição, por
mais capacidade que a tabela tenha. O desenho da chave é o de `dados-distribuidos/18`.

**Escrita condicional.** A idempotência no DynamoDB é uma escrita com `ConditionExpression`. Medido no
DynamoDB Local 3.3.2: 50 gravações concorrentes da mesma chave de idempotência, com
`attribute_not_exists(chave)`, deram **1 sucesso e 49 `ConditionalCheckFailedException`**, e a tabela ficou
com 1 item.

**Transações.** O `TransactWriteItems` agrupa até **100 ações**, até **4 MB** no total, sem duas ações no
mesmo item, e é **tudo ou nada**. Cada escrita transacional custa o **dobro** de uma escrita comum, e a
capacidade é consumida mesmo quando a transação é cancelada. Medido: débito de saldo e registro de
idempotência na mesma transação.

- A repetição com a mesma chave foi cancelada com `ConditionalCheckFailed` no registro.
- O débito sem saldo foi cancelado com `ConditionalCheckFailed` no saldo.
- Nos dois casos, a outra metade não foi aplicada: o saldo ficou em 70 e a segunda chave não foi gravada.

**Outros recursos e limites:**

- o **item tem no máximo 400 KB**, contando os nomes dos atributos;
- o **TTL** apaga itens vencidos sem custo de escrita;
- os ***streams*** levam as mudanças a um consumidor (marco 06);
- as **GSI** (índices secundários globais) custam escrita a mais e são eventualmente consistentes.

***Global tables*.** Replicam a tabela entre regiões, com escrita em todas. No modo padrão, de
consistência eventual, duas escritas no mesmo item em regiões diferentes se resolvem pela **última escrita
que vence**. Para um saldo, isso perde dinheiro. Desde jun 2025 existe o modo de **consistência forte
multirregião** (MRSC), conferido em 10 nov 2026: exige exatamente três regiões (três réplicas, ou duas e uma
testemunha) e **não aceita transações** nem TTL. Para o saldo do ledger, que depende de
`TransactWriteItems`, a saída continua sendo uma região dona das escritas de cada conta (marco 10).

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Azure Database for PostgreSQL (flexível, com HA) | RDS Multi-AZ ou Aurora | o Aurora separa computação de armazenamento distribuído; o *failover* e o custo de E/S mudam |
| Cosmos DB | DynamoDB (aproximação) | o Cosmos tem cinco níveis de consistência e várias APIs; o DynamoDB tem leitura eventual ou forte por chamada e só o modelo dele. O custo é por unidade de requisição, com outra conta (`dados-distribuidos/16`) |
| Azure Cache for Redis | ElastiCache ou MemoryDB | o MemoryDB é durável, o ElastiCache é cache |

> **O que o emulador não reproduz.** O DynamoDB Local não reproduz particionamento, partição quente, limites
> de vazão, estrangulamento nem *global tables*. Ele prova a semântica de escrita condicional e de
> transação. O Postgres no Docker, reiniciado, simula a queda de conexões, não o DNS nem o tempo de um
> *failover* real.

## Exemplo numa fintech

O índice de idempotência do Pix ficava no DynamoDB, com a chave de partição igual ao dia da operação, para
facilitar o relatório diário. Num dia de pico, todos os pagamentos gravavam na mesma partição, e o DynamoDB
estrangulou as escritas com a tabela longe da capacidade contratada. O `pix-gateway` passou a recusar
pagamentos. A chave mudou para o identificador fim a ponta do Pix. O relatório diário passou a ser um índice
secundário, alimentado em segundo plano.

## Hands-on

**Tutorial.** Suba o DynamoDB Local no `lab/` e escreva o adaptador do índice de idempotência do
`ledger-core` em Go (AWS SDK for Go v2, `service/dynamodb` 1.73.2), com o *endpoint* vindo da configuração.

**Desafio.** Idempotência e saldo com escrita condicional, e o banco relacional que sobrevive ao *failover*.

**Invariantes testáveis**

1. **Uma chave, um item.** Com 50 escritas concorrentes da mesma chave de idempotência, exatamente uma
   passa e as outras recebem `ConditionalCheckFailedException`.
2. **Tudo ou nada.** O débito e o registro de idempotência vão na mesma transação. Com a falha injetada
   (chave repetida ou saldo insuficiente), nenhuma das duas metades é aplicada.
3. ***Failover* sem perda.** Com o Postgres do *compose* derrubado e reerguido durante uma carga, o *pool*
   do `pix-gateway` se recupera sem reiniciar o serviço, e toda transação confirmada antes da queda está no
   banco depois.
4. **O plano protege a produção.** Toda tabela DynamoDB e toda instância RDS de produção têm criptografia
   com chave KMS (marco 08), PITR ligado e proteção contra exclusão. A política sobre o plano reprova a
   *fixture* sem um dos três.

**Complemento.** Com uma conta real e orçamento criado antes, crie uma instância RDS Multi-AZ pequena, force
um *failover* (`reboot` com *failover*) com o serviço gravando, e meça quanto tempo a aplicação ficou sem
conseguir gravar. Destrua tudo no fim.

**Checagem**

1. Qual é a diferença entre Multi-AZ e réplica de leitura?
2. O que a aplicação precisa fazer para sobreviver a um *failover*?
3. Por que uma chave de partição pode estrangular uma tabela com capacidade sobrando?
4. Por que *global tables* não servem para o saldo do ledger sem uma região dona da escrita, mesmo com o
   modo MRSC?

## Principais aprendizados

- O gerenciado tira a operação; *failover*, capacidade e custo continuam sendo seus.
- Multi-AZ é para *failover*, réplica é para leitura. *Failover* de 60 a 120 s (instância) ou abaixo de
  35 s (*cluster* Multi-AZ).
- O *pool* precisa se recuperar sozinho, e a operação que pegou a conexão morta precisa de *retry*
  idempotente.
- No DynamoDB, idempotência é escrita condicional. Transação de até 100 ações, tudo ou nada, custando o
  dobro.
- A chave de partição decide a vazão. *Global tables* resolvem conflito pela última escrita; o modo MRSC
  é forte, mas sem transações.
- Criptografia, PITR e proteção contra exclusão, provadas sobre o plano.
