---
id: replicacao-sentinel-e-failover
title: "Replicação, Sentinel e failover"
summary: "A replicação do Redis é assíncrona: o OK que você recebeu pode não existir no primário promovido. WAIT reduz a janela, não a fecha. Sincronização completa e parcial, o backlog, leitura em réplica; o primário isolado que continua aceitando escrita; min-replicas-to-write como freio; o que WAIT garante; Sentinel, quórum e descoberta pelo cliente; o que o Redis não é. Medido nos dois motores, com o primário isolado por 6 s: cerca de 10 mil escritas confirmadas sumiram no failover; com min-replicas, o isolado parou de aceitar em 3 s e a perda caiu à metade; com WAIT 1 100, nenhuma; os clientes Java e Go voltaram a escrever em 2,4 a 2,7 s."
estimatedMinutes: 60
reviewedAt: 2026-11-22
reviewEvery: 6m
competencies: [confiabilidade, dados]
references:
  - title: "Redis — Replication"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/replication/
  - title: "Redis — High availability with Sentinel"
    url: https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/
  - title: "Valkey — Replication"
    url: https://valkey.io/topics/replication/
  - title: "Jepsen — Orkes Conductor"
    url: https://jepsen.io/analyses
---

## A replicação é assíncrona

O primário responde `OK` ao cliente **antes** de a réplica receber a escrita. A escrita vai para as réplicas
logo depois, pelo mesmo fluxo de comandos. Na maior parte do tempo, "logo depois" são microssegundos. Num
*failover*, é a diferença entre uma escrita que existe e uma que sumiu.

Este marco mede essa diferença. A régua é a mesma da `dados-distribuidos/02`: replicação assíncrona dá
disponibilidade e leitura escalável, e cobra em durabilidade de escrita.

## Sincronização completa, parcial e o backlog

Uma réplica nova pede **sincronização completa**: o primário gera um RDB, por `fork` (marco 09), e o envia. Depois,
segue o fluxo de comandos. Quando a conexão cai e volta, a réplica pede **sincronização parcial** com `PSYNC`,
informando até onde recebeu. O primário reenvia o que falta do ***replication backlog***, um *buffer* circular com
as escritas recentes. Se o que falta já saiu do *backlog*, a sincronização volta a ser completa, com outro `fork` e
outro RDB inteiro.

> **Diferença Redis × Valkey.** O `repl-backlog-size` padrão é de **1 MB** no Redis 8.10 e de **10 MB** no Valkey
> 9.1. Com 1 MB e algumas dezenas de MB/s de escrita, uma réplica que fica 1 s desconectada já não cabe no
> *backlog*. Dimensione pelo pior intervalo de desconexão que você aceita, vezes a taxa de escrita. O Redis 8 também
> envia o RDB e o fluxo de comandos por canais separados na sincronização completa (`rdb-channel`, ligado por
> padrão, visto nos *logs* do laboratório). O Valkey tem o equivalente, `dual-channel-replication-enabled`, desligado
> por padrão.

A primeira sincronização também tem um atraso de propósito: com a sincronização sem disco (padrão nos dois motores),
o primário espera `repl-diskless-sync-delay`, **5 s**, para juntar réplicas que cheguem ao mesmo tempo. No laboratório
do marco 11, um primário derrubado antes desses 5 s deixou uma réplica que nunca tinha sincronizado, e ela não assumiu
no *failover*.

**Leitura em réplica** devolve um dado que pode estar atrasado. Ler da réplica logo depois de escrever no primário
pode não encontrar a escrita (`dados-distribuidos/02`). Para o `fin-kv`, leitura em réplica só serve para o que é
cache.

## O primário isolado continua aceitando escrita

O cenário que quebra a intuição é a **partição**: o primário perde o contato com as réplicas e os sentinelas, mas
alguns clientes continuam falando com ele. Os sentinelas, do outro lado, decidem que ele caiu e promovem uma
réplica. Agora há dois primários. O antigo aceita escritas que nenhuma réplica recebe. Quando a partição cura, os
sentinelas o reconfiguram como réplica do novo, e ele **descarta** tudo o que aceitou sozinho para sincronizar.

O laboratório montou um primário, duas réplicas e três sentinelas, com `down-after-milliseconds 1000` para encurtar
o *failover*. Os clientes escreviam chaves de idempotência pelo lado do primário, e a partição o isolou por 6 s:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| confirmadas durante a partição | 10.235 | 9.920 |
| **confirmadas que não existiam depois do failover** | **10.200** | **9.880** |

Praticamente tudo o que o primário isolado confirmou sumiu. Todas essas escritas receberam `OK`. A análise do Jepsen
sobre o Orkes Conductor, publicada em outubro de 2026, observou a mesma perda de escritas confirmadas em Redis
Sentinel e Cluster sob partição.

> **Armadilha.** Achar que três sentinelas e duas réplicas dão "alta disponibilidade sem perda". Dão
> disponibilidade: o sistema volta a aceitar escrita em segundos. Perda é outra conversa, e o número dela, sob
> partição, é tudo o que o primário isolado aceitou.

