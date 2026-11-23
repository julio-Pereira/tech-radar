---
id: persistencia-memoria-e-eviction
title: "Persistência, memória e eviction: o que se perde"
summary: "Há duas formas de o Redis perder um dado que você escreveu sem que nenhum comando falhe: crash antes do fsync e eviction por falta de memória. As duas têm tamanho e configuração, e as duas precisam estar no mapa de estado. RDB e fork com copy-on-write; AOF e os três appendfsync; o que um kill -9 perde e o que só a queda do host perde; maxmemory, as políticas de eviction e o perigo de misturar cache e estado; noeviction cheio. Medido nos dois motores: com kill -9, o AOF perdeu no máximo 4 ms de escrita em 100 rodadas, o RDB a cada 5 s perdeu até 5,4 s, o always custou 75% da vazão, e uma instância única com allkeys-lru despejou até 98% das chaves de idempotência."
estimatedMinutes: 65
reviewedAt: 2026-11-22
reviewEvery: 6m
competencies: [dados, confiabilidade]
references:
  - title: "Redis — Persistence"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
  - title: "Redis — Key eviction"
    url: https://redis.io/docs/latest/develop/reference/eviction/
  - title: "Valkey — Persistence"
    url: https://valkey.io/topics/persistence/
---

## Duas formas de perder sem erro

Um comando que falha avisa. Este marco trata das duas formas de perder um dado **depois** de o Redis responder
`OK`:

- **crash antes do fsync:** a escrita foi confirmada, mas ainda não estava no disco quando a máquina caiu;
- ***eviction*:** a instância chegou no `maxmemory` e descartou a chave para abrir espaço.

As duas têm tamanho, e o tamanho depende de configuração. As duas entram no mapa de estado do `fin-kv`, ao
lado de cada uso: quanto daquele dado pode sumir, e por qual caminho.

## RDB: o snapshot por fork

O **RDB** é um *snapshot* do conjunto de dados inteiro, num arquivo compacto. `BGSAVE` (e a diretiva `save
<segundos> <alterações>`) faz um `fork` do processo, e o filho escreve o arquivo enquanto o pai continua
atendendo. O padrão dos dois motores, conferido nas imagens oficiais, é `save 3600 1 300 100 60 10000`: um
*snapshot* por hora se houve uma alteração, a cada 5 minutos se houve 100, a cada minuto se houve 10 mil.

O RDB perde **tudo o que foi escrito depois do último *snapshot***. No laboratório, com `save 5 1` (um
*snapshot* a cada 5 s, para encurtar a medição) e escrita contínua, o `kill -9` perdeu em média 341 mil
escritas e no pior caso 693 mil no Redis, o equivalente a **4,5 s** de escrita, e uma repetição chegou a 826 mil, ou
**5,4 s**. No Valkey, o pior caso foi de 727 mil e 747 mil escritas, 4,5 s nas duas medições. A perda é coerente com o intervalo: até um intervalo inteiro mais a duração do
*save*.

### Fork e copy-on-write

O `fork` copia a tabela de páginas, e não a memória. Pai e filho passam a compartilhar as páginas, e o kernel só
copia uma página quando alguém escreve nela. Esse é o ***copy-on-write***. O preço aparece quando há escrita
durante o *save*: cada página tocada pelo pai é duplicada.

O laboratório carregou cerca de 300 MB, mandou `BGSAVE` e mediu o que o filho reportou ao terminar
(`rdb_last_cow_size`):

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| *fork* | 4 a 8 ms | 5 ms |
| *copy-on-write* sem escrita durante o *save* | 1 MB | 1 MB |
| *copy-on-write* com 16 escritores aleatórios | 289 MB (**91%** do dataset) | 297 MB (**102%**) |

Escrita aleatória e intensa durante o *save* toca praticamente todas as páginas, e a memória do processo quase
**dobra** por alguns segundos. Se o contêiner tem um limite de memória (`kubernetes/05`), o kernel mata o
processo no meio do *save*. O `fin-kv` declara a margem: `maxmemory` em no máximo 40% do limite do contêiner,
o que deixa espaço para 1,5 vez o dataset de *copy-on-write*. Um teste mede o pico e falha se ele passar dessa
margem.

## AOF: o log de comandos

