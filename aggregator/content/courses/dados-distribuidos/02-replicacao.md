---
id: replicacao
title: "Replicação: o que o seu banco faz quando você não olha"
summary: "Síncrono, assíncrono e o meio-termo real; as anomalias que o lag produz; e a pergunta que vira RPO — quantos commits você aceita perder num failover?"
estimatedMinutes: 55
references:
  - title: "PostgreSQL — High Availability, Load Balancing, and Replication"
    url: https://www.postgresql.org/docs/current/high-availability.html
  - title: "Jepsen — Consistency Models"
    url: https://jepsen.io/consistency
  - title: "Amazon Aurora — Design considerations (SIGMOD 2017)"
    url: https://www.amazon.science/publications/amazon-aurora-design-considerations-for-high-throughput-cloud-native-relational-databases
---

## Leader-follower e os três modos

O desenho dominante é o mais simples: um nó aceita escrita (leader), os outros recebem o
fluxo de mudanças e servem leitura (followers). Toda a complexidade mora em **quando o
leader responde "commitado"**.

**Assíncrono.** O leader grava, responde ao cliente e depois manda para as réplicas. Latência
mínima; se o leader morrer com o fluxo atrasado, as escritas que ainda não chegaram
**desaparecem** — e não há erro em lugar nenhum, porque o cliente já recebeu sucesso.

**Síncrono.** O leader espera a réplica confirmar antes de responder. Nada se perde no
failover; em compensação o seu commit é refém do nó mais lento, e se a réplica cair, o leader
para de aceitar escrita. Uma réplica síncrona única transforma alta disponibilidade em duas
formas de indisponibilidade.

**Semi-síncrono** é o meio-termo que quase todo mundo acaba usando: uma réplica confirma
(qualquer uma), as demais seguem assíncronas. No Postgres isso é `synchronous_standby_names`
com `ANY 1 (...)` — e o detalhe que muda tudo é o `synchronous_commit`, que decide se
"confirmou" significa recebeu, gravou no WAL ou aplicou.

A pergunta de fintech que fecha o assunto é uma só, e ela tem que ser respondida com número:
**quantos commits você aceita perder num failover?** Zero exige síncrono e o custo de latência
que vem junto. Trinta segundos de escrita aceita assíncrono e um RPO honesto. O que não pode
existir é a resposta "nenhum", dita por alguém que configurou replicação assíncrona (o assunto
volta com nome próprio no marco 12).

## Lag de réplica e as anomalias que ele produz

Lag é a distância, em tempo ou em bytes de WAL, entre o que o leader já gravou e o que a
réplica já aplicou. Em regime normal são milissegundos. Sob carga de escrita, durante um
`VACUUM` pesado ou uma migração, sobe para segundos — e é aí que as três anomalias aparecem.

**Read-your-writes quebrado.** O cliente paga, é redirecionado para o extrato, a leitura vai
para uma réplica atrasada, e o pagamento não está lá. Ele paga de novo. Este é o mais caro dos
três, porque produz duplicidade de verdade.

**Leitura não-monotônica.** Duas leituras seguidas caem em réplicas diferentes, com lags
diferentes, e o saldo **volta no tempo**: R$ 1.240, depois R$ 1.180, depois R$ 1.240 de novo.
Nenhum log registra erro; o cliente registra no Twitter.

**Leitura fora de ordem causal.** A resposta chega antes da pergunta — o crédito do estorno
aparece antes do débito, porque cada um foi lido de uma réplica.

As mitigações, do mais grosso ao mais fino:

1. **Ler do leader depois de escrever**, por uma janela de tempo ou para o dado que o próprio
   usuário acabou de tocar. Simples, funciona, e concentra carga.
2. **Sticky routing por sessão** — a sessão fica presa a uma réplica. Resolve a
   não-monotonicidade e não resolve read-your-writes.
3. **Token de versão (LSN).** A escrita devolve a posição do WAL; a leitura carrega o token e
   a réplica espera alcançá-lo, ou o roteador escolhe uma réplica que já passou dele. É a
   solução correta e a que exige mais do código de aplicação.

> **Reencontro — `arquitetura-eventos/04`.** Lá, a janela de inconsistência era uma decisão de
> modelagem, com dono e número. Aqui é a mesma janela, vista pelo outro lado: o lag de réplica
> é o mecanismo que **produz** o número que você declarou.

## Failover por dentro

Quando o leader morre, alguém promove um follower. Três coisas acontecem, e nenhuma é grátis.

**As escritas em voo somem.** Tudo que estava no WAL do leader e não chegou à réplica promovida
foi perdido — inclusive commits já confirmados ao cliente, se a replicação era assíncrona.

**O leader antigo volta desalinhado.** Ele tem no WAL escritas que o novo leader não tem. Não
dá para reintroduzi-lo como réplica sem rebobinar: é o que o `pg_rewind` faz, e o que ele
descarta são exatamente aquelas transações.

**Dois nós podem se achar leader.** É o split-brain do marco 01 aplicado a um banco: o antigo
não sabe que foi deposto e continua aceitando escrita de quem ainda aponta para ele. A defesa
prática é a mesma família do fencing — STONITH, quórum de testemunhas, ou um proxy (Patroni,
pgpool) que só rota para quem detém o lease.

E o failover **automático** tem um custo escondido: ele dispara em falso. Uma pausa de rede de
20 segundos promove uma réplica, e você trocou uma degradação temporária por perda de dados
permanente. Em fintech, a escolha entre failover automático e manual é uma decisão de negócio
com RPO no meio, não uma preferência de SRE.

## Multi-leader e leaderless

**Multi-leader** — dois ou mais nós aceitam escrita e replicam entre si. Resolve latência
geográfica e escrita durante partição; cria conflitos de escrita, que precisam de resolução.

