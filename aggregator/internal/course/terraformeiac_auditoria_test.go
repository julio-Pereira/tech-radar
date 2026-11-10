package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestTerraformEIacAuditoria is the closing audit of the terraform-e-iac
// trilha (Fase 4, web/docs/AUDITORIA-terraform-e-iac.md): the shape the plan
// promised — 7 marcos, 425 min, 14 h, 34 questions, reviewEvery 6m everywhere
// (the tool moves fast), the five hands-on blocks — checked on every build.
// It reuses hasTitlePrefix and isStrictlyLongest from the go-fintech audit.
// Lab results (locks, imports, removed) stay in the audit document: they need
// Terraform, Postgres and moto, which the Go test job does not have.
func TestTerraformEIacAuditoria(t *testing.T) {
	dir := filepath.Join(contentDir, "terraform-e-iac")
	manifest, err := ParseManifest(filepath.Join(dir, "course.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Milestones) != 7 {
		t.Fatalf("terraform-e-iac has %d marcos, want 7", len(manifest.Milestones))
	}
	if manifest.Level != "advanced" || manifest.EstimatedHours != 14 {
		t.Errorf("level %q estimatedHours %d, want advanced and 14 (425 x 2 / 60 = 14,2)", manifest.Level, manifest.EstimatedHours)
	}

	// The critical marcos (02 state, 03 secrets, 06 brownfield) have the
	// extended quiz.
	extraQuestions := map[string]int{"02": 6, "03": 6, "06": 6}
	wantBlocks := []string{"tutorial", "desafio", "invariantes", "complemento", "checagem"}

	totalMin, totalQ, longest := 0, 0, 0
	for i, file := range manifest.Milestones {
		nn := file[:2]
		path := filepath.Join(dir, file)
		fm, _, sections, _, err := ParseMilestone(path, bridgeIndex{}, nil)
		if err != nil {
			t.Fatal(err)
		}
		totalMin += fm.EstimatedMinutes

		wantEvery := "6m"
		if fm.ReviewEvery != wantEvery || fm.ReviewedAt == "" {
			t.Errorf("%s: reviewedAt %q reviewEvery %q, want a date and %s", file, fm.ReviewedAt, fm.ReviewEvery, wantEvery)
		}
		if n := len(fm.Competencies); n < 1 || n > 3 {
			t.Errorf("%s: %d competencies, want 1-3", file, n)
		}
		if len(fm.References) == 0 {
			t.Errorf("%s: no references", file)
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
		for _, want := range []string{"Exemplo numa fintech", "Hands-on", "Principais aprendizados"} {
			if !hasTitlePrefix(titles, want) {
				t.Errorf("%s: missing section %q", file, want)
			}
		}
		for _, k := range wantBlocks {
			if blocks[k] != 1 {
				t.Errorf("%s: hands-on block %q appears %d time(s), want 1", file, k, blocks[k])
			}
		}
		if last := i == len(manifest.Milestones)-1; last != hasTitlePrefix(titles, "Capstone") {
			t.Errorf("%s: Capstone section present = %v, want it only in the last marco", file, !last)
		}

		qs, err := ParseQuiz(strings.TrimSuffix(path, ".md") + ".quiz.yaml")
		if err != nil {
			t.Fatal(err)
		}
		wantQ := 4
		if n, ok := extraQuestions[nn]; ok {
			wantQ = n
		}
		if len(qs) != wantQ {
			t.Errorf("%s: %d questions, want %d", file, len(qs), wantQ)
		}
		totalQ += len(qs)
		for _, q := range qs {
			if isStrictlyLongest(q.Options, q.Answer) {
				longest++
			}
		}
	}
	if totalMin != 425 {
		t.Errorf("sum of estimatedMinutes = %d, want 425", totalMin)
	}
	if totalQ != 34 {
		t.Errorf("total questions = %d, want 34", totalQ)
	}
	// Measured at 0 of 34 when the audit closed; a quarter would be chance.
	if longest*5 > totalQ {
		t.Errorf("the correct option is the strictly longest in %d of %d questions; keep it under 20%%", longest, totalQ)
	}

	src, err := os.ReadFile(filepath.Join(dir, manifest.Glossary))
	if err != nil {
		t.Fatalf("glossary: %v", err)
	}
	entries, err := parseGlossaryEntries(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 30 {
		t.Errorf("glossary has %d entries, want at least 30", len(entries))
	}
	for _, e := range entries {
		if e.Marco == "" || e.Marco > "07" || e.Marco < "01" {
			t.Errorf("glossary entry %q points at marco %q, want 01-07", e.Term, e.Marco)
		}
	}

	// Every terraform-e-iac/NN bridge, from any trilha, resolves (the §10
	// edits in entrega-continua-e-devops/06, conectividade-multicloud/06 and
	// engenharia-de-plataforma/05 cite it).
	index, err := buildBridgeIndex(contentDir)
	if err != nil {
		t.Fatal(err)
	}
	courses, _ := os.ReadDir(contentDir)
	for _, c := range courses {
		if !c.IsDir() {
			continue
		}
		m, err := ParseManifest(filepath.Join(contentDir, c.Name(), "course.yaml"))
		if err != nil {
			t.Fatal(err)
		}
		for _, file := range m.Milestones {
			_, _, _, broken, err := ParseMilestone(filepath.Join(contentDir, c.Name(), file), index, nil)
			if err != nil {
				t.Fatal(err)
			}
			for _, b := range broken {
				if strings.Contains(b, "terraform-e-iac") {
					t.Errorf("%s/%s: broken bridge %s", c.Name(), file, b)
				}
			}
		}
	}
}
