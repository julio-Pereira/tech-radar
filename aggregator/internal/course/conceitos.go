package course

import (
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/yuin/goldmark/ast"
	east "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
	"gopkg.in/yaml.v3"
)

// conceitosMaxPorMarco caps concept links per milestone: past this, the
// remaining first occurrences stay plain text and are only counted in the
// report — a paragraph where every other word is a link reads worse than one
// with no links at all.
const conceitosMaxPorMarco = 8

// conceitoIDRe is the id rule for a concept: kebab-case, the same shape the
// sanitizer allows in data-conceito, and immutable once published because
// it becomes the return point in a URL.
var conceitoIDRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Conceito is one entry of content/conceitos.yaml: a transversal concept
// with exactly one owner milestone (the one that teaches it) and the exact
// aliases that identify it in other milestones' prose.
type Conceito struct {
	ID           string   `yaml:"id"`
	Termo        string   `yaml:"termo"`
	Dono         string   `yaml:"dono"` // slug/NN, same syntax as a bridge
	Apelidos     []string `yaml:"apelidos"`
	Resumo       string   `yaml:"resumo"`
	Tambem       []string `yaml:"tambem"`
	IgnorarCaixa bool     `yaml:"ignorarCaixa"`
	IgnorarEm    []string `yaml:"ignorarEm"`
}

// marcoRef is a slug/NN reference resolved against the bridge index.
type marcoRef struct {
	Slug string
	NN   string
	ID   string
}

func (r marcoRef) href() string { return "#/learn/" + r.Slug + "/" + r.ID }

// conceitoResolvido is a Conceito after validation: owner and "tambem"
// resolved to real milestones, ignorarEm turned into a lookup set.
type conceitoResolvido struct {
	Conceito
	dono      marcoRef
	tambem    []marcoRef
	ignorarEm map[string]bool // "slug/id"
}

// conceitoCitacao records one milestone where a concept was linked (or would
// have been, had the per-milestone cap not cut it).
type conceitoCitacao struct {
	Slug, NN, MarcoID string
	Cortado           bool
}

// conceitoSet is the compiled registry the linker runs against. It also
// collects, as a side effect of linking, where each concept was cited —
// Compile runs sequentially, so a plain map is enough — for conceitos.json
// ("citadoEm") and the report.
type conceitoSet struct {
	conceitos []*conceitoResolvido
	aliases   []conceitoAlias // longest first, so the longest alias wins at a position
	citacoes  map[string][]conceitoCitacao
}

type conceitoAlias struct {
	text     string
	foldCase bool
	conceito *conceitoResolvido
}

// loadConceitos reads content/conceitos.yaml. A missing file is a valid,
// empty registry — the feature simply links nothing.
func loadConceitos(path string) ([]Conceito, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var list []Conceito
	if err := yaml.Unmarshal(data, &list); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return list, nil
}

