package course

import (
	"path/filepath"
	"sort"
	"time"
)

// buildSearchIndex flattens every compiled course, its milestones, and the
// cross-trilha glossary into one document list (UX item 15: title, summary,
// tags, headings, and glossary entries — no full milestone body text in
// this first cut, kept small on purpose). Accent/case normalization is a
// front-end concern done at query time against this plain text, so nothing
// here is pre-normalized.
func buildSearchIndex(courses map[string]CompiledCourse, glossary []GlossaryEntry) SearchIndex {
	var docs []SearchDoc

	for _, course := range courses {
		docs = append(docs, SearchDoc{
			Kind:    "course",
			Title:   course.Title,
			Summary: course.Subtitle,
			Slug:    course.Slug,
			Tags:    course.Tags,
		})
		for _, m := range course.Milestones {
			var headings []string
			for _, s := range m.Sections {
				headings = append(headings, s.Title)
			}
			docs = append(docs, SearchDoc{
				Kind:     "milestone",
				Title:    m.Title,
				Summary:  m.Summary,
				Slug:     course.Slug,
				MarcoID:  m.ID,
				Track:    course.Title,
				Tags:     course.Tags,
				Headings: headings,
			})
		}
	}

	for _, g := range glossary {
		docs = append(docs, SearchDoc{
			Kind:    "glossary",
			Title:   g.Term,
			Summary: g.Summary,
			Slug:    g.Slug,
			MarcoID: g.MarcoID,
			Track:   g.Track,
		})
	}

	// Stable order so the generated file diffs cleanly: course docs first
	// (by slug), then everything else (by slug, then title).
	sort.SliceStable(docs, func(i, j int) bool {
		if docs[i].Kind != docs[j].Kind {
			return docs[i].Kind == "course"
		}
		if docs[i].Slug != docs[j].Slug {
			return docs[i].Slug < docs[j].Slug
		}
		return docs[i].Title < docs[j].Title
	})

	return SearchIndex{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Docs: docs}
}

func writeSearchIndex(index SearchIndex, dataDir string) error {
	return writeJSON(filepath.Join(dataDir, "search-index.json"), index)
}
