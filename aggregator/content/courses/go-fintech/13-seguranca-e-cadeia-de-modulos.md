---
id: seguranca-e-cadeia-de-modulos
title: "Segurança e cadeia de módulos"
summary: "Em Go, boa parte da superfície de ataque está no que você importa e em como você monta o binário. go.sum e checksum database, govulncheck por alcançabilidade, crypto/tls com mTLS, SSRF no cliente HTTP, os.Root, segredos fora do binário e uma imagem sem root e sem shell."
estimatedMinutes: 55
reviewedAt: 2026-11-08
reviewEvery: 6m
competencies: [seguranca]
references:
  - title: "Go Vulnerability Management (govulncheck)"
    url: https://go.dev/doc/security/vuln/
  - title: "Go Modules Reference: checksum database e GOPROXY"
    url: https://go.dev/ref/mod#checksum-database
  - title: "package crypto/tls"
    url: https://pkg.go.dev/crypto/tls
  - title: "Traversal-resistant file APIs (Go blog)"
    url: https://go.dev/blog/osroot
  - title: "OWASP API Security Top 10 (2023)"
    url: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
---

## O que você importa

Um serviço Go típico tem dezenas de módulos de terceiros no `go.sum`, e cada um é código que roda com
os mesmos privilégios do seu. O ecossistema tem três defesas, e é preciso saber o que cada uma garante:

- **`go.sum`** guarda o hash de cada versão de módulo usada. Se o conteúdo baixado não bater, o build
  falha. Garante **integridade** (o código é o mesmo da primeira vez), não **confiança** (a primeira
  vez podia já ser maliciosa).
- **Checksum database** (`sum.golang.org`): um log público, só de acréscimo, com o hash de cada versão
  publicada. Na primeira vez que alguém baixa uma versão, o hash é conferido contra o log. Garante que
  todo mundo recebe **o mesmo** código para `v1.2.3`, então um autor (ou um atacante) não consegue
  servir uma versão diferente só para você. Não diz se o código é seguro.
- **Proxy** (`proxy.golang.org`): cache das versões publicadas, que continua servindo um módulo mesmo
  se o repositório original sumir.

O ataque que sobra é o de sempre: um módulo legítimo comprometido, ou um nome parecido com o de um
módulo popular. SBOM, SLSA e o desenho de cadeia de suprimentos estão em
`seguranca-aplicacao/12`; aqui está o que é específico de Go.

## govulncheck: alcançabilidade, não lista de CVEs

O **`govulncheck`** (do time do Go, `golang.org/x/vuln`) cruza as dependências com a base de
vulnerabilidades do Go e, ao contrário de um scanner que lista CVEs por versão, faz **análise de
alcançabilidade**: só acusa se o **seu código chama**, direta ou indiretamente, a função vulnerável, e
mostra o caminho (`main.go:11:28: q.main calls language.Parse`). A mesma versão vulnerável importada
sem chamar a função aparece como informação, não como falha, e o comando sai com código 0. Isso
transforma o alerta em algo que o time consegue tratar. No CI, o código de saída `3` (vulnerabilidade
alcançável) reprova o build. Desde o Go 1.24, a diretiva **`tool`** do `go.mod` fixa a versão do
`govulncheck` e do `golangci-lint` junto do projeto (`go get -tool`, `go tool govulncheck`).

O `gosec` (no golangci-lint) cobre o lado do seu código: SQL montado com concatenação, servidor HTTP
sem `ReadHeaderTimeout` (G112, marco 08), uso de `math/rand` em contexto de segurança.

## Transporte: crypto/tls e mTLS

- **Versão mínima.** O cliente `crypto/tls` usa TLS 1.2 como mínimo padrão desde o Go 1.18, e o
  servidor desde o Go 1.22. Declarar `MinVersion: tls.VersionTLS12` deixa a intenção explícita e
  sobrevive a um `GODEBUG` que reverta o padrão.
- **mTLS entre serviços** (o `payments-api` e o antifraude do marco 10): o servidor exige e verifica o
  certificado do cliente com `ClientAuth: tls.RequireAndVerifyClientCert` e `ClientCAs` com a CA
  interna. Cada serviço prova quem é; um processo qualquer na rede não consegue chamar o antifraude.
  O desenho de borda e de transporte está em `seguranca-aplicacao/11`.
- **`crypto/rand`, nunca `math/rand`**, para qualquer coisa que um atacante não pode adivinhar: token,
  chave de idempotência gerada pelo servidor, nonce. E comparação de segredo com
  `subtle.ConstantTimeCompare`: um `==` sobre o HMAC de um webhook termina no primeiro byte diferente
  e vaza, pelo tempo, quantos bytes estavam certos.

## Entrada que vira ação: SQL, SSRF e arquivos

- **SQL sempre parametrizado** (`$1`, `$2`, marco 09), nunca montado com `fmt.Sprintf`.
- **SSRF** é o seu servidor buscando uma URL que o cliente escolheu: o webhook de notificação de
  pagamento, o "importar extrato de uma URL". Sem defesa, o cliente cadastra
  `http://169.254.169.254/` (o metadata da nuvem, com credenciais) ou `http://10.0.3.7:5432`. Validar
  o **hostname** antes não basta: o DNS pode responder com um IP interno depois da validação. Em Go, a
  defesa fica no `Control` do `net.Dialer`, que roda **depois da resolução**, sobre o IP que vai ser de
  fato conectado, e recusa loopback, rede privada, link-local, endereço não especificado e multicast
  (cuidado com o IPv4 mapeado em IPv6: `::ffff:10.0.0.1`). Injeção e SSRF em geral estão em
  `seguranca-aplicacao/03`.
