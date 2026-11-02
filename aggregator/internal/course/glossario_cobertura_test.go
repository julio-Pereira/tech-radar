package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// realData compiles the real content once per test binary and hands the data
// directory (glossary.json, quiz-bank.json, courses/*.json) to every test that
// needs it.
var (
	realDataOnce sync.Once
	realDataDir  string
	realDataErr  error
)

func compiledRealData(t *testing.T) string {
	t.Helper()
	realDataOnce.Do(func() {
		dir, err := os.MkdirTemp("", "real-data-")
		if err != nil {
			realDataErr = err
			return
		}
		realDataDir = dir
		_, realDataErr = Compile(contentDir, filepath.Join(dir, "courses"))
	})
	if realDataErr != nil {
		t.Fatalf("compile real content: %v", realDataErr)
	}
	return realDataDir
}

func readJSON(t *testing.T, path string, v any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
}

func TestCoberturaGlossarioCountsOnlyResolvedMarcos(t *testing.T) {
	rows := CoberturaGlossario([]GlossaryEntry{
		{Slug: "b", Term: "x", Marco: "01", MarcoID: "um"},
		{Slug: "b", Term: "y", Marco: "17"}, // "marco 17" that does not exist: not resolved
		{Slug: "b", Term: "z"},
		{Slug: "a", Term: "w", Marco: "02", MarcoID: "dois"},
	})
	want := []GlossarioCobertura{{Slug: "a", Total: 1, ComMarco: 1}, {Slug: "b", Total: 3, ComMarco: 1}}
	if len(rows) != len(want) {
		t.Fatalf("rows = %+v, want %+v", rows, want)
	}
	for i := range want {
		if rows[i] != want[i] {
			t.Errorf("row %d = %+v, want %+v", i, rows[i], want[i])
		}
	}
	if got := rows[1].Percentual(); got != 33 {
		t.Errorf("Percentual = %d, want 33 (rounded down)", got)
	}
}

// TestCoberturaGlossarioGolden pins the per-trilha glossary coverage of the
// real content. Changing it is deliberate: regenerate with
//
//	UPDATE_GOLDEN=1 go test ./internal/course -run TestCoberturaGlossarioGolden
//
// and commit testdata/glossario-cobertura.golden with the content change that
// moved the numbers. It does not set a floor yet (TASK revisão espaçada, §4).
func TestCoberturaGlossarioGolden(t *testing.T) {
	var catalog GlossaryCatalog
	readJSON(t, filepath.Join(compiledRealData(t), "glossary.json"), &catalog)
	got := CoberturaGlossarioTexto(CoberturaGlossario(catalog.Entries))

	golden := filepath.Join("testdata", "glossario-cobertura.golden")
	if os.Getenv("UPDATE_GOLDEN") != "" {
		if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (generate it with UPDATE_GOLDEN=1)", err)
	}
	if got != string(want) {
		t.Errorf("glossary coverage changed; if on purpose, regenerate with UPDATE_GOLDEN=1.\n--- got\n%s--- want\n%s", got, want)
	}
}
