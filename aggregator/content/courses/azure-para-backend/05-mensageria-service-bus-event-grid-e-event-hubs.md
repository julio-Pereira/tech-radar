---
id: mensageria-service-bus-event-grid-e-event-hubs
title: "Mensageria: Service Bus, Event Grid e Event Hubs"
summary: "Comando vai em fila, fato discreto vai em evento, fluxo contínuo vai em stream; o Azure tem um serviço para cada um, e confundir os três é a origem de quase toda mensagem duplicada ou perdida. Service Bus com peek-lock, lock de no máximo 5 minutos, DLQ, sessões e detecção de duplicidade que só olha o envio; Event Grid com retry de 24 horas; Event Hubs com partição, checkpoint e Kafka — medido no emulador oficial: lock expirado deu 26 lançamentos para 20 mensagens sem inbox, e 20 com."
estimatedMinutes: 60
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [confiabilidade, arquitetura]
references:
  - title: "Azure Service Bus — Message transfers, locks, and settlement"
    url: https://learn.microsoft.com/azure/service-bus-messaging/message-transfers-locks-settlement
  - title: "Azure Service Bus — Duplicate detection"
    url: https://learn.microsoft.com/azure/service-bus-messaging/enable-duplicate-detection
  - title: "Azure Event Grid — Delivery and retry"
    url: https://learn.microsoft.com/azure/event-grid/delivery-and-retry
  - title: "Azure Event Hubs — Apache Kafka protocol support"
    url: https://learn.microsoft.com/azure/event-hubs/azure-event-hubs-apache-kafka-overview
---

## Três problemas, três serviços

| | Service Bus | Event Grid | Event Hubs |
| --- | --- | --- | --- |
| Para | **comando**: trabalho a fazer, com garantia | **fato discreto**: algo aconteceu, avise quem quer saber | **fluxo contínuo**: muitos eventos, lidos em ordem por partição |
| Modelo | fila e tópico com assinaturas | *push* para os assinantes, por filtro | *log* particionado, com posição por consumidor |
| Quem controla o ritmo | o consumidor (*pull*, com *lock*) | o Event Grid empurra, com *retry* | o consumidor, pelo *checkpoint* |
| Releitura | não | não | sim, dentro da retenção |

A combinação comum numa fintech: o comando "liquide este Pix" vai por **fila do Service Bus**; o fato "o Pix foi
liquidado" sai por **tópico do Service Bus** ou **Event Grid** para quem se interessa; o fluxo de todas as
transações para o antifraude e para o *data lake* vai pelo **Event Hubs**.

## Service Bus

**Peek-lock.** O receptor pega a mensagem com um ***lock***, processa e a **completa**. Se não completar dentro do
*lock*, ela volta para a fila. Conferido em 12 nov 2026: o *lock* padrão é de **1 minuto**, e o máximo, de
**5 minutos**. Processamento mais longo **renova o *lock*** enquanto trabalha (os SDKs têm a renovação
automática). O *receive-and-delete* apaga na entrega: se o consumidor cair, a mensagem se perde.

**Contagem de entrega e DLQ.** Cada entrega soma 1 no `delivery count`. No `MaxDeliveryCount` (padrão **10**),
a mensagem vai para a **DLQ** da fila. Ela fica lá até alguém reprocessá-la.

**Sessões.** Com sessão, as mensagens do mesmo `SessionId` saem em ordem, e a sessão fica presa a um receptor por
vez. É a ordem por conta, como o `MessageGroupId` da FIFO da AWS.

**Detecção de duplicidade.** Com ela ligada, o Service Bus descarta um segundo envio com o mesmo `MessageId`
dentro da janela. Conferido em 12 nov 2026: a janela padrão é de **10 minutos**, e a máxima, de **7 dias**. A
documentação é explícita: **ela não impede que o receptor processe a mesma mensagem duas vezes.** Ela olha o
envio, não o processamento.

**Outros limites, conferidos em 12 nov 2026:**

- a mensagem tem até **256 KB** no Standard e até **100 MB** no Premium, por AMQP. Acima disso, a carga vai para
  o Blob, e a mensagem leva a referência (o padrão *claim check*);
- uma transação tem até 100 mensagens;
- as mensagens agendadas e os filtros de assinatura de tópico resolvem o "envie amanhã às 6h" e o "só os Pix
  acima de R$ 10 mil".

O consumidor idempotente, com *inbox* pela chave de negócio, é de `arquitetura-eventos/08`.

## Event Grid

O **Event Grid** entrega eventos por *push*, **pelo menos uma vez**, para os assinantes cujo filtro casa. Ele
transporta os eventos de sistema do Azure (um *blob* criado, um segredo perto de vencer) e os da sua aplicação,
no formato CloudEvents. Conferido em 12 nov 2026:

- o ***retry*** padrão dura até **24 horas** ou **30 tentativas**, o que vencer primeiro, com intervalos fixos (de
  10 segundos até a cada 12 horas). O número de tentativas e o tempo de vida são configuráveis; o calendário, não;
- o ***dead-letter*** vem **desligado**: sem uma conta de storage de destino, o evento que esgota as tentativas se
  perde;
- as respostas 400 e 413 vão direto para o *dead-letter*, sem *retry*.

## Event Hubs

O **Event Hubs** é um *log* particionado. O produtor escolhe a **partição** pela chave; cada ***consumer group***
tem a sua posição; o consumidor grava o ***checkpoint*** (no Blob) e, ao reiniciar, retoma dele. A ordem vale
dentro da partição. O **Capture** grava o fluxo no Blob ou no Data Lake.

