---
id: postgres-em-escala
title: "Postgres em escala"
summary: "Conexões que custam processo, MVCC na conta do vacuum, EXPLAIN lido de verdade e o particionamento declarativo que adia o sharding — o marco mais prático da trilha."
estimatedMinutes: 60
references:
  - title: "PostgreSQL — Routine Vacuuming"
    url: https://www.postgresql.org/docs/current/routine-vacuuming.html
  - title: "PostgreSQL — Using EXPLAIN"
    url: https://www.postgresql.org/docs/current/using-explain.html
  - title: "PgBouncer — Documentation"
    url: https://www.pgbouncer.org/usage.html
  - title: "PostgreSQL — Logical Replication"
    url: https://www.postgresql.org/docs/current/logical-replication.html
---

## Conexão é processo, não socket

No Postgres, cada conexão é um **processo do sistema operacional** com alguns megabytes de
memória própria. Quinhentas conexões não são quinhentos sockets ociosos: são quinhentos
processos disputando CPU, cache e locks internos. Passado o ponto de saturação, mais conexões
diminuem a vazão — a curva vira para baixo.

Daí o pooler. **PgBouncer** em três modos, e só um deles serve para pool grande:

- **session** — a conexão do cliente fica presa a uma do banco até desconectar. Compatível com
  tudo e economiza pouco.
- **transaction** — a conexão do banco é devolvida ao fim de cada transação. É o modo útil, e o
  que quebra `SET` de sessão, `PREPARE` nomeado e advisory locks de sessão.
- **statement** — devolve a cada comando; incompatível com transação de múltiplos comandos.

E o erro clássico, que vale para todo mundo que já aumentou um pool: **aumentar
`maximumPoolSize` quando o banco está lento piora**. A fila deixa de ser visível na aplicação e
passa a estar dentro do banco, onde você não a monitora. É exatamente o pool Hikari saturado de
`observabilidade/03` e o gargalo de JDBC com virtual threads de `spring-boot/07`: o número certo
de conexões é próximo de `núcleos × 2 + spindles`, e é surpreendentemente pequeno.

## MVCC na conta: bloat, vacuum e wraparound

O marco 04 explicou o mecanismo; aqui vem a fatura.

Cada `UPDATE` cria uma versão nova e deixa a antiga morta. O **autovacuum** recolhe as mortas e
devolve o espaço para reúso — não para o sistema operacional, o que já explica por que a tabela
não encolhe depois da limpeza. Se ele não acompanha o ritmo de escrita, o **bloat** cresce: a
tabela ocupa cada vez mais páginas com cada vez menos dado vivo, e toda leitura sequencial fica
mais cara.

Três causas de vacuum que não roda, em ordem de frequência:

1. **Transação longa aberta.** O vacuum não pode limpar versões que ela talvez ainda enxergue.
   Um relatório de duas horas, ou pior, uma sessão `idle in transaction` esquecida, congela a
   limpeza do banco **inteiro**.
2. **Autovacuum mal dimensionado.** Os defaults foram pensados para tabelas pequenas:
   `autovacuum_vacuum_scale_factor` de 0,2 significa esperar 20% da tabela virar lixo — numa
   tabela de 100 milhões de linhas, são 20 milhões de versões mortas antes de começar.
3. **Réplica com `hot_standby_feedback`** segurando a limpeza do primário para proteger as
   queries longas dela. Compromisso legítimo, e precisa ser sabido.

O caso extremo é o **wraparound**: o contador de transações é de 32 bits, e o vacuum também
existe para congelar linhas antigas antes que ele dê a volta. Ignorado por tempo suficiente, o
banco entra em modo de proteção e **para de aceitar escrita**. É um incidente de fintech parada,
e é totalmente evitável — a métrica `age(datfrozenxid)` avisa com semanas de antecedência.

O que alertar, no mínimo: idade da transação mais antiga, `n_dead_tup` das tabelas grandes,
tempo desde o último autovacuum por tabela, e `age(datfrozenxid)` do banco.

## Ler um `EXPLAIN` de verdade

`EXPLAIN (ANALYZE, BUFFERS)` é a única forma honesta de saber o que a query faz. Três hábitos
separam quem lê de quem olha:

**Compare estimativa com realidade.** Cada nó mostra `rows=` estimado e `actual rows=`. Uma
divergência de ordem de grandeza significa estatística desatualizada (`ANALYZE`) ou correlação
que o planner não conhece — e é a causa mais comum de plano ruim.

**Olhe `BUFFERS`, não só tempo.** `shared hit` é cache; `shared read` é disco. Uma query de
20ms com 200 mil buffers lidos está rápida por sorte, e vai desabar quando o cache esfriar.

**Seq scan nem sempre é o inimigo.** Se a query devolve 40% da tabela, varrer é mais barato que
pular pelo índice. O planner sabe disso. Quando ele erra, normalmente é estatística velha,
`random_page_cost` calibrado para disco rotacional, ou uma expressão na coluna
(`WHERE date(recordedAt) = ...`) que inviabiliza o índice — e essa você conserta reescrevendo o
predicado, não criando índice.

O índice que existe e não é usado tem três explicações típicas: tipo divergente no predicado
(`bigint` contra `text`), função aplicada à coluna, ou seletividade baixa demais para valer o
salto.

## Particionamento declarativo: o degrau que adia o sharding

Aqui está a resposta prática ao marco 03. `PARTITION BY RANGE (recordedAt)` com uma partição por
mês, num banco só, entrega três coisas:

- **Partition pruning** — a consulta com filtro de data toca uma partição em vez de sessenta. O
  `EXPLAIN` prova, e a armadilha é escrever a query sem a coluna de partição no filtro, perdendo
  o benefício inteiro.