## min-replicas-to-write: o freio

`min-replicas-to-write N` com `min-replicas-max-lag S` faz o primário **recusar escrita** (erro `NOREPLICAS`) quando
tem menos de N réplicas com atraso de até S segundos. O primário isolado perde as réplicas, e depois de S segundos
para de aceitar. O padrão de `min-replicas-to-write` é 0 (desligado), e o de `min-replicas-max-lag` é 10 s, nos dois
motores.

Com `min-replicas-to-write 1` e `min-replicas-max-lag 2`, o mesmo cenário:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| o isolado passou a recusar escrita | 3,0 s depois da partição | 2,8 s depois da partição |
| confirmadas que sumiram | 5.088 | 4.653 |

A perda caiu à metade, e não a zero: tudo o que foi confirmado antes do freio atuar continua perdido. O freio fecha
a janela em `max-lag` mais cerca de 1 s (o intervalo do *ping* das réplicas). O preço é de disponibilidade: um
primário sem réplicas saudáveis para de aceitar escrita, mesmo sem partição nenhuma.

## WAIT: confirmação da réplica, não persistência

`WAIT numreplicas timeout` (O(1)) bloqueia o cliente até que N réplicas tenham **recebido** as escritas anteriores
daquela conexão, ou até o prazo. Ele devolve quantas confirmaram. O cliente que trata "menos de N" como falha só
considera confirmada a escrita que chegou a uma réplica.

Com `WAIT 1 100` depois de cada escrita, o mesmo cenário perdeu **zero** escritas confirmadas, nos dois motores.
Durante a partição, só 28 escritas foram confirmadas, as que chegaram às réplicas antes de o corte ser percebido. O
resto voltou como falha ao cliente, que é o comportamento certo. O custo, antes da partição e com tudo no mesmo
*host*:

| Latência por escrita | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| `SET` sozinho: p50 / p99 | 0,15 / 0,37 ms | 0,13 / 0,28 ms |
| `SET` + `WAIT 1 100`: p50 / p99 | 0,33 / 0,58 ms | 0,29 / 0,51 ms |

O `WAIT` dobrou a latência no mesmo *host*. Entre zonas, ele soma um RTT até a réplica a cada escrita.

O que o `WAIT` **não** garante:

- **persistência:** a réplica recebeu, e talvez ainda não tenha gravado no disco. O `WAITAOF` do marco 09 cobre isso;
- **que a réplica promovida seja a que recebeu:** com duas réplicas e `WAIT 1`, a promovida pode ser a outra.
  O laboratório não encontrou esse caso em 6 s de partição, e ele continua possível;
- **atomicidade:** o `WAIT` vem depois da escrita, e uma escrita que deu `OK` e falhou no `WAIT` pode existir ou não.

`WAIT` reduz a janela. Não a fecha.

## Sentinel

O **Sentinel** monitora o primário e as réplicas, decide quando o primário caiu e promove uma réplica:

- cada sentinela marca o primário como subjetivamente fora do ar depois de `down-after-milliseconds` sem resposta
  (padrão de **30 s** nos dois motores; o laboratório usou 1 s);
- quando o **quórum** concorda, o primário está objetivamente fora do ar, e um sentinela é eleito para conduzir o
  *failover*. O quórum decide a detecção, e a maioria dos sentinelas autoriza a promoção;
- a réplica escolhida vira primário, e as outras passam a replicar dela.

O cliente **não** guarda o endereço do primário. Ele pergunta aos sentinelas (`SENTINEL get-master-addr-by-name`) e
reconecta quando o primário muda. No laboratório, depois de um `docker kill` do primário:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| go-redis `FailoverClient`: escrita indisponível | 2,42 s | 2,41 s |
| Lettuce com URI de Sentinel: escrita indisponível | 2,65 s | 2,67 s |

Os dois clientes voltaram a escrever no novo primário sem reiniciar, bem abaixo do SLO de 10 s que o `fin-kv`
declara. Com o padrão de 30 s do `down-after-milliseconds`, a mesma indisponibilidade passaria de 30 s.

**Sentinel, cluster ou gerenciado?** O Sentinel resolve disponibilidade de um conjunto de dados que cabe num
primário. O cluster (marco 11) divide o conjunto entre vários primários, cada um com as suas réplicas e o mesmo
*failover* assíncrono. O gerenciado (marco 13) entrega um dos dois operado por outro. Nenhum dos três muda a
assincronia.

**O Redis não é um sistema de consenso.** O Sentinel elege um líder para conduzir o *failover*, mas a escrita
confirmada não passa por consenso. Para o que precisa de "escrita confirmada nunca some", o lugar é o banco, ou um
sistema com replicação síncrona por quórum.

## Exemplo numa fintech

