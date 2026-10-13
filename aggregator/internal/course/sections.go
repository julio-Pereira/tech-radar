package course

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// blockLabelRe recognizes a hands-on block's opening paragraph: a bold label
// from a closed vocabulary, optionally followed by " — a title" and/or a
// trailing "." or ":". Matched against the paragraph's first (and only
// relevant) Strong run, already flattened to plain text and whitespace-
// normalized — bold text that doesn't match stays inside the current block
// instead of opening a new one (e.g. "**3 reentregas**").
//
// "Invariante[s]? testáve(?:l|is)" rather than "Invariantes? testáveis?":
// Portuguese pluralizes "-vel" as "-veis" (l -> is), not by appending an s,
// so the singular "testável" shares no suffix with "testáveis" that a
// trailing "s?" could straddle.
var blockLabelRe = regexp.MustCompile(`^(Tutorial|Desafio|Invariante[s]? testáve(?:l|is)|Complemento|Checagem|Gabarito)\b(?:\s*[—–-]\s*(.+?))?[.:]?$`)

var spaceRunRe = regexp.MustCompile(`\s+`)

// blockKindFromLabel maps a matched label's first word to the closed set of
// block kinds. Plural/singular ("Invariante testável" / "Invariantes
// testáveis") both fold to "invariantes".
func blockKindFromLabel(label string) string {
	fields := strings.Fields(label)
	if len(fields) == 0 {
		return ""
	}
	switch strings.ToLower(fields[0]) {
	case "tutorial":
		return "tutorial"
	case "desafio":
		return "desafio"
	case "complemento":
		return "complemento"
	case "checagem":
		return "checagem"
	case "gabarito":
		return "gabarito"
	}
	if strings.HasPrefix(strings.ToLower(fields[0]), "invariante") {
		return "invariantes"
	}
	return ""
}

// isHandsOnTitle compares an H2 title against the two headings authors use
// for the hands-on section today ("Hands-on", "Mão na massa"), ignoring
// case and accents so a stray typo in capitalization doesn't silently fall
// back to a plain prose section.
func isHandsOnTitle(title string) bool {
	norm := foldAccents(strings.ToLower(strings.TrimSpace(title)))
	return norm == "hands-on" || norm == "hands on" || norm == "mao na massa"
}

// splitSections parses a milestone's markdown body and groups it into
// H2-delimited sections. A milestone with no H2 at all — or text before its
// first one — collapses to a single Section with id "intro", same as the
// whole body rendered today; that is the "never an error" fallback the task
// requires, not a special case callers need to know about.
//
// Bridges are linkified on the whole parsed document before any splitting
// happens, so every section/block that renders a chunk of it picks up the
// resolved links for free — the walk in linkifyBridges isn't limited to
// section.go's own top-level H2 groups, since bridges live inside prose
// (including inside blockquotes), not just at the top of a section.
func splitSections(source []byte, index bridgeIndex, planned map[string]bool) ([]Section, []string, error) {
	doc := markdown.Parser().Parse(text.NewReader(source))
	broken := linkifyBridges(doc, source, index, planned)

	var sections []Section
	used := map[string]int{}

	isIntro := true
	title := ""
	kind := "prose"
	var nodes []ast.Node

	flush := func() error {
		if isIntro {
			if len(nodes) == 0 {
				return nil // nothing before the first heading — nothing to emit
			}
			sec, err := buildSection(uniqueID(used, "intro"), "", "prose", nodes, source)
			if err != nil {
				return err
			}
			sections = append(sections, sec)
			return nil
		}
		sec, err := buildSection(uniqueID(used, slugify(title)), title, kind, nodes, source)
		if err != nil {
			return err
		}
		sections = append(sections, sec)
		return nil
	}

	child := doc.FirstChild()
	for child != nil {
		next := child.NextSibling()
		if h, ok := child.(*ast.Heading); ok && h.Level == 2 {
			if err := flush(); err != nil {
				return nil, nil, err
			}
			title = normalizeInlineText(inlinePlainText(h, source))
			kind = "prose"
			if isHandsOnTitle(title) {
				kind = "handson"
			}
			isIntro = false
			nodes = nil
		} else {
			nodes = append(nodes, child)
		}
		child = next
	}
	if err := flush(); err != nil {
		return nil, nil, err
	}
	return sections, broken, nil
}

// buildSection renders one H2 group. A "handson" group with zero recognized
// labels downgrades to "prose" over the group's untouched node list — same
// output as before this feature existed, for the two real milestones
// (kafka/10, spring-boot/07) that title a section "Hands-on" without using
// any of the five labels inside it.
func buildSection(id, title, kind string, nodes []ast.Node, source []byte) (Section, error) {
	if kind != "handson" {
		html, err := renderNodes(nodes, source)
		if err != nil {
			return Section{}, err
		}
		return Section{ID: id, Title: title, Kind: "prose", HTML: html}, nil
	}

	intro, blocks, err := splitHandsOnBlocks(nodes, source)
	if err != nil {
		return Section{}, err
	}
	if len(blocks) == 0 {
		html, err := renderNodes(nodes, source)
		if err != nil {
			return Section{}, err
		}
		return Section{ID: id, Title: title, Kind: "prose", HTML: html}, nil
	}
	return Section{ID: id, Title: title, Kind: "handson", Intro: intro, Blocks: blocks}, nil
}