// resolveConceitos runs the structural validation of the registry (ids,
// references, aliases) and builds the set the linker uses. Every problem is
// returned, not just the first, so one run lists everything to fix. Any
// problem means no set: a half-valid registry would link some concepts and
// silently drop others.
func resolveConceitos(list []Conceito, index bridgeIndex) (*conceitoSet, []error) {
	var errs []error
	set := &conceitoSet{citacoes: map[string][]conceitoCitacao{}}
	seenID := map[string]bool{}
	seenAlias := map[string]string{} // folded alias -> concept id

	resolve := func(c Conceito, field, ref string) (marcoRef, bool) {
		m := bridgeFullRe.FindStringSubmatch(ref)
		if m == nil {
			errs = append(errs, fmt.Errorf("conceito %q: %s %q não tem a forma slug/NN", c.ID, field, ref))
			return marcoRef{}, false
		}
		id, ok := index[m[1]][m[2]]
		if !ok {
			errs = append(errs, fmt.Errorf("conceito %q: %s %q não resolve para nenhum marco", c.ID, field, ref))
			return marcoRef{}, false
		}
		return marcoRef{Slug: m[1], NN: m[2], ID: id}, true
	}

	for _, c := range list {
		if !conceitoIDRe.MatchString(c.ID) {
			errs = append(errs, fmt.Errorf("conceito %q: id precisa ser kebab-case", c.ID))
		}
		if seenID[c.ID] {
			errs = append(errs, fmt.Errorf("conceito %q: id duplicado", c.ID))
		}
		seenID[c.ID] = true
		if strings.TrimSpace(c.Termo) == "" {
			errs = append(errs, fmt.Errorf("conceito %q: termo vazio", c.ID))
		}
		if len(c.Apelidos) == 0 {
			errs = append(errs, fmt.Errorf("conceito %q: precisa de ao menos um apelido", c.ID))
		}

		rc := &conceitoResolvido{Conceito: c, ignorarEm: map[string]bool{}}
		dono, donoOK := resolve(c, "dono", c.Dono)
		rc.dono = dono
		for _, ref := range c.Tambem {
			if r, ok := resolve(c, "tambem", ref); ok {
				rc.tambem = append(rc.tambem, r)
			}
		}
		for _, ref := range c.IgnorarEm {
			if r, ok := resolve(c, "ignorarEm", ref); ok {
				rc.ignorarEm[r.Slug+"/"+r.ID] = true
			}
		}

		for _, a := range c.Apelidos {
			if strings.TrimSpace(a) != a || a == "" {
				errs = append(errs, fmt.Errorf("conceito %q: apelido %q vazio ou com espaço nas pontas", c.ID, a))
				continue
			}
			// Collisions are checked case-folded no matter the flag: "PAR"
			// and "par" in two concepts would fight as soon as either one
			// turned ignorarCaixa on.
			// The same concept may list both casings ("Outbox", "outbox").
			key := strings.ToLower(a)
			if other, dup := seenAlias[key]; dup && other != c.ID {
				errs = append(errs, fmt.Errorf("conceito %q: apelido %q já é do conceito %q", c.ID, a, other))
				continue
			}
			seenAlias[key] = c.ID
			set.aliases = append(set.aliases, conceitoAlias{text: a, foldCase: c.IgnorarCaixa, conceito: rc})
		}
		if donoOK {
			set.conceitos = append(set.conceitos, rc)
		}
	}
	if len(errs) > 0 {
		return nil, errs
	}
	sort.SliceStable(set.aliases, func(i, j int) bool {
		return utf8.RuneCountInString(set.aliases[i].text) > utf8.RuneCountInString(set.aliases[j].text)
	})
	return set, nil
}

// ── Linker ──────────────────────────────────────────────────────────────────

// conceitoLinker links one milestone. First occurrence per concept, at most
// conceitosMaxPorMarco links, never inside headings, code, links or raw HTML,
// never in the concept's own owner milestone.
type conceitoLinker struct {
	set     *conceitoSet
	source  []byte
	slug    string
	nn      string
	marcoID string
	seen    map[string]bool // concept id -> first occurrence already handled
	linked  int
}

// linkifyConceitos runs after linkifyBridges on the same document, so a
// bridge's link is already in place and is skipped like any other link.
// A nil set (no registry, or an invalid one) links nothing.
func linkifyConceitos(doc ast.Node, source []byte, set *conceitoSet, slug, nn, marcoID string) {
	if set == nil || len(set.aliases) == 0 || marcoID == "" {
		return
	}
	l := &conceitoLinker{set: set, source: source, slug: slug, nn: nn, marcoID: marcoID, seen: map[string]bool{}}
	var walk func(ast.Node)
	walk = func(n ast.Node) {
		switch n.Kind() {
		case ast.KindHeading, ast.KindCodeBlock, ast.KindFencedCodeBlock, ast.KindHTMLBlock:
			return
		case ast.KindParagraph, ast.KindTextBlock:
			l.inline(n, linkTargets(n))
			return
		}
		// GFM table cells hold inlines directly, with no paragraph around
		// them — the Fase 0 audit found bridges in tables going unlinked
		// for exactly this reason; concepts must not repeat it.
		if n.Kind() == east.KindTableCell {
			l.inline(n, linkTargets(n))
			return
		}
		for c := n.FirstChild(); c != nil; c = c.NextSibling() {
			walk(c)
		}
	}
	walk(doc)
}

