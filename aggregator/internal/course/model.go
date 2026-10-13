// Package course compiles authored learning tracks (markdown + manifests under
// content/courses/) into sanitized JSON consumed by the static SPA. It is fully
// independent of the feed pipeline: a malformed course never aborts the feed build.
package course

// Ref is an attribution link. Course bodies are authored content; sources are
// referenced by link only — never copied or stored.
type Ref struct {
	Title string `yaml:"title" json:"title"`
	URL   string `yaml:"url"   json:"url"`
}

// Manifest maps a course.yaml file. Milestones lists milestone markdown
// filenames in timeline order.
type Manifest struct {
	Slug           string   `yaml:"slug"`
	Title          string   `yaml:"title"`
	Subtitle       string   `yaml:"subtitle"`
	Category       string   `yaml:"category"`
	Tags           []string `yaml:"tags"`
	Level          string   `yaml:"level"`
	Lang           string   `yaml:"lang"`
	EstimatedHours int      `yaml:"estimatedHours"`
	Sources        []Ref    `yaml:"sources"`
	Milestones     []string `yaml:"milestones"`
	// Glossary optionally names a markdown file in the course directory that is
	// rendered as an appendix. It is not a milestone: it carries no id and does
	// not count towards progress.
	Glossary string `yaml:"glossary"`
	// Prerequisites lists trilha slugs this course assumes the reader already
	// knows. Informational only here — role-based paths (UX platform melhoria
	// 1, paths.go) are what actually enforces that a path never orders a
	// trilha ahead of its own prerequisites.
	Prerequisites []string `yaml:"prerequisites"`
}

// QuizQuestion is one multiple-choice question. Answer is the 0-based index of
// the correct entry in Options. All three text fields are plain text — the SPA
// sets them via textContent, so they are never interpreted as HTML.
type QuizQuestion struct {
	Question    string   `yaml:"question"    json:"question"`
	Options     []string `yaml:"options"     json:"options"`
	Answer      int      `yaml:"answer"      json:"answer"`
	Explanation string   `yaml:"explanation" json:"explanation,omitempty"`
}

// QuizFile maps a <milestone>.quiz.yaml sibling file.
type QuizFile struct {
	Questions []QuizQuestion `yaml:"questions"`
}

// MilestoneFrontmatter maps the YAML frontmatter of a milestone markdown file.
type MilestoneFrontmatter struct {
	ID               string `yaml:"id"`
	Title            string `yaml:"title"`
	Summary          string `yaml:"summary"`
	EstimatedMinutes int    `yaml:"estimatedMinutes"`
	References       []Ref  `yaml:"references"`
	// Completion is empty (the default: the reader ticks the box whenever they
	// like) or "quiz", which gates the box on getting the quiz right. Any other
	// value is a compile error, so a typo cannot silently disable the gate.
	Completion string `yaml:"completion"`
	// ReviewedAt ("2026-10-12") and ReviewEvery ("3m"|"6m"|"12m"|"24m") are both
	// optional — content-freshness tracking (UX platform melhoria 6) is opt-in
	// per marco. ReviewEvery without ReviewedAt is a compile error, same reason
	// as Completion: a typo here must not silently turn the feature off.
	ReviewedAt  string `yaml:"reviewedAt"`
	ReviewEvery string `yaml:"reviewEvery"`
	// Competencies is optional — a marco that omits it (the overwhelming
	// majority, until retroactively tagged) simply doesn't count towards
	// #/skills (UX platform melhoria 2). When present it must have 1-3
	// entries, each a known id from content/competencies.yaml's closed
	// vocabulary and never repeated — a typo must fail the build, not
	// silently under-count a skill.
	Competencies []string `yaml:"competencies"`
}

// CompiledMilestone is one timeline node with body HTML already sanitized.
type CompiledMilestone struct {
	ID               string `json:"id"`
	Order            int    `json:"order"`
	Title            string `json:"title"`
	Summary          string `json:"summary"`
	EstimatedMinutes int    `json:"estimatedMinutes"`
	// HTML is the full rendered body. Deprecated: kept as a fallback for front
	// ends that don't understand Sections yet, and as a conservation-of-content
	// baseline in tests. Scheduled for removal once milestones ship one JSON
	// file each (UX item 7) instead of one per course.
	HTML       string         `json:"html"`
	Sections   []Section      `json:"sections,omitempty"`
	References []Ref          `json:"references,omitempty"`
	Quiz       []QuizQuestion `json:"quiz,omitempty"`
	Completion string         `json:"completion,omitempty"`
	// ReviewedAt is copied straight from the frontmatter. ReviewDue is
	// computed from it ("2006-01-02") and ReviewEvery — never from the build
	// clock, so the same content always compiles to the same ReviewDue
	// (deterministic output, clean diffs). Both empty when freshness tracking
	// isn't opted into for this marco.
	ReviewedAt string `json:"reviewedAt,omitempty"`
	ReviewDue  string `json:"reviewDue,omitempty"`
	// Competencies is copied straight from the frontmatter — empty when this
	// marco hasn't been retroactively tagged yet.
	Competencies []string `json:"competencies,omitempty"`
}

