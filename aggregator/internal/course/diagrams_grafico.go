package course

import (
	"fmt"
	"html"
	"math"
	"net/url"
	"strconv"
	"strings"
)

// Tipo grafico (D-G): data shape — distributions, curves, comparisons — for
// the milestones a graph of boxes cannot teach. Same pipeline as the other
// types: validated here, drawn by diagram.js, and the numbers also go into
// the figure as a table, readable without JavaScript.

const (
	graficoSeriesMax        = 4
	graficoPontosMax        = 60
	graficoFonteIlustrativa = "dados ilustrativos"
)

var (
	graficoFormas     = map[string]bool{"linha": true, "barra": true, "area": true}
	graficoAnotTipos  = map[string]bool{"linha-x": true, "linha-y": true, "faixa-x": true, "faixa-y": true}
	graficoEscalas    = map[string]bool{"": true, "linear": true, "log": true}
	graficoEixoXTipos = map[string]bool{"categoria": true, "numero": true}
)

type graficoEixoSpec struct {
	Rotulo string   `yaml:"rotulo"`
	Tipo   string   `yaml:"tipo"`
	Min    *float64 `yaml:"min"`
	Max    *float64 `yaml:"max"`
	Escala string   `yaml:"escala"`
}

type graficoSerieSpec struct {
	ID     string  `yaml:"id"`
	Rotulo string  `yaml:"rotulo"`
	Pontos [][]any `yaml:"pontos"`
}

type graficoAnotacaoSpec struct {
	Tipo   string `yaml:"tipo"`
	Valor  any    `yaml:"valor"`
	De     any    `yaml:"de"`
	Ate    any    `yaml:"ate"`
	Rotulo string `yaml:"rotulo"`
	Papel  string `yaml:"papel"`
}

// Compiled chart parts. On a category axis x is the category's label
// (string); on a numeric axis it is a number.

type GraficoEixo struct {
	Rotulo string   `json:"rotulo"`
	Tipo   string   `json:"tipo,omitempty"`
	Min    *float64 `json:"min,omitempty"`
	Max    *float64 `json:"max,omitempty"`
	Escala string   `json:"escala,omitempty"`
}

type GraficoSerie struct {
	ID     string  `json:"id"`
	Rotulo string  `json:"rotulo"`
	Pontos [][]any `json:"pontos"`
}

type GraficoAnotacao struct {
	Tipo   string `json:"tipo"`
	Valor  any    `json:"valor,omitempty"`
	De     any    `json:"de,omitempty"`
	Ate    any    `json:"ate,omitempty"`
	Rotulo string `json:"rotulo"`
	Papel  string `json:"papel,omitempty"`
}

func toNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

// categoryLabel turns a YAML scalar into the category's text: 250 → "250".
func categoryLabel(v any) (string, bool) {
	switch n := v.(type) {
	case string:
		return n, strings.TrimSpace(n) != ""
	case int:
		return strconv.Itoa(n), true
	case float64:
		return strconv.FormatFloat(n, 'f', -1, 64), true
	}
	return "", false
}

