---
id: functions-e-orquestracao
title: "Functions e orquestração"
summary: "As regras de idempotência e de concorrência contra o banco são as mesmas da AWS; o Azure muda o modelo de hospedagem, o binding e a orquestração, e é aí que a entrevista aperta. Flex Consumption como padrão (até 1.000 instâncias, de 512 a 4.096 MB), o Consumption em Linux aposentando em 2028, Go nativo só no Flex, o retry de cada trigger, conexão por identidade e Durable Functions com o orquestrador determinístico — com um harness que reexecutou o orquestrador e pegou time.Now() em 20 de 20 replays."
estimatedMinutes: 55
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [arquitetura, confiabilidade]
references:
  - title: "Azure Functions — Flex Consumption plan hosting"
    url: https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan
  - title: "Azure Functions — Error handling and retries"
    url: https://learn.microsoft.com/azure/azure-functions/functions-bindings-error-pages
  - title: "Durable Task — Orchestrator code constraints"
    url: https://learn.microsoft.com/azure/durable-task/common/durable-task-code-constraints
  - title: "Azure Functions — Go developer reference"
    url: https://learn.microsoft.com/azure/azure-functions/functions-reference-go
---

## As regras da AWS valem; o resto muda

Idempotência por chave de negócio, entrega mais de uma vez e concorrência que esgota o banco: tudo isso foi
provado em `aws-para-backend/06` e em `arquitetura-eventos/08`, e vale igual aqui. O que o Azure muda é o **modelo
de hospedagem**, o ***binding*** e a **orquestração**.

## Os planos de hospedagem

Conferido em 12 nov 2026:

| Plano | O que é | Quando |
| --- | --- | --- |
| **Flex Consumption** | o padrão recomendado para apps novos: escala por evento, só Linux, com VNet e instâncias *always ready* opcionais | quase sempre |
| **Premium** | instâncias pré-aquecidas, sempre ligadas | latência sem *cold start*, carga constante com picos |
| **Dedicated** | roda num plano do App Service | o plano já existe e está ocioso |
| **Container Apps** | a função como contêiner, no ambiente do marco 04 | o resto do serviço já está no Container Apps |
| **Consumption** (legado) | o plano antigo por execução | o de Linux **se aposenta em 30 set 2028**; o de Windows não está afetado |

Os números do **Flex Consumption**, conferidos em 12 nov 2026:

- até **1.000 instâncias** por app (a cota da assinatura chega antes);
- instâncias de **512, 2.048 ou 4.096 MB** (2.048 MB por padrão);
- *timeout* padrão de **30 minutos**, sem máximo imposto;
- **0 instâncias *always ready*** por padrão: o primeiro evento depois do ócio paga o *cold start*.

**Linguagens.** O Java roda nativo. O **Go** passou a ter suporte nativo (Go 1.24+), **só no Flex Consumption**, e a
documentação recomenda o nativo, e não o ***custom handler***, para apps novos em Go. As páginas oficiais divergem
sobre o *status*: uma diz GA, outra *preview*, e a de *preview* lista limites como a falta de Durable Functions para
Go. O *custom handler* continua sendo o caminho para outras linguagens.

## *Trigger*, *binding* e *retry*

O ***trigger*** dispara a função; o ***binding*** lê ou grava num serviço sem código de cliente. O *retry* depende de
quem dispara. Conferido em 12 nov 2026:

| *Trigger* | Quem refaz | Como |
| --- | --- | --- |
| Service Bus | o Service Bus | a mensagem volta pelo *lock* e vai para a DLQ no `MaxDeliveryCount` (marco 05) |
| Event Grid | o Event Grid | até 24 h ou 30 tentativas, e o *dead-letter* se configurado |
| Event Hubs, Kafka, Cosmos DB e Timer | o *runtime* do Functions | política de *retry* de intervalo fixo ou exponencial, por função |
| HTTP | ninguém | o chamador recebe o erro e decide |

A política só age em **exceção não tratada**: o erro que a função engole não é refeito. No Event Hubs, o *retry* do
*runtime* segura o *checkpoint*, e uma mensagem que nunca passa trava a partição. Ela precisa ir para um lugar de
erro, não para um *retry* infinito.

**Conexão por identidade.** O *binding* não precisa de *connection string* com chave: com
`ServiceBusConnection__fullyQualifiedNamespace` e a identidade da função, ele autentica pelo Entra ID. O storage
da própria função também aceita identidade, no lugar da chave da conta.

## Concorrência contra o banco

Mil eventos ao mesmo tempo viram até mil instâncias, cada uma com o seu *pool*. O controle no Azure é a **escala
máxima** (`maximum_instance_count`) combinada com o *pool* por instância: as duas multiplicadas cabem no que o banco
reserva para as funções, o número de `concorrencia-e-recursos/07`. O **PgBouncer** embutido do Postgres Flexible
Server (marco 07) segura o pico de conexões. A medição contra um Postgres real, com 200 instâncias e 100 conexões
recusadas sem limite, está em `aws-para-backend/06`.

## Durable Functions

O **Durable Functions** guarda o estado de um processo de várias etapas: o **orquestrador** chama **atividades**,
espera eventos e temporizadores, e compensa. É a saga de `arquitetura-eventos/09` com o estado gerenciado.

O ponto que cai em entrevista: o orquestrador é **reexecutado do início** (*replay*) a cada passo, com o histórico do
que já aconteceu. Por isso ele **precisa ser determinístico**. Conferido em 12 nov 2026, pela documentação:

- nada de relógio direto (`time.Now()`, `Instant.now()`): use o do contexto, que vem do histórico
  (`ctx.getCurrentInstant()` em Java);
