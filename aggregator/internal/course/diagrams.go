package course

import (
	"fmt"
	"html"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// Diagramas tipados (PLANO-diagramas): each diagram is a YAML file under
// content/courses/<trilha>/diagramas/<id>.yaml, referenced from a milestone
// by a fenced block of language "diagrama". The compiler validates the spec,
// replaces the fenced block with a <figure> carrying the title and the full
// textual description (readable without JavaScript), and writes the
// normalized specs to data/diagramas/<slug>.json, which the front end loads
// only when a milestone on screen contains a diagram. No SVG ever goes
// through the sanitizer: the browser draws it from the JSON.

const (
	diagramaTituloMax      = 90
	diagramaRotuloMax      = 28
	diagramaNotaMax        = 60
	diagramaDescricaoMin   = 40 // words
	diagramaNosMax         = 12
	diagramaParticipMax    = 6
	diagramaMensagensMax   = 14
	diagramaGridColunasMax = 6
)

var (
	diagramaIDRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	// A ```diagrama fence in the markdown source. It is replaced by a marker
	// paragraph before rendering, because the sanitizer drops the code
	// block's language class and the block could no longer be told apart
	// from any other one-line code block.
	diagramaFenceRe = regexp.MustCompile("(?m)^```diagrama[ \t]*\n((?:.*\n)*?)```[ \t]*$")
	// The marker paragraph after rendering and sanitizing.
	diagramaBlockRe = regexp.MustCompile(`<p>⟦diagrama:([^⟧<]*)⟧</p>`)
	// Fenced blocks in the markdown source, to find "diagrama" references
	// and to warn about new ASCII diagrams.
	fencedRe = regexp.MustCompile("(?ms)^```([a-zA-Z0-9-]*)[ \t]*\n(.*?)^```[ \t]*$")
	// Box-drawing characters and arrows that mark an ASCII diagram (the same
	// set the diagram plan's inventory counts).
	asciiDiagramRe = regexp.MustCompile(`[┌└┐┘│─├┤▶◀→←↓↑]|-->`)
)

var diagramaTipos = map[string]bool{"topologia": true, "sequencia": true, "estados": true, "fluxo": true}

var diagramaPapeis = map[string]bool{"": true, "destaque": true, "externo": true, "fora-da-transacao": true}

// Edge styles allowed per diagram type. "" means the default solid line.
var diagramaEstilos = map[string]map[string]bool{
	"topologia": {"": true, "normal": true, "tracejada": true},
	"fluxo":     {"": true, "normal": true, "falha": true, "compensacao": true},
}

var diagramaMensagemTipos = map[string]bool{"": true, "sync": true, "async": true, "reply": true}

// Source schema (YAML). Keys are Portuguese, like the rest of the content.

type diagramaGrupo struct {
	ID     string `yaml:"id"`
	Rotulo string `yaml:"rotulo"`
	Col    int    `yaml:"col"`
	Row    int    `yaml:"row"`
	Cols   int    `yaml:"cols"`
	Rows   int    `yaml:"rows"`
}

type diagramaNo struct {
	ID       string `yaml:"id"`
	Rotulo   string `yaml:"rotulo"`
	Grupo    string `yaml:"grupo"`
	Col      int    `yaml:"col"`
	Row      int    `yaml:"row"`
	Papel    string `yaml:"papel"`
	Conceito string `yaml:"conceito"`
}

type diagramaAresta struct {
	De     string `yaml:"de"`
	Para   string `yaml:"para"`
	Rotulo string `yaml:"rotulo"`
	Estilo string `yaml:"estilo"` // topologia
	Tipo   string `yaml:"tipo"`   // fluxo
}

type diagramaTransicao struct {
	De     string `yaml:"de"`
	Para   string `yaml:"para"`
	Evento string `yaml:"evento"`
	Guarda string `yaml:"guarda"`
}

type diagramaParticipante struct {
	ID       string `yaml:"id"`
	Rotulo   string `yaml:"rotulo"`
	Papel    string `yaml:"papel"`
	Conceito string `yaml:"conceito"`
}

type diagramaMensagem struct {
	De     string `yaml:"de"`
	Para   string `yaml:"para"`
	Rotulo string `yaml:"rotulo"`
	Tipo   string `yaml:"tipo"`
	Nota   string `yaml:"nota"`
}

type diagramaSpec struct {
	ID            string                 `yaml:"id"`
	Tipo          string                 `yaml:"tipo"`
	Titulo        string                 `yaml:"titulo"`
	Descricao     string                 `yaml:"descricao"`
	Grupos        []diagramaGrupo        `yaml:"grupos"`
	Nos           []diagramaNo           `yaml:"nos"`     // topologia
	Passos        []diagramaNo           `yaml:"passos"`  // fluxo
	Estados       []diagramaNo           `yaml:"estados"` // estados
	Arestas       []diagramaAresta       `yaml:"arestas"`
	Transicoes    []diagramaTransicao    `yaml:"transicoes"`
	Inicial       string                 `yaml:"inicial"`
	Finais        []string               `yaml:"finais"`
	Participantes []diagramaParticipante `yaml:"participantes"`
	Mensagens     []diagramaMensagem     `yaml:"mensagens"`
}

// Compiled schema (JSON): one normalized graph shape for topologia, fluxo
// and estados, and a separate shape for sequencia. Presentation attributes
// are semantic names that the front end maps to CSS classes.

type DiagramaGrupo struct {
	ID     string `json:"id"`
	Rotulo string `json:"rotulo"`
	Col    int    `json:"col"`
	Row    int    `json:"row"`
	Cols   int    `json:"cols"`
	Rows   int    `json:"rows"`
}

type DiagramaNo struct {
	ID       string `json:"id"`
	Rotulo   string `json:"rotulo"`
	Col      int    `json:"col"`
	Row      int    `json:"row"`
	Papel    string `json:"papel,omitempty"`
	Conceito string `json:"conceito,omitempty"`
	Href     string `json:"href,omitempty"`
}

type DiagramaAresta struct {
	De     string `json:"de"`
	Para   string `json:"para"`
	Rotulo string `json:"rotulo,omitempty"`
	Estilo string `json:"estilo,omitempty"`
}

type DiagramaParticipante struct {
	ID       string `json:"id"`
	Rotulo   string `json:"rotulo"`
	Papel    string `json:"papel,omitempty"`
	Conceito string `json:"conceito,omitempty"`
	Href     string `json:"href,omitempty"`
}

type DiagramaMensagem struct {
	De     string `json:"de"`
	Para   string `json:"para"`
	Rotulo string `json:"rotulo"`
	Tipo   string `json:"tipo"`
	Nota   string `json:"nota,omitempty"`
}

// Diagrama is one compiled diagram, as written to data/diagramas/<slug>.json.
type Diagrama struct {
	ID            string                 `json:"id"`
	Tipo          string                 `json:"tipo"`
	Titulo        string                 `json:"titulo"`
	Descricao     string                 `json:"descricao"`
	Grupos        []DiagramaGrupo        `json:"grupos,omitempty"`
	Nos           []DiagramaNo           `json:"nos,omitempty"`
	Arestas       []DiagramaAresta       `json:"arestas,omitempty"`
	Inicial       string                 `json:"inicial,omitempty"`
	Finais        []string               `json:"finais,omitempty"`
	Participantes []DiagramaParticipante `json:"participantes,omitempty"`
	Mensagens     []DiagramaMensagem     `json:"mensagens,omitempty"`
}

// DiagramasFile is data/diagramas/<slug>.json.
type DiagramasFile struct {
	Slug      string              `json:"slug"`
	Diagramas map[string]Diagrama `json:"diagramas"`
}

// loadDiagramas reads and validates every diagram of one course. A missing
// diagramas/ directory is a valid, empty set. Any invalid diagram fails the
// whole course, like an invalid quiz does.
func loadDiagramas(courseDir string, conceitos *conceitoSet) (map[string]Diagrama, error) {
	dir := filepath.Join(courseDir, "diagramas")
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return map[string]Diagrama{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read diagramas dir %s: %w", dir, err)
	}
	out := map[string]Diagrama{}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".yaml" {
			continue
		}
		path := filepath.Join(dir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read diagrama %s: %w", path, err)
		}
		d, err := parseDiagrama(data, strings.TrimSuffix(e.Name(), ".yaml"), conceitos)
		if err != nil {
			return nil, fmt.Errorf("diagrama %s: %w", path, err)
		}
		out[d.ID] = d
	}
	return out, nil
}

