package course

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Accumulated metrics in a walkthrough (Fase 1.8, plan §4.3). The compiler
// computes the value of every metric after every event and writes it as
// text; the player only shows it, with no arithmetic. A metric has no value
// until the first event that sets it ("—"), and is cumulative like the
// states: "+N" adds, "=N" sets.

const (
	wtMetricasMax      = 3 // what fits at 360px
	wtMetricaRotuloMax = 18
	wtMetricaCasasMax  = 4
	wtMetricaEscala    = 10000 // values are kept as integers, ×10^4
)

var (
	wtMetricaOpRe      = regexp.MustCompile(`^([+=])(-?)(\d+)(?:\.(\d+))?$`)
	wtMetricaUnidadeRe = regexp.MustCompile(`^[\p{L}$%/]{1,4}$`)
	// Time and money never go negative.
	wtMetricaNaoNegativa = map[string]bool{"ms": true, "s": true, "min": true, "h": true, "d": true, "R$": true}
)

type wtMetricaSpec struct {
	ID      string   `yaml:"id"`
	Rotulo  string   `yaml:"rotulo"`
	Unidade string   `yaml:"unidade"`
	Casas   int      `yaml:"casas"`
	Max     *float64 `yaml:"max"`
	Icone   string   `yaml:"icone"`
}

// WalkthroughMetrica is one card's definition in the compiled JSON.
type WalkthroughMetrica struct {
	ID     string `json:"id"`
	Rotulo string `json:"rotulo"`
	Icone  string `json:"icone,omitempty"`
}

type wtMetricaEstado struct {
	spec     wtMetricaSpec
	max      int64
	valor    int64
	definido bool
	usada    bool
}

// metricasDef validates the definitions and returns them, with the running
// state the events update.
func (v *diagramaValidator) metricasDef(specs []wtMetricaSpec) ([]WalkthroughMetrica, map[string]*wtMetricaEstado) {
	if len(specs) > wtMetricasMax {
		v.fail("metricas: %d (máximo %d, o que cabe em 360 px)", len(specs), wtMetricasMax)
	}
	seen := map[string]bool{}
	estado := map[string]*wtMetricaEstado{}
	var out []WalkthroughMetrica
	for i, m := range specs {
		where := fmt.Sprintf("metrica %q", m.ID)
		v.id(fmt.Sprintf("metricas[%d]", i), m.ID, seen)
		v.texto(where+": rotulo", m.Rotulo, wtMetricaRotuloMax, true)
		if m.Unidade != "" && !wtMetricaUnidadeRe.MatchString(m.Unidade) {
			v.fail("%s: unidade %q inválida (até 4 letras, $, %% ou /)", where, m.Unidade)
		}
		if m.Casas < 0 || m.Casas > wtMetricaCasasMax {
			v.fail("%s: casas %d (de 0 a %d)", where, m.Casas, wtMetricaCasasMax)
		}
		e := &wtMetricaEstado{spec: m}
		if m.Max != nil {
			if *m.Max <= 0 {
				v.fail("%s: max precisa ser maior que zero", where)
			}
			e.max = int64(*m.Max*wtMetricaEscala + 0.5)
		}
		if m.Icone != "" {
			v.icone(where, m.Icone)
		}
		estado[m.ID] = e
		out = append(out, WalkthroughMetrica{ID: m.ID, Rotulo: strings.TrimSpace(m.Rotulo), Icone: m.Icone})
	}
	return out, estado
}