// parseGrafico validates the chart part of a spec (D-G) into d.
func (v *diagramaValidator) grafico(s diagramaSpec, d *Diagrama) {
	if !graficoFormas[s.Forma] {
		v.fail("forma %q inválida (linha, barra ou area)", s.Forma)
	}
	if s.EixoX == nil || s.EixoY == nil {
		v.fail("grafico precisa de eixo_x e eixo_y")
		return
	}
	ex, ey := *s.EixoX, *s.EixoY
	v.rotulo("eixo_x", ex.Rotulo)
	v.rotulo("eixo_y", ey.Rotulo)
	if !graficoEixoXTipos[ex.Tipo] {
		v.fail("eixo_x.tipo %q inválido (categoria ou numero)", ex.Tipo)
	}
	if ey.Tipo != "" && ey.Tipo != "numero" {
		v.fail("eixo_y é sempre numérico: tire tipo %q", ey.Tipo)
	}
	categorico := ex.Tipo == "categoria"
	if categorico && (ex.Min != nil || ex.Max != nil || ex.Escala != "") {
		v.fail("eixo_x categórico não aceita min, max nem escala")
	}
	if s.Forma == "barra" && !categorico {
		v.fail("forma barra exige eixo_x.tipo categoria")
	}
	for name, e := range map[string]graficoEixoSpec{"eixo_x": ex, "eixo_y": ey} {
		if !graficoEscalas[e.Escala] {
			v.fail("%s.escala %q inválida (linear ou log)", name, e.Escala)
		}
		if e.Min != nil && e.Max != nil && *e.Min >= *e.Max {
			v.fail("%s: min precisa ser menor que max", name)
		}
		if e.Escala == "log" && e.Min != nil && *e.Min <= 0 {
			v.fail("%s: escala log exige min > 0", name)
		}
	}
	if s.Forma == "barra" && ey.Escala == "log" {
		v.fail("barra em escala log engana (a barra não tem zero): use linha")
	}

	switch fonte := strings.TrimSpace(s.Fonte); {
	case fonte == "":
		v.fail("fonte é obrigatória: %q ou o link da origem", graficoFonteIlustrativa)
	case fonte != graficoFonteIlustrativa:
		u, err := url.Parse(fonte)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			v.fail("fonte %q: use %q ou um link https da origem", fonte, graficoFonteIlustrativa)
		}
	}

	if len(s.Series) == 0 || len(s.Series) > graficoSeriesMax {
		v.fail("%d séries (de 1 a %d)", len(s.Series), graficoSeriesMax)
	}
	ids := map[string]bool{}
	var categorias []string
	seenCat := map[string]bool{}
	xLo, xHi, yLo, yHi := math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for i, sr := range s.Series {
		v.id(fmt.Sprintf("series[%d]", i), sr.ID, ids)
		v.rotulo(fmt.Sprintf("serie %q", sr.ID), sr.Rotulo)
		if len(sr.Pontos) == 0 || len(sr.Pontos) > graficoPontosMax {
			v.fail("serie %q: %d pontos (de 1 a %d)", sr.ID, len(sr.Pontos), graficoPontosMax)
		}
		out := GraficoSerie{ID: sr.ID, Rotulo: sr.Rotulo}
		prev := math.Inf(-1)
		seenHere := map[string]bool{}
		for j, p := range sr.Pontos {
			where := fmt.Sprintf("serie %q, ponto %d", sr.ID, j)
			if len(p) != 2 {
				v.fail("%s: use [x, y]", where)
				continue
			}
			y, ok := toNumber(p[1])
			if !ok {
				v.fail("%s: y precisa ser número", where)
				continue
			}
			if ey.Escala == "log" && y <= 0 {
				v.fail("%s: escala log exige y > 0", where)
			}
			yLo, yHi = math.Min(yLo, y), math.Max(yHi, y)
			if categorico {
				c, ok := categoryLabel(p[0])
				if !ok {
					v.fail("%s: categoria vazia", where)
					continue
				}
				if seenHere[c] {
					v.fail("%s: categoria %q repetida", where, c)
				}
				seenHere[c] = true
				if !seenCat[c] {
					seenCat[c] = true
					categorias = append(categorias, c)
				}
				out.Pontos = append(out.Pontos, []any{c, y})
				continue
			}
			x, ok := toNumber(p[0])
			if !ok {
				v.fail("%s: x precisa ser número (eixo_x.tipo numero)", where)
				continue
			}
			if x <= prev {
				v.fail("%s: x precisa ser crescente", where)
			}
			if ex.Escala == "log" && x <= 0 {
				v.fail("%s: escala log exige x > 0", where)
			}
			prev = x
			xLo, xHi = math.Min(xLo, x), math.Max(xHi, x)
			out.Pontos = append(out.Pontos, []any{x, y})
		}
		d.Series = append(d.Series, out)
	}

	// Domains, exactly as diagram.js computes them: the axis bounds when
	// declared, the data otherwise; bars and areas always include zero.
	if ex.Min != nil {
		xLo = *ex.Min
	}
	if ex.Max != nil {
		xHi = *ex.Max
	}
	if ey.Min != nil {
		yLo = *ey.Min
	} else if s.Forma != "linha" && ey.Escala != "log" {
		yLo = math.Min(0, yLo)
	}
	if ey.Max != nil {
		yHi = *ey.Max
	}

	inX := func(where string, val any) {
		if categorico {
			c, ok := categoryLabel(val)
			if !ok || !seenCat[c] {
				v.fail("%s: %v não é uma categoria do eixo_x", where, val)
			}
			return
		}
		x, ok := toNumber(val)
		if !ok || x < xLo || x > xHi {
			v.fail("%s: %v fora do domínio do eixo_x [%g, %g]", where, val, xLo, xHi)
		}
	}
	inY := func(where string, val any) {
		y, ok := toNumber(val)
		if !ok || y < yLo || y > yHi {
			v.fail("%s: %v fora do domínio do eixo_y [%g, %g]", where, val, yLo, yHi)
		}
	}
	for i, a := range s.Anotacoes {
		where := fmt.Sprintf("anotacoes[%d]", i)
		if !graficoAnotTipos[a.Tipo] {
			v.fail("%s: tipo %q inválido (linha-x, linha-y, faixa-x ou faixa-y)", where, a.Tipo)
			continue
		}
		v.rotulo(where, a.Rotulo)
		if a.Papel != "" && a.Papel != "destaque" {
			v.fail("%s: papel %q inválido (só destaque)", where, a.Papel)
		}
		check := inX
		if strings.HasSuffix(a.Tipo, "-y") {
			check = inY
		}
		out := GraficoAnotacao{Tipo: a.Tipo, Rotulo: a.Rotulo, Papel: a.Papel}
		if strings.HasPrefix(a.Tipo, "linha") {
			if a.Valor == nil || a.De != nil || a.Ate != nil {
				v.fail("%s: %s usa só valor", where, a.Tipo)
				continue
			}
			check(where, a.Valor)
			out.Valor = normalizeAxisValue(a.Valor, categorico && a.Tipo == "linha-x")
		} else {
			if a.De == nil || a.Ate == nil || a.Valor != nil {
				v.fail("%s: %s usa de e ate", where, a.Tipo)
				continue
			}
			check(where+".de", a.De)
			check(where+".ate", a.Ate)
			cat := categorico && a.Tipo == "faixa-x"
			out.De, out.Ate = normalizeAxisValue(a.De, cat), normalizeAxisValue(a.Ate, cat)
		}
		d.Anotacoes = append(d.Anotacoes, out)
	}

	d.Forma = s.Forma
	d.EixoX = &GraficoEixo{Rotulo: ex.Rotulo, Tipo: ex.Tipo, Min: ex.Min, Max: ex.Max, Escala: ex.Escala}
	d.EixoY = &GraficoEixo{Rotulo: ey.Rotulo, Min: ey.Min, Max: ey.Max, Escala: ey.Escala}
	d.Categorias = categorias
	d.Fonte = strings.TrimSpace(s.Fonte)
}

