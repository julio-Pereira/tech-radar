---
id: modelo-de-execucao-e-custo-de-comando
title: "Modelo de execução e custo de comando"
summary: "Os comandos rodam um de cada vez: isso dá atomicidade de graça a cada comando e cobra caro, porque um comando lento é latência para todos os clientes. A execução serial e o que as I/O threads paralelizam de fato, o tempo de ida e volta como custo dominante e o pipelining (que não é MULTI), a complexidade como contrato, SCAN e suas garantias fracas, DEL × UNLINK e a diferença do Valkey, big key, hot key e os instrumentos — medido nos dois motores: com 2 ms de RTT, 100 GET em pipeline custam 4% dos sequenciais, e um KEYS sobre 1M de chaves deixou outro cliente esperando 224 ms."
estimatedMinutes: 55
reviewedAt: 2026-11-19
reviewEvery: 6m
competencies: [dados, performance]
references:
  - title: "Redis — Pipelining"
    url: https://redis.io/docs/latest/develop/use/pipelining/
  - title: "Redis — Diagnosing latency issues"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/
  - title: "Redis — SCAN"
    url: https://redis.io/docs/latest/commands/scan/
  - title: "Valkey — COMMANDLOG"
    url: https://valkey.io/commands/commandlog-get/
---

## Um comando de cada vez

O Redis executa os comandos **um de cada vez**, numa *thread* só. Enquanto um comando roda, nenhum outro
roda, de nenhum cliente. Isso dá de graça uma propriedade valiosa: cada comando é atômico. Um `INCR`
(O(1)) nunca vê outro `INCR` pela metade, e não precisa de lock.

O preço vem junto: **um comando lento é latência para todos os clientes**, e não só para quem o chamou. Se
um serviço pede uma varredura de meio segundo, o `GET` de um outro serviço, que custaria microssegundos,
espera esse meio segundo na fila.

As **I/O threads** não mudam isso. Os dois motores (`redis.conf` do Redis 8.10 e `valkey.conf` do Valkey
9.1) dizem a mesma coisa: com `io-threads` maior que 1, as *threads* extras fazem a leitura e a escrita no
*socket* e o *parsing* do protocolo. A **execução** continua numa *thread* só. As I/O threads servem a quem
satura a CPU com muitos clientes e muitos comandos baratos, e não salvam ninguém de um comando caro. O
padrão é `io-threads 1`, ou seja, desligado. No Valkey, o valor muda em execução; no Redis, não.

## O tempo de ida e volta manda

Para um comando O(1), o servidor gasta microssegundos. O que domina o tempo que o cliente vê é a **ida e
volta pela rede** (RTT): meio milissegundo na mesma zona, mais entre zonas. Seis `GET` em sequência pagam
seis RTTs.

O ***pipelining*** manda vários comandos pela mesma conexão sem esperar cada resposta, e lê todas as
respostas no fim. Ele paga o RTT uma vez só. No laboratório, com 2 ms de RTT injetado pelo Toxiproxy, 100
`GET` levaram:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| sequenciais (go-redis) | 287 ms | 285 ms |
| em *pipeline* (go-redis) | 12 ms (4,2%) | 8,5 ms (3,0%) |
| sequenciais (Lettuce) | 345 ms | 328 ms |
| em *pipeline* (Lettuce) | 12 ms (3,7%) | 8 ms (2,6%) |

Ambiente: contêiner Linux com 4 vCPUs, Docker 29.9, imagens oficiais fixadas por *digest*, Toxiproxy 2.13
na frente de cada motor e cliente no mesmo host (19 nov 2026).

***Pipelining* não é `MULTI`.** O *pipeline* economiza RTT e **não** dá atomicidade: os comandos dele podem
se intercalar com os de outros clientes. O `MULTI`/`EXEC` dá isolamento, e é assunto do marco 04. Os dois
podem andar juntos, mas resolvem problemas diferentes.

## Complexidade é contrato

Como tudo é serial, a complexidade de um comando é um contrato com **todos** os outros clientes. Os que
derrubam produção são os O(N) sobre um N que cresce sem ninguém olhar:

- `KEYS padrao`, O(N) no número de chaves do banco;
- `SMEMBERS`, O(N) na cardinalidade do *set*;
- `HGETALL`, O(N) no tamanho do *hash*;
- `LRANGE 0 -1`, O(S+N), que devolve a lista inteira;
- `DEL` de uma coleção, O(M) nos elementos dela (abaixo);
- `FLUSHALL`, O(N) no total de chaves.

No laboratório, com 1 milhão de chaves, um `KEYS user:*` levou **323 ms** no Redis e **179 ms** no Valkey.
Um segundo cliente, que mandava `PING` a cada 200 µs, ficou **224 ms** (Redis) e **91 ms** (Valkey) sem
resposta.

O **`SCAN`** é a alternativa: O(1) por chamada e O(N) na varredura completa, mas em pedaços. A mesma
varredura com `SCAN 0 MATCH user:* COUNT 1000` demorou mais no total (697 ms no Redis), e o segundo
cliente nunca esperou mais que **1,4 ms**. O total maior é o preço de não travar ninguém.

