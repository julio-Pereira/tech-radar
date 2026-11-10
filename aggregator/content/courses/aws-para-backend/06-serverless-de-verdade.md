---
id: serverless-de-verdade
title: "Serverless de verdade"
summary: "Função é ótima para evento intermitente; o que derruba serverless em fintech é duplicidade, concorrência que esgota o banco e custo em carga constante. O modelo de execução, os limites (900 s, 10.240 MB, 6 MB síncrona e 1 MB assíncrona), a semântica de retry de cada tipo de invocação, partial batch response, concorrência reservada contra o banco (medido: 200 conexões diretas, 100 recusadas por too many clients; com limite de 20, nenhuma), SnapStart e a conta de quando não usar."
estimatedMinutes: 60
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [arquitetura, confiabilidade]
references:
  - title: "AWS Lambda — Quotas"
    url: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
  - title: "AWS Lambda — How Lambda handles errors and retries with asynchronous invocation"
    url: https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html
  - title: "AWS Lambda — Configuring scaling behavior for SQS event source mappings"
    url: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html
  - title: "AWS Lambda — Improving startup performance with SnapStart"
    url: https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html
---

## O modelo de execução

Uma função Lambda roda num **ambiente de execução**, uma micro-VM com o *runtime* da linguagem. O ciclo tem
duas fases:

- **`init`:** carrega o código, roda o que está fora do *handler* (abrir cliente do SDK, ler
  configuração). Acontece uma vez por ambiente.
- **`invoke`:** roda o *handler* para um evento. O mesmo ambiente atende muitos eventos em sequência,
  **um de cada vez**.

Um ambiente novo, criado para atender uma demanda, paga o `init` antes do primeiro evento. É o ***cold
start***. Ajudam:

- pacote menor e menos dependências;
- linguagem de inicialização rápida;
- o **SnapStart**, que restaura um *snapshot* do ambiente já inicializado. Cobre Java 11+, Python 3.12+ e
  .NET 8+ (e imagem de contêiner desde jul 2026). Para Java gerenciado, sem custo extra; para os demais,
  com cobrança de *cache* e de restauração;
- a ***provisioned concurrency***, que mantém ambientes prontos e é cobrada enquanto existem.

Os limites conferidos em 10 nov 2026:

- **900 s** de execução (15 min);
- de 128 MB a **10.240 MB** de memória, com a CPU proporcional;
- **6 MB** de carga na invocação síncrona e **1 MB** na assíncrona.

O Lambda Managed Instances vai até 90 min nas invocações assíncronas, e a síncrona continua em 15.

## Três jeitos de ser chamado, três semânticas de *retry*

| Invocação | Quem chama | Em caso de erro |
| --- | --- | --- |
| síncrona | API Gateway, ALB, SDK | **nenhum *retry* do Lambda**: o chamador recebe o erro e decide |
| assíncrona | S3, SNS, EventBridge | o Lambda tenta **mais duas vezes** (1 min depois, e 2 min depois da segunda). `MaximumRetryAttempts` vai de 0 a 2 e `MaximumEventAgeInSeconds` de 60 a 21.600. Esgotado, o evento vai para o destino de falha, se configurado, ou é **descartado** |
| *event source mapping* | SQS, Kinesis, DynamoDB Streams | o Lambda faz o *polling*. No SQS, o lote com erro volta pela visibilidade da fila até a DLQ; em *streams*, o lote é refeito e **bloqueia o *shard*** até passar ou expirar |

Em todos os três, o mesmo evento pode chegar mais de uma vez. **Idempotência não é opcional**: o efeito
de negócio precisa ser o mesmo com uma ou com cinco entregas, pela chave do evento num *inbox*
(`arquitetura-eventos/08`).

**Partial batch response.** Com SQS, a função recebe um lote. Sem configuração, uma mensagem com erro faz
o lote **inteiro** voltar, e as que deram certo são reprocessadas. Com `ReportBatchItemFailures` ligado, a
função devolve `{"batchItemFailures": [{"itemIdentifier": "<messageId>"}]}`, e só essas voltam. Para o
SQS, a documentação recomenda um *visibility timeout* de pelo menos **6 vezes** o *timeout* da função.

## Concorrência contra o banco

Cada ambiente atende um evento por vez, então mil eventos ao mesmo tempo viram até mil ambientes. A cota
padrão da conta é **1.000** execuções concorrentes. Um *event source mapping* de SQS pode escalar até
1.250 instâncias, a menos que se defina a **concorrência máxima** dele, de 2 a 1.000. Cada ambiente com a
própria conexão ao Postgres é o caminho mais curto para derrubar o banco.

Medido no laboratório (Postgres 17, `max_connections = 100`), com 200 "instâncias" abrindo conexão ao mesmo
tempo:

| Desenho | Conexões recusadas | Pico de conexões |
| --- | ---: | ---: |
| cada instância conecta direto | **100** (`FATAL: sorry, too many clients already`) | 100 |
| as 200 passam por um limite de 20 (*pool*/*proxy*) | 0 | 20 |

Na AWS, os controles são três:

- a **concorrência reservada** da função, que é também o teto dela;
- a **concorrência máxima** do *event source mapping*;
- o **RDS Proxy**, que mantém um *pool* de conexões entre as funções e o banco.

A documentação manda a concorrência reservada ser **pelo menos a soma** das concorrências máximas das
fontes SQS, ou o Lambda passa a estrangular mensagens. O número certo sai do dimensionamento de
`concorrencia-e-recursos/07`: quantas conexões o banco aguenta, menos as de quem mais usa.

## Processo longo e observabilidade

Uma cadeia de funções que se chamam umas às outras perde o estado no meio e soma os *timeouts*. Para um
processo com várias etapas, espera e compensação, o caminho é o **Step Functions**, a saga de
`arquitetura-eventos/09` com o estado gerenciado.

Observabilidade sem agente: o *log* vai para o CloudWatch, e o *trace* sai pelo OpenTelemetry (a camada do
ADOT ou o Application Signals, marco 09).

## Quando **não** usar

- **Carga constante.** A função cobra por invocação e por GB-segundo; o contêiner, por hora de vCPU e de
  memória. Para um serviço sempre ocupado, o contêiner costuma sair mais barato. A conta se faz com os
  preços do dia, na calculadora oficial, e não de memória.
- ***p99* apertado.** O *cold start* aparece na cauda, mesmo com SnapStart.
- **Conexão longa.** *WebSocket* de longa duração, *streaming* e consumo de Kafka com estado não combinam
  com um ambiente que pode sumir.

A conta de custo do desafio é uma planilha com a fórmula:

> função = invocações × preço por invocação + invocações × duração × memória × preço por GB-segundo
>
> contêiner = tarefas × horas × (vCPU × preço por vCPU-hora + memória × preço por GB-hora)

Ela mostra o volume em que as duas linhas se cruzam para a carga do `fin-platform`. O critério escrito
vira um *guardrail* do catálogo de padrões (`arquitetura-de-solucoes/05`): "função para evento
intermitente, contêiner para carga contínua", com a exceção registrada em ADR.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Functions (Consumption) | Lambda | um evento por ambiente, sempre; não há o modelo de várias execuções no mesmo processo |
| Functions Premium (instâncias pré-aquecidas) | *provisioned concurrency* ou SnapStart | o SnapStart restaura um *snapshot*; a *provisioned concurrency* paga ambientes parados |
| Durable Functions | Step Functions | o estado vive no serviço, com a máquina de estados declarada fora do código |
| Event Grid / Service Bus *trigger* | *event source mapping* ou invocação assíncrona | a semântica de *retry* depende do tipo de invocação |

> **O que o emulador não reproduz.** *Cold start* real, cotas de concorrência da conta e o
> estrangulamento. O *harness* local prova idempotência, *partial batch* e o limite de conexões, que são
> propriedades do seu código e do seu desenho. O `sam local invoke` roda o *handler* num contêiner parecido
> com o do Lambda, mas não mede a escala.

## Exemplo numa fintech

O processamento do arquivo de liquidação D+1 foi escrito como "uma função por linha": um evento do S3
disparava a quebra do arquivo, e cada linha virava uma mensagem consumida por uma função que gravava no
Postgres. No primeiro arquivo grande, o Lambda escalou para centenas de ambientes, cada um abriu a própria
conexão, e o banco recusou o resto com `too many clients`. As mensagens recusadas voltaram para a fila
e foram reprocessadas, algumas depois de já terem gravado, e o ledger ficou com lançamentos em dobro. A
correção:

- concorrência máxima no *event source mapping*, abaixo do que o banco aguenta;
- RDS Proxy entre as funções e o banco;
- *partial batch response*;
- um *inbox* pela chave da linha do arquivo.

## Hands-on

**Tutorial.** Escreva um *handler* puro (evento → efeito) em Go e outro em Java, sem nenhuma chamada à AWS
dentro da lógica. Teste-os com um *harness* local que reentrega, embaralha e duplica eventos. O
`sam local invoke` (SAM CLI 1.171.0) fica como opção.

**Desafio.** O processador do lote de liquidação.

**Invariantes testáveis**

1. **N entregas, um efeito.** Processar o mesmo evento N vezes, em ordem qualquer, produz um lançamento.
2. ***Partial batch*.** Num lote misto de 10 mensagens com 3 falhas, a resposta lista exatamente os 3
   `itemIdentifier`, e só eles são reprocessados.
3. **O banco aguenta.** Com 200 instâncias simuladas, as conexões ao Postgres nunca passam do limite: o
   *pool* (ou o *proxy* simulado) segura o pico, e nenhuma conexão é recusada.
4. **A concorrência reservada cabe no banco.** A política sobre o plano exige que a concorrência reservada
   da função, e a soma das concorrências máximas das fontes SQS, sejam ≤ o número vindo do
   dimensionamento de `concorrencia-e-recursos/07`.
5. **A conta de custo.** A planilha do `PROJETO.md`, com os preços do dia, mostra o volume em que a função
   passa a custar mais que o contêiner para a carga do `fin-platform`.

**Complemento.** Com uma conta real e orçamento criado antes, publique a função em Java com e sem
SnapStart, e meça o `Init Duration` no CloudWatch em 20 *cold starts* de cada. Destrua tudo no fim.

**Checagem**

1. O que acontece com um evento que falha em cada tipo de invocação?
2. Por que o *partial batch response* evita reprocessamento, e o que ele não evita?
3. Como a concorrência de uma função chega a derrubar um banco relacional, e quais são os três controles?
4. Em que tipo de carga uma função custa mais que um contêiner?

## Principais aprendizados

- Um evento por ambiente; o `init` é o *cold start*. SnapStart e *provisioned concurrency* atacam ele, com
  custo.
- Limites conferidos: 900 s, 10.240 MB, 6 MB síncrona e 1 MB assíncrona.
- Síncrona sem *retry*; assíncrona com duas tentativas e descarte; SQS pela visibilidade até a DLQ.
  Idempotência sempre.
- `ReportBatchItemFailures` devolve só o que falhou.
- Concorrência reservada, concorrência máxima da fonte e RDS Proxy. Medido: 200 diretas, 100 recusadas;
  com limite, nenhuma.
- Carga constante, *p99* apertado e conexão longa pedem contêiner. A conta se faz com o preço do dia.
