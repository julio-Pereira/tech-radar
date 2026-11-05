package course

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// Formulas of the desafios (PLANO jornada de entrevistas §5.3) are parsed
// here into a closed AST, never evaluated as code: no eval, no new Function,
// nowhere. The grammar admits numbers, identifiers that must be parameters
// of the same desafio, + - * / ^, parentheses and the functions in
// formulaFuncs. Anything else fails the build. The front end gets the AST in
// desafios.json and walks it with a tiny interpreter (web/js/desafio-formula.js).
//
//	expr   := term (('+' | '-') term)*
//	term   := unary (('*' | '/') unary)*
//	unary  := '-' unary | power
//	power  := atom ('^' unary)?          // right-associative, binds tighter than unary minus on its left
//	atom   := number | ident | func '(' expr (',' expr)* ')' | '(' expr ')'

// FormulaNode is one node of a compiled formula. Exactly one shape per T:
// "num" (V), "var" (N), "op" (O with two args in A), "neg" (one arg in A),
// "fn" (F with its args in A).
type FormulaNode struct {
	T string         `json:"t"`
	V float64        `json:"v,omitempty"`
	N string         `json:"n,omitempty"`
	O string         `json:"o,omitempty"`
	F string         `json:"f,omitempty"`
	A []*FormulaNode `json:"a,omitempty"`
}

// formulaFuncs are the only functions a formula may call, with their arity
// (0 = variadic, at least 2).
var formulaFuncs = map[string]int{
	"ceil": 1, "floor": 1, "round": 1, "log2": 1,
	"min": 0, "max": 0,
}

type formulaParser struct {
	src  string
	pos  int
	vars map[string]bool
}

// ParseFormula parses src into an AST. vars is the set of identifiers the
// formula may use (the desafio's numeric parameters).
func ParseFormula(src string, vars map[string]bool) (*FormulaNode, error) {
	p := &formulaParser{src: src, vars: vars}
	n, err := p.expr()
	if err != nil {
		return nil, err
	}
	p.skipSpace()
	if p.pos != len(p.src) {
		return nil, p.errorf("unexpected %q", p.src[p.pos:])
	}
	return n, nil
}

func (p *formulaParser) errorf(format string, args ...any) error {
	return fmt.Errorf("formula %q at %d: %s", p.src, p.pos, fmt.Sprintf(format, args...))
}

func (p *formulaParser) skipSpace() {
	for p.pos < len(p.src) && (p.src[p.pos] == ' ' || p.src[p.pos] == '\t') {
		p.pos++
	}
}

func (p *formulaParser) peek() byte {
	p.skipSpace()
	if p.pos >= len(p.src) {
		return 0
	}
	return p.src[p.pos]
}

func (p *formulaParser) expr() (*FormulaNode, error) {
	left, err := p.term()
	if err != nil {
		return nil, err
	}
	for {
		c := p.peek()
		if c != '+' && c != '-' {
			return left, nil
		}
		p.pos++
		right, err := p.term()
		if err != nil {
			return nil, err
		}
		left = &FormulaNode{T: "op", O: string(c), A: []*FormulaNode{left, right}}
	}
}

func (p *formulaParser) term() (*FormulaNode, error) {
	left, err := p.unary()
	if err != nil {
		return nil, err
	}
	for {
		c := p.peek()
		if c != '*' && c != '/' {
			return left, nil
		}
		p.pos++
		right, err := p.unary()
		if err != nil {
			return nil, err
		}
		left = &FormulaNode{T: "op", O: string(c), A: []*FormulaNode{left, right}}
	}
}

func (p *formulaParser) unary() (*FormulaNode, error) {
	if p.peek() == '-' {
		p.pos++
		n, err := p.unary()
		if err != nil {
			return nil, err
		}
		return &FormulaNode{T: "neg", A: []*FormulaNode{n}}, nil
	}
	return p.power()
}

func (p *formulaParser) power() (*FormulaNode, error) {
	base, err := p.atom()
	if err != nil {
		return nil, err
	}
	if p.peek() != '^' {
		return base, nil
	}
	p.pos++
	exp, err := p.unary()
	if err != nil {
		return nil, err
	}
	return &FormulaNode{T: "op", O: "^", A: []*FormulaNode{base, exp}}, nil
}

