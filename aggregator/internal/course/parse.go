package course

import (
	"bytes"
	"fmt"
	"os"
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
// from the body, renders the body to HTML, and returns sanitized HTML.
func ParseMilestone(path string) (MilestoneFrontmatter, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return MilestoneFrontmatter{}, "", fmt.Errorf("read milestone %s: %w", path, err)
	}

	match := frontmatterRe.FindSubmatch(data)
	if match == nil {
		return MilestoneFrontmatter{}, "", fmt.Errorf("milestone %s: missing YAML frontmatter", path)
	}

	var fm MilestoneFrontmatter
	if err := yaml.Unmarshal(match[1], &fm); err != nil {
		return MilestoneFrontmatter{}, "", fmt.Errorf("parse frontmatter %s: %w", path, err)
	}

	var buf bytes.Buffer
	if err := markdown.Convert(match[2], &buf); err != nil {
		return MilestoneFrontmatter{}, "", fmt.Errorf("render markdown %s: %w", path, err)
	}

	html := bodyPolicy.Sanitize(buf.String())
	return fm, html, nil
}