Uma partição de rede isolou o primário do `kv-estado` por alguns segundos, com duas réplicas `pix-gateway` do lado
dele. As duas continuaram reservando chaves de idempotência e marcando-as `CONCLUIDO`. Quando a partição curou, o
primário antigo virou réplica e descartou tudo o que tinha aceitado sozinho.

O laboratório reproduziu o cenário com o filtro do marco 05. Das cerca de 4 mil iniciações, as **300** feitas pelo
lado isolado tiveram as reservas apagadas pelo *failover*. O TPP reenviou todas as 4 mil, e o reenvio gerou **zero**
efeitos novos, nos dois motores: o `INSERT` no `fin-store` falhou por unicidade em cada uma, e o banco devolveu a
resposta original. A defesa do marco 05 é o que transforma uma perda de 300 escritas confirmadas num não-evento.

O `kv-estado` roda com `min-replicas-to-write 1` e `min-replicas-max-lag 2`, o que limita o tamanho do problema. O
ADR registra que isso não o elimina, e que a garantia é do banco.

## Hands-on

**Tutorial.** Suba a topologia `sentinel`: um primário, duas réplicas e três sentinelas, em duas redes Docker. A
rede interna liga os nós e os sentinelas, e a rede dos clientes liga os clientes aos nós. Para isolar o primário,
desconecte-o da rede interna (`docker network disconnect`). Os clientes do lado dele continuam escrevendo.

```go
rdb := redis.NewFailoverClient(&redis.FailoverOptions{
    MasterName: "mestre", SentinelAddrs: []string{"s1:26379", "s2:26379", "s3:26379"},
    DialTimeout: 300 * time.Millisecond, ReadTimeout: 300 * time.Millisecond, DialerRetries: 1})
n, err := rdb.Wait(ctx, 1, 100*time.Millisecond).Result() // n < 1: trate como falha
```

```java
RedisURI uri = RedisURI.Builder.sentinel("s1", 26379, "mestre")
        .withSentinel("s2", 26379).withSentinel("s3", 26379).build();
var conn = RedisClient.create(uri).connect(); // pergunta aos sentinelas e segue o primário
```

**Desafio.** Medir e limitar a perda: o número sem freio, com `min-replicas-to-write` e com `WAIT`.

**Invariantes testáveis**

Todos rodam contra o Redis **e** o Valkey.

1. Com uma partição isolando o primário e escrita contínua, o teste **conta as escritas confirmadas que não existem
   depois do failover**. É o defeito documentado, com número.
2. Com `min-replicas-to-write 1` e `min-replicas-max-lag` configurados, o primário isolado passa a recusar escrita em
   até `max-lag` mais uma margem, e a contagem de perdas cai. Os dois números são medidos.
3. Com `WAIT 1 100` em cada escrita crítica, o teste mede a latência adicional e a perda residual.
4. Os clientes Java e Go reconectam ao novo primário via Sentinel sem reinício, e a indisponibilidade de escrita fica
   abaixo do SLO declarado.
5. O efeito no `fin-store` continua único em todos os cenários: a defesa do marco 05.

**Complemento.** Repita o invariante 1 com `down-after-milliseconds` no padrão de 30 s. Quantas escritas o
primário isolado aceita antes do *failover*, e quantas o `min-replicas-max-lag 2` evitaria?

**Checagem**

1. Por que uma escrita que recebeu `OK` pode não existir depois do *failover*?
2. O que acontece com as escritas que o primário isolado aceitou quando a partição cura?
3. O que o `min-replicas-to-write` limita, e o que continua perdido mesmo com ele?
4. O que o `WAIT` garante e o que ele não garante?

> **Reencontro — `dados-distribuidos/01` e `/02`; `system-design/13`; `aws-para-backend/10`.** A partição e o
> nó que não sabe que foi substituído são o modelo de falha de `dados-distribuidos/01`, e a replicação
> assíncrona com leitura atrasada é a de `dados-distribuidos/02`. O SLO de indisponibilidade de escrita entra na
> conta de disponibilidade de `system-design/13`. E o teste de partição é um experimento de caos, como os de
> resiliência de `aws-para-backend/10`.

## Principais aprendizados

- A replicação é assíncrona. O primário confirma antes de a réplica receber.
- Sob partição, o primário isolado aceita escrita, e tudo o que ele aceita some quando a partição cura: cerca de 10 mil
  escritas confirmadas em 6 s, no laboratório.
- `min-replicas-to-write` faz o isolado recusar depois de `max-lag`, e a perda caiu à metade, não a zero.
- `WAIT` confirma recebimento pela réplica, e não persistência. Com `WAIT 1 100`, a perda medida foi zero, e a garantia
  continua sendo de redução.
- O Sentinel dá disponibilidade: os clientes Java e Go voltaram em 2,4 a 2,7 s, sem reiniciar. O `down-after-milliseconds`
  padrão de 30 s estica isso.
- O Redis não é um sistema de consenso. A garantia de efeito único é do banco, e o reenvio das 300 reservas perdidas não
  gerou nenhum efeito novo.
