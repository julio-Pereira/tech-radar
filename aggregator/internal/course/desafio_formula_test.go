package course

import (
	"encoding/json"
	"math"
	"testing"
)

func TestParseFormulaEvaluates(t *testing.T) {
	vars := map[string]bool{"tps": true, "payloadKb": true, "anos": true}
	vals := map[string]float64{"tps": 2000, "payloadKb": 2, "anos": 5}
	cases := []struct {
		src  string
		want float64
	}{
		{"1 + 2 * 3", 7},
		{"(1 + 2) * 3", 9},
		{"2 ^ 3 ^ 2", 512}, // right-associative
		{"-2 ^ 2", -4},     // unary minus applies to the power
		{"10 / 4", 2.5},
		{"1e9 / 1e6", 1000},
		{"ceil(tps * 3 / 1000)", 6},
		{"floor(7.9) + round(2.5) + log2(8)", 7 + 3 + 3},
		{"min(tps, 500, 900) + max(1, payloadKb)", 502},
		{"tps * 86400 * 365 * anos * payloadKb / 1e9", 2000 * 86400 * 365 * 5 * 2 / 1e9},
	}
	for _, c := range cases {
		ast, err := ParseFormula(c.src, vars)
		if err != nil {
			t.Fatalf("%q: %v", c.src, err)
		}
		got, err := ast.Eval(vals)
		if err != nil {
			t.Fatalf("%q eval: %v", c.src, err)
		}
		if math.Abs(got-c.want) > 1e-9*math.Max(1, math.Abs(c.want)) {
			t.Errorf("%q = %v, want %v", c.src, got, c.want)
		}
	}
}

// Nothing outside the closed grammar gets through: no code, no unknown
// names, no property access, no strings.
func TestParseFormulaRejects(t *testing.T) {
	vars := map[string]bool{"tps": true}
	for _, src := range []string{
		"", "1 +", "(1 + 2", "tps)", "eval(1)", "Function(1)", "constructor", "__proto__",
		"tps.length", "tps[0]", "'1'", `"x"`, "1; 2", "alert(1)", "Math.pow(2, 3)",
		"ceil(1, 2)", "min(1)", "log2()", "x + 1", "tps = 1", "1 % 2", "tps,1",
	} {
		if _, err := ParseFormula(src, vars); err == nil {
			t.Errorf("%q was accepted", src)
		}
	}
}

func TestFormulaASTIsPlainJSON(t *testing.T) {
	ast, err := ParseFormula("ceil(tps / 2) - 1", map[string]bool{"tps": true})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(ast)
	want := `{"t":"op","o":"-","a":[{"t":"fn","f":"ceil","a":[{"t":"op","o":"/","a":[{"t":"var","n":"tps"},{"t":"num","v":2}]}]},{"t":"num","v":1}]}`
	if string(b) != want {
		t.Errorf("AST JSON =\n%s\nwant\n%s", b, want)
	}
}

func TestFormulaExtremesCatchNonFiniteOrNonPositive(t *testing.T) {
	one, two, ten := 1.0, 2.0, 10.0
	params := map[string]DesafioParam{"a": {Min: &one, Max: &ten, Passo: &one}, "b": {Min: &one, Max: &two, Passo: &one}}
	numeric := map[string]bool{"a": true, "b": true}
	for src, ok := range map[string]bool{
		"a * b":          true,
		"a / (b - 1)":    false, // b = 1 → division by zero → Inf
		"log2(a - 1)":    false, // a = 1 → log2(0) = -Inf
		"b - a":          false, // negative at a = 10
		"(a - 1) ^ 0.5":  false, // 0 at a = 1: not positive
		"a + b ^ 2 - 1":  true,
		"max(a, b) / 2":  true,
		"10 / (a - 0.5)": true,
	} {
		ast, err := ParseFormula(src, numeric)
		if err != nil {
			t.Fatal(err)
		}
		err = checkFormulaAtExtremes(ast, params, numeric)
		if ok && err != nil {
			t.Errorf("%q: unexpected error %v", src, err)
		}
		if !ok && err == nil {
			t.Errorf("%q: non-finite/non-positive result was accepted", src)
		}
	}
}
