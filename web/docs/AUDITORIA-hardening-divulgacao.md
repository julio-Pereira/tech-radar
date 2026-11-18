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
