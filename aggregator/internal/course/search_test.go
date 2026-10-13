package course

import "testing"

func TestBuildSearchIndexIncludesEveryDocKind(t *testing.T) {
	courses := map[string]CompiledCourse{
		"trilha-a": {
			Slug: "trilha-a", Title: "Trilha A", Subtitle: "Sub A", Tags: []string{"go"},
			Milestones: []CompiledMilestone{
				{ID: "m1", Title: "Marco 1", Summary: "Resumo 1", Sections: []Section{{Title: "Intro"}, {Title: "Hands-on"}}},
			},
		},
	}
	glossary := []GlossaryEntry{
		{Term: "SLO", Anchor: "slo", Slug: "trilha-a", Track: "Trilha A", Summary: "...", MarcoID: "m1"},
	}

	index := buildSearchIndex(courses, glossary)
	if len(index.Docs) != 3 {
		t.Fatalf("want 3 docs (course + milestone + glossary), got %d: %+v", len(index.Docs), index.Docs)
	}

	var course, milestone, term *SearchDoc
	for i := range index.Docs {
		switch index.Docs[i].Kind {
		case "course":
			course = &index.Docs[i]
		case "milestone":
			milestone = &index.Docs[i]
		case "glossary":
			term = &index.Docs[i]
		}
	}
	if course == nil || course.Title != "Trilha A" {
		t.Fatalf("missing/wrong course doc: %+v", course)
	}
	if milestone == nil || len(milestone.Headings) != 2 || milestone.Headings[1] != "Hands-on" {
		t.Fatalf("missing/wrong milestone doc or headings: %+v", milestone)
	}
	if term == nil || term.Title != "SLO" || term.MarcoID != "m1" {
		t.Fatalf("missing/wrong glossary doc: %+v", term)
	}
}

func TestBuildSearchIndexCourseDocsSortFirst(t *testing.T) {
	courses := map[string]CompiledCourse{
		"z-trilha": {Slug: "z-trilha", Title: "Z"},
	}
	glossary := []GlossaryEntry{{Term: "A termo", Anchor: "a-termo", Slug: "z-trilha", Track: "Z"}}

	index := buildSearchIndex(courses, glossary)
	if index.Docs[0].Kind != "course" {
		t.Fatalf("expected course doc first for stable diffs, got %+v", index.Docs[0])
	}
}

func TestBuildSearchIndexEmptyInputProducesNoDocs(t *testing.T) {
	index := buildSearchIndex(map[string]CompiledCourse{}, nil)
	if len(index.Docs) != 0 {
		t.Fatalf("want 0 docs, got %d", len(index.Docs))
	}
}
