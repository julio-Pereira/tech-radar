package course

import (
	"fmt"
	"html"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

// Walkthroughs por eventos (PLANO Fase 1.7). A walkthrough is a YAML file
// under content/courses/<trilha>/walkthroughs/<id>.yaml — the same layout as
// diagramas/ — referenced from a milestone by a fenced block of language
// "walkthrough". It does not draw a layout of its own: each layer (camada)
// points to a typed topologia diagram, and each event lights an edge of the
// diagram of its step's layer, like a fluxo of Fase 1.6. The compiler
// validates every reference (rules of section 4), derives the sequence view
// from the same data (section 3.4), and writes the full textual description
// inside the milestone, readable without JavaScript.

const (
	wtEtapasMax       = 8
	wtEventosEtapaMax = 6
	wtEventosMax      = 30
	wtCamadasMax      = 3
	wtProfundidadeMax = 2
	wtPaineisMax      = 4
	wtPainelLinhasMax = 40
	wtPainelTituloMax = 56
	wtMsgMax          = 110
	wtAnotacaoMax     = 60
	wtTextoPalavras   = 120
	wtResumoMax       = 200
	wtSemResposta     = "sem resposta"
	// The sequence renderer draws at most 6 columns, the most that stays
	// legible at 360px. With up to 6 actors, every step's sequence shows all
	// of them, in the declared order, so columns never move between steps;
	// with more, each step shows only the actors it uses, in the declared
	// order, and says how many it left out.
	wtSequenciaColunasMax = diagramaParticipMax
)

var (
	walkthroughFenceRe         = regexp.MustCompile("(?m)^```walkthrough[ \t]*\n((?:.*\n)*?)```[ \t]*$")
	walkthroughBlockRe         = regexp.MustCompile(`<p>⟦walkthrough:([^⟧<]*)⟧</p>`)
	walkthroughFenceIndentedRe = regexp.MustCompile("(?m)^(?:[ \t]|>|[*+-][ \t]|\\d+[.)][ \t])[ \t>*+\\-]*```walkthrough")
	wtLinhasRe                 = regexp.MustCompile(`^([1-9][0-9]*)(?:-([1-9][0-9]*))?$`)
	wtLinguagens               = map[string]bool{"yaml": true, "bash": true, "texto": true, "json": true, "go": true, "java": true, "log": true, "sql": true}
)

// Source schema (YAML).

type wtAtorSpec struct {
	ID     string `yaml:"id"`
	Rotulo string `yaml:"rotulo"`
}

type wtCamadaSpec struct {
	ID       string `yaml:"id"`
	Rotulo   string `yaml:"rotulo"`
	Diagrama string `yaml:"diagrama"`
	Pai      string `yaml:"pai"`
}

type wtPainelSpec struct {
	ID        string `yaml:"id"`
	Linguagem string `yaml:"linguagem"`
	Titulo    string `yaml:"titulo"`
	Conteudo  string `yaml:"conteudo"`
	Nota      string `yaml:"nota"`
}

type wtPainelRefSpec struct {
	ID     string `yaml:"id"`
	Linhas string `yaml:"linhas"`
}

type wtEventoSpec struct {
	De       string            `yaml:"de"`
	Para     string            `yaml:"para"`
	Msg      string            `yaml:"msg"`
	Tipo     string            `yaml:"tipo"`
	Anotacao string            `yaml:"anotacao"`
	Estados  map[string]string `yaml:"estados"`
	Painel   *wtPainelRefSpec  `yaml:"painel"`
}

type wtEtapaSpec struct {
	ID        string         `yaml:"id"`
	Titulo    string         `yaml:"titulo"`
	Subtitulo string         `yaml:"subtitulo"`
	Camada    string         `yaml:"camada"`
	Texto     string         `yaml:"texto"`
	Eventos   []wtEventoSpec `yaml:"eventos"`
}

type walkthroughSpec struct {
	ID      string         `yaml:"id"`
	Titulo  string         `yaml:"titulo"`
	Resumo  string         `yaml:"resumo"`
	Atores  []wtAtorSpec   `yaml:"atores"`
	Camadas []wtCamadaSpec `yaml:"camadas"`
	Paineis []wtPainelSpec `yaml:"paineis"`
	Etapas  []wtEtapaSpec  `yaml:"etapas"`
}

// Compiled schema (JSON), written to data/walkthroughs/<slug>.json.

type WalkthroughAtor struct {
	ID     string `json:"id"`
	Rotulo string `json:"rotulo"`
	// Icone comes from the actor's node in the layer diagrams (Fase 1.8):
	// one source, no field in the walkthrough.
	Icone string `json:"icone,omitempty"`
	Forma string `json:"forma,omitempty"`
}

type WalkthroughCamada struct {
	ID       string `json:"id"`
	Rotulo   string `json:"rotulo"`
	Diagrama string `json:"diagrama"`
	// Trilha is the breadcrumb, root first, ending at this layer.
	Trilha []string `json:"trilha"`
}

type WalkthroughPainel struct {
	ID        string   `json:"id"`
	Linguagem string   `json:"linguagem"`
	Titulo    string   `json:"titulo"`
	Nota      string   `json:"nota,omitempty"`
	Linhas    []string `json:"linhas"`
}

type WalkthroughPainelRef struct {
	ID  string `json:"id"`
	De  int    `json:"de"`
	Ate int    `json:"ate"`
}

type WalkthroughEvento struct {
	N    int    `json:"n"`
	De   string `json:"de"`
	Para string `json:"para"`
	// Tipo is "timeout" for a request that got no answer (the player draws
	// no packet and says "sem resposta"); the other types matter only to
	// the derived sequence, which carries them itself.
	Tipo     string `json:"tipo,omitempty"`
	Msg      string `json:"msg"`
	Anotacao string `json:"anotacao,omitempty"`
	// Estados is cumulative over the whole walkthrough, like the steps of
	// Fase 1.6: jumping to an event never replays the ones before it.
	Estados map[string]string     `json:"estados,omitempty"`
	Painel  *WalkthroughPainelRef `json:"painel,omitempty"`
}

type WalkthroughEtapa struct {
	ID        string              `json:"id"`
	Titulo    string              `json:"titulo"`
	Subtitulo string              `json:"subtitulo,omitempty"`
	Camada    string              `json:"camada"`
	HTML      string              `json:"html"`
	Eventos   []WalkthroughEvento `json:"eventos"`
	// Sequencia is derived, never written by hand (section 3.4).
	Sequencia Diagrama `json:"sequencia"`
	Omitidos  int      `json:"omitidos,omitempty"`
}

type Walkthrough struct {
	ID      string              `json:"id"`
	Titulo  string              `json:"titulo"`
	Resumo  string              `json:"resumo"`
	Atores  []WalkthroughAtor   `json:"atores"`
	Camadas []WalkthroughCamada `json:"camadas"`
	Paineis []WalkthroughPainel `json:"paineis,omitempty"`
	Etapas  []WalkthroughEtapa  `json:"etapas"`
	Total   int                 `json:"total"`
	// Legenda lists the packet types this walkthrough uses, in a fixed
	// order (Fase 1.8, §4.1): the player shows only these, without scanning
	// the events.
	Legenda []string `json:"legenda"`
}

// WalkthroughsFile is data/walkthroughs/<slug>.json.
type WalkthroughsFile struct {
	Slug         string                 `json:"slug"`
	Walkthroughs map[string]Walkthrough `json:"walkthroughs"`
}

// loadWalkthroughs reads and validates every walkthrough of one course
// against the course's compiled diagrams. A missing walkthroughs/ directory
// is a valid, empty set.
func loadWalkthroughs(courseDir string, diagramas map[string]Diagrama) (map[string]Walkthrough, error) {
	dir := filepath.Join(courseDir, "walkthroughs")
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return map[string]Walkthrough{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read walkthroughs dir %s: %w", dir, err)
	}
	out := map[string]Walkthrough{}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".yaml" {
			continue
		}
		path := filepath.Join(dir, e.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read walkthrough %s: %w", path, err)
		}
		w, err := parseWalkthrough(data, strings.TrimSuffix(e.Name(), ".yaml"), diagramas)
		if err != nil {
			return nil, fmt.Errorf("walkthrough %s: %w", path, err)
		}
		out[w.ID] = w
	}
	return out, nil
}

