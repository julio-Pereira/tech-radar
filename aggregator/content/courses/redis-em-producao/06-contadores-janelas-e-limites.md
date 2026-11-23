---
id: contadores-janelas-e-limites
title: "Contadores, janelas e limites"
summary: "O algoritmo de limite é de system-design/06; aqui está o que quebra quando ele roda no Redis, e o que o sistema faz quando o Redis não responde. INCR e EXPIRE separados e a chave eterna; INCREX no Redis 8.8; janela fixa, janela por log e contador ponderado; o relógio dentro do script; limite em várias dimensões como um todo; falhar aberto, fechado ou degradar, por tipo de limite; reconciliar com o banco. Medido nos dois motores: a janela por log nunca passou de 50 em 1 s, o contador ponderado chegou a 67, e o go-redis levou 400 ms para decidir que o Redis tinha caído."
estimatedMinutes: 60
reviewedAt: 2026-11-20
reviewEvery: 6m
competencies: [confiabilidade, seguranca]
references:
  - title: "Redis — INCR (padrão de rate limiter)"
    url: https://redis.io/docs/latest/commands/incr/
  - title: "Redis — Scripting with Lua"
    url: https://redis.io/docs/latest/develop/interact/programmability/eval-intro/
  - title: "go-redis — Options"
    url: https://pkg.go.dev/github.com/redis/go-redis/v9#Options
---

## O algoritmo é de outro marco

`system-design/06` escolheu os algoritmos (janela fixa, janela deslizante, *token bucket*) pelo defeito de
cada um, e decidiu, por endpoint, se o limite falha aberto ou fechado. Este marco não repete a escolha. Ele
mostra o que quebra quando o algoritmo roda no Redis: comandos que deviam andar juntos e andam separados,
relógios que discordam, chaves que moram em nós diferentes. E mostra o que o limite faz quando o Redis não
responde.

## INCR e EXPIRE: a chave eterna

A janela fixa mais simples são dois comandos: `INCR cap:api:<cliente>:<minuto>` (O(1)) e, se o resultado é 1,
`EXPIRE` (O(1)) com a duração da janela. São dois comandos, e o processo pode morrer entre eles. Quando isso
acontece, a chave fica **sem TTL para sempre**. Ela não expira, o contador nunca zera, e o cliente fica bloqueado
até alguém apagar a chave na mão.

No laboratório, nos dois motores, um cliente fez o `INCR` e fechou a conexão antes do `EXPIRE`, e o `TTL` da
chave voltou −1, que quer dizer sem expiração. Três correções resolvem:

- **script:** `INCR` e `PEXPIRE` no mesmo script Lua, que o servidor executa sem intercalação (marco 04);
- **`SET NX EX` antes do `INCR`:** `SET chave 0 NX EX 60` cria a chave já com TTL, e o `INCR` depois só incrementa.
  Morrer entre os dois deixa uma chave com TTL, e não uma eterna;
- **`INCREX`:** um comando só, no Redis 8.8+.

> **Diferença Redis × Valkey.** O Redis 8.8 traz `INCREX chave BYINT n UBOUND teto EX segundos ENX`
> (O(1)): incrementa até um teto e põe o TTL só quando a chave nasce (`ENX`), num comando atômico. Ele devolve
> o valor e se o incremento foi aplicado. No laboratório, com teto 2, o terceiro `INCREX` voltou `[2 0]`:
> recusado, e o contador parado no teto. É a janela fixa com limite inteira num comando. O Valkey 9.1 não tem
> `INCREX` e responde `unknown command`. Para os dois motores, o script.

## Janela fixa, janela por log e contador ponderado

A **janela fixa** deixa passar o dobro do limite na virada: o limite inteiro no último segundo de uma janela e o
limite inteiro no primeiro segundo da seguinte. As duas alternativas no Redis:

- **janela por *log*** (o *sorted set* do marco 03): cada pedido aceito vira um membro com o instante como
  *score*. Um script corta o que saiu da janela (`ZREMRANGEBYSCORE`, O(log N + M)), conta (`ZCARD`, O(1)) e só então
  aceita. É **exata**, e a memória é O(limite) por chave;
- **contador ponderado:** dois contadores, o da janela atual e o da anterior. A estimativa é o atual mais o anterior
  multiplicado pela fração da janela anterior que ainda está dentro da janela deslizante. A memória é constante, e
  o resultado é **aproximado**.

O laboratório mediu as duas sob a mesma carga. Foram 100 clientes concorrentes durante 3 s, cerca de 19.700
pedidos, com limite de 50 pedidos por segundo. Depois, o teste procurou o maior número de aceitos em qualquer
janela de 1 s sobre o *log* completo:

| | Redis 8.10.3 | Valkey 9.1.4 |
| --- | --- | --- |
| janela por *log*: aceitos / pior janela deslizante de 1 s | 150 / **50** | 150 / **50** |
| contador ponderado: aceitos / pior janela deslizante de 1 s | 164 / **64** | 167 / **67** |

