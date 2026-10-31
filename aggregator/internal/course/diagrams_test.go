package course

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Fixtures ────────────────────────────────────────────────────────────────

const descricaoOK = "O pix-gateway grava o pagamento e o evento na mesma transação do Postgres, " +
	"e o relay publica o evento no Kafka depois do commit, esperando o ack do broker antes de " +
	"marcar a linha como publicada. Se o broker estiver fora, o evento espera no banco pela " +
	"próxima rodada, e nenhum pagamento fica sem evento."

func topologiaYAML(extra string) string {
	return `id: fixture
tipo: topologia
titulo: "O relay publica só depois do commit"
descricao: "` + descricaoOK + `"
grupos:
  - { id: banco, rotulo: "Postgres", col: 0, row: 0, cols: 2, rows: 1 }
nos:
  - { id: pagamentos, rotulo: "payments", grupo: banco, col: 0, row: 0 }
  - { id: outbox, rotulo: "outbox", grupo: banco, col: 1, row: 0, papel: destaque }
  - { id: kafka, rotulo: "Kafka", col: 1, row: 1, papel: externo }
arestas:
  - { de: outbox, para: kafka, rotulo: "relay", estilo: tracejada }
` + extra
}

func mustParse(t *testing.T, src string, set *conceitoSet) Diagrama {
	t.Helper()
	d, err := parseDiagrama([]byte(src), "fixture", set)
	if err != nil {
		t.Fatalf("parseDiagrama: %v", err)
	}
	return d
}

