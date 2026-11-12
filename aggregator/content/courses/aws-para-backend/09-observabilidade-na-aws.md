---
id: observabilidade-na-aws
title: "Observabilidade na AWS"
summary: "O conceito é o mesmo da trilha de observabilidade; o que muda é onde o sinal nasce, quanto custa e como ele sai para o OTel. CloudWatch Metrics e o custo de cada combinação de dimensões, Logs com retenção que por padrão é para sempre, alarmes compostos, X-Ray em transição para OpenTelemetry (SDK em manutenção desde fev 2026), ADOT, CloudTrail como auditoria, e as métricas que só a AWS tem — com a política sobre o plano que achou, no laboratório, um SLO sem alarme."
estimatedMinutes: 55
reviewedAt: 2026-11-10
reviewEvery: 6m
competencies: [confiabilidade, plataforma]
references:
  - title: "AWS X-Ray — X-Ray SDK and daemon end of support timeline"
    url: https://docs.aws.amazon.com/xray/latest/devguide/xray-daemon-eos.html
  - title: "Amazon CloudWatch — OpenTelemetry"
    url: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OpenTelemetry-Sections.html
  - title: "Amazon CloudWatch Logs — Log classes"
    url: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatch_Logs_Log_Classes.html
  - title: "Amazon CloudWatch Pricing"
    url: https://aws.amazon.com/cloudwatch/pricing/
---

## O mesmo conceito, outro lugar

Métrica, *log*, *trace*, SLI, SLO e *burn rate* são os de `observabilidade/12`. Na AWS mudam três coisas:

- **onde o sinal nasce:** boa parte das métricas que importam não vem do seu código, vem do serviço
  gerenciado (a idade da mensagem na fila, o estrangulamento da tabela);
- **quanto custa:** cada métrica, cada GB de *log* e cada alarme têm preço, e o padrão de retenção é
  guardar para sempre;
- **como sai para o OpenTelemetry:** o caminho próprio da AWS (X-Ray SDK e *daemon*) está em
  transição para o OTel.

## CloudWatch Metrics: dimensão é custo

Uma métrica do CloudWatch é identificada por **namespace, nome e dimensões**. Cada combinação diferente de
valores de dimensão é **uma métrica separada**, cobrada separadamente. Uma dimensão `cliente_id` numa
métrica de pagamento cria uma métrica por cliente: é a explosão de cardinalidade de
`observabilidade/16`, agora com fatura.

O critério é o mesmo: dimensão de baixa cardinalidade (serviço, operação, resultado); o que identifica o
caso individual vai para o *log* ou para o *trace*. O **Embedded Metric Format** grava a métrica dentro de um
*log* estruturado, e o CloudWatch a extrai: um caminho só, sem chamada `PutMetricData` no meio do
pagamento.

Os **alarmes** avaliam uma métrica contra um limiar por N períodos. O **alarme composto** combina outros
alarmes por regra (`ALARM(a) AND ALARM(b)`) e é o que vai para o plantão: o sintoma para o cliente, com as
causas prováveis como alarmes filhos que não acordam ninguém. É a disciplina de alerta por sintoma de
`observabilidade/12`.

## CloudWatch Logs: a retenção que ninguém configurou

Um grupo de *log* criado sem configuração **guarda para sempre**. É o caminho mais comum para uma conta de
*log* que só cresce. Conferido em 10 nov 2026:

- a retenção é por grupo, de 1 dia a 10 anos, ou para sempre;
- há duas classes. A **Standard** tem ingestão de US$ 0,50 por GB, e a **Infrequent Access**, de US$ 0,25
  (us-east-1, primeiros 10 TB do mês). O armazenamento custa o mesmo nas duas. A Infrequent Access não
  tem *metric filters* nem Container Insights, e trocar a classe exige recriar o grupo.

A conta do marco 11 mostra o efeito: no modelo do `fin-aws`, os *logs* custaram mais que o NAT.

O **Logs Insights** consulta os grupos com uma linguagem própria. Os ***metric filters*** transformam um
padrão de *log* em métrica (por exemplo, `"status":"RECUSADO"` vira um contador). O *log* da aplicação é
estruturado e correlacionado pelo `trace_id` (`observabilidade/06`).

## *Traces*: do X-Ray ao OpenTelemetry