- **Manutenção por partição** — vacuum, `REINDEX` e estatísticas por mês, em janelas curtas, em
  vez de uma operação monstruosa sobre a tabela toda.
- **Arquivamento barato** — `DETACH PARTITION` desliga o mês antigo em milissegundos, sem
  `DELETE`, sem bloat, sem WAL. A retenção de 5 anos exigida por regulação deixa de brigar com a
  tabela quente.

Duas restrições que precisam ser conhecidas antes: a chave de partição **precisa** estar na chave
primária e em toda constraint única, e criar as partições futuras é responsabilidade sua —
`pg_partman` ou um job simples, sob pena de o `INSERT` do dia 1º do mês falhar.

## Além de um nó

Quando um nó realmente não basta, três caminhos, em ordem de custo:

**Replicação lógica** — assinatura por tabela, versões diferentes, transformação no meio. É o
mecanismo por trás do CDC do marco 14 e da migração entre versões maiores sem downtime.

**Citus** — sharding dentro do ecossistema Postgres: nó coordenador, nós de dados, tabelas
distribuídas por chave e tabelas de referência replicadas. Vale quando você já passou por toda a
escada do marco 03 e a chave de shard é clara.

**Gerenciado (RDS, Aurora, Cloud SQL)** — tira de você a operação de backup, failover e patch, e
tira também o `superuser`, algumas extensões e parte do controle de tuning. Aurora, em especial,
substitui o mecanismo de storage: réplicas compartilham volume, o que muda radicalmente o custo do
failover e do lag. Nada disso é grátis — é troca de controle por operação, e a decisão tem ADR.

## Exemplo numa fintech

100 milhões de lançamentos por mês, consulta de extrato por conta com p99 abaixo de 50ms, e
retenção regulatória de 5 anos — 6 bilhões de linhas convivendo com a tabela quente.

O desenho que resolve sem sharding: tabela particionada por mês; índice `(accountId, recordedAt)`
em cada partição; BRIN em `recordedAt` para a conciliação; partições com mais de 3 meses movidas
para tablespace mais barato e, depois de 12, `DETACH` e arquivamento em storage frio, com o
catálogo de onde cada mês foi parar.

O que vai quebrar se ninguém olhar: a partição do mês corrente concentra 100% da escrita — e isso
está **certo** aqui, porque é uma partição dentro de um nó que aguenta, não um shard ocioso ao
lado de outro em chamas (marco 03). A vigilância é sobre o disco do nó, não sobre a distribuição.

## Hands-on

**Tutorial — particionar e provar o pruning.**

1. Crie `lancamento` com `PARTITION BY RANGE (recorded_at)` e a chave primária
   `(id, recorded_at)`. Note por que `recorded_at` precisa estar ali.
2. Crie 6 partições mensais e insira 6 milhões de linhas distribuídas entre elas.
3. Rode `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM lancamento WHERE account_id = $1 AND
   recorded_at >= $2 AND recorded_at < $3;` e confirme no plano que só uma partição foi
   escaneada.
4. Rode a mesma consulta **sem** o filtro de data. Compare os buffers lidos: é o custo de perder
   o pruning.
5. `DETACH` a partição mais antiga e meça o tempo. Compare com um `DELETE` equivalente — inclua o
   WAL gerado por cada um.
6. `git commit` com os dois planos e os números.

**Desafio — de 2 segundos para menos de 100ms.** Pegue a query de extrato mais lenta que você
conseguir construir (junte conta, lançamento e contraparte, com ordenação e paginação) e otimize
até o alvo. As regras: você precisa registrar o `EXPLAIN` antes e depois, e a entrega principal é
**a explicação de por que funcionou** — qual nó do plano mudou e por quê. Um número sem
explicação não conta como resolvido.

**Invariantes testáveis**

1. Toda query do caminho quente tem `EXPLAIN` registrado, com `actual rows` na mesma ordem de
   grandeza da estimativa.
2. Nenhuma consulta de extrato omite a coluna de partição no filtro.
3. Existe alerta para transação mais antiga, `n_dead_tup` e `age(datfrozenxid)`.
4. As partições do mês seguinte são criadas automaticamente, e existe teste que prova isso.

**Complemento.** Provoque o problema: abra uma sessão com `BEGIN;` e um `SELECT`, e **deixe-a
aberta**. Gere carga de `UPDATE` numa tabela por 20 minutos e acompanhe `n_dead_tup` e o tamanho
da tabela. Depois commite a sessão e veja o vacuum recuperar. É a demonstração mais barata de por
que `idle in transaction` tem alerta.

**Checagem**

1. Por que aumentar o pool de conexões quando o banco está lento piora a situação?
2. Quais são as três causas de o autovacuum não acompanhar, e por que a primeira afeta o banco
   inteiro?
3. O que `BUFFERS` mostra que o tempo de execução esconde?
4. Quais são os três ganhos do particionamento declarativo, e qual restrição ele impõe à chave
   primária?

## Principais aprendizados

- Conexão no Postgres é processo: o pool certo é pequeno, e aumentá-lo sob lentidão move a fila
  para dentro do banco, onde ninguém a monitora.
- Bloat é a fatura do MVCC; transação longa aberta congela o vacuum do banco inteiro, e wraparound
  é o incidente que para a fintech — todos com métrica que avisa antes.
- `EXPLAIN (ANALYZE, BUFFERS)` se lê comparando estimativa com realidade e olhando buffers; seq
  scan às vezes é a escolha certa.
- Particionamento declarativo entrega pruning, manutenção por fatia e `DETACH` como arquivamento —
  é o degrau que adia o sharding sem impedi-lo.
- Replicação lógica, Citus e gerenciado são os caminhos além de um nó; cada um troca controle por
  operação, e a troca tem ADR.