func normalizeAxisValue(v any, categoria bool) any {
	if categoria {
		c, _ := categoryLabel(v)
		return c
	}
	n, _ := toNumber(v)
	return n
}

// formatNumero writes a number the pt-BR way, as the renderer does:
// 1234.5 → "1234,5".
func formatNumero(n float64) string {
	return strings.Replace(strconv.FormatFloat(n, 'f', -1, 64), ".", ",", 1)
}

func formatX(v any) string {
	if n, ok := v.(float64); ok {
		return formatNumero(n)
	}
	return fmt.Sprint(v)
}

// graficoDadosHTML is the chart's data as a table inside a collapsible
// block, plus the source line: what a screen reader, or a reader without
// JavaScript, gets instead of the drawing.
func graficoDadosHTML(d Diagrama) string {
	var xs []string
	seen := map[string]bool{}
	cell := map[string]map[string]string{}
	for _, s := range d.Series {
		cell[s.ID] = map[string]string{}
		for _, p := range s.Pontos {
			x := formatX(p[0])
			if !seen[x] {
				seen[x] = true
				xs = append(xs, x)
			}
			cell[s.ID][x] = formatNumero(p[1].(float64))
		}
	}
	if d.EixoX.Tipo == "numero" {
		// Series sampled at different x: rows in numeric order.
		nums := map[string]float64{}
		for _, s := range d.Series {
			for _, p := range s.Pontos {
				nums[formatX(p[0])] = p[0].(float64)
			}
		}
		sortByNumber(xs, nums)
	}
	var b strings.Builder
	b.WriteString(`<details class="diagrama-dados"><summary>Dados do gráfico</summary><table><thead><tr><th>`)
	b.WriteString(html.EscapeString(d.EixoX.Rotulo))
	b.WriteString(`</th>`)
	for _, s := range d.Series {
		b.WriteString(`<th>` + html.EscapeString(s.Rotulo) + ` (` + html.EscapeString(d.EixoY.Rotulo) + `)</th>`)
	}
	b.WriteString(`</tr></thead><tbody>`)
	for _, x := range xs {
		b.WriteString(`<tr><td>` + html.EscapeString(x) + `</td>`)
		for _, s := range d.Series {
			val, ok := cell[s.ID][x]
			if !ok {
				val = "—"
			}
			b.WriteString(`<td>` + val + `</td>`)
		}
		b.WriteString(`</tr>`)
	}
	b.WriteString(`</tbody></table></details><p class="diagrama-fonte">Fonte: `)
	if d.Fonte == graficoFonteIlustrativa {
		b.WriteString(graficoFonteIlustrativa)
	} else {
		esc := html.EscapeString(d.Fonte)
		b.WriteString(`<a href="` + esc + `">` + esc + `</a>`)
	}
	b.WriteString(`</p>`)
	return b.String()
}

func sortByNumber(xs []string, nums map[string]float64) {
	for i := 1; i < len(xs); i++ {
		for j := i; j > 0 && nums[xs[j]] < nums[xs[j-1]]; j-- {
			xs[j], xs[j-1] = xs[j-1], xs[j]
		}
	}
}
