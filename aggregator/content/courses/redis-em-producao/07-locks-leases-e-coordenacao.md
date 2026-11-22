---
id: locks-leases-e-coordenacao
title: "Locks, leases e coordenação"
summary: "Um lock no Redis é um lease: ele expira. Correção exige três coisas: liberar só o que é seu, renovar antes de expirar e impedir que o dono antigo escreva depois de perder o lease. SET NX PX com token; liberação por comparação de dono, com nome diferente em cada motor; renovação com SET IFEQ; a pausa do processo; o fencing token verificado no recurso protegido; quando o lock é a ferramenta errada; Redisson e ShedLock lidos no código. Medido nos dois motores: com o dono congelado por SIGSTOP, o fin-store recusou a escrita atrasada; em 1.000 trabalhadores disputando 200 dias, nenhum dia teve dois donos com fencing, e de 51 a 59 tiveram sem."
estimatedMinutes: 55
reviewedAt: 2026-11-20
reviewEvery: 6m
competencies: [confiabilidade, arquitetura]
references:
  - title: "Redis — Distributed locks with Redis"
    url: https://redis.io/docs/latest/develop/use/patterns/distributed-locks/
  - title: "Martin Kleppmann — How to do distributed locking"
    url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  - title: "Valkey — DELIFEQ"
    url: https://valkey.io/commands/delifeq/
  - title: "PostgreSQL — Advisory Locks"
    url: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
---

## Todo lock no Redis é um lease

Um lock que não expira trava o sistema quando o dono morre. Então todo lock no Redis tem prazo: ele é um
***lease***, um direito exclusivo **por um tempo**. A aquisição é um comando só:

```
SET job:lease:conciliacao <token> NX PX 30000
```

O `NX` grava só se ninguém tem o lease, o `PX` dá o prazo, e o `<token>` é um valor aleatório que identifica
o dono. Sem o token, não há como saber depois se o lease ainda é seu.

O prazo resolve o dono morto e cria o problema deste marco: **o dono vivo que perde o lease sem saber**. Um
processo pode ficar parado mais que o prazo por uma pausa de GC, um `docker pause`, uma VM migrando ou uma
chamada de rede travada. Quando ele volta, o lease já expirou e talvez seja de outro, e ele continua o
trabalho como se nada tivesse acontecido. `dados-distribuidos/01` chamou isso de pausa de processo, e
`dados-distribuidos/10` mostrou por que nenhum algoritmo de lock, Redlock incluído, resolve sozinho. Este
marco recapitula esse argumento em uma página e passa ao que fazer.

A correção exige três coisas, e cada seção a seguir trata de uma:

1. liberar só o lease que é seu;
2. renovar antes de expirar;
3. impedir que o dono antigo escreva depois de perder o lease.

## Liberar só o que é seu

O `DEL job:lease:conciliacao` libera o lease de quem quer que o tenha. O processo que pausou além do prazo e
volta para liberar apaga o lease que **agora é de outro**, e um terceiro processo pode adquiri-lo enquanto o
segundo ainda trabalha.

> **Armadilha.** Liberar o lock com `DEL` sem checar o dono. O processo lento apaga o lock que agora é de
> outro, e dois processos passam a trabalhar ao mesmo tempo. No laboratório, nos dois motores, o lease do
> segundo dono desapareceu no `DEL` do primeiro.

A liberação segura compara o token e apaga sem intercalação. Um script Lua faz isso nos dois motores:

