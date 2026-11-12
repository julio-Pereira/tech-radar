---
id: observabilidade-com-azure-monitor
title: "Observabilidade com Azure Monitor"
summary: "O conceito é o da trilha de observabilidade; o que muda é onde o sinal nasce, quanto custa a ingestão e como ele sai em OTel. Métricas de plataforma de graça e por 93 dias, logs de recurso que só existem com diagnostic setting, os planos de tabela do Log Analytics, Application Insights só baseado em workspace, a Distro do OpenTelemetry e o OTLP em preview, o Activity Log de 90 dias — com sete regras sobre o código que pegaram, no laboratório, o SLO esquecido, a fila sem alerta de DLQ e o Activity Log sem exportação."
estimatedMinutes: 55
reviewedAt: 2026-11-12
reviewEvery: 6m
competencies: [confiabilidade, plataforma]
references:
  - title: "Azure Monitor — Metrics in Azure Monitor"
    url: https://learn.microsoft.com/azure/azure-monitor/metrics/data-platform-metrics
  - title: "Azure Monitor — Manage data retention in a Log Analytics workspace"
    url: https://learn.microsoft.com/azure/azure-monitor/logs/data-retention-configure
  - title: "Azure Monitor — Activity log"
    url: https://learn.microsoft.com/azure/azure-monitor/platform/activity-log
  - title: "Application Insights — OpenTelemetry observability overview"
    url: https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry
---

## O mesmo conceito, outro lugar

Métrica, *log*, *trace*, SLI, SLO e *burn rate* são os de `observabilidade/12`. No Azure mudam três coisas:

- **onde o sinal nasce:** a idade da fila, o 429 do Cosmos e a falha de autenticação no Key Vault vêm do
  serviço gerenciado, não do seu código;
- **o que existe sem você pedir:** a métrica de plataforma vem de graça, o *log* do recurso não vem;
- **como sai para o OpenTelemetry:** o caminho é a Distro da Microsoft, com o OTLP direto ainda em
  *preview*.

## Métricas de plataforma: de graça, e por pouco tempo

Conferido em 12 nov 2026: as **métricas de plataforma** são coletadas automaticamente para todo recurso, sem
configuração, e ficam guardadas por **93 dias**. Um gráfico do Metrics Explorer mostra no máximo 30 dias de
cada vez. Para guardar mais, ou cruzar com *log*, a métrica vai para o Log Analytics por *diagnostic
setting*.

A métrica tem **dimensões**: o `EntityName` do Service Bus diz qual fila, o `StatusCode` do Cosmos diz qual
resposta. O alerta de métrica filtra por dimensão. O critério de cardinalidade é o de
`observabilidade/16`: a dimensão é de baixa cardinalidade; o cliente individual vai para o *log* ou para o
*trace*.

## *Logs* de recurso: nada sem *diagnostic setting*

Este é o ponto que mais surpreende quem vem da AWS. Conferido em 12 nov 2026: os ***resource logs*** **não
são coletados por padrão**. O *log* de auditoria do Key Vault, o *log* de consulta do Postgres e o de
operação do Service Bus só existem depois de um ***diagnostic setting***, que diz quais categorias vão para
qual destino (Log Analytics, Storage ou Event Hubs). E ele só leva o que acontece **depois** de criado: o
incidente de ontem, sem *diagnostic setting*, não tem *log*.

Por isso o *diagnostic setting* vai no código, junto com o recurso, ou numa política `deployIfNotExists`
(marco 01) que o cria quando falta. Os ***category groups*** `allLogs` e `audit` evitam listar categoria por
categoria.

## Log Analytics: o *workspace*, a tabela e o plano

O **Log Analytics** guarda os *logs* em tabelas dentro de um ***workspace***, consultadas em KQL. Conferido em
12 nov 2026, cada tabela tem um **plano**:

| Plano | Para | Retenção interativa | Consulta |
| --- | --- | --- | --- |
| **Analytics** | o que se consulta e alerta todo dia | 30 dias por padrão, até 2 anos | incluída no preço da ingestão |
| **Basic** | depuração, volume alto, consulta rara | 30 dias, fixos | cobrada pelo volume lido |
| **Auxiliary** | auditoria e conformidade, volume muito alto | 30 dias, fixos | cobrada pelo volume lido |

Acima da retenção interativa vem a **retenção longa**: o total chega a **12 anos** em qualquer plano. A
ingestão em Analytics inclui 31 dias de retenção. As tabelas `AzureActivity` e `Usage` guardam 90 dias sem
custo.

Duas consequências para o desenho:

- **o padrão não é "para sempre"**, ao contrário dos grupos de *log* da AWS (marco gêmeo). O risco aqui é o
  inverso: apagar a auditoria cedo demais. A retenção da auditoria vem da política da instituição, por
  tabela;
- **o custo está na ingestão.** O *workspace* cobra por GB ingerido, e a retenção além do incluído soma por
  GB-mês. O marco 11 mede o efeito de passar de 30 para 365 dias.

O desenho comum é um **workspace central** por ambiente, com o acesso por recurso (*resource-context*): o time
do `pix-gateway` lê os *logs* dos recursos dele, não os do ledger.