Conferido em 10 nov 2026: os **SDKs e o *daemon* do X-Ray** entraram em **modo de manutenção em 25 fev
2026**, só com correção de segurança, e o **fim do suporte é em 25 fev 2027**. O X-Ray continua
recebendo *traces* deles. O padrão de instrumentação passou a ser o **OpenTelemetry**:

- o **ADOT** (AWS Distro for OpenTelemetry) é a distribuição da AWS: SDKs e Collector com os
  componentes da AWS;
- o X-Ray recebe *traces* por **OTLP** num *endpoint* próprio, com assinatura SigV4, desde nov 2024. Isso
  alimenta o **Application Signals**, os painéis de serviço do CloudWatch;
- o CloudWatch recebe **métricas OTel** por OTLP, consultáveis em PromQL, anunciadas em jun 2026.

A consequência para o desenho: **instrumente com OTel e escolha o destino no Collector**
(`observabilidade/05`). O mesmo *trace* pode ir para o X-Ray e para o Tempo, ou para outro *backend*, ao
mesmo tempo. É o envio duplo de uma migração, já medido em `observabilidade/05`: com os dois destinos no
ar, 200 de 200 `trace_id` chegaram aos dois.

Um cuidado: o ADOT com Application Signals ligado e um Collector que também exporta para o X-Ray podem
mandar o mesmo dado duas vezes, e você paga duas vezes. O Collector e o *pipeline* seguem
`observabilidade/06`; no EKS, a coleta segue `kubernetes/12`.

## CloudTrail não é telemetria

O **CloudTrail** registra **chamadas de API à AWS**: quem criou o papel, quem apagou o *bucket*, quem
chamou `Decrypt` (marco 08). Não registra o que a aplicação fez com o pagamento. Ele responde "quem mexeu
na conta", e os *logs* da aplicação respondem "o que aconteceu com a transação".

Para servir de auditoria, a trilha precisa de quatro coisas:

- **multirregião**, e de **organização**: todas as contas e todas as regiões, inclusive a que ninguém
  usa, que é onde um atacante cria recursos;
- gravação numa **conta de *log* separada**, onde quem administra a produção não apaga nada;
- um *bucket* com **Object Lock** (marco 08);
- a **validação de integridade** dos arquivos ligada.

## As métricas que só a AWS tem

| Métrica | Serviço | O que ela diz antes do cliente |
| --- | --- | --- |
| `ApproximateAgeOfOldestMessage` | SQS | o consumidor parou ou não dá conta; a fila de liquidação está atrasando |
| `ApproximateNumberOfMessagesVisible` na DLQ | SQS | alguma mensagem desistiu; qualquer valor acima de zero é incidente |
| `ThrottledRequests` | DynamoDB | a partição quente do marco 07 |
| `Throttles` | Lambda | a concorrência reservada do marco 06 chegou ao teto |
| `DatabaseConnections` | RDS | o *pool* das funções está esgotando o banco |

A **idade da mensagem mais antiga** é o alarme mais subestimado. O número de mensagens na fila oscila com o
volume. A idade só sobe quando o processamento parou, e ela é o atraso que o cliente vê.

## No Azure → na AWS

| No Azure | Na AWS | O que muda de verdade |
| --- | --- | --- |
| Azure Monitor Metrics | CloudWatch Metrics | cada combinação de dimensões é uma métrica cobrada |
| Log Analytics (KQL) | CloudWatch Logs + Logs Insights | retenção por grupo, para sempre por padrão; duas classes de ingestão |
| Application Insights | Application Signals + X-Ray | o caminho recomendado é OTel; o SDK do X-Ray está em manutenção |
| Azure Activity Log | CloudTrail | na AWS, a trilha de organização para uma conta de *log* separada é configuração sua |
| Azure Monitor OpenTelemetry Distro | ADOT | as duas são distribuições do OTel com os componentes da nuvem |

O marco gêmeo no Azure é `azure-para-backend/09`.

> **O que o laboratório não reproduz.** Não há emulador do CloudWatch que valha: o `moto` aceita a criação
> de alarmes, mas não avalia métrica nem dispara alarme. Neste marco, a prova é sobre o **plano** (os
> alarmes existem, apontam para a métrica certa e têm destino) e sobre o **Collector local** (o *trace*
> chega aos dois destinos). Se o alarme dispara no limiar certo, só uma conta real mostra.

