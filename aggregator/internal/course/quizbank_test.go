package course

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCompileQuizBankFlattensOnlyQuizzedMilestones(t *testing.T) {
	courses := map[string]CompiledCourse{
		"trilha-a": {
			Slug: "trilha-a",
			Milestones: []CompiledMilestone{
				{
					ID: "m1", Title: "M1",
					Quiz: []QuizQuestion{
						{Question: "Q1?", Options: []string{"a", "b"}, Answer: 1, Explanation: "because"},
					},
				},
				{ID: "m2", Title: "M2"}, // no quiz — excluded
			},
		},
	}

	dataDir := t.TempDir()
	if err := compileQuizBank(courses, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dataDir, "quiz-bank.json"))
	if err != nil {
		t.Fatal(err)
	}
	var bank QuizBank
	if err := json.Unmarshal(data, &bank); err != nil {
		t.Fatal(err)
	}
	if len(bank.Items) != 1 {
		t.Fatalf("want 1 item, got %d: %+v", len(bank.Items), bank.Items)
	}
	item := bank.Items[0]
	if item.Slug != "trilha-a" || item.MarcoID != "m1" || item.Question != "Q1?" || item.Answer != 1 {
		t.Fatalf("got %+v", item)
	}
}

func TestCompileQuizBankEmptyInputProducesEmptyBank(t *testing.T) {
	dataDir := t.TempDir()
	if err := compileQuizBank(map[string]CompiledCourse{}, dataDir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "quiz-bank.json"))
	if err != nil {
		t.Fatal(err)
	}
	var bank QuizBank
	if err := json.Unmarshal(data, &bank); err != nil {
		t.Fatal(err)
	}
	if len(bank.Items) != 0 {
		t.Fatalf("want 0 items, got %d", len(bank.Items))
	}
}

// TestQuizBankContractRealContent: every question in the real quiz bank names
// its trilha and a milestone that exists in it. #/revisar only shows a
// question once its milestone is completed (web/js/review-deck.js), so an
// empty or dangling marcoId would hide the question forever, silently.
func TestQuizBankContractRealContent(t *testing.T) {
	dir := compiledRealData(t)
	var bank QuizBank
	readJSON(t, filepath.Join(dir, "quiz-bank.json"), &bank)
	if len(bank.Items) == 0 {
		t.Fatal("empty quiz bank")
	}

	ids := map[string]map[string]bool{}
	for _, item := range bank.Items {
		if item.Slug == "" || item.MarcoID == "" {
			t.Errorf("question %q: slug %q / marcoId %q must not be empty", item.Question, item.Slug, item.MarcoID)
			continue
		}
		known, ok := ids[item.Slug]
		if !ok {
			var course CompiledCourse
			readJSON(t, filepath.Join(dir, "courses", item.Slug+".json"), &course)
			known = map[string]bool{}
			for _, m := range course.Milestones {
				known[m.ID] = true
			}
			ids[item.Slug] = known
		}
		if !known[item.MarcoID] {
			t.Errorf("question %q: marcoId %q does not exist in %s", item.Question, item.MarcoID, item.Slug)
		}
	}
}
