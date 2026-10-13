package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// fixtureCourses returns a small, self-consistent set of compiled courses for
// path-validation tests: trilha-b declares trilha-a as a prerequisite, same
// shape as the real lideranca-tecnica/arquitetura-de-solucoes relationship.
func fixtureCourses() (map[string]CompiledCourse, bridgeIndex) {
	courses := map[string]CompiledCourse{
		"trilha-a": {
			Slug: "trilha-a", Title: "Trilha A", EstimatedHours: 10,
			Milestones: []CompiledMilestone{
				{ID: "m1", Title: "Milestone 1", EstimatedMinutes: 60},
				{ID: "m2", Title: "Milestone 2", EstimatedMinutes: 90},
			},
		},
		"trilha-b": {
			Slug: "trilha-b", Title: "Trilha B", EstimatedHours: 5, Prerequisites: []string{"trilha-a"},
			Milestones: []CompiledMilestone{
				{ID: "b1", Title: "B1", EstimatedMinutes: 30},
			},
		},
	}
	bridgeIdx := bridgeIndex{
		"trilha-a": {"01": "m1", "02": "m2"},
		"trilha-b": {"01": "b1"},
	}
	return courses, bridgeIdx
}

func writePathYAML(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

const longWhy = "Motivo com mais de vinte caracteres, bem explicado."

func TestCompilePathHappyPath(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
subtitle: "Um caminho de teste"
steps:
  - ref: trilha-a/01
    group: "Fundação"
    why: "` + longWhy + `"
  - ref: trilha-a/02
    optional: true
    why: "` + longWhy + `"
  - ref: trilha-b
    whole: true
    group: "Fechamento"
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "meu-caminho.yaml", yaml)

	got, err := compilePath(path, courses, bridgeIdx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Slug != "meu-caminho" || len(got.Steps) != 3 {
		t.Fatalf("got %+v", got)
	}
	if got.Steps[0].MilestoneTitle != "Milestone 1" || got.Steps[0].Group != "Fundação" {
		t.Fatalf("step 0 not resolved: %+v", got.Steps[0])
	}
	if !got.Steps[1].Optional {
		t.Fatalf("step 1 should carry optional:true")
	}
	if !got.Steps[2].Whole || got.Steps[2].CourseTitle != "Trilha B" {
		t.Fatalf("step 2 not resolved as whole trilha: %+v", got.Steps[2])
	}
	// 60+90 min from trilha-a (ceil to 3h) + 5h whole trilha-b = 8h.
	if got.EstimatedHours != 8 {
		t.Fatalf("want 8 estimated hours, got %d", got.EstimatedHours)
	}
}

func TestCompilePathRejectsDuplicateRef(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-a/01
    why: "` + longWhy + `"
  - ref: trilha-a/01
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error for a duplicate ref")
	}
}

func TestCompilePathRejectsShortWhy(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-a/01
    why: "muito curto"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error for a \"why\" shorter than 20 characters")
	}
}

func TestCompilePathRejectsWholeWithSlash(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-a/01
    whole: true
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error: whole:true with a slug/NN ref")
	}
}

func TestCompilePathRejectsUnknownTrilha(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-fantasma/01
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error for an unknown trilha")
	}
}

func TestCompilePathRejectsUnknownMilestone(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-a/99
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error for a milestone number that doesn't exist")
	}
}

func TestCompilePathRejectsPrerequisiteOutOfOrder(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	// trilha-b depends on trilha-a, but this path visits trilha-b first.
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-b/01
    why: "` + longWhy + `"
  - ref: trilha-a/01
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err == nil {
		t.Fatal("expected an error: trilha-b ordered before its prerequisite trilha-a")
	}
}

func TestCompilePathAllowsPrerequisiteInOrder(t *testing.T) {
	dir := t.TempDir()
	courses, bridgeIdx := fixtureCourses()
	yaml := `
slug: meu-caminho
title: "Meu caminho"
steps:
  - ref: trilha-a/01
    why: "` + longWhy + `"
  - ref: trilha-b/01
    why: "` + longWhy + `"
`
	path := writePathYAML(t, dir, "p.yaml", yaml)
	if _, err := compilePath(path, courses, bridgeIdx); err != nil {
		t.Fatalf("unexpected error with prerequisites in correct order: %v", err)
	}
}

func TestCompilePathsMissingDirIsNotAnError(t *testing.T) {
	courses, bridgeIdx := fixtureCourses()
	dataDir := t.TempDir()
	if err := compilePaths(filepath.Join(dataDir, "does-not-exist"), courses, bridgeIdx, dataDir); err != nil {
		t.Fatalf("missing paths dir should not be an error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "paths.json"))
	if err != nil {
		t.Fatalf("expected paths.json to still be written: %v", err)
	}
	var catalog PathCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Paths) != 0 {
		t.Fatalf("expected an empty catalog, got %+v", catalog)
	}
}

func TestCompilePathsSkipsDuplicateSlugAcrossFiles(t *testing.T) {
	courses, bridgeIdx := fixtureCourses()
	pathsDir := t.TempDir()
	dataDir := t.TempDir()
	yaml := `
slug: duplicado
title: "Duplicado"
steps:
  - ref: trilha-a/01
    why: "` + longWhy + `"
`
	writePathYAML(t, pathsDir, "a.yaml", yaml)
	writePathYAML(t, pathsDir, "b.yaml", yaml)

	if err := compilePaths(pathsDir, courses, bridgeIdx, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "paths.json"))
	if err != nil {
		t.Fatal(err)
	}
	var catalog PathCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(catalog.Paths) != 1 {
		t.Fatalf("expected exactly one path to survive the duplicate-slug skip, got %d", len(catalog.Paths))
	}
}
