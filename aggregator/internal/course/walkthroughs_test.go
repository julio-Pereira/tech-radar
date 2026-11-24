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

// Two topologia diagrams, compiled by the real diagram compiler: a cluster
// view and a node view that share the actor "api".
const wtClusterYAML = `id: wt-cluster
tipo: topologia
titulo: "Cluster"
descricao: "` + descricaoOK + `"
nos:
  - { id: cli, rotulo: "cliente", col: 0, row: 0 }
  - { id: api, rotulo: "API", col: 1, row: 0 }
  - { id: db, rotulo: "banco", col: 2, row: 0 }
arestas:
  - { de: cli, para: api, rotulo: "envia" }
  - { de: api, para: cli }
  - { de: api, para: db, rotulo: "grava" }
`

const wtNoYAML = `id: wt-no
tipo: topologia
titulo: "Nó"
descricao: "` + descricaoOK + `"
nos:
  - { id: api, rotulo: "API", col: 0, row: 0 }
  - { id: agente, rotulo: "agente", col: 1, row: 0 }
arestas:
  - { de: api, para: agente }
  - { de: agente, para: api, rotulo: "status" }
`

func wtDiagramas(t *testing.T) map[string]Diagrama {
	t.Helper()
	out := map[string]Diagrama{}
	for id, src := range map[string]string{"wt-cluster": wtClusterYAML, "wt-no": wtNoYAML} {
		d, err := parseDiagrama([]byte(src), id, nil)
		if err != nil {
			t.Fatalf("fixture diagram %s: %v", id, err)
		}
		out[id] = d
	}
	out["wt-seq"] = Diagrama{ID: "wt-seq", Tipo: "sequencia"}
	return out
}

const wtValido = `id: fixture
titulo: "Do pedido ao status"
resumo: "Ninguém manda o agente agir: ele observa a API e reage."
atores:
  - { id: cli, rotulo: "cliente" }
  - { id: api, rotulo: "API" }
  - { id: db, rotulo: "banco" }
  - { id: agente, rotulo: "agente" }
camadas:
  - { id: cluster, rotulo: "Cluster", diagrama: wt-cluster }
  - { id: no, rotulo: "nó", diagrama: wt-no, pai: cluster }
paineis:
  - id: pedido
    linguagem: yaml
    titulo: "pedido.yaml"
    conteudo: |
      kind: Pedido
      replicas: 4
      probe: http
etapas:
  - id: chega
    titulo: "O pedido chega"
    subtitulo: "Gravar não é executar"
    camada: cluster
    texto: "A API **grava** o pedido e responde."
    eventos:
      - { de: cli, para: api, msg: "O cliente envia o pedido", painel: { id: pedido, linhas: "1-2" } }
      - { de: api, para: db, msg: "A API grava o pedido no banco", estados: { db: novo } }
      - { de: api, para: cli, msg: "A API responde 201 antes de qualquer execução", tipo: reply, anotacao: "nada rodou ainda" }
  - id: reage
    titulo: "O agente reage"
    camada: no
    texto: "O agente observa a API."
    eventos:
      - { de: api, para: agente, msg: "O agente vê o pedido do seu nó", tipo: async, estados: { agente: ativo } }
      - { de: agente, para: api, msg: "O agente reporta o status", painel: { id: pedido, linhas: "3" } }
`

func wtParse(t *testing.T, src string) Walkthrough {
	t.Helper()
	w, err := parseWalkthrough([]byte(src), "fixture", wtDiagramas(t))
	if err != nil {
		t.Fatalf("parseWalkthrough: %v", err)
	}
	return w
}

func wtFail(t *testing.T, src, want string) {
	t.Helper()
	_, err := parseWalkthrough([]byte(src), "fixture", wtDiagramas(t))
	if err == nil {
		t.Fatalf("expected an error containing %q, got none", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("error %q does not mention %q", err, want)
	}
}

func wtReplace(t *testing.T, old, new string) string {
	t.Helper()
	if strings.Count(wtValido, old) != 1 {
		t.Fatalf("fixture: %q appears %d times", old, strings.Count(wtValido, old))
	}
	return strings.Replace(wtValido, old, new, 1)
}

// eventos builds n events of one step on the cluster layer.
func wtEventos(n int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		b.WriteString("      - { de: cli, para: api, msg: \"O cliente envia\" }\n")
	}
	return b.String()
}

func wtEtapas(n, eventos int) string {
	var b strings.Builder
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, "  - id: e%d\n    titulo: \"Etapa\"\n    camada: cluster\n    texto: \"Texto.\"\n    eventos:\n%s", i, wtEventos(eventos))
	}
	return b.String()
}

