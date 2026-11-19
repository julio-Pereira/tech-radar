# Auditoria — trilha `redis-em-producao`

Registro da trilha "Redis em Produção para Fintech": decisões, conferências na fonte primária e o estado de
cada fase. O projeto guia é o `fin-kv` (`aggregator/content/courses/redis-em-producao/PROJETO.md`).

## Fase 0 — decisões, conferências e esqueleto (19 nov 2026)

### Decisões do mantenedor (§0 do plano)

| Decisão | Escolha |
| --- | --- |
| Posição no catálogo | agora: a fila do [D8] já foi toda publicada, até o adendo de sinais |
| Nome do projeto guia | `fin-kv` |
| Motor de referência | o texto se apoia no Redis Open Source 8.x, o Valkey 9.x é o alvo de compatibilidade, e a suíte roda contra os dois |

**A "matriz de CI" é a do `fin-kv`.** Como no `fin-assist`, os artefatos do *capstone* ficam no
repositório de quem estuda (`capstones.yaml` confere `fin-kv/` e `make invariantes`). O `PROJETO.md` traz
a matriz com as duas imagens fixadas por *digest*. Cada invariante é provado localmente, contra os dois
motores, antes de ir para o marco.

### Como foi conferido

A documentação oficial do Redis e do Valkey está bloqueada neste ambiente. Por isso, a conferência usou a
fonte mais direta que existe: o código-fonte e os arquivos de licença nas *tags* das versões de referência
(`redis/redis` 8.10.3 e `valkey-io/valkey` 9.1.4). Os principais arquivos foram:

- os `.conf`;
- o `src/config.c`, com os padrões de configuração;
- os JSON de `src/commands/`, com a versão em que cada comando entrou;
- os *release notes*.

Os comandos foram rodados nas imagens oficiais. Para os gerenciados e o Jepsen, a busca ficou restrita aos
domínios oficiais.

### Versões e imagens

| Item | Conferido |
| --- | --- |
| Redis | 8.10.3 (`redis:8.10.3@sha256:1f88291b4c57bdf249f02eb085a8669889b2d2954e91d4de5118a5da6b78dd53`) |
| Valkey | 9.1.4, GA da 9.1 em 19 mai 2026 (`valkey/valkey:9.1.4@sha256:3ab0eca823ebbf0fe352476ebac330ac9e5f14b592b9a954eab296d341e81b0e`) |
| Valkey Bundle | `valkey/valkey-bundle:9.1.4@sha256:c64007296a2a38398d4be63847e1c9890954e45574c16cbe607883ba71c6b985`. **A *tag* 9.1.4 roda o Valkey 9.1.3**: o *bundle* anda uma versão atrás |
| Lettuce / go-redis / Spring Data Redis | 7.9.0 / v9.23.0 / 4.1.2 |
| Licença do Redis | RSALv2, SSPLv1 ou AGPLv3, à escolha, desde o 8.0; o 7.2 e anteriores ficam na BSD-3 (`LICENSE.txt` e redis.io/legal/licenses) |
| Licença do Valkey | BSD-3-Clause (`COPYING`) |

### Os itens "conferir" do plano

