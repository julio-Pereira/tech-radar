package course

import (
	"bytes"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Banco de desafios (PLANO jornada de entrevistas §4-§5): recurring,
// parametric practice over what the trilhas teach. A desafio is NOT a
// milestone — it never counts towards a trilha's progress or hours — and
// lives in content/desafios/<id>.md (YAML frontmatter + markdown body).
// The format is documented in content/desafios/_schema.md.
//
// Same best-effort policy as the rest of Compile: an invalid desafio is
// logged and skipped, never fatal to the site build; TestDesafiosRealContent
// turns any such error into a CI failure.

// Desafio types.
const (
	DesafioSystemDesign   = "system-design"
	DesafioLLD            = "lld"
	TipoEstimativa        = "estimativa"
	DesafioIncidente      = "incidente"
	DesafioComportamental = "comportamental"
)

var desafioTipos = map[string]bool{
	DesafioSystemDesign: true, DesafioLLD: true, TipoEstimativa: true,
	DesafioIncidente: true, DesafioComportamental: true,
}

var desafioNiveis = map[string]bool{"senior": true, "staff": true}

var desafioIDRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// desafioPlaceholderRe matches {param} in any text field: an identifier in
// braces, so JSON or code samples ({"a": 1}) in the body never match.
var desafioPlaceholderRe = regexp.MustCompile(`\{([A-Za-z][A-Za-z0-9]*)\}`)

// Quality bars for decisões, the same limits the trilhas' quizzes follow.
const (
	desafioMaxLongestShare = 0.40
	desafioMaxIndexShare   = 0.35
	desafioDefaultTol      = 0.25
)

// DesafioParam is a parameter: a numeric range (min/max/passo) or a list of
// values (numbers or strings). Strings are for text only; formulas use
// numeric parameters.
type DesafioParam struct {
	Min     *float64 `yaml:"min" json:"min,omitempty"`
	Max     *float64 `yaml:"max" json:"max,omitempty"`
	Passo   *float64 `yaml:"passo" json:"passo,omitempty"`
	Valores []any    `yaml:"valores" json:"valores,omitempty"`
}

type DesafioEsclarecimento struct {
	Pergunta string `yaml:"pergunta" json:"pergunta"`
	Revela   string `yaml:"revela" json:"revela"`
	Chave    bool   `yaml:"chave" json:"chave"`
}

type DesafioEstimativaSpec struct {
	ID         string  `yaml:"id"`
	Enunciado  string  `yaml:"enunciado"`
	Unidade    string  `yaml:"unidade"`
	Formula    string  `yaml:"formula"`
	Tolerancia float64 `yaml:"tolerancia"`
}

type DesafioEstimativa struct {
	ID         string       `json:"id"`
	Enunciado  string       `json:"enunciado"`
	Unidade    string       `json:"unidade,omitempty"`
	Formula    string       `json:"formula"` // source, shown in the gabarito
	AST        *FormulaNode `json:"ast"`
	Tolerancia float64      `json:"tolerancia"`
}

type DesafioDecisao struct {
	Pergunta   string   `yaml:"pergunta" json:"pergunta"`
	Opcoes     []string `yaml:"opcoes" json:"opcoes"`
	Correta    int      `yaml:"correta" json:"correta"`
	Explicacao string   `yaml:"explicacao" json:"explicacao"`
}

type DesafioReviravolta struct {
	MomentoPct int      `yaml:"momentoPct" json:"momentoPct"`
	Texto      string   `yaml:"texto" json:"texto"`
	Rubrica    []string `yaml:"rubrica" json:"rubrica"`
}

type DesafioEntregavel struct {
	SecoesObrigatorias []string `yaml:"secoesObrigatorias" json:"secoesObrigatorias"`
}

// DesafioSpec is the frontmatter as authored.
type DesafioSpec struct {
	ID              string                  `yaml:"id"`
	Titulo          string                  `yaml:"titulo"`
	Tipo            string                  `yaml:"tipo"`
	Nivel           string                  `yaml:"nivel"`
	DuracaoMin      int                     `yaml:"duracaoMin"`
	Prerequisitos   []string                `yaml:"prerequisitos"`
	Conceitos       []string                `yaml:"conceitos"`
	Parametros      map[string]DesafioParam `yaml:"parametros"`
	Esclarecimentos []DesafioEsclarecimento `yaml:"esclarecimentos"`
	Estimativas     []DesafioEstimativaSpec `yaml:"estimativas"`
	Decisoes        []DesafioDecisao        `yaml:"decisoes"`
	Reviravolta     *DesafioReviravolta     `yaml:"reviravolta"`
	Entregavel      DesafioEntregavel       `yaml:"entregavel"`
	Rubrica         []string                `yaml:"rubrica"`
}

type DesafioPrerequisito struct {
	Ref            string `json:"ref"`
	Slug           string `json:"slug"`
	MarcoID        string `json:"marcoId"`
	CourseTitle    string `json:"courseTitle"`
	MilestoneTitle string `json:"milestoneTitle"`
}

type DesafioConceito struct {
	ID    string `json:"id"`
	Termo string `json:"termo"`
	Href  string `json:"href"`
}

type DesafioCodigo struct {
	Linguagem string `json:"linguagem"` // "java" | "go"
	Pasta     string `json:"pasta"`     // repo-relative, e.g. aggregator/content/desafios/<id>/go
	Comando   string `json:"comando"`   // how the reader runs the tests locally
}

// CompiledDesafio is what web/data/desafios.json carries per desafio.
type CompiledDesafio struct {
	ID              string                  `json:"id"`
	Titulo          string                  `json:"titulo"`
	Tipo            string                  `json:"tipo"`
	Nivel           string                  `json:"nivel"`
	DuracaoMin      int                     `json:"duracaoMin"`
	Prerequisitos   []DesafioPrerequisito   `json:"prerequisitos"`
	Conceitos       []DesafioConceito       `json:"conceitos"`
	Parametros      map[string]DesafioParam `json:"parametros"`
	EnunciadoHTML   string                  `json:"enunciadoHtml"`
	DicasHTML       string                  `json:"dicasHtml,omitempty"`
	GabaritoHTML    string                  `json:"gabaritoHtml"`
	Esclarecimentos []DesafioEsclarecimento `json:"esclarecimentos"`
	Estimativas     []DesafioEstimativa     `json:"estimativas"`
	Decisoes        []DesafioDecisao        `json:"decisoes"`
	Reviravolta     *DesafioReviravolta     `json:"reviravolta,omitempty"`
	Entregavel      DesafioEntregavel       `json:"entregavel"`
	Rubrica         []string                `json:"rubrica"`
	Codigo          []DesafioCodigo         `json:"codigo,omitempty"`
}

type DesafioCatalog struct {
	GeneratedAt string            `json:"generatedAt"`
	Desafios    []CompiledDesafio `json:"desafios"`
}

// desafioCtx is what validation needs from the rest of the build.
type desafioCtx struct {
	courses   map[string]CompiledCourse
	bridgeIdx bridgeIndex
	conceitos *conceitoSet
}

// compileDesafios reads content/desafios/*.md and writes dataDir/desafios.json.
// A missing directory is an empty bank. Returns one error per rejected
// desafio (already logged), so the real-content test can fail on them.
func compileDesafios(dir string, ctx desafioCtx, dataDir string) []error {
	var errs []error
	desafios, loadErrs := loadDesafios(dir, ctx)
	for _, e := range loadErrs {
		log.Printf("WARN desafios: %v", e)
	}
	errs = append(errs, loadErrs...)
	if err := writeJSON(filepath.Join(dataDir, "desafios.json"),
		DesafioCatalog{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Desafios: desafios}); err != nil {
		log.Printf("WARN writing desafios.json: %v", err)
		errs = append(errs, err)
	}
	return errs
}

// loadDesafios compiles every desafio in dir, then applies the bank-wide
// checks (decision bias). Rejected desafios are left out of the result.
func loadDesafios(dir string, ctx desafioCtx) ([]CompiledDesafio, []error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.md"))
	if err != nil {
		return nil, []error{err}
	}
	out := []CompiledDesafio{} // [] not null in desafios.json, even with an empty bank
	var errs []error
	seen := map[string]string{}
	for _, f := range files {
		if strings.HasPrefix(filepath.Base(f), "_") {
			continue // _schema.md and other docs
		}
		d, err := compileDesafio(f, ctx)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", filepath.Base(f), err))
			continue
		}
		if prev, dup := seen[d.ID]; dup {
			errs = append(errs, fmt.Errorf("%s: id %q já usado em %s", filepath.Base(f), d.ID, prev))
			continue
		}
		seen[d.ID] = filepath.Base(f)
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	balanceDecisoes(out)
	if err := checkDecisoesBias(out); err != nil {
		errs = append(errs, err)
	}
	return out, errs
}

func compileDesafio(path string, ctx desafioCtx) (CompiledDesafio, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return CompiledDesafio{}, err
	}
	m := frontmatterRe.FindSubmatch(raw)
	if m == nil {
		return CompiledDesafio{}, fmt.Errorf("sem frontmatter YAML entre linhas ---")
	}
	var spec DesafioSpec
	dec := yaml.NewDecoder(bytes.NewReader(m[1]))
	dec.KnownFields(true)
	if err := dec.Decode(&spec); err != nil {
		return CompiledDesafio{}, fmt.Errorf("frontmatter: %w", err)
	}
	if want := strings.TrimSuffix(filepath.Base(path), ".md"); spec.ID != want {
		return CompiledDesafio{}, fmt.Errorf("id %q deve ser igual ao nome do arquivo (%q)", spec.ID, want)
	}
	return buildDesafio(spec, string(m[2]), filepath.Dir(path), ctx)
}

