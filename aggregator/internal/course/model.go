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
}

// MilestoneFrontmatter maps the YAML frontmatter of a milestone markdown file.
type MilestoneFrontmatter struct {
	ID               string `yaml:"id"`
	Title            string `yaml:"title"`
	Summary          string `yaml:"summary"`
	EstimatedMinutes int    `yaml:"estimatedMinutes"`
	References       []Ref  `yaml:"references"`
}

// CompiledMilestone is one timeline node with body HTML already sanitized.
type CompiledMilestone struct {
	ID               string `json:"id"`
	Order            int    `json:"order"`
	Title            string `json:"title"`
	Summary          string `json:"summary"`
	EstimatedMinutes int    `json:"estimatedMinutes"`
	HTML             string `json:"html"`
	References       []Ref  `json:"references,omitempty"`
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