// parseDiagrama decodes and validates one spec (rules D5 1–6). fileID is the
// file name without extension, which must equal the spec's id.
func parseDiagrama(data []byte, fileID string, conceitos *conceitoSet) (Diagrama, error) {
	var s diagramaSpec
	dec := yaml.NewDecoder(strings.NewReader(string(data)))
	dec.KnownFields(true) // a typo in a key is an error, not a silently ignored field
	if err := dec.Decode(&s); err != nil {
		return Diagrama{}, fmt.Errorf("yaml inválido: %w", err)
	}
	v := diagramaValidator{}

	if !diagramaIDRe.MatchString(s.ID) {
		v.fail("id %q precisa ser kebab-case", s.ID)
	}
	if s.ID != fileID {
		v.fail("id %q diferente do nome do arquivo %q", s.ID, fileID)
	}
	if !diagramaTipos[s.Tipo] {
		v.fail("tipo %q desconhecido (topologia, sequencia, estados ou fluxo)", s.Tipo)
	}
	if strings.TrimSpace(s.Titulo) == "" {
		v.fail("titulo é obrigatório")
	} else if n := utf8.RuneCountInString(s.Titulo); n > diagramaTituloMax {
		v.fail("titulo com %d caracteres (máximo %d)", n, diagramaTituloMax)
	}
	if n := len(strings.Fields(s.Descricao)); n < diagramaDescricaoMin {
		v.fail("descricao com %d palavras (mínimo %d): é o texto que o leitor de tela lê", n, diagramaDescricaoMin)
	}

	d := Diagrama{ID: s.ID, Tipo: s.Tipo, Titulo: strings.TrimSpace(s.Titulo), Descricao: strings.Join(strings.Fields(s.Descricao), " ")}

	switch s.Tipo {
	case "topologia", "fluxo", "estados":
		v.forbid(s.Tipo, "participantes", len(s.Participantes) > 0)
		v.forbid(s.Tipo, "mensagens", len(s.Mensagens) > 0)
		nos, field := s.Nos, "nos"
		switch s.Tipo {
		case "fluxo":
			nos, field = s.Passos, "passos"
			v.forbid(s.Tipo, "nos", len(s.Nos) > 0)
			v.forbid(s.Tipo, "estados", len(s.Estados) > 0)
		case "estados":
			nos, field = s.Estados, "estados"
			v.forbid(s.Tipo, "nos", len(s.Nos) > 0)
			v.forbid(s.Tipo, "passos", len(s.Passos) > 0)
			v.forbid(s.Tipo, "arestas", len(s.Arestas) > 0)
		default:
			v.forbid(s.Tipo, "passos", len(s.Passos) > 0)
			v.forbid(s.Tipo, "estados", len(s.Estados) > 0)
		}
		if s.Tipo != "estados" {
			v.forbid(s.Tipo, "transicoes", len(s.Transicoes) > 0)
			v.forbid(s.Tipo, "inicial", s.Inicial != "")
			v.forbid(s.Tipo, "finais", len(s.Finais) > 0)
		}
		d.Grupos, d.Nos = v.grid(s.Grupos, nos, field, conceitos)
		ids := map[string]bool{}
		for _, n := range d.Nos {
			ids[n.ID] = true
		}
		if s.Tipo == "estados" {
			if s.Inicial == "" {
				v.fail("estados: inicial é obrigatório")
			} else if !ids[s.Inicial] {
				v.fail("inicial %q não é um estado declarado", s.Inicial)
			}
			for _, f := range s.Finais {
				if !ids[f] {
					v.fail("final %q não é um estado declarado", f)
				}
			}
			d.Inicial, d.Finais = s.Inicial, s.Finais
			for i, t := range s.Transicoes {
				v.ref(fmt.Sprintf("transicoes[%d].de", i), t.De, ids)
				v.ref(fmt.Sprintf("transicoes[%d].para", i), t.Para, ids)
				rotulo := strings.TrimSpace(t.Evento)
				if g := strings.TrimSpace(t.Guarda); g != "" {
					rotulo += " [" + g + "]"
				}
				if rotulo == "" {
					v.fail("transicoes[%d] precisa de evento", i)
				}
				v.rotulo(fmt.Sprintf("transicoes[%d]", i), rotulo)
				d.Arestas = append(d.Arestas, DiagramaAresta{De: t.De, Para: t.Para, Rotulo: rotulo})
			}
		} else {
			estilos := diagramaEstilos[s.Tipo]
			for i, a := range s.Arestas {
				v.ref(fmt.Sprintf("arestas[%d].de", i), a.De, ids)
				v.ref(fmt.Sprintf("arestas[%d].para", i), a.Para, ids)
				estilo := a.Estilo
				if s.Tipo == "fluxo" {
					if a.Estilo != "" {
						v.fail("arestas[%d]: em fluxo use tipo (normal, falha, compensacao), não estilo", i)
					}
					estilo = a.Tipo
				} else if a.Tipo != "" {
					v.fail("arestas[%d]: em topologia use estilo (normal, tracejada), não tipo", i)
				}
				if !estilos[estilo] {
					v.fail("arestas[%d]: %q não é um valor válido para %s", i, estilo, s.Tipo)
				}
				if estilo == "normal" {
					estilo = ""
				}
				if a.Rotulo != "" {
					v.rotulo(fmt.Sprintf("arestas[%d]", i), a.Rotulo)
				}
				d.Arestas = append(d.Arestas, DiagramaAresta{De: a.De, Para: a.Para, Rotulo: a.Rotulo, Estilo: estilo})
			}
		}
	case "sequencia":
		for _, field := range []struct {
			name string
			set  bool
		}{{"grupos", len(s.Grupos) > 0}, {"nos", len(s.Nos) > 0}, {"passos", len(s.Passos) > 0}, {"estados", len(s.Estados) > 0},
			{"arestas", len(s.Arestas) > 0}, {"transicoes", len(s.Transicoes) > 0}, {"inicial", s.Inicial != ""}, {"finais", len(s.Finais) > 0}} {
			v.forbid(s.Tipo, field.name, field.set)
		}
		if len(s.Participantes) < 2 {
			v.fail("sequencia precisa de pelo menos 2 participantes")
		}
		if len(s.Participantes) > diagramaParticipMax {
			v.fail("%d participantes (máximo %d): divida o diagrama", len(s.Participantes), diagramaParticipMax)
		}
		if len(s.Mensagens) == 0 {
			v.fail("sequencia precisa de pelo menos 1 mensagem")
		}
		if len(s.Mensagens) > diagramaMensagensMax {
			v.fail("%d mensagens (máximo %d): divida o diagrama", len(s.Mensagens), diagramaMensagensMax)
		}
		ids := map[string]bool{}
		for i, p := range s.Participantes {
			v.id(fmt.Sprintf("participantes[%d]", i), p.ID, ids)
			v.rotulo(fmt.Sprintf("participante %q", p.ID), p.Rotulo)
			v.papel(p.ID, p.Papel)
			href := v.conceito(p.ID, p.Conceito, conceitos)
			d.Participantes = append(d.Participantes, DiagramaParticipante{ID: p.ID, Rotulo: p.Rotulo, Papel: p.Papel, Conceito: p.Conceito, Href: href})
		}
		for i, m := range s.Mensagens {
			v.ref(fmt.Sprintf("mensagens[%d].de", i), m.De, ids)
			v.ref(fmt.Sprintf("mensagens[%d].para", i), m.Para, ids)
			v.rotulo(fmt.Sprintf("mensagens[%d]", i), m.Rotulo)
			if !diagramaMensagemTipos[m.Tipo] {
				v.fail("mensagens[%d]: tipo %q inválido (sync, async ou reply)", i, m.Tipo)
			}
			if n := utf8.RuneCountInString(m.Nota); n > diagramaNotaMax {
				v.fail("mensagens[%d]: nota com %d caracteres (máximo %d)", i, n, diagramaNotaMax)
			}
			tipo := m.Tipo
			if tipo == "" {
				tipo = "sync"
			}
			d.Mensagens = append(d.Mensagens, DiagramaMensagem{De: m.De, Para: m.Para, Rotulo: m.Rotulo, Tipo: tipo, Nota: m.Nota})
		}
	}

	if err := v.err(); err != nil {
		return Diagrama{}, err
	}
	return d, nil
}

