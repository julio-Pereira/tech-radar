package course

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
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

	bridgeIdx, err := buildBridgeIndex(contentDir)
	if err != nil {
		return Index{}, fmt.Errorf("build bridge index: %w", err)
	}
	planned, err := loadPlannedBridges(filepath.Join(filepath.Dir(contentDir), "bridges-planned.yaml"))
	if err != nil {
		return Index{}, fmt.Errorf("load planned bridges: %w", err)
	}
	vocab, err := loadCompetencyVocabulary(filepath.Join(filepath.Dir(contentDir), "competencies.yaml"))
	if err != nil {
		return Index{}, fmt.Errorf("load competency vocabulary: %w", err)
	}

	// Concept registry (conceitos.go): structurally invalid means no
	// linking at all this build — never a half-applied registry.
	// TestConceitosResolve is what makes an invalid registry fail CI.
	var conceitos *conceitoSet
	conceitoList, err := loadConceitos(filepath.Join(filepath.Dir(contentDir), "conceitos.yaml"))
	if err != nil {
		log.Printf("WARN loading conceitos.yaml: %v", err)
	} else {
		var errs []error
		conceitos, errs = resolveConceitos(conceitoList, bridgeIdx)
		for _, e := range errs {
			log.Printf("WARN conceitos.yaml: %v", e)
		}
	}

	index := Index{GeneratedAt: time.Now().UTC().Format(time.RFC3339)}
	seenSlugs := make(map[string]string) // slug -> source dir, for duplicate detection
	compiledCourses := make(map[string]CompiledCourse)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		courseDir := filepath.Join(contentDir, entry.Name())

		compiled, broken, cerr := compileCourse(courseDir, bridgeIdx, planned, vocab, conceitos)
		if cerr != nil {
			log.Printf("WARN skipping course %s: %v", entry.Name(), cerr)
			continue
		}
		if prev, dup := seenSlugs[compiled.Slug]; dup {
			log.Printf("WARN skipping course %s: duplicate slug %q (already used by %s)", entry.Name(), compiled.Slug, prev)
			continue
		}
		seenSlugs[compiled.Slug] = courseDir
		for _, ref := range broken {
			log.Printf("WARN %s: unresolved bridge %s (not in bridges-planned.yaml)", entry.Name(), ref)
		}

		if err := writeJSON(filepath.Join(outDir, compiled.Slug+".json"), compiled); err != nil {
			log.Printf("WARN could not write course %s: %v", compiled.Slug, err)
			continue
		}
		if err := writeDiagramas(filepath.Dir(outDir), compiled.Slug, compiled.diagramas); err != nil {
			log.Printf("WARN could not write diagramas for %s: %v", compiled.Slug, err)
		}
		if err := copyAssets(courseDir, compiled.Slug, filepath.Dir(outDir), compiled.assets); err != nil {
			log.Printf("WARN could not copy assets for %s: %v", compiled.Slug, err)
		}
		compiledCourses[compiled.Slug] = compiled

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

	// Role-based paths (UX platform melhoria 1) are a reading guide over the
	// courses just compiled above — never fatal to the main build, same
	// best-effort policy as everything else in this function.
	pathsDir := filepath.Join(filepath.Dir(contentDir), "paths")
	dataDir := filepath.Dir(outDir)
	if err := compilePaths(pathsDir, compiledCourses, bridgeIdx, dataDir); err != nil {
		log.Printf("WARN compiling paths: %v", err)
	}

	// Glossary and search index (UX platform melhoria 4 / UX items 15-16),
	// same best-effort policy: never fatal to the main build.
	glossary, err := compileGlossary(contentDir, compiledCourses, bridgeIdx)
	if err != nil {
		log.Printf("WARN compiling glossary: %v", err)
		glossary = nil
	}
	// Concepts need the compiled courses and the glossary, and feed back
	// into both: the glossary learns which definition is the principal one,
	// and owner milestones learn where they are used ("Usado em") — so the
	// owner courses' JSON is written again, after the fact.
	conceitoEntries, conceitoErrs := buildConceitosCatalog(conceitos, compiledCourses, glossary)
	for _, e := range conceitoErrs {
		log.Printf("WARN conceitos.yaml: %v", e)
	}
	markGlossaryConceitos(conceitos, conceitoEntries, glossary)
	for _, slug := range applyUsadoEm(conceitoEntries, compiledCourses) {
		if err := writeJSON(filepath.Join(outDir, slug+".json"), compiledCourses[slug]); err != nil {
			log.Printf("WARN could not rewrite course %s with usadoEm: %v", slug, err)
		}
	}
	if err := writeGlossary(glossary, dataDir); err != nil {
		log.Printf("WARN writing glossary.json: %v", err)
	}
	if err := writeConceitos(conceitoEntries, dataDir); err != nil {
		log.Printf("WARN writing conceitos.json: %v", err)
	}
	if err := writeSearchIndex(buildSearchIndex(compiledCourses, glossary), dataDir); err != nil {
		log.Printf("WARN writing search-index.json: %v", err)
	}

	// Skills (UX platform melhoria 2), same best-effort policy.
	if err := compileSkills(compiledCourses, vocab, dataDir); err != nil {
		log.Printf("WARN writing skills.json: %v", err)
	}

	// Quiz bank (UX platform melhoria 5, spaced review), same best-effort policy.
	if err := compileQuizBank(compiledCourses, dataDir); err != nil {
		log.Printf("WARN writing quiz-bank.json: %v", err)
	}

	// Capstone map (UX platform melhoria 7, phase 1), same best-effort policy.
	capstonesPath := filepath.Join(filepath.Dir(contentDir), "capstones.yaml")
	if err := compileCapstones(capstonesPath, compiledCourses, dataDir); err != nil {
		log.Printf("WARN writing capstones.json: %v", err)
	}

	return index, nil
}