O **AOF** (*append-only file*) grava cada comando de escrita num *log*. No *restart*, o servidor reexecuta o
*log*. Desde o Redis 7.0, ele é ***multi-part***: um arquivo base, arquivos incrementais e um manifesto, dentro de
`appendonlydir`. A **reescrita** (`BGREWRITEAOF`) compacta o *log* num base novo, também por `fork`. Com
`aof-use-rdb-preamble yes`, o padrão nos dois motores, o base é um RDB, o que acelera o carregamento.

A durabilidade do AOF está em `appendfsync`, que decide quando o servidor chama `fsync`:

- `always`: `fsync` antes de responder a cada escrita;
- `everysec` (padrão nos dois motores): `fsync` uma vez por segundo, numa *thread* de fundo;
- `no`: no laço normal, o servidor não chama `fsync`, e o sistema operacional grava quando quiser (o `fsync` só
  acontece em momentos como o *shutdown* e a reescrita).

### O que um kill -9 perde, e o que só a queda do host perde

Aqui está o detalhe que a documentação resume e que o laboratório mostrou. Em operação normal, nos três modos, o
servidor faz o `write()` do *log* a cada volta do *event loop*, antes de responder. Depois do `write()`, o dado
está no *page cache* do kernel. Um `kill -9` mata o **processo**, e o kernel continua vivo, com o dado na memória,
e grava em disco depois.

A exceção é o disco lento. No `everysec`, se o `fsync` anterior ainda não terminou, o servidor **adia o
`write()`** por até 2 s, e as respostas saem mesmo assim (`aof.c`; cada adiamento estourado conta em
`aof_delayed_fsync`, no `INFO persistence`). Nesse intervalo, a escrita confirmada não chegou nem ao kernel, e
um `kill -9` a perde.

| `kill -9` sob escrita contínua | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| AOF `everysec`: confirmadas perdidas | **0** em 40 rodadas | 0 em 59 rodadas; **506** (≈ 4 ms) em 1 |
| AOF `no`, 5 rodadas: confirmadas perdidas | 0 | 0 |
| AOF `always`, 5 rodadas: confirmadas perdidas | 0 | 0 |
| vazão com `everysec` × `always` (16 clientes) | 136 mil × 35 mil escritas/s | 150 mil × 34 mil escritas/s |
| só RDB a cada 5 s: pior perda | 4,5 a 5,4 s | 4,5 s |

A janela de 1 segundo do `everysec` existe, mas para outra falha: a **queda do host**, ou do disco, ou da VM.
Aí o *page cache* some junto, e o que não tinha passado por `fsync` se perde. Com `everysec`, isso é até cerca
de 1 s de escrita, ou até 2 s com o disco lento. Com `no`, é o que o kernel ainda não tinha
gravado. O laboratório não derruba o *host*, então essa janela fica como fato conferido no código e na
documentação, e não como medição. O ADR registra a diferença: **crash do processo** e **crash da máquina** são
duas linhas do mapa de estado.

A perda isolada do Valkey aconteceu numa rodada em 60, sem nenhum adiamento de `write()` registrado em
`aof_delayed_fsync`, e não se repetiu em 40 rodadas seguintes. O laboratório não identificou a causa, e a auditoria a
registra como item em aberto. O número que importa para o mapa de estado não muda: no pior caso medido, 4 ms de
escrita.

O `always` fecha a janela também para a queda do *host*, e custou **75%** da vazão no laboratório. Há um efeito
curioso no `always`: o servidor recuperou algumas escritas a mais que as confirmadas. Eram comandos que já
tinham passado por `fsync` quando o processo morreu, mas cuja resposta não chegou ao cliente. Do lado do
cliente, isso é uma escrita que pode ter acontecido ou não, que é exatamente o caso do marco 05.

`WAITAOF numlocal numreplicas timeout` (Redis e Valkey 7.2+) espera até que a escrita anterior tenha passado por
`fsync` no AOF local e em N réplicas. É o `always` por comando, para as escritas que precisam dele.

## Memória e eviction

`maxmemory` limita o dataset. Quando ele é atingido, a **política de *eviction*** decide o que acontece com a
próxima escrita:

