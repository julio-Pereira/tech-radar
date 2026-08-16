---
id: observabilidade-e-antipadroes
title: "Observabilidade, performance e antipadrões"
summary: "As métricas que importam de verdade, o tracing que atravessa o broker, e os sete antipadrões que fecham a trilha."
estimatedMinutes: 50
references:
  - title: "Apache Kafka — Monitoring"
    url: https://kafka.apache.org/documentation/#monitoring
  - title: "OpenTelemetry — Messaging Semantic Conventions"
    url: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
  - title: "Confluent — Kafka Performance"
    url: https://developer.confluent.io/learn/kafka-performance/
---

## As métricas que importam

O Kafka expõe centenas de métricas JMX. Estas decidem incidentes:

**Do consumidor:**

- **Consumer lag, por partição.** A métrica nº 1 (marco 04). Por partição, não só o total —
  a soma esconde a partição quente (marco 06), que é o caso que mais interessa.
- **`records-lag-max`** e o tempo de processamento por lote, que explica o lag.
- **Taxa de rebalance.** Rebalance frequente é sintoma de `max.poll.interval.ms` estourando
  ou de instâncias instáveis.

**Do broker:**

- **`UnderReplicatedPartitions`** — deve ser **zero**. Diferente de zero significa que
  você está mais perto de perder dado do que imagina. É o alerta mais importante do
  cluster.
- **`OfflinePartitionsCount`** — deve ser zero. Diferente de zero é indisponibilidade.
- **ISR shrink/expand rate** — oscilação constante indica broker sobrecarregado, rede ruim
  ou GC longo. Precede o incidente.
- **Latência de request por percentil** (`RequestQueueTimeMs`, `LocalTimeMs`,
  `RemoteTimeMs`) — a decomposição diz **onde** o tempo foi: fila, disco local, ou espera
  pela replicação.

**Do producer:** taxa de erro, `record-error-rate`, tempo em buffer, e o tamanho do batch
efetivo (que valida se o `linger.ms` do marco 03 está fazendo o que você espera).

E a regra herdada da trilha de observabilidade: **alerte por sintoma e por SLO, não por
gráfico bonito.** "Lag acima de 10.000" é um limiar que erra nos dois sentidos — ele grita
no pico de fim de mês e fica quieto num consumidor lento com pouco volume. Alerte pela
**derivada** (lag crescendo há N minutos) e pelo **tempo estimado de recuperação** (lag ÷
taxa de consumo), que é o número que responde "vamos furar o SLA?".

## Tuning: as trocas reais

Não existe configuração universal. Existem trocas, e cada uma tem um lado que dói:

| Botão | Ganha | Perde |
| --- | --- | --- |
| `linger.ms` ↑ | throughput, menos carga no broker | latência no p50 |
| `batch.size` ↑ | compressão melhor | memória do producer |
| `compression.type=zstd` | rede e disco | CPU no producer e no consumidor |
| `fetch.min.bytes` ↑ | menos requisições | latência de entrega |
| `acks=all` | durabilidade | latência |
| Mais partições | paralelismo | metadados, rebalance, arquivos abertos |

Três pontos de infraestrutura que decidem mais do que qualquer botão:

- **GC do broker.** Pausa longa de GC faz o broker sair do ISR e provoca eleição de líder.
  A heap do broker deve ser **modesta** (o Kafka usa page cache do SO, não heap — marco 02),
  com um coletor de baixa pausa.
- **Disco.** Sequential I/O é rápido, mas latência de fsync importa com `acks=all`. Disco de
  rede com latência alta aparece como p99 de produção ruim.
- **Page cache.** RAM sobrando na máquina é o que mantém os consumidores lendo da memória.
  É por isso que "o broker tem só 6GB de heap" não significa que a máquina deva ter 8GB.

## Tracing através do broker

O trace se parte no Kafka a não ser que o contexto viaje nos **headers da mensagem** —
é o mesmo mecanismo dos marcos 05 e 10 da trilha de observabilidade, visto do lado do
broker.

