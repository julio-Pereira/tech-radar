---
id: clientes-em-producao-java-e-go
title: "Clientes em produção: Java e Go"
summary: "Metade dos incidentes \"do Redis\" acontece no cliente: timeout sem orçamento, retry de comando não idempotente, conexão que não acompanha o failover e serialização que vira vulnerabilidade. Lettuce multiplexado × pool do go-redis; timeout dentro do orçamento; quais comandos são seguros para retry; descoberta de topologia; serialização no Spring Data Redis; client-side caching; breaker e degradação. Medido nos dois motores: com ~500 ms de RTT, o go-redis com as opções padrão teve p99 de 4 s, preso na fila do pool, e o ajustado, de 0,1 s; o retry padrão contou de 48 a 81 INCR a mais em 300; e o pool nunca passou de 32 conexões sob 2.000 goroutines."
estimatedMinutes: 55
reviewedAt: 2026-11-23
reviewEvery: 6m
competencies: [confiabilidade, performance]
references:
  - title: "Lettuce — Reference guide"
    url: https://redis.github.io/lettuce/
  - title: "go-redis — Options"
    url: https://pkg.go.dev/github.com/redis/go-redis/v9#Options
  - title: "Spring Data Redis — Reference"
    url: https://docs.spring.io/spring-data/redis/reference/
  - title: "Redis — Client-side caching"
    url: https://redis.io/docs/latest/develop/reference/client-side-caching/
---

## O incidente começa no cliente

Os marcos anteriores trataram do que o servidor faz. Este trata do que o cliente faz quando o servidor está lento,
fora do ar ou trocando de primário. Quase todo incidente "do Redis" tem uma destas causas no cliente:

- um ***timeout*** maior que o orçamento da requisição;
- um ***retry*** automático de um comando que não pode ser repetido;
- uma conexão que **não acompanha** o *failover*;
- uma **serialização** que acopla versões e abre uma vulnerabilidade.

Os números deste marco foram medidos com o go-redis v9.23 e o Lettuce 7.9 (Spring Data Redis 4.1), contra o Redis
8.10.3 e o Valkey 9.1.4, com o Toxiproxy injetando latência e quedas (23 nov 2026).

## Modelo de conexão: multiplexado × pool

Os dois clientes resolvem a concorrência de jeitos opostos:

- **Lettuce:** uma conexão **multiplexada** sobre Netty. Todas as *threads* mandam comandos pela mesma conexão, e as
  respostas voltam em ordem. Uma conexão serve a aplicação inteira. A exceção é o que prende a conexão: `MULTI`/`EXEC`
  com `WATCH` (o `SessionCallback` do marco 04) e comandos bloqueantes, como `BLPOP` e `XREADGROUP ... BLOCK`. Esses
  precisam de uma conexão própria, de um *pool*;
- **go-redis:** um ***pool*** de conexões por nó. Cada comando pega uma conexão, usa e devolve. `PoolSize` é o
  máximo, e o padrão é 10 por `GOMAXPROCS`. `PoolTimeout` é quanto uma goroutine espera por uma conexão livre.

No laboratório, 2.000 goroutines mandando 20 comandos cada, com `PoolSize: 32`, nunca abriram mais de **32 conexões**,
nos dois motores. O número foi conferido pelo lado do cliente (`PoolStats`) e pelo servidor (`CLIENT LIST`). O *pool* é
a defesa contra a tempestade de conexões. Sem limite, cada goroutine pendurada abre uma conexão, e o servidor chega no
`maxclients`. É o mesmo raciocínio de recurso finito de `concorrencia-e-recursos/07`.

## O timeout tem de caber no orçamento

O orçamento de latência da requisição, de `system-design/08`, é dividido entre as dependências. Se o endpoint tem
300 ms de orçamento e o Redis é uma das dependências, o *timeout* do Redis tem de ser bem menor que 300 ms. Os padrões
dos dois clientes não são:

- **go-redis v9.23:** `ReadTimeout` de 5 s (e `WriteTimeout` igual a ele), `DialTimeout` de 5 s, `PoolTimeout` de
  `ReadTimeout` + 1 s, `MaxRetries` de 3 e `DialerRetries` de 5 (`options.go`; o marco 06 mediu os 400 ms de
  discagem);
- **Lettuce 7.9:** *timeout* de comando de **60 s** (`RedisURI.DEFAULT_TIMEOUT`).

O laboratório injetou cerca de 500 ms de RTT e mandou 200 requisições a um endpoint que lê uma chave e, se o Redis não
responde a tempo, segue sem ela:

| 200 requisições, ~500 ms de RTT | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| go-redis, opções padrão: p50 / p99 | **3,0 s / 4,0 s** | **3,0 s / 4,0 s** |
| go-redis, `ReadTimeout` e `PoolTimeout` curtos, sem retry: p50 / p99 | 50 ms / 101 ms | 50 ms / 102 ms |
| Lettuce, *timeout* padrão (60 s): p50 / p99 | 512 ms / 521 ms | 506 ms / 511 ms |
| Lettuce, *timeout* de 100 ms: p50 / p99 | 200 ms / 204 ms | 191 ms / 194 ms |

Com as opções padrão, o go-redis não chegou a dar *timeout* de leitura: cada `GET` levou os 500 ms do RTT, mas o
*pool* padrão (10 conexões por `GOMAXPROCS`, 40 nesta máquina de 4 vCPUs) encheu, e as requisições seguintes
esperaram **na fila do *pool***. Ninguém passou de 5 s, e o p99 chegou a 4 s. No cliente ajustado, com `PoolSize: 20`,
`PoolTimeout: 50ms` e `ReadTimeout: 100ms`, a requisição sem conexão livre desistiu em 50 ms, e a que conseguiu
conexão desistiu em 100 ms. A fila do *pool* é uma fila de espera como outra qualquer, e o `PoolTimeout` é o *timeout*
dela. O Lettuce com o padrão esperou a resposta inteira, de 500 ms. Com o *timeout* de 100 ms, a expiração saiu
perto de 200 ms. O temporizador do Lettuce (um `HashedWheelTimer` do Netty) tem resolução própria, e o *timeout* pedido
não é exatamente o que acontece. Meça o seu.

> **Armadilha.** *Timeout* de comando de 60 s, o padrão do Lettuce, num serviço com SLO de 300 ms. Quando o Redis fica
> lento, cada requisição espera até 60 s, as *threads* e as conexões do serviço se esgotam, e o serviço cai por
> exaustão antes de qualquer alerta de latência do Redis disparar. O *timeout* é uma decisão explícita, derivada do
> orçamento, e nunca o padrão do cliente.

O *timeout* curto só funciona se a conexão já existir. O Lettuce aplica o mesmo *timeout* ao `HELLO` inicial, e com
100 ms e 500 ms de RTT a conexão nunca completou no laboratório. A conexão é aberta no *startup*, antes de o tráfego
chegar, e o *health check* do serviço a confere.

## Retry: o INCR que conta duas vezes

O go-redis repete um comando quando a leitura da resposta dá *timeout* (`shouldRetry`, em `error.go`: *timeout* de
leitura é repetido, com `MaxRetries` 3 por padrão). Para um `GET`, isso é inofensivo. Para um `INCR`, é contar duas
vezes. A resposta atrasou, mas o comando **já tinha sido executado** no servidor.

O laboratório mandou 300 `INCR` com latência oscilando em torno do `ReadTimeout`:

| 300 `INCR` | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| ingênuo (retry padrão): aceitos / contador final | 211 a 220 / 280 a 300 | 207 a 221 / 268 a 281 |
| a mais no contador | **+69 a +81** | **+48 a +61** |

