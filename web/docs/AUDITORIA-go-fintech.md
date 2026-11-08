# Auditoria — Reestruturação da trilha `go-fintech` (Fase 0)

Auditado contra `main` em `5eeed89` (merge do PR #109), em 2026-11-08, antes de qualquer conteúdo
novo. Convenções encontradas no código têm precedência sobre o plano
(`PLANO-reestruturacao-go-fintech`, entregue pelo Julio em 2026-11-08); cada divergência abaixo diz
como fica resolvida.

## 1. Convenções de autoria (§3 do plano)

Conferidas e válidas como o plano descreve:

- **Estrutura da trilha.** `course.yaml`, `NN-slug.md`, `NN-slug.quiz.yaml`, `PROJETO.md` e
  `diagramas/`. A `go-fintech` ainda não tem `GLOSSARIO.md` nem a chave `glossary:`.
- **Frontmatter.** Os campos `competencies`, `reviewedAt` e `reviewEvery` existem. O vocabulário de
  competências (`content/competencies.yaml`) é fechado e tem 14 ids. Os que servem a esta trilha:
  `arquitetura`, `dados`, `seguranca`, `confiabilidade`, `plataforma`, `performance` e `operacao`.
  Não há competência de "linguagem" ou de "testes", e o plano não pede uma.
- **Anatomia do `## Hands-on`.** Os cinco blocos (`**Tutorial.**`, `**Desafio.**`,
  `**Invariantes testáveis**`, `**Complemento.**` e `**Checagem**`) conferem com
  `concorrencia-e-recursos/08`.
- **Pontes.** Resolvem pelo prefixo do arquivo (`bridges.go`), e `/NN` herda o slug só quando entre
  as duas pontes há apenas conectores.
- **Pontes planejadas.** O `content/bridges-planned.yaml` está vazio (`[]`). As pontes para
  `design-de-codigo`, `performance-resiliencia` e `java-e-jvm` vão precisar de entradas nas fases
  em que forem escritas.

Divergências:

| Achado | Resolução |
| --- | --- |
| **Nenhuma trilha usa `reviewEvery`** (só a infraestrutura de frescor existe) | A `go-fintech` é a primeira (§9). O `freshness.spec.js` assumia que nenhum conteúdo real tinha `reviewedAt` e foi ajustado (ver §9 deste documento). |
| **O enunciado do quiz não renderiza bloco de código** (D7). O `quiz.js` põe `question` num `<legend>` via `textContent`; o cartão de revisão (`review-view.js`) faz o mesmo. Quebras de linha somem. | Recomendação: na Fase B, um campo opcional `code:` no `.quiz.yaml`, exibido num `<pre><code>` via `textContent`, sem HTML, no quiz e no cartão de revisão. Alternativa do plano: código inline curto, com a limitação registrada. Fica para o Julio decidir antes da Fase B. |
| O plano cita `PLANO-adendo-sinais-de-mercado.md` e `PLANO-trilha-java-e-jvm.md` | Não estão no repositório. Só pesam na Fase G (jornada) e na ponte planejada do marco 16. |

## 2. Colisões de `id`

O compilador exige `id` único **dentro** da trilha (`compile.go`, "duplicate milestone id"). O
progresso (`tr:progress:<slug>`), o id do checkbox (`check-<slug>-<id>`), a busca e os cartões de
revisão sempre levam o slug junto. Resultado para os 16 ids do §5:

- 15 não colidem com nada fora da `go-fintech`.
- `persistencia-e-transacoes` (marco novo 09) já existe em `spring-boot/05`. **Não é bloqueio**: ids
  iguais em trilhas diferentes já existem hoje (`introducao`, em `go-fintech` e `spring-boot`).
  Fica como o plano propõe.

## 3. Versão do Go (D2)

- **Última estável: Go 1.27.3.** Fonte: lista de toolchains do proxy de módulos
  (`proxy.golang.org/golang.org/toolchain/@v/list`).
- **Versão anterior ainda com suporte: 1.26** (1.26.10). O Go mantém cada versão até existirem duas
  mais novas, conforme `go.dev/doc/devel/release`.
- **Baseline da trilha: Go 1.27.** Os dois toolchains foram baixados aqui e rodam
  (`GOTOOLCHAIN=go1.27.3`).
- A tabela "recurso → versão" está no `PROJETO.md` da trilha, conferida nas release notes de 1.18 a
  1.27 (repositório `golang/website`, `_content/doc/go1.NN.md`).
- Os recursos de 1.24 a 1.27 foram **compilados e executados** num módulo temporário com
  `go 1.27`: métodos genéricos, `errors.AsType`, `new(expr)`, `WaitGroup.Go`, `os.Root`,
  `synctest.Test`, `synctest.Sleep`, `t.Context`, `b.Loop`, `uuid`, `encoding/json/v2`, variável de
  loop por iteração e `ServeMux` com padrões.
- O Go 1.26.10 se recusa a compilar o módulo (`go.mod requires go >= 1.27`), confirmando o mínimo
  estrito.

**Recursos novos que o plano não previa** e que entram no conteúdo das fases seguintes:

| Recurso | Versão | Onde entra |
| --- | --- | --- |
| Métodos genéricos | 1.27 | 04: muda a resposta para "generics × interface" (antes, método não podia ter parâmetro de tipo). |
| `errors.AsType[T]` | 1.26 | 05: forma preferida de `errors.As`. |
| `new(expr)` | 1.26 | 02: zero value × ponteiro para valor opcional. |
| Perfil `goroutineleak` (experimental 1.26, estável 1.27) | 1.27 | 07: detectar vazamento em produção, ao lado do `goleak` nos testes. |
| `synctest.Sleep` | 1.27 | 07 e 11. |
| `encoding/json/v2`; o `encoding/json` passa a usar a implementação v2 | 1.27 | 08: decodificação estrita (UTF-8 inválido e nome duplicado são rejeitados por padrão). |
| Pacote `uuid` na stdlib | 1.27 | 08 e 09: `Idempotency-Key` e ids sem dependência externa. |
| GC Green Tea como padrão | 1.26 | 14. |
| `go vet` acusa `%w` com ponteiro para tipo que já implementa `error` | 1.27 | 05: liga direto com o nil tipado do 04. |
| `go test` roda a checagem `stdversion` | 1.27 | 01: usar símbolo mais novo que a linha `go` falha no teste. |

**Defasagens fora da trilha**, registradas e não corrigidas nesta fase:

- Os workflows de CI (`build.yml`, `web-tests.yml`, `content-freshness.yml` e `desafios-lld.yml`)
  fixam `go-version: '1.22'`, e o `aggregator/go.mod` declara `go 1.22`.
  - Isso não afeta o conteúdo: o código dos tutoriais é compilado num diretório temporário com o
    toolchain do baseline, e não pelo CI do agregador.
- O desafio `rate-limiter-concorrente` (`go/` e `referencia/go/`) declara `go 1.22` e roda no CI
  com Go 1.22.
  - Subir para `go 1.27` exige mudar também o `desafios-lld.yml`.
  - Proposta: PR separado, antes ou junto da Fase C (concorrência), já que esse desafio é a prática
    do bloco.

## 4. Ferramentas: versão e licença

Versões tiradas do proxy de módulos (`@latest`) e licenças do `LICENSE` de cada repositório, em
2026-11-08:

| Ferramenta | Módulo | Versão | Licença | Observação |
| --- | --- | --- | --- | --- |
| pgx | `github.com/jackc/pgx/v5` | v5.12.0 | MIT | |
| sqlc | `github.com/sqlc-dev/sqlc` | v1.31.1 | MIT | |
| golang-migrate | `github.com/golang-migrate/migrate/v4` | v4.20.1 | MIT | Candidata a ferramenta de migração (ADR no marco 09) |
| goose | `github.com/pressly/goose/v3` | v3.29.0 | MIT | Candidata; aceita migração em Go além de SQL |
| Atlas | `ariga.io/atlas` | v1.3.0 | Apache-2.0 (código aberto) | Parte dos recursos fica em edição comercial: citar só como alternativa |
| goleak | `go.uber.org/goleak` | v1.3.0 (out/2023) | MIT | Estável, sem release desde 2023, ainda a referência |
| testcontainers-go | `github.com/testcontainers/testcontainers-go` (+ `modules/postgres`) | v0.45.0 | MIT | |
| golangci-lint | `github.com/golangci/golangci-lint/v2` | v2.15.0 | GPL-3.0 | Ferramenta de desenvolvimento, não entra no binário; a GPL não contamina o projeto |
| gosec | `github.com/securego/gosec/v2` | v2.30.0 | Apache-2.0 | Também roda dentro do golangci-lint |
| govulncheck | `golang.org/x/vuln` | v1.9.0 | BSD-3-Clause | Oficial do time Go |
| exhaustive | `github.com/nishanths/exhaustive` | v0.17.1 | BSD-2-Clause | Linter de exaustividade (D, marco 04); também no golangci-lint |
| Gremlins (mutação) | `github.com/go-gremlins/gremlins` | v0.5.1 (mai/2024) | Apache-2.0 | Sem release há 2 anos |
| go-mutesting (mutação) | `github.com/avito-tech/go-mutesting` | pseudo-versão de out/2026 | MIT | Ativo, mas sem tag. ADR do marco 11 escolhe entre os dois. |
| MCP Go SDK | `github.com/modelcontextprotocol/go-sdk` | v1.8.0 | Apache-2.0 / MIT | Oficial; Complemento opcional do marco 15 |
| buf | `github.com/bufbuild/buf` | v1.75.0 | Apache-2.0 | |
| errgroup | `golang.org/x/sync` | v0.24.0 | BSD-3-Clause | |
| gRPC | `google.golang.org/grpc` | v1.85.0 | Apache-2.0 | |
| OpenTelemetry | `go.opentelemetry.io/otel` | v1.47.0 | Apache-2.0 | |
| chi | `github.com/go-chi/chi/v5` | v5.5.0 | MIT | Vira alternativa citada no marco 08 |
| benchstat | `golang.org/x/perf` | pseudo-versão de out/2026 | BSD-3-Clause | |

## 5. Fontes do `course.yaml` (§6)

`go.dev` não é alcançável deste ambiente (o proxy recusa o túnel). As páginas foram conferidas no
repositório que gera o site (`golang/website`) e no `golang/go`:

- `doc/effective_go`;
- `wiki/CodeReviewComments` (repositório `golang/wiki`);
- `ref/spec` (`doc/go_spec.html`);
- `ref/mem` (`doc/go_mem.html`);
- `doc/devel/release`;
- `doc/security/vuln/`;
- `doc/modules/layout`;
- `blog/`.

Todas existem. O `Standard Go Project Layout` sai das fontes, como o plano pede, na Fase A.

## 6. Snapshot das pontes (§9)

Ferramenta: `TestPontesSnapshot` (`aggregator/internal/course/pontes_snapshot_test.go`). Ela percorre
o corpo de todos os marcos com o mesmo parser e o mesmo resolvedor do compilador. Para isso, ganhou
um gancho opcional, `linkifyBridgesVisit`, que não muda nada no build.

- **Números de linha.** Para acertá-los, a ferramenta resolve cada corpo duas vezes: como o
  compilador vê, depois de `markDiagramaFences`, e sobre o texto original. Ela exige que as duas
  listas sejam idênticas.
- **Conferência.** Todas as 37 linhas do snapshot foram conferidas contra os arquivos.

Resultado em `web/docs/pontes-go-fintech-antes.txt`:

- **37 pontes resolvidas** para a `go-fintech`, incluindo **1 `/NN` herdada**: `/05` em
  `system-design/12`, linha 64, que vai para `grpc-antifraude`.
  - Por destino: `fundamentos` 10, `concorrencia` 8, `grpc-antifraude` 8, `introducao` 4,
    `java-vs-go` 4, `production-observabilidade` 2, `performance` 1 e `rest-bff` 0.
- **37 ocorrências literais** de `go-fintech/NN` em `content/`, e a contagem por NN bate com o mapa
  do plano (4, 11, 8, 0, 7, 2, 1, 4).
  - A diferença entre as duas listas: uma literal fica fora de marco (o verbete de
    `arquitetura-eventos/GLOSSARIO.md`, linha 90, que cita `go-fintech/02`; glossário não é
    linkificado) e a `/05` herdada não é literal.
  - Ambas entram na reescrita da Fase A.
- **`paths/`, `desafios/`, `conceitos.yaml` e `capstones.yaml`:** nenhuma referência
  `go-fintech/NN`. O `capstones.yaml` cita a trilha só pelo slug (`track: go-fintech`).

Na Fase A, o mesmo teste gera o snapshot "depois". A coluna de destino precisa ficar idêntica para
cada ponte, com o arquivo e a linha mapeados pela renumeração.

## 7. Testes que usam a `go-fintech` como fixture (impacto na Fase A)

A renumeração e os stubs mexem em dados que estes testes leem:

- **Go:**
  - `sections_test.go` lista `go-fintech/java-vs-go` como o único marco sem `## Hands-on`. Sai da
    lista quando o 16 ganhar o hands-on (Fase F).
  - `conceitos_test.go` usa `go-fintech/rest-bff`.
- **Front:**
  - `learn`, `reading`, `progress-io`, `gabarito`, `handson`, `freshness` e `a11y` abrem
    `#/learn/go-fintech`. Vários usam posição (`.nth(1)`, `.nth(2)`) ou ids (`introducao`,
    `fundamentos`).
  - `handson.spec.js` procura o texto "nascer o" num marco.
  - `bridges.spec.js` depende do texto "`spring-boot/07`, `/08` e `go-fintech/03`".
  - `review.spec.js` usa `introducao` e `fundamentos`.
  - Todos precisam rodar verdes na Fase A.

## 8. `reviewEvery` (auditoria C2)

Backfill nos 8 marcos existentes, já na numeração nova do plano:

- `6m` para os marcos ancorados em versão: `introducao`, `rest-bff` e `performance`.
- `12m` para os demais.
- O marco 13 é novo e recebe o campo quando for escrito.

O `reviewedAt` é a **data do último commit** de cada arquivo, e não a data desta auditoria. O
conteúdo ainda não foi revisado contra o Go 1.27 (há `go 1.22` e `chi` no texto), e marcar a data
de hoje afirmaria uma revisão que não aconteceu. Cada marco ganha um `reviewedAt` novo quando for
reescrito nas Fases B a F.

## 9. Mudanças desta fase

- `aggregator/internal/course/bridges.go`: gancho opcional de visita (`linkifyBridgesVisit`). O
  comportamento do build não muda.
- `aggregator/internal/course/pontes_snapshot_test.go`: ferramenta de snapshot.
- `web/docs/pontes-go-fintech-antes.txt`: o snapshot.
- `go-fintech/0*.md`: `reviewedAt` e `reviewEvery`, sem tocar no corpo.
- `go-fintech/PROJETO.md`: baseline Go 1.27 e a tabela "recurso → versão".
- `web/tests/freshness.spec.js`:
  - o teste "sem `reviewedAt`" passou a remover os campos explicitamente;
  - um teste novo confere o dado real.
- Este documento.

## 10. Fase A — renumeração (resultado)

**Arquivos.**
- Os 8 marcos antigos e seus quizzes foram renomeados com `git mv`, mantendo o `id`.
- Os 8 marcos novos entraram como stubs no molde da `conectividade-multicloud`: frontmatter, aviso
  de stub e resumo. Não têm quiz nem `## Hands-on` (o compilador não exige nenhum dos dois) e
  entram no `wantNoSection` do `sections_test.go` até o bloco deles ser escrito.
- O `course.yaml` é o do §6 do plano: 16 marcos e `estimatedHours: 28`. A soma real de minutos
  fica abaixo do alvo de 845 até a Fase F, porque os marcos antigos ainda declaram os minutos da
  versão anterior.

**Pontes.**
- As 37 ocorrências literais em 15 arquivos de outras trilhas foram reescritas numa só passada,
  para evitar a troca em cadeia de 03→06 seguida de 06→12.
- O `/05` herdado em `system-design/12`, linha 64, virou `/10`.
- O snapshot "depois" (`web/docs/pontes-go-fintech-depois.txt`) foi comparado com o "antes" pelo
  próprio `TestPontesSnapshot`:

```sh
PONTES_ANTES=../web/docs/pontes-go-fintech-antes.txt \
PONTES_RENOMEAR="03-concorrencia.md=06-concorrencia.md,..." \
go test ./internal/course/ -run TestPontesSnapshot
```

- **Resultado:** 37 pontes antes e 37 depois, e nenhuma posição mudou de destino.
- A checagem foi validada com um snapshot adulterado: ela reprova.
- Nenhuma ponte mora dentro da própria `go-fintech`.

**Outros ajustes.**
- **`PROJETO.md`:** a tabela "Incrementos por marco" recebeu a numeração nova. O conteúdo dela é
  reescrito na Fase F.
- **Progresso:** o teste novo `go-fintech-renumeracao.spec.js` prova que o progresso gravado com os
  8 ids antigos marca os mesmos marcos, agora nas posições novas, e mostra 8 de 16. Ele também
  confere que a ponte herdada `/10` de `system-design/12` chega ao `grpc-antifraude`.

## 11. Fase B — Bloco A (marcos 01 a 05)

- **Campo `code:` no quiz** (decisão do Julio em 2026-11-08):
  - **Compilador:** o campo é opcional em `QuizQuestion`, chega ao `quiz-bank.json`, e as questões
    com o mesmo enunciado passam a ser ordenadas também pelo código.
  - **Front:** o código aparece num `<pre class="quiz-code"><code>` via `textContent` (texto puro,
    nunca HTML), tanto no quiz do marco quanto no cartão de `#/revisar`.
  - **Acessibilidade:** o `<pre>` tem `tabindex="0"`, `role="region"` e um rótulo, porque o axe
    exige que uma região com rolagem lateral seja alcançável pelo teclado.
  - **Id dos cartões de revisão:** o código entra no hash só quando existe. Os cartões antigos
    mantêm o id e a agenda, e duas questões "o que imprime?" com códigos diferentes ganham ids
    distintos.
- **Divergência com o plano:** o §7 manda "manter o desafio `Allocate`" do marco 01, mas esse
  desafio não existia (o 01 só tinha o tutorial do `Money`). Ele foi escrito do zero, com teste de
  propriedade de semente fixa.
- **Código dos marcos conferido por execução:** módulo temporário com `go 1.27`, toolchain 1.27.3.
  - `go test -race -shuffle=on`.
  - `golangci-lint` 2.15.0 com `exhaustive`, `gochecksumtype` e `staticcheck`.
  - Cada saída de quiz "o que imprime?" foi tirada da execução real.
  - Cada mensagem de erro de compilação citada no texto foi copiada da saída do compilador. Alguns
    exemplos:
    - `cannot assign to struct field ... in map`;
    - `method Notify has pointer receiver`;
    - `generic method requires go1.27 or later`;
    - `unexported method decisao`;
    - `built-in min requires go1.21 or later`.
- **Linter de exaustividade:** para interface fechada é o `gochecksumtype`
  (`github.com/alecthomas/go-check-sumtype` v0.5.0, MIT/Unlicense, no golangci-lint); para enum de
  `iota` é o `exhaustive`. Os dois foram provados reprovando um `switch` incompleto.
- **Nil tipado:** o `go vet` não detecta, e o `staticcheck` detecta (SA4023). Isso virou invariante
  do marco 04.
- **Ponte planejada:** `design-de-codigo/02` entrou no `bridges-planned.yaml`.
- **Testes ajustados ao conteúdo novo:**
  - golden de blocos de hands-on;
  - `wantNoSection`, de onde saíram os marcos 03, 04 e 05;
  - `handson.spec.js`, por causa do título novo do tutorial do 01;
  - `skills.spec.js`: escolhe dinamicamente uma competência sem marcos, já que a `go-fintech`
    passou a marcar `arquitetura`.
- **Quizzes:** 24 questões nos marcos 01 a 05, 13 delas com código. A correta é a opção mais longa
  em 21% delas (limite de 40%).

## 12. Fase C — Bloco B (marcos 06 e 07)

O código foi executado num módulo temporário com `go 1.27` (toolchain 1.27.3), com
`errgroup` v0.24.0 e `goleak` v1.3.0. Achados que mudaram o texto do plano:

- **"Parar no primeiro erro" com `errgroup` não é instantâneo.**
  - O grupo cancela o contexto quando a função que falhou **retorna**.
  - Medição sem comporta: em 200 rodadas com 8 em voo, até 8 eventos começaram depois de o erro já
    ter sido detectado.
  - O desafio do 06 ganhou uma comporta explícita (checagem e início sob o mesmo mutex).
  - O invariante "começaram no máximo `k + N`" do primeiro rascunho estava errado e reprovou no
    `-race -count=30`. Goroutines rodam fora da ordem de despacho, então eventos depois do `k`
    começam antes dele.
  - O invariante correto é: nenhum evento começa depois que a comporta fecha; no máximo N−1 terminam
    depois do erro; nada fica em voo depois do retorno. Ficou verde em 40 rodadas com `-race`.
- **"`time.After` em laço vaza" (item do plano) está desatualizado.**
  - Desde o Go 1.23, com a linha `go` em 1.23 ou mais, timer sem referência é coletado mesmo sem
    `Stop` (release notes do 1.23, "Timer changes").
  - O marco 07 apresenta isso como mito com data, e o custo que sobra é uma alocação por iteração.
- **`synctest` acusa vazamento antes do `goleak`.**
  - Trocar o buffer do hedging por um channel sem buffer faz o `synctest.Test` falhar com
    `blocked goroutines remain`.
  - O `goleak.Find()` mostra a goroutine presa em `chan send` na versão com bug, fora da bolha.
- **Saídas reais dos quizzes:**
  - envio em channel fechado: `panic: send on closed channel`;
  - leitura de channel nil: `all goroutines are asleep - deadlock!`;
  - `select` com dois prontos: entre 479 e 521 vezes cada, em 1000 iterações;
  - mutex copiado: saldo continua 100, e o `vet` diz `passes lock by value`;
  - 100 consultas com timeout: 101 goroutines.
- **`handson.spec.js`:** o caso "sem tutorial, o primeiro bloco abre" passou a usar `kafka/anatomia`,
  porque todo marco da `go-fintech` agora tem tutorial.
- **Viés das respostas:** opções ajustadas para que a correta não seja a mais longa por padrão. Ficou
  a mais longa em 2 de 6 questões no 06 e em 1 de 6 no 07.

## 13. Fase D — Bloco C (marcos 08 a 11)

**Ambiente da conferência.**
- Módulo temporário com `go 1.27` (toolchain 1.27.3).
- Postgres 16 real: o `dockerd` subiu no próprio contêiner da sessão, e a imagem `postgres:16-alpine`
  veio pelo proxy.
- Bibliotecas: pgx v5.12.0, grpc v1.85.0, protobuf v1.36.12, testcontainers-go v0.45.0.
- `buf` v1.75.0, com os plugins locais `protoc-gen-go` e `protoc-gen-go-grpc` v1.6.2.
- Gremlins v0.5.1, que funciona com o Go 1.27.

**Marco 08 (HTTP).** Provado com `-race`:
- idempotência sob 50 requisições paralelas, e 409 para a mesma chave com corpo diferente;
- 413 com `MaxBytesReader`;
- Slowloris derrubado no prazo do `ReadHeaderTimeout`, num teste com `net.Dial` byte a byte;
- erro em Problem Details;
- `Shutdown` que termina a requisição em voo e recusa conexão nova.

O `gosec` acusa G112 no servidor sem `ReadHeaderTimeout`, e o mux de 1.22 responde 405 com
`Allow`.

**Marco 09 (persistência).** Contra o Postgres real:
- 10 mil transferências concorrentes com soma conservada, nenhuma conta negativa e pico de 10
  conexões em uso (`InUse == 0` no fim, 9.722 esperas pelo pool);
- travar na ordem do pedido: 33 de 40 abortadas com `40P01`;
- `rows` sem `Close` esgota o pool de 2.

O `noctx` acusa `Query`/`QueryRow` sem contexto. O `rowserrcheck` e o `sqlclosecheck` não acusaram
o exemplo de `rows` sem `Close`, e o texto não promete isso deles.

**Marco 10 (gRPC).**
- `buf lint` (STANDARD) limpo.
- Fallback dentro do deadline com o modelo fora; deadline propagado observado pelo interceptor;
  chamada sem deadline recusada.
- Tabela de status com `errdetails.BadRequest`.
- `buf breaking` reprova a troca de tipo do campo `valor`, citando o campo.

**Marco 11 (testes).**
- O fuzz achou o pânico do parser antigo em centésimos de segundo (`index out of range [3] with
  length 1`). O parser novo passou 10 s em cada um dos dois fuzz.
- O teste de contrato passou contra o fake e contra o Postgres do testcontainers.
- O Gremlins no `Allocate`: 13 mutantes mortos e 1 vivo, equivalente (`rest < 0` → `rest <= 0`).

**Referências que não abriram deste ambiente** (o proxy recusa o host):
- `www.rfc-editor.org` (RFC 9457) e `datatracker.ietf.org` (rascunho da `Idempotency-Key`);
- `grpc.io`, `google.aip.dev` e `buf.build`;
- `golang.testcontainers.org`.

As páginas do gRPC, da AIP-193 e do testcontainers foram conferidas no repositório que gera cada
site. A do `buf` voltou para a URL raiz da documentação.

**Viés das respostas:** opções ajustadas. A correta é a mais longa em 4 de 18 questões.

## 14. Fase E — Bloco D (marcos 12 a 14)

**Ambiente da conferência.**
- Módulo temporário com `go 1.27` (toolchain 1.27.3).
- OpenTelemetry SDK v1.47.0 (com o exportador em memória `tracetest`).
- `govulncheck` v1.9.0 e `benchstat` (x/perf).
- Docker na sessão, com `golang:1.27-alpine` e `gcr.io/distroless/static-debian12:nonroot`.

**Marco 12 (observabilidade).** Provado:
- todo log tem o `trace_id` do span (exportador em memória do SDK);
- o CPF não aparece no log nem nos atributos do span (`slog.LogValuer`);
- config inválida falha na subida e cita as três variáveis;
- `/readyz` responde 503 no drain, enquanto `/healthz` continua 200.

**Marco 13 (segurança e módulos).**
- **`govulncheck`:** o `vuln.go.dev` é bloqueado pelo proxy. A base local foi montada com o registro
  OSV real do GO-2021-0113, tirado do repositório `golang/vulndb`.
  - `x/text@v0.3.6` com `language.Parse` chamado: código 3, com o rastro da chamada.
  - Mesma versão sem chamar `Parse`: código 0, com o aviso de que o pacote é importado sem ser
    chamado.
  - Depois do upgrade para v0.3.7: código 0.
- **mTLS:** recusa cliente sem certificado e TLS 1.1 (CA gerada em memória).
- **SSRF:** o `Control` do `Dialer` recusa loopback, rede privada, link-local (inclusive
  `169.254.169.254`), IPv6 local e IPv4 mapeado em IPv6, e aceita IP público.
- **`os.Root`:** barra `..`, caminho absoluto e `a/../../x`.
- **Build reprodutível:** com `-trimpath -ldflags=-buildid=`, o mesmo código em dois diretórios deu o
  mesmo SHA-256; sem a flag, deu dois diferentes, e o caminho local aparece no binário.
- **Imagem:** *distroless* `nonroot`, sem `/bin/sh` (`stat /bin/sh: no such file or directory`),
  15,7 MB.
  - O build multi-stage **dentro** do Docker não rodou aqui: o contêiner de build não alcança o
    proxy de módulos. O binário foi compilado no host e copiado para a mesma imagem final.
- Os seis riscos da tabela OWASP foram conferidos na lista oficial de 2023 (repositório
  `OWASP/API-Security`).

**Marco 14 (runtime e performance).**
- **`GOMAXPROCS`:** num contêiner com `--cpus=2` numa máquina de 4 núcleos, o Go 1.27 reportou
  `NumCPU 4` e `GOMAXPROCS 2`.
- **`GOMEMLIMIT`:** com 36 MiB vivos e lixo constante num contêiner de 64 MiB, o processo foi morto
  por OOM (código 137) sem `GOMEMLIMIT`, e sobreviveu com `GOMEMLIMIT=50MiB`, ao custo de 3.223
  coletas em 4 s.
- **Benchmark do recibo** (`benchstat`, `-count=10`, `p=0,000`):
  - de 12 para 1 alocação por operação;
  - de 400 para 96 bytes por operação;
  - de 596 para 94 ns por operação.
- **Escape analysis:** mostra o argumento do `Sprintf` escapando para o heap.
- **Números das notas e da documentação, conferidos na fonte:**
  - PGO: de 2% a 14%, na documentação `doc/pgo`, medido com o Go 1.22;
  - Green Tea: de 10% a 40% (Go 1.26);
  - preempção assíncrona: Go 1.14.

**Viés das respostas:** a correta é a mais longa em 2 de 14 questões.
