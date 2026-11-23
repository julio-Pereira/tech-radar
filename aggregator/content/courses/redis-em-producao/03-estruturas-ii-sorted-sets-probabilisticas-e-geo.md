---
id: estruturas-ii-sorted-sets-probabilisticas-e-geo
title: "Estruturas II: sorted sets, probabilísticas e geo"
summary: "As estruturas avançadas resolvem numa chamada O(log N) o que seria uma tabela com índice, e as probabilísticas trocam exatidão por memória com um erro que você precisa saber declarar. Sorted sets como janela temporal, fila de prioridade e agenda; bitmaps; HyperLogLog; Bloom filter e a família probabilística, que vem no Redis 8 e só pelo Valkey Bundle; geo. Medido nos dois motores: o sorted set acertou 18 de 18 janelas, o HyperLogLog errou no máximo 2,27% em 1.000 janelas, e o Bloom pedido com 1% mediu 0,5% no Redis e 1,06% no Valkey Bundle, sem nenhum falso negativo."
estimatedMinutes: 55
reviewedAt: 2026-11-19
reviewEvery: 6m
competencies: [dados]
references:
  - title: "Redis — Sorted sets"
    url: https://redis.io/docs/latest/develop/data-types/sorted-sets/
  - title: "Redis — HyperLogLog"
    url: https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglogs/
  - title: "Redis — Bloom filter"
    url: https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/
  - title: "Valkey Bundle"
    url: https://valkey.io/topics/valkey-bundle/
---

## Sorted sets

O ***sorted set*** é um *set* em que cada membro tem um *score* numérico, e os membros ficam ordenados por
ele. Por dentro, quando passa dos limiares do marco 02 (128 membros ou um membro acima de 64 bytes), ele é
uma ***skiplist*** e um dicionário juntos. A *skiplist* dá a ordem e a busca por faixa em O(log N), e o
dicionário dá o *score* de um membro em O(1).

As operações que importam:

- `ZADD` (O(log N) por membro), com as opções `NX`, `XX`, `GT` e `LT`. `ZADD GT` só atualiza o *score* se
  o novo for maior, o que guarda "a última vez que vi este membro" sem ler antes;
- `ZRANGE` (O(log N + M), M = devolvidos), com `BYSCORE`, `REV` e `LIMIT`;
- `ZREMRANGEBYSCORE` (O(log N + M), M = removidos);
- `ZCARD` (O(1)) e `ZSCORE` (O(1));
- `ZPOPMIN` (O(log N × M)), que retira os de menor *score*.

Com elas, três padrões saem prontos:

- **Janela temporal.** O *score* é o instante, `ZREMRANGEBYSCORE` corta o que saiu da janela, e `ZCARD`
  conta o que ficou. A contagem é **exata**.
- **Fila de prioridade.** O *score* é a prioridade, e `ZPOPMIN` entrega o mais urgente.
- **Agenda.** O *score* é o instante de execução, e um *worker* busca o que venceu com `ZRANGE BYSCORE -inf
  agora`.

O custo é a memória: cada membro paga a entrada na *skiplist* e no dicionário. No laboratório, a janela de
uma chave Pix com 212 pagadores distintos ocupou **34 KB** no Redis e **32 KB** no Valkey.

## Bitmaps

O ***bitmap*** não é uma estrutura à parte: é uma *string* tratada como vetor de bits. `SETBIT` (O(1)) liga
o bit de uma posição, e `BITCOUNT` (O(N) nos bytes) conta os ligados. `BITFIELD` (O(1) por subcomando) lê e
escreve inteiros de largura arbitrária dentro da *string*.

O uso típico é presença: um bit por cliente por dia, na posição do identificador numérico dele. Para 10
milhões de clientes, o *bitmap* do dia tem 1,25 MB. O identificador tem de ser denso: um id esparso, como um
número sequencial que começa em 10⁹, cria um *bitmap* enorme de zeros.

## HyperLogLog

O ***HyperLogLog*** (HLL) estima quantos elementos **distintos** passaram por ele sem guardá-los. `PFADD`
(O(1) por elemento) registra, e `PFCOUNT` (O(1) para uma chave) estima. A implementação usa 2¹⁴ = 16.384
registradores, o que dá um erro padrão de 1,04/√16384 ≈ **0,81%** e ocupa **12 KB** quando denso. Esses
números são os mesmos nos dois motores, conferidos no código (`HLL_P 14`). Com poucos elementos, o HLL usa
uma representação esparsa muito menor: com os mesmos 212 pagadores, ele ocupou 791 B nos dois motores e
estimou 211.

Duas propriedades decidem quando ele serve:

- o erro é **estatístico**: 0,81% é o erro padrão, e não o máximo. Em 1.000 janelas de 1.000 a 51.000
  elementos, o pior desvio medido foi de **2,27%** no Redis, perto do limite de 3 erros padrão (2,44%);
