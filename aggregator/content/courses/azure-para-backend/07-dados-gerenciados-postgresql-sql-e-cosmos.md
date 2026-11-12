---
id: dados-gerenciados-postgresql-sql-e-cosmos
title: "Dados gerenciados: PostgreSQL, Azure SQL e Cosmos DB"
summary: "Banco gerenciado tira a operação, não a decisão: alta disponibilidade, capacidade, consistência e custo continuam sendo seus. Postgres Flexible Server com HA por zona (failover de 60 a 120 s), PgBouncer embutido, PITR de 7 a 35 dias e o backup geográfico que leva o dado para o South Central US; Cosmos DB com RU, partição de 20 GB e 10.000 RU/s, transactional batch e backup contínuo — com a chave de partição analisada sobre um dia sintético: a data concentrou 100% das escritas."
estimatedMinutes: 60
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [dados, confiabilidade]
references:
  - title: "Azure Database for PostgreSQL — High availability"
    url: https://learn.microsoft.com/azure/postgresql/high-availability/concepts-high-availability
  - title: "Azure Database for PostgreSQL — Backup and restore"
    url: https://learn.microsoft.com/azure/postgresql/backup-restore/concepts-backup-restore
  - title: "Azure Cosmos DB — Service quotas and default limits"
    url: https://learn.microsoft.com/azure/cosmos-db/concepts-limits
  - title: "Azure Cosmos DB — Transactional batch operations"
    url: https://learn.microsoft.com/azure/cosmos-db/transactional-batch
---

## O que o gerenciado tira, e o que deixa

O Azure tira de você a instalação, o *patch* e o *backup* do banco. Ele não tira a decisão de alta
disponibilidade, de capacidade, de consistência nem de custo. O modelo de dados está nas trilhas neutras: o
Postgres em escala em `dados-distribuidos/07`, a modelagem por acesso em `dados-distribuidos/18` e a consistência
em `dados-distribuidos/16`. Este marco é a operação no Azure.

## Postgres Flexible Server

O **Azure Database for PostgreSQL – Flexible Server** é o Postgres gerenciado. Conferido em 12 nov 2026:

**Alta disponibilidade.** Com HA, o servidor tem uma ***standby*** síncrona:

- ***zone-redundant***: a *standby* em outra zona. O *failover* leva **de 60 a 120 segundos**, sem perda de dado, e
  pode passar disso conforme a carga. SLA de 99,99%;
- ***same-zone***: a *standby* na mesma zona. Protege da falha de servidor, não da falha da zona. SLA de 99,95%.

A *standby* não atende leitura. Para leitura há as **réplicas de leitura**, assíncronas.

**PgBouncer embutido.** O servidor traz um PgBouncer na **porta 6432**, com o mesmo nome de *host*, ligado por um
parâmetro. Ele não existe no tier Burstable. Depois de um *failover* de HA, o PgBouncer também reinicia, e as
conexões precisam ser refeitas. O *pool* do lado da aplicação precisa se recuperar sozinho, como o de
`aws-para-backend/07`, medido lá: sem verificação de conexão, 4 falhas; com verificação, 1; nenhuma transação
confirmada perdida.

***Backup* e PITR.** O *backup* é automático, com **recuperação a um instante** dentro de uma retenção **de 7 (o
padrão) a 35 dias**. Restaurar cria um servidor novo.

**O *backup* geográfico e a residência.** O *backup* com redundância geográfica é replicado para o **par de
regiões**, e só se liga na criação do servidor. O *geo-restore* tem RPO de até cerca de uma hora e não é *failover*
automático. Para um servidor no Brazil South, o par é o **South Central US** (marco 01): o *backup* geográfico leva
o dado do ledger **para fora do país**. Isso exige uma ADR de residência, com base legal, ou fica desligado.

**Autenticação pelo Entra ID.** O servidor aceita a identidade da aplicação (marco 02) no lugar da senha. Com a
senha desligada, não há segredo de banco para vazar nem para rotacionar.

## Azure SQL em uma página

