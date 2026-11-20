---
id: estruturas-i-strings-hashes-listas-e-sets
title: "Estruturas I: strings, hashes, listas e sets — e como elas ocupam memória"
summary: "A estrutura certa não é a que \"cabe\" o dado: é a que torna barata a operação que você mais faz. E o motor troca a representação interna por baixo de você quando o dado cresce. Strings, hashes com expiração por campo, listas e sets; os encodings compactos e os limiares que os desfazem; MEMORY USAGE e OBJECT ENCODING; desenho de chave. Medido nos dois motores: um campo de 600 bytes converteu um hash de 197 B num de 1.225 B no Redis, que não voltou depois de apagar o campo, e três modelagens de sessão de consentimento ficaram entre 184 e 218 bytes por sessão."
estimatedMinutes: 55
reviewedAt: 2026-11-19
reviewEvery: 6m
competencies: [dados]
references:
  - title: "Redis — Data types"
    url: https://redis.io/docs/latest/develop/data-types/
  - title: "Redis — Memory optimization"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/
  - title: "Redis — HEXPIRE"
    url: https://redis.io/docs/latest/commands/hexpire/
  - title: "Valkey — Hashes"
    url: https://valkey.io/topics/hashes/
---

## A estrutura é escolhida pela operação

Todo valor no Redis é uma estrutura com operações próprias, e cada operação tem custo declarado. A pergunta
que escolhe a estrutura não é "onde cabe este dado?". É **"qual operação eu faço mais, e quanto ela custa
aqui?"**. Um contador numa *string* é um `INCR` O(1). O mesmo contador dentro de um JSON numa *string* é ler,
desserializar, somar, serializar e gravar, com uma corrida entre o ler e o gravar que o marco 04 resolve.

Este marco cobre as quatro estruturas básicas. O 03 cobre as avançadas.

## Strings

A *string* guarda bytes, até 512 MB. Ela tem três representações internas, que o `OBJECT ENCODING` mostra:

- `int`, quando o valor é um inteiro que cabe em 64 bits. `INCR` e `INCRBY` (O(1)) operam direto nele;
- `embstr`, quando o valor é curto e mora na mesma alocação do objeto;
- `raw`, para o resto.

`SETRANGE` (O(1), sem contar a cópia quando a *string* cresce) escreve num deslocamento. `GETEX` (O(1)) lê
e ajusta o TTL na mesma chamada, o que serve para renovar uma sessão a cada uso.

> **Diferença Redis × Valkey.** Os dois motores embutem o nome da chave, o valor curto e o TTL numa
> alocação só, mas com limites diferentes. No Redis 8.10, a soma tem de caber numa linha de cache de 64
> bytes. No Valkey 9.1, o limite é de 128 bytes. No laboratório, uma *string* de 44 bytes já era `raw` no
> Redis e continuava `embstr` no Valkey até 100 bytes. O limite não é um número a decorar: é o motivo para
> medir com `MEMORY USAGE` em vez de estimar.

## Hashes e a expiração por campo

O *hash* é um objeto com campos: `HSET` (O(1) por campo), `HGET` (O(1)) e `HGETALL` (O(N) no número de
campos). Ele é a forma natural de guardar uma entidade pequena, e o `HGETALL` só é barato enquanto o
*hash* é pequeno.

Até recentemente, o TTL era só da chave. Um *hash* com mil itens efêmeros obrigava a escolher entre mil
chaves soltas, cada uma com o próprio TTL, e um *hash* sem expiração por item. A **expiração por campo**
resolve parte disso. `HEXPIRE` (O(N) nos campos informados) põe TTL num campo. `HGETEX` e `HSETEX` leem ou
gravam ajustando o TTL do campo na mesma chamada.

> **Diferença Redis × Valkey.** `HEXPIRE` e família existem no Redis desde a 7.4 e no Valkey desde a 9.0.
> `HGETEX` e `HSETEX` chegaram no Redis 8.0 e no Valkey 9.0. Código que depende deles não roda num Valkey
> 8 nem num ElastiCache preso a uma versão anterior. Isso é uma restrição de compatibilidade a escrever no
> ADR, e não um detalhe.

## Listas

A lista é uma sequência com inserção e remoção O(1) nas pontas: `LPUSH`, `RPOP`. Por dentro, é uma
*quicklist*: uma lista ligada de nós, cada um um bloco compacto de até 8 KB (`list-max-listpack-size -2`,
o padrão nos dois motores). `LRANGE` é O(S+N): S é a distância até o início do trecho, e N o tamanho dele.
`LRANGE 0 -1` devolve tudo.

Uma lista serve de fila simples. O problema é o que acontece quando o consumidor cai entre retirar o item
e processá-lo: o item se perde. O `LMOVE` (O(1)) move o item atômicamente para uma lista "em
processamento", da qual o consumidor só remove depois de terminar. É o padrão de **fila confiável** sobre
listas. Ele funciona, mas a reentrega, o rastreio de quem está com o quê e o limite de tentativas ficam
com a aplicação. O marco 08 mostra como os Streams entregam isso pronto.