- ele **não remove**. Um HLL não sabe tirar o pagador que saiu da janela. Para uma janela de 1 hora, você
  guarda um HLL por intervalo fixo e soma com `PFMERGE` (O(N) nos HLLs), o que dá uma janela em degraus, e
  não deslizante.

> **Armadilha.** Usar HyperLogLog para contar algo que vai para um relatório regulatório ou para uma regra
> que bloqueia cliente. O número é aproximado **por definição**: um erro de 2% em 1.000 janelas é o
> comportamento esperado, e não um *bug*. Contagem que precisa ser defendida diante de um auditor vem de
> uma estrutura exata (o *sorted set*, ou o banco). O HLL serve para painel e para sinal.

## Bloom filter e a família probabilística

O ***Bloom filter*** responde "este item já foi visto?" com duas respostas possíveis: **"não"**, que é
definitivo, e **"talvez"**, que erra numa taxa que você escolhe ao criar o filtro. Ele **nunca** dá falso
negativo. `BF.RESERVE chave taxa capacidade` cria o filtro, e `BF.ADD` e `BF.EXISTS` (O(k), k = número de
funções de *hash*) gravam e consultam. As variantes `BF.MADD` e `BF.MEXISTS` fazem vários de uma vez.

A mesma família tem o ***Cuckoo filter*** (como o Bloom, mas aceita remoção), o ***Count-Min Sketch***
(frequência aproximada de cada item) e o **Top-K** (os K itens mais frequentes).

> **Diferença Redis × Valkey.** No Redis 8, Bloom, Cuckoo, Count-Min Sketch, Top-K e t-digest vêm na
> distribuição principal. No Valkey, o núcleo não tem nenhum deles. O **Valkey Bundle** (imagem
> `valkey/valkey-bundle`) traz o módulo `bf`, que só implementa os comandos `BF.*`: sem Cuckoo, sem
> Count-Min Sketch, sem Top-K. As duas implementações também se comportam diferente. No laboratório, o
> mesmo filtro com 1% e 100 mil itens mediu **0,49–0,50%** de falso positivo com **138 KB** no Redis, e
> **1,01–1,06%** com **120 KB** no Valkey Bundle. Os 120 KB são o mínimo teórico para 1%, e o Redis reserva
> mais bits e erra menos. Teste o que você vai usar no motor em que vai rodar.

Um detalhe que pega quem usa o Bloom para deduplicar: o `BF.ADD` devolve 0 quando o item "talvez já
estava". Isso é um falso positivo na gravação. No laboratório, 65 dos 100 mil itens novos voltaram 0 no
Redis. Um Bloom não serve de registro de idempotência, que precisa de resposta exata (marco 05).

## Geo e o que fica fora

`GEOADD` (O(log N) por item) grava longitude e latitude num *sorted set*, codificadas no *score*.
`GEOSEARCH` (O(N + log M)) busca por raio ou retângulo. Numa fintech, isso serve para "agências num raio de
5 km" e para antifraude ("a compra aconteceu a 800 km do último acesso, 10 minutos depois").

JSON, Search e Vector Sets vêm na distribuição do Redis 8. JSON e Search existem no Valkey Bundle, e Vector
Sets não. Eles são outros produtos sobre o mesmo motor e ficam fora desta trilha.

## Exemplo numa fintech

O antifraude do `ledger-core` usa um sinal: **"esta chave Pix recebeu de quantos pagadores distintos na
última hora?"**. Uma conta laranja recebe de muitos pagadores em pouco tempo. O laboratório gerou 60 mil
transações Pix sintéticas em 6 horas, sobre 50 chaves, e calculou o sinal de duas formas:

- **sorted set:** membro = pagador, *score* = instante do último pagamento (`ZADD GT`). A cada consulta,
  `ZREMRANGEBYSCORE` corta o que tem mais de 1 hora e `ZCARD` conta. As 18 janelas testadas (3 chaves × 6
  horas) bateram com a contagem exata nos dois motores. Uma chave com 212 pagadores ocupou 34 KB;
- **HyperLogLog:** um HLL por janela. Ocupa até 12 KB por janela, erra em torno de 0,81% e não desliza.

O `fin-kv` usa o *sorted set* para o sinal que bloqueia, porque ele é exato e desliza, e porque um
bloqueio indevido precisa ser explicado ao cliente. O HLL fica para o painel de volume.

O **Bloom filter** entra antes do banco. O antifraude consulta uma base de chaves Pix já denunciadas, e
quase toda consulta é de uma chave limpa. Com o filtro na frente:

- "não" (a grande maioria) dispensa a consulta ao banco;
- "talvez" vai ao banco, que dá a resposta exata.

O falso positivo de 1% custa 1% de consultas desnecessárias, e é um custo, não um erro de decisão. O falso
negativo seria um erro de decisão, e o teste prova que ele não acontece.