- nada de aleatório nem de GUID direto: use o do contexto;
- nada de I/O no orquestrador: a chamada HTTP, o banco e a fila vão nas **atividades**;
- as atividades podem rodar mais de uma vez e precisam ser **idempotentes**.

**Durable × Logic Apps.** O Durable é código, testável e versionado com o serviço. O Logic Apps é um *workflow*
visual com centenas de conectores prontos, bom para integração com SaaS e para quem não é desenvolvedor. Para o
processo central de um ledger, o Durable.

## Quando não usar

- **Carga constante.** A instância sempre ocupada sai mais barata como contêiner (marco 04).
- **Latência apertada no *p99*.** O *cold start* aparece na cauda, a menos que haja instâncias *always ready*, que se
  pagam paradas.
- **Conexão longa.** *WebSocket* e consumo com estado não combinam com instância que some.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| Lambda | Functions | o plano de hospedagem decide escala, VNet e *cold start* |
| *event source mapping* | *trigger* | o *retry* é do serviço (Service Bus, Event Grid) ou do *runtime* (Event Hubs, Cosmos), conforme o *trigger* |
| *reserved concurrency* e concorrência máxima da fonte | `maximum_instance_count` e o *pool* por instância | o teto é da app, não de cada fonte |
| Step Functions | Durable Functions ou Logic Apps | o Durable é código com *replay*, e exige determinismo |
| SnapStart | instâncias *always ready* ou plano Premium | não há *snapshot*: há instância pré-aquecida, paga parada |
| RDS Proxy | PgBouncer embutido no Flexible Server | já vem no banco |

O marco gêmeo é `aws-para-backend/06`.

> **Armadilha.** Código não determinístico no orquestrador do Durable: `now()`, GUID, I/O direto. O *replay* toma
> outro caminho, e o processo para em um estado que ninguém consegue explicar, ou repete uma atividade que já
> rodou.

> **O que o laboratório não reproduz.** O *harness* local não reproduz o *cold start*, a escala real, os limites do
> plano de hospedagem nem o armazenamento do histórico do Durable. Ele prova o que é do seu código: idempotência,
> determinismo e o teto de conexões. O Functions Core Tools com o Azurite roda a função localmente, sem a escala.

## Exemplo numa fintech

O processamento do arquivo de liquidação D+1 virou um orquestrador do Durable com *fan-out* por lote. O primeiro
desenho pegava a data de corte com `time.Now()` no orquestrador. No *replay* depois da meia-noite, a data mudou, o
orquestrador chamou o fechamento do dia seguinte e duplicou a conciliação de um lote. A correção:

- a data veio do relógio do contexto, gravado no histórico;
- as atividades passaram a ser idempotentes pela chave do lote;
- a escala máxima da função passou a caber no que o banco aguenta.

## Hands-on

**Tutorial.** Escreva um *handler* puro em Go e outro em Java, sem chamada ao Azure na lógica, e teste-os com um
*harness* local que reentrega, embaralha e duplica eventos. O Functions Core Tools com o Azurite fica como opção.

**Desafio.** O processador do lote de liquidação, com orquestração, e as regras sobre o código em
`politicas/funcoes.rego`.

**Invariantes testáveis**

1. **N entregas, um efeito.** Medido: **204 entregas** embaralhadas e duplicadas de 100 eventos, em paralelo, deram
   **100 efeitos**.
2. **O orquestrador é determinístico.** O *harness* reexecuta o orquestrador com o mesmo histórico e compara a
   sequência de chamadas. Medido: com o relógio do contexto, a sequência se repetiu. Com `time.Now()` e aleatório
   direto, **0 de 20** *replays* repetiram a sequência, e o teste pegou.
3. **O banco aguenta.** Com 200 instâncias simuladas, o pico de conexões não passa do limite. Medido no *harness*:
   **200 sem limite, 20 com o limite de 20**.
4. **A escala cabe no banco.** `maximum_instance_count` × o *pool* por instância ≤ o que o banco reserva para as
   funções.
5. **Nenhuma chave no *binding*.** Nenhum *app setting* com `SharedAccessKey=` ou `AccountKey=`, e o storage da
   função por identidade.

Medido: o código bom passou nas 3 regras. A *fixture* ruim foi reprovada nas **3**:

- 100 instâncias × 4 conexões = 400, contra 40 reservadas;
- a *connection string* com chave do Service Bus;
- o storage da função por *connection string*.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, publique a função de lote no Flex
Consumption com 0 e com 1 instância *always ready*, e meça o tempo do primeiro evento depois de 15 minutos de ócio,
em 10 tentativas de cada. Destrua tudo no fim.

**Checagem**

1. Qual plano de hospedagem para uma função nova, e o que o *always ready* muda?
2. Quem refaz o evento que falhou em cada *trigger*?
3. Por que o orquestrador do Durable precisa ser determinístico, e o que pode e não pode estar nele?
4. Como a escala de uma função derruba um banco, e qual é o controle no Azure?

## Principais aprendizados

- As regras da AWS valem; muda a hospedagem, o *binding* e a orquestração.
- Flex Consumption como padrão: até 1.000 instâncias, de 512 a 4.096 MB, 30 min de *timeout* padrão, 0 *always
  ready* (nov 2026). O Consumption em Linux se aposenta em set 2028.
- Go nativo só no Flex, com o *status* GA × *preview* em disputa nas páginas oficiais.
- O *retry* é do serviço ou do *runtime*, conforme o *trigger*; a política só age em exceção não tratada.
- Durable: *replay* exige orquestrador determinístico e atividades idempotentes. Medido: `time.Now()` não repetiu em
  nenhum dos 20 *replays*.
- A escala máxima × o *pool* cabe no banco; o *binding* conecta por identidade.