## Application Insights e OpenTelemetry

O **Application Insights** é a parte de APM: requisições, dependências, exceções e *traces* distribuídos.
Conferido em 12 nov 2026:

- o **modelo clássico acabou**: a ingestão nos recursos clássicos parou em **15 jun 2025**. Todo
  Application Insights é **baseado em *workspace***, e os dados ficam em tabelas do Log Analytics
  (`AppRequests`, `AppDependencies`);
- a instrumentação recomendada é a **Azure Monitor OpenTelemetry Distro**. Em Java, ela é o agente
  (`applicationinsights-agent` 3.x), que instrumenta sem mudar código. O agente Java **não exporta OTLP**: ele
  manda para o Application Insights;
- a **ingestão OTLP** direta no Azure Monitor existe, mas parte dela está em ***preview***: pelo agente do
  Azure Monitor e no AKS, sim; pela Distro e pelo OpenTelemetry Collector, as páginas a dão como GA. Sem SLA,
  o que está em *preview* não vai para o caminho de pagamento.

A consequência é a mesma do marco gêmeo: **instrumente com OTel e escolha o destino no Collector**
(`observabilidade/05`). O Go do `ledger-core` usa o SDK do OTel e exporta por OTLP para o Collector, que manda
para o Azure Monitor e para o Tempo. O envio duplo já foi medido em `observabilidade/05`: com os dois destinos
no ar, 200 de 200 `trace_id` chegaram aos dois.

A ingestão do Application Insights também aceita **autenticação pelo Entra ID**, no lugar da chave na
*connection string*. Com a autenticação local desligada, uma *connection string* vazada não injeta telemetria
falsa.

## Activity Log não é telemetria

O **Activity Log** registra as operações do plano de controle: quem criou a atribuição de papel, quem apagou o
*lock*, quem mudou a regra de rede. Ele não registra o que a aplicação fez com o pagamento. Conferido em 12 nov
2026: o Azure guarda o Activity Log por **90 dias** e depois apaga. É o único lugar que registra quem criou um
recurso.

Para servir de auditoria, ele precisa de um *diagnostic setting* **na assinatura**, para o *workspace*
central, com a tabela `AzureActivity` na retenção da política. O *log* de acesso ao Key Vault (`AZKVAuditLogs`)
completa: o Activity Log diz quem mudou o cofre; o *log* do recurso diz quem leu a chave.

## Os alertas que só o Azure tem

| Sinal | Serviço | O que ele diz antes do cliente |
| --- | --- | --- |
| `DeadletteredMessages` com `EntityName` | Service Bus | alguma mensagem desistiu; acima de zero é incidente |
| `ActiveMessages` crescendo sem consumo | Service Bus | o consumidor parou |
| `TotalRequests` com `StatusCode` = 429 | Cosmos DB | a partição quente do marco 07 |
| `NormalizedRUConsumption` | Cosmos DB | a partição mais ocupada perto de 100% |
| falhas de autenticação nos *logs* de auditoria | Key Vault | uma identidade tentando o que não pode (marco 02) |

Dois cuidados, conferidos em 12 nov 2026:

- as contagens do Service Bus são **valores pontuais**. Um alerta "DLQ acima de zero" dispara uma vez e não
  avisa de cada mensagem nova; o reprocessamento esvazia a DLQ, e o alerta resolve;
- o SDK do Cosmos **refaz o 429** sozinho. A documentação considera saudável algo entre 1% e 5% de 429 com a
  latência aceitável; o alerta é sobre a taxa e a latência, não sobre o primeiro 429.

O alerta do SLO é uma ***log search alert*** sobre o Application Insights (a taxa de erro e o *p99*), e os
alertas de operação são **alertas de métrica**. Todos mandam para um ***action group***, o plantão.

## Na AWS → no Azure

| Na AWS | No Azure | O que muda de verdade |
| --- | --- | --- |
| CloudWatch Metrics | métricas de plataforma do Azure Monitor | de graça e automáticas, guardadas por 93 dias |
| CloudWatch Logs | Log Analytics | o *log* do recurso só existe com *diagnostic setting*; retenção de 30 dias por padrão, não "para sempre" |
| classes Standard e Infrequent Access | planos Analytics, Basic e Auxiliary | o plano é por tabela, e a consulta do Basic e do Auxiliary é cobrada |
| X-Ray e Application Signals | Application Insights | só baseado em *workspace*; o agente Java não exporta OTLP |
| ADOT | Azure Monitor OpenTelemetry Distro | parte da ingestão OTLP direta está em *preview* |
| CloudTrail | Activity Log + *diagnostic setting* | o Azure guarda 90 dias; a exportação é sua |

O marco gêmeo é `aws-para-backend/09`.

> **Armadilha.** Achar que o recurso já manda *log* porque o portal mostra métricas. A métrica é automática;
> o *log* de auditoria do Key Vault, não. Sem o *diagnostic setting*, a pergunta "quem leu esta chave?" não
> tem resposta, nem para o incidente de ontem.

