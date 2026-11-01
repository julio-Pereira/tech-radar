package course

import (
	"strings"
	"testing"
)

// Fase 1.6: every rule of section 3.5 fails the build.

func animado(passos string) string {
	return topologiaYAML("animacao:\n" + passos)
}

func TestAnimacaoValidAndCumulative(t *testing.T) {
	d := mustParse(t, animado(`  - legenda: "O pagamento e o evento ficam no Postgres"
  - legenda: "O relay lê o outbox e publica no Kafka"
    estados: { outbox: ativo }
    rotulos: { kafka: "Kafka · ack" }
    fluxos: [ { de: outbox, para: kafka, rotulo: "send" } ]
    anotacao: "só depois do commit"
  - legenda: "Broker fora: o evento espera a próxima rodada"
    estados: { kafka: falha }
`), nil)
	if len(d.Animacao) != 3 {
		t.Fatalf("passos: %+v", d.Animacao)
	}
	last := d.Animacao[2]
	// estados and rotulos accumulate; fluxos and anotacao do not.
	if last.Estados["outbox"] != "ativo" || last.Estados["kafka"] != "falha" || last.Rotulos["kafka"] != "Kafka · ack" {
		t.Fatalf("not cumulative: %+v", last)
	}
	if len(last.Fluxos) != 0 || last.Anotacao != "" {
		t.Fatalf("fluxos/anotacao leaked into the next step: %+v", last)
	}
	if d.Animacao[1].Fluxos[0].Rotulo != "send" {
		t.Fatalf("fluxo: %+v", d.Animacao[1].Fluxos)
	}
	fig := figureHTML("kafka", d)
	for _, want := range []string{"<p>Passo a passo:</p><ol>", "<li>O relay lê o outbox e publica no Kafka (só depois do commit)</li>"} {
		if !strings.Contains(fig, want) {
			t.Errorf("figure lacks %q:\n%s", want, fig)
		}
	}
	if got := bodyPolicy.Sanitize(fig); got != fig {
		t.Errorf("sanitizer changed the steps:\n%s\n%s", fig, got)
	}
}

func TestAnimacaoRules(t *testing.T) {
	base := "  - legenda: \"base\"\n"
	for _, c := range []struct{ passos, want string }{
		{"  - legenda: \"\"\n", "legenda é obrigatória"},
		{"  - legenda: \"" + strings.Repeat("x", 91) + "\"\n", "máximo 90"},
		{base + "  - { legenda: \"a\", anotacao: \"" + strings.Repeat("x", 61) + "\" }\n", "máximo 60"},
		{"  - { legenda: \"a\", estados: { outbox: ativo } }\n", "o passo 1 é o desenho-base"},
		{base + "  - { legenda: \"a\", estados: { fantasma: ativo } }\n", `"fantasma" não existe`},
		{base + "  - { legenda: \"a\", estados: { outbox: azul } }\n", `"azul" inválido`},
		{base + "  - { legenda: \"a\", rotulos: { fantasma: x } }\n", `"fantasma" não existe`},
		{base + "  - { legenda: \"a\", fluxos: [ { de: kafka, para: outbox } ] }\n", "nesse sentido"},
		{base + "  - { legenda: \"a\", fluxos: [ { de: pagamentos, para: kafka } ] }\n", "não há aresta"},
		{base + "  - { legenda: \"a\", atual: outbox }\n", `campo "atual" não se aplica`},
		{base + "  - { legenda: \"a\", ate: 2 }\n", `campo "ate" não se aplica`},
		{strings.Repeat(base, 13), "13 passos"},
	} {
		mustFail(t, animado(c.passos), c.want, nil)
	}
}

func TestAnimacaoFluxoRotuloNeedsALabelledEdge(t *testing.T) {
	src := strings.Replace(animado("  - legenda: \"base\"\n  - { legenda: \"a\", fluxos: [ { de: outbox, para: kafka, rotulo: \"5%\" } ] }\n"),
		`rotulo: "relay", `, "", 1)
	mustFail(t, src, "só troca o rótulo de uma aresta que tem rótulo", nil)
}

const estadosAnimado = `id: fixture
tipo: estados
titulo: "Alerta"
descricao: "` + descricaoOK + `"
estados:
  - { id: inactive, rotulo: "inactive", col: 0, row: 0 }
  - { id: pending, rotulo: "pending", col: 1, row: 0 }
inicial: inactive
transicoes:
  - { de: inactive, para: pending, evento: "expr verdadeira" }
animacao:
`

func TestAnimacaoEstados(t *testing.T) {
	d := mustParse(t, estadosAnimado+`  - { legenda: "A regra avalia", atual: inactive }
  - { legenda: "Fica pendente", atual: pending, transicao: { de: inactive, para: pending } }
`, nil)
	if d.Animacao[1].Atual != "pending" || d.Animacao[1].Transicao.Para != "pending" {
		t.Fatalf("%+v", d.Animacao)
	}
	mustFail(t, estadosAnimado+"  - { legenda: \"a\" }\n", "atual é obrigatório", nil)
	mustFail(t, estadosAnimado+"  - { legenda: \"a\", atual: firing }\n", `atual "firing" não é um estado`, nil)
	mustFail(t, estadosAnimado+"  - { legenda: \"a\", atual: pending, transicao: { de: pending, para: inactive } }\n", "não há transição", nil)
	mustFail(t, estadosAnimado+"  - { legenda: \"a\", atual: pending, estados: { pending: ativo } }\n", `campo "estados" não se aplica`, nil)
}

const sequenciaBase = `id: fixture
tipo: sequencia
titulo: "Sequência"
descricao: "` + descricaoOK + `"
participantes:
  - { id: a, rotulo: "a" }
  - { id: b, rotulo: "b" }
mensagens:
  - { de: a, para: b, rotulo: "um", nota: "a nota vira a legenda" }
  - { de: b, para: a, rotulo: "dois", tipo: reply }
  - { de: a, para: b, rotulo: "três" }
`

func TestAnimacaoSequencia(t *testing.T) {
	d := mustParse(t, sequenciaBase+"animacao: mensagens\n", nil)
	if len(d.Animacao) != 3 || d.Animacao[0].Legenda != "a nota vira a legenda" || d.Animacao[1].Legenda != "dois" || d.Animacao[2].Ate != 3 {
		t.Fatalf("modo mensagens: %+v", d.Animacao)
	}
	d = mustParse(t, sequenciaBase+"animacao:\n  - { legenda: \"ida\", ate: 1 }\n  - { legenda: \"volta e repete\", ate: 3 }\n", nil)
	if d.Animacao[1].Ate != 3 {
		t.Fatalf("%+v", d.Animacao)
	}
	mustFail(t, sequenciaBase+"animacao:\n  - { legenda: \"a\", ate: 2 }\n  - { legenda: \"b\", ate: 2 }\n", "ate 2 precisa ser maior", nil)
	mustFail(t, sequenciaBase+"animacao:\n  - { legenda: \"a\", ate: 4 }\n", "no máximo 3", nil)
	mustFail(t, sequenciaBase+"animacao: todas\n", "use uma lista de passos", nil)
	mustFail(t, topologiaYAML("animacao: mensagens\n"), "só em sequencia", nil)
	mustFail(t, graficoYAML("animacao:\n  - { legenda: \"a\" }\n"), "não se aplica ao tipo grafico", nil)
	many := sequenciaBase
	for i := 0; i < 10; i++ {
		many += "  - { de: a, para: b, rotulo: \"mais\" }\n"
	}
	mustFail(t, many+"animacao: mensagens\n", "agrupe com ate", nil)
}
