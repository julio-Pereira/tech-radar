---
id: grpc-antifraude
title: "gRPC entre serviços + antifraude"
summary: "gRPC dá contrato e deadline; a decisão de falhar aberto ou fechado continua sendo de produto. Protobuf com buf, interceptors, deadline propagado, erro de domínio como status com detalhes, retry só em idempotente e evolução de contrato sem quebrar."
estimatedMinutes: 50
reviewedAt: 2026-11-08
reviewEvery: 12m
competencies: [arquitetura, confiabilidade]
references:
  - title: "gRPC — Quick start (Go)"
    url: https://grpc.io/docs/languages/go/quickstart/
  - title: "gRPC — Deadlines"
    url: https://grpc.io/docs/guides/deadlines/
  - title: "gRPC — Status codes"
    url: https://grpc.io/docs/guides/status-codes/
  - title: "buf — documentação (lint, generate, breaking)"
    url: https://buf.build/docs/
  - title: "Google AIP-193 — Errors (errdetails)"
    url: https://google.aip.dev/193
---

## Por que gRPC entre os serviços

Entre serviços internos, JSON sobre HTTP custa serialização e não dá contrato: um campo renomeado
quebra o consumidor em produção. O **gRPC** com **Protobuf** troca isso por um contrato versionado
(o `.proto`), código gerado nos dois lados e HTTP/2 com multiplexação. O antifraude é o caso clássico:
o `payments-api` precisa de uma decisão em dezenas de milissegundos, para cada pagamento.

O `.proto` mora no repositório e o **`buf`** cuida do resto: `buf lint` aplica as regras de estilo
(nome do pacote com versão, como `antifraude.v1`; serviço terminado em `Service`; enum com zero
`_UNSPECIFIED`), `buf generate` gera o Go com `protoc-gen-go` e `protoc-gen-go-grpc`, e
**`buf breaking`** compara com a versão anterior e reprova mudança incompatível.

```proto
service AntifraudeService {
  rpc Avaliar(AvaliarRequest) returns (AvaliarResponse);
}

enum Decisao {
  DECISAO_UNSPECIFIED = 0;
  DECISAO_APROVADO = 1;
  DECISAO_NEGADO = 2;
  DECISAO_REVISAO = 3;
}
```

## Interceptors e deadline

**Interceptors** são os middlewares do gRPC: uma função que envolve cada chamada, no cliente ou no
servidor, para log, métrica, autenticação e tracing (o marco 12 liga o OpenTelemetry aqui).

O recurso que mais pesa em produção é o **deadline**. O cliente define um prazo absoluto
(`context.WithTimeout`), e o gRPC o **transmite** ao servidor no cabeçalho da chamada. O servidor
recebe o mesmo prazo no `ctx` e, se chamar outro serviço com esse `ctx`, o prazo segue adiante. Uma
cadeia de três serviços respeita os 200 ms do cliente original sem nenhum código a mais, coisa que
num timeout de HTTP comum cada salto precisa reimplementar. Um interceptor de servidor pode recusar
chamada **sem** deadline: em serviço de pagamento, "esperar para sempre" nunca é a intenção.

Dois códigos que parecem iguais e não são: **`DeadlineExceeded`** (o prazo acabou; a operação pode
ter acontecido do outro lado) e **`Unavailable`** (o servidor não estava lá; em geral seguro
repetir). Isso importa para o retry: a política de retry do gRPC só deve repetir chamadas
**idempotentes**, e um `DeadlineExceeded` num débito não prova que o débito não aconteceu.

## Erro de domínio como status

O erro gRPC é um `status` com um código (`codes.InvalidArgument`, `codes.FailedPrecondition`,
`codes.NotFound`...), uma mensagem e **detalhes** tipados. A taxonomia do marco 05 vira uma tabela de
erro de domínio para código, e o detalhe diz ao cliente o que corrigir sem ele ler texto: um
`errdetails.BadRequest` lista os campos inválidos (`valor`: "precisa ser positivo"). O cliente
extrai com `status.FromError(err)` e `st.Details()`.

