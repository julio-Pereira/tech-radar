package course

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// testDesafioCtx is a minimal build: one trilha with two marcos and one concept.
func testDesafioCtx() desafioCtx {
	courses := map[string]CompiledCourse{
		"system-design": {Slug: "system-design", Title: "System Design", Milestones: []CompiledMilestone{
			{ID: "metodo", Title: "Método"}, {ID: "caso-pix", Title: "Caso Pix"},
		}},
	}
	idx := bridgeIndex{"system-design": {"01": "metodo", "09": "caso-pix"}}
	set := &conceitoSet{conceitos: []*conceitoResolvido{{
		Conceito: Conceito{ID: "idempotencia", Termo: "Idempotência"},
		dono:     marcoRef{Slug: "system-design", NN: "09", ID: "caso-pix"},
	}}}
	return desafioCtx{courses: courses, bridgeIdx: idx, conceitos: set}
}

const validDesafio = `---
id: teste
titulo: "Pagamentos a {tps} TPS"
tipo: system-design
nivel: senior
duracaoMin: 45
prerequisitos: [system-design/01, system-design/09]
conceitos: [idempotencia]
parametros:
  tps: { min: 2000, max: 20000, passo: 1000 }
  anos: { valores: [5, 10] }
  rto: { valores: ["15min", "1h"] }
esclarecimentos:
  - { pergunta: "Pico?", revela: "3x a média.", chave: true }
  - { pergunta: "Retenção?", revela: "{anos} anos.", chave: true }
  - { pergunta: "RTO?", revela: "{rto}.", chave: false }
  - { pergunta: "Cor do botão?", revela: "Fora de escopo.", chave: false }
estimativas:
  - { id: storage, enunciado: "TB em {anos} anos", unidade: TB, formula: "tps * 86400 * 365 * anos * 2 / 1e9" }
  - { id: particoes, enunciado: "Partições", formula: "ceil(tps * 3 / 1000)", tolerancia: 0.2 }
decisoes:
  - { pergunta: "Q1?", opcoes: [a, b, c, d], correta: 1, explicacao: "e1" }
  - { pergunta: "Q2?", opcoes: [a, b, c, d], correta: 1, explicacao: "e2" }
  - { pergunta: "Q3?", opcoes: [a, b, c, d], correta: 1, explicacao: "e3" }
reviravolta: { momentoPct: 60, texto: "RPO zero.", rubrica: ["Replicação síncrona"] }
entregavel: { secoesObrigatorias: [Requisitos, Estimativas, Arquitetura] }
rubrica: [r1, r2, r3, r4, r5]
---
## Enunciado

Desenhe a iniciação a {tps} TPS.

## Dicas

Comece pelos requisitos.

## Gabarito comentado

Idempotência na borda.
`