func mustFail(t *testing.T, src, want string, set *conceitoSet) {
	t.Helper()
	_, err := parseDiagrama([]byte(src), "fixture", set)
	if err == nil {
		t.Fatalf("expected an error containing %q, got none", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("error %q does not mention %q", err, want)
	}
}

// ── D5 1: schema, id and file name ─────────────────────────────────────────

func TestDiagramaValidTopologia(t *testing.T) {
	d := mustParse(t, topologiaYAML(""), nil)
	if d.Tipo != "topologia" || len(d.Nos) != 3 || len(d.Grupos) != 1 || len(d.Arestas) != 1 {
		t.Fatalf("unexpected compiled diagram: %+v", d)
	}
	if d.Arestas[0].Estilo != "tracejada" {
		t.Errorf("estilo not kept: %+v", d.Arestas[0])
	}
}

func TestDiagramaSchemaRules(t *testing.T) {
	cases := []struct {
		name, src, want string
	}{
		{"id differs from file", strings.Replace(topologiaYAML(""), "id: fixture", "id: outro", 1), "diferente do nome do arquivo"},
		{"unknown tipo", strings.Replace(topologiaYAML(""), "tipo: topologia", "tipo: pizza", 1), "tipo \"pizza\" desconhecido"},
		{"unknown key", topologiaYAML("cores: [azul]\n"), "yaml inválido"},
		{"duplicate node id", strings.Replace(topologiaYAML(""), "id: kafka,", "id: outbox,", 1), "duplicado"},
		{"field of another type", topologiaYAML("passos:\n  - { id: x, rotulo: x, col: 3, row: 3 }\n"), "não se aplica ao tipo topologia"},
		{"invalid papel", strings.Replace(topologiaYAML(""), "papel: externo", "papel: vermelho", 1), "papel \"vermelho\" inválido"},
		{"invalid estilo", strings.Replace(topologiaYAML(""), "estilo: tracejada", "estilo: falha", 1), "não é um valor válido para topologia"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { mustFail(t, c.src, c.want, nil) })
	}
}

// ── D5 2: every reference points at something declared ─────────────────────

func TestDiagramaReferencesExist(t *testing.T) {
	mustFail(t, topologiaYAML("  - { de: kafka, para: fantasma }\n"), "\"fantasma\" não existe", nil)
	mustFail(t, strings.Replace(topologiaYAML(""), "grupo: banco, col: 0", "grupo: rede, col: 0", 1), "grupo \"rede\" não existe", nil)
}

// ── D5 3: grid ──────────────────────────────────────────────────────────────

func TestDiagramaGridCollisionAndGroupBounds(t *testing.T) {
	mustFail(t, strings.Replace(topologiaYAML(""), "col: 1, row: 1, papel: externo", "col: 1, row: 0, papel: externo", 1), "ocupam a mesma célula", nil)
	mustFail(t, strings.Replace(topologiaYAML(""), "grupo: banco, col: 1, row: 0", "grupo: banco, col: 2, row: 0", 1), "fora da área do grupo", nil)
	mustFail(t, strings.Replace(topologiaYAML(""), "col: 1, row: 1, papel: externo", "col: 6, row: 1, papel: externo", 1), "coluna 6", nil)
}

// ── D5 4: text limits ───────────────────────────────────────────────────────

func TestDiagramaTextLimits(t *testing.T) {
	long := strings.Repeat("x", 91)
	mustFail(t, strings.Replace(topologiaYAML(""), "O relay publica só depois do commit", long, 1), "titulo com 91 caracteres", nil)
	mustFail(t, strings.Replace(topologiaYAML(""), `rotulo: "Kafka"`, `rotulo: "`+strings.Repeat("k", 29)+`"`, 1), "com 29 caracteres", nil)
	mustFail(t, strings.Replace(topologiaYAML(""), descricaoOK, "curta demais", 1), "descricao com 2 palavras", nil)
}

// ── D5 5: legibility limits ─────────────────────────────────────────────────

func TestDiagramaNodeLimit(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 13; i++ {
		fmt.Fprintf(&b, "  - { id: n%d, rotulo: \"n%d\", col: %d, row: %d }\n", i, i, i%6, i/6)
	}
	src := `id: fixture
tipo: topologia
titulo: "Grande demais"
descricao: "` + descricaoOK + `"
nos:
` + b.String()
	mustFail(t, src, "13 elementos (máximo 12)", nil)
}

func sequenciaYAML(participantes, mensagens int) string {
	var b strings.Builder
	b.WriteString("id: fixture\ntipo: sequencia\ntitulo: \"O traceparent atravessa os serviços\"\ndescricao: \"" + descricaoOK + "\"\nparticipantes:\n")
	for i := 0; i < participantes; i++ {
		fmt.Fprintf(&b, "  - { id: p%d, rotulo: \"servico-%d\" }\n", i, i)
	}
	b.WriteString("mensagens:\n")
	for i := 0; i < mensagens; i++ {
		fmt.Fprintf(&b, "  - { de: p0, para: p1, rotulo: \"chamada %d\", tipo: async }\n", i)
	}
	return b.String()
}

func TestDiagramaSequenciaLimits(t *testing.T) {
	d := mustParse(t, sequenciaYAML(3, 2), nil)
	if len(d.Participantes) != 3 || d.Mensagens[0].Tipo != "async" {
		t.Fatalf("unexpected sequencia: %+v", d)
	}
	mustFail(t, sequenciaYAML(7, 2), "7 participantes (máximo 6)", nil)
	mustFail(t, sequenciaYAML(3, 15), "15 mensagens (máximo 14)", nil)
	mustFail(t, strings.Replace(sequenciaYAML(2, 1), "tipo: async", "tipo: fax", 1), "tipo \"fax\" inválido", nil)
}

func TestDiagramaEstados(t *testing.T) {
	src := `id: fixture
tipo: estados
titulo: "Um alerta só dispara depois do for"
descricao: "` + descricaoOK + `"
estados:
  - { id: inactive, rotulo: "inactive", col: 0, row: 0 }
  - { id: pending, rotulo: "pending", col: 1, row: 0 }
  - { id: firing, rotulo: "firing", col: 2, row: 0, papel: destaque }
inicial: inactive
finais: [inactive]
transicoes:
  - { de: inactive, para: pending, evento: "expr verdadeira" }
  - { de: pending, para: firing, evento: "dura o for", guarda: "5m" }
`
	d := mustParse(t, src, nil)
	if d.Arestas[1].Rotulo != "dura o for [5m]" || d.Inicial != "inactive" {
		t.Fatalf("transitions not normalized: %+v", d)
	}
	mustFail(t, strings.Replace(src, "inicial: inactive", "inicial: dormindo", 1), "inicial \"dormindo\"", nil)
	mustFail(t, src+"arestas:\n  - { de: inactive, para: firing }\n", "\"arestas\" não se aplica", nil)
}

func TestDiagramaFluxoEdgeKinds(t *testing.T) {
	src := `id: fixture
tipo: fluxo
titulo: "A saga desfaz o que já reservou"
descricao: "` + descricaoOK + `"
passos:
  - { id: reservar, rotulo: "reservar saldo", col: 0, row: 0 }
  - { id: autorizar, rotulo: "autorizar no PSP", col: 1, row: 0 }
arestas:
  - { de: reservar, para: autorizar }
  - { de: autorizar, para: reservar, rotulo: "estornar", tipo: compensacao }
`
	d := mustParse(t, src, nil)
	if d.Arestas[0].Estilo != "" || d.Arestas[1].Estilo != "compensacao" {
		t.Fatalf("edge kinds not normalized: %+v", d.Arestas)
	}
	mustFail(t, strings.Replace(src, "tipo: compensacao", "estilo: tracejada", 1), "use tipo", nil)
}

// ── D5 6: concepts resolve to the owner milestone ───────────────────────────

func TestDiagramaConceito(t *testing.T) {
	set := fixtureSet(t, []Conceito{{ID: "outbox", Termo: "Outbox", Dono: "dono/01", Apelidos: []string{"outbox"}}})
	src := strings.Replace(topologiaYAML(""), "papel: destaque", "papel: destaque, conceito: outbox", 1)
	d := mustParse(t, src, set)
	if d.Nos[1].Href != "#/learn/dono/marco-dono" {
		t.Fatalf("concept not resolved to the owner route: %+v", d.Nos[1])
	}
	mustFail(t, strings.Replace(src, "conceito: outbox", "conceito: inexistente", 1), "conceito \"inexistente\" não existe", set)
}

// ── D5 7 and D3: the fenced block becomes a figure ──────────────────────────

func TestExpandDiagramasFigureAndSanitizer(t *testing.T) {
	d := mustParse(t, topologiaYAML(""), nil)
	diagramas := map[string]Diagrama{"fixture": d}
	html, err := renderMarkdown(markDiagramaFences([]byte("Antes.\n\n```diagrama\nfixture\n```\n\nDepois.\n")))
	if err != nil {
		t.Fatal(err)
	}
	used := map[string]bool{}
	out, missing := expandDiagramas(html, "trilha", diagramas, used)
	if len(missing) > 0 {
		t.Fatalf("unexpected missing: %v", missing)
	}
	for _, want := range []string{
		`<figure class="diagrama" data-diagrama="trilha/fixture">`,
		`<figcaption>O relay publica só depois do commit</figcaption>`,
		`<details class="diagrama-descricao"><summary>Descrição textual</summary>`,
		"esperando o ack do broker",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("figure missing %q in:\n%s", want, out)
		}
	}
	if strings.Contains(out, "<svg") || strings.Contains(out, "⟦") {
		t.Errorf("block not fully replaced or SVG leaked:\n%s", out)
	}
	if !used["fixture"] {
		t.Error("used set not updated")
	}

	_, missing = expandDiagramas(strings.Replace(html, "fixture", "fantasma", 1), "trilha", diagramas, map[string]bool{})
	if len(missing) != 1 || !strings.Contains(missing[0], "\"fantasma\" não existe") {
		t.Fatalf("unknown id not reported: %v", missing)
	}
}

