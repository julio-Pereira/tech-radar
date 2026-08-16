package course

import (
	"os"
	"path/filepath"
	"testing"
)

// contentDir is the real content tree, relative to this package.
const contentDir = "../../content/courses"

// TestCompileRealContent guards the failure mode that Compile is designed for:
// an invalid course is logged and skipped so the build never breaks. That is
// right in production and silent in CI — a trilha can disappear from the site
// and nothing turns red. Here, skipping is a failure.
func TestCompileRealContent(t *testing.T) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}

	var want []string
	for _, e := range entries {
		if e.IsDir() {
			want = append(want, e.Name())
		}
	}
	if len(want) == 0 {
		t.Fatalf("no course directories found in %s", contentDir)
	}

	index, err := Compile(contentDir, t.TempDir())
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	if len(index.Courses) != len(want) {
		t.Fatalf("compiled %d course(s) from %d directories (%v) — a course was skipped; check the WARN lines above",
			len(index.Courses), len(want), want)
	}

	for _, c := range index.Courses {
		if c.MilestoneCount == 0 {
			t.Errorf("course %q compiled with zero milestones", c.Slug)
		}
	}
}

// TestQuizNotGameable checks that the quizzes cannot be answered without
// reading the milestone. Two tells give a question away: the correct answer
// always sitting at the same index, and the correct option being visibly the
// longest one. Thresholds come from the trilha plans (section 3).
func TestQuizNotGameable(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(contentDir, "*", "*.quiz.yaml"))
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no quiz files found")
	}

	byIndex := map[int]int{}
	total, longest := 0, 0

	for _, f := range files {
		questions, err := ParseQuiz(f)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, q := range questions {
			total++
			byIndex[q.Answer]++
			max := 0
			for _, o := range q.Options {
				if len(o) > max {
					max = len(o)
				}
			}
			if len(q.Options[q.Answer]) == max {
				longest++
			}
		}
	}

	for i, n := range byIndex {
		if share := float64(n) / float64(total); share > 0.35 {
			t.Errorf("answer index %d holds %.0f%% of %d questions (max 35%%)", i, share*100, total)
		}
	}
	if share := float64(longest) / float64(total); share > 0.40 {
		t.Errorf("correct option is the longest in %.0f%% of %d questions (max 40%%) — move the reasoning to explanation and give the distractors comparable length",
			share*100, total)
	}
}
