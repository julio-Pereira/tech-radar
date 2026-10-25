package course

import (
	"html"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// ── Fixtures ────────────────────────────────────────────────────────────────

// conceitoFixtureIndex is a tiny bridge index: "dono/01" owns the concepts,
// "leitor/01" and "leitor/02" cite them.
var conceitoFixtureIndex = bridgeIndex{
	"dono":   {"01": "marco-dono", "02": "outro-dono"},
	"leitor": {"01": "marco-leitor", "02": "marco-ignorado"},
}

func fixtureSet(t *testing.T, list []Conceito) *conceitoSet {
	t.Helper()
	set, errs := resolveConceitos(list, conceitoFixtureIndex)
	if len(errs) > 0 {
		t.Fatalf("fixture registry invalid: %v", errs)
	}
	return set
}

// linkedHTML splits body as milestone leitor/01 with concept linking on and
// returns every rendered chunk joined, plus the set for citation checks.
func linkedHTML(t *testing.T, set *conceitoSet, slug, nn, marcoID, body string) string {
	t.Helper()
	sections, broken, err := splitSectionsWith([]byte(body), conceitoFixtureIndex, nil, &conceitoCtx{set: set, slug: slug, nn: nn, marcoID: marcoID})
	if err != nil {
		t.Fatalf("splitSectionsWith: %v", err)
	}
	if len(broken) != 0 {
		t.Fatalf("unexpected broken bridges: %v", broken)
	}
	var b strings.Builder
	for _, s := range sections {
		b.WriteString(s.HTML)
		b.WriteString(s.Intro)
		for _, blk := range s.Blocks {
			b.WriteString(blk.HTML)
		}
	}
	return b.String()
}

func conceitoLinkCount(html, id string) int {
	return strings.Count(html, `data-conceito="`+id+`"`)
}

var basicConceitos = []Conceito{
	{ID: "par", Termo: "PAR", Dono: "dono/01", Apelidos: []string{"PAR", "Pushed Authorization Request"}},
	{ID: "idempotencia", Termo: "Idempotência", Dono: "dono/01", Apelidos: []string{"Idempotência", "idempotência"}},
	{ID: "private-key-jwt", Termo: "private_key_jwt", Dono: "dono/02", Apelidos: []string{"private_key_jwt"}},
	{ID: "json", Termo: "JSON", Dono: "dono/02", Apelidos: []string{"JSON"}},
	{ID: "jws", Termo: "JWS", Dono: "dono/01", Apelidos: []string{"JWS", "JSON Web Signature"}},
}

// ── Registry validation ─────────────────────────────────────────────────────

func TestResolveConceitosRejectsInvalidRegistry(t *testing.T) {
	cases := map[string][]Conceito{
		"id não kebab-case":      {{ID: "JWS", Termo: "x", Dono: "dono/01", Apelidos: []string{"JWS"}}},
		"id duplicado":           {{ID: "a", Termo: "x", Dono: "dono/01", Apelidos: []string{"A"}}, {ID: "a", Termo: "y", Dono: "dono/01", Apelidos: []string{"B"}}},
		"dono não resolve":       {{ID: "a", Termo: "x", Dono: "dono/09", Apelidos: []string{"A"}}},
		"dono sem forma slug/NN": {{ID: "a", Termo: "x", Dono: "dono", Apelidos: []string{"A"}}},
		"tambem não resolve":     {{ID: "a", Termo: "x", Dono: "dono/01", Apelidos: []string{"A"}, Tambem: []string{"leitor/09"}}},
		"ignorarEm não resolve":  {{ID: "a", Termo: "x", Dono: "dono/01", Apelidos: []string{"A"}, IgnorarEm: []string{"nada/01"}}},
		"sem apelidos":           {{ID: "a", Termo: "x", Dono: "dono/01"}},
		"termo vazio":            {{ID: "a", Dono: "dono/01", Apelidos: []string{"A"}}},
		"apelido com espaço":     {{ID: "a", Termo: "x", Dono: "dono/01", Apelidos: []string{" A"}}},
		"apelido em dois conceitos": {
			{ID: "a", Termo: "x", Dono: "dono/01", Apelidos: []string{"PAR"}},
			{ID: "b", Termo: "y", Dono: "dono/02", Apelidos: []string{"par"}},
		},
	}
	for name, list := range cases {
		t.Run(name, func(t *testing.T) {
			set, errs := resolveConceitos(list, conceitoFixtureIndex)
			if len(errs) == 0 || set != nil {
				t.Fatalf("got set=%v errs=%v, want a nil set and at least one error", set != nil, errs)
			}
		})
	}
}

func TestResolveConceitosAllowsBothCasingsInOneConcept(t *testing.T) {
	fixtureSet(t, []Conceito{{ID: "outbox", Termo: "Outbox", Dono: "dono/01", Apelidos: []string{"Outbox", "outbox"}}})
}

func TestLoadConceitosMissingFileIsEmpty(t *testing.T) {
	list, err := loadConceitos(filepath.Join(t.TempDir(), "nao-existe.yaml"))
	if err != nil || len(list) != 0 {
		t.Fatalf("got %v, %v; want empty and no error", list, err)
	}
}

// ── Linker ──────────────────────────────────────────────────────────────────

func TestLinkerUnicodeWordBoundary(t *testing.T) {
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor",
		"A PARte e comPARar não contam. Idempotências também não. Só a Idempotência inteira e o PAR.\n")
	if conceitoLinkCount(html, "par") != 1 || !strings.Contains(html, `id="c-marco-leitor-par">PAR</a>`) {
		t.Errorf("PAR should link once, on the standalone word only:\n%s", html)
	}
	if !strings.Contains(html, `>Idempotência</a> inteira`) {
		t.Errorf("Idempotência should link as a whole word, accents included:\n%s", html)
	}
	if strings.Contains(html, `>Idempotência</a>s`) {
		t.Errorf("Idempotências must not link its prefix:\n%s", html)
	}
}