func wtComEtapas(etapas string) string {
	return wtValido[:strings.Index(wtValido, "etapas:\n")] + "etapas:\n" + etapas
}

// ── Valid walkthrough: numbering, cumulative states, panels ────────────────

func TestWalkthroughValido(t *testing.T) {
	w := wtParse(t, wtValido)
	if w.Total != 5 || len(w.Etapas) != 2 {
		t.Fatalf("total %d, etapas %d", w.Total, len(w.Etapas))
	}
	// Event numbers run across steps.
	if got := w.Etapas[1].Eventos[0].N; got != 4 {
		t.Errorf("first event of step 2 is %d, want 4", got)
	}
	// States are cumulative over the whole walkthrough.
	last := w.Etapas[1].Eventos[1].Estados
	if last["db"] != "novo" || last["agente"] != "ativo" {
		t.Errorf("cumulative estados lost: %v", last)
	}
	if w.Etapas[0].Eventos[0].Estados != nil {
		t.Errorf("event 1 should carry no state: %v", w.Etapas[0].Eventos[0].Estados)
	}
	if p := w.Etapas[0].Eventos[0].Painel; p == nil || p.De != 1 || p.Ate != 2 {
		t.Errorf("painel 1-2 not compiled: %+v", p)
	}
	if p := w.Etapas[1].Eventos[1].Painel; p == nil || p.De != 3 || p.Ate != 3 {
		t.Errorf("painel 3 not compiled: %+v", p)
	}
	if got := w.Camadas[1].Trilha; strings.Join(got, "/") != "cluster/no" {
		t.Errorf("breadcrumb %v", got)
	}
	if !strings.Contains(w.Etapas[0].HTML, "<strong>grava</strong>") {
		t.Errorf("step prose not rendered as markdown: %q", w.Etapas[0].HTML)
	}
	if len(w.Paineis[0].Linhas) != 3 {
		t.Errorf("painel lines %v", w.Paineis[0].Linhas)
	}
}

// ── Rule 1: unique ids, every reference exists ─────────────────────────────

func TestWalkthroughRegra1Ids(t *testing.T) {
	cases := []struct{ name, src, want string }{
		{"duplicate actor", wtReplace(t, `{ id: agente, rotulo: "agente" }`, `{ id: api, rotulo: "agente" }`), `"api" duplicado`},
		{"duplicate layer", wtReplace(t, `{ id: no, rotulo: "nó"`, `{ id: cluster, rotulo: "nó"`), `"cluster" duplicado`},
		{"duplicate step", wtReplace(t, "  - id: reage\n", "  - id: chega\n"), `"chega" duplicado`},
		{"unknown actor", wtReplace(t, `{ de: cli, para: api, msg: "O cliente envia o pedido"`, `{ de: fantasma, para: api, msg: "O cliente envia o pedido"`), `"fantasma" não existe`},
		{"unknown layer", wtReplace(t, "    camada: no\n", "    camada: andar\n"), `camada "andar" não existe`},
		{"unknown panel", wtReplace(t, `painel: { id: pedido, linhas: "3" }`, `painel: { id: log, linhas: "3" }`), `painel: "log" não existe`},
		{"file name", wtReplace(t, "id: fixture\n", "id: outro\n"), "diferente do nome do arquivo"},
		{"unknown key", wtValido + "cores: [azul]\n", "yaml inválido"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { wtFail(t, c.src, c.want) })
	}
}

// ── Rule 2: the layer's diagram exists, is a topologia, holds the actors ───

func TestWalkthroughRegra2Diagrama(t *testing.T) {
	cases := []struct{ name, src, want string }{
		{"missing diagram", wtReplace(t, "diagrama: wt-no,", "diagrama: wt-nada,"), `diagrama "wt-nada" não existe`},
		{"not a topologia", wtReplace(t, "diagrama: wt-no,", "diagrama: wt-seq,"), "precisa ser topologia"},
		{"actor not a node of the layer", wtReplace(t, `{ de: api, para: agente, msg: "O agente vê o pedido do seu nó"`, `{ de: db, para: agente, msg: "O agente vê o pedido do seu nó"`), `ator "db" não é nó do diagrama "wt-no"`},
		{"state on an actor outside the layer", wtReplace(t, "estados: { agente: ativo }", "estados: { cli: ativo }"), `ator "cli" não é nó do diagrama "wt-no"`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { wtFail(t, c.src, c.want) })
	}
}