## Sets

O *set* é uma coleção sem repetição e sem ordem. `SADD` e `SISMEMBER` são O(1). `SMISMEMBER` (O(N) nos
membros consultados) testa vários de uma vez, num RTT só. `SMEMBERS` é O(N) no tamanho do *set*, e é o
`KEYS` das coleções. `SINTERCARD` (O(N×M) no pior caso) conta a interseção sem devolvê-la, e o `LIMIT` dele
para a contagem cedo. "Esses dois clientes têm mais de três dispositivos em comum?" não precisa da
interseção inteira.

## Encodings compactos e os limiares que os desfazem

Enquanto pequenas, as coleções são guardadas em **formato compacto**: o *listpack*, um bloco contíguo
percorrido em sequência, e o *intset*, para *sets* só de inteiros. A busca nesses formatos é O(N), mas com
N pequeno isso é mais rápido e muito mais econômico que uma tabela de *hash*. Quando a coleção passa de um
limiar, o motor a **converte** para a representação "grande" (tabela de *hash* ou *skiplist*).

Os limiares são os mesmos nos dois motores (Redis 8.10.3 e Valkey 9.1.4, conferidos no código e em
`CONFIG GET` em 19 nov 2026):

| Estrutura | Fica compacta enquanto | Configuração |
| --- | --- | --- |
| *hash* | até 512 campos **e** todo valor com até 64 bytes | `hash-max-listpack-entries`, `-value` |
| *set* de inteiros | até 512 membros | `set-max-intset-entries` |
| *set* | até 128 membros **e** todo membro com até 64 bytes | `set-max-listpack-entries`, `-value` |
| *sorted set* | até 128 membros **e** todo membro com até 64 bytes | `zset-max-listpack-entries`, `-value` |

Dois detalhes moram nessa tabela. A condição é **e**: um único valor acima de 64 bytes converte a
coleção inteira. E a conversão é **só de ida**: apagar o campo grande não traz a coleção de volta ao formato
compacto.

No laboratório, um *hash* de 10 campos curtos recebeu um campo de 600 bytes, que depois foi apagado:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| 10 campos curtos (`listpack`) | 197 B | 216 B |
| + 1 campo de 600 B (`hashtable`) | 1.225 B | 504 B |
| sem o campo grande (continua `hashtable`) | 554 B (2,8×) | 480 B (2,2×) |

Os dois instrumentos são `MEMORY USAGE chave` (O(N) nas amostras), que estima os bytes da chave, e `OBJECT
ENCODING chave` (O(1)).

> **Armadilha.** Um campo de 600 bytes num *hash* pequeno converte o *hash* inteiro de *listpack* para
> tabela e multiplica a memória. Isso acontece em produção, numa chave, sem aviso: um campo
> `observacao` que alguém passou a preencher com texto livre. Com milhões de chaves, a mesma mudança vira
> gigabytes. Limite o tamanho dos valores na aplicação e vigie a distribuição de `MEMORY USAGE` por
> prefixo.

## Desenho de chave

O nome da chave é dado e é custo. As regras do `fin-kv`:

- **namespace e separador:** `dominio:entidade:id`, com `:` (`ofb:sess:00000042`, `pix:idem:<chave>`).
  O prefixo permite ACL por padrão de chave (marco 13) e medir memória por prefixo;
- **tamanho:** o nome é guardado em cada chave. 20 bytes a mais em 2 milhões de chaves são 40 MB;
- **cardinalidade:** o que vai no nome tem de ter um universo conhecido. Um *timestamp* cru no nome cria
  uma chave por milissegundo;
- **nada sensível no nome:** nomes de chave aparecem no `SLOWLOG`, no `MONITOR`, nos *logs* do cliente e em
  ferramentas de análise de memória. CPF, e-mail ou *token* não vão no nome. Use um identificador interno.

A escolha entre **muitas chaves pequenas** e **um hash por grupo** é de memória contra controle. Cada chave
paga um custo fixo (a entrada no dicionário, o objeto, o nome), e um *hash* com muitos campos economiza
esse custo. Em troca, o grupo passa a ter um TTL só, e vira uma *big key* que mora num nó só do *cluster*. A
expiração por campo resolveu a primeira parte. A segunda continua.

## Exemplo numa fintech

O `fin-kv` guarda a **sessão de consentimento** do Open Finance: o identificador do consentimento, o
cliente, o escopo autorizado, o status e o instante de expiração. Ela é efêmera, com TTL, e a fonte da
verdade é o consentimento no transmissor (`open-finance-brasil/04`). O laboratório gravou 200 mil sessões
sintéticas em três modelagens e mediu o `used_memory` antes e depois:

| Modelagem | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| A: *string* JSON por sessão, TTL na chave | 218 B/sessão | 203 B/sessão |
| B: *hash* por sessão, TTL na chave | 196 B/sessão | 187 B/sessão |
| C: *hash* por balde de 1.000 sessões, TTL por campo (`HEXPIRE`) | 184 B/sessão | 203 B/sessão |