// parseWalkthrough decodes and validates one walkthrough. fileID is the file
// name without extension, which must equal the spec's id. Every problem is
// reported in one pass, like parseDiagrama.
func parseWalkthrough(data []byte, fileID string, diagramas map[string]Diagrama) (Walkthrough, error) {
	var s walkthroughSpec
	dec := yaml.NewDecoder(strings.NewReader(string(data)))
	dec.KnownFields(true)
	if err := dec.Decode(&s); err != nil {
		return Walkthrough{}, fmt.Errorf("yaml inválido: %w", err)
	}
	v := diagramaValidator{}

	if !diagramaIDRe.MatchString(s.ID) {
		v.fail("id %q precisa ser kebab-case", s.ID)
	}
	if s.ID != fileID {
		v.fail("id %q diferente do nome do arquivo %q", s.ID, fileID)
	}
	v.texto("titulo", s.Titulo, diagramaTituloMax, true)
	v.texto("resumo", s.Resumo, wtResumoMax, true)
	w := Walkthrough{ID: s.ID, Titulo: strings.TrimSpace(s.Titulo), Resumo: strings.Join(strings.Fields(s.Resumo), " ")}

	// Rule 1: unique ids. Actors, layers, panels and steps each have their
	// own namespace.
	atores := map[string]bool{}
	if len(s.Atores) < 2 {
		v.fail("atores: declare pelo menos 2")
	}
	for i, a := range s.Atores {
		v.id(fmt.Sprintf("atores[%d]", i), a.ID, atores)
		v.rotulo(fmt.Sprintf("ator %q", a.ID), a.Rotulo)
		w.Atores = append(w.Atores, WalkthroughAtor{ID: a.ID, Rotulo: a.Rotulo})
	}

	// Rules 2 and 5, and the layer limits.
	camadas := map[string]wtCamadaSpec{}
	if len(s.Camadas) == 0 {
		v.fail("camadas: declare pelo menos 1")
	}
	if len(s.Camadas) > wtCamadasMax {
		v.fail("camadas: %d (máximo %d): divida o walkthrough", len(s.Camadas), wtCamadasMax)
	}
	seenCamada := map[string]bool{}
	for i, c := range s.Camadas {
		v.id(fmt.Sprintf("camadas[%d]", i), c.ID, seenCamada)
		v.rotulo(fmt.Sprintf("camada %q", c.ID), c.Rotulo)
		camadas[c.ID] = c
	}
	for _, c := range s.Camadas {
		trilha, ok := v.trilhaCamada(c, camadas)
		if ok && len(trilha) > wtProfundidadeMax {
			v.fail("camada %q: profundidade %d (máximo %d)", c.ID, len(trilha), wtProfundidadeMax)
		}
		d, exists := diagramas[c.Diagrama]
		switch {
		case c.Diagrama == "":
			v.fail("camada %q: diagrama é obrigatório", c.ID)
		case !exists:
			v.fail("camada %q: diagrama %q não existe em diagramas/", c.ID, c.Diagrama)
		case d.Tipo != "topologia":
			v.fail("camada %q: diagrama %q é do tipo %s (precisa ser topologia)", c.ID, c.Diagrama, d.Tipo)
		}
		w.Camadas = append(w.Camadas, WalkthroughCamada{ID: c.ID, Rotulo: c.Rotulo, Diagrama: c.Diagrama, Trilha: trilha})
	}
	v.iconesDosAtores(&w, s.Camadas, diagramas)

	// Panels and their limits.
	paineis := map[string]int{} // id → number of lines
	if len(s.Paineis) > wtPaineisMax {
		v.fail("paineis: %d (máximo %d)", len(s.Paineis), wtPaineisMax)
	}
	seenPainel := map[string]bool{}
	for i, p := range s.Paineis {
		v.id(fmt.Sprintf("paineis[%d]", i), p.ID, seenPainel)
		v.texto(fmt.Sprintf("painel %q: titulo", p.ID), p.Titulo, wtPainelTituloMax, true)
		v.texto(fmt.Sprintf("painel %q: nota", p.ID), p.Nota, wtAnotacaoMax, false)
		if !wtLinguagens[p.Linguagem] {
			v.fail("painel %q: linguagem %q inválida (yaml, bash, texto, json, go, java, log ou sql)", p.ID, p.Linguagem)
		}
		var linhas []string
		if strings.TrimSpace(p.Conteudo) == "" {
			v.fail("painel %q: conteudo vazio", p.ID)
		} else {
			linhas = strings.Split(strings.TrimRight(p.Conteudo, "\n"), "\n")
		}
		if len(linhas) > wtPainelLinhasMax {
			v.fail("painel %q: %d linhas (máximo %d)", p.ID, len(linhas), wtPainelLinhasMax)
		}
		paineis[p.ID] = len(linhas)
		w.Paineis = append(w.Paineis, WalkthroughPainel{ID: p.ID, Linguagem: p.Linguagem, Titulo: strings.TrimSpace(p.Titulo), Nota: strings.TrimSpace(p.Nota), Linhas: linhas})
	}

	// Steps and events.
	if len(s.Etapas) == 0 || len(s.Etapas) > wtEtapasMax {
		v.fail("etapas: %d (de 1 a %d)", len(s.Etapas), wtEtapasMax)
	}
	total := 0
	for _, e := range s.Etapas {
		total += len(e.Eventos)
	}
	if total > wtEventosMax {
		v.fail("%d eventos no total (máximo %d): divida o walkthrough", total, wtEventosMax)
	}
	seenEtapa := map[string]bool{}
	estados := map[string]string{}
	// Requests made so far (de>para, sync or async): a timeout waits for one.
	pedidos := map[string]bool{}
	n := 0
	for i, e := range s.Etapas {
		where := fmt.Sprintf("etapas[%d]", i)
		v.id(where, e.ID, seenEtapa)
		v.texto(where+": titulo", e.Titulo, diagramaTituloMax, true)
		v.texto(where+": subtitulo", e.Subtitulo, diagramaTituloMax, false)
		if p := len(strings.Fields(e.Texto)); p > wtTextoPalavras {
			v.fail("%s: texto com %d palavras (máximo %d)", where, p, wtTextoPalavras)
		} else if p == 0 {
			v.fail("%s: texto é obrigatório", where)
		}
		if len(e.Eventos) == 0 || len(e.Eventos) > wtEventosEtapaMax {
			v.fail("%s: %d eventos (de 1 a %d)", where, len(e.Eventos), wtEventosEtapaMax)
		}
		et := WalkthroughEtapa{ID: e.ID, Titulo: strings.TrimSpace(e.Titulo), Subtitulo: strings.TrimSpace(e.Subtitulo), Camada: e.Camada}
		if texto, err := renderMarkdown([]byte(e.Texto)); err != nil {
			v.fail("%s: texto: %v", where, err)
		} else {
			et.HTML = texto
		}

		c, camadaOK := camadas[e.Camada]
		if !camadaOK {
			v.fail("%s: camada %q não existe", where, e.Camada)
		}
		d := diagramas[c.Diagrama]
		nos := map[string]bool{}
		for _, no := range d.Nos {
			nos[no.ID] = true
		}
		arestas := map[string]bool{}
		for _, a := range d.Arestas {
			arestas[a.De+">"+a.Para] = true
		}
		usable := camadaOK && d.Tipo == "topologia"
		// Rule 2: every actor this step uses is a node of its layer's diagram.
		needNode := func(what, id string) {
			if usable && atores[id] && !nos[id] {
				v.fail("%s: ator %q não é nó do diagrama %q da camada %q", what, id, c.Diagrama, c.ID)
			}
		}

		for j, ev := range e.Eventos {
			n++
			what := fmt.Sprintf("%s.eventos[%d] (evento %d)", where, j, n)
			v.ref(what+".de", ev.De, atores)
			v.ref(what+".para", ev.Para, atores)
			// Rule 4.
			if ev.De == ev.Para {
				v.fail("%s: de e para são o mesmo ator %q", what, ev.De)
			}
			needNode(what+".de", ev.De)
			needNode(what+".para", ev.Para)
			// Rule 3: the edge exists in this layer's diagram, same direction.
			if usable && nos[ev.De] && nos[ev.Para] && ev.De != ev.Para && !arestas[ev.De+">"+ev.Para] {
				v.fail("%s: não há aresta %s→%s no diagrama %q, nesse sentido (sentidos opostos são duas arestas)", what, ev.De, ev.Para, c.Diagrama)
			}
			// Rule 7: sizes.
			v.texto(what+": msg", ev.Msg, wtMsgMax, true)
			v.texto(what+": anotacao", ev.Anotacao, wtAnotacaoMax, false)
			// A timeout is who waited and got nothing: de asked para earlier,
			// and no answer came. Never a reply drawn for an absence.
			switch ev.Tipo {
			case "timeout":
				if !pedidos[ev.De+">"+ev.Para] {
					v.fail("%s: timeout sem um pedido anterior %s→%s (sync ou async): só se espera por algo que foi pedido", what, ev.De, ev.Para)
				}
			case "", "sync", "async":
				pedidos[ev.De+">"+ev.Para] = true
			case "reply":
			default:
				v.fail("%s: tipo %q inválido (sync, async, reply ou timeout)", what, ev.Tipo)
			}
			// Rule 8: states, with the values and the cumulative semantics
			// of Fase 1.6.
			for id, st := range ev.Estados {
				if !atores[id] {
					v.fail("%s.estados: %q não é um ator", what, id)
				}
				needNode(what+".estados", id)
				if !animacaoEstados[st] {
					v.fail("%s.estados: %q inválido (ativo, novo, saindo, removido, falha, inativo ou destaque)", what, st)
				}
				estados[id] = st
			}
			out := WalkthroughEvento{N: n, De: ev.De, Para: ev.Para, Tipo: wtTipoPublico(ev.Tipo), Msg: strings.TrimSpace(ev.Msg), Anotacao: strings.TrimSpace(ev.Anotacao), Estados: copyMap(estados)}
			// Rule 6: panel lines.
			if ev.Painel != nil {
				lines, ok := paineis[ev.Painel.ID]
				if !ok {
					v.fail("%s.painel: %q não existe", what, ev.Painel.ID)
				} else if de, ate, ok := v.linhas(what+".painel", ev.Painel.Linhas, lines); ok {
					out.Painel = &WalkthroughPainelRef{ID: ev.Painel.ID, De: de, Ate: ate}
				}
			}
			et.Eventos = append(et.Eventos, out)
		}
		if len(v.problems) == 0 {
			et.Sequencia, et.Omitidos = derivarSequencia(w, et, e, d)
			if len(et.Sequencia.Participantes) > wtSequenciaColunasMax {
				v.fail("%s: a visão de sequência teria %d atores (máximo %d): divida a etapa", where, len(et.Sequencia.Participantes), wtSequenciaColunasMax)
			}
		}
		w.Etapas = append(w.Etapas, et)
	}
	w.Total = n
	w.Legenda = wtLegenda(w.Etapas)

	if err := v.err(); err != nil {
		return Walkthrough{}, err
	}
	return w, nil
}

