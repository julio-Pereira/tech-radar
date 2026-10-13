package course

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/yuin/goldmark/ast"
	"gopkg.in/yaml.v3"
)

// bridgeIndex maps a course slug to its milestones, keyed by the 2-digit
// filename prefix ("07", "10"...) — the same NN authors write in a bridge
// like `concorrencia-e-recursos/10`. Built once per Compile() run so every
// milestone's bridges can resolve against every OTHER course without
// re-parsing 196 markdown bodies.
type bridgeIndex map[string]map[string]string // slug -> NN -> milestone id

var filePrefixRe = regexp.MustCompile(`^(\d{2})-`)

// buildBridgeIndex scans every course directory's manifest and each
// milestone's YAML frontmatter only — never the markdown body — so this
// stays cheap even though it touches every milestone file in the tree. A
// course that fails to parse here is simply absent from the index (bridges
// to it won't resolve); Compile()'s own per-course validation is what
// actually reports that failure.
func buildBridgeIndex(contentDir string) (bridgeIndex, error) {
	entries, err := os.ReadDir(contentDir)
	if err != nil {
		return nil, fmt.Errorf("read courses dir %s: %w", contentDir, err)
	}

	index := bridgeIndex{}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, e.Name())
		manifest, err := ParseManifest(filepath.Join(dir, manifestName))
		if err != nil || manifest.Slug == "" {
			continue
		}

		milestones := map[string]string{}
		for _, file := range manifest.Milestones {
			m := filePrefixRe.FindStringSubmatch(file)
			if m == nil {
				continue
			}
			fm, err := readMilestoneFrontmatter(filepath.Join(dir, file))
			if err != nil || fm.ID == "" {
				continue
			}
			milestones[m[1]] = fm.ID
		}
		index[manifest.Slug] = milestones
	}
	return index, nil
}

// readMilestoneFrontmatter reads only the YAML frontmatter of a milestone
// file, skipping the markdown body entirely — building the bridge index
// doesn't need 196 full renders just to read an id.
func readMilestoneFrontmatter(path string) (MilestoneFrontmatter, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return MilestoneFrontmatter{}, err
	}
	match := frontmatterRe.FindSubmatch(data)
	if match == nil {
		return MilestoneFrontmatter{}, fmt.Errorf("milestone %s: missing YAML frontmatter", path)
	}
	var fm MilestoneFrontmatter
	if err := yaml.Unmarshal(match[1], &fm); err != nil {
		return MilestoneFrontmatter{}, err
	}
	return fm, nil
}

// plannedBridges reads bridges-planned.yaml: pontes allowed to cite a trilha
// that doesn't exist in the repo yet. Keyed by the exact reference text as
// written in the markdown (e.g. "design-de-codigo/09"), so a typo in the NN
// still fails loudly instead of silently matching "any ref to that slug".
type plannedBridge struct {
	Ref    string `yaml:"ref"`
	Motivo string `yaml:"motivo"`
	Ate    string `yaml:"ate"`
}

func loadPlannedBridges(path string) (map[string]bool, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]bool{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var entries []plannedBridge
	if err := yaml.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	planned := make(map[string]bool, len(entries))
	for _, e := range entries {
		if e.Ref == "" {
			return nil, fmt.Errorf("%s: an entry is missing \"ref\"", path)
		}
		planned[e.Ref] = true
	}
	return planned, nil
}

// bridgeFullRe matches a full bridge reference: a kebab-case slug, a slash,
// and a 2-digit milestone number — e.g. "concorrencia-e-recursos/10".
var bridgeFullRe = regexp.MustCompile(`^([a-z][a-z0-9-]*)/(\d{2})$`)

// bridgeShortRe matches the same-trilha shorthand used when a bridge
// immediately follows another to the same course — e.g. "`kafka/08` e
// `/11`" — just the slash and the number, no slug.
var bridgeShortRe = regexp.MustCompile(`^/(\d{2})$`)

// connectorStripRe strips the punctuation a bridge list uses to join
// entries ("," ";" "." "(" ")" dashes) so what's left can be checked against
// the closed set of connector words.
var connectorStripRe = regexp.MustCompile(`[,;.()–—-]`)