func TestLinkerLongestAliasWins(t *testing.T) {
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "Assinamos com JSON Web Signature.\n")
	if !strings.Contains(html, `data-conceito="jws" id="c-marco-leitor-jws">JSON Web Signature</a>`) {
		t.Errorf("the longer alias (jws) should win over JSON at the same position:\n%s", html)
	}
	if conceitoLinkCount(html, "json") != 0 {
		t.Errorf("JSON must not also link inside the jws match:\n%s", html)
	}
}

func TestLinkerFirstOccurrenceOnly(t *testing.T) {
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "## A\n\nO JWS assina.\n\n## B\n\nOutro JWS, e JWS de novo.\n")
	if n := conceitoLinkCount(html, "jws"); n != 1 {
		t.Fatalf("got %d jws links, want 1 (first occurrence only):\n%s", n, html)
	}
	if strings.Index(html, "c-marco-leitor-jws") > strings.Index(html, "Outro JWS") {
		t.Errorf("the link should be on the first occurrence")
	}
}

func TestLinkerCapPerMilestone(t *testing.T) {
	var list []Conceito
	var words []string
	for i := 0; i < conceitosMaxPorMarco+3; i++ {
		alias := "Termo" + string(rune('A'+i))
		list = append(list, Conceito{ID: "t-" + strings.ToLower(string(rune('a'+i))), Termo: alias, Dono: "dono/01", Apelidos: []string{alias}})
		words = append(words, alias)
	}
	set := fixtureSet(t, list)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", strings.Join(words, ", ")+".\n")
	if n := strings.Count(html, `class="conceito"`); n != conceitosMaxPorMarco {
		t.Fatalf("got %d links, want the cap of %d", n, conceitosMaxPorMarco)
	}
	cut := 0
	for _, cits := range set.citacoes {
		for _, c := range cits {
			if c.Cortado {
				cut++
			}
		}
	}
	if cut != 3 {
		t.Errorf("got %d cut citations, want 3 (counted for the report)", cut)
	}
}