O contador do antifraude ficou maior que o número de pagamentos aceitos. Num limite, isso é recusar cliente sem motivo.

A correção tem duas partes. A primeira é saber quais comandos são seguros para repetir:

- **seguros:** leituras (`GET`, `HGETALL`, `ZRANGE`) e escritas que repetidas dão o mesmo resultado (`SET` com o mesmo
  valor, `DEL`, `ZADD` com o mesmo *score*);
- **não seguros:** `INCR`, `LPUSH`, `XADD` sem id, `RPOPLPUSH`, e qualquer script que acumula.

A segunda é transformar o não seguro em seguro. O `fin-kv` faz o incremento com um **id de operação**, num script:

```lua
-- KEYS[1] = contador; KEYS[2] = id da operação
if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 60) then
  return redis.call('INCR', KEYS[1])
end
return tonumber(redis.call('GET', KEYS[1]))
```

Com isso, o retry é seguro. No laboratório, das 300 operações, entre 225 e 231 voltaram com sucesso, e 69 a 75 terminaram
com resultado **desconhecido**: o cliente esgotou as tentativas, mas parte delas tinha sido aplicada. Reenviadas com o
**mesmo** id, o contador terminou em exatamente **300**, nos dois motores. É a idempotência do marco 05 aplicada a um
contador.

