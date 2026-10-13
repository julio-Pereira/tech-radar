package course

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestComputeReviewDue(t *testing.T) {
	tests := []struct {
		name        string
		reviewedAt  string
		reviewEvery string
		want        string
		wantErr     bool
	}{
		{name: "both empty is fine, nothing to compute"},
		{name: "reviewedAt alone, no cadence", reviewedAt: "2026-01-15"},
		{name: "3 months", reviewedAt: "2026-10-12", reviewEvery: "3m", want: "2027-01-12"},
		{name: "6 months", reviewedAt: "2026-10-12", reviewEvery: "6m", want: "2027-04-12"},
		{name: "12 months", reviewedAt: "2026-10-12", reviewEvery: "12m", want: "2027-10-12"},
		{name: "24 months", reviewedAt: "2026-10-12", reviewEvery: "24m", want: "2028-10-12"},
		{name: "reviewEvery without reviewedAt is an error", reviewEvery: "12m", wantErr: true},
		{name: "unknown reviewEvery is an error", reviewedAt: "2026-10-12", reviewEvery: "1y", wantErr: true},
		{name: "malformed reviewedAt is an error", reviewedAt: "12-10-2026", reviewEvery: "12m", wantErr: true},
		{name: "malformed reviewedAt without reviewEvery is still an error", reviewedAt: "not-a-date", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := computeReviewDue(tt.reviewedAt, tt.reviewEvery)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got due=%q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

// TestCompileRejectsReviewEveryWithoutReviewedAt is the task's explicit
// "reviewEvery sem reviewedAt é erro" requirement, exercised through the
// real compile path (not just the helper) so a milestone that gets this
// wrong fails the build the same way a bad `completion` does.
func TestCompileRejectsReviewEveryWithoutReviewedAt(t *testing.T) {
	dir := t.TempDir()
	writeFreshnessFixtureCourse(t, dir, "reviewEvery: 12m\n")

	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil); err == nil {
		t.Fatal("expected an error for reviewEvery without reviewedAt")
	}
}

func TestCompileRejectsUnknownReviewEvery(t *testing.T) {
	dir := t.TempDir()
	writeFreshnessFixtureCourse(t, dir, "reviewedAt: 2026-10-12\nreviewEvery: weekly\n")

	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil); err == nil {
		t.Fatal("expected an error for an unrecognized reviewEvery")
	}
}

func TestCompileAcceptsReviewedAtAloneAndEmitsReviewDue(t *testing.T) {
	dir := t.TempDir()
	writeFreshnessFixtureCourse(t, dir, "reviewedAt: 2026-10-12\nreviewEvery: 6m\n")

	compiled, _, err := compileCourse(dir, bridgeIndex{}, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := compiled.Milestones[0]
	if m.ReviewedAt != "2026-10-12" {
		t.Errorf("ReviewedAt = %q, want 2026-10-12", m.ReviewedAt)
	}
	if m.ReviewDue != "2027-04-12" {
		t.Errorf("ReviewDue = %q, want 2027-04-12", m.ReviewDue)
	}
}

// writeFreshnessFixtureCourse writes a minimal single-milestone course into
// dir, with extraFrontmatter inserted into the milestone's YAML block.
func writeFreshnessFixtureCourse(t *testing.T, dir, extraFrontmatter string) {
	t.Helper()
	manifest := "slug: fixture\ntitle: Fixture\ncategory: Teste\nlevel: beginner\nlang: pt-BR\nestimatedHours: 1\nmilestones:\n  - 01-intro.md\n"
	if err := os.WriteFile(filepath.Join(dir, "course.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write course.yaml: %v", err)
	}
	milestone := "---\nid: intro\ntitle: Intro\nsummary: Resumo.\nestimatedMinutes: 5\n" + extraFrontmatter + "---\n\nConteúdo.\n"
	if err := os.WriteFile(filepath.Join(dir, "01-intro.md"), []byte(milestone), 0o644); err != nil {
		t.Fatalf("write 01-intro.md: %v", err)
	}
}

// ── CheckFreshness ───────────────────────────────────────────────────────────

func TestCheckFreshnessListsOverdueAndIgnoresOptedOut(t *testing.T) {
	root := t.TempDir()
	// Course A: one overdue marco, one not-yet-due marco.
	writeFreshnessCourseDir(t, filepath.Join(root, "course-a"), "course-a", map[string]string{
		"01-velho.md":  "reviewedAt: 2024-01-01\nreviewEvery: 12m\n", // due 2025-01-01, well in the past
		"02-novo.md":   "reviewedAt: 2026-09-01\nreviewEvery: 12m\n", // due 2027-09-01, not yet
		"03-semopt.md": "",                                           // no reviewEvery at all — must be ignored, not reported
	})

	asOf, err := time.Parse(dateLayout, "2026-10-12")
	if err != nil {
		t.Fatalf("parse asOf: %v", err)
	}
	overdue, err := CheckFreshness(root, asOf)
	if err != nil {
		t.Fatalf("CheckFreshness: %v", err)
	}
	if len(overdue) != 1 {
		t.Fatalf("got %d overdue, want 1: %+v", len(overdue), overdue)
	}
	if overdue[0].MarcoID != "velho" {
		t.Errorf("got marco %q, want %q", overdue[0].MarcoID, "velho")
	}
	if overdue[0].ReviewDue != "2025-01-01" {
		t.Errorf("got due %q, want 2025-01-01", overdue[0].ReviewDue)
	}
}

func TestCheckFreshnessIsSortedOldestFirst(t *testing.T) {
	root := t.TempDir()
	writeFreshnessCourseDir(t, filepath.Join(root, "course-a"), "course-a", map[string]string{
		"01-a.md": "reviewedAt: 2023-01-01\nreviewEvery: 12m\n", // due 2024-01-01
		"02-b.md": "reviewedAt: 2020-01-01\nreviewEvery: 12m\n", // due 2021-01-01 — oldest
	})

	asOf, _ := time.Parse(dateLayout, "2026-10-12")
	overdue, err := CheckFreshness(root, asOf)
	if err != nil {
		t.Fatalf("CheckFreshness: %v", err)
	}
	if len(overdue) != 2 {
		t.Fatalf("got %d overdue, want 2", len(overdue))
	}
	if overdue[0].MarcoID != "b" || overdue[1].MarcoID != "a" {
		t.Errorf("got order %q, %q, want b then a (oldest due first)", overdue[0].MarcoID, overdue[1].MarcoID)
	}
}

func TestCheckFreshnessSkipsMalformedEntriesInsteadOfCrashing(t *testing.T) {
	root := t.TempDir()
	writeFreshnessCourseDir(t, filepath.Join(root, "course-a"), "course-a", map[string]string{
		"01-ruim.md": "reviewEvery: 12m\n", // missing reviewedAt — malformed, not this function's job to flag
	})

	asOf, _ := time.Parse(dateLayout, "2026-10-12")
	overdue, err := CheckFreshness(root, asOf)
	if err != nil {
		t.Fatalf("CheckFreshness should not error on a malformed entry, got: %v", err)
	}
	if len(overdue) != 0 {
		t.Errorf("got %d overdue, want 0 (malformed entries are skipped, not reported)", len(overdue))
	}
}

func writeFreshnessCourseDir(t *testing.T, dir, slug string, milestoneFrontmatter map[string]string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	var list string
	for file := range milestoneFrontmatter {
		list += "  - " + file + "\n"
	}
	manifest := "slug: " + slug + "\ntitle: Fixture\ncategory: Teste\nlevel: beginner\nlang: pt-BR\nestimatedHours: 1\nmilestones:\n" + list
	if err := os.WriteFile(filepath.Join(dir, "course.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write course.yaml: %v", err)
	}
	for file, extra := range milestoneFrontmatter {
		id := file[3 : len(file)-3] // "01-velho.md" -> "velho"
		content := "---\nid: " + id + "\ntitle: " + id + "\nsummary: Resumo.\nestimatedMinutes: 5\n" + extra + "---\n\nConteúdo.\n"
		if err := os.WriteFile(filepath.Join(dir, file), []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", file, err)
		}
	}
}
