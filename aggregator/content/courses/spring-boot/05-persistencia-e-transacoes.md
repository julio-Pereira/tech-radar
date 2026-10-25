---
id: persistencia-e-transacoes
title: "Persistência, transações e locking"
summary: "Spring Data JPA sem mitos: propagation e isolation na prática, N+1, Flyway como fonte de verdade do schema, e a decisão central de um ledger — locking otimista vs pessimista."
estimatedMinutes: 50
references:
  - title: "Spring Framework — Transaction Propagation"
    url: https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html
  - title: "Spring Data JPA Reference"
    url: https://docs.spring.io/spring-data/jpa/reference/jpa.html
  - title: "Jakarta Persistence — Locking"
    url: https://jakarta.ee/specifications/persistence/3.1/
  - title: "Flyway Documentation"
    url: https://documentation.red-gate.com/flyway
---

## Transação ≠ conexão

O erro conceitual mais comum: achar que `@Transactional` é "uma conexão". Uma
**transação** é uma unidade lógica atômica; a **conexão** é o recurso físico que a
executa. O Spring associa uma conexão à thread durante a transação e a devolve ao pool
(HikariCP) no commit/rollback. Segurar transações longas — esperando I/O de rede
dentro delas — **esgota o pool** e derruba o serviço inteiro sob carga. Transação é
curta, cirúrgica, só em volta da escrita no banco.

## Propagation e isolation na prática

**Propagation** decide o que acontece quando um método transacional chama outro:

- `REQUIRED`, o default, junta-se à transação corrente ou cria uma se não houver. Cobre
  90% dos casos.
- `REQUIRES_NEW` **suspende** a transação corrente e abre outra, independente. Use-o para
  o que precisa persistir *mesmo que a transação de negócio faça rollback* — por exemplo,
  gravar o registro de auditoria de uma tentativa que falhou. O custo escondido: a
  transação suspensa **ainda segura sua conexão do pool**, e a nova pede uma
  **segunda**. Se várias requisições ao mesmo tempo seguram a primeira conexão e esperam
  a segunda, e o pool acabou, ninguém avança — é o *deadlock* de pool
  (`concorrencia-e-recursos/04`). Com `maximumPoolSize` pequeno, `REQUIRES_NEW` chamado
  sob carga pode travar o serviço inteiro.
- `NESTED` cria um *savepoint* — um ponto de retorno dentro da transação atual. Um erro
  desfaz só o trabalho feito depois dele, e a transação de fora continua.

**Isolation** controla o que uma transação enxerga das outras. O default do Postgres é
`READ_COMMITTED`. Subir para `REPEATABLE_READ`/`SERIALIZABLE` resolve *anomalias* — a **leitura
não-repetível** (ler a mesma linha duas vezes na transação e achar valores diferentes,
porque outra transação comitou no meio) e o **phantom** (repetir uma consulta e achar
linhas novas que outra transação inseriu) — ao custo de contenção e de possíveis erros de serialização que
você **tem** que tratar com retry. Não suba isolation por reflexo; suba quando a anomalia
for real para o seu caso — e meça.

`@Transactional(readOnly = true)` em consultas não é decoração: o Hibernate deixa de
fazer *dirty checking* (não compara as entidades carregadas para decidir o que gravar),
o driver recebe a conexão marcada como somente-leitura, e o código documenta a intenção.
O que ele **não** faz sozinho é mandar a consulta para uma réplica de leitura (uma cópia
do banco que só atende leituras): isso só acontece se você configurar um
`AbstractRoutingDataSource` que escolha o `DataSource` pela flag `readOnly` da transação
corrente. Sem esse roteador, tudo vai para o primário, o banco que recebe as escritas.

## Vazamento de conexão e a hierarquia de timeouts

