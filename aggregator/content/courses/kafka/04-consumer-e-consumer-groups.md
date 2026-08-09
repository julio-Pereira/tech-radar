---
id: consumer
title: "Consumer, consumer groups e rebalance"
summary: "O poll loop, o novo protocolo de rebalance, e o ponto exato onde nasce duplicidade ou perda: a posição do commit."
estimatedMinutes: 50
references:
  - title: "Apache Kafka — Consumer Configs"
    url: https://kafka.apache.org/documentation/#consumerconfigs
  - title: "KIP-848: The Next Generation of the Consumer Rebalance Protocol"
    url: https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol
  - title: "Spring for Apache Kafka — Receiving Messages"
    url: https://docs.spring.io/spring-kafka/reference/kafka/receiving-messages.html
---

## O poll loop e o teto de paralelismo

O consumidor é um laço: `poll()` traz um lote, você processa, repete. `poll()` faz
mais do que buscar dados — é ele que mantém a sessão viva, executa o rebalance e
entrega as partições atribuídas. Um consumidor que demora entre polls não está
"lento": está **sumindo** do grupo.

O `group.id` define o grupo. Dentro de um grupo, **cada partição é atribuída a no
máximo um consumidor**. Daí a regra dura do dimensionamento:

> Você escala adicionando consumidores até o número de partições — e nem um a mais.
> O consumidor de nº P+1 fica ocioso, consumindo memória e uma vaga no rebalance.

Grupos diferentes lendo o mesmo tópico são independentes: cada um tem seu próprio
conjunto de offsets. É assim que o antifraude e o ledger leem `payments.initiated`
sem se atrapalhar.

## Rebalance: eager, cooperative e o protocolo novo

Rebalance é a redistribuição de partições quando alguém entra, sai ou morre.

- **Eager** (o clássico original): todo mundo **para**, devolve tudo, e recebe a nova
  atribuição. É o *stop-the-world* — com 50 consumidores, um deploy vira uma pausa
  global de segundos, várias vezes.
- **Cooperative sticky**: só as partições que precisam mudar de dono são revogadas; o
  resto continua processando. Melhor, mas ainda coordenado pelo consumidor líder.
- **KIP-848 — o protocolo novo**, que é o caminho atual: a coordenação sai dos
  consumidores e vai para o **broker**, incremental. Sem barreira global, rebalance
  muito mais rápido e previsível. O protocolo clássico está em depreciação; o conteúdo
  novo assume o novo.

O parâmetro que mais causa dor é `max.poll.interval.ms` (5min por padrão): se o seu
processamento entre dois polls passar disso, o broker considera o consumidor morto e
**rebalanceia** — e o consumidor "sumido" pode ainda estar processando o lote, o que
gera trabalho duplicado. Um lote de 500 registros com uma chamada de PSP de 2s cada
estoura o limite folgado. As saídas: reduzir `max.poll.records`, mover trabalho pesado
para fora do loop, ou subir o intervalo conscientemente.

## Commit: onde nasce a duplicidade (ou a perda)

Este é o parágrafo mais importante do bloco A.

O offset commitado diz "já processei até aqui". Se o consumidor morre, ele recomeça do
último commit. Então:

| Estratégia | O que acontece na falha | Semântica |
| --- | --- | --- |
| Commit **antes** de processar | o registro foi pulado | at-most-once (perde) |
| Commit **depois** de processar | o registro é reprocessado | at-least-once (duplica) |
| `enable.auto.commit=true` | commita no poll seguinte, por tempo — sem saber se você processou | perde **e** duplica |

Auto-commit é o padrão e é a escolha errada para dinheiro: ele commita a cada
`auto.commit.interval.ms` com base no que foi *entregue*, não no que foi *processado*.
Um crash entre a entrega e o processamento perde registro sem deixar rastro.

A escolha correta para uma fintech é **commit manual depois do processamento**, o que
significa **at-least-once**, o que significa que **o consumidor precisa ser
idempotente**. Não há alternativa mais fácil: exactly-once real, incluindo o
side-effect externo, é o assunto do marco 05, e a resposta lá também termina em
idempotência.