func TestExpandDiagramasSideBySide(t *testing.T) {
	d := mustParse(t, topologiaYAML(""), nil)
	other := d
	other.ID = "outro"
	html, _ := renderMarkdown(markDiagramaFences([]byte("```diagrama\nfixture\noutro\n```\n")))
	out, missing := expandDiagramas(html, "trilha", map[string]Diagrama{"fixture": d, "outro": other}, map[string]bool{})
	if len(missing) > 0 || !strings.Contains(out, `<div class="diagramas-lado-a-lado">`) || strings.Count(out, "<figure") != 2 {
		t.Fatalf("side-by-side not rendered (missing %v):\n%s", missing, out)
	}
}

func TestSanitizerKeepsOnlyDiagramaAttributes(t *testing.T) {
	in := `<figure class="diagrama outra" data-diagrama="a/b"><figcaption>t</figcaption></figure>` +
		`<figure data-diagrama="../x"></figure><svg><script>x</script></svg>` +
		`<div class="diagramas-lado-a-lado"></div><div class="perigo"></div>`
	out := bodyPolicy.Sanitize(in)
	if strings.Contains(out, "outra") || strings.Contains(out, "../x") || strings.Contains(out, "<svg") || strings.Contains(out, "perigo") {
		t.Fatalf("sanitizer let through more than the diagram exception:\n%s", out)
	}
	if !strings.Contains(out, `<div class="diagramas-lado-a-lado">`) {
		t.Fatalf("side-by-side wrapper dropped:\n%s", out)
	}
}

// ── D5 7 end to end: unknown id fails the course, unreferenced file warns ───