// wtTipoPublico keeps in the compiled event only the type the player needs.
// wtLegenda returns the event types used, in the order sync, async, reply,
// timeout. An event with no type is a sync request, as in the sequence.
func wtLegenda(etapas []WalkthroughEtapa) []string {
	usados := map[string]bool{}
	for _, et := range etapas {
		for _, m := range et.Sequencia.Mensagens {
			usados[m.Tipo] = true
		}
	}
	out := []string{}
	for _, t := range []string{"sync", "async", "reply", "timeout"} {
		if usados[t] {
			out = append(out, t)
		}
	}
	return out
}

func wtTipoPublico(tipo string) string {
	if tipo == "timeout" {
		return tipo
	}
	return ""
}

// iconesDosAtores gives each actor the icon of its node in the layer
// diagrams. An actor drawn with different icons in two layers is an error:
// the reader would see one component change kind between zoom levels. A
// layer where the node has no icon does not count (gradual retrofit).
func (v *diagramaValidator) iconesDosAtores(w *Walkthrough, camadas []wtCamadaSpec, diagramas map[string]Diagrama) {
	type origem struct{ icone, forma, camada string }
	por := map[string]origem{}
	for _, c := range camadas {
		d, ok := diagramas[c.Diagrama]
		if !ok || d.Tipo != "topologia" {
			continue
		}
		for _, n := range d.Nos {
			if n.Icone == "" {
				continue
			}
			if o, seen := por[n.ID]; !seen {
				por[n.ID] = origem{n.Icone, n.Forma, c.ID}
			} else if o.icone != n.Icone {
				v.fail("ator %q: icone %q na camada %q e %q na camada %q (um componente não muda de tipo entre camadas)", n.ID, o.icone, o.camada, n.Icone, c.ID)
			}
		}
	}
	for i, a := range w.Atores {
		if o, ok := por[a.ID]; ok {
			w.Atores[i].Icone, w.Atores[i].Forma = o.icone, o.forma
		}
	}
}