// diagramaValidator accumulates every problem in a spec, so the author fixes
// them in one pass instead of one build per error.
type diagramaValidator struct{ problems []string }

func (v *diagramaValidator) fail(format string, args ...any) {
	v.problems = append(v.problems, fmt.Sprintf(format, args...))
}

func (v *diagramaValidator) err() error {
	if len(v.problems) == 0 {
		return nil
	}
	return fmt.Errorf("%s", strings.Join(v.problems, "; "))
}

func (v *diagramaValidator) forbid(tipo, field string, present bool) {
	if present {
		v.fail("campo %q não se aplica ao tipo %s", field, tipo)
	}
}

func (v *diagramaValidator) id(where, id string, seen map[string]bool) {
	if !diagramaIDRe.MatchString(id) {
		v.fail("%s: id %q precisa ser kebab-case", where, id)
	}
	if seen[id] {
		v.fail("%s: id %q duplicado", where, id)
	}
	seen[id] = true
}

func (v *diagramaValidator) ref(where, id string, ids map[string]bool) {
	if !ids[id] {
		v.fail("%s: %q não existe no diagrama", where, id)
	}
}

func (v *diagramaValidator) rotulo(where, s string) {
	if strings.TrimSpace(s) == "" {
		v.fail("%s: rotulo vazio", where)
		return
	}
	if n := utf8.RuneCountInString(s); n > diagramaRotuloMax {
		v.fail("%s: rotulo %q com %d caracteres (máximo %d)", where, s, n, diagramaRotuloMax)
	}
}