func writeCourse(t *testing.T, body string, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	write := func(rel, content string) {
		p := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("course.yaml", "slug: trilha\ntitle: T\nmilestones:\n  - 01-a.md\n")
	write("01-a.md", "---\nid: a\ntitle: A\n---\n\n"+body)
	for rel, content := range files {
		write(rel, content)
	}
	return dir
}

func TestCompileCourseDiagramas(t *testing.T) {
	yamlFile := map[string]string{"diagramas/fixture.yaml": topologiaYAML("")}

	dir := writeCourse(t, "Texto.\n\n```diagrama\nfixture\n```\n", yamlFile)
	c, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil)
	if err != nil {
		t.Fatalf("compileCourse: %v", err)
	}
	if _, ok := c.diagramas["fixture"]; !ok || !strings.Contains(c.Milestones[0].Sections[0].HTML, "data-diagrama") {
		t.Fatalf("diagram not compiled into the milestone")
	}
	encoded, _ := json.Marshal(c)
	if bytes.Contains(encoded, []byte("esperando o ack do broker\",\"grupos")) {
		t.Fatal("diagram specs leaked into the course JSON")
	}

	dir = writeCourse(t, "```diagrama\nfantasma\n```\n", yamlFile)
	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil); err == nil || !strings.Contains(err.Error(), "fantasma") {
		t.Fatalf("unknown diagram id must fail the course, got %v", err)
	}

	var logs bytes.Buffer
	log.SetOutput(&logs)
	defer log.SetOutput(os.Stderr)
	dir = writeCourse(t, "Sem diagrama.\n", yamlFile)
	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil); err != nil {
		t.Fatalf("an unreferenced diagram is a warning, not an error: %v", err)
	}
	if !strings.Contains(logs.String(), "fixture.yaml não é referenciado") {
		t.Fatalf("missing unreferenced-file warning, logs:\n%s", logs.String())
	}
}

func TestWarnASCIIDiagrams(t *testing.T) {
	body := []byte("```\nA ──▶ B\n```\n\n```java\nint x = 1;\n```\n\n```diagrama\nfixture\n```\n")
	var logs bytes.Buffer
	log.SetOutput(&logs)
	defer log.SetOutput(os.Stderr)
	if n := warnASCIIDiagrams(body, "t/01"); n != 1 {
		t.Fatalf("want 1 ASCII diagram, got %d", n)
	}
}

// ── D8: assets ──────────────────────────────────────────────────────────────

func TestValidateAssets(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, "assets", "log.svg"), []byte("<svg/>"), 0o644)
	os.WriteFile(filepath.Join(dir, "assets", "grande.png"), make([]byte, assetMaxBytes+1), 0o644)

	names, err := validateAssets([]byte("![Anatomia de um registro](assets/log.svg)"), dir)
	if err != nil || len(names) != 1 {
		t.Fatalf("valid asset rejected: %v", err)
	}
	for body, want := range map[string]string{
		"![](assets/log.svg)":             "sem texto alternativo",
		"![x](https://exemplo.com/a.png)": "só arquivos locais",
		"![x](assets/../segredo.svg)":     "só arquivos locais",
		"![x](assets/nao-existe.svg)":     "não existe",
		"![x](assets/grande.png)":         "KB (máximo 200 KB)",
		"![x](assets/script.js)":          "extensão não permitida",
	} {
		if _, err := validateAssets([]byte(body), dir); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: want error %q, got %v", body, want, err)
		}
	}
	if got := rewriteAssetSrc(`<img src="assets/log.svg" alt="x">`, "trilha"); got != `<img src="data/assets/trilha/log.svg" alt="x">` {
		t.Fatalf("src not rewritten: %s", got)
	}
}

// ── Fixtures for the front end ──────────────────────────────────────────────

// TestDiagramaFixturesGolden compiles the example of each type under
// testdata/diagramas against the real concept registry and keeps
// web/tests/fixtures/diagramas.json — what the Playwright suite injects into
// a milestone — byte-identical to the compiler's output. Regenerate with
// UPDATE_DIAGRAMA_FIXTURES=1 go test ./internal/course -run DiagramaFixtures.
func TestDiagramaFixturesGolden(t *testing.T) {
	set, _, _ := realConceitos(t)
	diagramas, err := loadDiagramas("testdata", set)
	if err != nil {
		t.Fatalf("fixtures invalid: %v", err)
	}
	for _, tipo := range []string{"topologia", "sequencia", "estados", "fluxo", "grafico"} {
		if _, ok := diagramas["exemplo-"+tipo]; !ok {
			t.Fatalf("missing fixture of type %s", tipo)
		}
	}
	figures := map[string]string{}
	for id, d := range diagramas {
		figures[id] = figureHTML("kafka", d)
	}
	got, err := json.MarshalIndent(map[string]any{
		"diagramas": DiagramasFile{Slug: "kafka", Diagramas: diagramas},
		"figures":   figures,
	}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	golden := filepath.Join("..", "..", "..", "web", "tests", "fixtures", "diagramas.json")
	if os.Getenv("UPDATE_DIAGRAMA_FIXTURES") == "1" {
		if err := os.MkdirAll(filepath.Dir(golden), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("read %s (regenerate with UPDATE_DIAGRAMA_FIXTURES=1): %v", golden, err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("%s is stale: regenerate with UPDATE_DIAGRAMA_FIXTURES=1 go test ./internal/course -run DiagramaFixtures", golden)
	}
}