func buildDesafio(spec DesafioSpec, body, dir string, ctx desafioCtx) (CompiledDesafio, error) {
	var problems []string
	fail := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }

	if !desafioIDRe.MatchString(spec.ID) {
		fail("id %q não é kebab-case", spec.ID)
	}
	if strings.TrimSpace(spec.Titulo) == "" {
		fail("titulo vazio")
	}
	if !desafioTipos[spec.Tipo] {
		fail("tipo %q inválido (system-design, lld, estimativa, incidente ou comportamental)", spec.Tipo)
	}
	if !desafioNiveis[spec.Nivel] {
		fail("nivel %q inválido (senior ou staff)", spec.Nivel)
	}
	if spec.DuracaoMin <= 0 {
		fail("duracaoMin precisa ser positivo")
	}

	d := CompiledDesafio{
		ID: spec.ID, Titulo: spec.Titulo, Tipo: spec.Tipo, Nivel: spec.Nivel, DuracaoMin: spec.DuracaoMin,
		Parametros: spec.Parametros, Esclarecimentos: spec.Esclarecimentos, Decisoes: spec.Decisoes,
		Reviravolta: spec.Reviravolta, Entregavel: spec.Entregavel, Rubrica: spec.Rubrica,
		Prerequisitos: []DesafioPrerequisito{}, Conceitos: []DesafioConceito{}, Estimativas: []DesafioEstimativa{},
	}
	if d.Parametros == nil {
		d.Parametros = map[string]DesafioParam{}
	}
	if d.Esclarecimentos == nil {
		d.Esclarecimentos = []DesafioEsclarecimento{}
	}
	if d.Decisoes == nil {
		d.Decisoes = []DesafioDecisao{}
	}

	// Pré-requisitos: slug/NN, resolved like path steps and bridges.
	if len(spec.Prerequisitos) == 0 {
		fail("prerequisitos vazio: um desafio só aparece depois de marcos concluídos")
	}
	for _, ref := range spec.Prerequisitos {
		p, err := resolveDesafioPrereq(ref, ctx)
		if err != nil {
			fail("%v", err)
			continue
		}
		d.Prerequisitos = append(d.Prerequisitos, p)
	}

	// Conceitos: ids of conceitos.yaml.
	for _, id := range spec.Conceitos {
		c, ok := ctx.conceito(id)
		if !ok {
			fail("conceito %q não existe em conceitos.yaml", id)
			continue
		}
		d.Conceitos = append(d.Conceitos, c)
	}

	// Parâmetros.
	numeric := map[string]bool{}
	for name, p := range spec.Parametros {
		if err := checkDesafioParam(name, p); err != nil {
			fail("%v", err)
			continue
		}
		if _, _, ok := paramRange(p); ok {
			numeric[name] = true
		}
	}

	// Estimativas: parse to AST, then evaluate at every combination of the
	// parameters' extremes — the result must be finite and positive.
	seenEst := map[string]bool{}
	for _, e := range spec.Estimativas {
		if e.ID == "" || seenEst[e.ID] {
			fail("estimativa sem id ou com id repetido (%q)", e.ID)
			continue
		}
		seenEst[e.ID] = true
		ast, err := ParseFormula(e.Formula, numeric)
		if err != nil {
			fail("estimativa %q: %v", e.ID, err)
			continue
		}
		if err := checkFormulaAtExtremes(ast, spec.Parametros, numeric); err != nil {
			fail("estimativa %q: %v", e.ID, err)
			continue
		}
		tol := e.Tolerancia
		if tol == 0 {
			tol = desafioDefaultTol
		}
		if tol <= 0 || tol >= 1 {
			fail("estimativa %q: tolerancia %.2f fora de (0, 1)", e.ID, tol)
		}
		d.Estimativas = append(d.Estimativas, DesafioEstimativa{
			ID: e.ID, Enunciado: e.Enunciado, Unidade: e.Unidade, Formula: e.Formula, AST: ast, Tolerancia: tol,
		})
	}

	// Decisões.
	for i, q := range spec.Decisoes {
		if strings.TrimSpace(q.Pergunta) == "" || len(q.Opcoes) < 3 || q.Correta < 0 || q.Correta >= len(q.Opcoes) || strings.TrimSpace(q.Explicacao) == "" {
			fail("decisoes[%d]: precisa de pergunta, ≥3 opções, correta válida e explicacao", i)
		}
	}

	// Reviravolta.
	if r := spec.Reviravolta; r != nil {
		if r.MomentoPct < 10 || r.MomentoPct > 90 || strings.TrimSpace(r.Texto) == "" || len(r.Rubrica) == 0 {
			fail("reviravolta: momentoPct entre 10 e 90, texto e rubrica")
		}
	}

	// Corpo: ## Enunciado (obrigatório), ## Dicas (opcional), ## Gabarito comentado (obrigatório).
	secs, err := splitDesafioBody(body)
	if err != nil {
		fail("%v", err)
	} else {
		if d.EnunciadoHTML, err = renderMarkdown([]byte(secs["Enunciado"])); err != nil {
			fail("enunciado: %v", err)
		}
		if secs["Dicas"] != "" {
			if d.DicasHTML, err = renderMarkdown([]byte(secs["Dicas"])); err != nil {
				fail("dicas: %v", err)
			}
		}
		if d.GabaritoHTML, err = renderMarkdown([]byte(secs["Gabarito comentado"])); err != nil {
			fail("gabarito: %v", err)
		}
	}

	// Placeholders in every text the reader sees must name a parameter.
	texts := []string{spec.Titulo, body}
	for _, e := range spec.Esclarecimentos {
		texts = append(texts, e.Pergunta, e.Revela)
	}
	for _, e := range spec.Estimativas {
		texts = append(texts, e.Enunciado)
	}
	for _, q := range spec.Decisoes {
		texts = append(texts, q.Pergunta, q.Explicacao)
		texts = append(texts, q.Opcoes...)
	}
	if spec.Reviravolta != nil {
		texts = append(texts, spec.Reviravolta.Texto)
		texts = append(texts, spec.Reviravolta.Rubrica...)
	}
	texts = append(texts, spec.Rubrica...)
	for _, t := range texts {
		for _, ph := range desafioPlaceholderRe.FindAllStringSubmatch(t, -1) {
			if _, ok := spec.Parametros[ph[1]]; !ok {
				fail("placeholder {%s} não é um parâmetro", ph[1])
			}
		}
	}

	// Mínimos por tipo (PLANO §5.4 e §7).
	chave := 0
	for _, e := range spec.Esclarecimentos {
		if e.Chave {
			chave++
		}
	}
	switch spec.Tipo {
	case DesafioSystemDesign, DesafioIncidente:
		if len(spec.Esclarecimentos) < 4 || chave < 2 {
			fail("%s precisa de ≥4 esclarecimentos, ≥2 com chave: true (tem %d, %d chave)", spec.Tipo, len(spec.Esclarecimentos), chave)
		}
	}
	switch spec.Tipo {
	case DesafioSystemDesign, DesafioIncidente, TipoEstimativa:
		if len(d.Estimativas) < 2 {
			fail("%s precisa de ≥2 estimativas", spec.Tipo)
		}
	}
	switch spec.Tipo {
	case DesafioSystemDesign, DesafioIncidente, DesafioLLD, TipoEstimativa:
		if len(spec.Decisoes) < 3 {
			fail("%s precisa de ≥3 decisões", spec.Tipo)
		}
	}
	if spec.Tipo == DesafioComportamental {
		want := []string{"Situação", "Tarefa", "Ação", "Resultado", "Aprendizado"}
		if strings.Join(spec.Entregavel.SecoesObrigatorias, "|") != strings.Join(want, "|") {
			fail("comportamental: entregavel.secoesObrigatorias precisa ser %v", want)
		}
	}
	if len(spec.Entregavel.SecoesObrigatorias) == 0 && spec.Tipo != DesafioLLD {
		fail("entregavel.secoesObrigatorias vazio")
	}
	if len(spec.Rubrica) < 5 {
		fail("rubrica precisa de ≥5 itens (tem %d)", len(spec.Rubrica))
	}

	// LLD: tests in at least one language, in desafios/<id>/{java,go}.
	if spec.Tipo == DesafioLLD {
		d.Codigo = desafioCodigo(dir, spec.ID)
		if len(d.Codigo) == 0 {
			fail("lld precisa de %s/java (pom.xml + src/test) ou %s/go (*_test.go)", spec.ID, spec.ID)
		}
	}

	if len(problems) > 0 {
		return CompiledDesafio{}, fmt.Errorf("%s", strings.Join(problems, "; "))
	}
	return d, nil
}