// metricasEvento applies one event's operations and returns every metric
// that has a value, as text, and the ids this event changed.
func (v *diagramaValidator) metricasEvento(what string, ops map[string]string, defs []WalkthroughMetrica, estado map[string]*wtMetricaEstado) (map[string]string, []string) {
	mudou := map[string]bool{}
	for id, op := range ops {
		e, ok := estado[id]
		if !ok {
			v.fail("%s.metricas: %q não é uma métrica declarada", what, id)
			continue
		}
		e.usada = true
		m := wtMetricaOpRe.FindStringSubmatch(op)
		if m == nil {
			v.fail("%s.metricas.%s: %q inválido (use +N para somar ou =N para definir, com ponto decimal)", what, id, op)
			continue
		}
		if len(m[4]) > e.spec.Casas {
			v.fail("%s.metricas.%s: %q tem %d casas (a métrica declara %d)", what, id, op, len(m[4]), e.spec.Casas)
			continue
		}
		n, _ := strconv.ParseInt(m[3], 10, 64)
		frac := m[4] + strings.Repeat("0", wtMetricaCasasMax-len(m[4]))
		f, _ := strconv.ParseInt(frac, 10, 64)
		n = n*wtMetricaEscala + f
		if m[2] == "-" {
			n = -n
		}
		naoNeg := wtMetricaNaoNegativa[e.spec.Unidade]
		if m[1] == "=" {
			if naoNeg && n < 0 {
				v.fail("%s.metricas.%s: %q negativo numa métrica de tempo ou dinheiro", what, id, op)
				continue
			}
			e.valor = n
		} else {
			e.valor += n
		}
		e.definido = true
		if naoNeg && e.valor < 0 {
			v.fail("%s.metricas.%s: o valor acumulado fica negativo numa métrica de tempo ou dinheiro", what, id)
		}
		if e.max > 0 && e.valor > e.max {
			v.fail("%s.metricas.%s: o valor acumulado passa do max", what, id)
		}
		mudou[id] = true
	}
	vals := map[string]string{}
	var ids []string
	for _, d := range defs { // declaration order, so the output is stable
		e := estado[d.ID]
		if e.definido {
			vals[d.ID] = e.texto()
		}
		if mudou[d.ID] {
			ids = append(ids, d.ID)
		}
	}
	if len(vals) == 0 {
		vals = nil
	}
	return vals, ids
}

// texto is the value as the reader sees it: decimal comma, thousands dot,
// "N de M" with a max, the unit after the number ("R$" before it).
func (e *wtMetricaEstado) texto() string {
	s := wtMetricaNumero(e.valor, e.spec.Casas)
	if e.max > 0 {
		s += " de " + wtMetricaNumero(e.max, e.spec.Casas)
	}
	switch e.spec.Unidade {
	case "":
		return s
	case "R$":
		return "R$ " + s
	default:
		return s + " " + e.spec.Unidade
	}
}

func wtMetricaNumero(v int64, casas int) string {
	neg := v < 0
	if neg {
		v = -v
	}
	inteiro := strconv.FormatInt(v/wtMetricaEscala, 10)
	for i := len(inteiro) - 3; i > 0; i -= 3 {
		inteiro = inteiro[:i] + "." + inteiro[i:]
	}
	s := inteiro
	if casas > 0 {
		frac := fmt.Sprintf("%04d", v%wtMetricaEscala)[:casas]
		s += "," + frac
	}
	if neg {
		s = "-" + s
	}
	return s
}

// metricasNaoUsadas reports a declared metric no event ever sets.
func (v *diagramaValidator) metricasNaoUsadas(defs []WalkthroughMetrica, estado map[string]*wtMetricaEstado) {
	for _, d := range defs {
		if !estado[d.ID].usada {
			v.fail("metrica %q: nenhum evento a define", d.ID)
		}
	}
}

// wtMetricasTexto is the change list of one event for the textual
// description: "Em trânsito: R$ 120,00; Envios ao SPI: 1".
func wtMetricasTexto(defs []WalkthroughMetrica, ev WalkthroughEvento) string {
	rot := map[string]string{}
	for _, d := range defs {
		rot[d.ID] = d.Rotulo
	}
	var parts []string
	for _, id := range ev.Mudou {
		parts = append(parts, rot[id]+": "+ev.Metricas[id])
	}
	return strings.Join(parts, "; ")
}