O producer injeta o `traceparent` nos headers; o consumidor extrai e cria seu span com
**link** para o de produção, em vez de span filho — porque o consumo pode ocorrer minutos
depois e uma duração de "espera" seria enganosa.

O que isso desbloqueia é a pergunta que mais dói numa arquitetura de eventos: *"o que
aconteceu com este pagamento, do clique do cliente até a liquidação, atravessando três
serviços e dois tópicos?"*. Sem propagação, a investigação é procurar log em cada serviço
e torcer para os relógios baterem.

Semantic conventions de messaging (`messaging.system`, `messaging.destination.name`,
`messaging.kafka.offset`) fazem esses spans serem legíveis por qualquer ferramenta e
comparáveis entre serviços Java e Go.

## Antipadrões: o fecho da trilha

Sete, e cada um já apareceu antes com outro nome:

**1. Kafka como banco de dados.** Guardar o estado atual num tópico compactado e "consultar"
lendo tudo. Não há índice, não há consulta por chave arbitrária, não há update. Kafka é o
log das mudanças; o estado consultável é uma projeção (marco 09), num banco.

**2. Tópico por cliente.** `payments.cliente-1234`. Milhares de tópicos, metadados
inflados, rebalance lento, e nenhum ganho — a chave já particiona por cliente. Aparece
quando alguém confunde isolamento lógico com isolamento físico.

**3. Mensagem gigante.** Payload de megabytes (PDF, imagem) no evento. Estoura
`max.request.size`, envenena o page cache, degrada todo mundo. O padrão é **claim check**:
o binário vai para object storage, o evento carrega a referência.

**4. Consumidor não idempotente.** O antipadrão mais caro. At-least-once é a semântica real
(marcos 04 e 05); consumidor sem dedupe é uma duplicidade esperando o próximo `kill -9`.

**5. Retry infinito sem DLQ.** A poison pill trava a partição para sempre e o lag cresce
com o consumidor "vivo" (marco 08). Erro permanente vai direto para a DLQ, e DLQ tem dono
e alerta.

**6. Um tópico gigante `eventos`.** Tudo no mesmo tópico, com um campo `tipo` no payload.
Todo consumidor lê tudo e descarta 95%, não há como dar ACL por tipo de dado (marco 13),
não há schema coerente (marco 07), e a retenção precisa servir a todos os casos ao mesmo
tempo.

**7. Ordem global exigida por design.** Alguém especificou "os eventos precisam ser
processados na ordem". Uma partição, um consumidor, sem escala — e quase sempre o requisito
real era ordem **por entidade** (marco 06). Vale sempre perguntar: ordem entre o quê e o
quê, exatamente?

## Exemplo numa fintech

O painel de plantão do `pix-stream`, na ordem de leitura:

1. **Lag por consumer group e por partição**, com a derivada e o tempo estimado de
   recuperação.
2. **`UnderReplicatedPartitions` e `OfflinePartitionsCount`** — as duas que devem ser zero.
3. **Profundidade da DLQ** — qualquer valor acima de zero é incidente (marco 08).
4. **Taxa de erro do producer** e p99 de produção.
5. **Métricas de negócio** do marco 08 da trilha de observabilidade: TPV e taxa de
   autorização, no mesmo painel — porque é a correlação entre eles que resolve o incidente
   rápido.

## Hands-on

**Desafio — o runbook do lag crescente.** O cenário: o lag do `ledger-projector` cresce há
20 minutos. Existem quatro suspeitos, e você precisa distinguí-los **por evidência**:

1. **Aumento de tráfego legítimo** (fim de mês) — o produtor subiu.
2. **Consumidor lento** — uma dependência (banco, PSP) degradou o tempo por mensagem.
3. **Partição quente** — o lag está concentrado numa partição.
4. **Rebalance em laço** — o consumidor não estabiliza tempo suficiente para processar.

**Invariantes testáveis** — reproduza os quatro, um de cada vez, e para cada um:

- Registre **qual métrica os distingue** e o valor observado. As quatro assinaturas são
  diferentes: (1) taxa de produção sobe e o consumo acompanha proporcionalmente;
  (2) taxa de produção estável e tempo por lote sobe; (3) lag concentrado numa partição
  com as outras em zero; (4) taxa de rebalance alta e o lag oscila sem descer.
- Escreva o runbook em `docs/runbook/lag-crescente.md`: a árvore de decisão, o comando de
  diagnóstico de cada ramo, e a ação de mitigação. Um ramo por suspeito.
- **Prove o runbook:** peça a alguém que injete **um** dos quatro sem te dizer qual, e
  siga o seu próprio documento. Se ele não te levar ao diagnóstico, ele está errado — e
  descobrir isso agora é melhor do que às 3h.

**Complemento — o trace atravessando o broker.** Se você fez o desafio do marco 05 da
trilha de observabilidade, verifique aqui pelo lado do Kafka: os headers da mensagem
carregam o `traceparent`, e os atributos `messaging.*` seguem as semantic conventions.
Consulte um pagamento específico ponta a ponta.

**Complemento — a autocrítica.** Percorra os sete antipadrões e marque, honestamente,
quais existem no sistema em que você trabalha hoje. Para cada um, escreva uma linha: é
dívida consciente ou ninguém percebeu? Esse documento é o melhor resultado possível desta
trilha.

**Checagem.** (a) Por que alertar por "lag > 10.000" erra nos dois sentidos? (b) O que
`UnderReplicatedPartitions` diferente de zero está te dizendo? (c) Por que a heap do broker
deve ser modesta? (d) Um requisito diz "processar na ordem" — qual pergunta você faz antes
de aceitar?

## Principais aprendizados

- Lag por partição com derivada e tempo de recuperação; `UnderReplicatedPartitions` e
  `OfflinePartitionsCount` devem ser zero.
- Tuning é troca: linger, batch, compressão e acks têm um lado que dói — e GC, disco e page
  cache decidem mais que qualquer botão.
- O trace atravessa o broker por header e span link, e é o que responde a jornada completa
  do pagamento.
- Os sete antipadrões são a trilha inteira ao contrário: Kafka como banco, tópico por
  cliente, mensagem gigante, consumidor não idempotente, retry sem DLQ, tópico único e
  ordem global.

## Capstone

O `pix-stream` é o seu componente do `fin-platform` — a especificação completa está em
`PROJETO.md`, na raiz desta trilha. Aqui é onde ele fica pronto.

**Entrega**

- [ ] `docker compose up` sobe o cluster KRaft e cria os tópicos do zero, em máquina limpa
- [ ] Producer com `acks=all`, idempotência e chave por conta; consumidor idempotente no destino
- [ ] Outbox relay no `pix-gateway`, retry escalonado e DLQ com dono e alerta
- [ ] Schema Registry com `BACKWARD`, e uma evolução exercitada de verdade
- [ ] Projeção de saldo por conta em Kafka Streams
- [ ] SASL + ACLs, com `allow.everyone.if.no.acl.found=false`
- [ ] Painel de lag **por partição**, com alerta por derivada e tempo de recuperação

**Critérios de pronto — cada um deve ser provado por um teste ou por um comando**

- [ ] `kill -9` no consumidor durante carga: nenhum lançamento duplicado no ledger
- [ ] Replay de 1 dia de eventos: saldo final idêntico ao anterior
- [ ] Consumidor da versão antiga continua lendo depois da evolução do schema
- [ ] Poison pill vai para a DLQ sem travar a partição
- [ ] Apagar a chave de um titular torna o histórico daquele CPF ilegível, sem reescrever o log
- [ ] Um broker derrubado com o produtor rodando não perde mensagem confirmada
- [ ] Uma ADR por bloco, cada uma com contexto, decisão, alternativas e **gatilho de reversão**

**Antes de fechar**, rode o game day do `PROJETO.md` e escreva um post-mortem de uma
página — inclusive se nada tiver quebrado. O que não quebrou também é resultado.
