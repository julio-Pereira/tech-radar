---
id: orquestracao
title: "Orquestração"
summary: "O orquestrador coordena; a idempotência das tarefas é o que torna a coordenação segura. DAG, backfill com limite de paralelismo, e a decisão de não ter orquestrador."
estimatedMinutes: 60
references:
  - title: "Dagster — documentation"
    url: https://docs.dagster.io/
---

## O orquestrador coordena; não torna nada seguro sozinho

Um **DAG** (grafo acíclico dirigido) declara dependências entre tarefas: isto só roda depois
daquilo. O orquestrador decide **quando** e **em qual ordem** disparar cada tarefa, lida com
*retries*, *timeouts* e SLAs, e expõe o estado de cada execução. O que ele **não** faz sozinho:
tornar uma tarefa idempotente. Se a tarefa em si duplica dado quando reexecutada, o orquestrador
reexecutando-a com todo o cuidado do mundo só vai duplicar com pontualidade — a segurança vem da
tarefa (marco 01 e 06), a coordenação vem do orquestrador. Confundir os dois papéis é a origem do
antipadrão "eu uso Airflow, então meu pipeline é confiável", que não segue logicamente.

## Backfill, *catchup*, e o paralelismo que derruba a transmissora

**Backfill**: reprocessar um intervalo de datas passadas. **Catchup**: quando um DAG volta a
rodar depois de ficar pausado, o orquestrador pode disparar automaticamente uma execução para cada
intervalo perdido — útil, e perigoso sem controle: um backfill de 30 dias que dispara 30 execuções
simultâneas, cada uma chamando a API da mesma transmissora, estoura o limite de taxa que o marco 02
ensinou a respeitar, e pode efetivamente fazer um ataque de negação de serviço contra um parceiro.
**Limite de paralelismo** (um *pool* de execuções concorrentes, configurado explicitamente) é o que
impede isso — o mesmo princípio de orçamento de retry de `system-design/04`, aplicado a quantas
execuções do pipeline podem competir pelo mesmo recurso externo ao mesmo tempo.

## Tarefas idempotentes e *pools*: o orquestrador como camada fina

