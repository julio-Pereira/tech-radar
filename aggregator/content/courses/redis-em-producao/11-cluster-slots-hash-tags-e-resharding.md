---
id: cluster-slots-hash-tags-e-resharding
title: "Cluster: slots, hash tags e resharding"
summary: "O cluster divide o espaço em 16.384 slots, e a atomicidade, os scripts e as operações multichave só existem dentro de um slot. Desenhar a chave é desenhar o que pode ser atômico. CRC16 e hash slots; MOVED × ASK; cliente que conhece o mapa; hash tags e o slot quente; failover por shard; resharding e a migração atômica de cada motor. Medido nos dois motores: 100 mil contas ficaram a 0,1% da média por primário, e {pix} em tudo pôs as 100 mil num nó só; 1.000 slots migraram sob carga sem nenhum erro visível; e, com as opções padrão, o go-redis levou mais de um minuto para voltar a escrever depois de um primário cair."
estimatedMinutes: 60
reviewedAt: 2026-11-22
reviewEvery: 6m
competencies: [dados, arquitetura]
references:
  - title: "Redis — Scale with Redis Cluster"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/
  - title: "Redis — Cluster specification"
    url: https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/
  - title: "Valkey — Cluster tutorial"
    url: https://valkey.io/topics/cluster-tutorial/
---

## 16.384 slots

O cluster divide o espaço de chaves em **16.384 *hash slots***. O *slot* de uma chave é
`CRC16(chave) & 0x3FFF`, conferido no `cluster.c` dos dois motores. Cada primário é dono de um conjunto de *slots*, e
cada um tem as suas réplicas. Com 3 primários, cada um fica com cerca de 5.461.

A consequência que define este marco: **um comando, um `MULTI` ou um script só funciona se todas as chaves estiverem
no mesmo *slot***. Chaves em *slots* diferentes podem estar em nós diferentes, e o cluster não coordena nada entre nós.
O erro é `CROSSSLOT Keys in request don't hash to the same slot`.

## MOVED, ASK e o cliente que conhece o mapa

Um nó que recebe um comando para um *slot* que não é dele responde com redirecionamento:

- **`MOVED <slot> <endereço>`:** o *slot* mora em outro nó, de vez. O cliente atualiza o mapa e repete lá;
- **`ASK <slot> <endereço>`:** o *slot* está **no meio de uma migração**, e esta chave já foi para o destino. O cliente
  repete **só este comando** no destino, precedido de `ASKING`, sem atualizar o mapa.

Um cliente de *cluster* (o `ClusterClient` do go-redis, o `RedisClusterClient` do Lettuce) guarda o mapa de *slots* e
manda cada comando direto ao dono. Os redirecionamentos são o mecanismo de correção, e não o caminho normal.

## Hash tags: desenhar o que pode ser atômico

Se a chave tem `{...}`, só o trecho entre as chaves entra no CRC16. `pix:lim:{conta:42}` e `pix:lim:uso:{conta:42}`
caem no mesmo *slot*, porque os dois têm a tag `conta:42`. A ***hash tag*** é como se escolhe o que fica junto:

- o débito do marco 04 toca o disponível e o registro de uso da **mesma conta**: tag `{conta:<id>}`;
- o limite noturno do marco 06 toca CPF, conta e dispositivo do **mesmo cliente**: tag `{cpf:<id>}`;
- o *lease* do marco 07 e o seu *fencing token*: tag `{<job>}`.

No laboratório, nos dois motores, o script do débito rodou com as chaves `pix:lim:{conta:42}` e
`pix:lim:uso:{conta:42}`, ambas no *slot* 1351. As mesmas chaves sem a tag voltaram `CROSSSLOT`. O `fin-kv` declara um
construtor de chaves por script e tem um teste **estático** que falha se alguma chave de um script não compartilhar a
tag das outras.

O limite noturno tem uma escolha embutida. O contador do dispositivo só cabe no *slot* do CPF se for **por cliente**
(`pix:lim:{cpf:123}:disp:d1`). Um contador global por dispositivo, compartilhado entre clientes, não pode ter a tag de
nenhum deles, e por isso sai do script atômico e vira uma verificação separada. O ADR registra a troca.

### O slot quente

A tag concentra de propósito, e concentrar demais é o defeito. O laboratório gravou 100 mil contas de dois jeitos:

| 100 mil chaves em 3 primários | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| tag por conta, `pix:lim:{conta:<id>}` | 33.327 / 33.383 / 33.290 (pior desvio de **0,1%**) | igual |
| tag única, `{pix}:lim:conta:<id>` | 0 / **100.000** / 0 | igual |