**Kafka no Event Hubs.** O Event Hubs fala o protocolo do Kafka: o cliente Kafka aponta para o *namespace* e
funciona. Conferido em 12 nov 2026: isso vale no Standard, no Premium e no Dedicated, não no Basic. A compressão
aceita é só gzip, e só no Premium e no Dedicated. As transações estão em *preview*, e as páginas da documentação
divergem. O que muda em relação a um Kafka de verdade (retenção, compactação, transações, operação) está em
`kafka/10`.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| SQS | fila do Service Bus (aproximação) | o Service Bus é mais rico: sessões, transações, tópicos e detecção de duplicidade com janela configurável |
| SQS FIFO e `MessageGroupId` | sessões do Service Bus | a sessão fica presa a um receptor por vez |
| *visibility timeout* | *lock duration*, no máximo 5 min | acima disso, a renovação é obrigatória |
| SNS | tópico do Service Bus, ou Event Grid | o tópico do Service Bus guarda a mensagem; o Event Grid empurra e esquece depois do *retry* |
| EventBridge | Event Grid | o *dead-letter* do Event Grid vem desligado |
| Kinesis / MSK | Event Hubs | o Event Hubs fala Kafka, com diferenças de compressão e transação |

O marco gêmeo é `aws-para-backend/05`.

> **Armadilha.** O *lock* expira durante um processamento longo, a mensagem volta, e o efeito acontece duas vezes,
> **com a detecção de duplicidade ligada**. Ela só olha o envio. Quem impede a segunda execução é o *inbox* pela
> chave de negócio.

> **O que o emulador não reproduz.** O emulador oficial do Service Bus não tem entidades particionadas, JMS nem
> AMQP sobre WebSockets, perde os dados ao reiniciar e aceita **janela de duplicidade de no máximo 5 minutos**
> (com 10, ele não sobe, e o erro aparece como `Out of memory`). O do Event Hubs só aceita as APIs de produtor e
> consumidor do Kafka. Nenhum dos dois reproduz cotas, *throttling* nem a diferença entre os *tiers*.

## Exemplo numa fintech

A notificação de Pix ao recebedor era uma assinatura de tópico do Service Bus, com *lock* de 30 segundos. Num pico,
o *webhook* do recebedor passou a demorar 40 segundos. O *lock* expirou durante a chamada, a mensagem voltou, outro
consumidor a pegou, e o recebedor foi notificado duas vezes. A detecção de duplicidade estava ligada, e por isso o
time demorou a achar a causa. A correção:

- a renovação automática do *lock* enquanto o *webhook* está em curso;
- um *inbox* pela chave do evento;
- um identificador idempotente na notificação, para o recebedor também descartar a segunda.

## Hands-on

**Tutorial.** Suba no `lab/` os emuladores oficiais do Service Bus (com o SQL Server de que ele depende), do Event
Hubs e o Azurite, e escreva o adaptador do `ledger-core` em Go (`azservicebus` 1.11.0, `azeventhubs` 1.4.0), com o
*endpoint* vindo da configuração.

**Desafio.** O consumidor seguro dos lançamentos do ledger.

**Invariantes testáveis**

1. **Efeito uma vez por mensagem lógica.** Com 30% das mensagens processadas além do *lock*, cada lançamento
   aparece uma vez. Medido no emulador, com *lock* de 5 s e 3 consumidores: **sem *inbox*, 26 lançamentos para 20
   mensagens; com *inbox*, 20.**
2. **DLQ sem duplicar.** A mensagem que falha `MaxDeliveryCount` vezes vai para a DLQ, e o reprocessamento não
   duplica. Medido: as 3 mensagens foram para a DLQ, uma delas já aplicada antes da falha, e o reprocessamento
   deixou **3 lançamentos**.
3. **Ordem por conta.** Com sessões, 10 contas e 4 receptores concorrentes, cada conta é aplicada em ordem. Medido:
   50 mensagens, **nenhuma conta fora de ordem**.
4. **A detecção de duplicidade é do envio.** Dois envios do mesmo `MessageId` dentro da janela viram uma mensagem
   (medido na Fase 0), e o teste documenta que isso não cobre o reprocessamento: o invariante 1 continua precisando
   do *inbox*.
5. **Carga grande por referência.** Medido: 400 KB direto na fila do emulador deram `MessageSizeExceededError`; pelo
   Azurite, a mensagem levou só a referência, e o conteúdo conferiu.
6. **O *checkpoint* retoma.** O consumidor do Event Hubs, reiniciado, retoma do *checkpoint* sem reprocessar. Medido
   na Fase 0: depois do reinício, leu só os 3 eventos novos.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, crie uma fila Standard com detecção de
duplicidade de 10 minutos, envie o mesmo `MessageId` antes e depois da janela e confira. Destrua tudo no fim.

**Checagem**

1. O que acontece quando o processamento passa do *lock*, e como evitar?
2. Por que a detecção de duplicidade não substitui a idempotência do consumidor?
3. Quando Service Bus, quando Event Grid e quando Event Hubs?
4. O que a sessão garante, e o que ela custa em paralelismo?

## Principais aprendizados

- Comando em fila, fato em evento, fluxo em *stream*: Service Bus, Event Grid e Event Hubs.
- *Lock* padrão de 1 min, máximo de 5 min; processamento longo renova. `MaxDeliveryCount` padrão de 10, depois
  DLQ.
- A detecção de duplicidade (10 min padrão, 7 dias no máximo) só olha o envio. Medido: sem *inbox*, 26
  lançamentos para 20 mensagens.
- Sessões dão ordem por chave, com um receptor por sessão.
- Event Grid: *retry* de 24 h ou 30 tentativas, *dead-letter* desligado por padrão.
- Event Hubs: partição, *consumer group*, *checkpoint*; Kafka no Standard em diante, com diferenças.