A resolução default do mercado é **LWW** (last write wins), e ela é **perda de dado
silenciosa**: a escrita perdedora é descartada sem erro, sem log, sem ninguém saber — e o
"last" é decidido por timestamp, que o marco 01 já mostrou não ser confiável. Para saldo, é
inaceitável. **CRDTs** resolvem de verdade para os tipos que eles cobrem (contadores,
conjuntos), mas a estrutura que a contabilidade precisa — "este débito só vale se o saldo
comportava" — não é expressável como CRDT. Multi-leader com saldo é uma decisão que quase
sempre está errada.

**Leaderless / quórum.** Todo nó aceita leitura e escrita; a garantia vem da aritmética
`R + W > N`: se as leituras e as escritas se sobrepõem em pelo menos um nó, a leitura vê a
escrita mais recente. Com `N=3, W=2, R=2`, você tolera um nó fora e mantém a garantia.
**Read repair** e **anti-entropy** consertam as réplicas atrasadas ao longo do tempo.

A pegadinha é o **sloppy quorum**: quando os nós certos estão fora, a escrita é aceita por
outros nós quaisquer (hinted handoff) para manter a disponibilidade. É útil, e destrói a
premissa da fórmula — o `W` foi atendido por nós que não são os donos daquela chave, então
`R + W > N` deixa de garantir sobreposição.

> **Reencontro — `kafka/02`.** ISR e `min.insync.replicas` são a mesma ideia com outro nome:
> um quórum de réplicas em dia que precisa confirmar antes de o produtor considerar
> escrito. Broker e banco resolvem o mesmo problema com o mesmo vocabulário.

## Exemplo numa fintech

O painel de saldo do app lê de réplica. No pico das 18h, com carga de escrita alta e o
autovacuum ativo, o lag chega a 8 segundos.

**Onde isso é aceitável:** a lista de lançamentos do mês passado, o gráfico de gastos por
categoria, a tela de "meus cartões". Ninguém percebe 8 segundos num dado de ontem.

**Onde não é:** o saldo exibido logo após uma transferência, e — especialmente — o saldo usado
para **decidir** se uma nova transferência cabe. Autorizar contra saldo lido de réplica
atrasada é como você constrói um saldo negativo que não deveria existir. Autorização lê do
leader ou de uma estrutura com garantia própria; ponto final.

E o caso regulatório: o extrato oficial, o comprovante e qualquer número que vira documento
não podem sair de réplica sem garantia de recência. "O sistema mostrou outro valor" numa
reclamação no Banco Central não tem defesa técnica boa.

## Hands-on

**Tutorial — medir o seu próprio lag.**

1. Suba dois Postgres em Docker e configure replicação em streaming (um `pg_basebackup` do
   primário e um `standby.signal` no secundário resolvem).
2. Confirme a réplica ativa: no primário, `SELECT client_addr, state, sync_state FROM
   pg_stat_replication;`.
3. Crie a tabela de lançamentos e gere carga com `pgbench -c 20 -T 120` num script de
   `INSERT`.
4. Durante a carga, meça o lag na réplica a cada segundo:
   `SELECT now() - pg_last_xact_replay_timestamp();`. Anote o pico.
5. Reproduza a leitura não-monotônica: num loop, leia o saldo alternando entre primário e
   réplica e imprima o valor. Você vai ver o número voltar.
6. Mude `synchronous_commit` para `remote_apply` com a réplica como síncrona, repita a carga e
   compare a latência de commit. `git commit` com os dois números.

**Desafio — o modo de replicação do `fin-store`.** Produza `REPLICACAO.md` com: o modo
escolhido, o **RPO em número** que ele implica, quais leituras podem ir para réplica e quais
não podem (com o critério, não com a lista), e a mitigação escolhida para read-your-writes.
Escreva também o que acontece se a réplica síncrona cair — se a resposta for "o sistema para",
diga por quanto tempo isso é aceitável e quem decide.

**Invariantes testáveis**

1. Nenhuma decisão de autorização lê saldo de réplica sem garantia de recência.
2. O RPO declarado é verificável: matar o leader sob carga perde no máximo aquilo.
3. Depois de uma escrita, a leitura seguinte do mesmo usuário vê a própria escrita — em
   qualquer réplica que o roteador escolha.
4. Existe alerta de lag com limiar, e o limiar é o número declarado no `REPLICACAO.md`.

**Complemento.** Mate o primário no meio da carga (`docker kill`) e conte quantas transações
confirmadas ao cliente não existem na réplica promovida. Esse número é o seu RPO real. Compare
com o que você tinha escrito antes de medir.

**Checagem**

1. Quais são os três modos de replicação e o que exatamente cada um custa?
2. Quais são as três anomalias de lag, e qual delas produz pagamento duplicado?
3. Por que LWW é perda de dado silenciosa, e por que isso é pior em saldo do que em perfil?
4. O que o sloppy quorum tira da garantia `R + W > N`?

## Principais aprendizados

- A pergunta que define o modo de replicação é "quantos commits você aceita perder?" — e a
  resposta é o RPO, em número.
- Lag produz três anomalias distintas; read-your-writes quebrado é a que gera pagamento
  duplicado, e a correção correta é token de versão.
- Failover perde as escritas em voo, deixa o leader antigo desalinhado e pode gerar
  split-brain — automático dispara em falso, e essa é uma decisão de negócio.
- LWW descarta escrita sem erro e sem log; para saldo, multi-leader quase sempre é a escolha
  errada.
- `R + W > N` só garante sobreposição enquanto o quórum não é sloppy — a mesma ideia de ISR
  e `min.insync.replicas` do `kafka/02`.