O **Azure SQL Database** é o SQL Server gerenciado. Os ***failover groups*** mantêm uma réplica em outra região,
com um nome de leitura e escrita que acompanha o *failover*. O **Hyperscale** separa a computação do
armazenamento, para bancos grandes. Para o `fin-platform`, que é Postgres, ele fica como referência; a decisão de
residência é a mesma.

## Cosmos DB na operação

**RU.** Toda operação no Cosmos custa ***request units***: a leitura de um item pequeno pela chave é barata; a
consulta que varre partições é cara. A capacidade é **provisionada** (RU/s fixas), ***autoscale*** (entre 10% e
100% do teto) ou ***serverless*** (por consumo).

**Partição.** A **chave de partição** distribui os itens em partições lógicas, e elas, em partições físicas.
Conferido em 12 nov 2026: até **20 GB por partição lógica** e até **10.000 RU/s por partição**. Uma chave que
concentra o tráfego estrangula a partição, qualquer que seja o total contratado. As ***hierarchical partition
keys*** (até três níveis, como `/conta/mes/id`) passam dos 20 GB no primeiro nível; as operações transacionais
exigem o caminho completo da chave.

**Escrita condicional e *batch*.** A idempotência no Cosmos é um `create` que falha com 409 quando o item existe,
ou um `replace` com ETag que falha com 412 se alguém mudou o item. O ***transactional batch*** agrupa até **100
operações** e **2 MB**, **na mesma chave de partição**, e é tudo ou nada.

**Consistência.** São cinco níveis: *strong*, *bounded staleness*, *session* (o padrão mais usado), *consistent
prefix* e *eventual*. O nível mais forte custa mais RU por leitura e mais latência. A teoria está em
`dados-distribuidos/16`.

**Escrita em várias regiões.** Com *multi-region writes*, o conflito se resolve, por padrão, pela **última escrita
que vence** (o `_ts`, ou um campo numérico seu), ou por um procedimento de *merge* seu. Para um saldo, a última
escrita que vence perde dinheiro, como nas *global tables* do marco gêmeo da AWS. O saldo do ledger fica numa
região dona da escrita.

**Os outros recursos:**

- o ***change feed*** leva as mudanças a um consumidor;
- o TTL apaga itens vencidos;
- o ***backup* contínuo** dá recuperação a um instante, com três *tiers* de retenção (7, 30 e 35 dias) e
  restauração para uma conta nova.

O **Azure Managed Redis** é o sucessor do Azure Cache for Redis, que se aposenta (Enterprise em mar 2027; Basic,
Standard e Premium em set 2028). O *cache* segue os padrões de `dados-distribuidos/09`.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| RDS Multi-AZ / Aurora | Postgres Flexible Server com HA *zone-redundant* | *failover* de 60 a 120 s; a *standby* não lê |
| RDS Proxy | PgBouncer embutido (porta 6432) | já vem no servidor, e reinicia no *failover* |
| *backup* entre regiões | *backup* geográfico para o par | o par do Brazil South fica nos Estados Unidos |
| DynamoDB | Cosmos DB (aproximação) | RU no lugar de WCU/RCU; cinco níveis de consistência contra dois; *batch* só na mesma chave de partição |
| *global tables* | *multi-region writes* | a última escrita vence por padrão; há o *merge* customizado |
| ElastiCache | Azure Managed Redis | o Azure Cache for Redis se aposenta |

O marco gêmeo é `aws-para-backend/07`.

> **Armadilha.** Escolher a chave de partição do Cosmos pelo identificador "natural", como a data, e concentrar
> toda a escrita do dia numa partição. O Cosmos estrangula com 429 com a conta longe da capacidade total.

> **O que o emulador não reproduz.** O emulador do Cosmos DB (*vNext*) só fala a API NoSQL no modo *gateway*, não
> cobra RU, não particiona fisicamente e não tem multi-região. Ele prova a semântica: escrita condicional, ETag e
> *batch*. O Postgres no Docker simula a queda de conexões, não o *failover* de HA nem o reinício do PgBouncer.

