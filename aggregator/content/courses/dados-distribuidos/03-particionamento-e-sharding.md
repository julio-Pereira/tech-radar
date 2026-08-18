---
id: particionamento-e-sharding
title: "Particionamento e sharding: a decisão mais cara de reverter"
summary: "A escada honesta antes de shardar, as estratégias e seus hotspots, e por que a chave de shard é a escolha de todas as queries futuras. Marco crítico — quiz estendido."
estimatedMinutes: 60
references:
  - title: "PostgreSQL — Table Partitioning"
    url: https://www.postgresql.org/docs/current/ddl-partitioning.html
  - title: "Citus — Distributed PostgreSQL documentation"
    url: https://docs.citusdata.com/
  - title: "AWS Builders' Library — Workload isolation using shuffle-sharding"
    url: https://aws.amazon.com/builders-library/workload-isolation-using-shuffle-sharding/
---

## A escada honesta

Sharding é a decisão mais cara e mais difícil de reverter desta trilha. Antes dela existe uma
escada, e a maioria dos times pula degraus por motivos que não são técnicos.

1. **O índice certo.** Uma quantidade desconfortável de "precisamos shardar" é uma query
   fazendo seq scan numa tabela de 40 milhões de linhas. Meça antes (`EXPLAIN`, marco 07).
2. **A query melhor.** `SELECT *` numa tabela larga, N+1 vindo do ORM, paginação por `OFFSET`
   em página 900. Nenhum shard conserta isso — ele multiplica.
3. **Réplica de leitura.** Se o gargalo é leitura, você já tem a resposta do marco 02, com o
   lag como preço.
4. **Particionamento declarativo.** Uma tabela, várias partições físicas, **um** banco. Ganha
   pruning, arquivamento barato por `DETACH` e vacuum por partição — sem nada de distribuído.
5. **Hardware maior.** Impopular e frequentemente correto: uma máquina com 128 GB de RAM e NVMe
   custa menos por mês que um trimestre do time reescrevendo o acesso a dados.
6. **Só então, sharding.**

O degrau 4 merece o destaque, porque a confusão de vocabulário é comum: **particionar** é
dividir uma tabela dentro do mesmo banco; **shardar** é dividir os dados entre bancos que não
se conhecem. O primeiro é uma cláusula no `CREATE TABLE`. O segundo é um projeto que muda
roteamento, transação, unicidade, backup e relatório.

O teste honesto para saber se você está no degrau certo: se a resposta para "por que shardar?"
for "escala", ela ainda não é uma resposta. Se for "a tabela de lançamentos recebe 4 mil
`INSERT`/s no pico e um único nó satura o WAL em 6 mil", é.

## Estratégias e o que cada uma cobra

**Por range.** Fatia por intervalo de chave — datas, faixas de id. Varredura por range fica
ótima ("todos os lançamentos de março" toca uma partição). O preço é o **hotspot temporal**:
se a chave é a data, 100% da escrita vai para o shard do mês corrente, e os outros ficam
ociosos guardando história.

**Por hash.** Aplica uma função sobre a chave e distribui. Escrita fica uniforme; a varredura
por range morre — "todos os lançamentos de março" agora toca todos os shards.

**Por diretório/lookup.** Uma tabela diz onde cada chave mora. Máxima flexibilidade (dá para
mover um cliente grande sozinho), e o diretório vira SPOF e ponto de contenção.

**Consistent hashing** resolve o problema de crescer: com hash simples, mudar de 4 para 5 nós
remapeia quase tudo; com um anel e **virtual nodes**, só a fatia vizinha se move. É o mesmo
mecanismo do balanceamento client-side de `arquitetura-eventos/10` — anel, réplicas virtuais,
movimento mínimo.

## A chave de shard é a escolha de todas as queries futuras

Esta é a frase para levar do marco. Escolher a chave de shard não é escolher como os dados são
distribuídos: é escolher **quais queries continuam baratas e quais ficam caras para sempre**.

Três critérios, nesta ordem:

- **A query que precisa ser rápida.** Se a query do caminho quente é "extrato da conta X", a
  chave tem que ser `accountId` — assim ela toca um shard.
- **Cardinalidade.** Poucos valores distintos significa poucos shards possíveis. Shardar por
  `tipoTransacao` (uns 12 valores) não distribui nada.
- **Distribuição.** Cardinalidade alta não garante uniformidade. É aqui que mora o
  **celebrity problem**: o marketplace que é seu maior cliente responde por 30% dos lançamentos,
  e o shard dele está quente enquanto os outros dormem. As saídas são chave composta
  (`accountId + bucket`), shard dedicado, ou tratar a conta grande como caso especial declarado.

> **Reencontro — `kafka/06`.** A partição quente do broker e o shard quente do banco são o
> mesmo problema: a chave de distribuição não é uniforme no mundo real. O que muda é o custo do
> conserto — no broker você reparticiona um tópico, no banco você move dados.

## Os dois problemas difíceis