func TestLinkerSuppressions(t *testing.T) {
	list := append([]Conceito{}, basicConceitos...)
	list[4].IgnorarEm = []string{"leitor/02"}
	set := fixtureSet(t, list)

	t.Run("no próprio marco dono", func(t *testing.T) {
		if html := linkedHTML(t, set, "dono", "01", "marco-dono", "O JWS é ensinado aqui.\n"); conceitoLinkCount(html, "jws") != 0 {
			t.Errorf("owner milestone linked to itself:\n%s", html)
		}
	})
	t.Run("ignorarEm", func(t *testing.T) {
		if html := linkedHTML(t, set, "leitor", "02", "marco-ignorado", "O JWS aparece.\n"); conceitoLinkCount(html, "jws") != 0 {
			t.Errorf("ignorarEm milestone linked:\n%s", html)
		}
	})
	t.Run("títulos, código e links", func(t *testing.T) {
		body := "## JWS no título\n\n```\nJWS em bloco de código\n```\n\nUm [link sobre JWS](https://example.com) e `JWS assinado` em código.\n"
		if html := linkedHTML(t, set, "leitor", "01", "marco-leitor", body); conceitoLinkCount(html, "jws") != 0 {
			t.Errorf("linked inside heading, code or link:\n%s", html)
		}
	})
	t.Run("bloco com ponte para o mesmo dono", func(t *testing.T) {
		html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "O JWS está em `dono/01`.\n\nE o JWS de novo aqui.\n")
		if conceitoLinkCount(html, "jws") != 0 {
			t.Errorf("concept linked next to a bridge to the same owner (and that first occurrence counts):\n%s", html)
		}
		if !strings.Contains(html, `<a href="#/learn/dono/marco-dono"><code>dono/01</code></a>`) {
			t.Errorf("the bridge itself must still link:\n%s", html)
		}
	})
}

func TestLinkerCodeSpanExactAlias(t *testing.T) {
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "Use `private_key_jwt` no cliente.\n")
	want := `<a href="#/learn/dono/outro-dono" class="conceito" data-conceito="private-key-jwt" id="c-marco-leitor-private-key-jwt"><code>private_key_jwt</code></a>`
	if !strings.Contains(html, want) {
		t.Errorf("exact code span should link and keep its <code>:\n%s", html)
	}
	html = linkedHTML(t, set, "leitor", "01", "marco-leitor", "Use `private_key_jwt=true` no cliente.\n")
	if conceitoLinkCount(html, "private-key-jwt") != 0 {
		t.Errorf("a code span that only contains the alias must not link:\n%s", html)
	}
}

func TestLinkerAliasSplitAcrossTextNodes(t *testing.T) {
	// goldmark splits "private_key_jwt" at each "_" into separate Text nodes.
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "O método private_key_jwt assina.\n")
	if !strings.Contains(html, `>private_key_jwt</a> assina`) {
		t.Errorf("alias spanning several Text nodes should link:\n%s", html)
	}
}

func TestLinkerTableCellAndLineBreak(t *testing.T) {
	set := fixtureSet(t, basicConceitos)
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "| Termo | Uso |\n| --- | --- |\n| JWS | assinatura |\n\nUma linha que termina em PAR\ne continua aqui.\n")
	if conceitoLinkCount(html, "jws") != 1 {
		t.Errorf("concept in a table cell should link:\n%s", html)
	}
	if !strings.Contains(html, ">PAR</a>\ne continua") {
		t.Errorf("the soft line break after a linked alias must survive:\n%s", html)
	}
}

func TestSanitizerKeepsOnlyConceitoAttributes(t *testing.T) {
	in := `<a href="#/learn/x/y" class="conceito" data-conceito="jws" id="c-m-jws">a</a>` +
		`<a href="#/learn/x/y" class="outra" data-conceito="Não Vale" data-foo="1">b</a>` +
		`<p class="conceito" data-conceito="jws">c</p>`
	out := bodyPolicy.Sanitize(in)
	if !strings.Contains(out, `<a href="#/learn/x/y" class="conceito" data-conceito="jws" id="c-m-jws">a</a>`) {
		t.Errorf("concept link attributes were stripped: %s", out)
	}
	for _, leaked := range []string{`class="outra"`, `data-foo`, `Não Vale`, `<p class`, `<p data-`} {
		if strings.Contains(out, leaked) {
			t.Errorf("sanitizer let %q through: %s", leaked, out)
		}
	}
}

// ── Integration: the real content tree ──────────────────────────────────────