// linkTargets collects every link destination already in a block (bridges,
// authored links), so a concept whose owner is already linked from this
// block is not linked a second time.
func linkTargets(block ast.Node) map[string]bool {
	targets := map[string]bool{}
	_ = ast.Walk(block, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if link, ok := n.(*ast.Link); ok && entering {
			targets[string(link.Destination)] = true
		}
		return ast.WalkContinue, nil
	})
	return targets
}

// inline links concepts among the inline children of a block, recursing into
// emphasis runs. Consecutive Text siblings are matched as one run: goldmark
// splits text at delimiter characters ("private_key_jwt" arrives as three
// Text nodes), so matching node by node would miss aliases that a reader sees
// as one word.
func (l *conceitoLinker) inline(container ast.Node, targets map[string]bool) {
	c := container.FirstChild()
	for c != nil {
		switch cn := c.(type) {
		case *ast.Text:
			run := []*ast.Text{cn}
			next := cn.NextSibling()
			for next != nil {
				t, ok := next.(*ast.Text)
				last := run[len(run)-1]
				if !ok || last.SoftLineBreak() || last.HardLineBreak() || last.IsRaw() || t.IsRaw() ||
					t.Segment.Start != last.Segment.Stop {
					break
				}
				run = append(run, t)
				next = t.NextSibling()
			}
			l.linkRun(container, run, targets)
			c = next
			continue
		case *ast.CodeSpan:
			next := cn.NextSibling()
			l.linkCodeSpan(container, cn, targets)
			c = next
			continue
		case *ast.Emphasis:
			l.inline(cn, targets)
		}
		// Links (bridges included), autolinks and raw HTML are skipped.
		c = c.NextSibling()
	}
}

// claim decides whether this occurrence of rc becomes a link. It is the one
// place the per-milestone rules live: owner/ignorarEm suppression, first
// occurrence, an existing link to the same owner in the block, and the cap.
func (l *conceitoLinker) claim(rc *conceitoResolvido, targets map[string]bool) bool {
	if rc.dono.Slug == l.slug && rc.dono.ID == l.marcoID {
		return false
	}
	if rc.ignorarEm[l.slug+"/"+l.marcoID] {
		return false
	}
	if l.seen[rc.ID] {
		return false
	}
	l.seen[rc.ID] = true
	if targets[rc.dono.href()] {
		return false // the block already links the owner (an explicit bridge)
	}
	cut := l.linked >= conceitosMaxPorMarco
	l.set.citacoes[rc.ID] = append(l.set.citacoes[rc.ID], conceitoCitacao{Slug: l.slug, NN: l.nn, MarcoID: l.marcoID, Cortado: cut})
	if cut {
		return false
	}
	l.linked++
	return true
}

func (l *conceitoLinker) newLink(rc *conceitoResolvido) *ast.Link {
	link := ast.NewLink()
	link.Destination = []byte(rc.dono.href())
	link.SetAttributeString("class", []byte("conceito"))
	link.SetAttributeString("data-conceito", []byte(rc.ID))
	link.SetAttributeString("id", []byte("c-"+l.marcoID+"-"+rc.ID))
	return link
}

