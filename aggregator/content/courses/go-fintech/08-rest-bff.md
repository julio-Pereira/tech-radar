---
id: rest-bff
title: "API REST de pagamentos + BFF"
summary: "A stdlib cobre um serviço HTTP sério; o que falta é disciplina de timeout, limite e erro. ServeMux com método e curinga, os quatro timeouts do servidor, corpo limitado e estrito, Problem Details, Idempotency-Key de verdade e um shutdown que não perde requisição."
estimatedMinutes: 60
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [arquitetura, seguranca]
references:
  - title: "package net/http"
    url: https://pkg.go.dev/net/http
  - title: "Routing Enhancements for Go 1.22 (Go blog)"
    url: https://go.dev/blog/routing-enhancements
  - title: "RFC 9457 — Problem Details for HTTP APIs"
    url: https://www.rfc-editor.org/rfc/rfc9457
  - title: "IETF draft — The Idempotency-Key HTTP Header Field"
    url: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
  - title: "go-chi/chi (alternativa)"
    url: https://github.com/go-chi/chi
---

## A stdlib basta; a disciplina, não

O `ledger-core` vira serviço em duas peças: o **`payments-api`** (lançamentos, saldo, extrato) e o
**`payments-bff`**, o Backend-for-Frontend do app, que agrega o `payments-api`, um KYC e uma cotação.
Para as duas, a biblioteca padrão é suficiente. Desde o **Go 1.22**, o `http.ServeMux` aceita
**método e curinga** no padrão:

```go
mux := http.NewServeMux()
mux.HandleFunc("POST /entries", s.postEntry)
mux.HandleFunc("GET /accounts/{id}/balance", func(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// ...
})
```

Padrões que se sobrepõem são resolvidos pelo mais específico, e um método errado responde `405` com
o cabeçalho `Allow`. O `chi` continua uma boa alternativa (grupos de rotas, middlewares prontos),
mas deixou de ser necessário. Middleware é uma função `func(http.Handler) http.Handler`, composta em
volta do mux.

O que a stdlib não decide por você é o que derruba serviço em produção: timeout, limite e formato de
erro.

## Os timeouts do servidor e do cliente

Um `http.Server{}` sem configuração **não tem timeout nenhum**. Os quatro que importam:

- **`ReadHeaderTimeout`**: o prazo para o cliente terminar de mandar o cabeçalho. Sem ele, um
  cliente que manda um byte a cada poucos segundos segura a conexão para sempre, e mil clientes
  assim esgotam o servidor. É o ataque **Slowloris**, e o `gosec` acusa o servidor sem esse campo.
- **`ReadTimeout`**: o prazo para ler a requisição inteira, corpo incluído.
- **`WriteTimeout`**: o prazo para escrever a resposta.
- **`IdleTimeout`**: quanto uma conexão keep-alive ociosa fica aberta.

Do outro lado, o **`http.Client` padrão também não tem timeout**: uma chamada ao KYC que trava trava
o seu handler, e o seu pool de goroutines. Todo cliente HTTP do serviço tem `Timeout` e recebe o
`ctx` da requisição (`http.NewRequestWithContext`). E duas regras de reaproveitamento de conexão:
sempre feche o corpo da resposta (`defer resp.Body.Close()`), e leia-o até o fim antes de fechar;
um corpo não drenado faz a conexão ser descartada em vez de voltar ao pool.

## Entrada limitada e estrita

- **`http.MaxBytesReader(w, r.Body, limite)`** corta o corpo no limite. Ler além devolve um
  `*http.MaxBytesError`, que vira `413` sem o servidor ter lido os 5 MB que o cliente mandou.
- **Decodificação estrita**: `dec.DisallowUnknownFields()` recusa campo desconhecido (um `"valor"`
  digitado como `"valr"` não vira zero silenciosamente), e `dec.More()` recusa lixo depois do
  objeto. No Go 1.27, o `encoding/json` passou a usar a implementação v2 por baixo, mantendo o
  comportamento; o pacote novo `encoding/json/v2` é mais estrito por padrão (UTF-8 inválido e nome
  duplicado são recusados).
- **Erro no formato da RFC 9457** (*Problem Details*, que substitui a 7807): corpo
  `application/problem+json` com `type` (um URI que identifica a classe do erro), `title`, `status`,
  `detail` e `instance`. O cliente decide pelo `type`, nunca pelo texto. A taxonomia do marco 05 é
  exatamente o que preenche esses campos. O desenho do contrato de API está em
  `system-design/05`; aqui está a implementação.

## Idempotency-Key de verdade

A `Idempotency-Key` (rascunho da IETF, uso consagrado pela Stripe) promete que repetir a mesma
requisição devolve o **mesmo resultado** sem executar de novo. Três detalhes que a implementação
ingênua erra:

1. **Repetições simultâneas.** O cliente reenviou por timeout enquanto a primeira ainda processava.
   Checar "a chave existe?" e depois gravar abre uma janela em que as duas executam. A entrada da
   chave precisa ser criada **antes** de executar, sob trava, e a segunda requisição **espera** a
   primeira terminar (um channel `done` por chave resolve).
2. **Mesma chave, corpo diferente.** É bug do cliente, não repetição: responda `409`, nunca devolva
   o resultado de outra operação. Guarde o hash do corpo junto da chave.
