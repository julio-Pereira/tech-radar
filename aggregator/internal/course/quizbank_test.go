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
