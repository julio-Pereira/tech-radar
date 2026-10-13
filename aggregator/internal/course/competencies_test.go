package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func fixtureVocab() map[string]CompetencyDef {
	return map[string]CompetencyDef{
		"estrategia": {ID: "estrategia", Label: "Estratégia", Group: "Liderança"},
		"decisao":    {ID: "decisao", Label: "Decisão", Group: "Liderança"},
		"dados":      {ID: "dados", Label: "Dados", Group: "Transversal"},
	}
}

func TestLoadCompetencyVocabulary(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "competencies.yaml")
	if err := os.WriteFile(path, []byte(`
- { id: estrategia, label: "Estratégia", group: "Liderança" }
- { id: dados, label: "Dados", group: "Transversal" }
`), 0o644); err != nil {
		t.Fatal(err)
	}
	vocab, err := loadCompetencyVocabulary(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vocab) != 2 || vocab["estrategia"].Label != "Estratégia" {
		t.Fatalf("got %+v", vocab)
	}
}

func TestLoadCompetencyVocabularyRejectsDuplicateID(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "competencies.yaml")
	if err := os.WriteFile(path, []byte(`
- { id: estrategia, label: "A", group: "G" }
- { id: estrategia, label: "B", group: "G" }
`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := loadCompetencyVocabulary(path); err == nil {
		t.Fatal("expected an error for a duplicate vocabulary id")
	}
}

func TestValidateCompetencies(t *testing.T) {
	vocab := fixtureVocab()
	tests := []struct {
		name    string
		ids     []string
		wantErr bool
	}{
		{name: "absent is fine", ids: nil},
		{name: "empty is fine", ids: []string{}},
		{name: "one is fine", ids: []string{"estrategia"}},
		{name: "three is fine", ids: []string{"estrategia", "decisao", "dados"}},
		{name: "four is too many", ids: []string{"estrategia", "decisao", "dados", "estrategia"}, wantErr: true},
		{name: "unknown id", ids: []string{"nao-existe"}, wantErr: true},
		{name: "duplicate within the same milestone", ids: []string{"estrategia", "estrategia"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateCompetencies(tt.ids, vocab)
			if tt.wantErr && err == nil {
				t.Fatal("expected an error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCompileSkillsAggregatesMinutesAndCoverage(t *testing.T) {
	vocab := fixtureVocab()
	courses := map[string]CompiledCourse{
		"trilha-a": {
			Slug: "trilha-a",
			Milestones: []CompiledMilestone{
				{ID: "m1", Title: "M1", EstimatedMinutes: 60, Competencies: []string{"estrategia"}},
				{ID: "m2", Title: "M2", EstimatedMinutes: 40, Competencies: []string{"estrategia", "decisao"}},
				{ID: "m3", Title: "M3", EstimatedMinutes: 30}, // not tagged — excluded from the calc
			},
		},
	}

	dataDir := t.TempDir()
	if err := compileSkills(courses, vocab, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dataDir, "skills.json"))
	if err != nil {
		t.Fatal(err)
	}
	var catalog SkillsCatalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}

	if catalog.TaggedMilestones != 2 || catalog.TotalMilestones != 3 {
		t.Fatalf("want coverage 2/3, got %d/%d", catalog.TaggedMilestones, catalog.TotalMilestones)
	}
	if len(catalog.Skills) != len(vocab) {
		t.Fatalf("want one Skill row per vocabulary entry even when untagged, got %d", len(catalog.Skills))
	}

	byID := map[string]Skill{}
	for _, s := range catalog.Skills {
		byID[s.ID] = s
	}
	if byID["estrategia"].TotalMinutes != 100 || len(byID["estrategia"].Milestones) != 2 {
		t.Fatalf("estrategia: %+v", byID["estrategia"])
	}
	if byID["decisao"].TotalMinutes != 40 || len(byID["decisao"].Milestones) != 1 {
		t.Fatalf("decisao: %+v", byID["decisao"])
	}
	if byID["dados"].TotalMinutes != 0 {
		t.Fatalf("dados should have zero minutes (never tagged), got %+v", byID["dados"])
	}
}
