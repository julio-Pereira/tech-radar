package course

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// bridgeHit is one bridge as the compiler resolves it.
type bridgeHit struct {
	File string // relative to content/, e.g. courses/kafka/08-outbox.md
	Line int
	Text string // as written: "go-fintech/03" or an inherited "/03"
	Slug string
	ID   string
}

// snapshotBridges resolves every bridge in every milestone body with the
// same parser, fences and resolver Compile uses, and returns those that
// land in targetSlug. Inherited "/NN" are included: they are exactly what a
// sed over "slug/NN" would miss when a trilha is renumbered.
func snapshotBridges(contentDir, targetSlug string) ([]bridgeHit, error) {
	index, err := buildBridgeIndex(contentDir)
	if err != nil {
		return nil, err
	}
	dirs, err := os.ReadDir(contentDir)
	if err != nil {
		return nil, err
	}
	var hits []bridgeHit
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		dir := filepath.Join(contentDir, d.Name())
		manifest, err := ParseManifest(filepath.Join(dir, manifestName))
		if err != nil {
			continue
		}
		for _, file := range manifest.Milestones {
			data, err := os.ReadFile(filepath.Join(dir, file))
			if err != nil {
				return nil, err
			}
			m := frontmatterRe.FindSubmatchIndex(data)
			if m == nil {
				return nil, fmt.Errorf("%s/%s: missing frontmatter", d.Name(), file)
			}
			bodyStart := m[4]
			raw := data[bodyStart:]
			offset := bytes.Count(data[:bodyStart], []byte("\n"))
			rel := filepath.ToSlash(filepath.Join("courses", d.Name(), file))

			// What the compiler sees: the body after markDiagramaFences.
			var compiled []string
			doc := markdown.Parser().Parse(text.NewReader(markDiagramaFences(raw)))
			linkifyBridgesVisit(doc, markDiagramaFences(raw), index, nil, func(_ ast.Node, txt, slug, id string) {
				compiled = append(compiled, txt+" "+slug+"/"+id)
			})
			// The same walk on the raw body, only to get line numbers right:
			// a diagrama fence collapses to one line in the compiled body.
			// Fences are code blocks, which hold no bridges, so both walks
			// must agree hit for hit — checked below.
			var fromRaw []string
			fileHits := []bridgeHit{}
			doc = markdown.Parser().Parse(text.NewReader(raw))
			linkifyBridgesVisit(doc, raw, index, nil, func(span ast.Node, txt, slug, id string) {
				fromRaw = append(fromRaw, txt+" "+slug+"/"+id)
				if slug != targetSlug {
					return
				}
				line := 0
				if t, ok := span.FirstChild().(*ast.Text); ok {
					line = offset + bytes.Count(raw[:t.Segment.Start], []byte("\n")) + 1
				}
				fileHits = append(fileHits, bridgeHit{File: rel, Line: line, Text: txt, Slug: slug, ID: id})
			})
			if strings.Join(compiled, "|") != strings.Join(fromRaw, "|") {
				return nil, fmt.Errorf("%s: bridges differ with and without diagrama fences", rel)
			}
			hits = append(hits, fileHits...)
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].File != hits[j].File {
			return hits[i].File < hits[j].File
		}
		return hits[i].Line < hits[j].Line
	})
	return hits, nil
}

// textualRefs lists every literal "slug/NN" anywhere under content/ (any
// file type): PROJETO.md, GLOSSARIO.md, paths, desafios, conceitos and
// capstones are not linkified by the compiler but still name milestones by
// number, so a renumbering has to rewrite them too.
func textualRefs(root, slug string) ([]string, error) {
	re := regexp.MustCompile(regexp.QuoteMeta(slug) + `/\d{2}`)
	var out []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		ext := filepath.Ext(path)
		if ext != ".md" && ext != ".yaml" && ext != ".yml" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		for i, line := range strings.Split(string(data), "\n") {
			for _, ref := range re.FindAllString(line, -1) {
				out = append(out, fmt.Sprintf("%s:%d\t%s", filepath.ToSlash(rel), i+1, ref))
			}
		}
		return nil
	})
	return out, err
}