// realConceitos compiles every real course with the real registry linked in,
// the same way Compile does, and returns what the integration tests need.
func realConceitos(t *testing.T) (*conceitoSet, map[string]CompiledCourse, []GlossaryEntry) {
	t.Helper()
	index, err := buildBridgeIndex(contentDir)
	if err != nil {
		t.Fatalf("build bridge index: %v", err)
	}
	planned, err := loadPlannedBridges("../../content/bridges-planned.yaml")
	if err != nil {
		t.Fatalf("load bridges-planned.yaml: %v", err)
	}
	vocab, err := loadCompetencyVocabulary("../../content/competencies.yaml")
	if err != nil {
		t.Fatalf("load competencies: %v", err)
	}
	list, err := loadConceitos("../../content/conceitos.yaml")
	if err != nil {
		t.Fatalf("load conceitos.yaml: %v", err)
	}
	set, errs := resolveConceitos(list, index)
	for _, e := range errs {
		t.Errorf("conceitos.yaml: %v", e)
	}
	if set == nil {
		t.FailNow()
	}
	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}
	courses := map[string]CompiledCourse{}
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		c, _, err := compileCourse(filepath.Join(contentDir, d.Name()), index, planned, vocab, set)
		if err != nil {
			t.Fatalf("%s: %v", d.Name(), err)
		}
		courses[c.Slug] = c
	}
	glossary, err := compileGlossary(contentDir, courses, index)
	if err != nil {
		t.Fatalf("compile glossary: %v", err)
	}
	return set, courses, glossary
}

// TestConceitosResolve is the plan's named check: the real registry is
// structurally valid (ids, owners, aliases) and passes the content checks
// (owner contains an alias; an empty resumo has a matching glossary entry).
func TestConceitosResolve(t *testing.T) {
	set, courses, glossary := realConceitos(t)
	entries, errs := buildConceitosCatalog(set, courses, glossary)
	for _, e := range errs {
		t.Errorf("conceitos.yaml: %v", e)
	}
	explicit := map[string]bool{}
	for _, rc := range set.conceitos {
		explicit[rc.ID] = strings.TrimSpace(rc.Resumo) != ""
	}
	for _, e := range entries {
		// The glossary anchor is required only when the summary came from
		// the glossary; a hand-written resumo exists precisely because the
		// owner trilha has no entry for the term.
		if e.Resumo == "" || (!explicit[e.ID] && e.Glossario == "") || e.Dono.Titulo == "" || e.Dono.Minutos == 0 {
			t.Errorf("conceito %q: catálogo incompleto: %+v", e.ID, e)
		}
		if len(e.CitadoEm) == 0 {
			t.Errorf("conceito %q: nenhuma citação ligada fora do dono — o conceito é mesmo transversal?", e.ID)
		}
	}
}

// TestConceitosRealCitations pins real links against real prose, so a
// regression in the linker shows up outside the fixtures too.
func TestConceitosRealCitations(t *testing.T) {
	_, courses, _ := realConceitos(t)
	const jwsOwner = "#/learn/seguranca-aplicacao/jose-por-dentro"
	const outboxOwner = "#/learn/arquitetura-eventos/outbox-inbox-idempotencia"
	for _, tc := range []struct {
		slug, marco, conceito, href string
		want                        int
	}{
		{"seguranca-aplicacao", "federacao-e-sso", "jws", jwsOwner, 1},
		{"kafka", "padroes-de-integracao", "outbox", outboxOwner, 1},
		// A block that already bridges to the owner suppresses the concept,
		// and that suppressed first occurrence still counts: here JOSE/JWS
		// sits next to `seguranca-aplicacao/04`, and the first "outbox" is
		// in a "Reencontro — `arquitetura-eventos/08`" callout, so the later
		// "outbox" stays plain too — the reader already has the owner link.
		{"pagamentos-e-liquidacao", "orquestracao-de-pagamentos", "jws", jwsOwner, 0},
		{"pagamentos-e-liquidacao", "orquestracao-de-pagamentos", "outbox", outboxOwner, 0},
		// JWS only appears inside a code block in this marco.
		{"seguranca-aplicacao", "oauth2-e-oidc", "jws", jwsOwner, 0},
		// The owner never links to itself.
		{"arquitetura-eventos", "outbox-inbox-idempotencia", "outbox", outboxOwner, 0},
	} {
		html := courseMilestoneHTML(t, courses, tc.slug, tc.marco)
		got := conceitoLinkCount(html, tc.conceito)
		if got != tc.want || (tc.want > 0 && !strings.Contains(html, `href="`+tc.href+`" class="conceito"`)) {
			t.Errorf("%s/%s: got %d %s link(s), want %d to %s", tc.slug, tc.marco, got, tc.conceito, tc.want, tc.href)
		}
	}
}

