package course

import (
	"strings"
	"testing"
)

// ── C4: an edge never cuts through another box ─────────────────────────────

const linhaDeTres = `id: fixture
tipo: topologia
titulo: "Três caixas na mesma linha"
descricao: "` + descricaoOK + `"
nos:
  - { id: a, rotulo: "a", col: 0, row: 0 }
  - { id: b, rotulo: "b", col: 1, row: 0 }
  - { id: c, rotulo: "c", col: 2, row: 0 }
arestas:
`

func TestDiagramaEdgeThroughBoxIsAnError(t *testing.T) {
	mustFail(t, linhaDeTres+"  - { de: a, para: c, rotulo: \"replica\" }\n", `aresta a→c atravessa "b"`, nil)
}

func TestDiagramaViaBendsAroundTheBox(t *testing.T) {
	d := mustParse(t, linhaDeTres+"  - { de: a, para: c, rotulo: \"replica\", via: [{col: 0, row: 0.5}, {col: 2, row: 0.5}] }\n", nil)
	if got := d.Arestas[0].Via; len(got) != 2 || got[1].Col != 2 || got[1].Row != 0.5 {
		t.Fatalf("via not compiled: %+v", got)
	}
}

func TestDiagramaViaRules(t *testing.T) {
	mustFail(t, linhaDeTres+"  - { de: a, para: c, via: [{col: 1, row: 0}] }\n", `é de "b"`, nil)
	mustFail(t, linhaDeTres+"  - { de: a, para: c, via: [{col: 0.3, row: 0.5}] }\n", "passos de 0,5", nil)
	mustFail(t, linhaDeTres+"  - { de: a, para: c, via: [{col: 0, row: -1}] }\n", "fora do grid", nil)
	// A bend that still crosses a box is caught too.
	mustFail(t, linhaDeTres+"  - { de: a, para: c, via: [{col: 2, row: 0.5}] }\n", `atravessa "b"`, nil)
}

func TestDiagramaDiagonalPastTheCornerIsFine(t *testing.T) {
	src := `id: fixture
tipo: topologia
titulo: "Diagonal que passa entre as caixas"
descricao: "` + descricaoOK + `"
nos:
  - { id: a, rotulo: "a", col: 0, row: 0 }
  - { id: b, rotulo: "b", col: 1, row: 0 }
  - { id: c, rotulo: "c", col: 1, row: 1 }
arestas:
  - { de: a, para: c }
`
	mustParse(t, src, nil)
}

// ── C1: natural width estimate ─────────────────────────────────────────────

func TestDiagramaLarguraNatural(t *testing.T) {
	d := mustParse(t, linhaDeTres, nil)
	// 3 columns of the minimum box (140) and gap (56), plus the margins.
	if w := diagramaLarguraNatural(d); w != 40+2*(140+56)+140+40 {
		t.Fatalf("width %v", w)
	}
	// Sequence columns follow the labels: 150px when short, 200px at most.
	seq := Diagrama{Tipo: "sequencia", Participantes: make([]DiagramaParticipante, 6)}
	if w := diagramaLarguraNatural(seq); w != 80+6*150 {
		t.Fatalf("six short participants: %v px", w)
	}
	for i := range seq.Participantes {
		seq.Participantes[i].Rotulo = "um participante de nome longo"
	}
	if w := diagramaLarguraNatural(seq); w != 80+6*200 || w <= diagramaLarguraMax {
		t.Fatalf("six long participants (%v px) should be above the limit", w)
	}
}

// ── C8: an indented fence fails instead of shipping as a code block ────────

func TestDiagramaIndentedFence(t *testing.T) {
	for _, src := range []string{
		"- item\n\n  ```diagrama\n  x\n  ```\n",
		"> ```diagrama\n> x\n> ```\n",
		"1. ```diagrama\n",
		"- ```diagrama\n",
	} {
		if err := checkDiagramaIndent([]byte(src)); err == nil {
			t.Errorf("no error for %q", src)
		}
	}
	if err := checkDiagramaIndent([]byte("texto\n\n```diagrama\nx\n```\n")); err != nil {
		t.Errorf("column-0 fence rejected: %v", err)
	}
}

// ── C9: tipo grafico ───────────────────────────────────────────────────────

func graficoYAML(extra string) string {
	return `id: fixture
tipo: grafico
titulo: "A média esconde a cauda"
descricao: "` + descricaoOK + `"
forma: barra
eixo_x: { rotulo: "latência (ms)", tipo: categoria }
eixo_y: { rotulo: "requisições", min: 0 }
series:
  - { id: lat, rotulo: "pix-gateway", pontos: [[10, 420], [20, 910], [50, 380], [250, 30]] }
fonte: "dados ilustrativos"
` + extra
}