// isConnectorOnly reports whether text between two bridge code spans is
// "just the glue" (", ", " e ", "; ", "(trilha planejada)" etc. are NOT
// connector-only — only separators and the words "e"/"and" are) — the
// signal that a bare "/NN" immediately after it still belongs to the same
// bridge list and may inherit its slug.
func isConnectorOnly(text string) bool {
	stripped := connectorStripRe.ReplaceAllString(text, " ")
	stripped = strings.ToLower(strings.Join(strings.Fields(stripped), " "))
	return stripped == "" || stripped == "e" || stripped == "and"
}

// linkifyBridges walks every paragraph anywhere in the document (including
// nested inside blockquotes, list items, etc. — bridges live inside prose,
// not just at the top level sections.go already walks) and turns each
// resolvable bridge code span into a link around itself, so it keeps its
// <code> styling but becomes clickable. Returns the bridge references that
// did NOT resolve and are not in `planned`, for the caller to report.
func linkifyBridges(doc ast.Node, source []byte, index bridgeIndex, planned map[string]bool) []string {
	var broken []string
	var walk func(ast.Node)
	walk = func(n ast.Node) {
		if n.Kind() == ast.KindParagraph || n.Kind() == ast.KindTextBlock {
			broken = append(broken, linkifyParagraph(n, source, index, planned)...)
			return // a paragraph/text-block's children are inline, never nested blocks
		}
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			walk(c)
		}
	}
	walk(doc)
	return broken
}

// linkifyParagraph is the core of the shorthand rule: "chainSlug" tracks the
// nearest preceding resolved slug so a bare "/NN" can inherit it — but ONLY
// across runs of pure connector text. Real prose between two bridge code
// spans breaks the chain, so an orphaned "/NN" is reported as broken instead
// of silently guessing which of several recently-mentioned trilhas it means
// (a real ambiguity found in this repo's own content: a course can easily
// have a marco numbered the same as the one actually meant in another).
//
// The walk recurses into inline containers (bold/italic runs, mainly — every
// "Reencontro — `slug/NN`..." callout in this repo opens with one) instead
// of only looking at the paragraph's direct children; a bridge is just as
// often inside a bold run as not, and chaining still has to flow across that
// boundary the same as it does across plain text.
func linkifyParagraph(p ast.Node, source []byte, index bridgeIndex, planned map[string]bool) []string {
	var broken []string
	chainSlug := ""

	var walk func(ast.Node)
	walk = func(n ast.Node) {
		for c := n.FirstChild(); c != nil; {
			next := c.NextSibling()
			switch cn := c.(type) {
			case *ast.CodeSpan:
				text := normalizeInlineText(inlinePlainText(cn, source))
				switch {
				case bridgeFullRe.MatchString(text):
					m := bridgeFullRe.FindStringSubmatch(text)
					slug, nn := m[1], m[2]
					if id, ok := index[slug][nn]; ok {
						wrapInLink(cn.Parent(), cn, "#/learn/"+slug+"/"+id)
						chainSlug = slug
					} else {
						if !planned[text] {
							broken = append(broken, text)
						}
						chainSlug = ""
					}
				case bridgeShortRe.MatchString(text):
					nn := bridgeShortRe.FindStringSubmatch(text)[1]
					if chainSlug == "" {
						broken = append(broken, text+" (sem trilha anterior na mesma frase)")
						break
					}
					ref := chainSlug + "/" + nn
					if id, ok := index[chainSlug][nn]; ok {
						wrapInLink(cn.Parent(), cn, "#/learn/"+chainSlug+"/"+id)
						// chainSlug stays — a run can chain more than one "/NN".
					} else if !planned[ref] {
						broken = append(broken, text+" (herdando "+chainSlug+")")
						chainSlug = ""
					}
				default:
					chainSlug = "" // a code span that isn't bridge-shaped at all
				}
			case *ast.Text:
				if !isConnectorOnly(string(cn.Value(source))) {
					chainSlug = ""
				}
			case *ast.Emphasis, *ast.Link:
				walk(cn) // bold/italic run or an already-linked span — recurse, don't reset
			default:
				chainSlug = ""
			}
			c = next
		}
	}
	walk(p)
	return broken
}

// wrapInLink replaces codeSpan with a new Link node and moves codeSpan
// inside it, so the rendered HTML becomes <a href="..."><code>...</code></a>
// — clickable, but still styled as inline code like every other bridge.
func wrapInLink(parent ast.Node, codeSpan ast.Node, href string) {
	link := ast.NewLink()
	link.Destination = []byte(href)
	parent.ReplaceChild(parent, codeSpan, link)
	link.AppendChild(link, codeSpan)
}