`auto.offset.reset` decide o que fazer quando **não existe** offset commitado (grupo
novo) ou quando o offset guardado já expirou da retenção. `earliest` relê tudo,
`latest` pula o passado. O incidente clássico: um grupo com `earliest` fica 8 dias fora
do ar, o offset expira, ele volta e **reprocessa o tópico inteiro** — o que numa
fintech significa reemitir milhões de eventos. É o argumento mais concreto para
idempotência no consumidor.

## Lag é o sinal nº 1

O **consumer lag** é a diferença entre o último offset do log e o offset commitado do
grupo, por partição. É a métrica de saúde mais informativa que existe em Kafka porque
ela é *preditiva*: lag crescente significa que o consumo está mais lento que a
produção, e o desfecho é conhecido antes de acontecer.

Comece por `kafka-consumer-groups.sh --describe --group <g>`; em produção, um exportador
Prometheus. Alerte pela **derivada** (lag crescendo há N minutos), não pelo valor
absoluto — um pico de lag no fim do mês é normal, lag que só sobe é incidente.

Na trilha Kubernetes, esse mesmo número vira o gatilho do **KEDA** para escalar o
consumidor: escalar por lag é escalar pelo sinal certo, escalar por CPU num consumidor
I/O-bound é escalar pelo sinal errado.

## Exemplo numa fintech

O consumidor de liquidação trava 4 horas. O que acontece, em ordem:

1. **O lag cresce** — e é o único sinal antes do prejuízo. Se você alerta por
   throughput, não vê nada: o produtor está ótimo.
2. **A retenção vira um relógio.** Com `retention.ms=7d` você tem folga; com 6 horas,
   você está a duas horas de perder dado de forma irrecuperável.
3. **A recuperação é o segundo incidente.** O consumidor volta e tenta processar 4h de
   backlog o mais rápido possível, batendo no banco e no PSP com o dobro do volume
   normal — e é aí que o rebalance por `max.poll.interval.ms` costuma começar a
   cascatear.
4. **O SLA de liquidação** já estourou muito antes do lag zerar.

Nada disso é resolvido no momento do incidente. É resolvido antes, com retenção
dimensionada para o pior caso de indisponibilidade, alerta na derivada do lag, e
consumidor idempotente que aguenta o replay.

## Hands-on

**Desafio — commit que sobrevive ao `kill -9`.** Escreva um consumidor de
`payments.initiated` com `enable.auto.commit=false`, commit manual **depois** de
persistir cada pagamento, e uma chave de idempotência (`paymentId`) com constraint
única no banco.

**Invariante testável** — este é o critério, e ele é contável:

1. Produza exatamente **10.000** eventos com `paymentId` distintos.
2. Rode o consumidor e mate-o com `kill -9` pelo menos três vezes em momentos
   aleatórios. Suba de novo cada vez.
3. Ao final: `SELECT count(*) FROM pagamentos` = **10.000**, e
   `SELECT count(DISTINCT payment_id)` = **10.000**.

Não perdeu nenhum (commit depois do processamento) e não duplicou nenhum (constraint
única). Rode o mesmo teste com `enable.auto.commit=true` e registre o número que sai —
essa diferença é o marco inteiro.

**Checagem.** (a) Você tem 6 partições e sobe 10 consumidores no mesmo grupo: quantos
processam? (b) Qual config você mexe primeiro quando o rebalance dispara porque o lote
demora, e por quê? (c) Um grupo com `auto.offset.reset=earliest` ficou fora do ar
tempo suficiente para o offset expirar — o que acontece quando ele volta?

## Principais aprendizados

- Uma partição por consumidor dentro do grupo: consumidor além do número de partições
  fica ocioso.
- KIP-848 move a coordenação do rebalance para o broker e acaba com o *stop-the-world*;
  o protocolo clássico está em depreciação.
- Commit depois do processamento = at-least-once = **consumidor obrigatoriamente
  idempotente**. Auto-commit consegue perder e duplicar ao mesmo tempo.
- Lag é o sinal preditivo nº 1 — alerte pela derivada, e lembre que ele é o gatilho
  certo para escalar (KEDA, na trilha Kubernetes).
