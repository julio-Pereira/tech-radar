---
id: identidade-e-unicidade
title: "Identidade, unicidade e concorrência em escala"
summary: "Por que UUIDv4 destrói o índice, por que unicidade global é um requisito caro, e o fencing token que corrige o lock distribuído que todo mundo implementa errado."
estimatedMinutes: 55
references:
  - title: "RFC 9562 — UUIDs (versões 4 e 7)"
    url: https://www.rfc-editor.org/rfc/rfc9562.html
  - title: "Martin Kleppmann — How to do distributed locking"
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: "PostgreSQL — Sequence Manipulation Functions"
    url: https://www.postgresql.org/docs/current/functions-sequence.html
---

## Geração de id: a escolha que o índice paga

| Estratégia | Ordena no tempo | Escala entre nós | Custo no índice |
| --- | --- | --- | --- |
| Sequence do banco | sim | não — precisa do banco a cada id | mínimo |
| UUIDv4 | não | sim | alto — inserção aleatória fragmenta |
| **UUIDv7** | sim (prefixo de tempo) | sim | baixo, como uma sequência |
| Snowflake | sim | sim | baixo; exige id de nó gerenciado |
| ULID | sim | sim | baixo; representação textual mais curta |

O ponto que o marco 05 preparou: uma B-tree insere na página onde a chave cai. Chaves crescentes
concentram as inserções na página mais à direita, que fica em cache e é escrita em sequência.
Chaves aleatórias espalham as inserções por toda a árvore — cada inserção suja uma página
diferente, o cache não ajuda, o WAL cresce (páginas inteiras sendo escritas) e o índice fica maior
para o mesmo número de linhas.

Por isso a escolha de identificador não é preferência de time. UUIDv7 é o default moderno porque
resolve os dois lados: gera sem coordenação, como o v4, e mantém a locality, como uma sequence.
Snowflake resolve o mesmo e adiciona a obrigação de gerenciar identificadores de nó — o que é
trabalho operacional que alguém vai esquecer.

E vale conhecer a objeção legítima ao v7: o prefixo temporal **vaza informação**. Dá para inferir
quando um registro foi criado e, comparando dois ids, estimar volume. Para uma chave interna,
irrelevante. Para um identificador exposto ao cliente, é decisão consciente — e a saída comum é
ter dois: a chave interna ordenável e um identificador público opaco.

## Unicidade quando os dados estão em vários lugares

`UNIQUE` é uma constraint **local**. Ela garante unicidade dentro do banco onde vive — o que, num
sistema shardado, significa unicidade dentro do shard e nada mais. Se o mesmo documento pode
chegar por dois caminhos e cair em shards diferentes, a constraint não vê nada.

Três saídas, em ordem de preferência:

1. **Incluir a chave de shard na chave única.** Se a unicidade que importa é "não pode haver dois
   lançamentos com a mesma `idempotencyKey` **para a mesma conta**", e o shard é por conta, a
   constraint local resolve tudo. Sempre que possível, redefina a unicidade para caber dentro de
   uma partição — é a solução mais barata e a mais ignorada.
2. **Serviço de unicidade dedicado.** Um store pequeno cuja única função é reservar a chave antes
   de a operação seguir. Correto, e introduz um passo síncrono a mais no caminho quente, com sua
   própria disponibilidade.
3. **Aceitar a duplicata e reconciliar** (marco 08). Legítimo quando a duplicata é rara, detectável
   e corrigível — e ilegítimo quando ela significa cobrar o cliente duas vezes.

E a variação que aparece em toda fintech: **"o número da transação precisa ser sequencial, global e
sem buracos"**. É um requisito de negócio caríssimo, porque uma sequência global sem buracos é um
ponto de serialização — todos os nós esperam a mesma estrutura, e um rollback deixa um buraco que
o requisito proíbe. Negocie: blocos pré-alocados por nó (rápido, com buracos), sequência por
agência e por dia (satisfaz quase toda exigência real), ou numeração atribuída **depois**, no
fechamento, quando a ordem já está definida. Quase sempre o requisito verdadeiro era
"auditável e não previsível", não "denso e global".

## Locks distribuídos e o fencing token

O cenário: o job de fechamento não pode rodar duas vezes em paralelo. A solução instintiva é um
lock no Redis — `SET chave valor NX PX 30000`, faça o trabalho, apague a chave.

O furo está no meio. O processo pega o lock, sofre uma pausa de GC de 40 segundos, o lock expira,
outro processo o adquire e começa a trabalhar. O primeiro acorda e continua **achando que ainda o
tem**. Agora dois processos escrevem, e nenhum sabe.

Redlock — o algoritmo com múltiplas instâncias Redis — endereça a falha de um nó, e é justamente
isso que a crítica de Kleppmann mostra ser insuficiente: o problema não é quantos nós concordaram,
é que **o detentor não consegue saber que perdeu o lock**. Nenhuma quantidade de réplicas
resolve uma pausa do processo.

A correção é o **fencing token** do marco 01: o lock devolve um número que só cresce, o processo o
carrega em toda escrita, e o storage rejeita qualquer escrita com número menor que o último aceito.
O zumbi acorda, escreve com o token 41, o storage já viu o 42 e recusa. A proteção passa a estar
onde a escrita acontece — e é a única que sobrevive a uma pausa arbitrária.

