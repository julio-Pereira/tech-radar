package course

import (
	"encoding/json"
	"strings"
	"testing"
)

// Fase 1.8, plan §3.2: icons by component type.

func TestIconeCatalogo(t *testing.T) {
	// The plan's 13 icons, each with its fixed shape.
	want := map[string]string{
		"cliente": "arredondada", "pessoa": "arredondada", "servico": "caixa", "gateway": "caixa",
		"rede": "hexagono", "banco": "cilindro", "cache": "cilindro-baixo", "fila": "tubo",
		"job": "caixa", "arquivo": "canto-dobrado", "identidade": "caixa", "plataforma": "caixa",
		"instituicao": "borda-dupla",
	}
	if len(diagramaIcones) != len(want) {
		t.Fatalf("catalog has %d icons, want %d", len(diagramaIcones), len(want))
	}
	for icone, forma := range want {
		if diagramaIcones[icone] != forma {
			t.Errorf("icone %q: forma %q, want %q", icone, diagramaIcones[icone], forma)
		}
	}
}

func TestIconeTopologia(t *testing.T) {
	src := strings.Replace(topologiaYAML(""), `{ id: kafka, rotulo: "Kafka", col: 1, row: 1, papel: externo }`,
		`{ id: kafka, rotulo: "Kafka", col: 1, row: 1, papel: externo, icone: fila }`, 1)
	d := mustParse(t, src, nil)
	if d.Nos[2].Icone != "fila" || d.Nos[2].Forma != "tubo" {
		t.Fatalf("icon not compiled with its shape: %+v", d.Nos[2])
	}
	// papel and icone coexist.
	if d.Nos[2].Papel != "externo" {
		t.Fatalf("papel lost next to icone: %+v", d.Nos[2])
	}
	// A node without icon carries neither field in the JSON.
	b, _ := json.Marshal(d.Nos[0])
	if strings.Contains(string(b), "icone") || strings.Contains(string(b), "forma") {
		t.Fatalf("node without icon: %s", b)
	}

	mustFail(t, strings.Replace(src, "icone: fila", "icone: kafka", 1), `icone "kafka" fora do catálogo`, nil)
}

func TestIconeSequencia(t *testing.T) {
	src := strings.Replace(sequenciaYAML(2, 1), `{ id: p1, rotulo: "servico-1" }`, `{ id: p1, rotulo: "servico-1", icone: banco }`, 1)
	d := mustParse(t, src, nil)
	if d.Participantes[1].Icone != "banco" || d.Participantes[1].Forma != "cilindro" {
		t.Fatalf("participant icon not compiled: %+v", d.Participantes[1])
	}
	mustFail(t, strings.Replace(src, "icone: banco", "icone: postgres", 1), `participante "p1": icone "postgres" fora do catálogo`, nil)
}

func TestIconeSoEmComponentes(t *testing.T) {
	estados := `id: fixture
tipo: estados
titulo: "Um alerta só dispara depois do for"
descricao: "` + descricaoOK + `"
estados:
  - { id: inactive, rotulo: "inactive", col: 0, row: 0, icone: servico }
  - { id: firing, rotulo: "firing", col: 1, row: 0 }
inicial: inactive
transicoes:
  - { de: inactive, para: firing, evento: "dispara" }
`
	mustFail(t, estados, `icone só vale em topologia e sequencia (em estados`, nil)
	mustParse(t, strings.Replace(estados, ", icone: servico", "", 1), nil)

	fluxo := `id: fixture
tipo: fluxo
titulo: "A saga desfaz o que já reservou"
descricao: "` + descricaoOK + `"
passos:
  - { id: reservar, rotulo: "reservar saldo", col: 0, row: 0, icone: banco }
  - { id: autorizar, rotulo: "autorizar no PSP", col: 1, row: 0 }
arestas:
  - { de: reservar, para: autorizar }
`
	mustFail(t, fluxo, `icone só vale em topologia e sequencia (em passos`, nil)
	mustParse(t, strings.Replace(fluxo, ", icone: banco", "", 1), nil)
}

// wtDiagramasCom compiles the walkthrough fixture diagrams after edits.
func wtDiagramasCom(t *testing.T, cluster, no string) map[string]Diagrama {
	t.Helper()
	out := wtDiagramas(t)
	for id, src := range map[string]string{"wt-cluster": cluster, "wt-no": no} {
		d, err := parseDiagrama([]byte(src), id, nil)
		if err != nil {
			t.Fatalf("fixture diagram %s: %v", id, err)
		}
		out[id] = d
	}
	return out
}

func TestIconeWalkthroughHeranca(t *testing.T) {
	cluster := strings.Replace(wtClusterYAML, `{ id: db, rotulo: "banco", col: 2, row: 0 }`, `{ id: db, rotulo: "banco", col: 2, row: 0, icone: banco }`, 1)
	cluster = strings.Replace(cluster, `{ id: api, rotulo: "API", col: 1, row: 0 }`, `{ id: api, rotulo: "API", col: 1, row: 0, icone: servico }`, 1)
	// The node layer has no icon on "api": a layer without icon does not count.
	w, err := parseWalkthrough([]byte(wtValido), "fixture", wtDiagramasCom(t, cluster, wtNoYAML))
	if err != nil {
		t.Fatalf("parseWalkthrough: %v", err)
	}
	icones := map[string]string{}
	for _, a := range w.Atores {
		icones[a.ID] = a.Icone + "/" + a.Forma
	}
	if icones["db"] != "banco/cilindro" || icones["api"] != "servico/caixa" || icones["cli"] != "/" {
		t.Fatalf("actor icons: %v", icones)
	}
	// The derived sequence of a step inherits the actors' icons.
	seq := w.Etapas[0].Sequencia
	got := map[string]string{}
	for _, p := range seq.Participantes {
		got[p.ID] = p.Icone + "/" + p.Forma
	}
	if got["db"] != "banco/cilindro" || got["api"] != "servico/caixa" {
		t.Fatalf("derived sequence icons: %v", got)
	}

	// Same icon in both layers: fine.
	no := strings.Replace(wtNoYAML, `{ id: api, rotulo: "API", col: 0, row: 0 }`, `{ id: api, rotulo: "API", col: 0, row: 0, icone: servico }`, 1)
	if _, err := parseWalkthrough([]byte(wtValido), "fixture", wtDiagramasCom(t, cluster, no)); err != nil {
		t.Fatalf("same icon in two layers: %v", err)
	}
	// Different icons in two layers: error.
	no = strings.Replace(no, "icone: servico", "icone: gateway", 1)
	_, err = parseWalkthrough([]byte(wtValido), "fixture", wtDiagramasCom(t, cluster, no))
	if err == nil || !strings.Contains(err.Error(), `ator "api": icone "servico" na camada "cluster" e "gateway" na camada "no"`) {
		t.Fatalf("different icons across layers: %v", err)
	}
}
