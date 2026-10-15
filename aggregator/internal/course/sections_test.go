package course

import (
	"html"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// ── 1. Boundary table ───────────────────────────────────────────────────────

func TestSplitSectionsBoundaries(t *testing.T) {
	tests := []struct {
		name string
		body string
		// check inspects the single section produced by `body` — every case
		// here has exactly one H2 group (or none, for the no-heading case).
		check func(t *testing.T, sec Section)
	}{
		{
			name: "label with text on the same line",
			body: "## Hands-on\n\n**Tutorial.** Construa `plataforma/` com dois serviços.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				b := requireBlock(t, sec, "tutorial")
				if b.Title != "" {
					t.Errorf("title = %q, want empty", b.Title)
				}
				if strings.Contains(b.HTML, "Tutorial") {
					t.Errorf("label text leaked into block html: %s", b.HTML)
				}
				if !strings.Contains(b.HTML, "Construa") {
					t.Errorf("block body missing, got: %s", b.HTML)
				}
			},
		},
		{
			name: "label alone on its own paragraph, followed by a list",
			body: "## Hands-on\n\n**Checagem**\n\n1. Primeiro\n2. Segundo\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				b := requireBlock(t, sec, "checagem")
				if strings.Contains(b.HTML, "Checagem") {
					t.Errorf("label-only paragraph should be discarded, got: %s", b.HTML)
				}
				if !strings.Contains(b.HTML, "Primeiro") || !strings.Contains(b.HTML, "Segundo") {
					t.Errorf("list after the lone label missing, got: %s", b.HTML)
				}
			},
		},
		{
			name: "title after an em dash",
			body: "## Hands-on\n\n**Desafio — client de PSP resiliente.** Implemente retries.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				b := requireBlock(t, sec, "desafio")
				if b.Title != "client de PSP resiliente" {
					t.Errorf("title = %q, want %q", b.Title, "client de PSP resiliente")
				}
				if !strings.Contains(b.HTML, "Implemente retries") {
					t.Errorf("block body missing, got: %s", b.HTML)
				}
			},
		},
		{
			name: "title containing a code span",
			body: "## Hands-on\n\n**Desafio — ajuste `retry.go`.** Faça isso.\n",
			check: func(t *testing.T, sec Section) {
				b := requireBlock(t, sec, "desafio")
				if b.Title != "ajuste retry.go" {
					t.Errorf("title = %q, want %q (backticks flattened)", b.Title, "ajuste retry.go")
				}
			},
		},
		{
			name: "title wrapping across a line break",
			body: "## Hands-on\n\n**Desafio —\nlonga linha de título.** Faça isso.\n",
			check: func(t *testing.T, sec Section) {
				b := requireBlock(t, sec, "desafio")
				if b.Title != "longa linha de título" {
					t.Errorf("title = %q, want the line break flattened to a space", b.Title)
				}
			},
		},
		{
			name: "singular Invariante testável",
			body: "## Hands-on\n\n**Invariante testável**\n\n1. X nunca é negativo.\n",
			check: func(t *testing.T, sec Section) {
				requireBlock(t, sec, "invariantes")
			},
		},
		{
			name: "repeated label gets a numbered key",
			body: "## Hands-on\n\n**Desafio.** Um.\n\n**Desafio.** Dois.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				if len(sec.Blocks) != 2 {
					t.Fatalf("got %d blocks, want 2: %+v", len(sec.Blocks), sec.Blocks)
				}
				if sec.Blocks[0].Key != "desafio" || sec.Blocks[1].Key != "desafio-2" {
					t.Errorf("keys = %q, %q, want %q, %q", sec.Blocks[0].Key, sec.Blocks[1].Key, "desafio", "desafio-2")
				}
			},
		},
		{
			name: "bold text that isn't in the vocabulary stays in the current block",
			body: "## Hands-on\n\n**Tutorial.** Primeiro.\n\n**3 reentregas** continuam aqui.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				if len(sec.Blocks) != 1 {
					t.Fatalf("got %d blocks, want 1 (the non-label bold must not open a new one): %+v", len(sec.Blocks), sec.Blocks)
				}
				if !strings.Contains(sec.Blocks[0].HTML, "3 reentregas") {
					t.Errorf("non-matching bold text was dropped, got: %s", sec.Blocks[0].HTML)
				}
			},
		},
		{
			name: "label inside a list item never opens a block",
			body: "## Hands-on\n\n- **Tutorial.** Isso não abre bloco.\n",
			check: func(t *testing.T, sec Section) {
				// No top-level paragraph matched, so this downgrades to prose.
				if sec.Kind != "prose" {
					t.Fatalf("kind = %q, want %q (no top-level label found)", sec.Kind, "prose")
				}
				if len(sec.Blocks) != 0 {
					t.Errorf("got %d blocks, want 0", len(sec.Blocks))
				}
			},
		},
		{
			name: "label inside a blockquote never opens a block",
			body: "## Hands-on\n\n> **Tutorial.** Isso não abre bloco.\n",
			check: func(t *testing.T, sec Section) {
				if sec.Kind != "prose" {
					t.Fatalf("kind = %q, want %q", sec.Kind, "prose")
				}
			},
		},
		{
			name: "label inside a fenced code block never opens a block",
			body: "## Hands-on\n\n```\n**Tutorial.** Isso não abre bloco.\n```\n",
			check: func(t *testing.T, sec Section) {
				if sec.Kind != "prose" {
					t.Fatalf("kind = %q, want %q", sec.Kind, "prose")
				}
				if !strings.Contains(sec.HTML, "Tutorial") {
					t.Errorf("fenced code content missing, got: %s", sec.HTML)
				}
			},
		},
		{
			name: "hands-on section with no recognizable label downgrades to prose",
			body: "## Hands-on\n\nSó texto normal, sem nenhum rótulo em negrito.\n",
			check: func(t *testing.T, sec Section) {
				if sec.Kind != "prose" {
					t.Fatalf("kind = %q, want %q", sec.Kind, "prose")
				}
				if !strings.Contains(sec.HTML, "texto normal") {
					t.Errorf("prose fallback lost content, got: %s", sec.HTML)
				}
			},
		},
		{
			name: "Mão na massa is recognized the same as Hands-on",
			body: "## Mão na massa\n\n**Tutorial.** Construa algo.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				requireBlock(t, sec, "tutorial")
			},
		},
		{
			name: "Gabarito alone opens a block like the other labels",
			body: "## Hands-on\n\n**Desafio.** Escolha build ou buy.\n\n**Gabarito**\n\nConsidere custo total e prazo.\n",
			check: func(t *testing.T, sec Section) {
				requireHandson(t, sec)
				b := requireBlock(t, sec, "gabarito")
				if strings.Contains(b.HTML, "Gabarito") {
					t.Errorf("label-only paragraph should be discarded, got: %s", b.HTML)
				}
				if !strings.Contains(b.HTML, "custo total") {
					t.Errorf("gabarito body missing, got: %s", b.HTML)
				}
			},
		},
		{
			name: "Gabarito with a title after an em dash",
			body: "## Hands-on\n\n**Gabarito — critérios da rubrica.** Veja os pontos esperados.\n",
			check: func(t *testing.T, sec Section) {
				b := requireBlock(t, sec, "gabarito")
				if b.Title != "critérios da rubrica" {
					t.Errorf("title = %q, want %q", b.Title, "critérios da rubrica")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sections, _, err := splitSections([]byte(tt.body), nil, nil)
			if err != nil {
				t.Fatalf("splitSections: %v", err)
			}
			if len(sections) != 1 {
				t.Fatalf("got %d sections, want 1: %+v", len(sections), sections)
			}
			tt.check(t, sections[0])
		})
	}
}