O contador ponderado passou do limite em 28% a 34%, na virada da primeira janela. Isso não é *bug*: é a
aproximação que `system-design/06` descreve, medida. Para proteção de capacidade, ele é barato e suficiente. Para
um limite que o regulador vai conferir, a janela por *log*.

## O relógio

Uma janela depende de "agora", e há dois relógios para escolher:

- o **relógio do cliente:** cada instância do serviço tem o seu, e eles divergem. Duas instâncias com 200 ms de
  diferença discordam sobre qual pedido está na janela;
- o **relógio do servidor:** `TIME` (O(1)) dentro do script. Um relógio só para todos os clientes daquela chave.

O `fin-kv` usa `TIME` dentro do script da janela por *log*. Como o script é replicado pelos efeitos desde o
Redis 7.0 (marco 04), a réplica recebe o `ZADD` com o instante já calculado, e não reexecuta o `TIME`. Num
*failover* para uma réplica com o relógio diferente, as janelas em curso podem andar um pouco para a frente ou
para trás. O NTP da `dados-distribuidos/01` vale aqui também.

O script aceita um "agora" injetado, para teste. No laboratório, cinco pedidos entraram a cada 100 ms com o
relógio injetado, e um sexto chegou 1,25 s depois do primeiro. O log ficou só com os três últimos, como a janela
de 1 s manda.

O *token bucket* e o GCRA seguem a mesma regra: estado numa chave, relógio do servidor, tudo no script. O código
do Redis 8.10 tem um GCRA nativo, mas ele vem desligado no *build* (`ENABLE_GCRA`). Até ele chegar, é script.

## Limite em várias dimensões

O limite Pix noturno não é de uma coisa só. Ele vale por CPF, por conta e por dispositivo, e um pagamento só
passa se as três dimensões aceitarem. Se o script debitar o CPF e a conta e depois descobrir que o dispositivo
estourou, dois limites foram consumidos por um pagamento recusado.

O script do `fin-kv` faz duas passadas: primeiro **lê e valida todas as dimensões**, e só então **debita todas**.
É a regra do marco 04: toda validação antes da primeira escrita. No laboratório, 100 pagamentos concorrentes
sobre um CPF, duas contas e três dispositivos terminaram com cada contador igual à soma dos pagamentos aceitos
que passavam por ele, nos dois motores. O caso pontual também foi testado: um dispositivo perto do teto recusou
o pagamento, e o CPF e a conta ficaram em zero.

No *cluster* do marco 11, o script precisa que as três chaves estejam no mesmo *slot*, ou ele falha com
`CROSSSLOT`. Uma *hash tag* com o CPF (`pix:lim:{cpf:123}:conta:c1`) junta CPF e conta. O dispositivo pode
ser compartilhado entre clientes, e aí não cabe na mesma *tag*. O marco 11 volta a esse desenho.

## Falhar aberto, fechado ou degradar

O que o limite faz quando o Redis não responde é uma decisão de negócio, de `system-design/06`. O `fin-kv`
toma a decisão **por tipo de limite** e a escreve no mapa de estado (`estado/politicas-de-falha.json`), que o
código lê:

| Limite | Quando o Redis cai | Por quê |
| --- | --- | --- |
| limite Pix noturno (regulatório) | **falha fechada**: recusa | deixar passar é descumprir a regra na hora em que o golpe acontece |
| velocidade do antifraude | **sinal ausente**: o motor aplica a regra conservadora | o pagamento segue para revisão, sem o sinal e sem passe livre |
| capacidade da API | **degrada para limite local**: 10 por segundo por instância | proteger o serviço sem derrubar o tráfego legítimo |

No laboratório, com o Toxiproxy derrubando o Redis, o limite regulatório recusou com "limite indisponível", e
o de capacidade deixou passar 10 de 50 pedidos, o limite local.

O teste revelou um detalhe que a política escrita não mostrava. Com as opções padrão do go-redis v9.23, cada
decisão de "o Redis caiu" levou **402–403 ms**, porque o cliente tenta discar 5 vezes, com 100 ms entre as
tentativas (`DialerRetries` e `DialerRetryTimeout`). Com `DialerRetries: 1`, a mesma decisão levou menos de 1 ms.
Um limite que falha fechado em 400 ms soma esses 400 ms a toda requisição enquanto o Redis estiver fora. O marco 12
trata das opções do cliente.

> **Armadilha.** Limite Pix noturno aplicado só no Redis e falhando **aberto** quando o Redis cai. O limite
> regulatório some exatamente na hora em que o golpe acontece: o atacante que derruba a instância, ou que só
> espera a manutenção, ganha um período sem teto. Limite regulatório falha fechado, e a decisão vem escrita no
> mapa de estado, com dono.

## Reconciliar com o banco

O contador no Redis é **derivado**. A verdade é o banco, onde cada pagamento aceito foi registrado. Os dois
divergem por motivos conhecidos: um débito que entrou no Redis e cujo pagamento falhou depois, uma perda de
escritas no *failover* (marco 10), um *restart* sem persistência. A **reconciliação** compara periodicamente o
total do banco com o contador e corrige o contador para o valor do banco.