func resolveDesafioPrereq(ref string, ctx desafioCtx) (DesafioPrerequisito, error) {
	m := bridgeFullRe.FindStringSubmatch(ref)
	if m == nil {
		return DesafioPrerequisito{}, fmt.Errorf("pré-requisito %q não está no formato trilha/NN", ref)
	}
	id, ok := ctx.bridgeIdx[m[1]][m[2]]
	if !ok {
		return DesafioPrerequisito{}, fmt.Errorf("pré-requisito %q não existe", ref)
	}
	course, ok := ctx.courses[m[1]]
	if !ok {
		return DesafioPrerequisito{}, fmt.Errorf("pré-requisito %q: trilha não compilou", ref)
	}
	for _, ms := range course.Milestones {
		if ms.ID == id {
			return DesafioPrerequisito{Ref: ref, Slug: m[1], MarcoID: id, CourseTitle: course.Title, MilestoneTitle: ms.Title}, nil
		}
	}
	return DesafioPrerequisito{}, fmt.Errorf("pré-requisito %q: marco %s não está na trilha compilada", ref, id)
}

func (c desafioCtx) conceito(id string) (DesafioConceito, bool) {
	if c.conceitos == nil {
		return DesafioConceito{}, false
	}
	for _, rc := range c.conceitos.conceitos {
		if rc.ID == id {
			return DesafioConceito{ID: rc.ID, Termo: rc.Termo, Href: rc.dono.href()}, true
		}
	}
	return DesafioConceito{}, false
}

