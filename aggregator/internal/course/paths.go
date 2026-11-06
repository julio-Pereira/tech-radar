package course

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// minWhyLength keeps a path step's justification from degrading into a
// one-word label ("fundamentos") that explains nothing a reader couldn't
// already guess from the ref itself.
const minWhyLength = 20

// compilePaths reads every content/paths/<slug>.yaml, resolves and validates
// it against the already-compiled courses, and writes the result to
// dataDir/paths.json. A missing paths directory is normal (no paths authored
// yet) and compiles to an empty catalog, not an error. One bad path file is
// logged and skipped, same best-effort policy as a broken course — it never
// aborts the aggregator build.
func compilePaths(pathsDir string, courses map[string]CompiledCourse, bridgeIdx bridgeIndex, desafios []CompiledDesafio, dataDir string) error {
	entries, err := os.ReadDir(pathsDir)
	if os.IsNotExist(err) {
		entries = nil
	} else if err != nil {
		return fmt.Errorf("read paths dir %s: %w", pathsDir, err)
	}

	catalog := PathCatalog{GeneratedAt: time.Now().UTC().Format(time.RFC3339)}
	seenSlugs := make(map[string]string)

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		compiled, err := compilePath(filepath.Join(pathsDir, e.Name()), courses, bridgeIdx, desafios)
		if err != nil {
			log.Printf("WARN skipping path %s: %v", e.Name(), err)
			continue
		}
		if prev, dup := seenSlugs[compiled.Slug]; dup {
			log.Printf("WARN skipping path %s: duplicate slug %q (already used by %s)", e.Name(), compiled.Slug, prev)
			continue
		}
		seenSlugs[compiled.Slug] = e.Name()

		catalog.Paths = append(catalog.Paths, compiled)
		catalog.Index = append(catalog.Index, PathIndexEntry{
			Slug:           compiled.Slug,
			Title:          compiled.Title,
			Subtitle:       compiled.Subtitle,
			StepCount:      len(compiled.Steps),
			EstimatedHours: compiled.EstimatedHours,
		})
	}

	sort.Slice(catalog.Paths, func(i, j int) bool { return catalog.Paths[i].Slug < catalog.Paths[j].Slug })
	sort.Slice(catalog.Index, func(i, j int) bool { return catalog.Index[i].Slug < catalog.Index[j].Slug })

	if err := writeJSON(filepath.Join(dataDir, "paths.json"), catalog); err != nil {
		return fmt.Errorf("write paths.json: %w", err)
	}
	log.Printf("INFO compiled %d path(s) to %s", len(catalog.Paths), dataDir)
	return nil
}

// compilePath parses and validates one content/paths/<slug>.yaml file.
func compilePath(path string, courses map[string]CompiledCourse, bridgeIdx bridgeIndex, desafios []CompiledDesafio) (CompiledPath, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return CompiledPath{}, err
	}
	var manifest PathManifest
	if err := yaml.Unmarshal(data, &manifest); err != nil {
		return CompiledPath{}, fmt.Errorf("parse %s: %w", path, err)
	}
	if manifest.Slug == "" {
		return CompiledPath{}, fmt.Errorf("%s: missing slug", path)
	}
	if manifest.Title == "" {
		return CompiledPath{}, fmt.Errorf("path %q: missing title", manifest.Slug)
	}
	if len(manifest.Steps) == 0 {
		return CompiledPath{}, fmt.Errorf("path %q has no steps", manifest.Slug)
	}

	seenRefs := make(map[string]struct{}, len(manifest.Steps))
	firstSeen := make(map[string]int, len(manifest.Steps)) // trilha slug -> first step index
	steps := make([]CompiledPathStep, 0, len(manifest.Steps))
	totalMinutes, totalWholeHours := 0, 0

	for i, s := range manifest.Steps {
		key := s.Ref
		if s.Desafios != "" {
			key = desafiosStepKey
		}
		if _, dup := seenRefs[key]; dup {
			return CompiledPath{}, fmt.Errorf("path %q: duplicate ref %q", manifest.Slug, key)
		}
		seenRefs[key] = struct{}{}

		if utf8.RuneCountInString(strings.TrimSpace(s.Why)) < minWhyLength {
			return CompiledPath{}, fmt.Errorf("path %q: step %q has a \"why\" shorter than %d characters", manifest.Slug, key, minWhyLength)
		}

		if s.Desafios != "" {
			step, err := resolveDesafiosStep(manifest.Slug, s, desafios)
			if err != nil {
				return CompiledPath{}, err
			}
			totalMinutes += step.EstimatedMinutes
			steps = append(steps, step)
			continue
		}

		step, courseSlug, minutes, wholeHours, err := resolveStep(manifest.Slug, s, courses, bridgeIdx)
		if err != nil {
			return CompiledPath{}, err
		}
		totalMinutes += minutes
		totalWholeHours += wholeHours

		if _, ok := firstSeen[courseSlug]; !ok {
			firstSeen[courseSlug] = i
		}
		steps = append(steps, step)
	}

	if err := checkPrerequisiteOrder(manifest.Slug, firstSeen, courses); err != nil {
		return CompiledPath{}, err
	}

	return CompiledPath{
		Slug:           manifest.Slug,
		Title:          manifest.Title,
		Subtitle:       manifest.Subtitle,
		Steps:          steps,
		EstimatedHours: totalWholeHours + (totalMinutes+59)/60,
	}, nil
}