// Section is one H2-delimited chunk of a milestone body. A "Hands-on" /
// "Mão na massa" heading whose body contains at least one recognized bold
// label (Tutorial, Desafio, Invariantes testáveis, Complemento, Checagem,
// Gabarito) becomes Kind "handson" with Blocks instead of a flat HTML string; every
// other heading — including a hands-on section with no recognized label —
// stays Kind "prose", same as the milestone body always rendered before.
type Section struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"` // "prose" | "handson"
	// HTML is set for "prose" sections only.
	HTML string `json:"html,omitempty"`
	// Intro and Blocks are set for "handson" sections only. Intro is the
	// (optional) text before the first recognized label.
	Intro  string         `json:"intro,omitempty"`
	Blocks []HandsOnBlock `json:"blocks,omitempty"`
}

// HandsOnBlock is one labeled chunk inside a "handson" Section — e.g. the
// "Tutorial" or "Desafio" paragraph(s) and everything until the next label.
type HandsOnBlock struct {
	// Key is stable and unique within the section: Kind, then "kind-2",
	// "kind-3"... for repeated labels (a milestone can have two "Desafio"s).
	Key   string `json:"key"`
	Kind  string `json:"kind"` // tutorial | desafio | invariantes | complemento | checagem | gabarito
	Title string `json:"title,omitempty"`
	HTML  string `json:"html"`
}

// CompiledCourse is the full track written to web/data/courses/<slug>.json.
type CompiledCourse struct {
	Slug           string              `json:"slug"`
	Title          string              `json:"title"`
	Subtitle       string              `json:"subtitle"`
	Category       string              `json:"category"`
	Tags           []string            `json:"tags"`
	Level          string              `json:"level"`
	Lang           string              `json:"lang"`
	EstimatedHours int                 `json:"estimatedHours"`
	Sources        []Ref               `json:"sources,omitempty"`
	Milestones     []CompiledMilestone `json:"milestones"`
	// Glossary is sanitized HTML rendered from the manifest's glossary file.
	Glossary string `json:"glossary,omitempty"`
	// Prerequisites is copied straight from the manifest — paths.go reads it
	// to validate that a path never orders a trilha ahead of what it assumes.
	Prerequisites []string `json:"prerequisites,omitempty"`
}

// IndexEntry is the lightweight catalog row for the courses index.
type IndexEntry struct {
	Slug           string   `json:"slug"`
	Title          string   `json:"title"`
	Subtitle       string   `json:"subtitle"`
	Category       string   `json:"category"`
	Level          string   `json:"level"`
	Tags           []string `json:"tags"`
	EstimatedHours int      `json:"estimatedHours"`
	MilestoneCount int      `json:"milestoneCount"`
}

// Index is the catalog written to web/data/courses/index.json.
type Index struct {
	GeneratedAt string       `json:"generatedAt"`
	Courses     []IndexEntry `json:"courses"`
}

// PathStep is one entry in a role-based path (content/paths/<slug>.yaml):
// either a single milestone ("system-design/01") or, with Whole, an entire
// trilha ("lideranca-tecnica"). A path is a reading guide, never a gate — it
// only ever points at milestones/trilhas that already exist standalone.
type PathStep struct {
	Ref      string `yaml:"ref"`
	Why      string `yaml:"why"`
	Optional bool   `yaml:"optional"`
	Whole    bool   `yaml:"whole"`
	// Group is a purely cosmetic label ("Fundação de desenho") the front end
	// uses as a sub-heading above consecutive steps that share it. Carried
	// through unvalidated — grouping is display only, never gating.
	Group string `yaml:"group"`
}

// PathManifest maps a content/paths/<slug>.yaml file.
type PathManifest struct {
	Slug     string     `yaml:"slug"`
	Title    string     `yaml:"title"`
	Subtitle string     `yaml:"subtitle"`
	Steps    []PathStep `yaml:"steps"`
}

// CompiledPathStep is a PathStep resolved against real course content, so the
// front end never needs a second fetch to show a title or time estimate.
type CompiledPathStep struct {
	Ref              string `json:"ref"`
	Why              string `json:"why"`
	Optional         bool   `json:"optional,omitempty"`
	Whole            bool   `json:"whole,omitempty"`
	CourseSlug       string `json:"courseSlug"`
	CourseTitle      string `json:"courseTitle"`
	MilestoneID      string `json:"milestoneId,omitempty"`
	MilestoneTitle   string `json:"milestoneTitle,omitempty"`
	EstimatedMinutes int    `json:"estimatedMinutes,omitempty"` // milestone steps only
	EstimatedHours   int    `json:"estimatedHours,omitempty"`   // whole-trilha steps only
	Group            string `json:"group,omitempty"`
}