// linkCodeSpan links a code span whose whole content is exactly an alias
// (`private_key_jwt`), keeping the <code> inside the link the same way a
// bridge does. A bridge-shaped span never gets here as a concept: bridges
// were linked first and are skipped as links.
func (l *conceitoLinker) linkCodeSpan(container ast.Node, cs *ast.CodeSpan, targets map[string]bool) {
	content := normalizeInlineText(inlinePlainText(cs, l.source))
	if bridgeFullRe.MatchString(content) || bridgeShortRe.MatchString(content) {
		return
	}
	for _, a := range l.set.aliases {
		if !(content == a.text || (a.foldCase && strings.EqualFold(content, a.text))) {
			continue
		}
		if l.claim(a.conceito, targets) {
			link := l.newLink(a.conceito)
			container.ReplaceChild(container, cs, link)
			link.AppendChild(link, cs)
		}
		return
	}
}

// linkRun matches aliases over a run of contiguous Text nodes and, when
// something links, replaces the run with Text pieces and concept links that
// cover exactly the same source bytes — the visible text never changes.
func (l *conceitoLinker) linkRun(container ast.Node, run []*ast.Text, targets map[string]bool) {
	start, stop := run[0].Segment.Start, run[len(run)-1].Segment.Stop
	s := string(l.source[start:stop])

	type piece struct {
		from, to int
		rc       *conceitoResolvido
	}
	var pieces []piece
	pos := 0
	for pos < len(s) {
		m, a := l.nextMatch(s, pos)
		if a == nil {
			break
		}
		if l.claim(a.conceito, targets) {
			pieces = append(pieces, piece{m, m + len(a.text), a.conceito})
		}
		pos = m + len(a.text)
	}
	if len(pieces) == 0 {
		return
	}

	last := run[len(run)-1]
	soft, hard := last.SoftLineBreak(), last.HardLineBreak()
	anchor := ast.Node(run[0])
	insert := func(n ast.Node) { container.InsertBefore(container, anchor, n) }
	cursor := 0
	var tail ast.Node
	for _, p := range pieces {
		if p.from > cursor {
			t := ast.NewTextSegment(text.NewSegment(start+cursor, start+p.from))
			insert(t)
			tail = t
		}
		link := l.newLink(p.rc)
		link.AppendChild(link, ast.NewTextSegment(text.NewSegment(start+p.from, start+p.to)))
		insert(link)
		tail = link
		cursor = p.to
	}
	if cursor < len(s) {
		t := ast.NewTextSegment(text.NewSegment(start+cursor, stop))
		insert(t)
		tail = t
	}
	for _, t := range run {
		container.RemoveChild(container, t)
	}
	// The line break that ended the run must survive on whatever now ends
	// it; on a link, it moves to an empty text node after the link.
	if soft || hard {
		t, ok := tail.(*ast.Text)
		if !ok {
			t = ast.NewTextSegment(text.NewSegment(stop, stop))
			container.InsertAfter(container, tail, t)
		}
		t.SetSoftLineBreak(soft)
		t.SetHardLineBreak(hard)
	}
}

// nextMatch finds the earliest alias occurrence at or after pos that sits on
// a word boundary; at the same position the longest alias wins (aliases are
// sorted longest first). Aliases of concepts already handled in this
// milestone are still matched — so "JWS" inside a later "JWS" can't let a
// shorter alias claim the same bytes — and claim() simply declines them.
func (l *conceitoLinker) nextMatch(s string, pos int) (int, *conceitoAlias) {
	best := -1
	var bestAlias *conceitoAlias
	for i := range l.set.aliases {
		a := &l.set.aliases[i]
		for from := pos; from <= len(s)-len(a.text); {
			idx := indexAlias(s[from:], a)
			if idx < 0 {
				break
			}
			at := from + idx
			if best >= 0 && at >= best {
				break // can't beat the current best (a longer alias already won ties)
			}
			if wordBoundary(s, at, at+len(a.text)) {
				best, bestAlias = at, a
				break
			}
			_, size := utf8.DecodeRuneInString(s[at:])
			from = at + size
		}
	}
	return best, bestAlias
}