## Hands-on

**Tutorial.** No `fin-kv`, escreva o gerador de transações Pix sintéticas (pagador, chave, instante),
com semente fixa, e grave a janela com `ZADD GT` em *pipeline*:

```go
p := rdb.Pipeline()
p.ZAddGT(ctx, k, redis.Z{Score: float64(x.em.Unix()), Member: x.pagador})
p.ZRemRangeByScore(ctx, k, "-inf", fmt.Sprintf("(%d", agora.Add(-time.Hour).Unix()+1))
card := p.ZCard(ctx, k)
_, err := p.Exec(ctx)
```

```java
// Lettuce; ZAddArgs.gt() equivale ao GT
cmd.zadd(k, ZAddArgs.Builder.gt(), (double) x.em().getEpochSecond(), x.pagador());
cmd.zremrangebyscore(k, Range.create(Double.NEGATIVE_INFINITY,
        (double) agora.minus(Duration.ofHours(1)).getEpochSecond()));
long card = cmd.zcard(k);
```

O `agora` vem do teste, e não do servidor. Um relógio injetado torna a janela determinística.

**Desafio.** Os contadores do antifraude: o sinal de pagadores distintos com *sorted set* e com HLL, e o
pré-filtro de chaves denunciadas com Bloom. Rode contra o Redis e contra o Valkey Bundle, porque o Valkey
puro não tem Bloom.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. O 3 roda contra o Valkey Bundle. No laboratório desta trilha, todos foram provados em Go e em Java.

1. A contagem de pagadores distintos pelo *sorted set* é idêntica à contagem exata calculada pelo teste
   sobre o mesmo *dataset*, em todas as janelas. No capstone, a contagem exata vem de SQL sobre o
   `fin-store`.
2. A estimativa do HyperLogLog fica dentro de 3 erros padrão (2,44%) da contagem exata em 1.000 janelas, e
   o teste registra a memória das duas abordagens.
3. Um Bloom filter reservado com 1% de falso positivo mede **no máximo 1,5%** sobre 100 mil consultas
   negativas e **zero** falso negativo sobre os 100 mil itens gravados.
4. Depois do `ZREMRANGEBYSCORE`, nenhum membro da janela tem *score* mais velho que 1 hora antes do
   `agora` injetado.

O teste do 3 lê a resposta do `BF.MEXISTS` nos dois formatos: inteiros no Valkey Bundle e booleanos em
RESP3 no Redis 8. A primeira versão deste teste no laboratório ignorava o erro de conversão do go-redis,
recebia uma lista vazia e "media" zero falso positivo sem ter medido nada. Por isso o teste exige uma
resposta por item consultado.

**Complemento.** Implemente a janela de 1 hora com HLL em degraus: um HLL por intervalo de 5 minutos e
`PFMERGE` dos 12 últimos. Meça o erro contra a janela deslizante exata. Quanto do erro vem do HLL e quanto
vem do degrau?

**Checagem**

1. Como um *sorted set* implementa uma janela deslizante, e qual é o custo de cada operação?
2. O que significa "0,81% de erro padrão" no HyperLogLog, e por que o pior caso em 1.000 janelas passou
   de 2%?
3. Qual das duas respostas do Bloom filter é definitiva, e por que isso o torna bom como pré-filtro e ruim
   como registro de idempotência?
4. Cite um uso no qual uma estrutura aproximada é inaceitável, e diga o que usar no lugar.

> **Reencontro — `seguranca-aplicacao/14`; `dados-distribuidos/14`.** O sinal de pagadores distintos é um
> dos controles de velocidade de `seguranca-aplicacao/14`, que é o dono do antifraude. Aqui ele ganha
> estrutura, custo e erro medidos. E a contagem aproximada é a mesma troca de exatidão por custo que o
> mundo analítico de `dados-distribuidos/14` faz com `COUNT DISTINCT` aproximado: serve ao painel, não ao
> número que vai para o regulador.

## Principais aprendizados

- O *sorted set* dá janela temporal, fila de prioridade e agenda com O(log N) por operação e contagem
  exata. O preço é a memória: 34 KB para 212 membros.
- O HyperLogLog conta distintos em até 12 KB com 0,81% de erro padrão. O erro é estatístico (o pior em
  1.000 janelas foi de 2,27%), e ele não remove.
- O Bloom filter nunca dá falso negativo. O "talvez" erra na taxa escolhida, inclusive na gravação, então
  ele serve de pré-filtro e não de registro de idempotência.
- No Redis 8, a família probabilística vem na distribuição. No Valkey, só o Bloom, pelo Valkey Bundle, com
  outra implementação e outro erro medido.
- Estrutura aproximada não entra em relatório regulatório nem em regra que bloqueia cliente.
- Teste que mede erro tem de provar que mediu: uma resposta por item, ou o zero é falso.
