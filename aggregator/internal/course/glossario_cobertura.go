package course

import (
	"fmt"
	"sort"
	"strings"
)

// GlossarioCobertura is one trilha's line of the glossary coverage report:
// how many verbetes resolve to a real milestone (MarcoID). Only a resolved
// marco counts — "marco 17" in a 13-marco trilha has Marco but no MarcoID —
// because #/revisar only shows a verbete once its marco is completed
// (web/js/review-deck.js); one without MarcoID never reaches the reader there.
type GlossarioCobertura struct {
	Slug     string
	Total    int
	ComMarco int
}

// SemMarco is how many verbetes stay out of the spaced review.
func (g GlossarioCobertura) SemMarco() int { return g.Total - g.ComMarco }

// Percentual is ComMarco/Total in whole percent, rounded down (so 94.9% never
// reads as 95%).
func (g GlossarioCobertura) Percentual() int {
	if g.Total == 0 {
		return 100
	}
	return g.ComMarco * 100 / g.Total
}

// CoberturaGlossario counts, per trilha, the verbetes with a resolved marco.
// Sorted by slug, so the report is stable.
func CoberturaGlossario(entries []GlossaryEntry) []GlossarioCobertura {
	by := map[string]*GlossarioCobertura{}
	for _, e := range entries {
		row, ok := by[e.Slug]
		if !ok {
			row = &GlossarioCobertura{Slug: e.Slug}
			by[e.Slug] = row
		}
		row.Total++
		if e.MarcoID != "" {
			row.ComMarco++
		}
	}
	rows := make([]GlossarioCobertura, 0, len(by))
	for _, r := range by {
		rows = append(rows, *r)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Slug < rows[j].Slug })
	return rows
}

// CoberturaGlossarioTexto renders the report as the golden file's plain text:
// one line per trilha, then the total. No dates, nothing that changes unless
// the content does.
func CoberturaGlossarioTexto(rows []GlossarioCobertura) string {
	var b strings.Builder
	b.WriteString("# Glossário: verbetes com marco resolvido (entram na revisão espaçada)\n")
	b.WriteString("# trilha  com_marco/total  percentual  sem_marco\n")
	total, com := 0, 0
	for _, r := range rows {
		fmt.Fprintf(&b, "%s %d/%d %d%% %d\n", r.Slug, r.ComMarco, r.Total, r.Percentual(), r.SemMarco())
		total += r.Total
		com += r.ComMarco
	}
	all := GlossarioCobertura{Slug: "total", Total: total, ComMarco: com}
	fmt.Fprintf(&b, "total %d/%d %d%% %d\n", all.ComMarco, all.Total, all.Percentual(), all.SemMarco())
	return b.String()
}

// CoberturaGlossarioMarkdown renders the same report for the CI job summary.
func CoberturaGlossarioMarkdown(rows []GlossarioCobertura) string {
	var b strings.Builder
	b.WriteString("\n## Glossário: verbetes com marco resolvido\n\n")
	b.WriteString("Só verbetes com marco entram na revisão espaçada (`#/revisar`). Um \"marco NN\" que não existe na trilha conta como sem marco.\n\n")
	b.WriteString("| Trilha | Com marco | Total | % | Sem marco |\n| --- | --- | --- | --- | --- |\n")
	for _, r := range rows {
		fmt.Fprintf(&b, "| `%s` | %d | %d | %d%% | %d |\n", r.Slug, r.ComMarco, r.Total, r.Percentual(), r.SemMarco())
	}
	return b.String()
}