// splitHandsOnBlocks walks a hands-on section's top-level nodes, opening a
// new block at every paragraph whose first child is a bold run matching
// blockLabelRe. Only top-level paragraphs are ever considered — a bold run
// inside a list item, blockquote, or code fence is a sibling's *child*, not
// one of these top-level nodes, so it can never open a block by construction.
func splitHandsOnBlocks(nodes []ast.Node, source []byte) (string, []HandsOnBlock, error) {
	var introNodes []ast.Node
	var blocks []HandsOnBlock
	seen := map[string]int{}

	opened := false
	var curKind, curTitle string
	var curNodes []ast.Node

	flush := func() error {
		if !opened {
			return nil
		}
		html, err := renderNodes(curNodes, source)
		if err != nil {
			return err
		}
		seen[curKind]++
		key := curKind
		if n := seen[curKind]; n > 1 {
			key = fmt.Sprintf("%s-%d", curKind, n)
		}
		blocks = append(blocks, HandsOnBlock{Key: key, Kind: curKind, Title: curTitle, HTML: html})
		return nil
	}

	for _, n := range nodes {
		if p, ok := n.(*ast.Paragraph); ok {
			if kind, title, matched := matchBlockLabel(p, source); matched {
				if err := flush(); err != nil {
					return "", nil, err
				}
				curKind, curTitle, opened = kind, title, true
				curNodes = nil
				// "Rótulo sozinho": the label was the paragraph's only content,
				// so after removing it there is nothing left to render.
				if p.ChildCount() > 0 {
					curNodes = append(curNodes, p)
				}
				continue
			}
		}
		if opened {
			curNodes = append(curNodes, n)
		} else {
			introNodes = append(introNodes, n)
		}
	}
	if err := flush(); err != nil {
		return "", nil, err
	}

	intro, err := renderNodes(introNodes, source)
	if err != nil {
		return "", nil, err
	}
	return intro, blocks, nil
}

// matchBlockLabel checks whether p opens a hands-on block. On a match, it
// removes the bold label node from p — "o Strong (e o separador) é
// removido" — so the caller's render of p's remaining children (if any)
// becomes the block's first paragraph instead of repeating the label.
func matchBlockLabel(p *ast.Paragraph, source []byte) (kind, title string, ok bool) {
	em, isEm := p.FirstChild().(*ast.Emphasis)
	if !isEm || em.Level != 2 {
		return "", "", false
	}
	label := normalizeInlineText(inlinePlainText(em, source))
	m := blockLabelRe.FindStringSubmatch(label)
	if m == nil {
		return "", "", false
	}
	kind = blockKindFromLabel(m[1])
	if kind == "" {
		return "", "", false
	}
	p.RemoveChild(p, em)
	return kind, strings.TrimSpace(m[2]), true
}

// inlinePlainText flattens an inline subtree to plain text: Text/String leaf
// values concatenated in order, a soft/hard line break folded to one space.
// Used both for a heading's title and for a block label — titles may embed
// code spans (CodeSpan's children are Text nodes, reached by recursing).
func inlinePlainText(n ast.Node, source []byte) string {
	var sb strings.Builder
	var walk func(ast.Node)
	walk = func(node ast.Node) {
		for c := node.FirstChild(); c != nil; c = c.NextSibling() {
			switch t := c.(type) {
			case *ast.Text:
				sb.Write(t.Value(source))
				if t.SoftLineBreak() || t.HardLineBreak() {
					sb.WriteByte(' ')
				}
			case *ast.String:
				sb.Write(t.Value)
			default:
				walk(c)
			}
		}
	}
	walk(n)
	return sb.String()
}

func normalizeInlineText(s string) string {
	return strings.TrimSpace(spaceRunRe.ReplaceAllString(s, " "))
}

// renderNodes renders an arbitrary slice of top-level block nodes — already
// part of the parsed document — through the same goldmark renderer and
// bluemonday bodyPolicy as the rest of the milestone body. Moving a node
// into the throwaway wrapper document detaches it from its original parent
// (ast.BaseNode.AppendChild isolates on append), which is fine: each node is
// rendered exactly once and the original document is discarded afterwards.
func renderNodes(nodes []ast.Node, source []byte) (string, error) {
	if len(nodes) == 0 {
		return "", nil
	}
	wrapper := ast.NewDocument()
	for _, n := range nodes {
		wrapper.AppendChild(wrapper, n)
	}
	var buf bytes.Buffer
	if err := markdown.Renderer().Render(&buf, source, wrapper); err != nil {
		return "", err
	}
	return bodyPolicy.Sanitize(buf.String()), nil
}

// uniqueID returns base the first time it's used and "base-2", "base-3"...
// on every collision after that — shared across intro/section/block ids so
// two sections that happen to slugify the same way never collide silently.
func uniqueID(used map[string]int, base string) string {
	if base == "" {
		base = "secao"
	}
	used[base]++
	if n := used[base]; n > 1 {
		return fmt.Sprintf("%s-%d", base, n)
	}
	return base
}

var accentFold = map[rune]rune{
	'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
	'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
	'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
	'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
	'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
	'ç': 'c', 'ñ': 'n',
}

func foldAccents(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if f, ok := accentFold[r]; ok {
			r = f
		}
		sb.WriteRune(r)
	}
	return sb.String()
}

// slugify turns a section title into a URL/id-safe slug: fold accents,
// lowercase, collapse every run of non [a-z0-9] into a single hyphen.
func slugify(title string) string {
	var sb strings.Builder
	prevDash := true // swallow any leading separator instead of a leading "-"
	for _, r := range foldAccents(strings.ToLower(title)) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash {
			sb.WriteByte('-')
			prevDash = true
		}
	}
	return strings.TrimSuffix(sb.String(), "-")
}