// trilhaCamada returns the breadcrumb of a layer, root first (rule 5: the
// parent exists and there is no cycle).
func (v *diagramaValidator) trilhaCamada(c wtCamadaSpec, camadas map[string]wtCamadaSpec) ([]string, bool) {
	trilha := []string{c.ID}
	seen := map[string]bool{c.ID: true}
	for cur := c; cur.Pai != ""; {
		p, ok := camadas[cur.Pai]
		if !ok {
			v.fail("camada %q: pai %q não existe", cur.ID, cur.Pai)
			return trilha, false
		}
		if seen[p.ID] {
			v.fail("camada %q: ciclo em pai (%s → %s)", c.ID, strings.Join(trilha, " → "), p.ID)
			return trilha, false
		}
		seen[p.ID] = true
		trilha = append([]string{p.ID}, trilha...)
		cur = p
	}
	return trilha, true
}

// linhas parses "N" or "N-M" (N ≤ M) inside a panel of `total` lines.
func (v *diagramaValidator) linhas(where, spec string, total int) (int, int, bool) {
	m := wtLinhasRe.FindStringSubmatch(strings.TrimSpace(spec))
	if m == nil {
		v.fail("%s: linhas %q fora do formato N ou N-M", where, spec)
		return 0, 0, false
	}
	de, _ := strconv.Atoi(m[1])
	ate := de
	if m[2] != "" {
		ate, _ = strconv.Atoi(m[2])
	}
	if de > ate {
		v.fail("%s: linhas %q com início depois do fim", where, spec)
		return 0, 0, false
	}
	if ate > total {
		v.fail("%s: linhas %q passam do fim do painel (%d linhas)", where, spec, total)
		return 0, 0, false
	}
	return de, ate, true
}