// ── Rule 3: the edge exists, in the same direction ─────────────────────────

func TestWalkthroughRegra3Aresta(t *testing.T) {
	// db→api is the reverse of a declared edge: not the same thing.
	wtFail(t, wtReplace(t, `{ de: api, para: db, msg: "A API grava o pedido no banco"`, `{ de: db, para: api, msg: "A API grava o pedido no banco"`),
		"não há aresta db→api")
	// cli→db has no edge at all.
	wtFail(t, wtReplace(t, `{ de: api, para: db, msg: "A API grava o pedido no banco"`, `{ de: cli, para: db, msg: "A API grava o pedido no banco"`),
		"não há aresta cli→db")
}

// ── Rule 4: de ≠ para ──────────────────────────────────────────────────────

func TestWalkthroughRegra4MesmoAtor(t *testing.T) {
	wtFail(t, wtReplace(t, `{ de: cli, para: api, msg: "O cliente envia o pedido"`, `{ de: api, para: api, msg: "O cliente envia o pedido"`),
		`de e para são o mesmo ator "api"`)
}

// ── Rule 5: pai exists, no cycle, depth ≤ 2 ────────────────────────────────

func TestWalkthroughRegra5Pai(t *testing.T) {
	cases := []struct{ name, src, want string }{
		{"missing parent", wtReplace(t, "pai: cluster }", "pai: regiao }"), `pai "regiao" não existe`},
		{"cycle", wtReplace(t, `{ id: cluster, rotulo: "Cluster", diagrama: wt-cluster }`, `{ id: cluster, rotulo: "Cluster", diagrama: wt-cluster, pai: no }`), "ciclo em pai"},
		{"too deep", wtReplace(t, "  - { id: no, rotulo: \"nó\", diagrama: wt-no, pai: cluster }\n",
			"  - { id: no, rotulo: \"nó\", diagrama: wt-no, pai: cluster }\n  - { id: pod, rotulo: \"pod\", diagrama: wt-no, pai: no }\n"), "profundidade 3"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { wtFail(t, c.src, c.want) })
	}
}

// ── Rule 6: panel lines ────────────────────────────────────────────────────

func TestWalkthroughRegra6Linhas(t *testing.T) {
	cases := []struct{ linhas, want string }{
		{"2-1", "início depois do fim"},
		{"0", "fora do formato"},
		{"1,2", "fora do formato"},
		{"4", "passam do fim do painel (3 linhas)"},
		{"2-9", "passam do fim do painel"},
	}
	for _, c := range cases {
		t.Run(c.linhas, func(t *testing.T) {
			wtFail(t, wtReplace(t, `linhas: "3" }`, `linhas: "`+c.linhas+`" }`), c.want)
		})
	}
}

// ── Rule 7: limits and sizes ───────────────────────────────────────────────

func TestWalkthroughRegra7Limites(t *testing.T) {
	longa := strings.Repeat("palavra ", wtTextoPalavras+1)
	var paineis, camadas strings.Builder
	for i := 0; i < wtPaineisMax+1; i++ {
		fmt.Fprintf(&paineis, "  - { id: p%d, linguagem: texto, titulo: \"p\", conteudo: \"x\" }\n", i)
	}
	for i := 0; i < wtCamadasMax; i++ {
		fmt.Fprintf(&camadas, "  - { id: extra%d, rotulo: \"x\", diagrama: wt-no }\n", i)
	}
	var muitasLinhas strings.Builder
	for i := 0; i < wtPainelLinhasMax+1; i++ {
		muitasLinhas.WriteString("      linha\n")
	}
	cases := []struct{ name, src, want string }{
		{"msg too long", wtReplace(t, `msg: "O cliente envia o pedido"`, `msg: "`+strings.Repeat("x", wtMsgMax+1)+`"`), "msg com 111 caracteres (máximo 110)"},
		{"msg missing", wtReplace(t, `msg: "O cliente envia o pedido", `, ``), "msg é obrigatório"},
		{"anotacao too long", wtReplace(t, `anotacao: "nada rodou ainda"`, `anotacao: "`+strings.Repeat("x", wtAnotacaoMax+1)+`"`), "anotacao com 61 caracteres (máximo 60)"},
		{"texto too long", wtReplace(t, `texto: "O agente observa a API."`, `texto: "`+longa+`"`), "texto com 121 palavras (máximo 120)"},
		{"too many events in a step", wtComEtapas(wtEtapas(1, wtEventosEtapaMax+1)), "7 eventos (de 1 a 6)"},
		{"too many steps", wtComEtapas(wtEtapas(wtEtapasMax+1, 1)), "etapas: 9 (de 1 a 8)"},
		{"too many events in total", wtComEtapas(wtEtapas(wtEtapasMax, 4)), "32 eventos no total (máximo 30)"},
		{"too many layers", wtReplace(t, "paineis:\n", camadas.String()+"paineis:\n"), "camadas: 5 (máximo 3)"},
		{"too many panels", wtReplace(t, "paineis:\n", "paineis:\n"+paineis.String()), "paineis: 6 (máximo 4)"},
		{"panel too long", wtReplace(t, "      kind: Pedido\n", muitasLinhas.String()), "linhas (máximo 40)"},
		{"bad tipo", wtReplace(t, "tipo: reply", "tipo: grito"), `tipo "grito" inválido`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { wtFail(t, c.src, c.want) })
	}
	// At the limits, it compiles.
	wtParse(t, wtComEtapas(wtEtapas(wtEtapasMax, 3)))
	wtParse(t, wtComEtapas(wtEtapas(5, wtEventosEtapaMax)))
}

