# Auditoria — hardening antes da divulgação pública

Registro do plano de *hardening* antes de divulgar o Tech Radar (LinkedIn e Substack). O objetivo não é
proteger dado pessoal, que o site não coleta, e sim impedir que terceiros alterem o que o site mostra ou
abusem do nome dele. Os controles e as limitações aceitas estão no `SECURITY.md`, na raiz.

## Fase 0 — o que o `main` já tinha (18 nov 2026)

O plano cita a auditoria `claude/AUDITORIA-main-2026-11-02.md` (itens S1, S2, F1–F3 e P1–P4). Esse arquivo
**não está no repositório**, nem no histórico de nenhuma *branch*. A conferência abaixo foi feita contra o
código do `main` (commit `8ce4d2c`), usando a descrição que o próprio plano dá de cada item.

| Item | O que o plano descreve | Estado no `main` |
| --- | --- | --- |
| S1 | Go e `x/net` desatualizados sob o `bluemonday` | **pendente**: `go 1.22` no `go.mod` e nos *workflows*, `x/net v0.26.0`, `bluemonday v1.0.27`. O `govulncheck` não roda neste ambiente (o banco `vuln.go.dev` está bloqueado); vai rodar no CI, na Fase 2 |
| S2 | *Actions* por *tag* e permissões largas | **pendente**: todas as `uses:` por *tag* (`@v4`, `@v5`); `pages: write` e `id-token: write` no *workflow* inteiro do `build.yml`, e não só no *job* `deploy` |
| P1 | *Deploy* sem depender dos testes | **parcial**: o *job* `build` roda `go test ./...` antes do *deploy*, mas o `deploy` não espera os testes de UI (`e2e`, outro *workflow*) |
| F1 | `StrictPolicy` e `html.UnescapeString` | **parcial**: título, resumo e autor passam pelo `StrictPolicy`, e o front usa só `textContent`. Falta o `html.UnescapeString` depois da sanitização; isso é exibição (`&amp;` literal), e não falha de segurança |
| F2 | Validação da URL do item no *build* | **pendente**: qualquer `link` do feed vai para o `href`. Hoje, um `javascript:` só é contido pela CSP (`script-src 'self'`) |
| F3 | CSP e Trusted Types | **parcial**: CSP em `<meta>` com `default-src`, `script-src` e `style-src 'self'`, sem `'unsafe-inline'`; faltam `object-src`, `base-uri`, `form-action`, `img-src` e o `referrer`. Há 5 `innerHTML = ''` (`radar.js` e `search.js`) |
| P3 | Cache do feed congelado | **pendente**: `aggregator/cache/` é versionado, mas o CI não grava o cache de volta (`contents: read`). O último *commit* do cache é de 10 out 2026, e é ele que entra quando uma fonte falha |
| P4 | `fetch` e `normalize` sem teste | **pendente**: nenhum `_test.go` nos dois pacotes |

Links externos: o radar (`radar.js`) e as trilhas (`content-blocks.js`) já abrem em nova aba com
`rel="noopener noreferrer"`. Falta o `nofollow` que o plano pede.

Domínio: o site fica em `julio-pereira.github.io/tech-radar`, sem `CNAME`. A Fase 5 se resume a registrar
essa decisão (feito no `SECURITY.md`).

## Fase 1 — conta e repositório (T1, T5)

### No repositório

- **`SECURITY.md`:** canal de reporte (reporte privado do GitHub), escopo, a tabela de controles da
  interface, a ordem "revogar antes de reescrever" e as limitações aceitas.
- **`.github/CODEOWNERS`:** `* @julio-Pereira`. O `SECURITY.md` explica por que **não** exigir a revisão do
  dono no *ruleset*, com um mantenedor só.
- **Varredura do histórico** com o gitleaks 8 (instalado do código-fonte, `go install`), em todas as
  *branches* (`--log-opts="--all"`): 258 *commits*, **4 achados, todos falsos positivos**:
  - `generic-api-key` em `spring-boot/09`: o texto `principal=<sub do token>` de uma tabela;
  - `curl-auth-user` em `seguranca-aplicacao/05` (3 *commits* do mesmo trecho):
    `-u "pix-gateway:$(cat client-secret.txt)"`, em que o segredo é lido de um arquivo local.

  O `.gitleaks.toml` mantém as regras padrão e abre exceção só para esses dois padrões de linha. A primeira
  versão usava um `.gitleaksignore` por impressão digital, que inclui o número da linha e quebraria na
  próxima edição da trilha. Com a configuração, a varredura do histórico e a do diretório de trabalho saem
  limpas. Um canário com um *token* do GitHub falso continua sendo pego.