> **O que o laboratório não reproduz.** Não há emulador do Azure Monitor. A prova é sobre o **código**: os
> alertas existem, apontam para a métrica e a dimensão certas, e todo recurso com dado manda *log* para o
> *workspace* central. A paridade de `trace_id` vem do Collector local. Se o alerta dispara no limiar certo,
> e em quanto tempo, só uma assinatura real mostra.

## Exemplo numa fintech

Numa auditoria, o regulador pediu a lista de identidades que leram a chave de cifra do ledger nos últimos
seis meses. O Key Vault estava certo: RBAC, *purge protection*, chave do cliente (marco 08). Mas o cofre não
tinha *diagnostic setting*, e o Activity Log, que só guarda 90 dias, registra quem mudou o cofre, não quem
leu a chave. A resposta foi "não sabemos". A correção:

- o *diagnostic setting* com o grupo `audit` entrou no módulo do cofre, e uma política `deployIfNotExists`
  passou a criá-lo em todo cofre novo;
- a tabela `AZKVAuditLogs` ganhou a retenção total da política de auditoria;
- uma regra sobre o código passou a reprovar o recurso com dado sem *diagnostic setting*.

## Hands-on

**Tutorial.** Suba o Collector do `lab/` com dois exportadores, um para o Tempo e um *debug*, e instrumente o
`ledger-core` (Go) com o SDK do OTel, exportando por OTLP. No Java, rode o `pix-gateway` com a Distro (o agente
3.x) em modo local. Escreva no Terraform do módulo `observabilidade` o *workspace* central, o Application
Insights, as tabelas de auditoria e os *diagnostic settings*.

**Desafio.** Os alertas do `fin-azure`, gerados a partir dos SLOs do `fin-watch` e provados sobre o código. Os
SLOs vêm de um arquivo de dados, e as regras ficam em `politicas/observabilidade.rego`.

**Invariantes testáveis**

1. **Todo SLO tem alerta.** Para cada SLO do `fin-watch`, existe um alerta com a *tag* `slo` igual ao nome
   dele.
2. **Todo recurso com dado manda *log*.** Postgres, Cosmos, Service Bus, Key Vault e Storage têm um
   *diagnostic setting* para o *workspace* central. Medido: a mutação que mandava o Postgres para um
   *workspace* do time foi reprovada, junto com o *workspace* sem retenção explícita.
3. **Fila e conta vigiadas.** Toda fila do Service Bus tem um alerta de `DeadletteredMessages` com o
   `EntityName` dela, e toda conta do Cosmos tem um alerta de `TotalRequests` com `StatusCode` 429. Medido: o
   alerta com a dimensão apontando para a fila errada foi reprovado.
4. **Auditoria pelo prazo da política.** O *workspace* tem retenção explícita, e as tabelas `AzureActivity` e
   `AZKVAuditLogs` têm a retenção total da política (no laboratório, 1.825 dias).
5. **Activity Log exportado.** Existe um *diagnostic setting* na assinatura para o *workspace* central.
6. **Telemetria sem chave.** O Application Insights é baseado em *workspace* e tem a autenticação local
   desligada.
7. **Paridade de `trace_id`.** O Collector local exporta o mesmo *trace* para os dois destinos, e o *script* de
   `observabilidade/05` confere cada `trace_id` nos dois.

Medido: o código bom passou nas 9 regras. A *fixture* ruim foi reprovada em **7 achados**:

- o SLO `ledger-lancamento-disponibilidade` sem alerta;
- o Key Vault sem *diagnostic setting*;
- a fila `liquidacao` sem alerta de DLQ;
- o Cosmos sem alerta de 429;
- a tabela de auditoria do Key Vault com 365 dias;
- o Activity Log sem exportação;
- o Application Insights aceitando ingestão por chave.

**Complemento.** Com uma assinatura real e *budget* com alerta criados antes, aplique a fila, o alerta de DLQ e
o *action group*, mande uma mensagem que falha até a DLQ e meça quanto tempo leva entre a mensagem na DLQ e o
alerta disparado. Destrua tudo no fim.

**Checagem**

1. Por que o recurso mostra métricas no portal e mesmo assim não tem *log* de auditoria?
2. Qual a diferença entre os planos Analytics, Basic e Auxiliary, e onde cada um serve?
3. O que o Activity Log responde, o que ele não responde, e por quanto tempo o Azure o guarda?
4. Por que o alerta de 429 do Cosmos é sobre a taxa, e não sobre o primeiro 429?

## Principais aprendizados

- O conceito é o da trilha `observabilidade`; no Azure, o sinal mais útil muitas vezes nasce no serviço
  gerenciado.
- Métricas de plataforma automáticas, por 93 dias. *Logs* de recurso só com *diagnostic setting*, e só dali
  em diante.
- Log Analytics: planos por tabela, 30 dias interativos por padrão, até 12 anos no total (nov 2026).
- Application Insights só baseado em *workspace* desde jun 2025; instrumente com a Distro do OTel e escolha o
  destino no Collector.
- Activity Log por 90 dias; a exportação na assinatura é sua.
- DLQ por `EntityName`, 429 por `StatusCode`, SLO como *log search alert*, provados sobre o código.