| Situação | Código |
| --- | --- |
| Requisição malformada (campo faltando, valor negativo) | `InvalidArgument`, com `BadRequest` |
| Conta bloqueada, estado não permite a operação | `FailedPrecondition` |
| Conta inexistente | `NotFound` |
| Erro de infraestrutura | `Internal` (sem a mensagem interna, como no HTTP) |

## Evoluir o .proto sem quebrar

O Protobuf identifica campo pelo **número**, não pelo nome. Adicionar campo novo é compatível;
**trocar o tipo** de um campo, reaproveitar um número removido ou mudar o número quebra o
consumidor que ainda não foi atualizado. O `buf breaking --against` faz essa checagem no CI e
explica o motivo (`Field "3" with name "valor" on message "AvaliarRequest" changed type from "int64"
to "string"`). Campo removido vira `reserved`, para ninguém reaproveitar o número.

Entre serviços, o transporte é **mTLS**: cada lado prova a identidade com certificado. A configuração
de `crypto/tls` em Go é o assunto do marco 13; o desenho de API como contrato está em
`system-design/05`, e o caso do antifraude em tempo real em `system-design/12`.

## Exemplo numa fintech: falhar aberto ou fechado

O `payments-api` chama o antifraude antes de autorizar. O antifraude consulta um modelo de score, e o
modelo às vezes fica lento. Com 200 ms de prazo do cliente, o antifraude dá 50 ms ao modelo; se o
modelo não responder, a decisão sai pela **regra de fallback**, e a resposta diz que veio dela
(`fallback: true`), para a auditoria e para a métrica.

```diagrama
go-fail-open-ou-closed
```

**Falhar aberto** (aprovar) prioriza a conversão e assume o risco; **falhar fechado** (negar)
prioriza a segurança e perde venda. Não existe resposta universal: a regra comum é aprovar até um
valor e negar acima dele, e essa regra é **decisão de produto, com dono, registrada**. O que não
pode acontecer é o timeout decidir sozinho, escondido num `if err != nil { return APROVADO }` que
ninguém revisou.

## Hands-on

**Tutorial.** Escreva o `antifraude.proto`, rode `buf lint` e `buf generate`, implemente o servidor
com `UnimplementedAntifraudeServiceServer` embutido e teste com `bufconn` (conexão em memória, sem
porta de rede).

**Desafio.** O antifraude com deadline e fallback: orçamento próprio para o modelo dentro do prazo do
cliente, regra de fallback configurável (aprovar até um valor), interceptor que recusa chamada sem
deadline, e a tabela de erro de domínio para status com `errdetails.BadRequest`.

**Invariantes testáveis**

1. Com o modelo fora (nunca responde), a resposta sai dentro do prazo do cliente com a decisão de
   fallback configurada: aprovado abaixo do limite, negado acima, e `fallback: true` nos dois.
2. `buf breaking` reprova uma mudança incompatível de uma cópia do `.proto` (trocar o tipo do campo
   `valor`), e a mensagem cita o campo.
3. O deadline do chamador chega ao servidor: o interceptor observa um prazo positivo e menor que o
   do cliente; chamada sem deadline recebe `InvalidArgument`.
4. A tabela de status é cumprida: campo faltando e valor inválido viram `InvalidArgument` com
   `FieldViolation` do campo certo; conta bloqueada vira `FailedPrecondition`.

**Complemento.** Configure uma política de retry no cliente (service config) só para um método de
consulta idempotente e explique, num comentário, por que o `Avaliar` não entra nela.

**Checagem**

1. O que o deadline do gRPC propaga que um timeout de HTTP comum não propaga entre serviços?
2. Por que `DeadlineExceeded` num débito não autoriza repetir a chamada?
3. Quais mudanças no `.proto` são compatíveis, e quais o `buf breaking` deve reprovar?
4. Quem decide entre falhar aberto e fechado, e onde essa decisão fica registrada?

## Principais aprendizados

- Protobuf com `buf`: lint, geração e `buf breaking` no CI.
- Interceptors são os middlewares do gRPC; o deadline viaja sozinho pela cadeia de chamadas.
- `DeadlineExceeded` não é `Unavailable`: retry só em idempotente.
- Erro de domínio vira status com código e detalhes tipados; infraestrutura vira `Internal`.
- Falhar aberto ou fechado é decisão de produto, registrada, nunca um default escondido.
