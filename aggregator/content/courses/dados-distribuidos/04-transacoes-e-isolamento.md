---
id: transacoes-e-isolamento
title: "Transações e isolamento: o vocabulário que quase ninguém tem"
summary: "Os níveis pelas anomalias que permitem, o write skew que passa despercebido em READ COMMITTED, e as três formas de garantir que o saldo não fica negativo. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "PostgreSQL — Transaction Isolation"
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - title: "Berenson et al. — A Critique of ANSI SQL Isolation Levels"
    url: https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/
  - title: "Jepsen — Consistency Models"
    url: https://jepsen.io/consistency
  - title: "PostgreSQL Wiki — Serializable Snapshot Isolation"
    url: https://wiki.postgresql.org/wiki/SSI
---

Este é o marco denso da trilha — o equivalente ao "estatística mínima" da observabilidade. Ele
não ensina a usar transação; ensina o vocabulário para defender uma invariante de dinheiro.

## ACID por dentro, e a armadilha da palavra "consistência"

**Atomicidade** é tudo-ou-nada, e o mecanismo é o WAL: a mudança vai para o log antes de ir para
a tabela, e o rollback é conceitualmente esquecer. **Durabilidade** é a promessa de que o commit
sobrevive à queda — e ela vale exatamente até onde o `fsync` chegou (marco 05). **Isolamento** é
o assunto deste marco. E o **C**...

O C de ACID é a **invariante do seu schema**: constraints, chaves estrangeiras, checks. É uma
propriedade que **a aplicação** define e o banco ajuda a manter. O C de CAP é **visibilidade
entre réplicas** — se uma leitura enxerga a última escrita. São coisas diferentes com a mesma
palavra, e essa colisão é a fonte de metade dos mal-entendidos de arquitetura que você vai
mediar como techlead.

Frase para usar em reunião: *"quando você diz consistência, é a constraint do banco ou a
recência da leitura?"*. A pergunta resolve a discussão em trinta segundos.

## Os níveis pelas anomalias que permitem

Decorar os nomes dos níveis não serve para nada; o que serve é saber **o que cada um deixa
passar**. As anomalias, da mais óbvia à mais traiçoeira:

- **Dirty read** — ler algo que outra transação escreveu e ainda não commitou. Praticamente
  nenhum banco moderno permite por default.
- **Non-repeatable read** — ler a mesma linha duas vezes na mesma transação e obter valores
  diferentes.
- **Phantom** — reexecutar a mesma consulta e encontrar linhas novas que atendem ao filtro.
- **Lost update** — duas transações leem o mesmo valor, calculam a partir dele e escrevem; a
  segunda sobrescreve a primeira. `saldo = saldo - 100` em duas sessões, e só um débito
  sobrevive.
- **Write skew** — as duas leem, as duas verificam uma condição sobre o **conjunto**, as duas
  decidem que podem prosseguir e cada uma escreve numa linha **diferente**. Nenhuma sobrescreve
  a outra, nenhum lock colide, e a invariante do conjunto é violada.

| Nível | Dirty | Non-repeatable | Phantom | Lost update | Write skew |
| --- | --- | --- | --- | --- | --- |
| `READ COMMITTED` (default do Postgres) | não | **sim** | **sim** | **sim** | **sim** |
| `REPEATABLE READ` (SI no Postgres) | não | não | não\* | não | **sim** |
| `SERIALIZABLE` (SSI no Postgres) | não | não | não | não | não |

\* O `REPEATABLE READ` do Postgres é snapshot isolation e já impede o phantom clássico — o
padrão ANSI o permitiria. É um dos motivos pelos quais o nome do nível engana.

## `READ COMMITTED` é o default, e não protege a sua invariante

Este é o parágrafo mais importante da trilha. O nível default do Postgres — aquele em que roda
99% do código que você já escreveu, inclusive todo `@Transactional` sem parâmetro de
`spring-boot/05` — permite lost update e write skew.

O exemplo canônico é perfeitamente fintech. Duas contas compartilham um **limite conjunto** de
R$ 10.000, e a regra é que a soma das duas não pode ultrapassá-lo. Chegam duas transferências
simultâneas, de R$ 6.000 cada:

```sql
-- Sessão A                              -- Sessão B
BEGIN;                                   BEGIN;
SELECT sum(valor) FROM uso               SELECT sum(valor) FROM uso
  WHERE grupo = 'g1';  -- 0                WHERE grupo = 'g1';  -- 0
-- cabe: 6000 <= 10000                   -- cabe: 6000 <= 10000
INSERT INTO uso VALUES ('g1', 6000);     INSERT INTO uso VALUES ('g1', 6000);
COMMIT;                                  COMMIT;
```