// texto checks a required (or optional) one-line text field and its size.
func (v *diagramaValidator) texto(where, s string, max int, required bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		if required {
			v.fail("%s é obrigatório", where)
		}
		return
	}
	if n := utf8.RuneCountInString(s); n > max {
		v.fail("%s com %d caracteres (máximo %d)", where, n, max)
	}
}

// derivarSequencia builds the sequencia spec of one step from the actors and
// the step's events (section 3.4): one message per event, labelled with the
// layer diagram's edge label (the same words in both views), or "evento N"
// when the edge has none. Returns the spec and how many actors it left out.
func derivarSequencia(w Walkthrough, et WalkthroughEtapa, e wtEtapaSpec, d Diagrama) (Diagrama, int) {
	usados := map[string]bool{}
	for _, ev := range et.Eventos {
		usados[ev.De], usados[ev.Para] = true, true
	}
	todos := len(w.Atores) <= wtSequenciaColunasMax
	seq := Diagrama{ID: w.ID + "-" + et.ID, Tipo: "sequencia", Titulo: et.Titulo}
	for _, a := range w.Atores {
		if todos || usados[a.ID] {
			seq.Participantes = append(seq.Participantes, DiagramaParticipante{ID: a.ID, Rotulo: a.Rotulo, Icone: a.Icone, Forma: a.Forma})
		}
	}
	rotulos := map[string]string{}
	for _, a := range d.Arestas {
		rotulos[a.De+">"+a.Para] = a.Rotulo
	}
	for j, ev := range et.Eventos {
		rotulo := rotulos[ev.De+">"+ev.Para]
		if rotulo == "" {
			rotulo = fmt.Sprintf("evento %d", ev.N)
		}
		if ev.Tipo == "timeout" {
			rotulo = wtSemResposta
		}
		tipo := e.Eventos[j].Tipo
		if tipo == "" {
			tipo = "sync"
		}
		seq.Mensagens = append(seq.Mensagens, DiagramaMensagem{De: ev.De, Para: ev.Para, Rotulo: rotulo, Tipo: tipo})
	}
	seq.Descricao = fmt.Sprintf("Etapa %q em sequência: %d eventos entre %d atores.", et.Titulo, len(seq.Mensagens), len(seq.Participantes))
	return seq, len(w.Atores) - len(seq.Participantes)
}

