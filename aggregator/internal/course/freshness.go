package course

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// dateLayout is the YAML date format authors write: reviewedAt: 2026-10-12.
const dateLayout = "2006-01-02"

// reviewEveryMonths is the closed vocabulary for reviewEvery — same spirit
// as Completion: an unrecognized value is a compile error, not a silent no-op.
var reviewEveryMonths = map[string]int{"3m": 3, "6m": 6, "12m": 12, "24m": 24}

// computeReviewDue validates reviewedAt/reviewEvery and returns the due date
// ("2006-01-02"), computed from reviewedAt itself — never from time.Now() —
// so the same content always compiles to the same ReviewDue. Both fields
// empty is valid (freshness tracking is opt-in) and returns ("", nil).
func computeReviewDue(reviewedAt, reviewEvery string) (string, error) {
	if reviewEvery == "" {
		if reviewedAt != "" {
			// Allowed: a marco can record when it was last reviewed without
			// committing to a cadence. No due date to compute.
			if _, err := time.Parse(dateLayout, reviewedAt); err != nil {
				return "", fmt.Errorf("invalid reviewedAt %q (want YYYY-MM-DD): %w", reviewedAt, err)
			}
		}
		return "", nil
	}
	if reviewedAt == "" {
		return "", fmt.Errorf("reviewEvery %q set without reviewedAt", reviewEvery)
	}
	months, ok := reviewEveryMonths[reviewEvery]
	if !ok {
		return "", fmt.Errorf("unknown reviewEvery %q (want 3m, 6m, 12m, or 24m)", reviewEvery)
	}
	t, err := time.Parse(dateLayout, reviewedAt)
	if err != nil {
		return "", fmt.Errorf("invalid reviewedAt %q (want YYYY-MM-DD): %w", reviewedAt, err)
	}
	return t.AddDate(0, months, 0).Format(dateLayout), nil
}

// OverdueMilestone is one result of CheckFreshness.
type OverdueMilestone struct {
	Slug      string
	MarcoID   string
	Title     string
	ReviewDue string
}

// CheckFreshness scans every real milestone's YAML frontmatter only (never
// the markdown body — this has to stay cheap, it runs as a standalone CLI
// mode, not as part of Compile()) and returns those whose ReviewDue has
// passed asOf, oldest first. A milestone without reviewEvery is silently
// skipped: freshness tracking is opt-in, not every marco needs one.
//
// A milestone whose reviewedAt/reviewEvery is actually malformed is also
// skipped here, not reported as overdue — Compile()'s own validation is
// what catches that (and fails the build); this function only ever reports
// the one specific thing its name says it checks.
func CheckFreshness(contentDir string, asOf time.Time) ([]OverdueMilestone, error) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		return nil, fmt.Errorf("read courses dir %s: %w", contentDir, err)
	}

	var overdue []OverdueMilestone
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, e.Name())
		manifest, err := ParseManifest(filepath.Join(dir, manifestName))
		if err != nil || manifest.Slug == "" {
			continue
		}
		for _, file := range manifest.Milestones {
			fm, err := readMilestoneFrontmatter(filepath.Join(dir, file))
			if err != nil || fm.ReviewEvery == "" {
				continue
			}
			due, err := computeReviewDue(fm.ReviewedAt, fm.ReviewEvery)
			if err != nil || due == "" {
				continue
			}
			dueTime, err := time.Parse(dateLayout, due)
			if err != nil {
				continue
			}
			if dueTime.Before(asOf) {
				overdue = append(overdue, OverdueMilestone{
					Slug:      manifest.Slug,
					MarcoID:   fm.ID,
					Title:     fm.Title,
					ReviewDue: due,
				})
			}
		}
	}

	sort.Slice(overdue, func(i, j int) bool {
		if overdue[i].ReviewDue != overdue[j].ReviewDue {
			return overdue[i].ReviewDue < overdue[j].ReviewDue
		}
		return overdue[i].Slug < overdue[j].Slug
	})
	return overdue, nil
}
