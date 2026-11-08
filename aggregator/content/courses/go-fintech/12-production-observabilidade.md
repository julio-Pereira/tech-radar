---
id: production-observabilidade
title: "Microservice production-grade + observabilidade"
summary: "Pronto para produção é configurável por ambiente, observável e encerrável sem perder dado. Config validada na subida, slog com trace_id e dado sensível redigido, o SDK do OpenTelemetry, liveness e readiness, outbox e trilha de auditoria."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [operacao, confiabilidade]
references:
  - title: "package log/slog"
    url: https://pkg.go.dev/log/slog
  - title: "OpenTelemetry Go — documentação"
    url: https://opentelemetry.io/docs/languages/go/
  - title: "The Twelve-Factor App — Config"
    url: https://12factor.net/config
  - title: "Structured Logging with slog (Go blog)"
    url: https://go.dev/blog/slog
---

## Configuração: do ambiente, validada na subida

A configuração vem do **ambiente** (variáveis de ambiente, arquivos montados pelo orquestrador),
nunca de um arquivo dentro do binário: o mesmo artefato roda em homologação e produção, que é o
fator III do 12-factor. Em Go, o detalhe que separa serviço sério de serviço frágil é **quando** a
config é validada: **na subida**, antes de abrir porta e conectar no banco. Uma `DATABASE_URL` com
esquema errado ou um `READ_TIMEOUT` que não é duração precisam derrubar o processo com uma mensagem
clara, e não virar um nil pointer às 3h. E todas as falhas de uma vez (`errors.Join`, marco 05): quem
corrige não quer descobrir um erro por deploy.

## Logs: slog com contexto e sem dado sensível

O `log/slog` (Go 1.21) é o log estruturado da stdlib: `slog.NewJSONHandler` em produção, um registro
por linha, com atributos tipados. Duas extensões transformam log em ferramenta de investigação:

- **Correlação com o trace.** Um `slog.Handler` que embrulha outro pode, em `Handle(ctx, r)`, ler o
  span ativo do `ctx` e acrescentar `trace_id` e `span_id`. Todo log feito com `InfoContext(ctx, ...)`
  dentro da requisição carrega o mesmo `trace_id` do span, e do log se chega ao trace, e do trace ao
  log, num clique.
- **Redação por tipo.** Um tipo que implementa **`slog.LogValuer`** decide como aparece no log. Um
  `type CPF string` com `LogValue()` que devolve `***.***.***-09` faz o CPF sair mascarado em
  qualquer log, sem depender de ninguém lembrar. O mesmo vale para chave Pix, token e PAN. A regra
  vale também para **atributos de span**: um atributo é um log que vai para outro backend. As regras
  de PII em telemetria estão em `observabilidade/17`.

## Métricas e traces com o SDK do OpenTelemetry

O modelo (traces, métricas, logs, Collector) é de `observabilidade/05`; aqui está o que é específico
de Go. O SDK cria um `TracerProvider` e um `MeterProvider` com exportador **OTLP** para o Collector,
registrados uma vez no `main`. A propagação de contexto (o cabeçalho `traceparent` do W3C) entra
por instrumentação pronta: o `otelhttp` envolve o `http.Handler` e o `http.Transport`, o `otelgrpc`
é um interceptor (marco 10), e para Kafka o contexto vai nos cabeçalhos da mensagem. Toda chamada que
recebe o `ctx` da requisição continua o mesmo trace.

As **métricas de negócio** (valor transacionado, taxa de aprovação, lançamentos por tipo) contam
tanto quanto CPU e latência, e são o assunto de `observabilidade/08`. O mesmo OTLP chega a qualquer
backend que o aceite, inclusive Datadog e New Relic: a instrumentação não depende do fornecedor.

```diagrama
go-observabilidade
```

## Liveness, readiness e o drain

- **Liveness** (`/healthz`): "o processo está vivo?". Falha só se o processo travou; o orquestrador
  reinicia. Não checa dependência: um banco fora não se resolve reiniciando o serviço.
- **Readiness** (`/readyz`): "posso receber tráfego agora?". Falha quando uma dependência crítica cai
  **e durante o drain**: no `SIGTERM`, a readiness fica falsa primeiro, o balanceador para de mandar
  requisições, e só então o `Shutdown` do marco 08 espera as em voo. Os detalhes de probe e
  encerramento estão em `kubernetes/06`.

## Exemplo numa fintech: outbox e trilha de auditoria

Ao gravar um lançamento, o evento para os outros serviços é gravado numa tabela **outbox**, na
**mesma transação** do banco (marco 09); um worker lê a outbox e publica no Kafka, com entrega
*at-least-once* e sem 2-phase commit. Em paralelo, uma trilha de auditoria append-only registra cada
movimentação de forma imutável. Registro contábil não se apaga: o "direito ao esquecimento" da LGPD
vira anonimização do dado pessoal, nunca remoção do lançamento.

```go
type TraceHandler struct{ slog.Handler }

func (h TraceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	return h.Handler.Handle(ctx, r)
}
```

## Hands-on

**Tutorial.** Configure o `main` do `payments-api`: `LoadConfig` a partir do ambiente com
`errors.Join` das falhas; `slog` em JSON com o `TraceHandler`; `TracerProvider` com exportador OTLP e
o `otelhttp` no mux; `/healthz` e `/readyz` separados.

**Desafio.** Um trace do `POST /entries` até o lançamento gravado, com a chamada ao antifraude no
meio, e logs que se ligam ao trace sem vazar dado pessoal.

**Invariantes testáveis**

1. Todo log da requisição tem `trace_id` igual ao do span (teste com o exportador em memória do SDK,
   `tracetest.NewInMemoryExporter`, e um `slog.JSONHandler` sobre um buffer).
2. CPF e chave Pix nunca aparecem em log nem em atributo de span: varredura do buffer de log e dos
   atributos exportados por um regex de CPF e pelo valor original.
3. Config inválida impede a subida com uma mensagem que cita cada variável errada.
4. Readiness responde 503 durante o drain, enquanto a liveness continua 200.

**Complemento.** Suba o Collector do `observabilidade/06` no compose, aponte o
`OTEL_EXPORTER_OTLP_ENDPOINT` para ele e ache, num backend de traces, o mesmo `trace_id` que está no
log de uma requisição.

**Checagem**

1. Por que a config é validada na subida, e não na primeira vez que é usada?
2. O que um `slog.LogValuer` garante que uma revisão de código não garante?
3. Por que a liveness não deve checar o banco?
4. Qual a ordem entre readiness falsa, `Shutdown` e saída do processo?

## Principais aprendizados

- Config do ambiente, validada inteira na subida, falhando rápido e com todas as mensagens.
- `slog` com `trace_id` em todo registro; dado sensível redigido pelo tipo, em log e em span.
- OpenTelemetry com OTLP e instrumentação de HTTP, gRPC e Kafka; métricas de negócio junto das
  técnicas.
- Liveness para reiniciar, readiness para receber tráfego, e readiness falsa antes do drain.
- Outbox na mesma transação; auditoria append-only; anonimizar, nunca apagar lançamento.