- **Path traversal**: um nome de arquivo vindo de fora (`../../etc/passwd`) abre o que não devia. O
  **`os.Root`** (Go 1.24) abre um diretório e só permite operações dentro dele: `root.Open` recusa
  `..` que escape, caminho absoluto e link simbólico para fora.

## Segredos e o binário

Segredo vem do ambiente ou de arquivo montado pelo orquestrador, lido na subida (marco 12), nunca
compilado no binário: qualquer `strings` no executável o revela. E o próprio binário vaza
informação: compilado sem **`-trimpath`**, ele carrega o caminho absoluto da máquina de build. Com
`-trimpath` e `-ldflags=-buildid=`, dois builds do mesmo commit produzem o **mesmo SHA-256**: build
reprodutível, que permite conferir que o binário em produção veio daquele código.

A imagem: binário estático (`CGO_ENABLED=0`) numa imagem **distroless** ou `scratch`, com usuário não
root. Sem shell e sem gerenciador de pacotes, um atacante que consiga executar código no processo não
tem ferramenta para continuar. A segurança do workload no cluster está em `kubernetes/09`.

```dockerfile
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -buildid=" -o /out/ledger ./cmd/ledger

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ledger /ledger
USER nonroot:nonroot
ENTRYPOINT ["/ledger"]
```

## Exemplo numa fintech: o OWASP API Top 10 no ledger-core

| Risco (OWASP API 2023) | Onde mora no `ledger-core` | A defesa desta trilha |
| --- | --- | --- |
| API1 — autorização por objeto | `GET /accounts/{id}/balance` de outra conta | checar o dono da conta no handler, não só o token |
| API4 — consumo de recurso sem limite | corpo gigante, cliente lento, lote sem teto | `MaxBytesReader`, timeouts, `SetLimit`, 429 (marcos 07 e 08) |
| API6 — fluxo de negócio sensível | repetição de transferência | `Idempotency-Key` (marco 08) |
| API7 — SSRF | webhook do lojista | `Control` do `Dialer` após o DNS |
| API8 — má configuração | servidor sem timeout, TLS fraco, imagem com shell | `ReadHeaderTimeout`, `MinVersion`, distroless |
| API10 — consumo inseguro de APIs | resposta do PSP aceita sem validar | validar o que vem de fora como entrada (marco 11) |

## Hands-on

**Tutorial.** Rode `govulncheck ./...` no `ledger-core`. Depois, num módulo de teste, dependa de
`golang.org/x/text@v0.3.6` e chame `language.Parse` com uma entrada do usuário: o `govulncheck` acusa
o GO-2021-0113 com o caminho da chamada e sai com código 3. Troque a chamada por um uso do pacote que
não passa por `Parse` e veja o código de saída virar 0.

**Desafio.** Endureça o `ledger-core`: `tls.Config` com mínimo TLS 1.2 e mTLS; cliente de webhook com
o `Control` que recusa redes internas; leitura de arquivos de extrato por `os.Root`; Dockerfile
multi-stage para distroless sem root; build reprodutível.

**Invariantes testáveis**

1. `govulncheck ./...` sem vulnerabilidade alcançável no `ledger-core`; e a fixture com a dependência
   vulnerável chamada reprova (código 3).
2. O servidor recusa cliente sem certificado e recusa TLS 1.1 (teste com uma CA gerada em memória com
   `crypto/x509`).
3. O cliente de webhook recusa loopback, rede privada, link-local (inclusive `169.254.169.254`), IPv6
   local e IPv4 mapeado em IPv6, e aceita endereços públicos (tabela).
4. A imagem roda com usuário não root e não tem shell: `docker inspect` mostra `nonroot` e
   `docker run --entrypoint /bin/sh` falha.
5. Dois builds do mesmo commit com `-trimpath -ldflags=-buildid=` têm o mesmo SHA-256, e sem
   `-trimpath` o binário contém o caminho da máquina de build.

**Complemento.** Gere o SBOM do binário (`go version -m ./ledger` lista os módulos e versões embutidos
no executável) e compare com o `go.sum`: o que está no `go.sum` e não entrou no binário?

**Checagem**

1. O que o `go.sum` garante, o que a checksum database acrescenta, e o que nenhum dos dois garante?
2. Por que o `govulncheck` pode sair com código 0 mesmo com uma versão vulnerável no `go.mod`?
3. Por que validar o hostname do webhook antes de chamar não impede SSRF?
4. O que o `-trimpath` remove do binário, e por que isso importa para build reprodutível?

## Principais aprendizados

- `go.sum` garante integridade, a checksum database garante que todos recebem o mesmo código; nenhum
  dos dois garante que o código é bom.
- `govulncheck` acusa o que o seu código alcança; código 3 reprova o CI.
- TLS 1.2 no mínimo, mTLS entre serviços, `crypto/rand` e comparação em tempo constante.
- SSRF se barra no IP conectado (`Control` do `Dialer`); path traversal, com `os.Root`.
- Segredo fora do binário; `-trimpath` e build reprodutível; distroless, sem root e sem shell.
