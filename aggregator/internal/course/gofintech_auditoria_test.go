package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestGoFintechAuditoria is the closing audit of the go-fintech
// restructuring (Fase G, web/docs/AUDITORIA-go-fintech.md): the shape the
// plan promised — 16 marcos, 845 min, 28 h, 76 questions, the five hands-on
// blocks everywhere — checked on every build, so a later edit cannot quietly
// undo it. Content-quality checks (code that compiles, outputs that match)
// stay in the audit document; this test guards only what a machine can see.
func TestGoFintechAuditoria(t *testing.T) {
	dir := filepath.Join(contentDir, "go-fintech")
	manifest, err := ParseManifest(filepath.Join(dir, "course.yaml"))
	if err != nil {
		t.Fatal(err)
	}

	if len(manifest.Milestones) != 16 {
		t.Fatalf("go-fintech has %d marcos, want 16", len(manifest.Milestones))
	}
	if manifest.Level != "advanced" {
		t.Errorf("level = %q, want advanced", manifest.Level)
	}
	if manifest.EstimatedHours != 28 {
		t.Errorf("estimatedHours = %d, want 28 (845 min x 2 / 60)", manifest.EstimatedHours)
	}

	// The eight ids of the pre-restructuring trilha: reader progress is
	// stored by id, so none of them may disappear.
	original := []string{
		"introducao", "fundamentos", "concorrencia", "rest-bff",
		"grpc-antifraude", "production-observabilidade", "performance", "java-vs-go",
	}

	sixMonths := map[string]bool{"01": true, "08": true, "13": true, "14": true}
	sixQuestions := map[string]bool{"03": true, "04": true, "06": true, "07": true, "09": true, "13": true}
	wantBlocks := []string{"tutorial", "desafio", "invariantes", "complemento", "checagem"}

	ids := map[string]bool{}
	totalMin, totalQ, longest := 0, 0, 0
	for i, file := range manifest.Milestones {
		nn := file[:2]
		path := filepath.Join(dir, file)
		fm, _, sections, _, err := ParseMilestone(path, bridgeIndex{}, nil)
		if err != nil {
			t.Fatal(err)
		}
		ids[fm.ID] = true
		totalMin += fm.EstimatedMinutes

		wantEvery := "12m"
		if sixMonths[nn] {
			wantEvery = "6m"
		}
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
		if sixQuestions[nn] {
			wantQ = 6
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

	for _, id := range original {
		if !ids[id] {
			t.Errorf("original id %q is gone; reader progress for it would be lost", id)
		}
	}
	if totalMin != 845 {
		t.Errorf("sum of estimatedMinutes = %d, want 845", totalMin)
	}
	if totalQ != 76 {
		t.Errorf("total questions = %d, want 76", totalQ)
	}
	// With four options a "longest is right" habit would hit 25%; keep the
	// cue well below that (measured at 14 of 76 when the audit closed).
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
		if e.Marco == "" || e.Marco > "16" || e.Marco < "01" {
			t.Errorf("glossary entry %q points at marco %q, want 01-16", e.Term, e.Marco)
		}
	}

	// Every go-fintech/NN bridge, from any trilha, resolves.
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
				if strings.Contains(b, "go-fintech") { // "go-fintech/NN" or "/NN (herdando go-fintech)"
					t.Errorf("%s/%s: broken bridge %s", c.Name(), file, b)
				}
			}
		}
	}
}

func hasTitlePrefix(titles []string, prefix string) bool {
	for _, t := range titles {
		if strings.HasPrefix(t, prefix) {
			return true
		}
	}
	return false
}

func isStrictlyLongest(options []string, answer int) bool {
	if answer < 0 || answer >= len(options) {
		return false
	}
	for i, o := range options {
		if i != answer && len([]rune(o)) >= len([]rune(options[answer])) {
			return false
		}
	}
	return true
}