- `noeviction` (padrão nos dois motores): recusa a escrita com erro `OOM`;
- `allkeys-lru` e `allkeys-lfu`: descarta qualquer chave, a menos usada recentemente ou com menos frequência;
- `volatile-lru`, `volatile-lfu`, `volatile-ttl` e `volatile-random`: descartam só entre as chaves **com TTL**;
- `allkeys-random`: descarta qualquer chave, ao acaso.

As políticas são **aproximadas**: o servidor amostra algumas chaves (`maxmemory-samples 5`) e descarta a pior da
amostra, e não a pior do banco inteiro.

> **Diferença Redis × Valkey.** O Redis 8.10 tem duas políticas a mais, `allkeys-lrm` e `volatile-lrm`. LRM é
> *least recently modified*: só a **escrita** atualiza o relógio da chave, e a leitura não. Uma chave lida o
> tempo todo e nunca escrita é candidata ao despejo. O Valkey 9.1 não tem essas políticas.

### Cache e estado na mesma instância

A *eviction* não sabe o que é cache e o que é estado. Para ela, uma chave de idempotência e uma página de
catálogo são iguais, e a de idempotência costuma ser a mais antiga e a menos lida.

O laboratório gravou 20 mil chaves de idempotência numa instância com `maxmemory 30mb` e depois encheu a
instância com 60 MB de cache de catálogo:

| Uma instância, 20 mil chaves de idempotência | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| `allkeys-lru`: sobreviveram | 393 a 4.111 | 3.567 |
| `allkeys-lfu`: sobreviveram | 4.003 a 4.111 | 3.703 |
| `volatile-lru` (idempotência e cache com TTL): sobreviveram | 4.034 a 4.137 | **79** |
| **duas instâncias** (estado com `noeviction`, cache com `allkeys-lru`) | **20.000** | **20.000** |

As faixas vêm de rodadas diferentes, porque a amostragem da *eviction* é aleatória. Em todas, de 80% a quase
100% das chaves de idempotência sumiram. O `volatile-*` não salva nada, porque as chaves de idempotência também
têm TTL. A separação em duas instâncias manteve todas.

> **Armadilha.** Uma instância única com `allkeys-lru` guardando cache de catálogo **e** chaves de
> idempotência. A promoção de Black Friday enche o cache, e a instância começa a despejar idempotência
> exatamente no pico de pagamentos. Cada chave despejada dentro da janela de repetição é um reenvio que passa
> pelo Redis. Se o banco não for a segunda linha (marco 05), é um pagamento duplicado.

### noeviction cheio

Com `noeviction`, a instância cheia recusa a escrita com
`OOM command not allowed when used memory > 'maxmemory'`. A leitura e o `DEL` continuam funcionando. No
laboratório, isso aconteceu depois de 12.339 escritas no Redis e de 14.148 no Valkey, numa instância de 5 MB.

O cliente precisa tratar esse erro como **falha** da operação: a reserva de idempotência não foi feita, e o
contador não subiu. O que acontece depois depende do mapa de estado (marco 06): a idempotência segue para o
banco, e o limite regulatório falha fechado. O erro silencioso, que o código ignora porque "o Redis é só um
acelerador", é o que transforma memória cheia em limite furado.

A fragmentação também conta: `mem_fragmentation_ratio` (em `INFO memory`) acima de 1,5 quer dizer que o
processo ocupa bem mais que o dataset. A desfragmentação ativa (`activedefrag`) vem desligada nos dois motores,
conferido nas imagens oficiais.

## Exemplo numa fintech

O `fin-kv` roda em duas instâncias, com a janela de perda de cada uma escrita no mapa de estado:

| | `kv-cache` | `kv-estado` |
| --- | --- | --- |
| guarda | catálogo, configuração lida do banco, sessões | idempotência, limites, leases, *streams* |
| `maxmemory-policy` | `allkeys-lru` | `noeviction` |
| persistência | nenhuma | AOF `everysec` |
| perde no crash do processo | tudo (é cache) | quase nada: 0 em 40 rodadas no Redis, até 4 ms no Valkey |
| perde na queda do *host* | tudo | até ~1 s de escrita |
| quando enche | despeja | recusa com `OOM`, e o cliente trata como falha |

A perda de até 1 s do `kv-estado` na queda do *host* é aceitável, porque nada ali é fonte da verdade. A
idempotência tem o banco como segunda linha (05), o limite é reconciliado com o banco (06), e o *lease* tem
fencing token (07). Se algum uso precisasse de perda zero na queda do *host*, ele usaria `WAITAOF` por comando, ou
não moraria no Redis.