// resolveStep resolves one PathStep's ref against the compiled courses,
// returning the course slug it belongs to (for prerequisite-order checking)
// and its time contribution (exactly one of minutes/wholeHours is nonzero).
func resolveStep(pathSlug string, s PathStep, courses map[string]CompiledCourse, bridgeIdx bridgeIndex) (CompiledPathStep, string, int, int, error) {
	if s.Whole {
		if strings.Contains(s.Ref, "/") {
			return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q is whole:true but looks like a milestone ref (want a trilha slug)", pathSlug, s.Ref)
		}
		course, ok := courses[s.Ref]
		if !ok {
			return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q references an unknown trilha", pathSlug, s.Ref)
		}
		step := CompiledPathStep{
			Ref: s.Ref, Why: s.Why, Optional: s.Optional, Whole: true, Group: s.Group,
			CourseSlug: s.Ref, CourseTitle: course.Title,
			EstimatedHours: course.EstimatedHours,
		}
		return step, s.Ref, 0, course.EstimatedHours, nil
	}

	m := bridgeFullRe.FindStringSubmatch(s.Ref)
	if m == nil {
		return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q is not a valid milestone ref (want slug/NN)", pathSlug, s.Ref)
	}
	courseSlug, nn := m[1], m[2]
	course, ok := courses[courseSlug]
	if !ok {
		return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q references an unknown trilha", pathSlug, s.Ref)
	}
	milestoneID, ok := bridgeIdx[courseSlug][nn]
	if !ok {
		return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q: no milestone %s in %s", pathSlug, s.Ref, nn, courseSlug)
	}
	for i := range course.Milestones {
		if course.Milestones[i].ID == milestoneID {
			step := CompiledPathStep{
				Ref: s.Ref, Why: s.Why, Optional: s.Optional, Group: s.Group,
				CourseSlug: courseSlug, CourseTitle: course.Title,
				MilestoneID: milestoneID, MilestoneTitle: course.Milestones[i].Title,
				EstimatedMinutes: course.Milestones[i].EstimatedMinutes,
			}
			return step, courseSlug, course.Milestones[i].EstimatedMinutes, 0, nil
		}
	}
	return CompiledPathStep{}, "", 0, 0, fmt.Errorf("path %q: step %q: milestone %s not found in compiled course %s", pathSlug, s.Ref, milestoneID, courseSlug)
}

// desafiosStepKey is the ref a desafio-bank step compiles to; a path holds
// at most one.
const desafiosStepKey = "desafios:*"

// resolveDesafiosStep compiles a `desafios: "*"` step: continuous practice
// over the whole bank. Its time is one pass through every desafio; the
// front end gates each desafio by its own prerequisites, so the step never
// takes part in prerequisite ordering.
func resolveDesafiosStep(pathSlug string, s PathStep, desafios []CompiledDesafio) (CompiledPathStep, error) {
	if s.Desafios != "*" {
		return CompiledPathStep{}, fmt.Errorf("path %q: desafios step must be \"*\" (the whole bank), got %q", pathSlug, s.Desafios)
	}
	if s.Ref != "" || s.Whole {
		return CompiledPathStep{}, fmt.Errorf("path %q: desafios step cannot also have ref or whole", pathSlug)
	}
	if len(desafios) == 0 {
		return CompiledPathStep{}, fmt.Errorf("path %q: desafios step, but the desafio bank is empty", pathSlug)
	}
	minutes := 0
	for _, d := range desafios {
		minutes += d.DuracaoMin
	}
	return CompiledPathStep{
		Ref: desafiosStepKey, Why: s.Why, Optional: s.Optional, Group: s.Group,
		Desafios: true, DesafioCount: len(desafios), EstimatedMinutes: minutes,
	}, nil
}

// checkPrerequisiteOrder rejects a path that visits a trilha before a
// prerequisite the trilha itself declares (course.yaml's `prerequisites`),
// when that prerequisite is also part of the same path — a reader should
// never be pointed at a trilha ahead of what it assumes they already know.
func checkPrerequisiteOrder(pathSlug string, firstSeen map[string]int, courses map[string]CompiledCourse) error {
	for slug, idx := range firstSeen {
		course, ok := courses[slug]
		if !ok {
			continue
		}
		for _, prereq := range course.Prerequisites {
			if prereqIdx, used := firstSeen[prereq]; used && prereqIdx > idx {
				return fmt.Errorf("path %q: %q is ordered before its prerequisite %q", pathSlug, slug, prereq)
			}
		}
	}
	return nil
}
