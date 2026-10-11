---
id: consistencia-como-criterio
title: "Consistência como critério de escolha"
summary: "Do modelo de consistência que a operação exige ao botão de cada produto e ao que ele custa em milissegundos — a matriz operação × garantia. Marco crítico — quiz estendido."
estimatedMinutes: 55
references:
  - title: "Daniel Abadi — Consistency Tradeoffs in Modern Distributed Database Design (PACELC)"
    url: https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf
  - title: "Martin Kleppmann — Please stop calling databases CP or AP"
    url: https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html
  - title: "Azure Cosmos DB — Consistency levels"
    url: https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels
  - title: "MongoDB — Write Concern"
    url: https://www.mongodb.com/docs/manual/reference/write-concern/
  - title: "MongoDB — Read Concern"
    url: https://www.mongodb.com/docs/manual/reference/read-concern/
completion: quiz
---

## O erro de partida: "qual banco é CP ou AP?"

CAP fala de **linearizabilidade** e de **partição de rede**. Só isso. Não fala de latência no dia
normal, não fala de que operação, não fala de configuração — e a maioria dos produtos modernos
nem cabe direito na definição, porque expõe o comportamento por chamada, não por sistema.

> **Reencontro — `arquitetura-eventos/04`.** CAP só vale durante a partição; o que você paga todo
> dia é o "else" do PACELC, latência contra consistência; e a pergunta certa é qual modelo **cada
> operação** exige, não qual modelo "o sistema" tem.

A granularidade certa nunca foi o sistema. É a **operação**. "Somos CP" é uma frase que não
sobrevive ao primeiro `SELECT` que você aponta para uma réplica.

## Três perguntas, três botões — o modelo portátil

Todo store maduro expõe as mesmas três decisões, batizadas com nomes diferentes:

**(a) Quando a escrita conta como confirmada.** Local, réplica recebeu, réplica gravou, quórum,
réplica aplicou — a régua vai do mais barato ao mais durável, e cada degrau é o mesmo que o marco
05 já mostrou para o Postgres.

**(b) De onde a leitura vem.** Do líder, de qualquer réplica, ou de um quórum de réplicas — a
mesma régua do marco 02, agora vista do lado da leitura.

**(c) Quão fresca ela pode estar.** Sem limite algum, com limite por tempo ou por versão, presa a
uma sessão, ou linearizável — nunca mais velha que a última escrita que você mesmo fez.

Cada combinação das três mapeia para uma das quatro categorias do `arquitetura-eventos/04`:
linearizável (a mais forte em (a), (b) e (c)), sequencial, causal (a sessão que preserva a própria
ordem) e eventual (sem compromisso em nenhuma das três). O produto muda o nome do botão; a
pergunta por trás é sempre uma destas três.

## A tabela: botão por produto

