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
	Diagramas   int      // distinct diagrams referenced
	Animados    int
	Graficos    int
	ASCII       int
}

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
			row.SemDiagrama = append(row.SemDiagrama, strings.TrimSuffix(file, ".md"))
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
	return b.String()
}