func writeDesafio(t *testing.T, dir, id, src string) string {
	t.Helper()
	p := filepath.Join(dir, id+".md")
	if err := os.WriteFile(p, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestCompileDesafioValid(t *testing.T) {
	dir := t.TempDir()
	d, err := compileDesafio(writeDesafio(t, dir, "teste", validDesafio), testDesafioCtx())
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Prerequisitos) != 2 || d.Prerequisitos[1].MarcoID != "caso-pix" || d.Prerequisitos[1].CourseTitle != "System Design" {
		t.Errorf("prerequisitos = %+v", d.Prerequisitos)
	}
	if len(d.Conceitos) != 1 || d.Conceitos[0].Href != "#/learn/system-design/caso-pix" {
		t.Errorf("conceitos = %+v", d.Conceitos)
	}
	if len(d.Estimativas) != 2 || d.Estimativas[0].Tolerancia != 0.25 || d.Estimativas[1].Tolerancia != 0.2 || d.Estimativas[1].AST == nil {
		t.Errorf("estimativas = %+v", d.Estimativas)
	}
	if !strings.Contains(d.EnunciadoHTML, "{tps}") || d.DicasHTML == "" || !strings.Contains(d.GabaritoHTML, "Idempotência") {
		t.Errorf("body sections: %q / %q / %q", d.EnunciadoHTML, d.DicasHTML, d.GabaritoHTML)
	}
}

// Every rule of PLANO §5.4 (and §7's minimums) rejects the build with a
// message that names the problem.
func TestCompileDesafioRejects(t *testing.T) {
	cases := []struct{ name, from, to, want string }{
		{"prerequisito inexistente", "system-design/09]", "system-design/77]", "pré-requisito \"system-design/77\" não existe"},
		{"prerequisito fora do formato", "system-design/09]", "system-design/caso-pix]", "formato trilha/NN"},
		{"conceito ausente", "conceitos: [idempotencia]", "conceitos: [rate-limiting]", "conceito \"rate-limiting\" não existe"},
		{"placeholder sem parâmetro", "Desenhe a iniciação a {tps} TPS.", "Desenhe a {regiao}.", "placeholder {regiao}"},
		{"fórmula com código", `formula: "ceil(tps * 3 / 1000)"`, `formula: "eval(tps)"`, "function \"eval\" is not allowed"},
		{"fórmula com parâmetro textual", `formula: "ceil(tps * 3 / 1000)"`, `formula: "rto * 2"`, "unknown identifier \"rto\""},
		{"fórmula que gera Inf", `formula: "ceil(tps * 3 / 1000)"`, `formula: "tps / (anos - 5)"`, "não finito"},
		{"menos de 2 esclarecimentos-chave", `revela: "3x a média.", chave: true`, `revela: "3x a média.", chave: false`, "≥2 com chave: true"},
		{"sem gabarito", "## Gabarito comentado\n\nIdempotência na borda.\n", "", "## Gabarito comentado"},
		{"rubrica curta", "rubrica: [r1, r2, r3, r4, r5]", "rubrica: [r1, r2]", "rubrica precisa de ≥5"},
		{"campo desconhecido", "nivel: senior", "nivel: senior\nnivell: x", "field nivell not found"},
		{"tipo inválido", "tipo: system-design", "tipo: algoritmo", "tipo \"algoritmo\" inválido"},
		{"lld sem testes", "tipo: system-design", "tipo: lld", "lld precisa de teste/java"},
		{"parâmetro misto", `anos: { valores: [5, 10] }`, `anos: { valores: [5, "dez"] }`, "misturam números e textos"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			src := strings.Replace(validDesafio, c.from, c.to, 1)
			if src == validDesafio {
				t.Fatalf("replacement %q not found in the fixture", c.from)
			}
			_, err := compileDesafio(writeDesafio(t, t.TempDir(), "teste", src), testDesafioCtx())
			if err == nil {
				t.Fatal("accepted")
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not mention %q", err, c.want)
			}
		})
	}
}