// ── Rule 8: state values ───────────────────────────────────────────────────

func TestWalkthroughRegra8Estados(t *testing.T) {
	wtFail(t, wtReplace(t, "estados: { db: novo }", "estados: { db: azul }"), `"azul" inválido`)
	wtFail(t, wtReplace(t, "estados: { db: novo }", "estados: { tabela: novo }"), `"tabela" não é um ator`)
}

// ── Section 3.4: the derived sequence view ─────────────────────────────────

// With up to 6 actors, every step shows all of them, in the declared order:
// columns never move between steps.
func TestWalkthroughSequenciaGolden(t *testing.T) {
	w := wtParse(t, wtValido)
	var seqs []Diagrama
	for _, e := range w.Etapas {
		seqs = append(seqs, e.Sequencia)
		if e.Omitidos != 0 {
			t.Errorf("etapa %s omitted %d actors with only 4 declared", e.ID, e.Omitidos)
		}
	}
	got, err := json.MarshalIndent(seqs, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	golden := filepath.Join("testdata", "walkthroughs", "sequencia.golden.json")
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(golden), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("read golden (UPDATE_GOLDEN=1 to create): %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("derived sequence differs from %s (UPDATE_GOLDEN=1 to accept):\n%s", golden, got)
	}
}

// Over 6 actors, a step shows only the actors it uses, in the declared
// order, and says how many it left out; a step that needs more than 6
// columns fails the build.
func TestWalkthroughSequenciaOmiteAtores(t *testing.T) {
	extra := "  - { id: x1, rotulo: \"x1\" }\n  - { id: x2, rotulo: \"x2\" }\n  - { id: x3, rotulo: \"x3\" }\n"
	w := wtParse(t, wtReplace(t, "camadas:\n", extra+"camadas:\n"))
	e := w.Etapas[1]
	if e.Omitidos != 5 || len(e.Sequencia.Participantes) != 2 {
		t.Fatalf("omitidos %d, participantes %v", e.Omitidos, e.Sequencia.Participantes)
	}
	if e.Sequencia.Participantes[0].ID != "api" || e.Sequencia.Participantes[1].ID != "agente" {
		t.Errorf("declared order not kept: %v", e.Sequencia.Participantes)
	}
	if w.Etapas[0].Omitidos != 4 {
		t.Errorf("step 1 omitted %d, want 4", w.Etapas[0].Omitidos)
	}
}

// The derived sequence is a valid sequencia for the existing renderer: the
// same limits a hand-written one has.
func TestWalkthroughSequenciaRespeitaORenderer(t *testing.T) {
	for _, e := range wtParse(t, wtValido).Etapas {
		s := e.Sequencia
		if s.Tipo != "sequencia" || len(s.Participantes) < 2 || len(s.Participantes) > diagramaParticipMax || len(s.Mensagens) > diagramaMensagensMax {
			t.Errorf("etapa %s: %+v", e.ID, s)
		}
		for _, m := range s.Mensagens {
			if len([]rune(m.Rotulo)) > diagramaRotuloMax || !diagramaMensagemTipos[m.Tipo] || m.Tipo == "" {
				t.Errorf("etapa %s: mensagem %+v", e.ID, m)
			}
		}
	}
}

// ── Textual description and the milestone block ────────────────────────────

func TestWalkthroughDescricaoTextual(t *testing.T) {
	w := wtParse(t, wtValido)
	used := map[string]bool{}
	out, missing := expandWalkthroughs("<p>antes</p><p>⟦walkthrough:fixture⟧</p>", "trilha", map[string]Walkthrough{"fixture": w}, used)
	if len(missing) > 0 || !used["fixture"] {
		t.Fatalf("missing %v used %v", missing, used)
	}
	for _, want := range []string{
		`<figure class="walkthrough" data-walkthrough="trilha/fixture">`,
		`<figcaption>Do pedido ao status</figcaption>`,
		`<details class="walkthrough-descricao">`,
		`2 etapas, 5 eventos.`,
		`<strong>O pedido chega</strong> — Gravar não é executar`,
		`<ol start="4">`,
		`API → cliente: A API responde 201 antes de qualquer execução (nada rodou ainda)`,
		`agente → API: O agente reporta o status`,
		`<strong>grava</strong>`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("description lacks %q:\n%s", want, out)
		}
	}
	_, missing = expandWalkthroughs("<p>⟦walkthrough:outro⟧</p>", "trilha", map[string]Walkthrough{}, used)
	if len(missing) != 1 || !strings.Contains(missing[0], `"outro" não existe`) {
		t.Errorf("unknown id: %v", missing)
	}
}