func courseMilestoneHTML(t *testing.T, courses map[string]CompiledCourse, slug, marcoID string) string {
	t.Helper()
	for _, m := range courses[slug].Milestones {
		if m.ID != marcoID {
			continue
		}
		var b strings.Builder
		for _, s := range m.Sections {
			b.WriteString(s.HTML)
			b.WriteString(s.Intro)
			for _, blk := range s.Blocks {
				b.WriteString(blk.HTML)
			}
		}
		return b.String()
	}
	t.Fatalf("milestone %s/%s not found", slug, marcoID)
	return ""
}

// TestConceitosConserveText: linking only wraps existing text in <a>; the
// reader-visible text of every real milestone is identical with and without
// the registry. Running the linked parse twice also proves determinism.
func TestConceitosConserveTextAndAreDeterministic(t *testing.T) {
	index, err := buildBridgeIndex(contentDir)
	if err != nil {
		t.Fatalf("build bridge index: %v", err)
	}
	list, err := loadConceitos("../../content/conceitos.yaml")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	set, errs := resolveConceitos(list, index)
	if len(errs) > 0 {
		t.Fatalf("registry: %v", errs)
	}
	dirs, _ := os.ReadDir(contentDir)
	checked := 0
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		manifest, err := ParseManifest(filepath.Join(contentDir, d.Name(), "course.yaml"))
		if err != nil {
			t.Fatalf("%s: %v", d.Name(), err)
		}
		for _, m := range manifest.Milestones {
			path := filepath.Join(contentDir, d.Name(), m)
			_, _, plain, _, err := ParseMilestone(path, index, nil)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			_, _, linked, _, err := parseMilestone(path, index, nil, set, manifest.Slug)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			_, _, again, _, _ := parseMilestone(path, index, nil, set, manifest.Slug)
			if a, b := sectionsText(plain), sectionsText(linked); a != b {
				t.Errorf("%s: visible text changed by the linker", path)
			}
			if a, b := sectionsHTML(linked), sectionsHTML(again); a != b {
				t.Errorf("%s: two linked parses differ (nondeterministic)", path)
			}
			checked++
		}
	}
	if checked == 0 {
		t.Fatal("no milestones checked")
	}
}

func sectionsHTML(sections []Section) string {
	var b strings.Builder
	for _, s := range sections {
		b.WriteString(s.HTML)
		b.WriteString(s.Intro)
		for _, blk := range s.Blocks {
			b.WriteString(blk.HTML)
		}
	}
	return b.String()
}

// sectionsText strips tags without inserting anything: "outbox</a>/inbox"
// reads "outbox/inbox" in the browser, and the comparison must agree.
func sectionsText(sections []Section) string {
	return strings.Join(strings.Fields(html.UnescapeString(htmlTagRe.ReplaceAllString(sectionsHTML(sections), ""))), " ")
}

