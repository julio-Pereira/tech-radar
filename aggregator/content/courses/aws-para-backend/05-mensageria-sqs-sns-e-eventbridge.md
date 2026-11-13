---
id: mensageria-sqs-sns-e-eventbridge
title: "Mensageria: SQS, SNS e EventBridge"
summary: "Fila, tópico e barramento resolvem problemas diferentes; misturar os três é a fonte de quase toda mensagem duplicada ou perdida na AWS. SQS padrão × FIFO (ordem por MessageGroupId, deduplicação de 5 min), visibility timeout e a extensão dele, DLQ e redrive (medido no ElasticMQ: o contador de recebimentos volta a 1), mensagem de até 1 MiB desde ago 2025, SNS com filtro, EventBridge, quando Kafka — e onde o emulador mente."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [confiabilidade, arquitetura]
references:
  - title: "Amazon SQS — Message quotas"
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html
  - title: "Amazon SQS — Exactly-once processing in FIFO queues"
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues-exactly-once-processing.html
  - title: "Amazon SQS — Enabling high throughput for FIFO queues"
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/enable-high-throughput-fifo.html
  - title: "Amazon SQS increases maximum message payload size to 1 MiB"
    url: https://aws.amazon.com/about-aws/whats-new/2025/08/amazon-sqs-max-payload-size-1mib/
---

## Três ferramentas, três problemas

| | SQS | SNS | EventBridge |
| --- | --- | --- | --- |
| Modelo | fila: um consumidor processa cada mensagem | tópico: cada assinante recebe uma cópia | barramento: regras roteiam eventos por conteúdo |
| Quem puxa | o consumidor (*polling*) | o SNS empurra para os assinantes | o EventBridge empurra para os alvos |
| Bom para | trabalho a fazer, com *retry* e DLQ | *fan-out* para várias filas | integração entre domínios e contas, eventos de SaaS e da própria AWS |
| Retenção | até 14 dias | nenhuma (entrega e esquece) | *archive* e *replay* opcionais |

A combinação mais comum numa fintech é **SNS → várias SQS**: o evento "Pix liquidado" sai uma vez e cada
consumidor (ledger, notificação, antifraude) tem a própria fila, com o próprio ritmo, *retry* e DLQ.
Consumir direto do SNS, sem fila, perde a mensagem quando o consumidor está fora.

## SQS padrão × FIFO

A **fila padrão** entrega **pelo menos uma vez** e **sem ordem garantida**, com vazão praticamente
ilimitada. Duplicidade não é exceção: é o contrato. O consumidor precisa ser idempotente.

A **fila FIFO** entrega em ordem **por `MessageGroupId`** e deduplica. Os números conferidos em 10 nov
2026:

- **deduplicação por janela de 5 minutos**, por `MessageDeduplicationId` ou pelo *hash* do corpo;
- **300 mensagens/s** sem lote e **3.000** com lote, no modo normal;
- até **70.000/s** sem lote no modo de alta vazão, em N. Virginia, Oregon e Irlanda (menos nas outras
  regiões: **4.500/s** em São Paulo), com `DeduplicationScope=messageGroup` e
  `FifoThroughputLimit=perMessageGroupId`;
- até **120.000 mensagens em voo**.

A ordem vale dentro do grupo. No laboratório, com `a1 a2 a3` no grupo A e `b1` no B, três recebimentos sem
apagar devolveram `a1`, depois `b1`, depois nada: **o grupo A fica bloqueado enquanto `a1` está em voo**. É
isso que garante a ordem e é isso que limita a vazão. Com um grupo por conta de cliente, contas diferentes
andam em paralelo e a mesma conta nunca tem dois lançamentos ao mesmo tempo.

A deduplicação de 5 minutos não substitui a idempotência do consumidor. Um reenvio depois da janela, um
*redrive* da DLQ ou a mesma operação vinda de outra origem passam por ela.

## *Visibility timeout*, DLQ e *redrive*