O Lettuce não repete comando por *timeout*, mas repete na reconexão. Com `autoReconnect` (ligado por padrão), a
garantia de entrega é *at-least-once* (`DefaultEndpoint`: "commands are ok to stay within the queue, reconnect will
retrigger them"). Um comando que já tinha sido escrito na conexão quando ela caiu é **reenviado** quando ela volta, e o
servidor pode tê-lo executado antes da queda. A regra é a mesma: comando não idempotente leva id de operação.

## Descoberta de topologia

O cliente precisa seguir o primário quando ele muda:

- **Sentinel:** o go-redis `FailoverClient` e o Lettuce com URI de Sentinel perguntam aos sentinelas e reconectam. O
  marco 10 mediu 2,4 a 2,7 s;
- **Cluster:** o mapa de *slots* precisa ser recarregado. O marco 11 mediu o go-redis com o padrão de 60 s de
  `ClusterStateReloadInterval` levando mais de um minuto, e com 2 s, de 5 a 6,5 s. No Lettuce 7.9, todos os gatilhos
  adaptativos de `ClusterTopologyRefreshOptions` vêm ligados e a atualização periódica vem desligada. Ele levou 8,8 s.

As opções de topologia entram no ADR do cliente, junto com os *timeouts*, e não ficam no padrão.

## Serialização no Spring Data Redis

O `RedisTemplate` do Spring Data Redis 4.1 usa o `JdkSerializationRedisSerializer` quando nenhum serializador é
configurado (`RedisTemplate.afterPropertiesSet`). Isso tem dois custos:

- **segurança:** desserializar bytes Java vindos do Redis é desserialização insegura (OWASP A08). Quem escreve no Redis
  pode mandar uma cadeia de objetos que executa código no `readObject` do serviço que lê
  (`seguranca-aplicacao/03`);
- **acoplamento:** o valor só é legível por uma JVM com a mesma classe, na mesma versão. O serviço Go não lê, o
  `redis-cli` mostra bytes, e um *deploy* que muda a classe quebra a leitura do que já está gravado.

O `fin-kv` usa `StringRedisTemplate`, ou um `RedisTemplate<String, String>` com `StringRedisSerializer`, e faz o JSON na
aplicação, com o esquema versionado. Um teste de configuração sobe o contexto Spring, lista todos os `RedisTemplate`, e
falha se algum usar o serializador JDK em chave, valor, chave de *hash* ou valor de *hash*. No laboratório, ele passou
na configuração do `pix-gateway` e pegou os quatro serializadores JDK de um `RedisTemplate` montado sem configuração.

O `@Cacheable` com `RedisCacheManager` herda o mesmo cuidado: o `RedisCacheConfiguration` padrão também serializa em
JDK. Configure o serializador de valor, o TTL por cache (`entryTtl`) e se `null` entra no cache. O padrão de cache, e o
quando cachear, é de `dados-distribuidos/09`.

## Client-side caching

O ***client-side caching*** guarda no processo do cliente as chaves mais lidas. O servidor avisa quando elas mudam:
`CLIENT TRACKING ON` faz o servidor lembrar o que a conexão leu e mandar uma mensagem de invalidação quando a chave é
escrita. Ele serve para o que é muito lido e pouco escrito, como a configuração da chave Pix de um grande recebedor, a
*hot key* do marco 01.

O custo é a consistência: entre a escrita e a chegada da invalidação, o cliente lê o valor velho. E se a conexão de
invalidação cai, o cliente precisa descartar o cache local inteiro. Nada do que o mapa de estado classifica como
derivado (idempotência, limites) vai para cache local.

## Breaker e degradação

Com o Redis fora, o *timeout* curto ainda custa o *timeout* em cada chamada. O ***circuit breaker*** de
`spring-boot/08` corta isso: depois de N falhas seguidas, ele abre e responde na hora, sem chamar o Redis. O que
acontece quando ele abre é o mapa de estado (marco 06):

- **cache:** vai à origem, o banco;
- **limite regulatório:** recusa;
- **capacidade:** limite local.

No laboratório, com o Redis derrubado, o *breaker* abriu depois de 5 falhas. Os 100 ciclos seguintes (uma leitura de
catálogo e um débito de limite cada) levaram 1 ms no total, nos dois motores. O catálogo foi à origem nos 100 ciclos, e
o limite recusou nos 100.

As métricas do cliente fecham o quadro: latência por comando, *timeouts*, conexões do *pool* em uso e esperando, estado
do *breaker*. O Lettuce as publica pelo Micrometer, e o go-redis por um *hook* de OpenTelemetry (`redisotel`). Sem elas,
o incidente aparece como "o serviço ficou lento".

## Exemplo numa fintech

O `pix-gateway` (Lettuce) e o `ledger-core` (go-redis) passaram por um *game day* com duas falhas ao mesmo tempo: um
*failover* do Sentinel e 500 ms de latência injetada no `kv-estado`.

Na configuração de fábrica:

- o `pix-gateway` segurou cada requisição pelos 500 ms inteiros, e as *threads* do servidor web se esgotaram;
- o `ledger-core` ficou de 3 a 4 s por requisição, preso na fila do *pool*. Quando a latência passou a oscilar em
  torno do *timeout*, ele repetiu os `INCR` do antifraude e inflou os contadores de velocidade.

A configuração do `fin-kv`, escrita no ADR do cliente:

| | `pix-gateway` (Lettuce) | `ledger-core` (go-redis) |
| --- | --- | --- |
| *timeout* de comando | 100 ms (o orçamento do endpoint é 300 ms) | `ReadTimeout`/`WriteTimeout` 100 ms |
| retry | nenhum automático; não idempotente leva id de operação | `MaxRetries: -1`, ou id de operação |
| conexão | uma multiplexada, mais um *pool* para `WATCH` e `XREADGROUP BLOCK` | `PoolSize` 32, `PoolTimeout` 50 ms |
| topologia | URI de Sentinel | `FailoverClient`, `DialerRetries: 1` |
| serialização | `StringRedisSerializer`, JSON na aplicação | strings, JSON na aplicação |
| *breaker* | Resilience4j, 5 falhas | o do `fin-kv`, 5 falhas |

## Hands-on

**Tutorial.** Configure os dois clientes explicitamente, com métricas:

```go
rdb := redis.NewClient(&redis.Options{Addr: addr,
    DialTimeout: 100 * time.Millisecond, ReadTimeout: 100 * time.Millisecond, WriteTimeout: 100 * time.Millisecond,
    PoolSize: 32, PoolTimeout: 50 * time.Millisecond,
    MaxRetries: -1, DialerRetries: 1}) // sem retry implícito: o não idempotente leva id de operação
```

```java
var uri = RedisURI.builder().withHost(host).withPort(6379).withTimeout(Duration.ofMillis(100)).build();
var cliente = RedisClient.create(uri);
var conexao = cliente.connect(); // no startup: o HELLO inicial também obedece ao timeout
var template = new StringRedisTemplate(new LettuceConnectionFactory(...)); // nada de serialização JDK
```

**Desafio.** O cliente à prova de falha: *timeout* dentro do orçamento, retry seguro, *pool* limitado, *breaker* e o
mapa de estado.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, os de número 1 e 3.

1. Com latência injetada de 500 ms, o p99 do endpoint fica dentro do orçamento declarado (o *timeout* do Redis é menor
   que o orçamento), e nenhuma *thread* ou goroutine fica presa além dele.
2. O teste reproduz a **contagem dupla** de um `INCR` reenviado depois do *timeout* na configuração ingênua. Na
   corrigida, o contador final bate com o número de operações, depois do reenvio das que tiveram resultado desconhecido.
3. Nenhum serializador JDK no contexto Spring. É um teste de configuração, e ele prova que pega um `RedisTemplate` sem
   configuração.
4. Com o Redis indisponível, o *breaker* abre, e o comportamento segue o mapa de estado: cache vai à origem, limite
   regulatório recusa.
5. O *pool* do go-redis nunca passa do máximo declarado sob 2.000 goroutines concorrentes.

**Complemento.** Ligue `CLIENT TRACKING` no `ledger-core` para a configuração da chave Pix e meça, sob escrita, quanto
tempo o cliente lê o valor velho depois de uma alteração.

**Checagem**

1. Por que o Lettuce usa uma conexão só, e quando ele precisa de um *pool*?
2. Como o *timeout* do Redis se relaciona com o orçamento da requisição, e o que acontece com o padrão de 60 s?
3. Por que o retry automático de um `INCR` conta duas vezes, e como tornar esse retry seguro?
4. Por que o serializador JDK do `RedisTemplate` é um risco de segurança, e não só de compatibilidade?

> **Reencontro — `concorrencia-e-recursos/05` e `/07`; `system-design/08`; `spring-boot/08`;
> `seguranca-aplicacao/03`.** O *pool* limitado é o recurso finito de `concorrencia-e-recursos/07`, e o modelo
> multiplexado do Lettuce, a execução assíncrona de `concorrencia-e-recursos/05`. O *timeout* sai do orçamento de
> `system-design/08`. O *breaker* e o *fallback* honesto são os de `spring-boot/08`. E o serializador JDK é a entrada não
> confiável de `seguranca-aplicacao/03`, chegando pelo Redis.

## Principais aprendizados

- O Lettuce multiplexa uma conexão, e o go-redis usa *pool* por nó. `WATCH` e comandos bloqueantes precisam de conexão
  própria.
- O *timeout* sai do orçamento, e o do *pool* também. Com os padrões, o go-redis teve p99 de 4 s, na fila do *pool*, e o
  Lettuce esperou 500 ms. Ajustados, os dois ficaram dentro de 300 ms.
- O retry padrão do go-redis repete *timeout* de leitura, e o `INCR` contou até 81 vezes a mais em 300. O Lettuce reenvia
  na reconexão. Não idempotente leva id de operação, e aí o retry é seguro.
- As opções de topologia (Sentinel, mapa de *slots*) entram no ADR do cliente, com número medido.
- Nada de serialização JDK. `StringRedisTemplate`, JSON na aplicação e um teste de configuração que falha o *build*.
- Com o Redis fora, o *breaker* responde na hora, e o que acontece depois é o mapa de estado.
