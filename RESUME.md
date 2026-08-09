# RESUME — trilhas kafka / kubernetes / observabilidade

Branch: `feat/trilhas-kafka-k8s-observabilidade` (saiu de `origin/main`).
Estado salvo antes do reboot do WSL em 2026-08-09.

## Onde parei

| Trilha | Marcos escritos | Falta | Commit |
| --- | --- | --- | --- |
| `kafka` | **01–08** (Fases A+B, completo) | — | `80aca08` |
| `kubernetes` | **01–08** de 14 | **09, 10, 11** para fechar a Fase B | wip |
| `observabilidade` | **01–04** de 17 (Fase A) | **05, 06** (Fase B) | wip |

## Próximos passos, na ordem

1. **kubernetes 09–11** (fecha o Bloco C, "segurança" — Fase B do plano):
   - `09-seguranca-do-workload.md` → `id: seguranca-workload`
     Pod Security Standards `restricted`, `runAsNonRoot`, `readOnlyRootFilesystem`,
     drop de capabilities, seccomp; container não é fronteira forte. Supply chain:
     distroless, pin por digest, scanning, SBOM, cosign/Sigstore. Admission com
     Kyverno/Gatekeeper que **bloqueia** (não avisa).
     Desafio: policy Kyverno que rejeita imagem sem digest, com teste provando o bloqueio.
   - `10-rbac-identidade-e-auditoria.md` → `id: rbac-e-auditoria`
     Role/ClusterRole/binding, SA por workload, least privilege,
     `automountServiceAccountToken: false`, IRSA/Workload Identity, audit log do API
     server, SoD, quebra-vidro.
     Desafio: uma SA por serviço com o menor Role que funciona; `kubectl auth can-i`
     nega o resto.
   - `11-networkpolicy-e-service-mesh.md` → `id: rede-segura`
     default-deny, ingress/egress, DNS como pegadinha, allowlist de egress para PSP,
     service mesh (mTLS, sidecar vs ambient) e **quando não vale**.
     Tutorial: default-deny no namespace liberando só gateway→pix-gateway→kafka.
   - Adicionar os três a `milestones:` em `content/courses/kubernetes/course.yaml`.

2. **observabilidade 05–06** (Fase B do plano v2):
   - `05-opentelemetry-fundamentos.md` → `id: opentelemetry`
     API/SDK/OTLP/Collector, semantic conventions, context propagation W3C, auto vs
     manual, status dos 4 sinais (profiles em alpha).
     *Reencontro obrigatório:* os 4 sinais do marco 04, agora como especificação.
   - `06-collector-e-pipelines.md` → `id: collector-e-pipelines`
     receivers/processors/exporters, agent + gateway, `batch`/`memory_limiter`/
     `attributes`, tail sampling, OTel Operator, Grafana Alloy como alternativa.
     *Reencontro obrigatório:* cardinalidade (marco 04) vira `attributes` processor;
     amostragem vira decisão de custo (gancho para o marco 16).
   - Adicionar os dois a `milestones:` em `content/courses/observabilidade/course.yaml`.

3. **Commits.** O usuário escolheu **um commit por trilha**. Há um commit `wip:` com
   kubernetes 01–08 + observabilidade 01–04. Para fechar:
   `git reset --soft HEAD~1` e então dois commits, um por trilha.
   (Se o wip já tiver sido enviado ao remoto, isso exige force-push — perguntar antes.)

4. **Verificação** a cada rodada, do diretório `aggregator/`:
   ```
   go run . 2>&1 | grep -iE "compiled|WARN"
   ```
   Precisa sair `compiled 5 course(s)` **sem nenhum WARN**. Um WARN significa curso
   inteiro pulado — quase sempre arquivo listado em `milestones:` que não existe.
   Depois: `git restore aggregator/cache/` (o build refaz o fetch e suja o cache;
   ele não faz parte destas mudanças).

## Convenções firmadas (seguir nos marcos restantes)

- Frontmatter: `id`, `title`, `summary`, `estimatedMinutes` (40–55 neste nível),
  `references` (2–4 links oficiais). O `id` tem que bater com o do plano.
- Corpo: seções `##`, uma `## Exemplo numa fintech` que avança o `fin-platform`, uma
  `## Hands-on` (tutorial e/ou desafio **com invariante testável** + `**Checagem.**`
  com 3–4 perguntas), e fecha com `## Principais aprendizados` (4 bullets).
- **Não** criar `.tutorial.md` / `.challenge.md` / `.quiz.yaml` nem usar
  `completion:` — o compilador ignora; hands-on vai embutido no corpo do marco.
- `course.yaml` lista **só os marcos que existem** — arquivo faltando derruba o curso
  inteiro no compile.
- `web/data/courses/` é gitignored (CI gera). Commitar só o conteúdo-fonte.
- Ponte explícita com as outras trilhas em todo marco que permitir.

## Fora do escopo desta rodada

Fases C+ das três trilhas (kubernetes 12–14, observabilidade 07–17), `PROJETO.md` /
`GLOSSARIO.md` (ficariam invisíveis no site), retrofit do `## Capstone` em
`spring-boot` e `go-fintech`.