3. **Resposta igual.** Guarde o status e o corpo da primeira resposta e devolva-os byte a byte.

Em produção, a tabela de chaves fica no banco, com TTL, na mesma transação do lançamento (marco 09).

## Encerrar sem perder requisição

No deploy, o orquestrador manda `SIGTERM`. O serviço que simplesmente sai derruba as requisições em
voo: um lançamento pode ter sido gravado sem a resposta chegar. O **graceful shutdown**:
`signal.NotifyContext` captura o sinal, e `srv.Shutdown(ctx)` fecha o listener (conexões novas são
recusadas na hora), espera as requisições em voo terminarem e fecha as conexões ociosas, até o prazo
do `ctx`. A readiness do Kubernetes precisa ficar falsa antes disso, para o tráfego parar de chegar
(`kubernetes/06`; o equivalente em Spring está em `spring-boot/12`).

## Exemplo numa fintech: agregação no BFF

A home do app mostra saldo, status de KYC e cotação. Em série, as latências somam; o idiomático é
paralelizar com `errgroup` (marco 06), propagando o `ctx` que carrega o prazo da requisição:

```go
g, ctx := errgroup.WithContext(r.Context())
var saldo Saldo
var kyc KYCStatus
g.Go(func() error { var err error; saldo, err = paymentsAPI.Saldo(ctx, id); return err })
g.Go(func() error { var err error; kyc, err = kycClient.Status(ctx, id); return err })
if err := g.Wait(); err != nil {
	writeProblem(w, r, problemFor(err))
	return
}
```

```diagrama
go-bff-errgroup
```

E o mínimo de OWASP que mora no handler: validar valor e formato de conta antes de tocar no
domínio, limitar taxa por usuário e por IP, e **nunca registrar** PAN, CVV, senha, token ou chave Pix
inteira. Um tipo `Sensitive[T]` que mascara em `String()` e `MarshalJSON()` transforma o esquecimento
em erro de tipo.

| Spring Boot | Go com a stdlib |
| --- | --- |
| `@RestController` e `@GetMapping` | `mux.HandleFunc("GET /path/{id}", h)` e `r.PathValue` |
| `@Valid` | validação explícita no handler, com erro em Problem Details |
| `Filter`, `HandlerInterceptor` | middleware `func(http.Handler) http.Handler` |
| `server.tomcat.*timeout` | `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout` |
| `RestTemplate`, `WebClient` | `http.Client` com `Timeout` e `NewRequestWithContext` |
| `@ExceptionHandler` | mapeamento centralizado da taxonomia para `application/problem+json` |
| `server.shutdown=graceful` | `signal.NotifyContext` mais `srv.Shutdown(ctx)` |

## Hands-on

**Tutorial.** Monte o `payments-api` só com a stdlib: `ServeMux` com `POST /entries` e
`GET /accounts/{id}/balance`, o middleware de `MaxBytesReader`, o `http.Server` com os quatro
timeouts, e um `writeProblem` para `application/problem+json`. Teste com `httptest.NewServer`.

**Desafio.** `POST /entries` idempotente, com as três regras acima (repetição simultânea espera a
primeira, corpo diferente com a mesma chave é `409`, resposta devolvida byte a byte), e o servidor
com graceful shutdown.

**Invariantes testáveis**

1. A mesma `Idempotency-Key` enviada 50 vezes, **em paralelo**, produz um lançamento e uma única
   resposta distinta; a mesma chave com outro corpo devolve `409`.
2. Um corpo de 5 MB com limite de 1 MiB devolve `413`.
3. Um cliente que manda o cabeçalho um byte por vez é desconectado no prazo do
   `ReadHeaderTimeout` (teste com `net.Dial` escrevendo byte a byte e lendo até receber EOF).
4. Erro sai em `application/problem+json` com `type`, `title` e `status` coerente com o status
   HTTP (por exemplo, para um JSON com campo desconhecido).
5. `Shutdown` termina a requisição em voo (ela recebe a resposta completa) e recusa conexão nova
   enquanto espera.

**Complemento.** Rode o `gosec` (pelo golangci-lint) num `http.Server` sem `ReadHeaderTimeout` e veja
o achado; depois, troque o mux por `chi` numa branch e compare: o que você ganhou e o que precisou
acrescentar como dependência?

**Checagem**

1. O que acontece com um servidor Go sem `ReadHeaderTimeout` diante de mil clientes lentos?
2. Por que checar a `Idempotency-Key` antes de executar não basta para repetições simultâneas?
3. Por que o cliente da API decide pelo `type` do Problem Details e não pelo `title`?
4. Qual a ordem certa entre readiness falsa, `Shutdown` e saída do processo?

## Principais aprendizados

- `ServeMux` com método e curinga (Go 1.22+) cobre o roteamento; o resto é disciplina.
- Servidor e cliente HTTP de Go não têm timeout por padrão: configure os dois, sempre.
- Corpo limitado e estrito, erro em Problem Details (RFC 9457) com `type` estável.
- Idempotência de verdade trata repetição simultânea, corpo diferente e resposta idêntica.
- Graceful shutdown fecha o listener, espera quem está em voo e só então sai.