// TestRelatorioConceitos is the non-blocking report (§4.4 of the plan):
// `go test ./internal/course -run TestRelatorioConceitos -v`. It never fails;
// it only logs what a curator needs to tune the registry.
func TestRelatorioConceitos(t *testing.T) {
	set, courses, glossary := realConceitos(t)

	t.Log("── menções ligadas por conceito (cortadas pelo teto entre parênteses)")
	var cut []string
	for _, rc := range set.conceitos {
		linked, cortadas := 0, 0
		for _, c := range set.citacoes[rc.ID] {
			if c.Cortado {
				cortadas++
				cut = append(cut, rc.ID+" em "+c.Slug+"/"+c.NN)
			} else {
				linked++
			}
		}
		t.Logf("  %-20s %3d (%d)", rc.ID, linked, cortadas)
		if linked == 0 {
			t.Logf("  ! %s não é citado fora do dono: candidato a remover", rc.ID)
		}
	}
	t.Logf("── links cortados pelo teto de %d por marco: %d", conceitosMaxPorMarco, len(cut))
	for _, c := range cut {
		t.Logf("  %s", c)
	}

	// Candidates: glossary terms cited outside their own trilha that the
	// registry doesn't cover yet, ordered by how many other trilhas cite them.
	covered := map[string]bool{}
	for _, a := range set.aliases {
		covered[strings.ToLower(a.text)] = true
	}
	texts := map[string][]string{} // slug -> visible text of each milestone
	for slug, c := range courses {
		for _, m := range c.Milestones {
			texts[slug] = append(texts[slug], htmlPlainText(sectionsHTML(m.Sections)))
		}
	}
	type cand struct {
		term    string
		slug    string
		trilhas int
	}
	var cands []cand
	seen := map[string]bool{}
	for _, g := range glossary {
		term := termVariants(g.Term)[0]
		if v := termVariants(g.Term); len(v) > 1 {
			term = v[1]
		}
		key := strings.ToLower(term)
		if covered[key] || seen[key] || len([]rune(term)) < 3 {
			continue
		}
		seen[key] = true
		alias := conceitoAlias{text: term}
		n := 0
		for slug, ts := range texts {
			if slug == g.Slug {
				continue
			}
			for _, txt := range ts {
				if aliasIn(txt, &alias) {
					n++
					break
				}
			}
		}
		if n > 0 {
			cands = append(cands, cand{term, g.Slug, n})
		}
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].trilhas != cands[j].trilhas {
			return cands[i].trilhas > cands[j].trilhas
		}
		return cands[i].term < cands[j].term
	})
	t.Logf("── candidatos: %d verbetes citados fora da própria trilha e fora do registro (top 40)", len(cands))
	for i, c := range cands {
		if i == 40 {
			break
		}
		t.Logf("  %-40s %2d trilha(s)  (verbete em %s)", c.term, c.trilhas, c.slug)
	}
}

func aliasIn(s string, a *conceitoAlias) bool {
	for from := 0; from <= len(s)-len(a.text); {
		idx := indexAlias(s[from:], a)
		if idx < 0 {
			return false
		}
		at := from + idx
		if wordBoundary(s, at, at+len(a.text)) {
			return true
		}
		from = at + 1
	}
	return false
}

// ── Fase 4: naoSeguidoDe, the seed and the reverse links ────────────────────

func TestLinkerNaoSeguidoDe(t *testing.T) {
	set := fixtureSet(t, []Conceito{{ID: "rfc", Termo: "RFC", Dono: "dono/01", Apelidos: []string{"RFC"}, NaoSeguidoDe: []string{`\s*\d`}}})
	html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "Siga a RFC 8705 e depois escreva uma RFC curta.\n")
	if conceitoLinkCount(html, "rfc") != 1 || !strings.Contains(html, `>RFC</a> curta`) {
		t.Errorf("a standard citation must be skipped and the decision document linked:\n%s", html)
	}
	if _, errs := resolveConceitos([]Conceito{{ID: "x", Termo: "x", Dono: "dono/01", Apelidos: []string{"X"}, NaoSeguidoDe: []string{"("}}}, conceitoFixtureIndex); len(errs) == 0 {
		t.Error("an invalid naoSeguidoDe regex must be a registry error")
	}
}

// TestConceitosSeedCases pins the plan's acceptance case (spring-boot/09 links
// jwt, private-key-jwt, fapi and mtls) and the RFC standard exclusion.
func TestConceitosSeedCases(t *testing.T) {
	_, courses, _ := realConceitos(t)
	html := courseMilestoneHTML(t, courses, "spring-boot", "seguranca-oauth2-fapi")
	for _, id := range []string{"jwt", "private-key-jwt", "fapi", "mtls"} {
		if conceitoLinkCount(html, id) != 1 {
			t.Errorf("spring-boot/09: want one %s link", id)
		}
	}
	// Only standards ("RFC 8705") are cited as RFC in these marcos.
	for _, m := range [][2]string{{"seguranca-aplicacao", "fapi-mtls-e-ciba"}, {"go-fintech", "rest-bff"}} {
		if conceitoLinkCount(courseMilestoneHTML(t, courses, m[0], m[1]), "rfc") != 0 {
			t.Errorf("%s/%s: a standard citation (RFC NNNN) was linked as a decision document", m[0], m[1])
		}
	}
}