No laboratório, 300 pagamentos em 10 contas foram gravados nos dois lugares, e um débito de R$ 7,77 foi injetado
só no Redis, na conta `c7`. A reconciliação encontrou exatamente essa divergência, `redis=105807 banco=105030`,
nos dois motores, e corrigiu o contador mantendo o TTL (`SET ... KEEPTTL`).

## Exemplo numa fintech

O `pix-gateway` aplica dois limites a cada pagamento noturno. O **limite de valor no período** vale por CPF,
conta e dispositivo, usa o script multidimensional e falha fechado. O **limite por transação** é uma comparação
local, sem Redis. Os **contadores de velocidade do antifraude** são janelas por *log* no `ledger-core` e,
quando o Redis cai, chegam ao motor antifraude como sinal ausente. O mapa de estado do `fin-kv` registra as três
políticas, com o dono de cada uma.

Na primeira simulação de queda, o time descobriu os 400 ms do go-redis: enquanto o Redis esteve fora, cada
pagamento noturno esperou esse tempo antes de ser recusado. A recusa era a política. A espera não era, e foi
corrigida nas opções do cliente.

## Hands-on

**Tutorial.** Implemente, em script, a janela fixa, a janela por *log* e o contador ponderado, com relógio
injetável (os scripts estão em `lua/` e servem às duas linguagens):

```go
v, err := janelaLog.Run(ctx, rdb, []string{"cap:api:cli-42"},
    1_000_000, 50, pedidoID, "").Slice() // "" = relógio do servidor (TIME); um número = relógio injetado
```

```java
List<?> v = template.execute(janelaLog, List.of("cap:api:cli-42"),
        "1000000", "50", pedidoId, ""); // [aceito (1|0), agora em µs]
```

**Desafio.** Os limites do `fin-kv`: o limite noturno multidimensional, os contadores de velocidade e a
proteção de capacidade, cada um com a sua política de falha lida do mapa de estado.

**Invariantes testáveis**

Rodam contra o Redis **e** o Valkey. No laboratório desta trilha, todos os testáveis foram provados em Go; em Java, os de número 1 e 2.

1. Matando o cliente entre `INCR` e `EXPIRE` na versão ingênua, o teste encontra a chave sem TTL. Nas versões
   corrigidas, nunca.
2. 100 clientes concorrentes nunca passam do limite em nenhuma janela deslizante, verificado sobre o *log* completo
   de aceitos.
3. O limite multidimensional (CPF + conta + dispositivo) é aceito ou recusado como um todo: nenhuma dimensão é
   debitada sozinha.
4. Com o Redis derrubado pelo Toxiproxy, o limite regulatório falha fechado e o de capacidade degrada para limite
   local, cada um conforme o mapa de estado.
5. A reconciliação detecta um contador divergente do total do banco, injetado de propósito.

**Complemento.** Meça a latência da decisão do invariante 4 com as opções padrão do seu cliente e com as opções
ajustadas. No Lettuce, o que define esse tempo? Dica: o *timeout* padrão de comando do Lettuce é de 60 s.

**Checagem**

1. Por que `INCR` seguido de `EXPIRE` pode deixar uma chave eterna, e quais são as três correções?
2. O que a janela por *log* garante que o contador ponderado não garante, e quanto custa essa garantia?
3. Por que o "agora" do script vem do `TIME` do servidor, e o que muda num *failover*?
4. Por que o limite regulatório falha fechado e o de capacidade degrada para limite local?

> **Reencontro — `system-design/06`; `seguranca-aplicacao/11` e `/14`; `spring-boot/08`;
> `pagamentos-e-liquidacao/02`.** Os algoritmos e a decisão de aberto ou fechado vêm de `system-design/06`; aqui
> eles ganham comandos, defeitos e números. O limite como controle de segurança é o de `seguranca-aplicacao/11`,
> e o limite noturno é o controle de produto contra o golpe de `seguranca-aplicacao/14`. O limite local quando o
> Redis cai é o *fallback* honesto de `spring-boot/08`. E o limite do Pix é parte do fluxo de
> `pagamentos-e-liquidacao/02`.

## Principais aprendizados

- `INCR` e `EXPIRE` separados deixam chave eterna quando o processo morre no meio. Script, `SET NX EX` antes do
  `INCR`, ou `INCREX` no Redis 8.8+.
- A janela por *log* é exata, com memória O(limite). O contador ponderado é constante em memória e passou do limite
  em até 34% na medição.
- O relógio da janela é o do servidor, com `TIME` dentro do script.
- O limite em várias dimensões valida todas antes de debitar qualquer uma. No *cluster*, as chaves precisam do mesmo
  *slot*.
- A política de falha é por tipo de limite e vem do mapa de estado. O regulatório falha fechado. Meça quanto o
  cliente leva para decidir que o Redis caiu: o padrão do go-redis levou 400 ms.
- O contador é derivado. A reconciliação com o banco encontra e corrige a divergência.
