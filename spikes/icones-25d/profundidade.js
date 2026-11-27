// Variante B do spike "2.5D leve" (Fase 1.8, plano §3.4): uma face lateral e
// inferior por nó, o mesmo contorno deslocado 5 px, atrás da forma, num tom
// mais escuro do preenchimento. Sem projeção isométrica e sem mudar layout.
// Em produção seria uma classe CSS com color-mix; no spike o tom é calculado
// aqui, porque o spike injeta a variante numa página com CSP (sem <style>).
export function profundidade(svg, offset = 5) {
  for (const s of svg.querySelectorAll('.diagrama-no-caixa')) {
    const face = s.cloneNode();
    face.setAttribute('class', 'diagrama-no-profundidade');
    face.setAttribute('transform', `translate(${offset} ${offset})`);
    face.setAttribute('stroke', 'none');
    face.setAttribute('aria-hidden', 'true');
    s.before(face);
  }
}
