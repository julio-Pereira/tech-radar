package course

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"gopkg.in/yaml.v3"
)

// loadCompetencyVocabulary reads content/competencies.yaml's closed
// vocabulary, keyed by id. Duplicate ids in the vocabulary file itself are
// a build error — the one list every marco's `competencies` field is
// checked against must not be ambiguous.
func loadCompetencyVocabulary(path string) (map[string]CompetencyDef, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var defs []CompetencyDef
	if err := yaml.Unmarshal(data, &defs); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	vocab := make(map[string]CompetencyDef, len(defs))
	for _, d := range defs {
		if d.ID == "" {
			return nil, fmt.Errorf("%s: an entry is missing \"id\"", path)
		}
		if _, dup := vocab[d.ID]; dup {
			return nil, fmt.Errorf("%s: duplicate competency id %q", path, d.ID)
		}
		vocab[d.ID] = d
	}
	return vocab, nil
}

// validateCompetencies enforces the closed-vocabulary contract on one
// marco's `competencies` field: absent/empty is fine (not tagged yet); when
// present, 1-3 entries, each a known id, never repeated. A typo here must
// fail the build, the same reasoning as Completion/ReviewEvery elsewhere in
// this package.
func validateCompetencies(ids []string, vocab map[string]CompetencyDef) error {
	if len(ids) == 0 {
		return nil
	}
	if len(ids) > 3 {
		return fmt.Errorf("has %d competencies, want 1-3", len(ids))
	}
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, ok := vocab[id]; !ok {
			return fmt.Errorf("unknown competency %q (not in content/competencies.yaml)", id)
		}
		if _, dup := seen[id]; dup {
			return fmt.Errorf("duplicate competency %q", id)
		}
		seen[id] = struct{}{}
	}
	return nil
}

// compileSkills aggregates every compiled course's milestones by
// competency into web/data/skills.json. #/skills computes "minutos
// concluídos ÷ minutos totais" entirely from this plus localStorage — no
// server round-trip, same zero-runtime philosophy as everything else here.
func compileSkills(courses map[string]CompiledCourse, vocab map[string]CompetencyDef, dataDir string) error {
	byID := make(map[string]*Skill, len(vocab))
	for id, def := range vocab {
		byID[id] = &Skill{ID: id, Label: def.Label, Group: def.Group}
	}

	taggedMilestones, totalMilestones := 0, 0
	for _, course := range courses {
		for _, m := range course.Milestones {
			totalMilestones++
			if len(m.Competencies) == 0 {
				continue
			}
			taggedMilestones++
			for _, id := range m.Competencies {
				skill, ok := byID[id]
				if !ok {
					continue // already caught at compile time; defensive only
				}
				skill.TotalMinutes += m.EstimatedMinutes
				skill.Milestones = append(skill.Milestones, SkillMilestoneRef{
					Slug: course.Slug, MarcoID: m.ID, Title: m.Title, EstimatedMinutes: m.EstimatedMinutes,
				})
			}
		}
	}

	catalog := SkillsCatalog{
		GeneratedAt:      time.Now().UTC().Format(time.RFC3339),
		TaggedMilestones: taggedMilestones,
		TotalMilestones:  totalMilestones,
	}
	for _, skill := range byID {
		sort.Slice(skill.Milestones, func(i, j int) bool {
			if skill.Milestones[i].Slug != skill.Milestones[j].Slug {
				return skill.Milestones[i].Slug < skill.Milestones[j].Slug
			}
			return skill.Milestones[i].MarcoID < skill.Milestones[j].MarcoID
		})
		catalog.Skills = append(catalog.Skills, *skill)
	}
	sort.Slice(catalog.Skills, func(i, j int) bool { return catalog.Skills[i].ID < catalog.Skills[j].ID })

	return writeJSON(filepath.Join(dataDir, "skills.json"), catalog)
}
