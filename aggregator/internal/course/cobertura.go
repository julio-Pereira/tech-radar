package course

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Visual coverage report (diagram plan, Fase 5): per track, how many
// diagrams it has, which milestones with prose still have none, and how many
// ASCII diagrams remain. It reads the sources, not the build output, so a
// track that fails to compile still shows up. CI publishes it as an
// artifact and in the job summary; it informs, it does not gate — the gates
// are the compiler's (an ASCII diagram is already a build error).

// A milestone still waiting for its prose (credito-e-risco/04–12, for
// example) opens with this quote; it has nothing to draw yet.
var stubRe = regexp.MustCompile(`(?m)^> \*\*Stub\.\*\*`)

// CoberturaTrilha is one row of the report.
type CoberturaTrilha struct {
	Slug        string
	Marcos      int      // milestones in the manifest
	Stubs       int      // milestones without prose yet
	ComDiagrama int      // milestones (with prose) that have at least one diagram
	SemDiagrama []string // milestones with prose and no diagram
	// Gatilho lists, among SemDiagrama, the milestones whose prose shows a
	// sign of the convention's trigger (≥ 3 components, message order, life
	// cycle, pipeline), with the reason. A heuristic, never a gate.
	Gatilho []Gatilho
	Diagramas   int      // distinct diagrams referenced
	Animados    int
	Graficos    int
	ASCII       int
}

// Gatilho is a milestone without a diagram and the signs its prose shows.
type Gatilho struct{ Marco, Motivo string }

// Minimo is the plan's floor: ⌈milestones with prose / 2⌉ diagrams.
func (c CoberturaTrilha) Minimo() int { return (c.Marcos - c.Stubs + 1) / 2 }

// Cobertura scans every course under contentDir.
func Cobertura(contentDir string) ([]CoberturaTrilha, error) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", contentDir, err)
	}
	var out []CoberturaTrilha
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, e.Name())
		if _, err := os.Stat(filepath.Join(dir, "course.yaml")); err != nil {
			continue
		}
		row, err := coberturaTrilha(dir)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", e.Name(), err)
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slug < out[j].Slug })
	return out, nil
}

func coberturaTrilha(dir string) (CoberturaTrilha, error) {
	m, err := ParseManifest(filepath.Join(dir, "course.yaml"))
	if err != nil {
		return CoberturaTrilha{}, err
	}
	row := CoberturaTrilha{Slug: m.Slug, Marcos: len(m.Milestones)}
	used := map[string]bool{}
	for _, file := range m.Milestones {
		body, err := os.ReadFile(filepath.Join(dir, file))
		if err != nil {
			return CoberturaTrilha{}, err
		}
		row.ASCII += countASCIIDiagrams(body)
		if stubRe.Match(body) {
			row.Stubs++
			continue
		}
		ids := 0
		for _, f := range diagramaFenceRe.FindAllSubmatch(body, -1) {
			for _, l := range strings.Split(string(f[1]), "\n") {
				if l = strings.TrimSpace(l); l != "" {
					used[l] = true
					ids++
				}
			}
		}
		if ids > 0 {
			row.ComDiagrama++
		} else {
			name := strings.TrimSuffix(file, ".md")
			row.SemDiagrama = append(row.SemDiagrama, name)
			if why := sinaisDeGatilho(body); why != "" {
				row.Gatilho = append(row.Gatilho, Gatilho{name, why})
			}
		}
	}
	row.Diagramas = len(used)
	for id := range used {
		data, err := os.ReadFile(filepath.Join(dir, "diagramas", id+".yaml"))
		if err != nil {
			continue // the compiler reports a dangling reference
		}
		var d struct {
			Tipo     string    `yaml:"tipo"`
			Animacao yaml.Node `yaml:"animacao"`
		}
		if yaml.Unmarshal(data, &d) != nil {
			continue
		}
		if d.Tipo == "grafico" {
			row.Graficos++
		}
		if !d.Animacao.IsZero() {
			row.Animados++
		}
	}
	return row, nil
}

var (
	// The prose before the example and the hands-on: every hands-on has
	// numbered lists, which would match the step-list signal.
	gatilhoFimRe = regexp.MustCompile(`(?m)^## (Exemplo numa fintech|Hands-on)`)
	// Configuration and shell blocks chained in the prose (a manifest, then
	// the command that applies it) describe components wired together.
	gatilhoConfigRe = regexp.MustCompile("(?m)^```(ya?ml|json|properties|toml|hcl|xml|ini|bash|sh|shell)[ \t]*$")
	gatilhoListaRe  = regexp.MustCompile(`(?m)(?:^\d+\. .*\n(?:^ +.*\n)*){4,}`)
	gatilhoItemRe   = regexp.MustCompile(`(?m)^\d+\. `)
	gatilhoVerboRe  = regexp.MustCompile(`(?i)\b(envia|recebe|chama|publica|consome|grava|lê|le|valida|retorna|devolve|cria|aplica|executa|dispara|propaga|escreve|consulta|reconcilia|assina|troca|emite|processa)`)
	gatilhoEstadoRe = regexp.MustCompile(`(?i)\b(estados?|transição|transições)\b`)
)