As garantias do `SCAN` são fracas, e é preciso saber quais são:

- toda chave que existiu **do começo ao fim** da varredura é devolvida **ao menos uma vez**;
- uma chave pode vir **repetida**, e a aplicação deduplica;
- uma chave criada ou apagada **durante** a varredura pode vir ou não.

## Apagar também custa: DEL, UNLINK e *lazy free*

O `DEL` de uma *string* é O(1). O de uma coleção é O(M): liberar 1 milhão de campos de um *hash* leva
tempo, e esse tempo é da *thread* principal. No laboratório, o `DEL` de um *hash* com 1 milhão de campos
apareceu no `SLOWLOG` do Redis com **82 ms**.

O **`UNLINK`** tira a chave do espaço de nomes em O(1) e libera a memória numa *thread* de fundo. Não
apareceu no `SLOWLOG` em nenhum motor.

> **Diferença Redis × Valkey.** O padrão de `lazyfree-lazy-user-del` é `no` no Redis e `yes` no Valkey.
> No Valkey, o `DEL` já libera em segundo plano, como o `UNLINK`, e o `DEL` do mesmo *hash* não apareceu
> no `SLOWLOG`. Código que confia nesse comportamento quebra ao trocar de motor. Use `UNLINK` quando a
> intenção é apagar algo grande, e o resultado é o mesmo nos dois.

## Big key, hot key e os instrumentos

Uma ***big key*** é uma chave cuja estrutura cresceu a ponto de qualquer operação O(N) sobre ela pesar. Uma
***hot key*** é uma chave que recebe uma fração desproporcional do tráfego, e que no *cluster* do marco 11
concentra a carga num nó só. A segunda já apareceu em `dados-distribuidos/09` como o *celebrity problem*;
aqui ela é medida.

O primeiro instrumento é o **`SLOWLOG`** (`SLOWLOG GET`, O(N) nas entradas devolvidas). Ele registra todo
comando que passou de `slowlog-log-slower-than`, que é de **10.000 µs** (10 ms) por padrão nos dois motores,
e guarda as últimas `slowlog-max-len` entradas (128). Ele mede só o tempo de **execução**: o tempo na fila e
na rede não aparece ali. O **`LATENCY DOCTOR`** resume os picos, mas só depois de ligar
`latency-monitor-threshold`, que vem em 0.

Cada motor tem um instrumento a mais:

> **Diferença Redis × Valkey.** No Redis 8.6+, `HOTKEYS START` rastreia as chaves mais acessadas no
> próprio servidor. No Valkey 8.1+, o `COMMANDLOG` registra, além dos comandos lentos (o antigo
> `SLOWLOG`, que continua como apelido), as **requisições grandes** e as **respostas grandes**, cada uma com
> seu limiar. A resposta grande é o rastro de um `HGETALL` sobre uma *big key* que o `SLOWLOG` às vezes
> não pega.

O `fork` é o último custo serial deste marco. O *snapshot* RDB e a reescrita do AOF fazem um `fork` do
processo, que copia a tabela de páginas e pode congelar a *thread* principal em instâncias grandes. O marco
09 mede isso.

> **Armadilha.** O *job* de manutenção que roda `KEYS user:*` às 3h. Em produção, com 20 milhões de chaves,
> ele é uma pausa de segundos para **todos** os serviços que dividem a instância. Ninguém percebe às 3h, até
> o dia em que o *job* atrasa e roda às 10h. Use `SCAN`, e prefira não varrer: mantenha um índice explícito
> do que você vai precisar listar.

## Exemplo numa fintech

O `pix-gateway` lê seis chaves por requisição de iniciação: o limite disponível, a reserva de idempotência,
dois contadores do antifraude, a sessão de consentimento e a configuração da chave Pix. Em sequência, são
seis RTTs:

- 3 ms na mesma zona, com meio milissegundo de RTT;
- 12 ms entre zonas, com 2 ms de RTT. É um terço do orçamento de 300 ms do endpoint gasto em espera de rede.

Com as seis leituras num *pipeline*, o custo volta a um RTT. Na medição deste marco, com 2 ms de RTT, o
*pipeline* custou entre 3% e 4% do tempo sequencial.

Um mês depois, um analista agendou um relatório que listava as sessões de consentimento com `KEYS
ofb:sess:*`. A instância tinha 3 milhões de chaves, e o p99 do `pix-gateway` subiu de 4 ms para 400 ms
durante a execução. O `SLOWLOG` mostrou o `KEYS` na primeira linha. A correção teve três partes:

- o relatório passou a usar `SCAN`, numa réplica;
- o `KEYS` foi bloqueado pela ACL do usuário de relatório (marco 13);
- o painel ganhou um alerta para entradas novas no `SLOWLOG`.

## Hands-on

**Tutorial.** No `fin-kv`, rode `lab/standalone.sh`, que sobe:

- o Redis 8.10.3 na porta 6380 e o Valkey 9.1.4 na 6381, com imagens fixadas por *digest*;
- o Toxiproxy, com os *proxies* nas portas 26380 e 26381.

Escreva, em Java (Lettuce) e em Go (go-redis), um cliente que mede N `GET` com e sem *pipeline*, através do
*proxy*, com latência injetada:

```bash
toxiproxy-cli toxic add -t latency -a latency=1 -d redis   # 1 ms na volta
toxiproxy-cli toxic add -t latency -a latency=1 -u redis   # 1 ms na ida
```

```go
pipe := rdb.Pipeline()
for i := 0; i < 100; i++ {
    pipe.Get(ctx, fmt.Sprintf("p:%d", i))
}
_, err := pipe.Exec(ctx) // um RTT para os 100
```

```java
// Lettuce: a conexão é multiplexada; o pipeline é o flush manual
conn.setAutoFlushCommands(false);
List<RedisFuture<String>> fs = new ArrayList<>();
for (int i = 0; i < 100; i++) fs.add(conn.async().get("p:" + i));
conn.flushCommands();
LettuceFutures.awaitAll(Duration.ofSeconds(10), fs.toArray(new RedisFuture[0]));
conn.setAutoFlushCommands(true);
```

**Desafio.** Provar o custo compartilhado: um segundo cliente mede a própria latência enquanto o primeiro
varre o banco. Meça o **pior caso** do segundo cliente, e não o p99. Um cliente travado gera **uma**
amostra lenta enquanto todas as outras são rápidas, então o p99 esconde a trava. No laboratório, o p99 do
segundo cliente durante o `KEYS` foi de 3,4 ms, e o pior caso foi de 224 ms.

**Invariantes testáveis**

Todos rodam contra o Redis **e** o Valkey, em Java e em Go.

1. Com ~2 ms de RTT injetado, 100 `GET` em *pipeline* levam **menos de 10%** do tempo dos 100 `GET`
   sequenciais.
2. Um `KEYS *` sobre 1 milhão de chaves faz o pior caso de latência de um segundo cliente ficar **ao menos
   10 vezes** acima do pior caso da mesma varredura feita com `SCAN COUNT 1000`. O teste registra os dois
   números. No laboratório, foram 224 ms × 1,4 ms no Redis e 91 ms × 1,3 ms no Valkey.
3. O `UNLINK` de um *hash* com 1 milhão de campos **nunca** aparece no `SLOWLOG`. O `DEL` do mesmo *hash*
   aparece **se e somente se** `lazyfree-lazy-user-del` for `no`. O teste lê a configuração do motor
   antes de afirmar.
4. Toda chave presente do começo ao fim de uma varredura `SCAN` é devolvida ao menos uma vez, mesmo com
   outro cliente inserindo chaves durante a varredura.

**Complemento.** Ligue `io-threads 3` numa das instâncias e repita o desafio. O pior caso do segundo cliente
durante o `KEYS` cai? Explique o resultado com a primeira seção deste marco.

**Checagem**

1. O que as I/O threads paralelizam, e por que elas não salvam ninguém de um `KEYS`?
2. Qual é a diferença entre *pipelining* e `MULTI`, e quando você usaria cada um?
3. Que garantias o `SCAN` dá sobre chaves repetidas e sobre chaves criadas durante a varredura?
4. Por que o `DEL` de um *hash* grande trava o Redis e não trava o Valkey, e qual comando dá o mesmo
   resultado nos dois?

> **Reencontro — `dados-distribuidos/09`; `concorrencia-e-recursos/01`; `observabilidade/11`.** O mínimo
> sobre Redis de `dados-distribuidos/09` ("um comando O(n) bloqueia todos os outros clientes") vira número
> aqui. A execução serial é o caso extremo da lei de Amdahl de `concorrencia-e-recursos/01`: a fração serial
> é 100% dos comandos. E o pior caso escondido pelo p99 é o mesmo motivo de `observabilidade/11` preferir
> perfil contínuo a amostra solta.

## Principais aprendizados

- O Redis executa um comando de cada vez; as I/O threads paralelizam *socket* e *parsing*, não a execução.
  Um comando lento é latência para todos.
- O tempo de ida e volta domina o custo de comandos O(1). O *pipelining* paga o RTT uma vez: com 2 ms de
  RTT, 100 `GET` em *pipeline* custaram de 3% a 4% dos sequenciais. *Pipeline* não é `MULTI`.
- A complexidade de um comando é um contrato com todos os clientes. `KEYS` sobre 1 milhão de chaves deixou
  outro cliente 224 ms sem resposta, e o `SCAN` em pedaços, 1,4 ms.
- O `SCAN` devolve ao menos uma vez o que existiu do começo ao fim, pode repetir, e é incerto para o que
  mudou durante a varredura.
- `UNLINK` apaga coleções grandes sem travar. O `DEL` é assíncrono por padrão no Valkey e síncrono no Redis.
- Meça o pior caso de quem espera, e não só o p99: o cliente travado gera uma amostra só.