**Índice secundário.** Você shardou por `accountId`, e chega o requisito de buscar por
`documentoDoCliente`. Duas opções, ambas com preço: o **índice local** (cada shard indexa o que
tem) obriga a query a ir em todos os shards e juntar — é o *scatter-gather*, cuja latência é a
do shard mais lento, não a média. O **índice global** (uma estrutura separada apontando chave →
shard) responde rápido e cria um problema de consistência entre o índice e o dado, que a
essa altura você já sabe classificar: dentro da mesma transação, impossível; logo, é assíncrono,
com janela.

**Query e transação cross-shard.** Transação atômica entre dois shards é transação distribuída
— assunto do marco 08, e a resposta curta é "quase sempre saga". Query cross-shard é fan-out
com agregação no meio; e `JOIN` entre shards é onde o desempenho morre, porque envolve mover
dados pela rede para responder uma pergunta.

**Rebalanceamento.** A técnica que funciona é fixar um número de **partições lógicas** muito
maior que o de nós — 1.024 partições em 4 nós, cada nó com 256. Crescer significa mover
partições inteiras, não recalcular a função. Durante o movimento, o roteador precisa saber que
uma partição está em trânsito e escrever nos dois lugares, ou bloquear brevemente aquela fatia.

## Exemplo numa fintech

O `fin-store` guarda 100 milhões de lançamentos por mês. Duas propostas chegam na mesma
reunião.

**Shard por data.** Parece perfeito: o dado é temporal, o arquivamento fica trivial, o relatório
mensal toca um shard. E concentra **toda** a escrita no shard do mês corrente — os outros onze
viram storage frio caríssimo com CPU parada. É a proposta que mais se faz e a que menos funciona.

**Shard por `accountId`.** A escrita distribui, o extrato — a query quente — toca um shard, e o
cliente grande vira caso especial conhecido em vez de surpresa.

O que fica caro na segunda opção precisa ser dito em voz alta: **o relatório regulatório
atravessa todos os shards por definição**. Ele é mensal, por instituição, e ignora `accountId`.
Isso não é motivo para mudar a chave — é motivo para planejar o caminho analítico desde o dia 1
(marco 14, via CDC), em vez de descobrir na primeira auditoria que o relatório leva nove horas.

E a decisão final do `fin-store`, escrita antes de qualquer `CREATE TABLE`: **particionamento
declarativo por mês, num banco só** (degrau 4), com `accountId` já definido como a futura chave
de shard e presente em todas as chaves primárias. Isso adia o sharding sem tornar a migração
impossível — que é exatamente o objetivo.

## Hands-on

**Desafio — a chave de shard do `fin-store`.** Dados os volumes: 100M de lançamentos/mês,
retenção de 5 anos, 12M de contas ativas, e a distribuição de queries abaixo:

| Query | Volume | Latência alvo |
| --- | --- | --- |
| Extrato por conta e período | 40k/min | p99 < 100ms |
| Saldo de uma conta | 200k/min | p99 < 20ms |
| Busca por documento do cliente | 300/min | p99 < 500ms |
| Relatório mensal por instituição | 1/mês | horas, tudo bem |
| Conciliação D+1 (varredura do dia) | 1/dia | < 30 min |

Produza `SHARDING.md` com: a chave escolhida e a justificativa pelos três critérios; **qual
query fica cara** e a mitigação de cada uma; a estratégia de índice secundário para a busca por
documento; e — obrigatoriamente — o parágrafo que responde *"por que ainda não shardar"* ou
*"por que shardar agora"*, com número.

**Invariantes testáveis**

1. A chave de shard aparece em todas as chaves primárias e em toda query do caminho quente.
2. Nenhuma query com alvo abaixo de 100ms depende de scatter-gather.
3. Existe pelo menos uma conta identificada como celebrity, com tratamento declarado.
4. A escada foi percorrida: cada degrau pulado tem uma linha dizendo por que não resolveria.

**Complemento.** Simule a distribuição: gere 10 milhões de `accountId` sintéticos com uma
distribuição realista (lei de potência, não uniforme), aplique `hash % 8` e conte as linhas por
bucket. A razão entre o maior e o menor bucket é o seu desbalanceamento — e ele é bem maior do
que a intuição sugere.

**Checagem**

1. Quais são os degraus antes de shardar, e qual é o teste honesto para saber se você já pode
   subir?
2. Qual a diferença entre particionar e shardar, e por que ela importa para o custo?
3. Por que a chave de shard é a escolha de todas as queries futuras — e quais são os três
   critérios?
4. Índice local × índice global: o que cada um cobra, e como você classificaria a inconsistência
   do global?

## Principais aprendizados

- A escada antes do sharding — índice, query, réplica, particionamento declarativo, hardware —
  resolve mais casos do que a comunidade admite; "escala" não é uma resposta.
- Particionar é dividir uma tabela num banco; shardar é dividir entre bancos que não se
  conhecem, e muda roteamento, transação, unicidade, backup e relatório.
- Range distribui mal no tempo, hash mata a varredura, diretório vira SPOF; consistent hashing
  com virtual nodes é o que torna o crescimento barato.
- A chave de shard escolhe quais queries ficam caras para sempre — cardinalidade, distribuição
  e a query quente, nesta ordem, com o celebrity problem declarado.
- Índice global e transação cross-shard são os dois problemas difíceis; a resposta quase sempre
  é assíncrona, com janela declarada, ou saga.