As duas passam. Nenhum erro no log, nenhuma exceção na aplicação, nenhum alerta. O grupo usou
R$ 12.000 de um limite de R$ 10.000, e você descobre no fechamento — ou não descobre.

O que torna o write skew traiçoeiro é que ele **não é um conflito de escrita**. Cada sessão
escreveu numa linha diferente; não há nada para o banco detectar em `READ COMMITTED`. A leitura
que sustentava a decisão é que ficou obsoleta, e leitura obsoleta não trava nada.

## MVCC e o preço do snapshot

O Postgres entrega leitura sem bloquear escrita com **MVCC**: cada `UPDATE` cria uma nova versão
da linha, e cada transação enxerga o conjunto de versões visível no seu snapshot. É por isso que
um relatório longo não trava a autorização de pagamento — ele lê versões antigas.

O preço vem em três partes, e todas voltam no marco 07: as versões mortas ocupam espaço
(**bloat**), o `VACUUM` precisa recolhê-las, e **uma transação longa segura o vacuum de todo o
banco**, porque ele não pode limpar versões que aquela transação talvez ainda veja. O relatório
de duas horas não é apenas lento; ele é um problema de manutenção para o banco inteiro.

E snapshot isolation, mesmo perfeito, continua permitindo write skew — porque as duas transações
leem snapshots válidos, e o problema não é a leitura estar suja, é ela estar desatualizada em
relação a uma decisão que ainda não foi tomada.

## `SERIALIZABLE`, e as alternativas cirúrgicas

O `SERIALIZABLE` do Postgres é **SSI** (serializable snapshot isolation): ele roda como snapshot
isolation e monitora dependências entre transações; quando detecta um padrão que não poderia
acontecer em nenhuma execução serial, aborta uma delas com
`ERROR: could not serialize access due to read/write dependencies`.

Duas consequências práticas, e a segunda é a que trava a adoção:

1. O custo é **abort**, não lock — leitura continua não bloqueando escrita.
2. **A aplicação precisa saber fazer retry.** Um código que não trata esse erro simplesmente
   quebra sob concorrência. Isso vale para toda a aplicação, não para o trecho que você quis
   proteger.

Nem toda invariante precisa do nível todo. As alternativas cirúrgicas resolvem casos específicos
com custo menor:

| Ferramenta | Resolve | Custo |
| --- | --- | --- |
| `CHECK` / `UNIQUE` / FK | invariante de **uma linha** ou unicidade | nenhum — sempre prefira |
| `SELECT ... FOR UPDATE` | lost update em linha conhecida | serializa quem toca aquela linha |
| Materializar o conflito (linha de "limite do grupo" e travá-la) | **write skew** | contenção na linha de controle |
| `SERIALIZABLE` | qualquer anomalia | aborts + retry obrigatório em toda a app |

Materializar o conflito é o truque menos conhecido e o mais útil: o write skew existe porque não
havia uma linha em comum para colidir. Crie uma — a linha do grupo — e trave-a. O conflito
invisível vira um conflito de escrita que o banco sabe resolver.

## Linearizabilidade × serializabilidade

Duas garantias diferentes que a conversa costuma fundir:

- **Serializabilidade** é sobre **múltiplas operações**: o resultado é equivalente a alguma
  ordem serial das transações. Não diz nada sobre *qual* ordem, nem sobre recência.
- **Linearizabilidade** é sobre **uma operação**: assim que uma escrita termina, toda leitura
  seguinte a enxerga. É recência, e é o que o CAP chama de C.

Um sistema pode ser serializável e não linearizável — é o caso de ler de uma réplica em SI. E é
por isso que "strict serializable" existe como categoria separada no mapa da Jepsen. Nas suas
palavras de techlead: serializável é *"o resultado faz sentido"*; linearizável é *"o resultado é
o mais recente"*.

> **Reencontro — `arquitetura-eventos/04` e `spring-boot/05`.** O CAP/PACELC classificava o que
> tolerava atraso; agora você sabe qual mecanismo do banco entrega cada garantia. E o locking
> otimista (`@Version`) do Spring é lost-update prevention na aplicação — a mesma anomalia desta
> tabela, resolvida uma camada acima.

## Exemplo numa fintech

A invariante é a mais simples de enunciar e a mais fácil de perder: **o saldo disponível nunca
fica negativo**. Três formas de garanti-la, todas legítimas, com custos diferentes:

**1. Constraint no banco.** Uma coluna `saldo` com `CHECK (saldo >= 0)`, atualizada na mesma
transação do lançamento. O banco recusa, e não existe caminho de código que contorne — nem o
script de correção rodado às 3h. É a mais forte e a que exige manter um saldo materializado
correto.