Uma conexão emprestada do Hikari e nunca devolvida — um caminho de erro que escapa do
`try`/`finally` implícito do Spring, uma transação que nunca comita nem reverte — é um
**vazamento de conexão**: o pool encolhe silenciosamente até esgotar. `leakDetectionThreshold`
(desligado por padrão; o menor valor aceito para ligar é 2000 ms) loga um aviso quando uma
conexão fica emprestada além do limiar — ligá-lo em desenvolvimento e staging é uma das formas
mais baratas de achar o vazamento antes de produção.

A **hierarquia de timeouts** precisa estar em ordem, do mais externo ao mais interno: o
*deadline* da requisição do cliente é o maior; o timeout da transação, menor; `connectionTimeout`
do Hikari (quanto tempo esperar por uma conexão livre), menor ainda; e `statement_timeout` no
banco é a última rede de segurança, para uma query individual que trava. Quando a ordem está
invertida, uma requisição pode ficar esperando conexão por mais tempo do que o cliente já
desistiu de esperar resposta.

> **Reencontro adiante — `concorrencia-e-recursos/07`.** O tamanho do pool, o tempo de retenção
> (que é o tempo da transação) e a conta `TPS × retenção` que dimensiona o Hikari corretamente
> são o assunto completo desse marco — aqui fica a hierarquia de timeouts e o alerta de
> vazamento; lá fica o dimensionamento.

## N+1: o assassino silencioso de latência

Carregar uma lista de pagamentos e acessar `payment.getPsp()` em cada um dispara **uma
query por item**: a associação é *lazy* (só é buscada quando acessada), então são uma
query para a lista e mais N, uma por pagamento — o problema N+1. Ele não aparece em
teste com 2 registros; aparece na produção com 10 mil. Resolva pedindo a associação na
mesma query, com `@EntityGraph` (ou um `JOIN FETCH` em JPQL):

```java
@EntityGraph(attributePaths = "psp")
List<Payment> findByStatus(PaymentStatus status);
```

Ligue `spring.jpa.properties.hibernate.generate_statistics=true` em teste para *contar*
queries e falhar o build se um endpoint passar de um teto. Latência é feature.

## Flyway: o schema é código

O schema do banco é **fonte de verdade versionada**, não um `ddl-auto=update` mágico.
`ddl-auto` fica em `validate` (ou `none`) em produção; as mudanças vêm de migrações
Flyway (`V1__create_payments.sql`, `V2__idempotency_and_outbox.sql`), aplicadas no
startup, na mesma ordem, em todo ambiente — auditável e reproduzível, exatamente o que o
BACEN pede.

No Boot 4, a auto-configuração do Flyway mora no seu próprio starter. Com só o
`flyway-core` no classpath, **nenhuma migração roda e nada avisa** — a aplicação sobe
com o schema vazio:

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-flyway</artifactId>
</dependency>
<dependency>
  <groupId>org.flywaydb</groupId>
  <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

A primeira migração do pix-gateway cria a tabela que os próximos marcos usam:

```sql
-- src/main/resources/db/migration/V1__create_payments.sql
CREATE TABLE payments (
    id     UUID PRIMARY KEY,
    amount NUMERIC(19,4) NOT NULL,
    status TEXT NOT NULL
);
```

## A decisão do ledger: locking otimista vs pessimista

Duas transações debitando a **mesma conta** ao mesmo tempo podem, sem controle, ler as
duas o saldo 100, debitar as duas 80 e gravar as duas 20. Saíram 160 de uma conta que
tinha 100, e o segundo débito, que deveria ter sido recusado, apagou o primeiro. É um
*lost update* — uma atualização perdida:

```
  sem lock:
  tx A                     saldo no banco                tx B
  lê ───────────────────▶       100       ◀─────────────── lê
  100 - 80 = 20                                  100 - 80 = 20
  grava 20 ─────────────▶        20
                                 20       ◀─────────── grava 20
                          (o débito de A sumiu)

  com SELECT ... FOR UPDATE:
  lê e trava ───────────▶       100       ◀── B tenta ler: espera
  grava 20, commit ─────▶        20       ──▶ B lê 20; 20 < 80:
                                              "saldo insuficiente"
```

Há duas defesas.