// TestPontesSnapshot writes the bridge audit for one trilha when asked:
//
//	PONTES_SNAPSHOT=../../../web/docs/pontes-go-fintech-antes.txt PONTES_SLUG=go-fintech \
//	  go test ./internal/course/ -run TestPontesSnapshot
//
// Without the variables it only checks that the snapshot can be built.
//
// To prove a renumbering kept every destination, point PONTES_ANTES at the
// snapshot taken before it and PONTES_RENOMEAR at the file renames
// ("03-concorrencia.md=06-concorrencia.md,..."): every bridge, at its
// (renamed) file and line, must still resolve to the same milestone id.
func TestPontesSnapshot(t *testing.T) {
	slug := os.Getenv("PONTES_SLUG")
	if slug == "" {
		slug = "go-fintech"
	}
	hits, err := snapshotBridges(contentDir, slug)
	if err != nil {
		t.Fatal(err)
	}
	refs, err := textualRefs(filepath.Dir(contentDir), slug)
	if err != nil {
		t.Fatal(err)
	}
	if antes := os.Getenv("PONTES_ANTES"); antes != "" {
		comparePontes(t, antes, os.Getenv("PONTES_RENOMEAR"), hits)
	}
	out := os.Getenv("PONTES_SNAPSHOT")
	if out == "" {
		return
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Pontes que o compilador resolve para %s (arquivo:linha, texto, destino)\n", slug)
	fmt.Fprintf(&b, "# Gerado por TestPontesSnapshot (aggregator/internal/course/pontes_snapshot_test.go).\n")
	fmt.Fprintf(&b, "# Inclui as /NN herdadas. %d ponte(s).\n", len(hits))
	for _, h := range hits {
		fmt.Fprintf(&b, "%s:%d\t%s\t%s/%s\n", h.File, h.Line, h.Text, h.Slug, h.ID)
	}
	fmt.Fprintf(&b, "\n# Toda ocorrência literal de %s/NN em content/ (qualquer arquivo). %d ocorrência(s).\n", slug, len(refs))
	for _, r := range refs {
		b.WriteString(r + "\n")
	}
	if err := os.WriteFile(out, []byte(b.String()), 0o644); err != nil {
		t.Fatal(err)
	}
}

// comparePontes checks the destination column of a previous snapshot
// against the bridges resolved now, position by position.
func comparePontes(t *testing.T, antesPath, renames string, hits []bridgeHit) {
	t.Helper()
	data, err := os.ReadFile(antesPath)
	if err != nil {
		t.Fatal(err)
	}
	rename := map[string]string{}
	for _, pair := range strings.Split(renames, ",") {
		if a, b, ok := strings.Cut(strings.TrimSpace(pair), "="); ok {
			rename[a] = b
		}
	}
	key := func(file string, line int) string {
		dir, base := filepath.Split(file)
		if nb, ok := rename[base]; ok {
			base = nb
		}
		return fmt.Sprintf("%s%s:%d", dir, base, line)
	}
	before := map[string][]string{}
	n := 0
	for _, l := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(l, "# Toda") {
			break // the literal-occurrence section is not position-checked
		}
		parts := strings.Split(l, "\t")
		if strings.HasPrefix(l, "#") || len(parts) != 3 {
			continue
		}
		file, lineStr, _ := strings.Cut(parts[0], ":")
		var line int
		fmt.Sscanf(lineStr, "%d", &line)
		k := key(file, line)
		before[k] = append(before[k], parts[2])
		n++
	}
	after := map[string][]string{}
	for _, h := range hits {
		k := fmt.Sprintf("%s:%d", h.File, h.Line)
		after[k] = append(after[k], h.Slug+"/"+h.ID)
	}
	if len(hits) != n {
		t.Errorf("antes: %d pontes, agora: %d", n, len(hits))
	}
	for k, want := range before {
		if got := after[k]; strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%s: destino antes %v, agora %v", k, want, got)
		}
	}
	for k, got := range after {
		if _, ok := before[k]; !ok {
			t.Errorf("%s: ponte nova %v, sem correspondente no snapshot antes", k, got)
		}
	}
}