> **Armadilha.** Colocar `{pix}` como *hash tag* em todas as chaves "para os scripts funcionarem". Funciona: tudo
> fica num *slot* só, e nenhum script dá `CROSSSLOT`. O cluster inteiro vira um nó. Ele recebe todo o tráfego e toda a
> memória, e os outros primários ficam ociosos. A tag tem a granularidade da operação atômica, e nada além disso.

A *hot key* do marco 01 é o mesmo problema numa chave só. Um *slot* quente nasce de uma tag larga demais. Uma chave
quente nasce do tráfego, e a tag não resolve: a saída é a réplica da chave com sufixo, de `dados-distribuidos/09`.

## Failover por shard

Cada primário tem réplicas, e o *failover* é por *shard*: quando um primário fica inalcançável por mais que
`cluster-node-timeout` (padrão de **15 s** nos dois motores; 2 s no laboratório), os outros primários votam, e a réplica
assume os *slots* dele. A replicação continua assíncrona, com a mesma perda do marco 10 sob partição.

Dois detalhes apareceram no laboratório. O primeiro: uma réplica que **nunca terminou a primeira sincronização** não
assume. Derrubar um primário logo depois de criar o cluster, antes de o `repl-diskless-sync-delay` de 5 s passar,
deixou os *slots* dele sem dono.

O segundo é do cliente: quanto tempo ele leva para descobrir o novo dono dos *slots*.

| Depois de derrubar um primário (Redis / Valkey) | voltou a escrever no slot dele |
| --- | --- |
| Lettuce 7.9, opções padrão | 8,8 s / 8,8 s |
| go-redis v9.23, `ClusterStateReloadInterval: 2s` | 6,5 s / 5,3 s |
| go-redis v9.23, opções padrão | **1min46s / 1min19s** |

O go-redis recarrega o mapa de *slots* em `MOVED`, `ASK` e erro de réplica somente leitura, e periodicamente, a cada
`ClusterStateReloadInterval`, que é de **60 s** por padrão (`osscluster.go`). Um erro de discagem para o nó morto **não**
dispara a recarga. Com o IP do nó morto sem resposta, cada comando ainda espera o *timeout* de discagem e as
tentativas, e o mapa velho fica no lugar por mais de um minuto. O Lettuce recarrega o mapa pelos gatilhos adaptativos,
que vêm todos ligados por padrão no 7.9 (`ClusterTopologyRefreshOptions`), entre eles as reconexões persistentes. O
marco 12 volta às opções do cliente.

## Resharding

Mover *slots* entre primários é o ***resharding***. A forma clássica, `redis-cli --cluster reshard` (ou
`valkey-cli`), migra chave a chave com `MIGRATE`. Enquanto um *slot* migra, as chaves que já foram respondem `ASK` na
origem, e um comando multichave com chaves dos dois lados recebe `TRYAGAIN`.

> **Diferença Redis × Valkey.** Os dois motores ganharam migração **atômica** de *slots*, com comandos diferentes.
> No Redis 8.4+, o destino importa: `CLUSTER MIGRATION IMPORT <início> <fim>`. No Valkey 9.0+, a origem envia:
> `CLUSTER MIGRATESLOTS SLOTSRANGE <início> <fim> NODE <id>`. O Valkey também tem `cluster-databases`, para usar mais de
> um banco no modo *cluster* (padrão 1), e o `CLUSTERSCAN` (9.1), que varre o *cluster* inteiro. O Redis não tem
> nenhum dos dois.

O laboratório moveu 1.000 *slots* de um primário para outro, com 8 clientes executando o script do débito do marco 04
sem parar, sobre 2 mil contas:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| `--cluster reshard` (`MIGRATE`): duração | 1,1 s | 7,1 s |
| migração atômica: duração | até 0,1 s (a resolução da medição) | até 0,1 s |
| erros visíveis ao cliente, nos dois modos | **0** | **0** |
| contas com disponível + uso ≠ limite, depois | **0** | **0** |

O go-redis tratou os redirecionamentos sozinho, e o invariante do marco 04 valeu durante a migração. O volume era
pequeno, 2 mil contas. Com milhões de chaves por *slot*, a migração clássica leva mais, e a janela de `ASK` e
`TRYAGAIN` fica maior.

## Quando o cluster não compensa

O cluster resolve um problema: o conjunto de dados, ou a vazão de escrita, não cabe num primário. Ele cobra em tudo o
que é multichave, no desenho das tags e na operação. Se o dado cabe numa instância e o problema é disponibilidade,
o Sentinel do marco 10 ou um gerenciado (marco 13) resolvem com menos peças.

## Exemplo numa fintech

O `fin-kv` foi para o cluster quando o `kv-estado` passou de um primário. O mapa das tags:

| Uso | Chaves | Tag |
| --- | --- | --- |
| débito do limite (04) | disponível e uso da conta | `{conta:<id>}` |
| limite noturno (06) | total do CPF, conta, dispositivo do cliente | `{cpf:<id>}` |
| *lease* do job (07) | *lease* e *fencing token* | `{<job>}` |
| idempotência (05) | uma chave por requisição | nenhuma: cada chave vai para o seu *slot* |
| contador global do antifraude | um por regra | **nenhuma**, e é proibido ter: ele seria um *slot* quente |

O contador global do antifraude é o caso de "não pode ter tag". Ele é atualizado por todo pagamento, e a tag o
amarraria ao *slot* de outra coisa, somando os dois tráfegos. Ele fica sozinho e, quando virou *hot key*, foi
fatiado em 16 sufixos somados na leitura.

## Hands-on

**Tutorial.** Suba a topologia `cluster`, com 3 primários e 3 réplicas, e espere as réplicas sincronizarem antes de
qualquer teste de *failover*:

```bash
redis-cli --cluster create n1:6379 n2:6379 n3:6379 n4:6379 n5:6379 n6:6379 --cluster-replicas 1 --cluster-yes
```

```go
rdb := redis.NewClusterClient(&redis.ClusterOptions{Addrs: nos,
    ClusterStateReloadInterval: 2 * time.Second}) // o padrão de 60 s deixa o mapa velho por mais de um minuto
n, err := debitar.Run(ctx, rdb, []string{"pix:lim:{conta:42}", "pix:lim:uso:{conta:42}"}, valor, id).Int()
```

```java
var cli = RedisClusterClient.create(uris); // no Lettuce 7.9, a atualização adaptativa do mapa vem ligada
var conn = cli.connect();
Long ok = conn.sync().evalsha(sha, ScriptOutputType.INTEGER,
        new String[] {"pix:lim:{conta:42}", "pix:lim:uso:{conta:42}"}, String.valueOf(valor), id);
```

**Desafio.** Levar o `fin-kv` para o cluster: o mapa de tags, os scripts sem `CROSSSLOT` e o *resharding* sob carga.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, o de número 4.

1. Os scripts do 04 e do 06 rodam no cluster sem `CROSSSLOT`, e um teste estático garante que todas as chaves de cada
   script, o do 07 incluído, compartilham a *hash tag*.
2. Com 100 mil contas sintéticas, a distribuição de chaves entre os primários fica dentro de ±10% da média. O teste
   prova também que a tag única põe tudo num nó.
3. Um *resharding* de 1.000 *slots* sob carga não gera erro visível ao cliente além dos redirecionamentos tratados, e o
   invariante do 04 continua valendo durante a migração.
4. Derrubar um primário promove a réplica, e os clientes Java e Go atualizam o mapa de *slots* sem reinício. O teste
   mede quanto tempo cada um leva.

**Complemento.** Repita o invariante 3 com 1 milhão de contas e a migração clássica. Quantos `TRYAGAIN` o script do
débito recebe, e o que o cliente deve fazer com eles?

**Checagem**

1. Qual é a diferença entre `MOVED` e `ASK`, e o que o cliente faz com cada um?
2. Por que a *hash tag* define o que pode ser atômico, e qual é a tag do débito do marco 04?
3. O que acontece quando todas as chaves usam a mesma tag?
4. Quando o Sentinel resolve melhor que o cluster?

> **Reencontro — `dados-distribuidos/03`; `system-design/07`; `kubernetes/08`.** Os *slots* são o
> particionamento por *hash* de `dados-distribuidos/03`, e o *slot* quente é a partição quente de lá. O mapa de tags é
> uma decisão de estado de `system-design/07`: o que precisa ficar junto para ser atômico. E rodar o cluster no
> Kubernetes é o problema de estado do `StatefulSet` e dos *operators* de `kubernetes/08`.

## Principais aprendizados

- 16.384 *slots*, `CRC16(chave) & 0x3FFF`. Comando multichave, `MULTI` e script só funcionam num *slot*.
- `MOVED` atualiza o mapa. `ASK` vale para um comando, durante a migração.
- A *hash tag* define o que pode ser atômico. Tag por conta deixou 100 mil chaves a 0,1% da média. `{pix}` em tudo pôs
  as 100 mil num nó.
- O *failover* é por *shard* e assíncrono, como no marco 10. Uma réplica que nunca sincronizou não assume.
- Com as opções padrão, o go-redis levou mais de um minuto para escrever de novo depois de um primário cair, porque o
  mapa só recarrega a cada 60 s. Com 2 s, foram 5 a 6,5 s. O Lettuce levou 8,8 s.
- 1.000 *slots* migraram sob carga sem erro visível, nos dois modos. A migração atômica tem comandos diferentes em cada
  motor.