func (v *diagramaValidator) papel(where, papel string) {
	if !diagramaPapeis[papel] {
		v.fail("%s: papel %q inválido (destaque, externo ou fora-da-transacao)", where, papel)
	}
}

// conceito validates a concept id against conceitos.yaml and returns the
// owner milestone's route. With no registry (an invalid conceitos.yaml,
// already reported elsewhere), concept references are left unlinked.
func (v *diagramaValidator) conceito(where, id string, set *conceitoSet) string {
	if id == "" || set == nil {
		return ""
	}
	for _, c := range set.conceitos {
		if c.ID == id {
			return c.dono.href()
		}
	}
	v.fail("%s: conceito %q não existe em conceitos.yaml", where, id)
	return ""
}

// grid validates groups and nodes laid out on the author's grid (D5 3, 5).
func (v *diagramaValidator) grid(grupos []diagramaGrupo, nos []diagramaNo, field string, conceitos *conceitoSet) ([]DiagramaGrupo, []DiagramaNo) {
	if len(nos) == 0 {
		v.fail("%s: nenhum elemento declarado", field)
	}
	if len(nos) > diagramaNosMax {
		v.fail("%s: %d elementos (máximo %d): divida o diagrama", field, len(nos), diagramaNosMax)
	}
	groupIDs := map[string]bool{}
	byGroup := map[string]DiagramaGrupo{}
	var gs []DiagramaGrupo
	for i, g := range grupos {
		v.id(fmt.Sprintf("grupos[%d]", i), g.ID, groupIDs)
		v.rotulo(fmt.Sprintf("grupo %q", g.ID), g.Rotulo)
		if g.Cols == 0 {
			g.Cols = 1
		}
		if g.Rows == 0 {
			g.Rows = 1
		}
		if g.Col < 0 || g.Row < 0 || g.Cols < 1 || g.Rows < 1 {
			v.fail("grupo %q: posição ou tamanho negativo", g.ID)
		}
		if g.Col+g.Cols > diagramaGridColunasMax {
			v.fail("grupo %q passa da coluna %d (máximo %d colunas)", g.ID, g.Col+g.Cols-1, diagramaGridColunasMax)
		}
		dg := DiagramaGrupo{ID: g.ID, Rotulo: g.Rotulo, Col: g.Col, Row: g.Row, Cols: g.Cols, Rows: g.Rows}
		byGroup[g.ID] = dg
		gs = append(gs, dg)
	}
	ids := map[string]bool{}
	cells := map[[2]int]string{}
	var out []DiagramaNo
	for i, n := range nos {
		v.id(fmt.Sprintf("%s[%d]", field, i), n.ID, ids)
		v.rotulo(fmt.Sprintf("%q", n.ID), n.Rotulo)
		v.papel(n.ID, n.Papel)
		if n.Col < 0 || n.Row < 0 {
			v.fail("%q: posição negativa", n.ID)
		}
		if n.Col >= diagramaGridColunasMax {
			v.fail("%q: coluna %d (máximo %d colunas)", n.ID, n.Col, diagramaGridColunasMax)
		}
		cell := [2]int{n.Col, n.Row}
		if other, taken := cells[cell]; taken {
			v.fail("%q e %q ocupam a mesma célula (col %d, row %d)", other, n.ID, n.Col, n.Row)
		}
		cells[cell] = n.ID
		if n.Grupo != "" {
			g, ok := byGroup[n.Grupo]
			if !ok {
				v.fail("%q: grupo %q não existe", n.ID, n.Grupo)
			} else if n.Col < g.Col || n.Col >= g.Col+g.Cols || n.Row < g.Row || n.Row >= g.Row+g.Rows {
				v.fail("%q está fora da área do grupo %q", n.ID, n.Grupo)
			}
		}
		href := v.conceito(fmt.Sprintf("%q", n.ID), n.Conceito, conceitos)
		out = append(out, DiagramaNo{ID: n.ID, Rotulo: n.Rotulo, Col: n.Col, Row: n.Row, Papel: n.Papel, Conceito: n.Conceito, Href: href})
	}
	for id := range ids {
		if groupIDs[id] {
			v.fail("id %q usado por um grupo e por um elemento", id)
		}
	}
	return gs, out
}