func checkDesafioParam(name string, p DesafioParam) error {
	hasRange := p.Min != nil || p.Max != nil || p.Passo != nil
	if hasRange == (len(p.Valores) > 0) {
		return fmt.Errorf("parâmetro %q: use min/max/passo ou valores, não os dois (nem nenhum)", name)
	}
	if hasRange {
		if p.Min == nil || p.Max == nil || p.Passo == nil || *p.Passo <= 0 || *p.Min > *p.Max || *p.Min <= 0 {
			return fmt.Errorf("parâmetro %q: precisa de 0 < min ≤ max e passo > 0", name)
		}
		return nil
	}
	allNum, allStr := true, true
	for _, v := range p.Valores {
		switch x := v.(type) {
		case int, float64:
			allStr = false
			if toFloat(x) <= 0 {
				return fmt.Errorf("parâmetro %q: valores numéricos precisam ser positivos", name)
			}
		case string:
			allNum = false
		default:
			return fmt.Errorf("parâmetro %q: valor %v não é número nem texto", name, v)
		}
	}
	if !allNum && !allStr {
		return fmt.Errorf("parâmetro %q: valores misturam números e textos", name)
	}
	return nil
}

// paramRange returns the numeric extremes of a parameter; ok is false for
// text-only parameters.
func paramRange(p DesafioParam) (lo, hi float64, ok bool) {
	if p.Min != nil && p.Max != nil {
		return *p.Min, *p.Max, true
	}
	first := true
	for _, v := range p.Valores {
		switch v.(type) {
		case int, float64:
		default:
			return 0, 0, false
		}
		f := toFloat(v)
		if first || f < lo {
			lo = f
		}
		if first || f > hi {
			hi = f
		}
		first = false
	}
	return lo, hi, !first
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case int:
		return float64(x)
	case float64:
		return x
	}
	return math.NaN()
}