```lua
-- KEYS[1] = job:lease:<job>; ARGV[1] = token do dono
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

> **Diferença Redis × Valkey.** Os dois motores ganharam um comando nativo para comparar e apagar, com
> nomes diferentes. No Redis 8.4+, `DELEX chave IFEQ token` (O(1)). No Valkey 9.0+, `DELIFEQ chave token`
> (O(1)). Cada motor responde `unknown command` ao comando do outro, como o laboratório confirmou. O script
> funciona nos dois, e por isso o `fin-kv` o mantém.

## Renovar antes de expirar

Um job que pode demorar mais que o prazo precisa renovar o lease enquanto trabalha. Esse é o ***watchdog***:
uma *thread* que, a cada terço do prazo, estende o lease, **mas só se ele ainda for do mesmo dono**. Os dois
motores fazem isso num comando:

```
SET job:lease:conciliacao <token> IFEQ <token> PX 30000
```

O `IFEQ` (Redis 8.4+, Valkey 8.1+) só grava se o valor atual for o token. Se outro dono já tem o lease, o
comando devolve nulo, e o *watchdog* sabe que perdeu.

O *watchdog* não resolve a pausa. Uma pausa de GC congela o processo inteiro, e o *watchdog* junto com ele.
No laboratório, o dono foi congelado com `SIGSTOP`, o mesmo mecanismo do `docker pause`, por 900 ms, com um
lease de 300 ms. Quando o processo voltou, o *watchdog* encontrou o lease com outro dono e marcou a perda. Só
que o trabalho do processo continuou do ponto em que tinha parado, e a próxima linha era a escrita no banco.
Checar o lease antes de escrever também não fecha o buraco, porque a pausa pode acontecer entre a checagem e
a escrita.

## Fencing token: quem verifica é o recurso

A terceira exigência não se resolve no Redis. Ela se resolve **no recurso protegido**, que é quem recebe a
escrita.

O ***fencing token*** é um número que só cresce, emitido junto com o lease. O `fin-kv` emite o token no mesmo
script que adquire o lease, com um `INCR`, para que as duas coisas aconteçam juntas ou não aconteçam. O dono
manda o token em toda escrita, e o recurso guarda o maior token que já viu e recusa qualquer escrita com
token menor. Um dono antigo que volta de uma pausa tem um token menor que o do dono atual, e o recurso o
recusa, por mais convencido que ele esteja de ainda ter o lease.

No `fin-store`, a conciliação de um dia tem duas etapas:

- **reivindicar:** o dono registra o seu token no dia (`INSERT ... ON CONFLICT DO UPDATE ... WHERE
  conciliacao.fence < EXCLUDED.fence AND status <> 'CONCLUIDO'`). Um token maior toma o lugar de um menor que
  ainda não concluiu, e um dia concluído não é reaberto;
- **concluir:** a escrita final só é aceita se o token for o registrado (`UPDATE ... WHERE dia = $1 AND
  fence = $2 AND status = 'EM_CURSO'`).

O laboratório mediu o cenário inteiro nos dois motores, com o dono como um processo separado congelado por
`SIGSTOP`:

| | Com fencing | Sem fencing |
| --- | --- | --- |
| dono-1 adquire com token 1 e é congelado | — | — |
| dono-2 adquire com token 2, 930 ms depois, e escreve | aceita | aceita |
| dono-1 volta e escreve | **recusada pelo `fin-store`** | aceita |
| escritas no dia | 1 (dono-2) | 2 (dono-1 e dono-2) |

Depois, 1.000 trabalhadores disputaram 200 dias de conciliação, 5 por dia, com lease de 100 ms e uma pausa de 150
a 300 ms em 30% das execuções:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| com fencing: escritas recusadas pelo `fin-store` / dias com dois donos | 102 / **0** | 68 / **0** |
| sem fencing: dias com dois donos, de 200 | **59** | **51** |

As 102 recusas no Redis passaram das 83 pausas injetadas. Com mil trabalhadores e um prazo de 100 ms, a carga
sozinha atrasou renovações o bastante para leases expirarem. É o mesmo efeito de uma pausa, sem pausa nenhuma,
e o fencing também o pegou.

## Quando o lock no Redis é a ferramenta errada

Se o recurso protegido é o banco, e quase sempre é, o banco já tem os mecanismos:

- ***advisory lock* do Postgres:** `pg_try_advisory_lock(chave)` dá um lock exclusivo que dura enquanto a sessão
  existir. Ele não expira por tempo. Se o processo congela, o lock continua com ele, e ninguém escreve no lugar.
  O custo é o oposto do lease: o job fica parado até o processo voltar ou a conexão cair;
- **`SELECT ... FOR UPDATE SKIP LOCKED`:** vários trabalhadores pegam linhas diferentes de uma fila de tarefas
  no banco sem se bloquear, e cada linha fica com quem a travou até o fim da transação;
- **lease em tabela:** uma linha com dono, prazo e token, atualizada na mesma transação da escrita. O fencing
  vem de graça, porque o lease e o dado estão no mesmo lugar.

O lock no Redis vale quando o recurso protegido **não** é transacional junto com o lease, ou quando a contenção
é alta demais para o banco. Nos dois casos, o fencing continua necessário, verificado por quem recebe a escrita.

## Eleição de líder e bibliotecas prontas

Uma eleição simples de líder para um job é o mesmo lease: quem tem `job:lider:<job>` é o líder, renova
enquanto vive, e o resto tenta adquirir de tempos em tempos. Tudo o que vale para o lease vale para o líder,
inclusive o líder antigo que volta de uma pausa achando que ainda manda.

As bibliotecas prontas resolvem parte disso. Leia o código antes de adotar. O que o laboratório encontrou nas
versões atuais:

- **Redisson 4.8.0:** o `RLock` renova o lease com um *watchdog* cujo prazo padrão é de 30 s
  (`lockWatchdogTimeout`), e não emite fencing token. Existe um `RFencedLock`, que emite um token crescente a
  cada aquisição. A verificação continua com quem recebe a escrita;
- **ShedLock 7.11.0** (provedor Redis do Spring): adquire com `SET ... NX PX`. A liberação só confere o dono com
  `safeUpdate(true)`, e o padrão é `false`. Sem essa opção, o processo que passou do `lockAtMostFor` libera um
  lock que pode já ser de outro, que é a armadilha deste marco.

## Exemplo numa fintech

O job de **conciliação D+1** do `ledger-core` compara o razão com o extrato do PSP e grava o resultado do dia no
`fin-store`. Ele roda em três réplicas, para sobreviver à queda de uma, e precisa rodar **uma vez** por dia.
Rodar duas vezes duplica os ajustes de `ledger-e-contabilidade/08`.

A primeira versão usava um lease no Redis com `DEL` na liberação e sem fencing. Ela funcionou por meses, até um dia
com uma pausa de GC de 40 s numa réplica, em que o lease era de 30 s. Outra réplica adquiriu o lease e rodou a
conciliação. A primeira acordou e gravou o mesmo dia por cima. Os dois jeitos de quebrar que este marco mede
aconteceram juntos.

A versão do `fin-kv` usa o lease com token e o fencing no `fin-store`. O ADR comparou essa solução com o
*advisory lock* do Postgres para o mesmo job e escolheu o lease com fencing. O *advisory lock* deixaria o job
parado durante a pausa, e a conciliação tem prazo regulatório. O lease passa o trabalho para outra réplica, e o
fencing impede a escrita dupla.

## Hands-on

**Tutorial.** Implemente o lease com token, *watchdog* e liberação segura, em Go e em Java. Os scripts
`adquirir_lease.lua` (lease mais fencing token) e `liberar_lease.lua` moram em `lua/`:

```go
fence, err := adquirir.Run(ctx, rdb, []string{"job:lease:conc", "job:fence:conc"}, token, ttl.Milliseconds()).Int64()
// watchdog, a cada ttl/3: renova só se ainda é o dono
err = rdb.Do(ctx, "SET", "job:lease:conc", token, "IFEQ", token, "PX", ttl.Milliseconds()).Err()
if errors.Is(err, redis.Nil) { /* perdeu o lease */ }
```

```java
Long fence = template.execute(adquirir, List.of("job:lease:conc", "job:fence:conc"), token, "30000");
// ... trabalho; toda escrita no fin-store leva o fence
template.execute(liberar, List.of("job:lease:conc"), token);
```

**Desafio.** O job de conciliação à prova de pausa: três réplicas, uma congelada no meio do trabalho, e o dia
escrito uma vez.

**Invariantes testáveis**

Todos rodam contra o Redis **e** o Valkey, em Java e em Go.

1. A liberação ingênua apaga o lease de outro dono num cenário reproduzido. A segura, nunca.
2. Com o dono congelado (`SIGSTOP` ou `docker pause`) por mais que o prazo, um segundo processo adquire o lease, e a
   escrita atrasada do primeiro é recusada pelo `fin-store` por fencing token menor.
3. Em 1.000 execuções com pausas aleatórias, nenhum dia de conciliação é escrito por dois donos. A verificação é
   sobre a tabela.
4. O ADR compara a solução no Redis com o *advisory lock* do Postgres para o mesmo job e escolhe com critério
   escrito.

**Complemento.** Troque o `SIGSTOP` por `docker pause` no contêiner do dono e repita o invariante 2. Depois,
implemente o mesmo job com `pg_try_advisory_lock` e congele o dono: o que acontece com o dia, e com o prazo?

**Checagem**

1. Por que todo lock no Redis é um lease, e que problema o prazo cria?
2. O que o *watchdog* resolve, e por que ele não resolve a pausa do processo?
3. Onde o fencing token é verificado, e por que não pode ser no Redis?
4. Quando você usaria o *advisory lock* do Postgres em vez de um lease no Redis?

> **Reencontro — `dados-distribuidos/01` e `/10`; `concorrencia-e-recursos/09`;
> `ledger-e-contabilidade/08`.** A pausa de processo é o modelo de falha de `dados-distribuidos/01`. O Redlock e o
> argumento do fencing token são de `dados-distribuidos/10`; aqui viraram teste, com o dono congelado de verdade. A
> pausa de GC que dispara tudo isso se diagnostica com as ferramentas de `concorrencia-e-recursos/09`. E a
> conciliação que não pode rodar duas vezes é a de `ledger-e-contabilidade/08`.

## Principais aprendizados

- Todo lock no Redis é um lease. O prazo resolve o dono morto e cria o dono vivo que perdeu o lease sem saber.
- Libere só o que é seu: script de comparar e apagar, ou `DELEX ... IFEQ` no Redis 8.4+ e `DELIFEQ` no Valkey 9.0+.
- Renove com `SET ... IFEQ token PX`. O *watchdog* para junto com o processo e não resolve a pausa.
- O fencing token é verificado no recurso protegido. Com ele, nenhum dia teve dois donos. Sem ele, 51 a 59 de 200
  tiveram.
- Se o recurso é o banco, considere o *advisory lock*, o `SKIP LOCKED` ou o lease em tabela.
- Leia a biblioteca antes de adotar. O ShedLock só confere o dono na liberação com `safeUpdate`, e o `RLock` do
  Redisson não emite fencing token.