func TestCompileDesafioLLDNeedsTests(t *testing.T) {
	dir := t.TempDir()
	src := strings.Replace(validDesafio, "tipo: system-design", "tipo: lld", 1)
	goDir := filepath.Join(dir, "teste", "go")
	if err := os.MkdirAll(goDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(goDir, "bucket_test.go"), []byte("package bucket\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := compileDesafio(writeDesafio(t, dir, "teste", src), testDesafioCtx())
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Codigo) != 1 || d.Codigo[0].Linguagem != "go" || d.Codigo[0].Comando != "go test -race ./..." {
		t.Errorf("codigo = %+v", d.Codigo)
	}
}

func TestIDMustMatchFileName(t *testing.T) {
	if _, err := compileDesafio(writeDesafio(t, t.TempDir(), "outro", validDesafio), testDesafioCtx()); err == nil ||
		!strings.Contains(err.Error(), "igual ao nome do arquivo") {
		t.Errorf("err = %v", err)
	}
}

// Across the bank the correct option rotates through the indices, whatever
// index the author used, and the option set is preserved.
func TestBalanceDecisoesSpreadsCorrectIndex(t *testing.T) {
	var ds []CompiledDesafio
	for _, id := range []string{"a", "b", "c"} {
		d := CompiledDesafio{ID: id}
		for k := 0; k < 4; k++ {
			d.Decisoes = append(d.Decisoes, DesafioDecisao{
				Pergunta: id + string(rune('0'+k)), Opcoes: []string{"xx", "c", "yy", "zz"}, Correta: 1,
			})
		}
		ds = append(ds, d)
	}
	balanceDecisoes(ds)
	count := map[int]int{}
	for _, d := range ds {
		for _, q := range d.Decisoes {
			if q.Opcoes[q.Correta] != "c" || len(q.Opcoes) != 4 {
				t.Fatalf("decision broken: %+v", q)
			}
			count[q.Correta]++
		}
	}
	for i := 0; i < 4; i++ {
		if count[i] != 3 {
			t.Errorf("index %d holds %d of 12 correct answers, want 3", i, count[i])
		}
	}
	if err := checkDecisoesBias(ds); err != nil {
		t.Error(err)
	}
}

func TestDecisoesBiasRejectsLongestCorrect(t *testing.T) {
	ds := []CompiledDesafio{{ID: "a", Decisoes: []DesafioDecisao{
		{Opcoes: []string{"curta", "a opção correta e bem mais longa", "x"}, Correta: 1},
		{Opcoes: []string{"curta", "a opção correta e bem mais longa", "x"}, Correta: 1},
		{Opcoes: []string{"a opção errada mais longa de todas", "certa", "x"}, Correta: 1},
	}}}
	if err := checkDecisoesBias(ds); err == nil || !strings.Contains(err.Error(), "mais longa") {
		t.Errorf("err = %v", err)
	}
}

// TestDesafiosRealContent: every desafio in content/desafios compiles —
// the site build only logs a rejected one, CI must not.
func TestDesafiosRealContent(t *testing.T) {
	dir := t.TempDir()
	index, err := Compile(contentDir, filepath.Join(dir, "courses"))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range index.DesafioErrors {
		t.Error(e)
	}
	var catalog DesafioCatalog
	readJSON(t, filepath.Join(dir, "desafios.json"), &catalog)
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(contentDir), "desafios", "[a-z0-9]*.md"))
	if len(catalog.Desafios) != len(files) {
		t.Errorf("desafios.json has %d desafios, content/desafios has %d", len(catalog.Desafios), len(files))
	}
	dominio := map[string]bool{}
	for _, d := range catalog.Desafios {
		dominio[d.ID] = d.Dominio
	}
	// Domain axis of the readiness radar: set by a prerequisite in a
	// "Domínio financeiro" trilha, and only by that.
	if !dominio["ledger-multimoeda"] || !dominio["extrato-open-finance"] || dominio["rate-limiter-concorrente"] || dominio["decisao-contestada"] {
		t.Errorf("dominio flags wrong: %v", dominio)
	}

	// Every content/paths file compiles (a broken one is only a WARN in the
	// build), and the interview path ends with the desafio-bank step.
	var paths PathCatalog
	readJSON(t, filepath.Join(dir, "paths.json"), &paths)
	yamls, _ := filepath.Glob(filepath.Join(filepath.Dir(contentDir), "paths", "*.yaml"))
	if len(paths.Paths) != len(yamls) {
		t.Errorf("paths.json has %d paths, content/paths has %d", len(paths.Paths), len(yamls))
	}
	for _, p := range paths.Paths {
		if p.Slug != "entrevista-senior" {
			continue
		}
		last := p.Steps[len(p.Steps)-1]
		if !last.Desafios || last.DesafioCount != len(catalog.Desafios) {
			t.Errorf("entrevista-senior should end with the desafios step over the whole bank, got %+v", last)
		}
		return
	}
	t.Error("entrevista-senior missing from paths.json")
}
