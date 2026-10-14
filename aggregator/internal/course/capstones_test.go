package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func fixtureCourseWithCapstone(slug string, hasCapstone bool) CompiledCourse {
	sections := []Section{{Title: "Intro", Kind: "prose"}}
	if hasCapstone {
		sections = append(sections, Section{Title: "Capstone", Kind: "prose"})
	}
	return CompiledCourse{
		Slug: slug, Title: "Title of " + slug,
		Milestones: []CompiledMilestone{
			{ID: "m1", Sections: []Section{{Title: "Intro"}}},
			{ID: "m2", Sections: sections}, // last milestone
		},
	}
}

func writeCapstonesYAML(t *testing.T, dir, content string) string {
	t.Helper()
	path := filepath.Join(dir, "capstones.yaml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestCompileCapstonesHappyPath(t *testing.T) {
	courses := map[string]CompiledCourse{
		"a": fixtureCourseWithCapstone("a", true),
		"b": fixtureCourseWithCapstone("b", true),
	}
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: a
  component: comp-a
  depends_on: []
  artifacts:
    - { path: "comp-a/", check: exists }
- track: b
  component: comp-b
  depends_on: [comp-a]
  artifacts:
    - { path: "comp-b/", check: exists }
`)
	dataDir := t.TempDir()
	if err := compileCapstones(path, courses, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "capstones.json"))
	if err != nil {
		t.Fatal(err)
	}
	var catalog CapstoneMap
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Components) != 2 {
		t.Fatalf("want 2 components, got %d", len(catalog.Components))
	}
}

func TestCompileCapstonesMissingFileProducesEmptyMap(t *testing.T) {
	dataDir := t.TempDir()
	if err := compileCapstones(filepath.Join(dataDir, "does-not-exist.yaml"), nil, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "capstones.json"))
	if err != nil {
		t.Fatal(err)
	}
	var catalog CapstoneMap
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Components) != 0 {
		t.Fatalf("want 0 components, got %d", len(catalog.Components))
	}
}

func TestCompileCapstonesRejectsUnknownTrack(t *testing.T) {
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: nao-existe
  component: comp-a
`)
	if err := compileCapstones(path, map[string]CompiledCourse{}, t.TempDir()); err == nil {
		t.Fatal("expected an error for an unknown track")
	}
}

func TestCompileCapstonesRejectsMissingCapstoneSection(t *testing.T) {
	courses := map[string]CompiledCourse{"a": fixtureCourseWithCapstone("a", false)}
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: a
  component: comp-a
`)
	if err := compileCapstones(path, courses, t.TempDir()); err == nil {
		t.Fatal("expected an error: last milestone has no \"## Capstone\" section")
	}
}

func TestCompileCapstonesRejectsDuplicateComponent(t *testing.T) {
	courses := map[string]CompiledCourse{
		"a": fixtureCourseWithCapstone("a", true),
		"b": fixtureCourseWithCapstone("b", true),
	}
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: a
  component: comp-x
- track: b
  component: comp-x
`)
	if err := compileCapstones(path, courses, t.TempDir()); err == nil {
		t.Fatal("expected an error for a duplicate component name")
	}
}

func TestCompileCapstonesRejectsUndeclaredDependency(t *testing.T) {
	courses := map[string]CompiledCourse{"a": fixtureCourseWithCapstone("a", true)}
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: a
  component: comp-a
  depends_on: [comp-fantasma]
`)
	if err := compileCapstones(path, courses, t.TempDir()); err == nil {
		t.Fatal("expected an error for a dependency on an undeclared component")
	}
}

func TestCompileCapstonesRejectsCycle(t *testing.T) {
	courses := map[string]CompiledCourse{
		"a": fixtureCourseWithCapstone("a", true),
		"b": fixtureCourseWithCapstone("b", true),
		"c": fixtureCourseWithCapstone("c", true),
	}
	dir := t.TempDir()
	path := writeCapstonesYAML(t, dir, `
- track: a
  component: comp-a
  depends_on: [comp-b]
- track: b
  component: comp-b
  depends_on: [comp-c]
- track: c
  component: comp-c
  depends_on: [comp-a]
`)
	if err := compileCapstones(path, courses, t.TempDir()); err == nil {
		t.Fatal("expected an error for a dependency cycle (a -> b -> c -> a)")
	}
}

func TestFindDependencyCycleSelfLoop(t *testing.T) {
	deps := map[string][]string{"a": {"a"}}
	if cycle := findDependencyCycle(deps); cycle != "a" {
		t.Fatalf("want cycle at \"a\", got %q", cycle)
	}
}

func TestFindDependencyCycleAcyclicGraph(t *testing.T) {
	deps := map[string][]string{"a": {"b"}, "b": {"c"}, "c": {}}
	if cycle := findDependencyCycle(deps); cycle != "" {
		t.Fatalf("expected no cycle, got %q", cycle)
	}
}

// TestCapstonesRealContentValid runs the real content/capstones.yaml through
// the full Compile() pipeline — same role as TestGlossaryEntriesValid: a
// real malformed entry (unknown track, missing "## Capstone", dangling or
// cyclic depends_on) must fail CI, not just degrade to a WARN at build
// time. Compile() itself never fails the whole build over this file, so
// this test checks the written output directly.
func TestCapstonesRealContentValid(t *testing.T) {
	// Compile() writes capstones.json to outDir's PARENT (the real layout is
	// web/data/courses + web/data/capstones.json side by side) — nest outDir
	// one level so that parent still resolves inside the sandboxed temp dir.
	dataDir := t.TempDir()
	outDir := filepath.Join(dataDir, "courses")
	if _, err := Compile(contentDir, outDir); err != nil {
		t.Fatalf("compile: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "capstones.json"))
	if err != nil {
		t.Fatalf("read capstones.json: %v", err)
	}
	var catalog CapstoneMap
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Components) == 0 {
		t.Fatal("expected at least one real capstone component — content/capstones.yaml may have failed validation (check WARN output)")
	}
}