**2. Lock pessimista.** `SELECT ... FROM conta WHERE id = ? FOR UPDATE` antes de decidir.
Simples, correto, e serializa todas as operações daquela conta — o que é irrelevante para a conta
comum e é gargalo para a conta do maior cliente (o celebrity do marco 03).

**3. `SERIALIZABLE` com retry.** Correto para invariantes que atravessam linhas — o limite
conjunto do exemplo acima. Exige o loop de retry e um teto de tentativas, e o abort precisa
virar métrica: `serialization_failures` subindo é sintoma de contenção, não de bug.

A escolha do `fin-store` é combinar: constraint para o que é de uma linha, materialização do
conflito para o que é de conjunto, e `SERIALIZABLE` apenas no fluxo que precisa. E a regra que
não muda: **a invariante mora no banco, não no `if` da aplicação** — porque o `if` vale para o
código que passou pela revisão, e a constraint vale para todo mundo.

## Hands-on

**Tutorial — reproduzir e corrigir o write skew.**

1. Crie a tabela `uso (grupo text, valor numeric)` e o limite de R$ 10.000 do exemplo.
2. Abra **duas** sessões `psql` lado a lado. Nas duas: `BEGIN;` e o `SELECT sum(valor)`.
3. Nas duas, o `INSERT` de 6.000. Depois `COMMIT` nas duas. Confirme o estouro:
   `SELECT sum(valor) FROM uso WHERE grupo = 'g1';` → 12.000.
4. **Correção 1 — materializar o conflito.** Crie `grupo_limite (grupo, limite)` e faça as duas
   sessões executarem `SELECT ... FOR UPDATE` nessa linha antes do `SELECT sum`. Repita o
   roteiro: a segunda sessão espera, e ao prosseguir vê 6.000.
5. **Correção 2 — `SERIALIZABLE`.** Volte ao roteiro original com
   `BEGIN ISOLATION LEVEL SERIALIZABLE`. O segundo `COMMIT` falha com erro de serialização.
6. **Correção 3 — constraint.** Modele um saldo materializado por grupo com
   `CHECK (usado <= limite)` e mostre que a segunda transação falha sem nenhum lock explícito.
7. `git commit` com o script das três correções e uma linha sobre o custo de cada uma.

**Desafio — provar a invariante sob concorrência.** Escolha uma das três correções para o
`fin-store` e escreva um teste que dispara **50 threads** debitando a mesma conta em paralelo,
somando mais do que o saldo existente. O teste passa se: nenhum saldo final é negativo, a soma
dos débitos aceitos é exatamente o saldo inicial, e nenhuma exceção não tratada escapou. Registre
quantos retries foram necessários, se houver.

**Invariantes testáveis**

1. Sob 50 threads concorrentes, o saldo nunca fica negativo e nenhum débito é perdido nem
   duplicado.
2. Se a solução usa `SERIALIZABLE`, existe retry com teto e o número de aborts é exposto como
   métrica.
3. A invariante é violável **apenas** por alteração de schema — nenhum caminho de aplicação a
   contorna.
4. O teste falha se alguém trocar o nível de isolamento de volta para o default.

**Complemento.** Meça o custo: rode o mesmo benchmark de débito em `READ COMMITTED` com
`FOR UPDATE` e em `SERIALIZABLE` com retry, com 10 e com 100 threads. Compare vazão e p99. O
formato da curva — não o número absoluto — é o que você vai usar para defender a escolha.

**Checagem**

1. Qual a diferença entre o C de ACID e o C de CAP, e qual pergunta resolve a confusão?
2. Por que write skew não é detectado em `READ COMMITTED` mesmo com o banco funcionando
   perfeitamente?
3. O que "materializar o conflito" faz, e por que isso transforma um problema invisível num
   detectável?
4. Serializável × linearizável: o que cada um promete, e um pode existir sem o outro?

## Principais aprendizados

- O C de ACID é a invariante do schema; o C de CAP é recência de leitura. Mesma palavra, coisas
  diferentes.
- Os níveis se entendem pelas anomalias que permitem: `READ COMMITTED` permite lost update e
  write skew, e é o default em que quase todo código roda.
- Write skew não é conflito de escrita — cada transação toca uma linha diferente, e por isso não
  há nada para o banco detectar.
- MVCC dá leitura sem bloqueio e cobra em bloat e vacuum; transação longa segura o vacuum do
  banco inteiro.
- `SERIALIZABLE` no Postgres custa aborts e exige retry em toda a aplicação; constraint,
  `FOR UPDATE` e materialização do conflito são as alternativas cirúrgicas.
- A invariante mora no banco, não no `if` da aplicação — porque o `if` vale só para o código que
  passou pela revisão.
