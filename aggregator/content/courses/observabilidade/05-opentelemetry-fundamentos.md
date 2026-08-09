---
id: opentelemetry
title: "OpenTelemetry: fundamentos"
summary: "O padrão que separa instrumentação de fornecedor: API, SDK, OTLP, semantic conventions e a propagação de contexto que faz a correlação existir."
estimatedMinutes: 45
references:
  - title: "OpenTelemetry — Documentation"
    url: https://opentelemetry.io/docs/
  - title: "OpenTelemetry — Semantic Conventions"
    url: https://opentelemetry.io/docs/concepts/semantic-conventions/
  - title: "W3C — Trace Context"
    url: https://www.w3.org/TR/trace-context/
---

## O problema que ele resolve

Antes do OpenTelemetry, instrumentar era escolher um fornecedor. O agente proprietário
entrava no código, e trocar de ferramenta significava reinstrumentar tudo — o que na
prática significa **nunca trocar**. A telemetria era refém.

O OTel quebra isso separando **quem produz** o dado de **quem o consome**: a
instrumentação é padrão e vive no seu código; o destino é configuração. Trocar Jaeger por
Tempo, ou um SaaS por outro, vira mudar um exporter.

Ele **graduou na CNCF em maio de 2026** — traces, métricas e logs em GA, **profiles em
alpha** desde março de 2026. Isso importa para a decisão: os três primeiros são apostas
seguras; profiles ainda muda (marco 11).

Aqui é onde o marco 04 volta como especificação: aqueles quatro sinais com modelos de
dado diferentes agora têm um formato, um protocolo e uma semântica comuns.

## As camadas, e por que a separação importa

- **API** — o que o **seu código** chama (`tracer.startSpan()`, `counter.add()`). É
  estável e não faz nada sozinha: sem SDK configurado, ela é *no-op*.
- **SDK** — a implementação: amostragem, processamento em lote, exportação.
- **OTLP** — o protocolo (gRPC ou HTTP/protobuf) que leva o dado adiante.
- **Collector** — o processo intermediário que recebe, transforma e reexporta (marco 06).

A separação API/SDK não é academicismo: é o que permite **uma biblioteca** ser
instrumentada com a API do OTel sem impor SDK nenhum a quem a usa. Se a aplicação não
configurar um SDK, a instrumentação da biblioteca custa quase zero. É a razão de ser
seguro instrumentar código compartilhado.

## Semantic conventions: o que faz a correlação ser possível

Um span chamado `http-request` com o atributo `url` não conversa com um span chamado
`HTTP GET` com atributo `http.target`. Sem nomes acordados, o dado de dois serviços não é
comparável, e o dashboard genérico não existe.

As **semantic conventions** padronizam nomes: `http.request.method`,
`http.response.status_code`, `server.address`, `db.system`, `messaging.system`,
`messaging.destination.name`. Aborrecido e é o que torna possível um painel de RED
(marco 03) que serve para qualquer serviço, e uma consulta que atravessa Java e Go sem
tradução.

Elas se estabilizaram por domínio em ritmos diferentes — HTTP e banco estão estáveis,
outros ainda evoluem. O conselho prático: **use a convenção onde ela existe**, e crie
atributos próprios com prefixo da empresa (`fin.psp`, `fin.payment.method`) onde não
existe. Nunca invente um nome que colida com o namespace padrão.

### Resource attributes

Diferentes dos atributos de span: descrevem **quem emitiu**, não o que aconteceu.
`service.name`, `service.version`, `deployment.environment.name`, `k8s.pod.name`,
`k8s.namespace.name`. São anexados a **todo** sinal daquele processo.

`service.name` é o único obrigatório de fato — sem ele, seu serviço aparece como
`unknown_service` e nada mais funciona direito. E `service.version` é o que permite
responder "esse erro começou na versão nova?" sem adivinhar, que é a pergunta mais útil
de qualquer incidente pós-deploy.

## Context propagation

Esta é a peça central, e a que mais gente usa sem entender.

Um trace atravessa processos porque o **contexto** viaja junto com a requisição. O padrão
é o **W3C Trace Context**, um header:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^  ^                                ^                ^
          versão trace-id (16 bytes)        span-id pai        flags (amostrado?)
