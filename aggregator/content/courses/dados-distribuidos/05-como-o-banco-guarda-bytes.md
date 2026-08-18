---
id: como-o-banco-guarda-bytes
title: "Como o banco guarda bytes: B-tree, LSM e as três amplificações"
summary: "Os dois formatos de storage engine, o que cada um cobra em escrita, leitura e espaço, e por que a durabilidade termina exatamente onde o fsync chegou."
estimatedMinutes: 55
references:
  - title: "PostgreSQL — WAL Configuration"
    url: https://www.postgresql.org/docs/current/wal-configuration.html
  - title: "PostgreSQL — Index Types"
    url: https://www.postgresql.org/docs/current/indexes-types.html
  - title: "RocksDB Wiki — Compaction and write amplification"
    url: https://github.com/facebook/rocksdb/wiki/Compaction
---

## B-tree: o formato que você já usa

Uma B-tree guarda as chaves ordenadas em páginas de tamanho fixo — 8 KB no Postgres — ligadas
numa árvore de altura baixa. Com fator de ramificação alto, uma tabela de bilhões de linhas
tem uma árvore de três ou quatro níveis: encontrar uma chave custa três ou quatro leituras de
página, quase sempre servidas de memória nos níveis de cima.

A escrita é onde ela cobra. Inserir numa página cheia obriga a **dividir** a página em duas e
atualizar o pai, que pode dividir também. E como cada página vive num lugar fixo do disco,
escrever numa chave aleatória é uma escrita aleatória — barata em SSD, brutal em disco
rotacional, e sempre pior que escrever em sequência.

A consequência prática que volta no marco 10: **inserir chaves aleatórias fragmenta o índice**.
UUIDv4 espalha as inserções por toda a árvore, cada uma sujando uma página diferente. Chaves
crescentes concentram tudo na página mais à direita, que fica quente e em cache.

## LSM-tree: trocar leitura por escrita

A LSM inverte o compromisso. A escrita vai para uma estrutura ordenada em memória (memtable) e
para um log; quando a memtable enche, ela é despejada em disco como um arquivo **imutável e
ordenado** (SSTable). Escrever é sempre sequencial, sempre append — que é o caso bom de
qualquer mídia.

O preço aparece na leitura: uma chave pode estar na memtable ou em qualquer SSTable, então a
busca consulta vários arquivos. Filtros de Bloom evitam quase todas as visitas inúteis, mas o
custo continua sendo maior que os três acessos da B-tree.

E existe a **compactação**: um processo de fundo que mescla SSTables, descarta versões antigas
e mantém a leitura sustentável. Ela é a fonte de duas surpresas operacionais — consome I/O
exatamente quando o sistema está sob carga, e produz picos de latência em p99 que o p50 não
mostra (`observabilidade/04`).

Cassandra, RocksDB, o storage do Kafka e a maioria dos motores de chave-valor são LSM. Postgres,
MySQL/InnoDB e Oracle são B-tree. Não existe vencedor: existe padrão de acesso.

## As três amplificações

Esta é a lente para comparar storage engines sem religião, e para prever custo de disco antes de
contratá-lo:

- **Amplificação de escrita** — bytes gravados no disco por byte gravado pela aplicação. A LSM
  reescreve o mesmo dado a cada nível de compactação; a B-tree reescreve a página inteira de
  8 KB para mudar 20 bytes, e ainda grava a mesma coisa no WAL.
- **Amplificação de leitura** — páginas lidas por linha devolvida. A LSM paga por consultar
  vários arquivos; a B-tree paga quando o índice não cobre a query e é preciso visitar a
  tabela.
- **Amplificação de espaço** — bytes ocupados por byte de dado vivo. A LSM guarda versões
  antigas até a compactação chegar; a B-tree guarda páginas com espaço livre e, no Postgres,
  versões mortas até o vacuum passar.

Você não elimina as três. Você escolhe qual delas paga — e a escolha certa é a que corresponde
ao que o seu workload faz mais.

## WAL, `fsync` e a durabilidade real

Antes de tocar na tabela, o Postgres grava a mudança no **WAL**. É isso que torna o commit
recuperável: se a máquina cair, o log é reaplicado. A pergunta que importa é *onde* o WAL estava
quando o banco respondeu "commitado".

`synchronous_commit` tem mais de dois valores, e cada um é uma promessa diferente:

| Valor | O commit espera | O que você perde numa queda |
| --- | --- | --- |
| `off` | nada — retorna e grava depois | até `wal_writer_delay` de transações confirmadas |
| `local` | `fsync` no WAL local | nada no nó; tudo que a réplica não recebeu |
| `remote_write` | a réplica recebeu no SO | o que estava no cache do SO da réplica |
| `on` / `remote_apply` | a réplica gravou / aplicou | nada, ao custo de latência |

E há a camada abaixo, que quase ninguém verifica: **o disco pode mentir**. Um cache de escrita
sem bateria confirma o `fsync` antes de a gravação ser permanente. Em nuvem isso normalmente
está resolvido; em hardware próprio, é uma verificação que precisa ser feita uma vez e
documentada.

Numa fintech, `synchronous_commit` não é botão de tuning. É uma decisão com dono, número de RPO
associado (marco 02) e ADR — porque relaxá-lo é trocar durabilidade por vazão, e a moeda dessa
troca é dinheiro de cliente.

## Índices: nenhum é grátis

O índice acelera leitura e **cobra imposto em toda escrita**. Cada `INSERT` atualiza todos os
índices da tabela; cada `UPDATE` que muda uma coluna indexada também. Uma tabela com seis
índices custa mais que o dobro, por inserção, de uma com dois.

