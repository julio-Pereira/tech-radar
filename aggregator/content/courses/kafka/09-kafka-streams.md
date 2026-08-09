---
id: kafka-streams
title: "Kafka Streams"
summary: "A dualidade stream/table, o custo escondido do estado local, e o critério honesto para preferir Streams a um consumidor bem escrito."
estimatedMinutes: 55
references:
  - title: "Apache Kafka — Streams Documentation"
    url: https://kafka.apache.org/documentation/streams/
  - title: "Kafka Streams — Core Concepts"
    url: https://kafka.apache.org/documentation/streams/core-concepts
  - title: "Spring for Apache Kafka — Kafka Streams Support"
    url: https://docs.spring.io/spring-kafka/reference/streams.html
---

## Uma biblioteca, não um cluster

Kafka Streams é uma **biblioteca Java** que roda dentro da sua aplicação. Não há
cluster de processamento para operar, não há job para submeter: você sobe o mesmo JAR
com mais réplicas e o paralelismo aumenta.

Isso é a maior diferença em relação ao Flink, e é a razão principal de escolhê-lo: a
unidade de deploy é a que você já sabe operar (um Deployment no Kubernetes, com HPA e
probes dos marcos 05–07 daquela trilha).

O preço, que aparece mais adiante neste marco: o **estado** também mora na sua
aplicação.

## KStream e KTable: a dualidade

A ideia central, e ela reorganiza como se pensa o problema:

- **KStream** — um fluxo de **fatos**. Cada registro é um evento independente que
  aconteceu. `("conta-42", -100)` seguido de `("conta-42", -50)` são dois débitos.
- **KTable** — um fluxo de **estados**. Cada registro é o valor *atual* daquela chave, e
  substitui o anterior. `("conta-42", 900)` seguido de `("conta-42", 850)` é o mesmo
  saldo, atualizado.

O mesmo tópico pode ser lido das duas formas, e a escolha muda tudo. A regra mnemônica:
**KStream é o extrato, KTable é o saldo.**

A dualidade é que uma vira a outra: agregar um KStream produz uma KTable (somar
lançamentos dá saldo); observar as mudanças de uma KTable produz um KStream (o
*changelog*). Um tópico compactado (marco 02) é a materialização natural de uma KTable —
por isso as duas ideias apareceram juntas lá atrás.

## State stores e o custo do restart

Agregação e join precisam de memória do passado. O Streams mantém isso num **state
store** local — por padrão RocksDB, em disco, no próprio pod — e replica cada alteração
num **changelog topic** compactado no Kafka.

O par é o que dá tolerância a falha: o estado local é rápido porque é local; o changelog
é a cópia durável.

E é aqui que mora o custo que ninguém prevê: **restaurar o estado depois de um restart**.
Quando uma instância nova assume uma partição, ela precisa reler o changelog inteiro
daquela partição para reconstruir o store antes de processar o primeiro registro. Com
alguns GB de estado, isso são minutos de indisponibilidade daquela partição — a cada
deploy.

As mitigações, e todas têm trade-off:

- **`num.standby.replicas`** — réplicas quentes que acompanham o changelog em tempo real
  e assumem quase instantaneamente. Custa disco e tráfego proporcionais.
- **Volume persistente** (StatefulSet, marco 08 da trilha Kubernetes) — o estado
  sobrevive ao restart do pod e a restauração é incremental. É a razão de Streams com
  estado grande querer StatefulSet em vez de Deployment.
- **Manter o estado pequeno** — janelas com retenção curta, `Materialized` só onde é
  preciso.

## Topologia, tarefas e paralelismo

Você descreve uma **topologia** (o grafo de processadores) e o Streams a divide em
**tarefas**, uma por partição das fontes. O paralelismo máximo é, de novo, o número de
partições — a mesma regra do consumer group (marco 04), e o mesmo teto que o KEDA
precisa respeitar.

Uma operação que exige atenção é a **repartition**. Se você reagrupa por uma chave
diferente da original (`groupBy` em vez de `groupByKey`, ou um `selectKey`), o Streams
precisa reescrever os dados num tópico intermediário para que a nova chave determine a
partição. Isso é automático, invisível no código, e **dobra o tráfego** daquele ponto em
diante. Ver `-repartition` nos tópicos internos é normal; não saber que eles existem é
como se descobre tarde que o cluster está com o dobro do volume esperado.

O Streams também usa o protocolo novo de rebalance (marco 04), com o benefício extra de
ser *sticky* em relação ao estado: o coordenador tenta devolver a mesma partição à
instância que já tem o store quente, justamente para evitar a restauração.

## EOS aqui vale a pena

O marco 05 argumentou que exactly-once raramente compensa quando há side-effect externo.
Kafka Streams é a exceção que confirma a regra: o fluxo é **inteiramente interno ao
Kafka** — lê de tópico, atualiza state store (cujo changelog é um tópico), escreve em
tópico.

Com `processing.guarantee=exactly_once_v2`, a leitura, a atualização do estado e a
escrita entram na mesma transação. Uma linha de configuração e a garantia é real e
completa.

