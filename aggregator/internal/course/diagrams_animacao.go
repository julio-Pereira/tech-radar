package course

import (
	"fmt"
	"html"
	"strings"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// Diagramas animados por passos (PLANO Fase 1.6). The plan calls the list
// "passos"; in YAML it is "animacao", because "passos" is already the node
// list of the fluxo type. Steps are validated here and compiled cumulative —
// each step carries the full state (estados, rotulos) the player shows — so
// the front end never replays history to jump to a step.

const (
	animacaoPassosMax  = 12
	animacaoLegendaMax = 90
	animacaoAnotMax    = 60
)

var animacaoEstados = map[string]bool{
	"ativo": true, "novo": true, "saindo": true, "removido": true,
	"falha": true, "inativo": true, "destaque": true,
}

type animacaoFluxoSpec struct {
	De     string `yaml:"de"`
	Para   string `yaml:"para"`
	Rotulo string `yaml:"rotulo"`
}

type animacaoPassoSpec struct {
	Legenda   string              `yaml:"legenda"`
	Anotacao  string              `yaml:"anotacao"`
	Estados   map[string]string   `yaml:"estados"`
	Rotulos   map[string]string   `yaml:"rotulos"`
	Fluxos    []animacaoFluxoSpec `yaml:"fluxos"`
	Atual     string              `yaml:"atual"`
	Transicao *animacaoFluxoSpec  `yaml:"transicao"`
	Ate       int                 `yaml:"ate"`
}

// DiagramaFluxo is an edge (or transition) traversed during one step.
type DiagramaFluxo struct {
	De     string `json:"de"`
	Para   string `json:"para"`
	Rotulo string `json:"rotulo,omitempty"`
}

// DiagramaPasso is one compiled step: cumulative state plus what happens
// only in this step (fluxos, anotacao, transicao).
type DiagramaPasso struct {
	Legenda   string            `json:"legenda"`
	Anotacao  string            `json:"anotacao,omitempty"`
	Estados   map[string]string `json:"estados,omitempty"`
	Rotulos   map[string]string `json:"rotulos,omitempty"`
	Fluxos    []DiagramaFluxo   `json:"fluxos,omitempty"`
	Atual     string            `json:"atual,omitempty"`
	Transicao *DiagramaFluxo    `json:"transicao,omitempty"`
	Ate       int               `json:"ate,omitempty"`
}

// animacao validates the steps of a spec against the compiled diagram d
// (rules of section 3.5) and returns them cumulative.
func (v *diagramaValidator) animacao(node *yaml.Node, d Diagrama) []DiagramaPasso {
	if node == nil || node.Kind == 0 {
		return nil
	}
	if d.Tipo == "grafico" {
		v.fail("animacao não se aplica ao tipo grafico")
		return nil
	}
	// sequencia: "animacao: mensagens" is one step per message.
	if node.Kind == yaml.ScalarNode {
		if d.Tipo != "sequencia" || node.Value != "mensagens" {
			v.fail("animacao: use uma lista de passos (ou \"mensagens\", só em sequencia)")
			return nil
		}
		if len(d.Mensagens) > animacaoPassosMax {
			v.fail("animacao: mensagens geraria %d passos (máximo %d): agrupe com ate", len(d.Mensagens), animacaoPassosMax)
			return nil
		}
		var out []DiagramaPasso
		for i, m := range d.Mensagens {
			legenda := m.Nota
			if legenda == "" {
				legenda = m.Rotulo
			}
			out = append(out, DiagramaPasso{Legenda: legenda, Ate: i + 1})
		}
		return out
	}
	var specs []animacaoPassoSpec
	if err := node.Decode(&specs); err != nil {
		v.fail("animacao inválida: %v", err)
		return nil
	}
	if len(specs) == 0 || len(specs) > animacaoPassosMax {
		v.fail("animacao com %d passos (de 1 a %d)", len(specs), animacaoPassosMax)
	}

	nodes := map[string]bool{}
	for _, n := range d.Nos {
		nodes[n.ID] = true
	}
	edges := map[string]DiagramaAresta{}
	for _, a := range d.Arestas {
		edges[a.De+">"+a.Para] = a
	}
	estados := map[string]string{}
	rotulos := map[string]string{}
	prevAte := 0
	var out []DiagramaPasso
	for i, s := range specs {
		where := fmt.Sprintf("animacao[%d]", i)
		if strings.TrimSpace(s.Legenda) == "" {
			v.fail("%s: legenda é obrigatória", where)
		} else if n := utf8.RuneCountInString(s.Legenda); n > animacaoLegendaMax {
			v.fail("%s: legenda com %d caracteres (máximo %d)", where, n, animacaoLegendaMax)
		}
		if n := utf8.RuneCountInString(s.Anotacao); n > animacaoAnotMax {
			v.fail("%s: anotacao com %d caracteres (máximo %d)", where, n, animacaoAnotMax)
		}
		p := DiagramaPasso{Legenda: strings.TrimSpace(s.Legenda), Anotacao: strings.TrimSpace(s.Anotacao)}
		grafo := d.Tipo == "topologia" || d.Tipo == "fluxo"
		v.forbid("animacao de "+d.Tipo, "estados", !grafo && len(s.Estados) > 0)
		v.forbid("animacao de "+d.Tipo, "rotulos", !grafo && len(s.Rotulos) > 0)
		v.forbid("animacao de "+d.Tipo, "fluxos", !grafo && len(s.Fluxos) > 0)
		v.forbid("animacao de "+d.Tipo, "atual", d.Tipo != "estados" && s.Atual != "")
		v.forbid("animacao de "+d.Tipo, "transicao", d.Tipo != "estados" && s.Transicao != nil)
		v.forbid("animacao de "+d.Tipo, "ate", d.Tipo != "sequencia" && s.Ate != 0)

		switch d.Tipo {
		case "topologia", "fluxo":
			// Step 1 is the base drawing: state starts changing at step 2.
			if i == 0 && (len(s.Estados) > 0 || len(s.Rotulos) > 0) {
				v.fail("%s: o passo 1 é o desenho-base; mude estados e rotulos a partir do passo 2", where)
			}
			for id, e := range s.Estados {
				if !nodes[id] {
					v.fail("%s.estados: %q não existe no diagrama", where, id)
				}
				if !animacaoEstados[e] {
					v.fail("%s.estados: %q inválido (ativo, novo, saindo, removido, falha, inativo ou destaque)", where, e)
				}
				estados[id] = e
			}
			for id, r := range s.Rotulos {
				if !nodes[id] {
					v.fail("%s.rotulos: %q não existe no diagrama", where, id)
				}
				v.rotulo(where+".rotulos."+id, r)
				rotulos[id] = r
			}
			for j, f := range s.Fluxos {
				a, ok := edges[f.De+">"+f.Para]
				if !ok {
					v.fail("%s.fluxos[%d]: não há aresta %s→%s no diagrama, nesse sentido", where, j, f.De, f.Para)
					continue
				}
				if f.Rotulo != "" {
					v.rotulo(fmt.Sprintf("%s.fluxos[%d]", where, j), f.Rotulo)
					if a.Rotulo == "" {
						v.fail("%s.fluxos[%d]: só troca o rótulo de uma aresta que tem rótulo", where, j)
					}
				}
				p.Fluxos = append(p.Fluxos, DiagramaFluxo{De: f.De, Para: f.Para, Rotulo: f.Rotulo})
			}
			p.Estados, p.Rotulos = copyMap(estados), copyMap(rotulos)
		case "estados":
			if s.Atual == "" {
				v.fail("%s: atual é obrigatório em todo passo de estados", where)
			} else if !nodes[s.Atual] {
				v.fail("%s: atual %q não é um estado declarado", where, s.Atual)
			}
			p.Atual = s.Atual
			if t := s.Transicao; t != nil {
				if _, ok := edges[t.De+">"+t.Para]; !ok {
					v.fail("%s: não há transição %s→%s no diagrama", where, t.De, t.Para)
				}
				p.Transicao = &DiagramaFluxo{De: t.De, Para: t.Para}
			}
		case "sequencia":
			if s.Ate <= prevAte || s.Ate > len(d.Mensagens) {
				v.fail("%s: ate %d precisa ser maior que o do passo anterior (%d) e no máximo %d", where, s.Ate, prevAte, len(d.Mensagens))
			}
			prevAte = s.Ate
			p.Ate = s.Ate
		}
		out = append(out, p)
	}
	return out
}

func copyMap(m map[string]string) map[string]string {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// animacaoHTML is the numbered list of steps inside the textual description:
// a screen reader, a reader without JavaScript or a printout walks the same
// sequence the player shows.
func animacaoHTML(d Diagrama) string {
	if len(d.Animacao) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<p>Passo a passo:</p><ol>`)
	for _, p := range d.Animacao {
		b.WriteString(`<li>` + html.EscapeString(p.Legenda))
		if p.Anotacao != "" {
			b.WriteString(` (` + html.EscapeString(p.Anotacao) + `)`)
		}
		b.WriteString(`</li>`)
	}
	b.WriteString(`</ol>`)
	return b.String()
}