// expandDiagramas replaces each sanitized ```diagrama block in one HTML
// fragment with its <figure> (D3): title and the full textual description,
// readable without JavaScript. A block may list two ids, one per line, for
// a side-by-side comparison. Unknown ids are returned as errors (D5 7);
// used collects every id referenced, for the unreferenced-file warning.
func expandDiagramas(fragment, slug string, diagramas map[string]Diagrama, used map[string]bool) (string, []string) {
	var missing []string
	out := diagramaBlockRe.ReplaceAllStringFunc(fragment, func(block string) string {
		body := html.UnescapeString(diagramaBlockRe.FindStringSubmatch(block)[1])
		var ids []string
		for _, id := range strings.Split(body, ",") {
			if id = strings.TrimSpace(id); id != "" {
				ids = append(ids, id)
			}
		}
		if len(ids) == 0 || len(ids) > 2 {
			missing = append(missing, fmt.Sprintf("bloco diagrama com %d ids (use 1, ou 2 lado a lado)", len(ids)))
			return block
		}
		var figs []string
		for _, id := range ids {
			d, ok := diagramas[id]
			if !ok {
				missing = append(missing, fmt.Sprintf("diagrama %q não existe em diagramas/", id))
				return block
			}
			used[id] = true
			figs = append(figs, figureHTML(slug, d))
		}
		if len(figs) == 1 {
			return figs[0]
		}
		return `<div class="diagramas-lado-a-lado">` + strings.Join(figs, "") + `</div>`
	})
	if out == fragment {
		return fragment, missing
	}
	// The replacement is built from escaped text only; sanitizing again keeps
	// the guarantee that every byte of a milestone went through bodyPolicy.
	return bodyPolicy.Sanitize(out), missing
}