// markWalkthroughFences turns each ```walkthrough fence into a marker
// paragraph, "⟦walkthrough:id⟧", that expandWalkthroughs replaces after
// rendering (the same mechanism as ```diagrama).
func markWalkthroughFences(body []byte) []byte {
	return walkthroughFenceRe.ReplaceAllFunc(body, func(fence []byte) []byte {
		return []byte("⟦walkthrough:" + strings.TrimSpace(string(walkthroughFenceRe.FindSubmatch(fence)[1])) + "⟧")
	})
}

func checkWalkthroughIndent(body []byte) error {
	if walkthroughFenceIndentedRe.Match(body) {
		return fmt.Errorf("bloco ```walkthrough indentado (em lista ou citação): ele precisa começar na coluna 0")
	}
	return nil
}

// expandWalkthroughs replaces each marker in one HTML fragment with the
// walkthrough's <figure>: title, summary and the full textual description.
func expandWalkthroughs(fragment, slug string, wts map[string]Walkthrough, used map[string]bool) (string, []string) {
	var missing []string
	out := walkthroughBlockRe.ReplaceAllStringFunc(fragment, func(block string) string {
		id := strings.TrimSpace(html.UnescapeString(walkthroughBlockRe.FindStringSubmatch(block)[1]))
		w, ok := wts[id]
		if !ok {
			missing = append(missing, fmt.Sprintf("walkthrough %q não existe em walkthroughs/", id))
			return block
		}
		used[id] = true
		return walkthroughFigureHTML(slug, w)
	})
	if out == fragment {
		return fragment, missing
	}
	// Built from escaped text and already-sanitized step prose; sanitizing
	// again keeps every byte of a milestone behind bodyPolicy.
	return bodyPolicy.Sanitize(out), missing
}