É por isso que a projeção de saldo é um caso tão bom para Streams: sem EOS, um crash no
meio pode contar um lançamento duas vezes no agregado — e um saldo é exatamente o tipo de
número que não pode ser "quase certo".

## Quando Streams é a resposta certa

Seja honesto sobre o custo: é uma biblioteca com estado, tópicos internos, restauração e
um modelo mental novo para o time.

**Vale quando** você precisa de agregação com estado (saldo, contagem por janela), de
join entre fluxos, ou de janelas temporais. Reimplementar isso num consumidor comum
significa escrever à mão o state store, o changelog, a recuperação e a semântica de
janela — e você vai escrevê-los pior.

**Não vale quando** o processamento é sem estado (transformar, filtrar, enriquecer com
uma consulta) ou quando é só consumir e gravar no banco. Um consumidor comum bem escrito
é mais simples de entender, debugar e operar. Um `KStream.mapValues().to()` que poderia
ser 20 linhas de consumidor está trazendo restauração de estado e tópicos internos para
resolver nada.

E o caso intermediário, o mais comum: enriquecer o evento com dado de referência. Um
**KTable-KStream join** contra uma tabela de referência pequena (tarifas, limites) é
elegante e funciona bem — desde que a tabela caiba localmente em todas as instâncias
(`GlobalKTable`, replicada inteira em cada uma).

## Exemplo numa fintech

Três usos no `pix-stream`, em ordem de valor:

1. **Projeção de saldo por conta.** `KStream` de lançamentos → `groupByKey` →
   `aggregate` → `KTable` de saldos, materializada num tópico compactado. O painel e a
   consulta de saldo leem a projeção, não o ledger transacional. Com
   `exactly_once_v2`, o saldo não conta duas vezes.
2. **TPV por janela.** Agregação em janela de 1 minuto para o painel de negócio — a
   métrica que a trilha de observabilidade chama de "o quarto sinal" (marco 03 de lá).
3. **Antifraude leve por janela deslizante.** Contar tentativas negadas do mesmo cartão
   em 5 minutos e emitir um alerta ao passar do limiar. Não substitui o antifraude, e
   pega o padrão grosseiro em tempo real.

O ponto de atenção nos três: **event time vs processing time** (marco 06). Uma janela por
processing time conta errado quando o parceiro envia em lote atrasado. Use event time e
configure o `grace period` explicitamente, decidindo — com o negócio — quanto tempo se
espera pelo retardatário.

## Hands-on

**Tutorial — a KTable de saldo.**

1. Topologia: `KStream` de `payments.authorized` → `groupByKey` (chave `accountId`) →
   `aggregate` somando/subtraindo centavos → `KTable` materializada em
   `saldos-por-conta`.
2. Ligue `processing.guarantee=exactly_once_v2`.
3. Exponha o saldo por **interactive query** e compare com a soma direta dos eventos.
4. Liste os tópicos do cluster e **encontre os internos** (`-changelog`, e
   `-repartition` se você tiver usado `groupBy`). Explique por escrito para que serve
   cada um.
5. `git commit`.

**Desafio — janela de 5 minutos.** Detecte 3 ou mais tentativas negadas do mesmo cartão
numa janela de 5 minutos e emita em `fraud.suspects`.

**Invariantes testáveis:**

1. Uma sequência com exatamente 3 negativas dentro da janela emite **um** alerta; com 2,
   emite **nenhum**.
2. Três negativas espalhadas por 20 minutos (fora da janela) emitem **nenhum** alerta.
3. Um evento com **event time** dentro da janela mas que **chega** depois dela ainda é
   contado, desde que dentro do `grace period` — e é ignorado depois dele. Escreva o
   teste dos dois lados do grace: é ele que prova que você usou event time, e não
   processing time.

**Complemento — medir a restauração.** Popule o state store com pelo menos 100 mil
chaves. Mate a instância e cronometre quanto tempo até ela voltar a processar. Depois
configure `num.standby.replicas=1` e meça de novo. Anote os dois números e escreva 5
linhas sobre o que isso significa para a sua janela de deploy.

**Checagem.** (a) O mesmo tópico lido como KStream e como KTable — qual a diferença de
significado? (b) O que é um tópico `-repartition` e o que ele custa? (c) Por que EOS
compensa no Streams e raramente no consumidor com chamada ao PSP? (d) Sua janela de 5min
conta errado quando o parceiro envia em lote atrasado — qual configuração está errada?

## Principais aprendizados

- Streams é biblioteca, não cluster: o paralelismo é o número de partições e o deploy é
  o que você já opera.
- KStream é o extrato, KTable é o saldo; agregar um vira o outro, e o tópico compactado
  é a materialização natural.
- O estado local custa **restauração** a cada restart — standby replicas e volume
  persistente são as mitigações reais.
- EOS aqui é uma linha e cobre tudo, porque o fluxo é interno ao Kafka; use Streams para
  estado, janela e join, não para transformação sem estado.
