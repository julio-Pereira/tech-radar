package course

import (
	"path/filepath"
	"sort"
	"time"
)

// compileQuizBank flattens every compiled course's quiz questions (only
// milestones that have one) into web/data/quiz-bank.json.
func compileQuizBank(courses map[string]CompiledCourse, dataDir string) error {
	var items []QuizBankItem
	for _, course := range courses {
		for _, m := range course.Milestones {
			for _, q := range m.Quiz {
				items = append(items, QuizBankItem{
					Slug:           course.Slug,
					MarcoID:        m.ID,
					MilestoneTitle: m.Title,
					Question:       q.Question,
					Options:        q.Options,
					Answer:         q.Answer,
					Explanation:    q.Explanation,
				})
			}
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Slug != items[j].Slug {
			return items[i].Slug < items[j].Slug
		}
		if items[i].MarcoID != items[j].MarcoID {
			return items[i].MarcoID < items[j].MarcoID
		}
		return items[i].Question < items[j].Question
	})

	bank := QuizBank{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Items: items}
	return writeJSON(filepath.Join(dataDir, "quiz-bank.json"), bank)
}