// walkthroughFigureHTML is what a reader without JavaScript, a screen
// reader or a printout gets: every step, its prose and every event, in the
// order the player shows them.
func walkthroughFigureHTML(slug string, w Walkthrough) string {
	rotulo := map[string]string{}
	for _, a := range w.Atores {
		rotulo[a.ID] = a.Rotulo
	}
	var b strings.Builder
	b.WriteString(`<figure class="walkthrough" data-walkthrough="` + slug + "/" + w.ID + `">`)
	b.WriteString(`<figcaption>` + html.EscapeString(w.Titulo) + `</figcaption>`)
	b.WriteString(`<p class="walkthrough-resumo">` + html.EscapeString(w.Resumo) + `</p>`)
	b.WriteString(`<details class="walkthrough-descricao"><summary>Descrição textual</summary>`)
	b.WriteString(fmt.Sprintf(`<p>%d etapas, %d eventos.</p><ol>`, len(w.Etapas), w.Total))
	for _, et := range w.Etapas {
		b.WriteString(`<li><p><strong>` + html.EscapeString(et.Titulo) + `</strong>`)
		if et.Subtitulo != "" {
			b.WriteString(` — ` + html.EscapeString(et.Subtitulo))
		}
		b.WriteString(`</p>` + et.HTML + `<ol start="` + strconv.Itoa(et.Eventos[0].N) + `">`)
		for _, ev := range et.Eventos {
			b.WriteString(`<li>` + html.EscapeString(rotulo[ev.De]) + ` → ` + html.EscapeString(rotulo[ev.Para]))
			if ev.Tipo == "timeout" {
				b.WriteString(` (` + wtSemResposta + `)`)
			}
			b.WriteString(`: ` + html.EscapeString(ev.Msg))
			if ev.Anotacao != "" {
				b.WriteString(` (` + html.EscapeString(ev.Anotacao) + `)`)
			}
			b.WriteString(`</li>`)
		}
		b.WriteString(`</ol></li>`)
	}
	b.WriteString(`</ol></details></figure>`)
	return b.String()
}

// applyWalkthroughs expands walkthroughs in every rendered fragment of a
// milestone, like applyDiagramas; each missing id is reported once.
func applyWalkthroughs(htmlBody *string, sections []Section, slug string, wts map[string]Walkthrough, used map[string]bool) []string {
	seen := map[string]bool{}
	var missing []string
	apply := func(s *string) {
		var m []string
		*s, m = expandWalkthroughs(*s, slug, wts, used)
		for _, x := range m {
			if !seen[x] {
				seen[x] = true
				missing = append(missing, x)
			}
		}
	}
	apply(htmlBody)
	for i := range sections {
		apply(&sections[i].HTML)
		apply(&sections[i].Intro)
		for j := range sections[i].Blocks {
			apply(&sections[i].Blocks[j].HTML)
		}
	}
	return missing
}

// writeWalkthroughs writes data/walkthroughs/<slug>.json for a course with
// at least one walkthrough.
func writeWalkthroughs(dataDir, slug string, wts map[string]Walkthrough) error {
	if len(wts) == 0 {
		return nil
	}
	dir := filepath.Join(dataDir, "walkthroughs")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, slug+".json"), WalkthroughsFile{Slug: slug, Walkthroughs: wts})
}