Onde não dá para adicionar o token, a saída é tornar a operação idempotente, de modo que a
execução dupla não cause dano. É a mesma conclusão do marco 01, chegando por outro caminho.

## Concorrência otimista quando a contenção sobe

`@Version` (`spring-boot/05`) é elegante e correto: leia com a versão, escreva verificando que ela
não mudou, e trate a falha com retry. Funciona muito bem **enquanto a contenção é baixa**.

Quando ela sobe, o comportamento inverte. Cem operações disputando a mesma linha produzem uma que
passa e noventa e nove que falham e tentam de novo — que falham de novo. A vazão desaba e o
sistema gasta CPU em retries. Retry com backoff e jitter alivia; não conserta.

O que conserta é **reformular o modelo**, e há três caminhos:

- **Agregado menor** — se a contenção é na linha do "cliente", talvez a invariante real seja da
  conta, e o cliente não precisasse ser tocado.
- **Evento em vez de `UPDATE`** — em vez de atualizar o saldo, insira o lançamento e derive o
  saldo. Inserções não colidem entre si; é exatamente o desenho append-only do marco 05.
- **Particionar a linha quente** — o contador vira N sub-contadores somados na leitura. É a
  técnica clássica para o hot key do marco 03, aplicada dentro do banco.

A regra de decisão: contenção baixa, otimista; contenção alta e invariante simples, pessimista com
`FOR UPDATE`; contenção alta e volume alto, mude o modelo.

## Exemplo numa fintech

O número da transação precisa ser único, **não previsível** e rastreável. Previsibilidade é um
problema de segurança real: se o identificador é sequencial e exposto, um concorrente estima o
volume da empresa e um atacante enumera registros.

O desenho do `fin-store` usa dois identificadores, e essa separação resolve a tensão inteira: a
chave primária é UUIDv7, interna, ordenável, ótima para o índice; e o número público é opaco,
gerado à parte, sem informação temporal.

Sobre a `Idempotency-Key` (`spring-boot/06`): ela é o caso mais importante de unicidade desta
trilha, porque é ela que impede o cliente de pagar duas vezes quando a conexão cai — a situação do
marco 01. Ela precisa valer **onde a operação acontece**, então o desenho correto é a chave única
`(accountId, idempotencyKey)`: cabe dentro do shard, é local, é barata, e a unicidade que ela
garante é exatamente a que o negócio precisa.

## Hands-on

**Desafio — medir a fragmentação do índice.** Compare UUIDv4 e UUIDv7 com números seus:

1. Crie duas tabelas idênticas de 1 milhão de linhas, uma com chave primária UUIDv4, outra com
   UUIDv7.
2. Insira as linhas em ambas, medindo o tempo total e o tempo por lote de 100 mil (a curva importa
   mais que o total).
3. Compare, ao final: `pg_relation_size` do índice, `pg_stat_statements` para o tempo de inserção,
   e o volume de WAL gerado em cada caso.
4. Meça também a **leitura**: consulte 10 mil ids aleatórios em cada tabela e compare o cache hit
   ratio em `pg_statio_user_indexes`.
5. Escreva a decisão do `fin-store` defendida pelos números obtidos — inclusive a decisão sobre
   expor ou não o identificador temporal ao cliente.

**Invariantes testáveis**

1. A chave primária escolhida não fragmenta o índice além do limite que você mediu como aceitável.
2. Toda operação de escrita externa é única por `(chave de shard, chave de idempotência)`.
3. Nenhum identificador exposto ao cliente permite inferir volume ou ordem de criação.
4. Todo lock distribuído do sistema tem fencing token ou protege uma operação idempotente — sem
   exceção.

**Complemento.** Reproduza a inversão da concorrência otimista: rode um benchmark de `UPDATE` com
`@Version` na mesma linha com 5, 50 e 200 threads, e plote vazão e taxa de retry. Depois refaça o
mesmo cenário como inserção append-only e compare. O ponto onde as curvas se cruzam é o argumento
que você vai usar numa revisão de arquitetura.

**Checagem**

1. Por que UUIDv4 encarece o índice, e o que exatamente o UUIDv7 preserva?
2. Por que `UNIQUE` não resolve unicidade num sistema shardado, e qual é a saída mais barata?
3. Por que Redlock não protege contra uma pausa de GC, e o que o fencing token muda?
4. Quando a concorrência otimista deixa de funcionar, e quais são os três caminhos de reformulação?

## Principais aprendizados

- Chave aleatória fragmenta a B-tree: UUIDv7 gera sem coordenação e preserva a locality, e o
  prefixo temporal vaza informação — daí a chave interna e o identificador público serem dois.
- `UNIQUE` é local; num sistema shardado, redefina a unicidade para caber na partição antes de
  construir um serviço dedicado.
- Sequência global sem buracos é ponto de serialização; o requisito real quase sempre é
  "auditável e não previsível".
- Redlock não protege contra pausa de GC — a correção é o fencing token verificado por quem
  escreve, ou uma operação idempotente.
- Otimista inverte sob contenção alta: agregado menor, evento no lugar de `UPDATE`, ou linha
  quente particionada.