// markDiagramaFences turns each ```diagrama fence of a markdown body into a
// marker paragraph, "⟦diagrama:id⟧" (or "⟦diagrama:a,b⟧" side by side),
// that expandDiagramas replaces after rendering. Bodies without diagrams are
// returned unchanged.
func markDiagramaFences(body []byte) []byte {
	return diagramaFenceRe.ReplaceAllFunc(body, func(fence []byte) []byte {
		lines := strings.Split(string(diagramaFenceRe.FindSubmatch(fence)[1]), "\n")
		var ids []string
		for _, l := range lines {
			if l = strings.TrimSpace(l); l != "" {
				ids = append(ids, l)
			}
		}
		return []byte("⟦diagrama:" + strings.Join(ids, ",") + "⟧")
	})
}

func figureHTML(slug string, d Diagrama) string {
	return `<figure class="diagrama" data-diagrama="` + slug + "/" + d.ID + `">` +
		`<figcaption>` + html.EscapeString(d.Titulo) + `</figcaption>` +
		`<details class="diagrama-descricao"><summary>Descrição textual</summary><p>` +
		html.EscapeString(d.Descricao) + `</p></details></figure>`
}

// applyDiagramas expands diagrams in every rendered fragment of a milestone:
// the deprecated html fallback, prose sections, hands-on intros and blocks.
func applyDiagramas(htmlBody *string, sections []Section, slug string, diagramas map[string]Diagrama, used map[string]bool) []string {
	var missing []string
	apply := func(s *string) {
		var m []string
		*s, m = expandDiagramas(*s, slug, diagramas, used)
		missing = append(missing, m...)
	}
	apply(htmlBody)
	for i := range sections {
		apply(&sections[i].HTML)
		apply(&sections[i].Intro)
		for j := range sections[i].Blocks {
			apply(&sections[i].Blocks[j].HTML)
		}
	}
	// The fallback and the sections render the same body: report each
	// missing id once.
	sort.Strings(missing)
	var uniq []string
	for i, m := range missing {
		if i == 0 || m != missing[i-1] {
			uniq = append(uniq, m)
		}
	}
	return uniq
}

