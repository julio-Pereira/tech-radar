package course

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"gopkg.in/yaml.v3"
)

// frontmatterRe matches a leading YAML frontmatter block delimited by `---`
// lines at the very start of the file. Group 1 is the YAML, group 2 the body.
var frontmatterRe = regexp.MustCompile(`(?s)\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\z`)

// markdown renders GFM (tables, autolinks, strikethrough, task lists) to HTML.
var markdown = goldmark.New(goldmark.WithExtensions(extension.GFM))

// bodyPolicy sanitizes rendered milestone HTML. Unlike the feed's StrictPolicy
// (which strips all formatting), course bodies are authored long-form content,
// so we keep headings, lists, tables, and code while still removing scripts,
// inline handlers, and unsafe URLs.
var bodyPolicy = newBodyPolicy()

func newBodyPolicy() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	// External attribution links open in a new tab safely.
	p.AllowAttrs("target").OnElements("a")
	p.AllowAttrs("rel").OnElements("a")
	p.RequireNoFollowOnLinks(false)
	p.AddTargetBlankToFullyQualifiedLinks(true)
	// GFM tables.
	p.AllowElements("table", "thead", "tbody", "tr", "th", "td")
	// Concept links (conceitos.go): exactly class="conceito" and a
	// kebab-case data-conceito, nothing broader. `id` needs no rule here:
	// UGCPolicy already keeps it on every element.
	p.AllowAttrs("class").Matching(regexp.MustCompile(`^conceito$`)).OnElements("a")
	p.AllowAttrs("data-conceito").Matching(conceitoIDRe).OnElements("a")
	// Diagram figures (diagrams.go): the figure, its caption and the
	// collapsible textual description, plus the slug/id the front end draws
	// from. No SVG element is ever allowed here — the browser builds it.
	p.AllowAttrs("data-diagrama").Matching(regexp.MustCompile(`^[a-z0-9-]+/[a-z0-9-]+$`)).OnElements("figure")
	p.AllowAttrs("class").Matching(regexp.MustCompile(`^diagrama$`)).OnElements("figure")
	p.AllowAttrs("class").Matching(regexp.MustCompile(`^diagrama-(descricao|dados)$`)).OnElements("details")
	p.AllowAttrs("class").Matching(regexp.MustCompile(`^diagrama-fonte$`)).OnElements("p")
	p.AllowAttrs("class").Matching(regexp.MustCompile(`^diagramas-lado-a-lado$`)).OnElements("div")
	return p
}

// ParseManifest reads and decodes a course.yaml manifest.
func ParseManifest(path string) (Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("read manifest %s: %w", path, err)
	}
	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest %s: %w", path, err)
	}
	return m, nil
}

// ParseMilestone reads a milestone markdown file, splits its YAML frontmatter
// from the body, renders the body to HTML, and returns sanitized HTML along
// with the same body split into Sections (UX item 10). Both are rendered
// from the same parsed body on purpose: html stays the exact fallback it
// always was, not a re-render that could drift from sections.
//
// index and planned resolve bridges (`slug/NN` code spans) into links inside
// sections — never inside the deprecated html field, which is a fallback on
// its way out (item 7) and not worth re-implementing linkification for. The
// returned []string lists bridges that neither resolved against index nor
// matched an entry in planned; ParseMilestone itself never fails for these —
// an unresolved bridge degrades to a plain, unlinked code span, same as
// before this feature existed. TestBridgesResolve is what turns that list
// into a hard failure.
func ParseMilestone(path string, index bridgeIndex, planned map[string]bool) (MilestoneFrontmatter, string, []Section, []string, error) {
	return parseMilestone(path, index, planned, nil, "")
}

// parseMilestone is ParseMilestone plus concept linking: with a non-nil set,
// cited concepts become links to their owner milestone, in sections only —
// the same place bridges are linked, and for the same reason.
func parseMilestone(path string, index bridgeIndex, planned map[string]bool, set *conceitoSet, slug string) (MilestoneFrontmatter, string, []Section, []string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return MilestoneFrontmatter{}, "", nil, nil, fmt.Errorf("read milestone %s: %w", path, err)
	}

	match := frontmatterRe.FindSubmatch(data)
	if match == nil {
		return MilestoneFrontmatter{}, "", nil, nil, fmt.Errorf("milestone %s: missing YAML frontmatter", path)
	}

	var fm MilestoneFrontmatter
	if err := yaml.Unmarshal(match[1], &fm); err != nil {
		return MilestoneFrontmatter{}, "", nil, nil, fmt.Errorf("parse frontmatter %s: %w", path, err)
	}

	body := markDiagramaFences(match[2])
	html, err := renderMarkdown(body)
	if err != nil {
		return MilestoneFrontmatter{}, "", nil, nil, fmt.Errorf("render markdown %s: %w", path, err)
	}

	var cc *conceitoCtx
	if set != nil {
		nn := ""
		if m := filePrefixRe.FindStringSubmatch(filepath.Base(path)); m != nil {
			nn = m[1]
		}
		cc = &conceitoCtx{set: set, slug: slug, nn: nn, marcoID: fm.ID}
	}
	sections, broken, err := splitSectionsWith(body, index, planned, cc)
	if err != nil {
		return MilestoneFrontmatter{}, "", nil, nil, fmt.Errorf("split sections %s: %w", path, err)
	}

	return fm, html, sections, broken, nil
}

// renderMarkdown converts a markdown body to sanitized HTML.
func renderMarkdown(src []byte) (string, error) {
	var buf bytes.Buffer
	if err := markdown.Convert(src, &buf); err != nil {
		return "", err
	}
	return bodyPolicy.Sanitize(buf.String()), nil
}

// ParseGlossary reads a plain markdown file (no frontmatter) and returns
// sanitized HTML. Used for the optional per-course glossary appendix.
func ParseGlossary(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read glossary %s: %w", path, err)
	}
	html, err := renderMarkdown(data)
	if err != nil {
		return "", fmt.Errorf("render glossary %s: %w", path, err)
	}
	return html, nil
}

// ParseQuiz reads a <milestone>.quiz.yaml sibling and validates every question.
// A malformed quiz is an error: it fails the course at build time rather than
// shipping a question the reader cannot answer correctly.
func ParseQuiz(path string) ([]QuizQuestion, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read quiz %s: %w", path, err)
	}
	var qf QuizFile
	if err := yaml.Unmarshal(data, &qf); err != nil {
		return nil, fmt.Errorf("parse quiz %s: %w", path, err)
	}
	if len(qf.Questions) == 0 {
		return nil, fmt.Errorf("quiz %s has no questions", path)
	}
	for i, q := range qf.Questions {
		if q.Question == "" {
			return nil, fmt.Errorf("quiz %s: question %d has empty text", path, i+1)
		}
		if len(q.Options) < 2 {
			return nil, fmt.Errorf("quiz %s: question %d needs at least 2 options", path, i+1)
		}
		if q.Answer < 0 || q.Answer >= len(q.Options) {
			return nil, fmt.Errorf("quiz %s: question %d has answer %d out of range (0..%d)",
				path, i+1, q.Answer, len(q.Options)-1)
		}
	}
	return qf.Questions, nil
}