func TestConceitosReverseLinks(t *testing.T) {
	set, courses, glossary := realConceitos(t)
	entries, errs := buildConceitosCatalog(set, courses, glossary)
	if len(errs) > 0 {
		t.Fatalf("catalog: %v", errs)
	}
	markGlossaryConceitos(set, entries, glossary)
	find := func(slug, term string) GlossaryEntry {
		for _, g := range glossary {
			if g.Slug == slug && g.Term == term {
				return g
			}
		}
		t.Fatalf("glossary entry %s/%q not found", slug, term)
		return GlossaryEntry{}
	}

	// The owner's definition is the principal one, and the mTLS entry now
	// points at the marco that teaches it (07, fixed from 06).
	mtls := find("seguranca-aplicacao", "mTLS")
	if mtls.Conceito != "mtls" || !mtls.Principal || mtls.MarcoID != "fapi-mtls-e-ciba" {
		t.Errorf("mTLS entry: got conceito=%q principal=%v marcoId=%q", mtls.Conceito, mtls.Principal, mtls.MarcoID)
	}
	// Idempotência is defined in engenharia-de-dados but taught in
	// arquitetura-eventos/08: not principal, and it says where the owner is.
	idem := find("engenharia-de-dados", "Idempotência")
	if idem.Conceito != "idempotencia" || idem.Principal || idem.ConceitoDono == nil || idem.ConceitoDono.Slug != "arquitetura-eventos" {
		t.Errorf("Idempotência entry: got %+v", idem)
	}

	changed := applyUsadoEm(entries, courses)
	if len(changed) == 0 {
		t.Fatal("no owner course got usadoEm")
	}
	var usado []ConceitoMarco
	for _, m := range courses["seguranca-aplicacao"].Milestones {
		if m.ID == "jose-por-dentro" {
			usado = m.UsadoEm
		}
	}
	found := false
	for _, u := range usado {
		if u.Slug == "spring-boot" && u.MarcoID == "seguranca-oauth2-fapi" {
			found = true
		}
	}
	if !found {
		t.Errorf("seguranca-aplicacao/04 usadoEm should include spring-boot/09, got %+v", usado)
	}
}

// ── Fase 5: the author's own pointer wins ───────────────────────────────────

func TestLinkerAuthorPointerWins(t *testing.T) {
	set := fixtureSet(t, basicConceitos)

	t.Run("(marco NN) para outro marco não liga e não consome", func(t *testing.T) {
		html := linkedHTML(t, set, "leitor", "01", "marco-leitor",
			"O consumidor é idempotente (marco 02) por desenho.\n\nMais adiante, a idempotência volta.\n")
		if conceitoLinkCount(html, "idempotencia") != 1 || !strings.Contains(html, `>idempotência</a> volta`) {
			t.Errorf("the occurrence next to the author's pointer must stay plain, and a later one link:\n%s", html)
		}
	})
	t.Run("ponte para outro marco logo depois", func(t *testing.T) {
		html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "Use o JWS (`leitor/02`) aqui.\n")
		if conceitoLinkCount(html, "jws") != 0 {
			t.Errorf("concept linked right before a bridge to another marco:\n%s", html)
		}
	})
	t.Run("code span seguido de ponte para outro marco", func(t *testing.T) {
		html := linkedHTML(t, set, "leitor", "01", "marco-leitor", "Assine com `private_key_jwt` (`leitor/02`).\n")
		if conceitoLinkCount(html, "private-key-jwt") != 0 {
			t.Errorf("code span linked right before a bridge to another marco:\n%s", html)
		}
	})
	t.Run("(marco NN) que é o próprio dono mantém o link", func(t *testing.T) {
		html := linkedHTML(t, set, "dono", "02", "outro-dono", "O JWS (marco 01) assina.\n")
		if conceitoLinkCount(html, "jws") != 1 {
			t.Errorf("a pointer to the owner itself must not suppress the link:\n%s", html)
		}
	})
}
