package course

import (
	"fmt"
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

// TestQuizNotGameable checks the one tell that survives the build-time shuffle.
// Position no longer gives a question away — shuffleOptions reorders the options
// deterministically, so the index in the source YAML never reaches the reader.
// Length does survive: an option visibly longer than the other three is a clue
// regardless of where it sits, and that is authoring, not compilation.
func TestQuizNotGameable(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(contentDir, "*", "*.quiz.yaml"))
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no quiz files found")
	}

	total, longest := 0, 0

	for _, f := range files {
		questions, err := ParseQuiz(f)
		if err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		for _, q := range questions {
			total++
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

	if share := float64(longest) / float64(total); share > 0.40 {
		t.Errorf("correct option is the longest in %.0f%% of %d questions (max 40%%) — move the reasoning to explanation and give the distractors comparable length",
			share*100, total)
	}
}

// TestShuffleIsStableAndKeepsTheAnswer guards the two properties the shuffle
// must have: the same seed always produces the same order (otherwise every
// build rewrites every course JSON, and the options jump around between page
// loads), and Answer still points at the option that was correct.
func TestShuffleIsStableAndKeepsTheAnswer(t *testing.T) {
	base := QuizQuestion{
		Question: "q",
		Options:  []string{"a", "b", "c", "d"},
		Answer:   2,
	}

	first := base
	first.Options = append([]string(nil), base.Options...)
	shuffleOptions("slug/marco/0", &first)

	if first.Options[first.Answer] != "c" {
		t.Errorf("answer points at %q, want the original correct option %q",
			first.Options[first.Answer], "c")
	}

	second := base
	second.Options = append([]string(nil), base.Options...)
	shuffleOptions("slug/marco/0", &second)

	if second.Answer != first.Answer {
		t.Errorf("same seed gave answer %d then %d — the shuffle is not deterministic", first.Answer, second.Answer)
	}
	for i := range first.Options {
		if first.Options[i] != second.Options[i] {
			t.Fatalf("same seed produced different orders: %v vs %v", first.Options, second.Options)
		}
	}

	// Different seeds must actually move things, or the shuffle is decorative.
	moved := 0
	for qi := 0; qi < 40; qi++ {
		q := base
		q.Options = append([]string(nil), base.Options...)
		shuffleOptions(fmt.Sprintf("slug/marco/%d", qi), &q)
		if q.Answer != base.Answer {
			moved++
		}
	}
	if moved == 0 {
		t.Error("40 different seeds left the answer at the same index every time")
	}
}

// TestGlossaryIsDeclared closes the other silent failure of the manifest: a
// GLOSSARIO.md that nobody declared. ParseGlossary only runs when the manifest
// carries a `glossary:` key, so a glossary written and forgotten compiles fine
// and simply never reaches the site — no warning, no error, no rendered page.
func TestGlossaryIsDeclared(t *testing.T) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, e.Name())

		files, err := filepath.Glob(filepath.Join(dir, "GLOSSARIO*.md"))
		if err != nil {
			t.Fatalf("glob %s: %v", dir, err)
		}
		if len(files) == 0 {
			continue
		}

		manifest, err := ParseManifest(filepath.Join(dir, "course.yaml"))
		if err != nil {
			t.Fatalf("%s: %v", e.Name(), err)
		}
		if manifest.Glossary == "" {
			t.Errorf("course %q has %s on disk but no `glossary:` key in course.yaml — it will never render",
				e.Name(), filepath.Base(files[0]))
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, manifest.Glossary)); err != nil {
			t.Errorf("course %q declares glossary %q which does not exist", e.Name(), manifest.Glossary)
		}
	}
}
