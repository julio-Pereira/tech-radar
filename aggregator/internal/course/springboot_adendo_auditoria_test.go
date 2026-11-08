package course

import (
	"path/filepath"
	"strings"
	"testing"
)

// TestSpringBootAdendoAuditoria closes the spring-boot interview adendo (Fase D,
// web/docs/AUDITORIA-spring-boot-adendo.md): 15 marcos, 625 min, 21 h, the
// arquitetura-modulith id still at the end with the capstone, and the two new
// marcos with the question counts and hands-on the plan promised.
func TestSpringBootAdendoAuditoria(t *testing.T) {
	dir := filepath.Join(contentDir, "spring-boot")
	manifest, err := ParseManifest(filepath.Join(dir, "course.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Milestones) != 15 {
		t.Fatalf("spring-boot has %d marcos, want 15", len(manifest.Milestones))
	}
	if manifest.EstimatedHours != 21 {
		t.Errorf("estimatedHours = %d, want 21 (625 x 2 / 60)", manifest.EstimatedHours)
	}

	wantIDs := map[string]string{
		"13-programacao-reativa.md":              "programacao-reativa",
		"14-feature-toggles-e-mudanca-segura.md": "feature-toggles-e-mudanca-segura",
		"15-arquitetura-modulith.md":             "arquitetura-modulith",
	}
	wantQ := map[string]int{"13-programacao-reativa.md": 6, "14-feature-toggles-e-mudanca-segura.md": 4}

	total := 0
	for i, file := range manifest.Milestones {
		path := filepath.Join(dir, file)
		fm, _, sections, _, err := ParseMilestone(path, bridgeIndex{}, nil)
		if err != nil {
			t.Fatal(err)
		}
		total += fm.EstimatedMinutes
		if id, ok := wantIDs[file]; ok && fm.ID != id {
			t.Errorf("%s: id %q, want %q (reader progress is stored by id)", file, fm.ID, id)
		}
		var titles []string
		blocks := map[string]int{}
		for _, s := range sections {
			titles = append(titles, s.Title)
			if s.Kind == "handson" {
				for _, b := range s.Blocks {
					blocks[b.Kind]++
				}
			}
		}
		if last := i == len(manifest.Milestones)-1; last != hasTitlePrefix(titles, "Capstone") {
			t.Errorf("%s: Capstone section present = %v, want it only in the last marco", file, !last)
		}
		n, isNew := wantQ[file]
		if !isNew {
			continue
		}
		if fm.ReviewEvery != "12m" || fm.ReviewedAt == "" || len(fm.Competencies) == 0 {
			t.Errorf("%s: reviewedAt %q reviewEvery %q competencies %v", file, fm.ReviewedAt, fm.ReviewEvery, fm.Competencies)
		}
		for _, k := range []string{"tutorial", "desafio", "invariantes", "complemento", "checagem"} {
			if blocks[k] != 1 {
				t.Errorf("%s: hands-on block %q appears %d time(s), want 1", file, k, blocks[k])
			}
		}
		qs, err := ParseQuiz(strings.TrimSuffix(path, ".md") + ".quiz.yaml")
		if err != nil {
			t.Fatal(err)
		}
		if len(qs) != n {
			t.Errorf("%s: %d questions, want %d", file, len(qs), n)
		}
		for _, q := range qs {
			if isStrictlyLongest(q.Options, q.Answer) {
				t.Errorf("%s: the correct option is the strictly longest in %q", file, q.Question)
			}
		}
	}
	if total != 625 {
		t.Errorf("sum of estimatedMinutes = %d, want 625", total)
	}
}