func TestSplitSectionsMilestoneWithNoHeadingAtAll(t *testing.T) {
	sections, _, err := splitSections([]byte("Só um parágrafo solto, sem cabeçalho.\n"), nil, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(sections) != 1 {
		t.Fatalf("got %d sections, want 1: %+v", len(sections), sections)
	}
	sec := sections[0]
	if sec.ID != "intro" || sec.Kind != "prose" {
		t.Errorf("got id=%q kind=%q, want id=%q kind=%q", sec.ID, sec.Kind, "intro", "prose")
	}
	if !strings.Contains(sec.HTML, "parágrafo solto") {
		t.Errorf("content lost, got: %s", sec.HTML)
	}
}

func TestSplitSectionsDuplicateTitlesGetSuffixedIDs(t *testing.T) {
	body := "## Contexto\n\nA.\n\n## Contexto\n\nB.\n"
	sections, _, err := splitSections([]byte(body), nil, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	if len(sections) != 2 {
		t.Fatalf("got %d sections, want 2", len(sections))
	}
	if sections[0].ID != "contexto" || sections[1].ID != "contexto-2" {
		t.Errorf("ids = %q, %q, want %q, %q", sections[0].ID, sections[1].ID, "contexto", "contexto-2")
	}
}

func requireHandson(t *testing.T, sec Section) {
	t.Helper()
	if sec.Kind != "handson" {
		t.Fatalf("kind = %q, want %q", sec.Kind, "handson")
	}
}

func requireBlock(t *testing.T, sec Section, kind string) HandsOnBlock {
	t.Helper()
	for _, b := range sec.Blocks {
		if b.Kind == kind {
			return b
		}
	}
	t.Fatalf("no block of kind %q in %+v", kind, sec.Blocks)
	return HandsOnBlock{}
}

// ── 2. Content conservation over the real content tree ─────────────────────

var tagRe = regexp.MustCompile(`<[^>]*>`)
var wordRe = regexp.MustCompile(`[\p{L}\p{N}]+`)

// visibleWords strips tags and decodes HTML entities before tokenizing —
// without the decode, an escaped quote like `&#34;` would otherwise be
// miscounted as the word "34".
func visibleWords(rendered string) []string {
	return wordRe.FindAllString(html.UnescapeString(tagRe.ReplaceAllString(rendered, " ")), -1)
}

// labelWordCount is how many words the five labels themselves occupy in the
// original text — fixed regardless of singular/plural spelling, since that's
// the one property the regex in blockLabelRe guarantees.
var labelWordCount = map[string]int{
	"tutorial": 1, "desafio": 1, "complemento": 1, "checagem": 1, "invariantes": 2, "gabarito": 1,
}

// TestSplitSectionsConservesContent is the test the task calls the most
// important one: across all real milestones, every word of the body most
// milestones already shipped (the deprecated full `html`) must still be
// present somewhere in `sections` — either verbatim (a section's HTML, a
// handson block's HTML) or relocated into structured metadata (a section's
// Title, a block's Title, or abstracted into a block's Kind, whose word count
// is fixed and known). A dropped or duplicated paragraph throws this count
// off by far more than the handful of words a label or heading can account
// for, so this is a tight regression net without needing byte-exact HTML
// equality (which small, harmless rendering differences at a label boundary
// would make needlessly brittle).
func TestSplitSectionsConservesContent(t *testing.T) {
	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}

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
			_, html, sections, _, err := ParseMilestone(path, bridgeIndex{}, nil)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			checked++

			want := len(visibleWords(html))
			got := 0
			for _, sec := range sections {
				got += len(wordRe.FindAllString(sec.Title, -1))
				switch sec.Kind {
				case "prose":
					got += len(visibleWords(sec.HTML))
				case "handson":
					got += len(visibleWords(sec.Intro))
					for _, b := range sec.Blocks {
						got += len(visibleWords(b.HTML))
						got += len(wordRe.FindAllString(b.Title, -1))
						got += labelWordCount[b.Kind]
					}
				default:
					t.Fatalf("%s: section %q has unknown kind %q", path, sec.ID, sec.Kind)
				}
			}

			if got != want {
				t.Errorf("%s: reconstructed %d words from sections, want %d (from the full body html) — content was lost or duplicated", path, got, want)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no milestones were checked")
	}
	t.Logf("checked %d milestones", checked)
}

// ── 3. Golden coverage snapshot ─────────────────────────────────────────────

// TestSplitSectionsGoldenCoverage pins the two numbers the task doc measured
// by hand (block counts per kind, and which milestones have a hands-on
// section with zero recognized labels). A change here either means new
// content was authored (update the golden) or the splitter regressed — this
// test cannot tell the two apart, so whoever changes the number has to look.
func TestSplitSectionsGoldenCoverage(t *testing.T) {
	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		t.Fatalf("read %s: %v", contentDir, err)
	}

	kindCounts := map[string]int{}
	var noLabel []string
	var noSection []string

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
			fm, _, sections, _, err := ParseMilestone(path, bridgeIndex{}, nil)
			if err != nil {
				t.Fatalf("%s: %v", path, err)
			}

			hadHandsonTitle, hadBlock := false, false
			for _, sec := range sections {
				if isHandsOnTitle(sec.Title) {
					hadHandsonTitle = true
				}
				if sec.Kind != "handson" {
					continue
				}
				for _, b := range sec.Blocks {
					hadBlock = true
					kindCounts[b.Kind]++
				}
			}

			label := d.Name() + "/" + fm.ID
			if !hadBlock {
				if hadHandsonTitle {
					noLabel = append(noLabel, label)
				} else {
					noSection = append(noSection, label)
				}
			}
		}
	}
	sort.Strings(noLabel)
	sort.Strings(noSection)

	wantKinds := map[string]int{
		"tutorial": 168, "desafio": 209, "invariantes": 199, "complemento": 190, "checagem": 208,
	}
	for kind, want := range wantKinds {
		if kindCounts[kind] != want {
			t.Errorf("kind %q: got %d blocks, want %d (golden; update if content changed on purpose)", kind, kindCounts[kind], want)
		}
	}
	for kind, got := range kindCounts {
		if _, known := wantKinds[kind]; !known {
			t.Errorf("unexpected block kind %q (count %d) not in the golden", kind, got)
		}
	}

	wantNoLabel := []string{"kafka/share-groups-e-alternativas", "spring-boot/runtime-web-e-virtual-threads"}
	if !equalStrings(noLabel, wantNoLabel) {
		t.Errorf("milestones with a hands-on section but no recognized label = %v, want %v", noLabel, wantNoLabel)
	}

	wantNoSection := []string{
		"go-fintech/java-vs-go",
		// ledger-e-contabilidade is being written block by block (PLANO-
		// trilha-ledger-e-contabilidade.md §4/§10) — these are still
		// placeholder bodies awaiting their block's content PR.
		"ledger-e-contabilidade/auditoria-e-capstone-do-ledger",
		"ledger-e-contabilidade/conciliacao",
		"ledger-e-contabilidade/fechamento-de-periodo",
		"ledger-e-contabilidade/ledger-em-escala",
	}
	if !equalStrings(noSection, wantNoSection) {
		t.Errorf("milestones with no hands-on section at all = %v, want %v", noSection, wantNoSection)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ── 4. Sanitization ──────────────────────────────────────────────────────────

// TestSplitSectionsSanitizesBlocks mirrors TestParseGlossary: a hands-on
// block is rendered through the same bodyPolicy as everything else, so
// unsafe markup inside one is removed exactly as it already is in the
// deprecated whole-body html.
func TestSplitSectionsSanitizesBlocks(t *testing.T) {
	body := "## Hands-on\n\n**Tutorial.** <script>alert(1)</script> depois do script.\n"
	sections, _, err := splitSections([]byte(body), nil, nil)
	if err != nil {
		t.Fatalf("splitSections: %v", err)
	}
	b := requireBlock(t, sections[0], "tutorial")
	if strings.Contains(b.HTML, "<script") {
		t.Errorf("script tag survived sanitization: %s", b.HTML)
	}
	if !strings.Contains(b.HTML, "depois do script") {
		t.Errorf("surrounding text lost, got: %s", b.HTML)
	}
}

// ── 5. Determinism ───────────────────────────────────────────────────────────

func TestSplitSectionsIsDeterministic(t *testing.T) {
	dirA, dirB := t.TempDir(), t.TempDir()
	if _, err := Compile(contentDir, dirA); err != nil {
		t.Fatalf("compile: %v", err)
	}
	if _, err := Compile(contentDir, dirB); err != nil {
		t.Fatalf("compile: %v", err)
	}

	files, err := os.ReadDir(dirA)
	if err != nil {
		t.Fatalf("read %s: %v", dirA, err)
	}
	if len(files) == 0 {
		t.Fatal("compile produced no files")
	}

	for _, f := range files {
		a, err := os.ReadFile(filepath.Join(dirA, f.Name()))
		if err != nil {
			t.Fatalf("%s: %v", f.Name(), err)
		}
		b, err := os.ReadFile(filepath.Join(dirB, f.Name()))
		if err != nil {
			t.Fatalf("%s: %v", f.Name(), err)
		}
		// index.json carries a generatedAt timestamp — strip it before
		// comparing, since that's the one byte-level difference allowed
		// between two builds of the same content.
		aStr := regexp.MustCompile(`"generatedAt": "[^"]*"`).ReplaceAllString(string(a), `"generatedAt": ""`)
		bStr := regexp.MustCompile(`"generatedAt": "[^"]*"`).ReplaceAllString(string(b), `"generatedAt": ""`)
		if aStr != bStr {
			t.Errorf("%s differs between two compiles of the same content", f.Name())
		}
	}
}