func indexAlias(s string, a *conceitoAlias) int {
	if !a.foldCase {
		return strings.Index(s, a.text)
	}
	for i := 0; i+len(a.text) <= len(s); {
		if strings.EqualFold(s[i:i+len(a.text)], a.text) {
			return i
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		i += size
	}
	return -1
}

// wordBoundary is a Unicode-aware \b: Go's regexp \b is ASCII-only, so
// "Idempotência" would end at "ê" and "PAR" would match inside "PARte". A
// letter, digit or underscore on either side means "inside a word".
func wordBoundary(s string, from, to int) bool {
	isWord := func(r rune) bool { return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) }
	if from > 0 {
		r, _ := utf8.DecodeLastRuneInString(s[:from])
		if isWord(r) {
			return false
		}
	}
	if to < len(s) {
		r, _ := utf8.DecodeRuneInString(s[to:])
		if isWord(r) {
			return false
		}
	}
	return true
}

// ── conceitos.json ──────────────────────────────────────────────────────────

// ConceitoMarco is a milestone as the preview shows it.
type ConceitoMarco struct {
	Slug    string `json:"slug"`
	MarcoID string `json:"marcoId"`
	Titulo  string `json:"titulo"`
	Trilha  string `json:"trilha"`
	NN      string `json:"nn"`
	Minutos int    `json:"minutos,omitempty"`
}

// ConceitoEntry is one concept in web/data/conceitos.json.
type ConceitoEntry struct {
	ID     string `json:"id"`
	Termo  string `json:"termo"`
	Resumo string `json:"resumo"`
	// Glossario is the owner trilha's glossary anchor for this concept
	// (#/glossario/<anchor>), when one matches an alias.
	Glossario string          `json:"glossario,omitempty"`
	Dono      ConceitoMarco   `json:"dono"`
	Tambem    []ConceitoMarco `json:"tambem,omitempty"`
	CitadoEm  []ConceitoMarco `json:"citadoEm"`
}

// ConceitoCatalog is web/data/conceitos.json.
type ConceitoCatalog struct {
	GeneratedAt string          `json:"generatedAt"`
	Conceitos   []ConceitoEntry `json:"conceitos"`
}

