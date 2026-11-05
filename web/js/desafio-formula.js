// @ts-check
// Interpreter for the desafio formula AST that the aggregator compiles
// (aggregator/internal/course/desafio_formula.go). A plain tree walk over a
// closed set of node shapes: no eval, no new Function, no property lookup by
// name on anything but the parameter map. An unknown node is an error, never
// executed. Pure — no DOM — so it runs under `node --test`.

/** @typedef {{ t: string, v?: number, n?: string, o?: string, f?: string, a?: FormulaNode[] }} FormulaNode */

const FUNCS = {
  ceil: (a) => Math.ceil(a[0]),
  floor: (a) => Math.floor(a[0]),
  // Same as Go's math.Round: half away from zero (Math.round rounds -2.5 to -2).
  round: (a) => Math.sign(a[0]) * Math.round(Math.abs(a[0])),
  log2: (a) => Math.log2(a[0]),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
};

/**
 * @param {FormulaNode} node
 * @param {Record<string, number>} vars numeric parameter values
 * @returns {number}
 */
export function evalFormula(node, vars) {
  if (!node || typeof node !== 'object') throw new Error('nó de fórmula inválido');
  switch (node.t) {
    case 'num':
      return Number(node.v || 0);
    case 'var': {
      if (!node.n || !Object.prototype.hasOwnProperty.call(vars, node.n)) {
        throw new Error(`parâmetro sem valor: ${node.n}`);
      }
      return Number(vars[node.n]);
    }
    case 'neg':
      return -evalFormula(arg(node, 0), vars);
    case 'op': {
      const a = evalFormula(arg(node, 0), vars);
      const b = evalFormula(arg(node, 1), vars);
      switch (node.o) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return a ** b;
        default: throw new Error(`operador desconhecido: ${node.o}`);
      }
    }
    case 'fn': {
      if (!node.f || !Object.prototype.hasOwnProperty.call(FUNCS, node.f)) {
        throw new Error(`função desconhecida: ${node.f}`);
      }
      const args = (node.a || []).map((n) => evalFormula(n, vars));
      return FUNCS[node.f](args);
    }
    default:
      throw new Error(`nó de fórmula desconhecido: ${node.t}`);
  }
}

function arg(node, i) {
  const a = node.a && node.a[i];
  if (!a) throw new Error('nó de fórmula sem argumento');
  return a;
}