func TestWalkthroughFenceMarker(t *testing.T) {
	body := []byte("Texto.\n\n```walkthrough\nfixture\n```\n\nMais.\n")
	if got := string(markWalkthroughFences(body)); !strings.Contains(got, "⟦walkthrough:fixture⟧") {
		t.Errorf("fence not marked: %q", got)
	}
	if err := checkWalkthroughIndent([]byte("- item\n  ```walkthrough\n  x\n  ```\n")); err == nil {
		t.Error("indented fence accepted")
	}
	if err := checkWalkthroughIndent(body); err != nil {
		t.Errorf("column-0 fence refused: %v", err)
	}
}

// End to end: the milestone block becomes the figure, the layers' diagrams
// count as referenced, and a walkthrough no milestone cites fails the build.
func TestCompileCourseWalkthroughs(t *testing.T) {
	files := map[string]string{
		"diagramas/wt-cluster.yaml": wtClusterYAML,
		"diagramas/wt-no.yaml":      wtNoYAML,
		"walkthroughs/fixture.yaml": wtValido,
	}
	var logs bytes.Buffer
	log.SetOutput(&logs)
	defer log.SetOutput(os.Stderr)

	dir := writeCourse(t, "Texto.\n\n```walkthrough\nfixture\n```\n", files)
	c, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil)
	if err != nil {
		t.Fatalf("compileCourse: %v", err)
	}
	if _, ok := c.walkthroughs["fixture"]; !ok || !strings.Contains(c.Milestones[0].Sections[0].HTML, `data-walkthrough="trilha/fixture"`) {
		t.Fatalf("walkthrough not compiled into the milestone: %s", c.Milestones[0].Sections[0].HTML)
	}
	if strings.Contains(logs.String(), "não é referenciado") {
		t.Errorf("a layer diagram counted as unreferenced:\n%s", logs.String())
	}
	encoded, _ := json.Marshal(c)
	if bytes.Contains(encoded, []byte(`"sequencia":`)) {
		t.Fatal("walkthrough specs leaked into the course JSON")
	}
	out := t.TempDir()
	if err := writeWalkthroughs(out, c.Slug, c.walkthroughs); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(out, "walkthroughs", "trilha.json")); err != nil {
		t.Fatalf("data/walkthroughs/trilha.json not written: %v", err)
	}

	dir = writeCourse(t, "```walkthrough\nfantasma\n```\n", files)
	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil); err == nil || !strings.Contains(err.Error(), "fantasma") {
		t.Fatalf("unknown walkthrough id must fail the course, got %v", err)
	}
	dir = writeCourse(t, "Sem walkthrough.\n", files)
	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil); err == nil || !strings.Contains(err.Error(), "não é referenciado") {
		t.Fatalf("an unreferenced walkthrough must fail the course, got %v", err)
	}
	files["walkthroughs/fixture.yaml"] = strings.Replace(wtValido, "diagrama: wt-no,", "diagrama: wt-nada,", 1)
	dir = writeCourse(t, "```walkthrough\nfixture\n```\n", files)
	if _, _, err := compileCourse(dir, bridgeIndex{}, nil, nil, nil); err == nil || !strings.Contains(err.Error(), "wt-nada") {
		t.Fatalf("an invalid walkthrough must fail the course, got %v", err)
	}
}