func TestGraficoValid(t *testing.T) {
	d := mustParse(t, graficoYAML(`anotacoes:
  - { tipo: linha-x, valor: 20, rotulo: "p50" }
  - { tipo: linha-x, valor: 250, rotulo: "p99", papel: destaque }
  - { tipo: faixa-x, de: 10, ate: 50, rotulo: "dentro do SLO" }
  - { tipo: linha-y, valor: 500, rotulo: "metade" }
`), nil)
	if d.Forma != "barra" || len(d.Categorias) != 4 || d.Categorias[3] != "250" {
		t.Fatalf("compiled: %+v", d)
	}
	if d.Series[0].Pontos[1][0] != "20" || d.Anotacoes[0].Valor != "20" {
		t.Fatalf("category values must be strings: %+v %+v", d.Series[0].Pontos, d.Anotacoes)
	}
	fig := figureHTML("observabilidade", d)
	for _, want := range []string{`<details class="diagrama-dados">`, "<th>latência (ms)</th>", "<th>pix-gateway (requisições)</th>",
		"<tr><td>20</td><td>910</td></tr>", `<p class="diagrama-fonte">Fonte: dados ilustrativos</p>`} {
		if !strings.Contains(fig, want) {
			t.Errorf("figure lacks %q:\n%s", want, fig)
		}
	}
	// The table survives the sanitizer.
	if got := bodyPolicy.Sanitize(fig); got != fig {
		t.Errorf("sanitizer changed the figure:\n%s\n%s", fig, got)
	}
}

func TestGraficoRules(t *testing.T) {
	base := graficoYAML("")
	logZero := strings.NewReplacer("forma: barra", "forma: linha",
		`eixo_y: { rotulo: "requisições", min: 0 }`, `eixo_y: { rotulo: "requisições", escala: log }`,
		"[250, 30]", "[250, 0]").Replace(base)
	for _, c := range []struct{ src, want string }{
		{strings.Replace(base, "forma: barra", "forma: pizza", 1), `forma "pizza"`},
		{strings.Replace(base, `fonte: "dados ilustrativos"`, "", 1), "fonte é obrigatória"},
		{logZero, "escala log exige y > 0"},
		{strings.Replace(base, "[[10, 420], [20, 910], [50, 380], [250, 30]]", "[[10, 420], [10, 910]]", 1), `categoria "10" repetida`},
	} {
		mustFail(t, c.src, c.want, nil)
	}
	mustFail(t, graficoYAML("anotacoes:\n  - { tipo: linha-x, valor: 30, rotulo: \"p75\" }\n"), "não é uma categoria", nil)
	mustFail(t, graficoYAML("anotacoes:\n  - { tipo: linha-y, valor: 5000, rotulo: \"teto\" }\n"), "fora do domínio do eixo_y", nil)
	mustFail(t, graficoYAML("anotacoes:\n  - { tipo: faixa-y, valor: 1, rotulo: \"x\" }\n"), "usa de e ate", nil)
	mustFail(t, strings.Replace(graficoYAML(""), "tipo: categoria", "tipo: numero", 1), "barra exige eixo_x.tipo categoria", nil)
	mustFail(t, strings.Replace(graficoYAML(""), `"dados ilustrativos"`, `"http://exemplo.com"`, 1), "link https", nil)
	mustFail(t, strings.Replace(graficoYAML(""), `"pix-gateway"`, `"um rótulo comprido demais para caber"`, 1), "máximo 28", nil)
	mustFail(t, graficoYAML("nos:\n  - { id: a, rotulo: a, col: 0, row: 0 }\n"), `campo "nos" não se aplica`, nil)
	mustFail(t, topologiaYAML("fonte: \"dados ilustrativos\"\n"), `campo "fonte" não se aplica`, nil)
}

func TestGraficoNumericAxis(t *testing.T) {
	src := `id: fixture
tipo: grafico
titulo: "Amdahl: o trecho serial limita o ganho"
descricao: "` + descricaoOK + `"
forma: linha
eixo_x: { rotulo: "núcleos", tipo: numero, escala: log }
eixo_y: { rotulo: "aceleração", min: 0 }
series:
  - { id: p95, rotulo: "95% paralelo", pontos: [[1, 1], [2, 1.9], [4, 3.48], [8, 5.93]] }
  - { id: p50, rotulo: "50% paralelo", pontos: [[1, 1], [4, 1.6], [8, 1.78]] }
anotacoes:
  - { tipo: linha-y, valor: 2, rotulo: "teto de 50%" }
fonte: "dados ilustrativos"
`
	d := mustParse(t, src, nil)
	fig := graficoDadosHTML(d)
	// Rows are the union of x, in numeric order, with a dash for a gap.
	if !strings.Contains(fig, "<tr><td>2</td><td>1,9</td><td>—</td></tr><tr><td>4</td>") {
		t.Fatalf("table rows: %s", fig)
	}
	mustFail(t, strings.Replace(src, "[2, 1.9], [4, 3.48]", "[4, 1.9], [2, 3.48]", 1), "x precisa ser crescente", nil)
	mustFail(t, strings.Replace(src, "valor: 2,", "valor: 9,", 1), "fora do domínio", nil)
}