// checkFormulaAtExtremes evaluates ast at every combination of the min/max
// of each numeric parameter (2^n combinations; desafios have a handful).
func checkFormulaAtExtremes(ast *FormulaNode, params map[string]DesafioParam, numeric map[string]bool) error {
	names := make([]string, 0, len(numeric))
	for n := range numeric {
		names = append(names, n)
	}
	sort.Strings(names)
	if len(names) > 12 {
		return fmt.Errorf("mais de 12 parâmetros numéricos")
	}
	for mask := 0; mask < 1<<len(names); mask++ {
		vars := map[string]float64{}
		for i, n := range names {
			lo, hi, _ := paramRange(params[n])
			if mask&(1<<i) != 0 {
				vars[n] = hi
			} else {
				vars[n] = lo
			}
		}
		v, err := ast.Eval(vars)
		if err != nil {
			return err
		}
		if math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 {
			return fmt.Errorf("resultado %v (não finito ou não positivo) com %v", v, vars)
		}
	}
	return nil
}

// splitDesafioBody splits the markdown body on its "## " headings.
func splitDesafioBody(body string) (map[string]string, error) {
	secs := map[string]string{}
	var cur string
	var buf strings.Builder
	flush := func() {
		if cur != "" {
			secs[cur] = strings.TrimSpace(buf.String())
		}
		buf.Reset()
	}
	for _, line := range strings.Split(body, "\n") {
		if strings.HasPrefix(line, "## ") {
			flush()
			cur = strings.TrimSpace(strings.TrimPrefix(line, "## "))
			if cur != "Enunciado" && cur != "Dicas" && cur != "Gabarito comentado" {
				return nil, fmt.Errorf("seção %q desconhecida no corpo (use Enunciado, Dicas, Gabarito comentado)", cur)
			}
			continue
		}
		if cur == "" && strings.TrimSpace(line) != "" {
			return nil, fmt.Errorf("texto antes de ## Enunciado")
		}
		buf.WriteString(line + "\n")
	}
	flush()
	if secs["Enunciado"] == "" || secs["Gabarito comentado"] == "" {
		return nil, fmt.Errorf("o corpo precisa de ## Enunciado e ## Gabarito comentado, não vazios")
	}
	return secs, nil
}

