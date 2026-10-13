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
