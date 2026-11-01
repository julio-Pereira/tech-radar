package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCoberturaCountsWhatTheReaderSees(t *testing.T) {
	dir := t.TempDir()
	trilha := filepath.Join(dir, "t")
	write := func(rel, content string) {
		p := filepath.Join(trilha, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("course.yaml", "slug: t\ntitle: T\nmilestones: [01-a.md, 02-b.md, 03-c.md, 04-d.md]\n")
	// Side by side: two diagrams in one block, both counted.
	write("01-a.md", "Texto.\n\n```diagrama\nanimado\ncurva\n```\n")
	write("02-b.md", "Só prosa, e um ASCII esquecido:\n\n```\nA --> B\n```\n")
	write("03-c.md", "Mesmo diagrama de novo, contado uma vez.\n\n```diagrama\nanimado\n```\n")
	write("04-d.md", "> **Stub.** Este marco ainda não tem conteúdo.\n")
	write("diagramas/animado.yaml", "id: animado\ntipo: topologia\nanimacao:\n  - legenda: x\n")
	write("diagramas/curva.yaml", "id: curva\ntipo: grafico\n")

	rows, err := Cobertura(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("want 1 track, got %d", len(rows))
	}
	r := rows[0]
	if r.Marcos != 4 || r.Stubs != 1 || r.ComDiagrama != 2 || r.Diagramas != 2 || r.Animados != 1 || r.Graficos != 1 || r.ASCII != 1 {
		t.Fatalf("unexpected row: %+v", r)
	}
	if r.Minimo() != 2 {
		t.Fatalf("minimum is ⌈3 milestones with prose / 2⌉ = 2, got %d", r.Minimo())
	}
	if strings.Join(r.SemDiagrama, ",") != "02-b" {
		t.Fatalf("milestones without diagram: %v (a stub is not listed)", r.SemDiagrama)
	}
	md := CoberturaMarkdown(rows)
	for _, want := range []string{"| `t` | 4 | 1 | 2 | 2 | 2 | 1 | 1 | 1 |", "- `t` (1): 02-b"} {
		if !strings.Contains(md, want) {
			t.Fatalf("report is missing %q:\n%s", want, md)
		}
	}
}

// The real content: every track appears in the report, and none has an
// ASCII diagram left (the compiler already refuses them; this names them).
func TestCoberturaRealContent(t *testing.T) {
	rows, err := Cobertura(contentDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		t.Fatal("no tracks in the coverage report")
	}
	for _, r := range rows {
		if r.ASCII > 0 {
			t.Errorf("%s: %d diagrama(s) ASCII", r.Slug, r.ASCII)
		}
	}
}