- **O e-mail pessoal do mantenedor aparece como autor em 111 *commits*.** Não é credencial, mas é dado
  pessoal num repositório público. Reescrever o histórico para tirá-lo quebraria todo clone e *fork* e não
  apaga o que já foi copiado. A recomendação é ligar, na conta, "Keep my email address private" e "Block
  command line pushes that expose my email", para os *commits* novos (no `SECURITY.md`). A decisão de
  reescrever, ou não, é do mantenedor.

### Na interface do GitHub (pelo mantenedor)

Os itens manuais do plano estão no `SECURITY.md`, com um ajuste: os *status checks* obrigatórios são os
nomes dos *jobs*. Hoje, o único que roda em todo PR é o `e2e`. O `lld` tem filtro de caminho, e exigi-lo
travaria os PRs que não mexem em desafio. O `build` roda só depois do *merge*. O *job* `lint` entra na
Fase 2.

| Controle | Estado |
| --- | --- |
| 2FA | a confirmar pelo mantenedor |
| *Ruleset* da `main` | a confirmar pelo mantenedor |
| *Actions*: aprovação de colaboradores de fora; `GITHUB_TOKEN` só leitura | a confirmar pelo mantenedor |
| *Secret scanning*, *push protection*, Dependabot, reporte privado | a confirmar pelo mantenedor |
| Pages com "Enforce HTTPS" e origem "GitHub Actions" | a confirmar pelo mantenedor |
| E-mail privado na conta | a confirmar pelo mantenedor |

## Fase 2 — pipeline (T1, T4)

| Item do plano | Feito |
| --- | --- |
| `uses:` por SHA completo, com a versão em comentário | todas as 7 *actions*, nas versões atuais (`checkout` v7.0.1, `setup-go` v7.1.0, `setup-node` v7.1.0, `setup-java` v6.3.0, `upload-artifact` v7.0.2, `upload-pages-artifact` v5.0.0, `deploy-pages` v5.0.1), com os SHAs lidos das *tags* nos repositórios oficiais |
| `permissions: {}` no topo; cada *job* com o mínimo | sim; `pages: write` e `id-token: write` só no *job* `deploy`; `issues: write` só no *job* do `content-freshness` |
| Sem `pull_request_target`, `workflow_run` nem `github.event` em `run:` | nenhum dos três aparece (`grep`) |
| `persist-credentials: false` | em todo `checkout`: nenhum *job* faz *push* |
| `deploy` com `needs: [build, lint, e2e]` | sim. O `lint` e o `e2e` viraram *workflows* reutilizáveis: rodam sozinhos em cada PR e são chamados pelo `Build & Deploy` antes do *deploy*, no mesmo *commit* |
| *Environment* `github-pages` só na `main` | configuração da interface (no `SECURITY.md`) |
| *Job* `lint` | `gofmt`, `go vet`, `staticcheck`, `govulncheck` (no `aggregator` e no `tools/fin-check`), `actionlint` e `gitleaks` no histórico inteiro, cada ferramenta com versão fixada |
| Go atual e dependências | Go **1.27** com `toolchain go1.27.4` nos dois módulos; os *workflows* leem a versão do `go.mod`. `go get -u ./...` e `go mod tidy`: `x/net` v0.26.0 → v0.63.0, `gofeed` 1.3.0 → 1.5.0, `goldmark` 1.7.8 → 1.8.7, `x/sync`, `x/text`, `goquery`, `cascadia`. O `bluemonday` 1.0.27 já era a última versão |
| `dependabot.yml` | `github-actions`, `gomod` (`aggregator` e `tools/fin-check`) e `npm` (`web`, só a bancada de testes), semanal e agrupado |

**Conferências locais.**

- **Saída idêntica:** as 28 trilhas compiladas com as dependências novas saem byte a byte iguais às do
  `main`. Só muda o `generatedAt` do índice. Os testes de bloco só contam seções e não provariam isso
  sozinhos.
- **Ferramentas limpas:** `go test ./...`, `go vet`, `staticcheck`, `gofmt` e `actionlint` passam.
- **Correções que as ferramentas pediram:** o `staticcheck` apontou duas cópias campo a campo entre tipos
  idênticos (S1016), que viraram conversões. Com elas, um campo novo num dos tipos quebra a compilação, em
  vez de ser esquecido. O `gofmt` reformatou dois arquivos.
- **`govulncheck`:** o banco `vuln.go.dev` está bloqueado neste ambiente, então o resultado vem do *job*
  `lint` do CI.

**Custo:** o *cron* de 6 em 6 horas passa a rodar também o `lint` e o `e2e` antes de cada *deploy*. É o
preço de "nada vai ao ar com teste vermelho".