```

O `trace-id` é o mesmo do começo ao fim; cada serviço cria spans filhos com o `span-id`
do pai. É isso que transforma eventos soltos numa árvore causal.

Dois pontos que decidem se funciona:

- **O contexto precisa atravessar limites que não são HTTP.** Em Kafka, ele vai nos
  **headers da mensagem** — e aí o trace liga o producer ao consumidor que rodou 3 minutos
  depois (marco 10). Se você não propaga, o consumidor abre um trace novo e a cadeia se
  parte exatamente no ponto mais difícil de investigar.
- **Trocas de thread quebram a propagação** se o contexto não for carregado
  explicitamente. Executor, `CompletableFuture`, goroutine — em Go o `context.Context`
  precisa ser passado adiante (o que a trilha `go-fintech` já cobra por outros motivos);
  em Java, o contexto é *thread-local* e precisa ser propagado no executor. É a causa nº 1
  de trace que "some no meio".

**Baggage** é o irmão menos conhecido: um header de pares chave-valor que viaja junto e
pode ser lido por qualquer serviço da cadeia — útil para carregar `tenant_id` ou
`canal` adiante. E é um risco: baggage vira atributo em todo lugar, o que significa
cardinalidade em todo lugar (marco 04) e, se você puser PII ali, PII em toda a telemetria
(marco 17). Nunca ponha dado sensível em baggage.

## Auto vs manual

**Automática** — um agente ou biblioteca instrumenta os frameworks conhecidos sem mudar
código: em Java, o `opentelemetry-javaagent.jar` cobre Spring, JDBC, Kafka client, HTTP
client; em Go, não existe agente equivalente (a linguagem é compilada estaticamente), então
usa-se instrumentação por biblioteca (`otelhttp`, `otelgrpc`) — mais explícita, e é o
custo real de ser poliglota.

Auto entrega, em minutos, o esqueleto: spans de entrada e saída, latência, erros. É de
onde começar, sempre.

**Manual** — você adiciona o que só o seu domínio sabe: um span em torno da decisão de
antifraude, o atributo `fin.psp` no span de pagamento, o contador de TPV.

A regra prática: **auto para o transporte, manual para o negócio.** O que a auto dá é a
cadeia; o que ela nunca dá é o *porquê* — e o `fin.psp` no span é a diferença entre "a
latência subiu" e "a latência subiu no Itaú".

Cuidado com o excesso: um span por método produz traces de 400 spans que ninguém lê e um
custo que ninguém previu. Span é para **unidade de trabalho significativa** — uma chamada
externa, uma consulta, uma decisão.

## Exemplo numa fintech

No `fin-platform`, o mínimo que faz diferença:

- Auto-instrumentação no `pix-gateway` (Java) e `otelhttp`/`otelgrpc` no `ledger-core`
  (Go), com `service.name` e `service.version` corretos.
- Propagação nos **headers do Kafka**, para o trace atravessar o `pix-stream` — sem isso o
  sistema tem dois traces desconexos exatamente onde o assíncrono começa.
- Spans manuais em torno da chamada ao PSP e da decisão de antifraude, com atributos
  `fin.psp`, `fin.payment.method` e `fin.decision`.
- **Nenhum atributo com PII**: nada de CPF, PAN ou nome. `account.id` só se for um
  identificador interno opaco — e mesmo assim ele é alta cardinalidade, então serve em
  span e log, nunca em métrica (marco 04). O marco 17 volta nisso com redaction no
  Collector.

## Hands-on

**Tutorial — o primeiro trace ponta a ponta.**

1. Suba um Tempo (ou Jaeger) local via Compose.
2. Ligue a auto-instrumentação no `pix-gateway` só com variáveis de ambiente
   (`OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`) —
   **sem mudar uma linha de código**. Faça uma requisição e veja o trace.
3. Instrumente o `ledger-core` (Go) com `otelhttp` e confirme que a chamada entre os dois
   aparece como **um** trace com spans dos dois serviços.
4. Inspecione o header `traceparent` na requisição entre eles — encontre o `trace-id` e
   confira que é o mesmo do trace na UI.
5. Adicione um span manual na chamada ao PSP com o atributo `fin.psp`.

**Desafio — o trace que atravessa o Kafka.**

1. Publique em `payments.initiated` a partir do `pix-gateway` e consuma no `ledger-core`,
   **sem** propagar contexto. Observe: dois traces separados. Esse é o estado natural, e é
   o problema.
2. Propague o contexto pelos headers da mensagem (injetar no producer, extrair no
   consumidor).

**Invariantes testáveis:**

- O `trace-id` do span de produção é **igual** ao do span de consumo.
- O span do consumidor tem o span do producer como **link ou pai** — e o trace continua
  correto mesmo com o consumidor rodando minutos depois.
- Um teste que faz a requisição HTTP, consome o evento e afirma que existe **um único**
  `trace-id` cobrindo a cadeia inteira. Sem esse teste, a propagação quebra no próximo
  refactor e ninguém percebe até o próximo incidente.

3. **Complemento:** quebre de propósito — processe a mensagem num executor separado sem
   propagar o contexto. Veja o trace se partir. Conserte. Escreva 3 linhas sobre por que
   esse é o bug mais comum de instrumentação.

**Checagem.** (a) Por que uma biblioteca pode usar a API do OTel sem impor custo a quem a
usa? (b) O que quebra se dois serviços nomearem o mesmo conceito de formas diferentes?
(c) Onde viaja o contexto num fluxo assíncrono via Kafka? (d) Por que `tenant_id` em
baggage é útil e perigoso ao mesmo tempo?

## Principais aprendizados

- API separada do SDK é o que torna seguro instrumentar biblioteca; OTLP e Collector
  tornam o destino uma configuração, não uma reescrita.
- Semantic conventions são o que permitem painel genérico e consulta entre stacks;
  atributos próprios levam prefixo da empresa.
- A propagação W3C é o que faz o trace existir — e ela quebra em troca de thread e em
  fronteira assíncrona, que é onde mais se precisa dela.
- Auto para o transporte, manual para o negócio; span é unidade de trabalho
  significativa, não método.