func (p *formulaParser) atom() (*FormulaNode, error) {
	c := p.peek()
	switch {
	case c == 0:
		return nil, p.errorf("unexpected end")
	case c == '(':
		p.pos++
		n, err := p.expr()
		if err != nil {
			return nil, err
		}
		if p.peek() != ')' {
			return nil, p.errorf("missing ')'")
		}
		p.pos++
		return n, nil
	case c >= '0' && c <= '9' || c == '.':
		return p.number()
	case unicode.IsLetter(rune(c)) || c == '_':
		return p.identOrCall()
	}
	return nil, p.errorf("unexpected %q", string(c))
}

func (p *formulaParser) number() (*FormulaNode, error) {
	start := p.pos
	for p.pos < len(p.src) && (p.src[p.pos] >= '0' && p.src[p.pos] <= '9' || p.src[p.pos] == '.') {
		p.pos++
	}
	// Optional exponent: 1e9, 2.5e-3.
	if p.pos < len(p.src) && (p.src[p.pos] == 'e' || p.src[p.pos] == 'E') {
		q := p.pos + 1
		if q < len(p.src) && (p.src[q] == '+' || p.src[q] == '-') {
			q++
		}
		if q < len(p.src) && p.src[q] >= '0' && p.src[q] <= '9' {
			p.pos = q
			for p.pos < len(p.src) && p.src[p.pos] >= '0' && p.src[p.pos] <= '9' {
				p.pos++
			}
		}
	}
	v, err := strconv.ParseFloat(p.src[start:p.pos], 64)
	if err != nil {
		return nil, p.errorf("bad number %q", p.src[start:p.pos])
	}
	return &FormulaNode{T: "num", V: v}, nil
}

func (p *formulaParser) identOrCall() (*FormulaNode, error) {
	start := p.pos
	for p.pos < len(p.src) {
		r := rune(p.src[p.pos])
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_') {
			break
		}
		p.pos++
	}
	name := p.src[start:p.pos]
	if p.peek() != '(' {
		if !p.vars[name] {
			return nil, p.errorf("unknown identifier %q (not a numeric parameter of this desafio)", name)
		}
		return &FormulaNode{T: "var", N: name}, nil
	}
	arity, ok := formulaFuncs[name]
	if !ok {
		return nil, p.errorf("function %q is not allowed (use one of ceil, floor, round, min, max, log2)", name)
	}
	p.pos++ // '('
	var args []*FormulaNode
	for {
		a, err := p.expr()
		if err != nil {
			return nil, err
		}
		args = append(args, a)
		c := p.peek()
		if c == ',' {
			p.pos++
			continue
		}
		if c == ')' {
			p.pos++
			break
		}
		return nil, p.errorf("expected ',' or ')' in %s(...)", name)
	}
	if arity > 0 && len(args) != arity {
		return nil, p.errorf("%s takes %d argument(s), got %d", name, arity, len(args))
	}
	if arity == 0 && len(args) < 2 {
		return nil, p.errorf("%s takes at least 2 arguments", name)
	}
	return &FormulaNode{T: "fn", F: name, A: args}, nil
}

// Eval evaluates the AST with the given parameter values. It never panics:
// an unknown node or variable is an error, and the caller checks the result
// for NaN/Inf.
func (n *FormulaNode) Eval(vars map[string]float64) (float64, error) {
	switch n.T {
	case "num":
		return n.V, nil
	case "var":
		v, ok := vars[n.N]
		if !ok {
			return 0, fmt.Errorf("variable %q has no value", n.N)
		}
		return v, nil
	case "neg":
		v, err := n.A[0].Eval(vars)
		return -v, err
	case "op":
		a, err := n.A[0].Eval(vars)
		if err != nil {
			return 0, err
		}
		b, err := n.A[1].Eval(vars)
		if err != nil {
			return 0, err
		}
		switch n.O {
		case "+":
			return a + b, nil
		case "-":
			return a - b, nil
		case "*":
			return a * b, nil
		case "/":
			return a / b, nil
		case "^":
			return math.Pow(a, b), nil
		}
	case "fn":
		args := make([]float64, len(n.A))
		for i, a := range n.A {
			v, err := a.Eval(vars)
			if err != nil {
				return 0, err
			}
			args[i] = v
		}
		switch n.F {
		case "ceil":
			return math.Ceil(args[0]), nil
		case "floor":
			return math.Floor(args[0]), nil
		case "round":
			return math.Round(args[0]), nil
		case "log2":
			return math.Log2(args[0]), nil
		case "min", "max":
			r := args[0]
			for _, v := range args[1:] {
				if (n.F == "min" && v < r) || (n.F == "max" && v > r) {
					r = v
				}
			}
			return r, nil
		}
	}
	return 0, fmt.Errorf("invalid formula node %q", strings.TrimSpace(n.T+" "+n.O+n.F))
}
