package course

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseGlossaryEntriesHappyPath(t *testing.T) {
	src := []byte(`Preâmbulo explicando o glossário, não é um verbete.

## Grupo

### Termo A
**Em uma frase:** resumo de A.
**No fin-platform:** exemplo de A.
**Erro comum:** erro de A.
**Onde na prática:** marco 03.

### Termo B
**Em uma frase:** resumo de B.
**No fin-offers:** exemplo de B.
**Erro comum:** erro de B.
**Onde na prática:** marco 07, retomado no 09.
`)
	entries, err := parseGlossaryEntries(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2 entries, got %d: %+v", len(entries), entries)
	}
	if entries[0].Term != "Termo A" || entries[0].Anchor != "termo-a" || entries[0].Summary != "resumo de A." || entries[0].Marco != "03" {
		t.Fatalf("entry 0 wrong: %+v", entries[0])
	}
	// The 2nd field's label legitimately varies ("No fin-offers" vs "No
	// fin-platform") and is matched by position, not literal text.
	if entries[1].Marco != "07" {
		t.Fatalf("entry 1 should pick the FIRST marco out of prose, got %q", entries[1].Marco)
	}
}

func TestParseGlossaryEntriesMissingFieldFails(t *testing.T) {
	src := []byte(`### Termo incompleto
**Em uma frase:** resumo.
**Erro comum:** erro.
**Onde na prática:** marco 01.
`)
	if _, err := parseGlossaryEntries(src); err == nil {
		t.Fatal("expected an error for a term with only 3 of the 4 required fields")
	}
}

func TestParseGlossaryEntriesStripsInlineMarkup(t *testing.T) {
	src := []byte("### WAL e `fsync`\n" +
		"**Em uma frase:** resumo com `código` e *ênfase*.\n" +
		"**No fin-platform:** exemplo.\n" +
		"**Erro comum:** erro.\n" +
		"**Onde na prática:** marco 06 e `kubernetes` [E1].\n")
	entries, err := parseGlossaryEntries(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries[0].Term != "WAL e fsync" {
		t.Fatalf("term still has markup: %q", entries[0].Term)
	}
	if entries[0].Summary != "resumo com código e ênfase." {
		t.Fatalf("summary still has markup: %q", entries[0].Summary)
	}
	if entries[0].Marco != "06" {
		t.Fatalf("marco extraction broke after markup in the same field: %q", entries[0].Marco)
	}
}

func TestParseGlossaryEntriesNoMarcoFoundIsNotAnError(t *testing.T) {
	src := []byte(`### Termo sem número
**Em uma frase:** resumo.
**No fin-platform:** exemplo.
**Erro comum:** erro.
**Onde na prática:** em toda a trilha, sem marco específico.
`)
	entries, err := parseGlossaryEntries(src)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries[0].Marco != "" {
		t.Fatalf("expected no marco parsed, got %q", entries[0].Marco)
	}
}

func TestCompileGlossaryResolvesMarcoIDAndDedupesAcrossTracks(t *testing.T) {
	courses := map[string]CompiledCourse{
		"trilha-a": {Slug: "trilha-a", Title: "Trilha A", Milestones: []CompiledMilestone{{ID: "m1"}}},
		"trilha-b": {Slug: "trilha-b", Title: "Trilha B", Milestones: []CompiledMilestone{{ID: "n1"}}},
	}
	bridgeIdx := bridgeIndex{
		"trilha-a": {"01": "m1"},
		"trilha-b": {"01": "n1"},
	}

	dir := t.TempDir()
	writeCourseFixture(t, dir, "trilha-a", "glossario.md", `### SLO
**Em uma frase:** A.
**No fin-platform:** a.
**Erro comum:** a.
**Onde na prática:** marco 01.
`)
	writeCourseFixture(t, dir, "trilha-b", "glossario.md", `### SLO
**Em uma frase:** B.
**No fin-platform:** b.
**Erro comum:** b.
**Onde na prática:** marco 01.
`)

	entries, err := compileGlossary(dir, courses, bridgeIdx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("want 2 entries (one per trilha, no merge), got %d: %+v", len(entries), entries)
	}
	for _, e := range entries {
		if e.Anchor != "slo" {
			t.Fatalf("anchor should be shared across trilhas for the same term: %+v", e)
		}
		if e.MarcoID == "" {
			t.Fatalf("expected a resolved marcoId: %+v", e)
		}
	}
}

// writeCourseFixture writes a minimal course.yaml + glossary file under
// dir/slug, enough for compileGlossary's own manifest read.
func writeCourseFixture(t *testing.T, dir, slug, glossaryFile, glossaryBody string) {
	t.Helper()
	courseDir := filepath.Join(dir, slug)
	if err := os.MkdirAll(courseDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := "slug: " + slug + "\ntitle: \"" + slug + "\"\nglossary: " + glossaryFile + "\nmilestones: []\n"
	if err := os.WriteFile(filepath.Join(courseDir, "course.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(courseDir, glossaryFile), []byte(glossaryBody), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestGlossaryEntriesValid scans every real content/courses/*/GLOSSARIO.md —
// same role as TestBridgesResolve: a malformed real entry must fail CI, not
// just degrade silently at build time.
func TestGlossaryEntriesValid(t *testing.T) {
	bridgeIdx, err := buildBridgeIndex(contentDir)
	if err != nil {
		t.Fatalf("build bridge index: %v", err)
	}
	planned, err := loadPlannedBridges("../../content/bridges-planned.yaml")
	if err != nil {
		t.Fatalf("load bridges-planned.yaml: %v", err)
	}
	vocab, err := loadCompetencyVocabulary("../../content/competencies.yaml")
	if err != nil {
		t.Fatalf("load competency vocabulary: %v", err)
	}

	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}
	courses := map[string]CompiledCourse{}
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		compiled, _, err := compileCourse(filepath.Join(contentDir, d.Name()), bridgeIdx, planned, vocab)
		if err != nil {
			t.Fatalf("compile %s: %v", d.Name(), err)
		}
		courses[compiled.Slug] = compiled
	}

	entries, err := compileGlossary(contentDir, courses, bridgeIdx)
	if err != nil {
		t.Fatalf("a real glossary entry is malformed: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one real glossary entry across all courses")
	}
	for _, e := range entries {
		if e.Marco != "" && e.MarcoID == "" {
			t.Errorf("%s (%s): \"Onde na prática\" names marco %s, which doesn't exist in %s",
				e.Term, e.Slug, e.Marco, e.Slug)
		}
	}
}