O catálogo mínimo do Postgres que vale conhecer:

- **B-tree** — o default; igualdade, range, ordenação, `LIKE 'prefixo%'`.
- **Hash** — só igualdade; raramente vale a pena desde que a B-tree passou a ser tão boa.
- **GIN** — múltiplos valores por linha: `jsonb`, arrays, busca textual.
- **BRIN** — minúsculo, para tabelas grandes e **fisicamente ordenadas** pela coluna. Na tabela
  de lançamentos, ordenada por tempo de inserção, um BRIN em `recordedAt` pode substituir um
  B-tree centenas de vezes maior.
- **Parcial** (`WHERE status = 'PENDENTE'`) — indexa só a fatia consultada. Numa tabela em que
  0,1% das linhas está pendente, é a diferença entre um índice de 4 GB e um de 4 MB.
- **Coberto** (`INCLUDE`) — carrega colunas extras para permitir *index-only scan*, em que o
  banco responde sem visitar a tabela.

A regra de higiene: antes de criar um índice, procure o que já existe. Um índice em `(a, b)`
serve para `a` e para `a, b`; um índice separado em `a` é redundante e você paga por ele em todo
`INSERT`, para sempre.

## Exemplo numa fintech

O ledger tem um padrão de acesso muito específico, e ele decide tudo: **append-heavy,
read-by-account, nunca `UPDATE`**.

A regra de nunca atualizar não é preferência estética — é contábil. Correção de lançamento é
**lançamento novo** (estorno, ajuste), porque a auditoria precisa ver o que foi feito e quando.
O efeito colateral é ótimo: sem `UPDATE`, não há versão morta, não há bloat de linha atualizada e
o vacuum tem pouco a fazer. A tabela mais movimentada do sistema é a mais barata de manter.

Os índices que sobrevivem à conta:

| Índice | Serve | Vale a pena? |
| --- | --- | --- |
| `(accountId, recordedAt)` | extrato por conta e período — a query quente | sim, é o essencial |
| `(idempotencyKey)` único | impedir lançamento duplicado | sim, é invariante, não desempenho |
| BRIN em `recordedAt` | conciliação diária, varredura do dia | sim, custa quase nada |
| `(counterpartyId)` | busca operacional, algumas vezes por hora | provavelmente não — meça |
| `(status)` | fila de pendentes | parcial, só `WHERE status = 'PENDENTE'` |

O último caso é o mais comum e o mais mal resolvido: alguém cria um B-tree completo em `status`,
uma coluna de quatro valores distintos numa tabela de 100 milhões de linhas. O índice fica
enorme, o planner o ignora na maioria das queries, e todo `INSERT` paga por ele.

## Hands-on

**Desafio — quanto custa um índice.** Crie a tabela de lançamentos do `fin-store` e meça:

1. Insira 1 milhão de linhas com **2 índices** (`accountId, recordedAt` e a chave primária).
   Registre o tempo total, o tempo por 100 mil linhas e o tamanho final
   (`pg_total_relation_size`).
2. Recrie a tabela com **6 índices** — acrescente `status`, `counterpartyId`, `valor` e um
   `jsonb` com GIN. Repita exatamente a mesma carga.
3. Compare: tempo de inserção, tamanho da tabela, tamanho dos índices
   (`pg_indexes_size`) e volume de WAL gerado (`pg_current_wal_lsn` antes e depois).
4. Decida quais índices sobrevivem, **com o número na mão**, e escreva uma linha por índice
   removido dizendo qual query passa a ser mais lenta e quanto isso importa.

**Invariantes testáveis**

1. Toda query do caminho quente é servida por um índice existente — verificado por `EXPLAIN`,
   não por leitura do código.
2. Nenhum índice da tabela é prefixo redundante de outro.
3. A tabela de lançamentos não recebe `UPDATE` em nenhum caminho da aplicação; correção é
   lançamento novo.
4. O volume de WAL por 1 milhão de inserções está medido e cabe na capacidade do disco e da
   replicação.

**Complemento.** Meça o efeito da ordem de inserção: repita a carga com chave primária UUIDv4 e
com UUIDv7 e compare tamanho do índice, cache hit ratio (`pg_statio_user_indexes`) e tempo. O
número que sair é a munição do marco 10 — e ele costuma ser maior do que se espera.

**Checagem**

1. Onde a B-tree cobra na escrita, e onde a LSM cobra na leitura?
2. O que são as três amplificações, e por que você não elimina nenhuma — só escolhe?
3. O que exatamente muda entre `synchronous_commit = local` e `= on`, em termos de dado
   perdido?
4. Por que um B-tree em `status` numa tabela de 100 milhões de linhas costuma ser desperdício, e
   qual é a alternativa?

## Principais aprendizados

- B-tree custa na escrita aleatória e no split de página; LSM escreve sempre em sequência e
  cobra na leitura e na compactação — o critério é o padrão de acesso, não a marca.
- As três amplificações (escrita, leitura, espaço) são a lente para comparar engines e prever
  custo de disco; você escolhe qual pagar.
- Durabilidade termina onde o `fsync` chegou: `synchronous_commit` é decisão com RPO e ADR, não
  ajuste de desempenho.
- Todo índice é imposto cobrado em cada `INSERT`; parcial, BRIN e coberto resolvem casos que o
  B-tree completo resolve caro.
- O ledger é append-only por razão contábil, e ganha de brinde a manutenção mais barata do
  sistema: sem `UPDATE`, quase não há bloat.