## Exemplo numa fintech

O consumidor da fila de liquidação D+1 travou num *deadlock* e parou de apagar mensagens. O painel mostrava a
fila com "apenas" 4 mil mensagens, abaixo do alarme de volume, que era de 10 mil. Ninguém foi acionado.
Seis horas depois, a conciliação da manhã achou o buraco: os lançamentos da madrugada não estavam no
ledger. A **idade da mensagem mais antiga** tinha passado de 20 mil segundos e não tinha alarme. A
correção:

- alarme por idade em toda fila, com o limiar vindo do SLO de atraso da liquidação;
- alarme de qualquer mensagem na DLQ;
- uma regra sobre o plano que reprova a fila sem os dois.

## Hands-on

**Tutorial.** Suba o Collector do `lab/` com dois exportadores, um para o Tempo e um *debug*, e
instrumente o `ledger-core` (Go) com o SDK do OTel, exportando por OTLP. Escreva no Terraform do módulo
`observabilidade` uma fila, a DLQ dela, uma tabela, uma função, dois grupos de *log* e uma trilha do
CloudTrail.

**Desafio.** Os alarmes do `fin-aws`, gerados a partir dos SLOs do `fin-watch` e provados sobre o plano. Os
SLOs vêm de um arquivo de dados (`slos.json`), e as regras ficam em `politicas/operacao.rego`.

**Invariantes testáveis**

1. **Todo SLO tem alarme.** Para cada SLO do `fin-watch`, existe um alarme com a *tag* `slo` igual ao
   nome dele. Medido: a primeira versão do plano do laboratório, que parecia completa, foi reprovada com
   `SLO ledger-lancamento-disponibilidade sem alarme`; o SLO do ledger tinha sido esquecido.
2. **Fila, tabela e função vigiadas.** Toda fila tem alarme de `ApproximateAgeOfOldestMessage`, toda DLQ
   tem alarme de mensagem visível, toda tabela tem alarme de estrangulamento e toda função tem alarme de
   `Throttles`, cada um com a dimensão apontando para o recurso certo.
3. **Nenhum *log* para sempre.** Todo grupo de *log* tem retenção definida. Medido: a mutação sem os
   alarmes de operação e com um grupo sem retenção foi reprovada em 5 regras (as 3 filas, a tabela e o
   grupo).
4. **Trilha de auditoria.** Existe uma trilha do CloudTrail multirregião, com validação de arquivo,
   gravando num *bucket* da conta de *log*. Medido: a mutação com a trilha de uma região só foi reprovada.
5. **Paridade de `trace_id`.** O Collector local exporta o mesmo *trace* para os dois destinos, e o
   *script* de `observabilidade/05` confere cada `trace_id` nos dois.

**Complemento.** Com uma conta real e orçamento criado antes, aplique a fila e o alarme de idade, pare o
consumidor e meça quanto tempo leva entre a mensagem parada e o alarme em `ALARM`. Destrua tudo no fim.

**Checagem**

1. Qual a diferença entre o CloudTrail e os *logs* da aplicação, e qual responde a uma auditoria de acesso?
2. Por que uma dimensão `cliente_id` numa métrica do CloudWatch é um problema de custo?
3. O que muda no desenho de *tracing* com o SDK do X-Ray em manutenção?
4. Por que o alarme da fila é por idade da mensagem mais antiga, e não por número de mensagens?

## Principais aprendizados

- O conceito é o da trilha `observabilidade`; na AWS, o sinal mais útil muitas vezes nasce no serviço
  gerenciado.
- Cada combinação de dimensões é uma métrica cobrada. O caso individual vai para *log* ou *trace*.
- *Log* sem retenção é para sempre. Duas classes de ingestão: US$ 0,50 e US$ 0,25 por GB (nov 2026).
- SDK e *daemon* do X-Ray em manutenção desde fev 2026, com fim em fev 2027. Instrumente com OTel e
  escolha o destino no Collector.
- CloudTrail é auditoria de API: de organização, multirregião, numa conta de *log* separada, com
  Object Lock.
- Alarme por idade da mensagem mais antiga, DLQ acima de zero e *throttles*, provados sobre o plano.