Ambiente: o mesmo do marco 01, com imagens fixadas por *digest* (19 nov 2026). Para 2 milhões de sessões
ativas, a diferença entre a maior e a menor modelagem é de uns 70 MB no Redis e de uns 30 MB no Valkey.

O balde da modelagem C tem 1.000 campos e passa do limiar de 512, então nunca foi compacto. O ganho dele
vem só de economizar o custo por chave, e ele inverte de motor para motor. O `fin-kv` escolheu a **B**, e o
ADR registra o porquê:

- fica a até 7% da menor nos dois motores;
- a sessão expira inteira com um TTL de chave, que funciona em qualquer versão;
- cada sessão é uma chave pequena e compacta, que o *cluster* do marco 11 distribui sem criar *big key*;
- `HGETALL` sobre cinco campos é barato, e a modelagem C precisaria de `HGET` com o campo certo para não
  ler mil sessões.

## Hands-on

**Tutorial.** No `fin-kv`, escreva o gerador de sessões sintéticas nas três modelagens, em Java e em Go.
Grave em *pipeline*, em lotes de 5.000, e meça o `used_memory` do `INFO memory` antes e depois:

```go
p := rdb.Pipeline()
k := fmt.Sprintf("ofb:sess:%08d", i)
p.HSet(ctx, k, "c", s.Consentimento, "u", s.Cliente, "s", s.Escopo, "t", s.Status, "e", s.Expira)
p.Expire(ctx, k, time.Hour)
```

```java
// Spring Data Redis: HashOperations sobre um RedisTemplate<String, String>
var k = "ofb:sess:%08d".formatted(i);
template.opsForHash().putAll(k, Map.of("c", s.consentimento(), "u", s.cliente(),
        "s", s.escopo(), "t", s.status(), "e", Long.toString(s.expira())));
template.expire(k, Duration.ofHours(1));
```

O `RedisTemplate` do Spring Data Redis 4.1 usa serialização JDK por padrão, que grava bytes ilegíveis e
maiores. Configure `StringRedisSerializer` para chaves e campos. O marco 12 volta a esse ponto.

**Desafio.** Escolher a modelagem do `fin-kv` e defendê-la com número, nos dois motores, num ADR curto.

**Invariantes testáveis**

Todos rodam contra o Redis **e** o Valkey, em Java e em Go.

1. O teste reporta a memória média por sessão nas três modelagens. A escolhida é a menor ou tem
   justificativa escrita no ADR.
2. Um *hash* de 10 campos curtos é `listpack`. Um campo acima de `hash-max-listpack-value` o converte para
   `hashtable`, com salto de `MEMORY USAGE`, e apagar esse campo **não** o devolve a `listpack`.
3. Toda chave do *dataset* segue o padrão declarado, validado por expressão regular sobre um `SCAN`
   completo. O teste prova que o validador pega uma *fixture* com nome fora do padrão.
4. Nenhuma chave que o mapa de estado classifica como efêmera fica sem TTL. O teste prova que o validador
   pega uma *fixture* sem TTL.

**Complemento.** Repita a modelagem C com baldes de 100 sessões, abaixo do limiar de 512. O balde vira
`listpack`? A memória por sessão cai abaixo da B? Lembre que a sessão JSON tem mais de 64 bytes.

**Checagem**

1. O que converte um *hash* de *listpack* para tabela, e por que apagar o campo grande não desfaz?
2. O que você ganha e o que perde trocando mil chaves soltas por um *hash* com mil campos?
3. O que a expiração por campo resolveu, e a partir de que versão de cada motor ela existe?
4. Quando um `HGETALL` deixa de ser barato?

> **Reencontro — `open-finance-brasil/04`; `seguranca-aplicacao/05`.** A sessão daqui é o estado efêmero
> do consentimento de `open-finance-brasil/04`, que continua sendo a fonte da verdade: o Redis guarda uma
> cópia com prazo. A regra de não pôr dado sensível no nome da chave e a de dar TTL a todo estado de sessão
> são o mesmo cuidado de `seguranca-aplicacao/05` com *token* e sessão: o que vaza por *log* não pode
> identificar ninguém, e o que é efêmero precisa morrer sozinho.

## Principais aprendizados

- Escolha a estrutura pela operação que você mais faz e pelo custo dela, não pelo formato do dado.
- Coleções pequenas são guardadas em formato compacto. Um único valor acima de 64 bytes, ou mais de 512
  campos num *hash*, converte a coleção inteira, e a conversão é só de ida.
- `MEMORY USAGE` e `OBJECT ENCODING` são os instrumentos. Os limites internos mudam de motor para motor
  e de versão para versão.
- A expiração por campo (`HEXPIRE`) existe no Redis 7.4+ e no Valkey 9.0+. Fora disso, TTL é por chave.
- O nome da chave tem namespace, tamanho, cardinalidade conhecida e nada sensível.
- As três modelagens de sessão ficaram a menos de 20% umas das outras. O `fin-kv` escolheu o *hash* por
  sessão pelo TTL simples e pela ausência de *big key*, e não pelo menor número.