| Item | Resultado |
| --- | --- |
| I/O threads | nos dois motores, as *threads* de I/O fazem leitura, escrita e *parsing* do protocolo, e a execução dos comandos continua numa *thread* só. O padrão é `io-threads 1` (desligado). No Redis, o valor é imutável em execução; no Valkey, pode mudar |
| Expiração por campo de hash | `HEXPIRE` e família entraram no Redis 7.4 e no Valkey 9.0. O `HGETEX`/`HSETEX` entraram no Redis 8.0 e no Valkey 9.0 |
| Limiares de *encoding* | iguais nos dois: `hash-max-listpack-entries 512`, `hash-max-listpack-value 64`, `set-max-intset-entries 512`, `set-max-listpack-entries 128`, `set-max-listpack-value 64`, `zset-max-listpack-entries 128`, `zset-max-listpack-value 64`, `list-max-listpack-size -2`. A armadilha do marco 02 (um campo de 600 bytes converte o hash) vale para qualquer campo acima de 64 bytes |
| HyperLogLog | `HLL_P 14`: 16.384 registradores de 6 bits (12 KB), com erro padrão de 1,04/√16384 ≈ 0,81% |
| Probabilísticas | o Redis 8.10 embute os módulos RedisBloom, RediSearch, RedisJSON e RedisTimeSeries, e o Vector Sets; Bloom, Cuckoo, Count-Min Sketch, Top-K e t-digest respondem na imagem oficial. O Valkey não traz nenhum no núcleo; no **Valkey Bundle**, o módulo Bloom só tem os comandos `BF.*`, sem Cuckoo, Count-Min Sketch nem Top-K. É caixa "diferença" no marco 03 |
| Lua no Valkey 9.1 | o motor Lua virou um módulo do servidor (9.1.0-rc1) e passou a ser *linkado* estaticamente por padrão (rc2). Ele só sai se o servidor for compilado com `BUILD_LUA=no`. Na imagem oficial, o `EVAL` funciona, e o `MODULE LIST` mostra `lua` |
| Comparar e apagar | no **Redis 8.4**, `DELEX chave IFEQ valor`, além de `IFNE`, `IFDEQ` e `IFDNE` por *digest*, e `SET ... IFEQ` e afins; no **Valkey 9.0**, `DELIFEQ chave valor`, e o `SET ... IFEQ` existe desde o Valkey 8.1. Um não aceita o comando do outro |
| `WAITAOF` | existe nos dois, desde a 7.2 |
| Migração atômica de *slots* | Redis 8.4: `CLUSTER MIGRATION`, e o `redis-cli --cluster reshard` passa a usá-la; Valkey 9.0: `CLUSTER MIGRATESLOTS`, `CLUSTER GETSLOTMIGRATIONS` e `CLUSTER CANCELSLOTMIGRATIONS` |
| Vários bancos em modo *cluster* | só no Valkey: `cluster-databases`, imutável, padrão 1 |
| Número de *slots* | 16.384 nos dois (`CLUSTER_SLOTS`) |
| Lettuce | *timeout* de comando padrão de **60 s** (`RedisURI.DEFAULT_TIMEOUT`), reconexão automática e fila de requisições ilimitada (`Integer.MAX_VALUE`). No *cluster*, os gatilhos de *adaptive refresh* vêm todos ligados, e o *refresh* periódico vem desligado |
| go-redis | `MaxRetries` padrão de **3**; `ReadTimeout`, `WriteTimeout` e `DialTimeout` de 5 s; `PoolSize` de 10 × `GOMAXPROCS`. No código (`shouldRetry` e `retryTimeout`), um *read timeout* de um comando comum **é repetido**: um `INCR` que o servidor executou pode contar de novo. É a premissa do marco 12, e vai ser medida |
| Spring Data Redis 4.1 | o `RedisTemplate` e o `RedisCacheConfiguration.defaultCacheConfig()` usam serialização Java (`JdkSerializationRedisSerializer`) por padrão |
| ElastiCache e MemoryDB | o ElastiCache aceita Valkey, Memcached e Redis OSS até a 7.1. A **durabilidade** (*log* transacional Multi-AZ) é recurso do Valkey 9.0+ em *cluster* baseado em nó, não no *serverless*: na escrita síncrona não há perda; na assíncrona, até 10 s ficam em risco. A AWS recomenda esse modo para durabilidade numa região só, e o MemoryDB para replicação ativa-ativa entre regiões. Muda o texto do marco 13 |
| Azure | o Azure Cache for Redis se aposenta (Enterprise em 31 mar 2027; Basic, Standard e Premium em 30 set 2028), e o sucessor é o Azure Managed Redis. Já conferido na auditoria do `azure-para-backend`, e `azure-para-backend/07` já usa o nome novo |
| Jepsen | não há análise do Redis 8 nem do Valkey. A mais recente que toca no assunto é a do Orkes Conductor 5.3.2 (20 out 2026): com o Redis como banco e fila, escritas confirmadas se perderam em *kill* e partição, e o relatório afirma que Redis Cluster e Sentinel perdem escritas confirmadas sob partição. **A versão do Redis testada não foi confirmada.** A fonte entra pela afirmação geral (replicação assíncrona), que vale para a versão de referência |

### Divergências e novidades que o plano não previa

- **`lazyfree-lazy-user-del`:** o padrão é `no` no Redis e `yes` no Valkey. Lá, o `DEL` de uma chave
  grande libera a memória em segundo plano, como o `UNLINK`, e não aparece no `SLOWLOG`. O invariante 3
  do marco 01 vale no Redis e não no Valkey, e vai ter caixa "diferença" e o invariante parametrizado
  pelo motor.