// compileCourse parses one course directory into a CompiledCourse, validating
// the manifest and every milestone. Returns the bridge references that this
// course's milestones cited but couldn't resolve (and weren't in `planned`)
// — never fatal, same as every other best-effort degradation in this file;
// TestBridgesResolve is what turns an entry here into a hard failure.
func compileCourse(dir string, index bridgeIndex, planned map[string]bool, vocab map[string]CompetencyDef, conceitos *conceitoSet) (CompiledCourse, []string, error) {
	manifest, err := ParseManifest(filepath.Join(dir, manifestName))
	if err != nil {
		return CompiledCourse{}, nil, err
	}
	if manifest.Slug == "" {
		return CompiledCourse{}, nil, fmt.Errorf("manifest is missing slug")
	}
	if len(manifest.Milestones) == 0 {
		return CompiledCourse{}, nil, fmt.Errorf("course %q has no milestones", manifest.Slug)
	}

	diagramas, err := loadDiagramas(dir, conceitos)
	if err != nil {
		return CompiledCourse{}, nil, err
	}
	usedDiagramas := map[string]bool{}
	var assets []string

	milestones := make([]CompiledMilestone, 0, len(manifest.Milestones))
	seenIDs := make(map[string]struct{}, len(manifest.Milestones))
	var allBroken []string

	for i, file := range manifest.Milestones {
		fm, html, sections, broken, err := parseMilestone(filepath.Join(dir, file), index, planned, conceitos, manifest.Slug)
		if err != nil {
			return CompiledCourse{}, nil, err
		}
		allBroken = append(allBroken, broken...)
		if missing := applyDiagramas(&html, sections, manifest.Slug, diagramas, usedDiagramas); len(missing) > 0 {
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s: %s", file, strings.Join(missing, "; "))
		}
		if source, rerr := os.ReadFile(filepath.Join(dir, file)); rerr == nil {
			if ierr := checkDiagramaIndent(source); ierr != nil {
				return CompiledCourse{}, nil, fmt.Errorf("milestone %s: %w", file, ierr)
			}
			names, aerr := validateAssets(source, dir)
			if aerr != nil {
				return CompiledCourse{}, nil, fmt.Errorf("milestone %s: %w", file, aerr)
			}
			if len(names) > 0 {
				assets = append(assets, names...)
				html = rewriteAssetSrc(html, manifest.Slug)
				for si := range sections {
					sections[si].HTML = rewriteAssetSrc(sections[si].HTML, manifest.Slug)
					sections[si].Intro = rewriteAssetSrc(sections[si].Intro, manifest.Slug)
					for bi := range sections[si].Blocks {
						sections[si].Blocks[bi].HTML = rewriteAssetSrc(sections[si].Blocks[bi].HTML, manifest.Slug)
					}
				}
			}
			warnASCIIDiagrams(source, manifest.Slug+"/"+file)
		}
		if fm.ID == "" {
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s is missing id", file)
		}
		if _, dup := seenIDs[fm.ID]; dup {
			return CompiledCourse{}, nil, fmt.Errorf("duplicate milestone id %q in %s", fm.ID, file)
		}
		seenIDs[fm.ID] = struct{}{}

		// Optional sibling: 01-foo.md → 01-foo.quiz.yaml. Absent is normal.
		var quiz []QuizQuestion
		quizPath := filepath.Join(dir, strings.TrimSuffix(file, ".md")+".quiz.yaml")
		if _, statErr := os.Stat(quizPath); statErr == nil {
			quiz, err = ParseQuiz(quizPath)
			if err != nil {
				return CompiledCourse{}, nil, err
			}
			// Positional bias dies here, not in review: the source index is
			// irrelevant once the options are reordered deterministically.
			for qi := range quiz {
				shuffleOptions(fmt.Sprintf("%s/%s/%d", manifest.Slug, fm.ID, qi), &quiz[qi])
			}
		}

		switch fm.Completion {
		case "", "quiz":
		default:
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s has unknown completion %q (want \"quiz\" or nothing)", file, fm.Completion)
		}
		if fm.Completion == "quiz" && len(quiz) == 0 {
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s declares completion: quiz but has no quiz file", file)
		}

		reviewDue, err := computeReviewDue(fm.ReviewedAt, fm.ReviewEvery)
		if err != nil {
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s: %w", file, err)
		}

		if err := validateCompetencies(fm.Competencies, vocab); err != nil {
			return CompiledCourse{}, nil, fmt.Errorf("milestone %s: %w", file, err)
		}

		milestones = append(milestones, CompiledMilestone{
			ID:               fm.ID,
			Order:            i + 1,
			Title:            fm.Title,
			Summary:          fm.Summary,
			EstimatedMinutes: fm.EstimatedMinutes,
			HTML:             html,
			Sections:         sections,
			References:       fm.References,
			Quiz:             quiz,
			Completion:       fm.Completion,
			ReviewedAt:       fm.ReviewedAt,
			ReviewDue:        reviewDue,
			Competencies:     fm.Competencies,
		})
	}

	for id := range diagramas {
		if !usedDiagramas[id] {
			log.Printf("WARN %s: diagramas/%s.yaml não é referenciado por nenhum marco", manifest.Slug, id)
		}
	}

	var glossary string
	if manifest.Glossary != "" {
		glossary, err = ParseGlossary(filepath.Join(dir, manifest.Glossary))
		if err != nil {
			return CompiledCourse{}, nil, err
		}
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
		Glossary:       glossary,
		Prerequisites:  manifest.Prerequisites,
		diagramas:      diagramas,
		assets:         assets,
	}, allBroken, nil
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