// sinaisDeGatilho returns why a milestone without a diagram looks like it
// should have one, or "". Calibrated on the content at the end of the
// diagram plan: kubernetes/10, kafka/09 and kafka/11 showed up, and the
// whole list stayed under 15 milestones.
func sinaisDeGatilho(body []byte) string {
	if loc := gatilhoFimRe.FindIndex(body); loc != nil {
		body = body[:loc[0]]
	}
	var why []string
	if n := len(gatilhoConfigRe.FindAll(body, -1)); n >= 2 {
		why = append(why, fmt.Sprintf("%d blocos de configuração", n))
	}
	for _, lista := range gatilhoListaRe.FindAll(body, -1) {
		itens := gatilhoItemRe.Split(string(lista), -1)[1:]
		comVerbo := 0
		for _, it := range itens {
			if gatilhoVerboRe.MatchString(it) {
				comVerbo++
			}
		}
		if comVerbo >= 4 {
			why = append(why, "lista de passos")
			break
		}
	}
	if n := strings.Count(string(body), "→"); n >= 4 {
		why = append(why, fmt.Sprintf("%d setas", n))
	}
	if n := len(gatilhoEstadoRe.FindAll(body, -1)); n >= 6 {
		why = append(why, fmt.Sprintf("%d termos de estado", n))
	}
	return strings.Join(why, ", ")
}

// CoberturaMarkdown renders the report for the CI job summary.
func CoberturaMarkdown(rows []CoberturaTrilha) string {
	var b strings.Builder
	total, abaixo, ascii := 0, 0, 0
	for _, r := range rows {
		total += r.Diagramas
		ascii += r.ASCII
		if r.Diagramas < r.Minimo() {
			abaixo++
		}
	}
	fmt.Fprintf(&b, "# Cobertura visual das trilhas\n\n")
	fmt.Fprintf(&b, "%d trilhas, %d diagramas, %d abaixo do mínimo, %d diagramas ASCII.\n\n", len(rows), total, abaixo, ascii)
	b.WriteString("Mínimo: ⌈marcos com prosa / 2⌉. Stubs (marcos sem prosa ainda) não contam.\n\n")
	b.WriteString("| Trilha | Marcos | Stubs | Com diagrama | Diagramas | Mín. | Animados | Gráficos | ASCII |\n")
	b.WriteString("|---|---:|---:|---:|---:|---:|---:|---:|---:|\n")
	for _, r := range rows {
		diag := fmt.Sprint(r.Diagramas)
		if r.Diagramas < r.Minimo() {
			diag += " ⚠"
		}
		fmt.Fprintf(&b, "| `%s` | %d | %d | %d | %s | %d | %d | %d | %d |\n",
			r.Slug, r.Marcos, r.Stubs, r.ComDiagrama, diag, r.Minimo(), r.Animados, r.Graficos, r.ASCII)
	}
	b.WriteString("\n## Marcos com prosa e sem diagrama\n\n")
	any := false
	for _, r := range rows {
		if len(r.SemDiagrama) == 0 {
			continue
		}
		any = true
		fmt.Fprintf(&b, "- `%s` (%d): %s\n", r.Slug, len(r.SemDiagrama), strings.Join(r.SemDiagrama, ", "))
	}
	if !any {
		b.WriteString("Nenhum.\n")
	}
	b.WriteString("\n## Marcos sem diagrama com sinal de gatilho\n\n")
	b.WriteString("Informativo: a prosa tem ≥ 2 blocos de configuração ou shell, uma lista de ≥ 4 passos com verbos de fluxo, ≥ 4 setas ou ≥ 6 termos de estado. O gatilho é julgamento de autor; confira o marco antes de desenhar.\n\n")
	any = false
	for _, r := range rows {
		for _, g := range r.Gatilho {
			any = true
			fmt.Fprintf(&b, "- `%s/%s`: %s\n", r.Slug, g.Marco, g.Motivo)
		}
	}
	if !any {
		b.WriteString("Nenhum.\n")
	}
	return b.String()
}