func desafioCodigo(dir, id string) []DesafioCodigo {
	var out []DesafioCodigo
	base := filepath.Join(dir, id)
	rel := filepath.ToSlash(filepath.Join("aggregator", "content", "desafios", id))
	if fileExists(filepath.Join(base, "java", "pom.xml")) && dirHasSuffix(filepath.Join(base, "java", "src", "test"), "Test.java") {
		out = append(out, DesafioCodigo{Linguagem: "java", Pasta: rel + "/java", Comando: "mvn -q test"})
	}
	if dirHasSuffix(filepath.Join(base, "go"), "_test.go") {
		out = append(out, DesafioCodigo{Linguagem: "go", Pasta: rel + "/go", Comando: "go test -race ./..."})
	}
	return out
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func dirHasSuffix(dir, suffix string) bool {
	found := false
	_ = filepath.WalkDir(dir, func(p string, e os.DirEntry, err error) error {
		if err == nil && !e.IsDir() && strings.HasSuffix(p, suffix) {
			found = true
		}
		return nil
	})
	return found
}

// balanceDecisoes places the correct option of the k-th decision of the bank
// (desafios in id order, decisions in authored order) at index k mod n, and
// shuffles the other options deterministically. Position then carries no
// signal by construction — the same goal as shuffleOptions for the quizzes,
// but balanced across the whole bank instead of random.
func balanceDecisoes(ds []CompiledDesafio) {
	k := 0
	for i := range ds {
		for j := range ds[i].Decisoes {
			q := &ds[i].Decisoes[j]
			n := len(q.Opcoes)
			if n < 2 || q.Correta < 0 || q.Correta >= n {
				continue
			}
			correct := q.Opcoes[q.Correta]
			others := make([]string, 0, n-1)
			for oi, o := range q.Opcoes {
				if oi != q.Correta {
					others = append(others, o)
				}
			}
			h := fnv.New64a()
			h.Write([]byte(ds[i].ID + "|" + q.Pergunta))
			rand.New(rand.NewSource(int64(h.Sum64()))).Shuffle(len(others), func(a, b int) { others[a], others[b] = others[b], others[a] })
			target := k % n
			opts := make([]string, 0, n)
			opts = append(opts, others[:target]...)
			opts = append(opts, correct)
			opts = append(opts, others[target:]...)
			q.Opcoes, q.Correta = opts, target
			k++
		}
	}
}

// checkDecisoesBias applies the trilhas' quiz limits to the whole bank:
// the correct option is the longest in at most 40% of decisions, and no
// index holds more than 35% of the correct answers (balanceDecisoes makes
// the second hold by construction; it is checked anyway).
func checkDecisoesBias(ds []CompiledDesafio) error {
	total, longest := 0, 0
	byIndex := map[int]int{}
	for _, d := range ds {
		for _, q := range d.Decisoes {
			total++
			byIndex[q.Correta]++
			max := 0
			for _, o := range q.Opcoes {
				if len([]rune(o)) > max {
					max = len([]rune(o))
				}
			}
			if len([]rune(q.Opcoes[q.Correta])) == max {
				longest++
			}
		}
	}
	if total == 0 {
		return nil
	}
	if share := float64(longest) / float64(total); share > desafioMaxLongestShare {
		return fmt.Errorf("decisões: a correta é a opção mais longa em %.0f%% de %d (máx. 40%%)", share*100, total)
	}
	if total >= 3 {
		for idx, n := range byIndex {
			// With fewer decisions than options per question, an even spread
			// still puts one per index: the limit is the larger of 35% and 1.
			if limit := math.Max(desafioMaxIndexShare*float64(total), math.Ceil(float64(total)/4)); float64(n) > limit {
				return fmt.Errorf("decisões: %d de %d corretas no índice %d (máx. 35%%)", n, total, idx)
			}
		}
	}
	return nil
}