## Hands-on

**Tutorial.** Escreva o gerador de escrita com sequência numerada e o verificador pós-*restart*:

```go
v, err := rdb.Incr(ctx, "seq").Result() // v só conta como confirmado se a resposta chegou
// ... docker kill -s KILL kv-estado; docker start kv-estado
recuperado, _ := rdb.Get(ctx, "seq").Int64()
perdidas := maiorConfirmado - recuperado
```

```java
long v = template.opsForValue().increment("seq"); // confirmado só quando o valor volta
// ... docker kill -s KILL kv-estado; docker start kv-estado
long recuperado = Long.parseLong(template.opsForValue().get("seq"));
```

**Desafio.** Medir as janelas de perda de cada configuração e escrever o mapa de estado das duas instâncias com
o número de cada uma.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos foram provados em Go.

1. Com AOF `everysec` e `kill -9` do processo sob carga contínua, as escritas confirmadas perdidas ficam abaixo de
   1 s de escrita em 20 rodadas (máximo registrado), com `aof_delayed_fsync` em zero. A janela de até 1 a 2 s da
   queda do *host* fica no ADR, conferida no código.
2. Com `appendfsync always`, zero escrita confirmada perdida, e a vazão medida cai. O teste registra o número.
3. Com só RDB, a perda medida é coerente com o intervalo do `save`.
4. Com `allkeys-lru` e memória cheia, o teste **encontra chaves de idempotência despejadas**. Com a separação em
   duas instâncias, nunca.
5. O `kv-estado` cheio devolve `OOM` à escrita, e o cliente trata como falha, e não como sucesso silencioso.
6. O pico de *copy-on-write* durante o `BGSAVE` sob escrita intensa é medido e cabe na margem declarada de
   `maxmemory`.

**Complemento.** Reproduza a queda do *host*: rode o `kv-estado` numa VM, escreva sob carga com `everysec` e
desligue a VM pelo hipervisor, sem *shutdown*. Quantas escritas confirmadas se perderam, e quanto tempo de escrita
isso representa?

**Checagem**

1. Por que o `kill -9` quase não perdeu escrita com `everysec`, e que falha perde até 1 s?
2. O que o `always` fecha que o `everysec` não fecha, e quanto custou no laboratório?
3. Por que a memória quase dobra durante um `BGSAVE` com escrita intensa, e o que isso exige do limite do
   contêiner?
4. Por que `volatile-lru` não protege as chaves de idempotência de uma instância compartilhada com cache?

> **Reencontro — `dados-distribuidos/05` e `/12`; `kubernetes/05`; `observabilidade/07`.** O `fsync` e o *page
> cache* são o mesmo mecanismo do WAL de `dados-distribuidos/05`, e a diferença entre crash do processo e crash
> da máquina é a mesma. O RDB é o *backup* de `dados-distribuidos/12`, com o RPO do intervalo. O limite de
> memória que mata o processo no meio do *save* é o de `kubernetes/05`. E `evicted_keys`, `rejected_calls` com
> `OOM` e `mem_fragmentation_ratio` são as métricas de `observabilidade/07` que avisam antes do incidente.

## Principais aprendizados

- O Redis perde sem erro de dois jeitos: crash antes do `fsync` e *eviction*. Os dois entram no mapa de estado, com
  tamanho.
- O RDB perde tudo desde o último *snapshot*: até 5,4 s com um *snapshot* a cada 5 s.
- Com AOF, o `kill -9` do processo quase não perdeu escrita confirmada (0 em 40 rodadas no Redis, até 4 ms numa de 60
  no Valkey), porque o dado já estava no kernel. A janela de 1 s do `everysec` é da queda do *host*, e um disco lento a
  estende ao próprio processo, por até 2 s.
- O `always` fecha também a janela do *host* e custou 75% da vazão. O `WAITAOF` faz isso por comando.
- O `fork` quase dobra a memória sob escrita intensa: *copy-on-write* de 91% a 102% do dataset.
- A *eviction* não distingue cache de estado. Numa instância compartilhada, de 80% a quase 100% das chaves de
  idempotência sumiram. Estado vai numa instância com `noeviction`, e o `OOM` é tratado como falha.