| Produto | Escrita confirma quando | Leitura: de onde / quão fresca | Custo típico (o *else* do PACELC) |
| --- | --- | --- | --- |
| **[PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT)** (retomada de `02`/`05`, docs "current", verificado 21/09/2026) | `synchronous_commit` (`off` / `local` / `remote_write` / `on` ou `remote_apply`) + `synchronous_standby_names` (`ANY n (...)`) | líder, ou standby com `remote_apply` | RTT até o quórum de standbys + replay, a cada commit |
| **[MongoDB](https://www.mongodb.com/docs/manual/reference/write-concern/)** (Manual, verificado 21/09/2026 — default `w: majority` desde a 5.0) | `writeConcern` (`w`: 1, `majority`, N; `j` para durabilidade em disco); em topologia com árbitro e maioria de nós votantes sem dado, o default cai para `w: 1` | [`readConcern`](https://www.mongodb.com/docs/manual/reference/read-concern/) (`local`, `majority`, `linearizable`, `snapshot`) + `readPreference` + sessão causal | ack de maioria dos nós **com dado**; `linearizable` só é servido pelo primário |
| **[Cosmos DB (NoSQL)](https://learn.microsoft.com/en-us/azure/cosmos-db/consistency-levels)** (Microsoft Learn, atualizado 2026-04-27) | nível **da conta** (Strong, Bounded staleness, Session, Consistent prefix, Eventual); a requisição só pode **enfraquecê-lo**, nunca fortalecê-lo; a garantia vale para uma leitura **dentro de uma partição lógica** | por nível; Session exige propagar o **session token** entre instâncias, sob pena de degradar para Eventual sem aviso | Strong: 2× RTT entre as duas regiões mais distantes + 10 ms p99, e RU de leitura em dobro (quórum de 2 réplicas em vez de 1); acima de 8.000 km, bloqueado por padrão |
| **[Kafka](https://kafka.apache.org/documentation/#replication)** (contraste, `kafka/02`) | `acks` + `min.insync.replicas` + idempotência do producer | consumidor só lê o que está no high watermark (confirmado pelo ISR) | latência de produção até o ISR confirmar |
| **[Redis](https://redis.io/docs/latest/commands/wait/)** (contraste, docs "latest", verificado 21/09/2026) | replicação assíncrona por padrão; `WAIT n timeout` espera `n` réplicas confirmarem, virando semi-síncrono sob demanda | réplica pode estar atrás; `WAIT` não é lock nem quórum de leitura | `WAIT` reduz a janela de perda no failover, mas **não** torna o sistema CP — escrita confirmada ainda pode sumir num failover, dependendo da persistência |
| **Cassandra / DynamoDB** (hands-on completo em `dados-distribuidos/18`) | *consistency level* por operação (`QUORUM`, `LOCAL_QUORUM`...) / `ConsistentRead: true` no DynamoDB | idem, por operação | latência do quórum de réplicas envolvidas |
| **NewSQL** (`dados-distribuidos/08`) | consenso (Raft) por range, a cada commit que atravessa ranges | serializável, sem botão para enfraquecer | "pague o consenso, conscientemente" — round-trips extras por commit |

## Granularidade: configuração por operação, não por sistema

Postgres aceita `SET LOCAL synchronous_commit` **por transação**. MongoDB aceita write e read
concern **por operação**. Cosmos aceita um nível mais fraco que o da conta **por requisição**,
nunca mais forte. Nenhum dos três obriga você a escolher um único nível para o banco inteiro.

A consequência de projeto é direta: o **perfil de consistência** vira um tipo explícito no código
— `STRONG`, `SESSION`, `EVENTUAL_5S` — escolhido na chamada, não numa variável de ambiente do
banco. Cada perfil tem uma ADR curta: o que ele garante, o que custa, e para qual operação ele
existe.

## A matriz operação × garantia — o entregável

Para cada operação do seu sistema, quatro colunas:

1. **Modelo exigido** — uma das quatro categorias do `arquitetura-eventos/04`.
2. **Botão do produto** — o valor exato desta tabela que implementa esse modelo.
3. **Custo medido** — em milissegundos, ou `não medido` se o store não permite medir localmente.
4. **O que quebra** se o botão estiver errado.

A regra que evita o erro mais comum: **a invariante "saldo não fica negativo" não é problema de
réplica.** Ela vive dentro da transação e do agregado (`dados-distribuidos/04`,
`arquitetura-eventos/04`). A matriz trata da **leitura entre réplicas** e da **confirmação de
escrita** — nunca da invariante que já está resolvida por lock ou isolamento.

## Modos de falha por botão

- `w: 1` no MongoDB pode ser revertido se o primário cair antes de replicar — a escrita "confirmada"
  desaparece sem erro.
- Commit assíncrono no Postgres (`synchronous_commit = off` ou `local` sem standby síncrono) perde
  o que não chegou à réplica — é o RPO do marco 02, agora nomeado por botão.
- Strong no Cosmos reduz disponibilidade sob falha regional, e é bloqueado por padrão acima de
  8.000 km entre regiões.
- Session **sem propagar o token** entre instâncias stateless (um balanceador que não carrega o
  cabeçalho) degrada para Eventual **sem erro nenhum** — o pior tipo de falha, porque nada avisa.

Cada linha da matriz aponta o RPO correspondente (`dados-distribuidos/02` e `/12`).

## Latência é o "else": meça, não opine

O custo de cada botão é o "else" do PACELC, e ele se mede como qualquer outra latência: por
percentil, atento a *coordinated omission* (`observabilidade/04`). A janela de inconsistência de
cada perfil mais fraco é um requisito com número e dono, não uma desculpa — exatamente como
`arquitetura-eventos/04` já exigiu.

## Exemplo numa fintech

Seis operações do `STORES.md` (marco 06), com o perfil que cada uma exige:

| Operação | Modelo exigido | Perfil |
| --- | --- | --- |
| Saldo para decisão de débito | linearizável | leitura do líder / `remote_apply` |
| Extrato por conta e período | causal a eventual | réplica, sessão causal opcional |
| Limite disponível na autorização | linearizável no chave-valor | leitura consistente na chave |
| Payload bruto do PSP | eventual (leitura por id, sem concorrência de escrita) | `majority` write, `local` read |
| TPV do dia | eventual | qualquer réplica, janela de minutos |
| "Meu pagamento saiu?" logo após pagar | causal (read-your-writes) | sessão causal / leitura do primário por alguns segundos |

O incidente clássico que a matriz existe para prevenir: o dashboard de saldo lendo de
`secondaryPreferred` sem sessão causal, mostrando o saldo de antes do PIX que o cliente acabou de
fazer — a mesma leitura não-monotônica do marco 02, agora com nome de botão errado na
configuração.

## Hands-on

**Tutorial — perfis de consistência no mesmo sistema.** Reutilize o compose de dois nós (primário
+ standby) do marco 02.

1. Defina três perfis — `STRONG`, `SESSION`, `EVENTUAL` — e implemente o caminho de escrita com
   `SET LOCAL synchronous_commit` por perfil, num harness mínimo (Go ou Java) que aceita o perfil
   como parâmetro da chamada.
2. Injete atraso de aplicação no standby:

   ```sql
   ALTER SYSTEM SET recovery_min_apply_delay = '200ms';
   ```

   (recarregue a configuração do standby e confirme com `SHOW recovery_min_apply_delay;`)
3. Rode carga mista (`pgbench` ou o harness) e registre p50/p99 de commit **por perfil**.
4. Para cada perfil, leia do standby imediatamente após cada commit e conte quantas leituras não
   veem a própria escrita.

**Esperado (meça e registre; se divergir, vale o número medido):** só o perfil que usa
`remote_apply` paga o atraso injetado, e só ele tem zero leitura obsoleta. `EVENTUAL` não paga
nada e reproduz a anomalia. `git commit` com o esqueleto de `MATRIZ.md` e as linhas de Postgres
preenchidas com número.

**Desafio — `MATRIZ.md` do `fin-store`.** Preencha a matriz para as seis operações da tabela
acima, nos três stores do catálogo: Postgres com número medido; MongoDB e Cosmos referenciados
pela doc consultada nesta tabela e marcados `não medido` até o marco 16 preencher a linha de
Mongo com número real.

**Invariantes testáveis**

1. Perfil `SESSION` (com `remote_apply`): **0** leituras obsoletas em 1.000 iterações, com os
   200 ms de atraso injetados.
2. Perfil `EVENTUAL`: a anomalia é **reproduzida** — pelo menos 1 leitura obsoleta em 1.000 —
   provando que é escolha de projeto, não acidente.
3. p99 de commit do perfil `SESSION` é maior ou igual ao atraso injetado; o do `EVENTUAL` não é
   afetado, dentro de uma margem declarada.
4. Toda linha da matriz nomeia o modelo do `arquitetura-eventos/04`, o botão exato, o custo
   (número ou `não medido`) e o efeito de errar; nenhuma linha diz "forte" sem custo escrito ao
   lado.
5. Nenhuma operação do `STORES.md` fica sem perfil atribuído.

**Complemento.** Configure `synchronous_standby_names = 'ANY 1 (s1, s2)'` com dois standbys.
Derrube um e meça se o commit continua sem pausa; derrube os dois e meça o tempo até o sistema
parar de aceitar escrita — e escreva quem, na organização, decide se esse tempo de parada é
aceitável.

**Checagem**

1. Por que "somos CP" é a granularidade errada para descrever um sistema?
2. O que o perfil `SESSION` compra, e a quem ele cobra o preço?
3. Por que o Session do Cosmos falha em silêncio atrás de um balanceador que não propaga o token?
4. Qual invariante **não** pertence à matriz deste marco, e em qual marco ela é resolvida?

## Principais aprendizados

- CAP e "CP/AP" descrevem sistemas; a decisão real é por **operação**, com três botões portáteis:
  quando a escrita confirma, de onde a leitura vem, e quão fresca ela pode estar.
- Postgres, MongoDB e Cosmos permitem configurar esses botões por transação, por operação ou por
  requisição — a consistência nunca precisa ser uma escolha única para o banco inteiro.
- A matriz operação × garantia é o entregável: modelo exigido, botão, custo medido (ou `não
  medido`, nunca um número emprestado) e o que quebra se errar.
- Cada botão tem um modo de falha silencioso — `w: 1` revertido, commit assíncrono, Session sem
  token propagado — e cada um aponta para um RPO já visto no marco 02.
- Latência é o "else" do PACELC: mede-se por percentil, com o mesmo cuidado com coordinated
  omission de `observabilidade/04`, nunca por opinião.