Quando um consumidor recebe uma mensagem, ela fica **invisível** pelo *visibility timeout*. Se ele não a
apagar nesse prazo, ela volta para a fila e outro consumidor a recebe. É o mecanismo de *retry* do SQS, e
também a fonte clássica de duplicidade: um processamento lento, que passa do prazo, é refeito em paralelo.

O consumidor que pode demorar **estende a visibilidade** enquanto trabalha (`ChangeMessageVisibility`).
Medido: com o *timeout* de 1 s estendido para 5 s, a mensagem não reapareceu.

Com uma **política de *redrive***, a mensagem que foi recebida `maxReceiveCount` vezes sem ser apagada vai
para a **DLQ**. Medido, com `maxReceiveCount` 3: os recebimentos contaram 1, 2 e 3, e depois a mensagem
estava na DLQ. O ***redrive*** (`StartMessageMoveTask`) devolve as mensagens da DLQ para a fila de origem,
depois que a causa da falha foi corrigida.

Uma medição que muda o desenho: no ElasticMQ, depois do *redrive*, **o `ApproximateReceiveCount` voltou a
1**. Na AWS, o comportamento do contador no *redrive* não está documentado, e a referência da API o descreve
como recebimentos em todas as filas. Os dois juntos mostram que o contador não é contrato de negócio: um
consumidor que o usa para decidir "já processei isso?" depende de um detalhe que muda entre
implementações. A idempotência
precisa ser pela **chave de negócio**, num *inbox* (`arquitetura-eventos/08`).

**Mensagem grande.** O limite do SQS é **1 MiB** desde ago 2025 (era 256 KiB). O SNS chegou a 1 MiB em set
2026, mas o padrão do tópico continua 256 KiB: o 1 MiB é ligado no `MaximumMessageSize` do tópico, e acima de
256 KiB ele só entrega a assinantes SQS, Lambda e Firehose, com até 100 assinaturas. Para mais que isso, a carga vai para o S3, e a mensagem leva só a referência, o padrão do *Extended
Client*. Confira o atributo `MaximumMessageSize` de filas antigas, criadas com o valor anterior.

## SNS e EventBridge

O **SNS** aceita **política de filtro** por atributo da mensagem em cada assinatura. Medido no `moto`: três
publicações, uma com `faixa=alto`; a fila com filtro recebeu 1, e a sem filtro, 3. O filtro tira do
consumidor o trabalho de descartar, e da conta o custo de entregar o que seria jogado fora.

O **EventBridge** roteia por **regras sobre o conteúdo** do evento (`source`, `detail-type`, campos do
`detail`), entre contas e para dezenas de tipos de alvo. Medido: com uma regra para `EstornoSolicitado`,
só esse evento chegou à fila. Ele acrescenta:

- o **registro de *schemas***;
- os ***pipes***, ligações ponto a ponto com filtro e enriquecimento;
- o ***archive* e *replay***, para reprocessar uma janela de eventos.

O critério: SNS → SQS para *fan-out* dentro de um domínio, com alto volume. EventBridge para integração
entre domínios e contas, quando a regra de roteamento é parte do contrato. Um processo com várias etapas
e compensação não é uma cadeia de regras: é uma saga (`arquitetura-eventos/09`).

## Quando a resposta é Kafka

SQS e SNS não guardam histórico para ser relido. Quando o problema exige **reler** dias de eventos, **ordem
por partição** com alta vazão ou **vários consumidores com a própria posição** no mesmo fluxo, a resposta é
Kafka, com o **MSK** como opção gerenciada. A comparação completa está em `kafka/10`, e o
*backpressure* do lado do consumidor em `kotlin-backend/07`.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Service Bus (filas) | SQS | o Service Bus tem sessões; a ordem por chave na AWS é o FIFO com `MessageGroupId` |
| Service Bus (tópicos e assinaturas) | SNS → SQS | na AWS, a assinatura durável é uma fila SQS assinando o tópico |
| Event Grid | EventBridge | os dois roteiam eventos por conteúdo; o EventBridge tem *archive* e *replay* |
| Event Hubs | Kinesis Data Streams ou MSK | para *replay* e posição por consumidor, MSK é o equivalente direto do Kafka |

O marco gêmeo no Azure é `azure-para-backend/05`.

