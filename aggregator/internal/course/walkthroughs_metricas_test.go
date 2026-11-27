package course

import (
	"strings"
	"testing"
)

// Fase 1.8, §4.3: metrics computed at build time.

// wtComMetricas adds a metricas block and per-event operations to the
// valid fixture (5 events: 3 in "chega", 2 in "reage").
func wtComMetricas(t *testing.T, defs string, ops ...string) string {
	t.Helper()
	src := strings.Replace(wtValido, "etapas:\n", "metricas:\n"+defs+"etapas:\n", 1)
	evs := []string{
		`msg: "O cliente envia o pedido"`,
		`msg: "A API grava o pedido no banco"`,
		`msg: "A API responde 201 antes de qualquer execução"`,
		`msg: "O agente vê o pedido do seu nó"`,
		`msg: "O agente reporta o status"`,
	}
	for i, op := range ops {
		if op == "" {
			continue
		}
		if strings.Count(src, evs[i]) != 1 {
			t.Fatalf("fixture: %q", evs[i])
		}
		src = strings.Replace(src, evs[i], evs[i]+", metricas: { "+op+" }", 1)
	}
	return src
}

const wtDefs = `  - { id: tempo, rotulo: "Desde o envio", unidade: s }
  - { id: valor, rotulo: "Em trânsito", unidade: "R$", casas: 2 }
  - { id: pods, rotulo: "Pods prontos", max: 3 }
`

func TestWalkthroughMetricasCumulativas(t *testing.T) {
	w := wtParse(t, wtComMetricas(t, wtDefs, `valor: "=1200.5"`, `tempo: "+8"`, `tempo: "+2", pods: "=1"`, "", `valor: "=0", pods: "+2"`))
	if len(w.Metricas) != 3 || w.Metricas[1].Rotulo != "Em trânsito" {
		t.Fatalf("defs %+v", w.Metricas)
	}
	ev := func(n int) WalkthroughEvento {
		for _, e := range w.Etapas {
			for _, x := range e.Eventos {
				if x.N == n {
					return x
				}
			}
		}
		t.Fatalf("event %d", n)
		return WalkthroughEvento{}
	}
	cases := []struct {
		n     int
		vals  map[string]string
		mudou string
	}{
		{1, map[string]string{"valor": "R$ 1.200,50"}, "valor"},
		{2, map[string]string{"valor": "R$ 1.200,50", "tempo": "8 s"}, "tempo"},
		{3, map[string]string{"valor": "R$ 1.200,50", "tempo": "10 s", "pods": "1 de 3"}, "tempo,pods"},
		{4, map[string]string{"valor": "R$ 1.200,50", "tempo": "10 s", "pods": "1 de 3"}, ""},
		{5, map[string]string{"valor": "R$ 0,00", "tempo": "10 s", "pods": "3 de 3"}, "valor,pods"},
	}
	for _, c := range cases {
		e := ev(c.n)
		if len(e.Metricas) != len(c.vals) {
			t.Errorf("event %d: %v, want %v", c.n, e.Metricas, c.vals)
		}
		for k, v := range c.vals {
			if e.Metricas[k] != v {
				t.Errorf("event %d: %s = %q, want %q", c.n, k, e.Metricas[k], v)
			}
		}
		if got := strings.Join(e.Mudou, ","); got != c.mudou {
			t.Errorf("event %d: mudou %q, want %q", c.n, got, c.mudou)
		}
	}
	// The textual description carries the values after each event that
	// changes them.
	html := walkthroughFigureHTML("s", w)
	if !strings.Contains(html, "— Desde o envio: 10 s; Pods prontos: 1 de 3") {
		t.Fatalf("description without the metric values:\n%s", html)
	}
}

func TestWalkthroughMetricasErros(t *testing.T) {
	quatro := wtDefs + `  - { id: extra, rotulo: "Extra" }
`
	cases := []struct{ name, src, want string }{
		{"too many", wtComMetricas(t, quatro, `tempo: "=1", valor: "=1", pods: "=1", extra: "=1"`), "metricas: 4 (máximo 3"},
		{"long label", wtComMetricas(t, `  - { id: tempo, rotulo: "Tempo desde o envio ao SPI" }
`, `tempo: "=1"`), "rotulo com 26 caracteres (máximo 18)"},
		{"bad unit", wtComMetricas(t, `  - { id: tempo, rotulo: "Tempo", unidade: "segundos" }
`, `tempo: "=1"`), `unidade "segundos" inválida`},
		{"unknown metric", wtComMetricas(t, wtDefs, `tempo: "=1", valor: "=1", pods: "=1", fila: "=2"`), `"fila" não é uma métrica declarada`},
		{"bad operation", wtComMetricas(t, wtDefs, `tempo: "8", valor: "=1", pods: "=1"`), `"8" inválido (use +N`},
		{"too many places", wtComMetricas(t, wtDefs, `tempo: "=8.5", valor: "=1", pods: "=1"`), `"=8.5" tem 1 casas`},
		{"negative money", wtComMetricas(t, wtDefs, `tempo: "=1", valor: "=-1.00", pods: "=1"`), "negativo numa métrica de tempo ou dinheiro"},
		{"negative sum", wtComMetricas(t, wtDefs, `tempo: "=1", valor: "=1", pods: "=1"`, `tempo: "+-2"`), "valor acumulado fica negativo"},
		{"past max", wtComMetricas(t, wtDefs, `tempo: "=1", valor: "=1", pods: "=4"`), "passa do max"},
		{"never set", wtComMetricas(t, wtDefs, `tempo: "=1", valor: "=1"`), `metrica "pods": nenhum evento a define`},
		{"bad icon", wtComMetricas(t, `  - { id: tempo, rotulo: "Tempo", icone: relogio }
`, `tempo: "=1"`), `icone "relogio" fora do catálogo`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) { wtFail(t, c.src, c.want) })
	}
}

func TestWalkthroughSemMetricas(t *testing.T) {
	w := wtParse(t, wtValido)
	if w.Metricas != nil {
		t.Fatalf("a walkthrough without metricas carries %v", w.Metricas)
	}
	for _, e := range w.Etapas {
		for _, x := range e.Eventos {
			if x.Metricas != nil || x.Mudou != nil {
				t.Fatalf("event %d carries metrics: %+v", x.N, x)
			}
		}
	}
}