// buildConceitosCatalog fills each concept from the compiled courses and the
// glossary, and runs the content checks the structural pass couldn't: an
// empty resumo needs a matching glossary entry in the owner's trilha, and the
// owner milestone must actually contain one of the aliases (a cheap sanity
// check that the owner is right). Problems are returned for the caller to
// log; TestConceitosResolve turns them into failures.
func buildConceitosCatalog(set *conceitoSet, courses map[string]CompiledCourse, glossary []GlossaryEntry) ([]ConceitoEntry, []error) {
	if set == nil {
		return nil, nil
	}
	var errs []error
	marco := func(r marcoRef) (ConceitoMarco, *CompiledMilestone) {
		course, ok := courses[r.Slug]
		if !ok {
			return ConceitoMarco{Slug: r.Slug, MarcoID: r.ID, NN: r.NN}, nil
		}
		for i := range course.Milestones {
			m := &course.Milestones[i]
			if m.ID == r.ID {
				return ConceitoMarco{Slug: r.Slug, MarcoID: m.ID, Titulo: m.Title, Trilha: course.Title, NN: r.NN, Minutos: m.EstimatedMinutes}, m
			}
		}
		return ConceitoMarco{Slug: r.Slug, MarcoID: r.ID, NN: r.NN}, nil
	}

	var out []ConceitoEntry
	for _, rc := range set.conceitos {
		dono, m := marco(rc.dono)
		if m == nil {
			errs = append(errs, fmt.Errorf("conceito %q: marco dono %s/%s não compilou", rc.ID, rc.dono.Slug, rc.dono.NN))
		} else if !milestoneMentions(m, rc) {
			errs = append(errs, fmt.Errorf("conceito %q: o marco dono %s/%s não contém nenhum apelido — o dono está certo?", rc.ID, rc.dono.Slug, rc.dono.NN))
		}

		resumo := strings.TrimSpace(rc.Resumo)
		g, hasGlossary := glossaryFor(rc, glossary)
		if resumo == "" {
			if hasGlossary {
				resumo = g.Summary
			} else {
				errs = append(errs, fmt.Errorf("conceito %q: resumo vazio e nenhum verbete do glossário de %s casa com um apelido", rc.ID, rc.dono.Slug))
			}
		}

		entry := ConceitoEntry{ID: rc.ID, Termo: rc.Termo, Resumo: resumo, Dono: dono, CitadoEm: []ConceitoMarco{}}
		if hasGlossary {
			entry.Glossario = g.Anchor
		}
		for _, r := range rc.tambem {
			t, _ := marco(r)
			entry.Tambem = append(entry.Tambem, t)
		}
		for _, cit := range set.citacoes[rc.ID] {
			if cit.Cortado {
				continue
			}
			c, _ := marco(marcoRef{Slug: cit.Slug, NN: cit.NN, ID: cit.MarcoID})
			entry.CitadoEm = append(entry.CitadoEm, c)
		}
		sort.Slice(entry.CitadoEm, func(i, j int) bool {
			if entry.CitadoEm[i].Slug != entry.CitadoEm[j].Slug {
				return entry.CitadoEm[i].Slug < entry.CitadoEm[j].Slug
			}
			return entry.CitadoEm[i].NN < entry.CitadoEm[j].NN
		})
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, errs
}

// milestoneMentions reports whether the milestone's rendered text contains
// one of the concept's aliases on a word boundary.
func milestoneMentions(m *CompiledMilestone, rc *conceitoResolvido) bool {
	var b strings.Builder
	for _, s := range m.Sections {
		b.WriteString(s.HTML)
		b.WriteString(s.Intro)
		for _, blk := range s.Blocks {
			b.WriteString(blk.HTML)
		}
	}
	plain := htmlPlainText(b.String())
	for _, a := range rc.Apelidos {
		ca := conceitoAlias{text: a, foldCase: rc.IgnorarCaixa}
		for from := 0; from <= len(plain)-len(a); {
			idx := indexAlias(plain[from:], &ca)
			if idx < 0 {
				break
			}
			at := from + idx
			if wordBoundary(plain, at, at+len(a)) {
				return true
			}
			from = at + 1
		}
	}
	return false
}

// glossaryFor finds the owner trilha's glossary entry for a concept: the
// term itself, the term without its parenthetical, or the parenthetical
// alone must equal an alias ("JWS (JSON Web Signature)" matches "JWS").
func glossaryFor(rc *conceitoResolvido, glossary []GlossaryEntry) (GlossaryEntry, bool) {
	for _, g := range glossary {
		if g.Slug != rc.dono.Slug {
			continue
		}
		for _, cand := range termVariants(g.Term) {
			for _, a := range rc.Apelidos {
				if cand == a || (rc.IgnorarCaixa && strings.EqualFold(cand, a)) {
					return g, true
				}
			}
		}
	}
	return GlossaryEntry{}, false
}

var termParenRe = regexp.MustCompile(`^(.*?)\s*\((.+)\)\s*$`)

func termVariants(term string) []string {
	term = strings.TrimSpace(term)
	if m := termParenRe.FindStringSubmatch(term); m != nil {
		return []string{term, strings.TrimSpace(m[1]), strings.TrimSpace(m[2])}
	}
	return []string{term}
}

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

// htmlPlainText is the reader-visible text of sanitized HTML: tags dropped,
// entities decoded, whitespace collapsed.
func htmlPlainText(s string) string {
	s = html.UnescapeString(htmlTagRe.ReplaceAllString(s, " "))
	return strings.Join(strings.Fields(s), " ")
}

func writeConceitos(entries []ConceitoEntry, dataDir string) error {
	if entries == nil {
		entries = []ConceitoEntry{}
	}
	catalog := ConceitoCatalog{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Conceitos: entries}
	return writeJSON(filepath.Join(dataDir, "conceitos.json"), catalog)
}