> **O que o emulador não reproduz.** Cotas de vazão (300, 3.000 e 70.000/s), a janela exata de 5
> minutos e a latência real. E os emuladores divergem entre si:
>
> - o `moto` 5.2.5 deduplicou o envio repetido, mas devolveu um `MessageId` novo; o ElasticMQ devolveu o
>   mesmo. Um teste que compara `MessageId` passa num e falha no outro, então conte mensagens;
> - o `moto` respondeu 500 ao `StartMessageMoveTask`; o ElasticMQ fez o *redrive*. Por isso, o Tutorial
>   deste marco usa o ElasticMQ.

## Exemplo numa fintech

O serviço de notificação de Pix consumia uma fila padrão com *visibility timeout* de 30 s. Num pico, o
recebedor externo demorou 40 s para responder a alguns *webhooks*. As mensagens voltaram para a fila
enquanto ainda estavam sendo processadas, outro consumidor as pegou, e os recebedores foram notificados duas
vezes. Alguns sistemas do outro lado trataram a segunda notificação como um segundo pagamento. A
correção teve três partes:

- o *timeout* passou a ser estendido enquanto o *webhook* estava em andamento;
- um *inbox* pela chave do evento barrou a segunda entrega;
- a notificação passou a carregar um identificador idempotente para o recebedor.

## Hands-on

**Tutorial.** Suba o ElasticMQ no *compose* do `lab/` e escreva o adaptador SQS do `ledger-core` em Go
(AWS SDK for Go v2, `service/sqs` 1.52.11), com o *endpoint* vindo da configuração. Envie, receba, deixe a
visibilidade expirar e leia o `ApproximateReceiveCount`.

**Desafio.** Um consumidor seguro para os lançamentos do ledger.

**Invariantes testáveis**

1. **Efeito uma vez por mensagem lógica.** Com processamento que passa do *visibility timeout* em 30% das
   mensagens, cada lançamento aparece uma vez no ledger. O *inbox* pela chave de negócio barra a segunda
   entrega.
2. **DLQ e *redrive* sem duplicar.** A mensagem que falha `maxReceiveCount` vezes vai para a DLQ. Depois da
   correção, o *redrive* a reprocessa uma vez, mesmo com o contador de recebimentos de volta em 1 (como no
   ElasticMQ).
3. **Ordem por conta no FIFO.** Com 10 grupos (contas) e consumidores concorrentes, os lançamentos de cada
   conta são aplicados na ordem de envio.
4. **Carga grande pelo S3.** Uma carga acima do limite configurado vai para o S3 emulado, e a mensagem leva
   só a referência. O consumidor busca e apaga o objeto depois de processar.
5. **Visibilidade estendida.** Com um relógio controlado, um processamento de 3x o *timeout* estende a
   visibilidade antes de cada vencimento, e a mensagem não é recebida por outro consumidor.

**Complemento.** Com uma conta real e orçamento criado antes, crie uma fila FIFO, envie a mesma mensagem com
o mesmo `MessageDeduplicationId` antes e depois de 5 minutos e confira a janela real. Destrua tudo no fim.

**Checagem**

1. Por que uma fila padrão exige consumidor idempotente, e por que a FIFO também?
2. O que acontece quando o processamento passa do *visibility timeout*, e como evitar?
3. Por que o contador de recebimentos não serve para idempotência?
4. Quando EventBridge, quando SNS → SQS, e quando Kafka?

## Principais aprendizados

- Fila para trabalho, tópico para *fan-out*, barramento para integração por regra.
- SQS padrão: pelo menos uma vez, sem ordem. FIFO: ordem por grupo, deduplicação de 5 min, grupo bloqueado
  com mensagem em voo.
- O *visibility timeout* é o *retry*; o processamento lento o estende.
- DLQ com `maxReceiveCount`; no ElasticMQ, o *redrive* zerou o contador. A idempotência é pela chave de
  negócio.
- Mensagem de até 1 MiB (desde ago 2025); acima disso, referência ao S3.
- *Replay* e posição por consumidor pedem Kafka. Os emuladores divergem: conte mensagens, não IDs.