## Exemplo numa fintech

O índice de idempotência do Pix foi para o Cosmos com a chave de partição igual ao dia, para facilitar o relatório.
No primeiro dia de pico, todas as escritas caíram na mesma partição lógica, o Cosmos devolveu 429 com a conta usando
uma fração das RU/s contratadas, e o `pix-gateway` passou a recusar pagamentos. A correção:

- a chave passou a ser o identificador fim a ponta do Pix;
- o relatório por dia passou a vir do *change feed*, para um contêiner próprio;
- a análise da chave sobre a distribuição real entrou na revisão de todo contêiner novo.

## Hands-on

**Tutorial.** Suba o emulador do Cosmos DB no `lab/` e escreva o adaptador do índice de idempotência do
`ledger-core` em Go (`azcosmos` 1.5.0), com o *endpoint* vindo da configuração.

**Desafio.** Idempotência, saldo e capacidade, e as regras sobre o código em `politicas/dados.rego`.

**Invariantes testáveis**

1. **Uma chave, um item.** Medido no emulador (Fase 0): 50 `create_item` concorrentes da mesma chave deram **1
   sucesso e 49 com 409**, e o `replace` com ETag velho deu 412.
2. **Tudo ou nada.** O débito do saldo e o registro de idempotência vão no mesmo *transactional batch*, na mesma
   chave de partição. Medido: o *batch* com um `create` duplicado falhou inteiro, e o saldo não mudou.
3. **A chave de partição aguenta.** Um *script* sobre um dia sintético de 500 mil escritas (30% concentradas em 200
   contas PJ) mede a partição lógica mais quente por chave. Medido:
   - **data:** 1 valor, **100%** das escritas numa partição;
   - **conta:** a mais quente com 0,165%;
   - **identificador fim a ponta:** nenhuma acima de 0,001%.
4. **O *pool* se recupera do *failover*.** Com o Postgres do *compose* derrubado e reerguido, o *pool* do
   `pix-gateway` se recupera sem reiniciar, e nenhuma transação confirmada se perde (medido em
   `aws-para-backend/07`).
5. **O código protege a produção.** O Postgres de produção tem:
   - HA *zone-redundant*;
   - autenticação só pelo Entra ID;
   - PITR de pelo menos 14 dias;
   - *backup* geográfico só com ADR de residência;
   - *resource lock* `CanNotDelete`.

   O Cosmos tem a chave de conta desligada, *backup* contínuo e o *lock*. Medido: o código bom passou nas 7 regras.
   A *fixture* ruim foi reprovada em **6 achados**:
   - o Postgres sem HA, com senha e com *backup* geográfico;
   - o Cosmos com chave de conta, com *backup* periódico e sem *lock*.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, crie um Flexible Server pequeno com HA
*zone-redundant*, force um *failover* com o serviço gravando e meça quanto tempo a aplicação ficou sem gravar.
Destrua tudo no fim.

**Checagem**

1. Qual a diferença entre HA *zone-redundant* e *same-zone*, e o que cada uma protege?
2. O que o PgBouncer embutido resolve, e o que acontece com ele no *failover*?
3. Por que a chave de partição pode estrangular um contêiner com capacidade sobrando?
4. Por que o *backup* geográfico de um Postgres no Brazil South é uma decisão de residência?

## Principais aprendizados

- O gerenciado tira a operação; HA, capacidade, consistência e custo continuam seus.
- HA *zone-redundant* com *failover* de 60 a 120 s; a *standby* não lê. PgBouncer na 6432, que reinicia no
  *failover*.
- PITR de 7 a 35 dias. O *backup* geográfico vai para o par, e o do Brazil South está nos Estados Unidos.
- Cosmos: RU, 20 GB e 10.000 RU/s por partição, *batch* de 100 operações e 2 MB na mesma chave.
- A chave de partição decide a vazão. Medido: a data concentrou 100% das escritas do dia.
- Escrita em várias regiões resolve conflito pela última escrita; o saldo fica numa região dona.