- **`repl-backlog-size`:** o padrão é 1 MB no Redis e 10 MB no Valkey. Entra no marco 10.
- **`INCREX` (Redis 8.8):** incrementa e define a expiração num comando atômico. Com `UBOUND` e `ENX`,
  faz uma janela fixa com teto. Conferido: os três primeiros incrementos com `UBOUND 3` respondem `1`, o
  quarto responde `0` sem incrementar, e o TTL não muda. É a correção nativa da armadilha do marco 06,
  só no Redis.
- **GCRA nativo:** existe no código do Redis 8.10 (`gcra.c`, baseado no `redis-cell`), mas atrás de
  `ENABLE_GCRA`, que nenhum Makefile liga. Não é um comando disponível, e o marco 06 continua com o
  *script*.
- **Outros comandos novos que entram nos marcos:**
  - `HOTKEYS` (Redis 8.6): rastreia *hot keys* no servidor. Entra no marco 01.
  - `XCFGSET` (Redis 8.6): produtor idempotente em Streams. Entra no marco 08.
  - `XACKDEL`, `XDELEX` (Redis 8.2) e `XNACK` (Redis 8.8): também no marco 08.
  - `CLUSTERSCAN` (Valkey 9.1): `SCAN` no *cluster* inteiro. Entra no marco 11.
- **O Valkey se apresenta como `redis_version:7.2.4`** no `INFO`, por compatibilidade, e expõe a versão
  real em `valkey_version`. Isso importa para o cliente que decide recursos pela versão. Entra no marco 12.

### Fronteira com as trilhas publicadas

- **`dados-distribuidos/09`:** "o mínimo sobre Redis que muda decisões" é uma lista dentro de "O cache que
  virou dependência crítica", e não uma seção com título. A ponte de volta (Fase 6) vai para essa lista.
- **`dados-distribuidos/10`:** dono do lock, do Redlock × Kleppmann e do *fencing token*, conforme o plano.
- **`system-design/06`** ("API Management e monetização"): dono dos algoritmos de *rate limit*, com a
  seção "Falhar aberto × fechado, quando o Redis do rate limit cai". O marco 06 daqui não repete o
  algoritmo.
- **`azure-para-backend/07`** e **`aws-para-backend/07`:** citam o Redis gerenciado em uma linha cada.
  A ponte para o 13 entra na Fase 6.

### Pontes do plano que precisam mudar

| Ponte do plano | Problema | O que entra no lugar |
| --- | --- | --- |
| `performance-resiliencia/07` (marcos 06 e 12) | a trilha não existe | `spring-boot/08` (timeouts, retry e *breaker*), que já é ponte nos dois marcos |
| `performance-resiliencia/09` (marco 10) | a trilha não existe | `concorrencia-e-recursos/08` e `aws-para-backend/10`, que fazem caos local e *game day* |
| `kubernetes/07` (marco 09, limite de memória) | o 07 é autoescala | `kubernetes/12` (o `OOMKilled` e o limite de memória) |
| `kubernetes/09` (marco 11, estado no *cluster*) | o 09 é segurança do *workload* | `kubernetes/08` (StatefulSet e operators) |

As outras 34 pontes numeradas (`trilha/NN`) do plano resolvem para marcos com o tema esperado.

### Esqueleto

- `course.yaml`: 13 marcos e 775 min, com `estimatedHours: 26`. As fontes foram ajustadas:
  - entraram o repositório de cada motor e o Valkey Bundle;
  - o guia do go-redis passou para `redis.io`, porque o próprio go-redis marca o `redis.uptrace.dev`
    como documentação antiga;
  - a linha genérica "Jepsen — Analyses" virou a análise específica.
- 13 *stubs* válidos, com o `## Capstone` no marco 13.
- `PROJETO.md` com o mapa de estado, os contratos, a matriz Redis × Valkey e a tabela de versões.
- `GLOSSARIO.md` mínimo, com 2 verbetes.
- `fin-kv` em `capstones.yaml`, com `depends_on: [pix-gateway, ledger-core, fin-store, pix-stream]`. O
  mapa de *capstones* passa de 27 para 28 componentes.
- `sections_test.go` lista os 13 *stubs* sem Hands-on, até cada bloco ser escrito.

### Ambiente

O disco tinha 2,3 GB livres. Liberei espaço apagando o cache de *build* do Go e as imagens de emuladores
das trilhas de nuvem já publicadas, que podem ser baixadas de novo. O Docker local roda as duas imagens de
referência.