**Otimista, com `@Version`.** Uma coluna de versão acompanha a linha; no commit, se a
versão mudou desde a leitura, o Hibernate lança `OptimisticLockException` e você
**repete a operação**. Serve quando o conflito é *raro*: não há lock no banco, a
concorrência é alta e o custo só aparece quando o conflito acontece.

```java
@Entity
class Account {
    @Id UUID id;
    @Version long version;            // otimista
    @Column(precision = 19, scale = 4)
    BigDecimal balance;               // dinheiro é BigDecimal, nunca double
}
```

**Pessimista, com `SELECT ... FOR UPDATE`.** A leitura trava a linha no banco até o fim
da transação, e quem chegar depois **espera**. Serve quando o conflito é *frequente*
(uma conta muito movimentada): as transações passam uma de cada vez, sem retries em
cascata.

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select a from Account a where a.id = :id")
Optional<Account> findByIdForUpdate(@Param("id") UUID id);
```

A regra: **otimista para conflito raro, pessimista para conflito frequente**. E, seja
qual for, `BigDecimal` na coluna com `precision`/`scale` explícitos — `double` para
dinheiro é bug de compliance esperando acontecer.

## Exemplo numa fintech

No **pix-gateway**, iniciar um pagamento debita a conta de origem. Sob pico Pix, a mesma
conta corporativa pode receber vários débitos simultâneos. Modelamos `Account.balance`
como `BigDecimal(19,4)`, escolhemos **locking pessimista** (`FOR UPDATE`) por ser conta
quente, e a regra "saldo nunca fica negativo" vira uma verificação **dentro** da
transação, depois do lock — impossível de furar por corrida.

## Mão na massa

**Desafio — débito concorrente que nunca deixa saldo negativo.**

1. Modele `Account` com saldo `BigDecimal` e um `DebitService` transacional que carrega
   a conta com `FOR UPDATE`, valida saldo suficiente e debita.

   O teste do passo 2 usa Testcontainers antes de o marco 11 ensinar a ferramenta em
   detalhe — por ora, este é o esqueleto mínimo para rodar o teste de concorrência (as
   dependências de teste são as do marco 04):

   ```java
   // V1 (Flyway) cria payments; a tabela de exercício account vem do Hibernate no teste
   @SpringBootTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
   @Testcontainers
   class DebitServiceConcurrencyIT {

       @Container @ServiceConnection
       static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

       @Autowired DebitService debitService;

       // dispare N threads (ExecutorService + CountDownLatch) chamando debitService.debit(...)
       // na mesma conta, e conte sucessos/falhas — é o corpo do passo 2
   }
   ```

2. Escreva um teste (Testcontainers Postgres) que dispara **N threads** debitando a
   mesma conta com saldo para só metade delas: exatamente metade deve suceder, metade
   receber "saldo insuficiente", e o saldo final ser `>= 0`.
3. Refaça com `@Version` (otimista) + retry em `OptimisticLockException` e compare:
   ambos corretos, throughput diferente. Meça e conclua qual serve à sua conta.

## Principais aprendizados

- Transação ≠ conexão; mantenha transações **curtas**, sem I/O de rede dentro delas.
- `REQUIRED` cobre a maioria; `REQUIRES_NEW` para auditoria que sobrevive ao rollback —
  mas ele segura duas conexões do mesmo pool ao mesmo tempo, risco real de deadlock de
  pool sob carga; suba isolation só contra anomalia real.
- `leakDetectionThreshold` (mínimo 2000 ms) acha vazamento de conexão antes de produção;
  a hierarquia de timeouts vai do deadline do cliente ao `statement_timeout` do banco,
  cada um menor que o anterior.
- Mate N+1 com `@EntityGraph`/`JOIN FETCH` e conte queries no teste. Flyway é a fonte de
  verdade do schema; `ddl-auto=validate` em produção.
- **Otimista (`@Version`) para conflito raro, pessimista (`FOR UPDATE`) para conflito
  frequente.** Dinheiro é sempre `BigDecimal`.