// warnASCIIDiagrams logs fenced blocks that look like hand-drawn ASCII
// diagrams (section 5: new ASCII diagrams are not allowed; a warning, not an
// error, until every track is converted).
func warnASCIIDiagrams(body []byte, where string) int {
	n := 0
	for _, m := range fencedRe.FindAllSubmatch(body, -1) {
		if string(m[1]) == "diagrama" {
			continue
		}
		if asciiDiagramRe.Match(m[2]) {
			n++
		}
	}
	if n > 0 {
		log.Printf("WARN %s: %d diagrama(s) ASCII — converta para um bloco ```diagrama", where, n)
	}
	return n
}

// Ilustrações (D8): local, authored images under the course's assets/.

const assetMaxBytes = 200 * 1024

var (
	markdownImageRe = regexp.MustCompile(`!\[([^\]]*)\]\(([^)\s]+)\)`)
	assetExtOK      = map[string]bool{".svg": true, ".png": true, ".webp": true}
	assetSrcRe      = regexp.MustCompile(`src="assets/`)
)

// validateAssets checks every image reference in a milestone body: only
// local files under assets/, with a non-empty alt, an allowed extension and
// at most 200 KB. Returns the referenced asset file names.
func validateAssets(body []byte, courseDir string) ([]string, error) {
	var names []string
	var problems []string
	for _, m := range markdownImageRe.FindAllSubmatch(body, -1) {
		alt, src := strings.TrimSpace(string(m[1])), string(m[2])
		if !strings.HasPrefix(src, "assets/") || strings.Contains(src, "..") || strings.Count(src, "/") != 1 {
			problems = append(problems, fmt.Sprintf("imagem %q: só arquivos locais em assets/ (sem hotlink nem subpasta)", src))
			continue
		}
		if alt == "" {
			problems = append(problems, fmt.Sprintf("imagem %q sem texto alternativo", src))
		}
		name := strings.TrimPrefix(src, "assets/")
		if !assetExtOK[strings.ToLower(filepath.Ext(name))] {
			problems = append(problems, fmt.Sprintf("imagem %q: extensão não permitida (svg, png ou webp)", src))
			continue
		}
		info, err := os.Stat(filepath.Join(courseDir, "assets", name))
		if err != nil {
			problems = append(problems, fmt.Sprintf("imagem %q não existe", src))
			continue
		}
		if info.Size() > assetMaxBytes {
			problems = append(problems, fmt.Sprintf("imagem %q tem %d KB (máximo %d KB)", src, info.Size()/1024, assetMaxBytes/1024))
		}
		names = append(names, name)
	}
	if len(problems) > 0 {
		return nil, fmt.Errorf("%s", strings.Join(problems, "; "))
	}
	return names, nil
}

// rewriteAssetSrc points relative assets/ sources at the copy under
// data/assets/<slug>/, relative to index.html.
func rewriteAssetSrc(fragment, slug string) string {
	return assetSrcRe.ReplaceAllString(fragment, `src="data/assets/`+slug+`/`)
}

// copyAssets copies a course's referenced assets to dataDir/assets/<slug>/.
func copyAssets(courseDir, slug, dataDir string, names []string) error {
	if len(names) == 0 {
		return nil
	}
	dst := filepath.Join(dataDir, "assets", slug)
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(courseDir, "assets", name))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dst, name), data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// writeDiagramas writes data/diagramas/<slug>.json for a course with at
// least one diagram.
func writeDiagramas(dataDir, slug string, diagramas map[string]Diagrama) error {
	if len(diagramas) == 0 {
		return nil
	}
	dir := filepath.Join(dataDir, "diagramas")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, slug+".json"), DiagramasFile{Slug: slug, Diagramas: diagramas})
}