// CompiledPath is one track written into web/data/paths.json's Paths slice.
type CompiledPath struct {
	Slug           string             `json:"slug"`
	Title          string             `json:"title"`
	Subtitle       string             `json:"subtitle"`
	Steps          []CompiledPathStep `json:"steps"`
	EstimatedHours int                `json:"estimatedHours"`
}

// PathIndexEntry is the lightweight row for the paths list page.
type PathIndexEntry struct {
	Slug           string `json:"slug"`
	Title          string `json:"title"`
	Subtitle       string `json:"subtitle"`
	StepCount      int    `json:"stepCount"`
	EstimatedHours int    `json:"estimatedHours"`
}

// PathCatalog is the full set written to web/data/paths.json. Unlike courses
// (one file per slug), paths are few and small enough to ship as one file —
// the list page and a path's detail page both need the full Steps anyway.
type PathCatalog struct {
	GeneratedAt string           `json:"generatedAt"`
	Paths       []CompiledPath   `json:"paths"`
	Index       []PathIndexEntry `json:"index"`
}

// GlossaryEntry is one `### Termo` block from a course's glossary file
// (UX platform melhoria 4 / UX items 15-16). The same term can legitimately
// appear once per course that defines it — on purpose, never merged: each
// trilha's own phrasing stays attributed to that trilha on the term page.
type GlossaryEntry struct {
	Term    string `json:"term"`
	Anchor  string `json:"anchor"` // slugify(Term), unique within one course's glossary
	Slug    string `json:"slug"`   // course slug this definition belongs to
	Track   string `json:"track"`  // course title, for display
	Summary string `json:"summary"`
	// Marco is the raw "NN" parsed out of "Onde na prática: marco NN...";
	// empty when that field's prose doesn't start with a parseable number.
	Marco string `json:"marco,omitempty"`
	// MarcoID is Marco resolved against the bridge index to a real milestone
	// id, when resolvable — lets the term page deep-link straight to it.
	MarcoID string `json:"marcoId,omitempty"`
}

// GlossaryCatalog is the full cross-trilha set written to
// web/data/glossary.json.
type GlossaryCatalog struct {
	GeneratedAt string          `json:"generatedAt"`
	Entries     []GlossaryEntry `json:"entries"`
}

// SearchDoc is one entry in web/data/search-index.json (UX item 15): a
// course, a milestone, or a glossary term, flattened into one shape so the
// front end can search all three with a single pass. Fields are omitted
// when not applicable to keep the index small (it ships to every visitor
// that opens the search box).
type SearchDoc struct {
	Kind    string   `json:"kind"` // "course" | "milestone" | "glossary"
	Title   string   `json:"title"`
	Summary string   `json:"summary,omitempty"`
	Slug    string   `json:"slug"`              // course slug
	MarcoID string   `json:"marcoId,omitempty"` // milestone/glossary docs only
	Track   string   `json:"track,omitempty"`   // course title, for display on non-course docs
	Tags    []string `json:"tags,omitempty"`
	// Headings lists a milestone's section titles, so a search for a
	// heading-only term (not in the title/summary) still finds it.
	Headings []string `json:"headings,omitempty"`
}

// SearchIndex is the full set written to web/data/search-index.json.
type SearchIndex struct {
	GeneratedAt string      `json:"generatedAt"`
	Docs        []SearchDoc `json:"docs"`
}

// CompetencyDef is one entry in content/competencies.yaml's closed
// vocabulary (UX platform melhoria 2).
type CompetencyDef struct {
	ID    string `yaml:"id"`
	Label string `yaml:"label"`
	Group string `yaml:"group"`
}

// SkillMilestoneRef is one milestone that contributes minutes towards a
// Skill, with just enough to check it against localStorage client-side
// (course slug + milestone id) without a second fetch.
type SkillMilestoneRef struct {
	Slug             string `json:"slug"`
	MarcoID          string `json:"marcoId"`
	Title            string `json:"title"`
	EstimatedMinutes int    `json:"estimatedMinutes"`
}

// Skill is one competency with every milestone tagged for it, compiled into
// web/data/skills.json. TotalMinutes is the sum of every listed milestone's
// EstimatedMinutes — the denominator of "minutos concluídos ÷ minutos
// totais" that #/skills renders entirely from localStorage, never a server
// round-trip.
type Skill struct {
	ID           string              `json:"id"`
	Label        string              `json:"label"`
	Group        string              `json:"group"`
	TotalMinutes int                 `json:"totalMinutes"`
	Milestones   []SkillMilestoneRef `json:"milestones"`
}

// SkillsCatalog is the full set written to web/data/skills.json. Coverage
// is "cobertura da marcação" (the plan's own phrase): how many of all real
// milestones have been retroactively tagged at all, shown so the page never
// implies more completeness than the content actually has.
type SkillsCatalog struct {
	GeneratedAt      string  `json:"generatedAt"`
	Skills           []Skill `json:"skills"`
	TaggedMilestones int     `json:"taggedMilestones"`
	TotalMilestones  int     `json:"totalMilestones"`
}
