package course

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const manifestName = "course.yaml"

// Compile scans every course subdirectory under contentDir, compiles each into
// outDir/<slug>.json, and writes outDir/index.json. A course that fails
// validation is logged and skipped — it never aborts the whole build.
func Compile(contentDir, outDir string) (Index, error) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		return Index{}, fmt.Errorf("read courses dir %s: %w", contentDir, err)
	}

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return Index{}, fmt.Errorf("create output dir %s: %w", outDir, err)
	}

	index := Index{GeneratedAt: time.Now().UTC().Format(time.RFC3339)}
	seenSlugs := make(map[string]string) // slug -> source dir, for duplicate detection

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		courseDir := filepath.Join(contentDir, entry.Name())

		compiled, cerr := compileCourse(courseDir)
		if cerr != nil {
			log.Printf("WARN skipping course %s: %v", entry.Name(), cerr)
			continue
		}
		if prev, dup := seenSlugs[compiled.Slug]; dup {
			log.Printf("WARN skipping course %s: duplicate slug %q (already used by %s)", entry.Name(), compiled.Slug, prev)
			continue
		}
		seenSlugs[compiled.Slug] = courseDir

		if err := writeJSON(filepath.Join(outDir, compiled.Slug+".json"), compiled); err != nil {
			log.Printf("WARN could not write course %s: %v", compiled.Slug, err)
			continue
		}

		index.Courses = append(index.Courses, IndexEntry{
			Slug:           compiled.Slug,
			Title:          compiled.Title,
			Subtitle:       compiled.Subtitle,
			Category:       compiled.Category,
			Level:          compiled.Level,
			Tags:           compiled.Tags,
			EstimatedHours: compiled.EstimatedHours,
			MilestoneCount: len(compiled.Milestones),
		})
	}

	// Stable catalog order so the generated index.json diffs cleanly.
	sort.Slice(index.Courses, func(i, j int) bool {
		return index.Courses[i].Slug < index.Courses[j].Slug
	})

	if err := writeJSON(filepath.Join(outDir, "index.json"), index); err != nil {
		return Index{}, fmt.Errorf("write index: %w", err)
	}
	log.Printf("INFO compiled %d course(s) to %s", len(index.Courses), outDir)
	return index, nil
}

// compileCourse parses one course directory into a CompiledCourse, validating
// the manifest and every milestone.
func compileCourse(dir string) (CompiledCourse, error) {
	manifest, err := ParseManifest(filepath.Join(dir, manifestName))
	if err != nil {
		return CompiledCourse{}, err
	}
	if manifest.Slug == "" {
		return CompiledCourse{}, fmt.Errorf("manifest is missing slug")
	}
	if len(manifest.Milestones) == 0 {
		return CompiledCourse{}, fmt.Errorf("course %q has no milestones", manifest.Slug)
	}

	milestones := make([]CompiledMilestone, 0, len(manifest.Milestones))
	seenIDs := make(map[string]struct{}, len(manifest.Milestones))

	for i, file := range manifest.Milestones {
		fm, html, err := ParseMilestone(filepath.Join(dir, file))
		if err != nil {
			return CompiledCourse{}, err
		}
		if fm.ID == "" {
			return CompiledCourse{}, fmt.Errorf("milestone %s is missing id", file)
		}
		if _, dup := seenIDs[fm.ID]; dup {
			return CompiledCourse{}, fmt.Errorf("duplicate milestone id %q in %s", fm.ID, file)
		}
		seenIDs[fm.ID] = struct{}{}

		milestones = append(milestones, CompiledMilestone{
			ID:               fm.ID,
			Order:            i + 1,
			Title:            fm.Title,
			Summary:          fm.Summary,
			EstimatedMinutes: fm.EstimatedMinutes,
			HTML:             html,
			References:       fm.References,
		})
	}

	return CompiledCourse{
		Slug:           manifest.Slug,
		Title:          manifest.Title,
		Subtitle:       manifest.Subtitle,
		Category:       manifest.Category,
		Tags:           manifest.Tags,
		Level:          manifest.Level,
		Lang:           manifest.Lang,
		EstimatedHours: manifest.EstimatedHours,
		Sources:        manifest.Sources,
		Milestones:     milestones,
	}, nil
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
