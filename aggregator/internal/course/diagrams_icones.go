package course

import (
	"sort"
	"strings"
)

// Icons by component type (Fase 1.8, plan §3.1). A closed catalog: the
// author picks only the icon, and the icon fixes the node's shape, so the
// front end never decides a shape on its own — the compiled JSON carries
// both. The icon says what the component is; papel (destaque, externo) says
// how it takes part in that figure, and the two coexist.
//
// Rule for a component that fits two icons: the icon describes its role in
// the figure. In a diagram about storage the ledger is "banco"; in a diagram
// of services it is "servico".

// Shapes. "caixa" is the node box as drawn before Fase 1.8 (rx 8); the
// others are drawn inside that same rectangle, so anchors and layout do not
// change.
const (
	formaCaixa         = "caixa"
	formaArredondada   = "arredondada"    // pill: people and clients
	formaHexagono      = "hexagono"       // network
	formaCilindro      = "cilindro"       // storage
	formaCilindroBaixo = "cilindro-baixo" // cache
	formaTubo          = "tubo"           // queues and streams
	formaCantoDobrado  = "canto-dobrado"  // files and objects
	formaBordaDupla    = "borda-dupla"    // another institution
)

// diagramaIcones maps each icon to its shape.
var diagramaIcones = map[string]string{
	"cliente":     formaArredondada,
	"pessoa":      formaArredondada,
	"servico":     formaCaixa,
	"gateway":     formaCaixa,
	"rede":        formaHexagono,
	"banco":       formaCilindro,
	"cache":       formaCilindroBaixo,
	"fila":        formaTubo,
	"job":         formaCaixa,
	"arquivo":     formaCantoDobrado,
	"identidade":  formaCaixa,
	"plataforma":  formaCaixa,
	"instituicao": formaBordaDupla,
}

// diagramaIconesLista is the catalog in the error messages, sorted.
var diagramaIconesLista = func() string {
	ks := make([]string, 0, len(diagramaIcones))
	for k := range diagramaIcones {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return strings.Join(ks, ", ")
}()

// icone validates an icon and returns its shape ("" for no icon).
func (v *diagramaValidator) icone(where, icone string) string {
	if icone == "" {
		return ""
	}
	forma, ok := diagramaIcones[icone]
	if !ok {
		v.fail("%s: icone %q fora do catálogo (%s)", where, icone, diagramaIconesLista)
		return ""
	}
	return forma
}