A tarefa idempotente é o que permite ao orquestrador fazer a coisa mais simples e mais poderosa que
ele faz: **reexecutar sem medo**. Uma tarefa que falha por timeout de rede (não por bug de lógica)
pode simplesmente ser tentada de novo — se for idempotente, a segunda tentativa não duplica o
trabalho da primeira que talvez tenha parcialmente terminado. *Pools* limitam quantas tarefas de um
tipo específico rodam ao mesmo tempo (por exemplo, "no máximo 3 chamadas simultâneas à mesma
transmissora", independentemente de quantos DAGs diferentes tentam chamá-la).

## Falha parcial e retomada

Um DAG com dez tarefas, das quais a sétima falha, não deveria exigir reprocessar as seis
anteriores — a retomada correta continua **a partir da tarefa que falhou**, não do início. Isso só
funciona se cada tarefa anterior já publicou seu resultado de forma durável (write-audit-publish,
marco 01) e a tarefa que falhou pode ser identificada e re-disparada isoladamente.

## Orquestração por evento × por tempo

**Por tempo**: o DAG dispara numa agenda (todo dia às 3h). **Por evento**: o DAG dispara quando
algo acontece (um arquivo novo chega, um consentimento muda de estado) — mais responsivo, exige um
mecanismo de detecção de evento (um sensor, ou um fluxo real como Kafka). A maioria dos pipelines
desta trilha funciona bem por tempo, com a cadência por consentimento do marco 02 sobreposta; eventos
entram quando a latência de detecção importa de verdade (marco 11).

## Segredos, identidades, custo, e a decisão de **não** ter orquestrador

Credenciais de transmissoras e chaves de acesso não vivem em variável de ambiente solta no código
do DAG — vivem num gerenciador de segredos, injetadas em tempo de execução
(`seguranca-aplicacao/10`). **Custo**: todo orquestrador tem overhead de infraestrutura própria
(scheduler, banco de metadados, workers) — para um punhado de pipelines simples, com poucas
dependências entre si, um orquestrador dedicado pode ser desproporcional ao problema, e um *runner*
simples (um script agendado com retomada e idempotência bem feitas) resolve com menos partes móveis.
A escolha entre as três ferramentas OSS citadas nesta trilha (Dagster, Airflow, Prefect) é
registrada em **ADR**, e o conteúdo ensinado aqui é independente de qual delas você usa — os
princípios (DAG, idempotência, backfill seguro, limite de paralelismo) valem para as três.

> **Reencontro — `kubernetes/07` e `concorrencia-e-recursos/05`.** O autoscaling por fila (KEDA)
> daquele marco é o mesmo problema de dimensionar workers por carga pendente, aplicado a
> orquestração de dados em vez de consumidor de fila de mensagens. E o dimensionamento de pool por
> `TPS × tempo de retenção` de `concorrencia-e-recursos/05` é a mesma conta para decidir quantas
> execuções concorrentes de tarefa o orquestrador deveria permitir.

## Exemplo numa fintech

Um backfill de 30 dias é disparado depois de corrigir um bug de modelagem. Sem limite de
paralelismo, as 30 execuções diárias disparam simultaneamente, cada uma chamando a mesma
transmissora — em minutos, o limite de taxa é estourado, a transmissora começa a devolver 429 para
**todo mundo** (inclusive o tráfego de produção normal, não relacionado ao backfill), e o que
deveria ser uma correção silenciosa vira um incidente visível.

## Hands-on

**Tutorial.** Construa um DAG de ingestão → bruto → prata → ouro com o orquestrador escolhido (via
ADR).

**Desafio.** Implemente backfill de 30 dias com limite de paralelismo configurado.

**Invariantes testáveis**

1. Um backfill de 30 dias é **idempotente**: rodá-lo duas vezes produz o mesmo resultado que
   rodá-lo uma vez.
2. Uma tarefa que falha duas vezes e passa na terceira tentativa **não duplica** nenhum dado,
   comparado a uma execução que teria passado de primeira.
3. O paralelismo de execuções concorrentes **nunca excede** o limite configurado, mesmo quando um
   backfill grande e a execução regular do dia competem pelo mesmo recurso.
4. Um SLA estourado (uma tarefa que deveria terminar em X minutos e não terminou) gera um alerta
   observável.

**Complemento.** Reescreva o mesmo DAG como um *runner* simples (sem orquestrador dedicado) e
compare a complexidade e o esforço de operação dos dois.

**Checagem**

1. Por que o orquestrador não torna uma tarefa segura sozinho — o que precisa vir da tarefa em si?
2. O que *catchup* sem limite de paralelismo pode causar contra uma API de terceiro?
3. Como a retomada correta de um DAG com falha parcial evita reprocessar tarefas que já
   terminaram?
4. Quando a decisão correta é **não** ter um orquestrador dedicado?

## Principais aprendizados

- O orquestrador coordena ordem e disparo; a segurança contra duplicação vem da idempotência da
  tarefa em si — os dois papéis são distintos, e confundi-los é o antipadrão mais comum.
- *Catchup* sem limite de paralelismo pode disparar dezenas de execuções simultâneas contra a
  mesma API externa, estourando o limite de taxa e afetando até o tráfego de produção normal.
- Retomada correta de falha parcial continua da tarefa que falhou, não do início — e só funciona
  se cada tarefa anterior já publicou seu resultado de forma durável.
- A escolha entre Dagster, Airflow e Prefect é uma decisão de ADR, não de conteúdo — os princípios
  de DAG, idempotência e limite de paralelismo valem para qualquer uma das três.
- Para poucos pipelines simples, um *runner* sem orquestrador dedicado pode resolver com menos
  partes móveis — não ter orquestrador é, às vezes, a decisão certa, não uma lacuna.
