package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Unit tests: the chaining rule in isolation ──────────────────────────────

func TestLinkifyBridgesFullReference(t *testing.T) {
	index := bridgeIndex{"kafka": {"08": "particionamento"}}
	body := "Veja `kafka/08` para mais.\n"
	sections, broken, err := splitSections([]byte(body), index, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(broken) != 0 {
		t.Fatalf("got broken = %v, want none", broken)
	}
	html := sections[0].HTML
	if !strings.Contains(html, `href="#/learn/kafka/particionamento"`) {
		t.Errorf("link not generated with the right href, got: %s", html)
	}
	if !strings.Contains(html, "<code>kafka/08</code>") {
		t.Errorf("bridge text should stay styled as code inside the link, got: %s", html)
	}
}

func TestLinkifyBridgesShorthandChain(t *testing.T) {
	index := bridgeIndex{"kafka": {"08": "particionamento", "11": "tiered-storage"}}
	body := "Reencontro — `kafka/08` e `/11`.** Ambos se aplicam aqui.\n"
	sections, broken, err := splitSections([]byte(body), index, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(broken) != 0 {
		t.Fatalf("got broken = %v, want none", broken)
	}
	html := sections[0].HTML
	if !strings.Contains(html, `href="#/learn/kafka/particionamento"`) {
		t.Errorf("full bridge did not resolve, got: %s", html)
	}
	if !strings.Contains(html, `href="#/learn/kafka/tiered-storage"`) {
		t.Errorf("shorthand /11 did not inherit kafka from the chain, got: %s", html)
	}
}

func TestLinkifyBridgesProseBreaksTheChain(t *testing.T) {
	// Real case found in this repo's own content (engenharia-de-dados/10):
	// a bare "/NN" after real prose must NOT silently inherit a slug it
	// isn't actually about — dados-distribuidos/09 exists too, and picking
	// it instead of the intended seguranca-aplicacao/09 would be a silent
	// wrong link, worse than reporting it broken.
	index := bridgeIndex{
		"dados-distribuidos":  {"09": "cache", "13": "lgpd-e-retencao"},
		"seguranca-aplicacao": {"09": "criptografia-aplicada"},
	}
	body := "`dados-distribuidos/13` não cobre isso (ele trata de outra coisa). `/09` cobre o resto.\n"
	_, broken, err := splitSections([]byte(body), index, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(broken) != 1 {
		t.Fatalf("got broken = %v, want exactly 1 (the orphaned /09)", broken)
	}
}

func TestLinkifyBridgesUnknownSlugIsBrokenUnlessPlanned(t *testing.T) {
	body := "Em breve: `trilha-inexistente/99`.\n"

	t.Run("not in bridges-planned.yaml fails", func(t *testing.T) {
		_, broken, err := splitSections([]byte(body), bridgeIndex{}, nil)
		if err != nil {
			t.Fatalf("splitSections: %v", err)
		}
		if len(broken) != 1 || broken[0] != "trilha-inexistente/99" {
			t.Fatalf("got broken = %v, want [\"trilha-inexistente/99\"]", broken)
		}
	})

	t.Run("listed in bridges-planned.yaml is allowed", func(t *testing.T) {
		planned := map[string]bool{"trilha-inexistente/99": true}
		sections, broken, err := splitSections([]byte(body), bridgeIndex{}, planned)
		if err != nil {
			t.Fatalf("splitSections: %v", err)
		}
		if len(broken) != 0 {
			t.Fatalf("got broken = %v, want none (allow-listed)", broken)
		}
		if strings.Contains(sections[0].HTML, "<a") {
			t.Errorf("a planned (not-yet-existing) bridge must stay a plain code span, got: %s", sections[0].HTML)
		}
	})
}

func TestLinkifyBridgesUnrecognizedBoldDoesNotResetUnrelatedCodeSpans(t *testing.T) {
	// A code span that isn't bridge-shaped at all (e.g. a real identifier
	// like `plataforma/`) must never be mistaken for one.
	body := "Construa `plataforma/` com dois serviços.\n"
	_, broken, err := splitSections([]byte(body), bridgeIndex{}, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(broken) != 0 {
		t.Fatalf("got broken = %v, want none — `plataforma/` is not a bridge", broken)
	}
}

// ── Integration: the real content tree ──────────────────────────────────────

// TestBridgesResolve is the task's named test: every `slug/NN` (and same-
// trilha `/NN` shorthand) bridge in every real milestone must resolve to an
// existing marco, unless it's explicitly listed in bridges-planned.yaml.
// The first run of this test found 10 real bridges that were ambiguous (a
// bare "/NN" with real prose before it, sometimes with a plausible-but-wrong
// same-numbered marco in a nearer-mentioned trilha) — all fixed by
// restating the slug explicitly in the source .md files; see the PR.
func TestBridgesResolve(t *testing.T) {
	index, err := buildBridgeIndex(contentDir)
	if err != nil {
		t.Fatalf("build bridge index: %v", err)
	}
	planned, err := loadPlannedBridges("../../content/bridges-planned.yaml")
	if err != nil {
		t.Fatalf("load bridges-planned.yaml: %v", err)
	}

	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}

	checked := 0
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		manifest, err := ParseManifest(filepath.Join(contentDir, d.Name(), "course.yaml"))
		if err != nil {
			t.Fatalf("%s: %v", d.Name(), err)
		}
		for _, m := range manifest.Milestones {
			path := filepath.Join(contentDir, d.Name(), m)
			_, _, _, broken, err := ParseMilestone(path, index, planned)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			checked++
			for _, ref := range broken {
				t.Errorf("%s: unresolved bridge %q — fix the reference or add it to bridges-planned.yaml", path, ref)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no milestones were checked")
	}
	t.Logf("checked %d milestones for broken bridges", checked)
}

// TestBridgesPlannedFileRejectsMissingRef guards the loader itself: a
// malformed bridges-planned.yaml entry fails loudly instead of silently
// allow-listing every unresolved bridge (an empty "ref" would match nothing
// specific, which defeats the point of an explicit, reviewed exception).
func TestBridgesPlannedFileRejectsMissingRef(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bridges-planned.yaml")
	if err := os.WriteFile(path, []byte("- motivo: \"sem ref\"\n  ate: 2026-12-31\n"), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if _, err := loadPlannedBridges(path); err == nil {
		t.Fatal("expected an error for an entry missing \"ref\", got nil")
	}
}

func TestBridgesPlannedFileMissingIsFine(t *testing.T) {
	planned, err := loadPlannedBridges(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
	if err != nil {
		t.Fatalf("missing file should not be an error: %v", err)
	}
	if len(planned) != 0 {
		t.Fatalf("got %d entries, want 0", len(planned))
	}
}
