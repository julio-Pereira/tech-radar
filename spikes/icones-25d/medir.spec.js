// @ts-check
// Spike "2.5D leve" (Fase 1.8, plano §3.4). Compara, sobre os mesmos três
// diagramas de camada, a variante A (plana: forma e ícone, a de produção) e
// a B (2.5D leve: profundidade.js). Mede, em desktop (1280) e em 360 px:
// rótulos e faces dentro do viewBox, contraste (axe, color-contrast) e as
// capturas lado a lado em capturas/. O site tem um tema só (auditoria §1).
const { test, expect } = require('../../web/node_modules/@playwright/test');
const AxeBuilder = require('../../web/node_modules/@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CASOS = [
  { id: 'k8s-wt-cluster', hash: '#/learn/kubernetes/arquitetura/wt/k8s-do-apply-ao-pod-ready/1', wt: 'kubernetes/k8s-do-apply-ao-pod-ready' },
  { id: 'sd-wt-falha', hash: '#/learn/system-design/caso-pix-ponta-a-ponta/wt/sd-pix-resultado-desconhecido/1', wt: 'system-design/sd-pix-resultado-desconhecido' },
  { id: 'ae-wt-saga', hash: '#/learn/arquitetura-eventos/sagas/wt/ae-saga-sem-resposta/1', wt: 'arquitetura-eventos/ae-saga-sem-resposta' },
];
const LARGURAS = [1280, 360];
const OUT = path.join(__dirname, 'capturas');
const resultados = [];

/** A variante B, injetada: o mesmo código de profundidade.js, com o tom calculado. */
function aplicarB(svg) {
  for (const s of svg.querySelectorAll('.diagrama-no-caixa')) {
    const face = /** @type {SVGElement} */ (s.cloneNode());
    // rgb(34, 38, 58) ou, de um color-mix, color(srgb 0.2 0.22 0.4).
    const fill = getComputedStyle(s).fill;
    const n = (fill.match(/[\d.]+/g) || ['34', '38', '58']).map(Number);
    const [r, g, b] = fill.startsWith('color(') ? n.map((v) => v * 255) : n;
    face.setAttribute('class', 'diagrama-no-profundidade');
    face.setAttribute('transform', 'translate(5 5)');
    face.setAttribute('stroke', 'none');
    face.setAttribute('fill', `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`);
    face.setAttribute('aria-hidden', 'true');
    s.before(face);
  }
}

/** Rótulos e faces fora do viewBox, com a mesma faixa de diagram-real.spec.js. */
function foraDoViewBox(svg) {
  const box = svg.getBoundingClientRect();
  const out = [];
  for (const t of svg.querySelectorAll('text')) {
    const b = t.getBoundingClientRect();
    const m = /** @type {SVGTextElement} */ (t).getScreenCTM();
    const k = m ? Math.hypot(m.a, m.b) : 1;
    const w = /** @type {SVGTextElement} */ (t).getComputedTextLength() * k;
    const cx = (b.left + b.right) / 2;
    if (cx - w / 2 < box.left - 1 || cx + w / 2 > box.right + 1) out.push(`rótulo "${t.textContent}"`);
  }
  for (const f of svg.querySelectorAll('.diagrama-no-profundidade')) {
    const b = f.getBoundingClientRect();
    if (b.right > box.right + 1 || b.bottom > box.bottom + 1) out.push(`face de ${f.closest('[data-id]')?.getAttribute('data-id')}`);
  }
  return out;
}

for (const caso of CASOS) {
  for (const largura of LARGURAS) {
    test(`${caso.id} em ${largura}px: A e B`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/${caso.hash}`);
      const fig = page.locator(`figure.walkthrough[data-walkthrough="${caso.wt}"]`);
      const area = fig.locator('.wt-area');
      await expect(area.locator('svg [data-id]').first()).toBeVisible();
      await expect(area.locator('svg[data-ajustado]')).toHaveCount(1);

      for (const variante of ['A', 'B']) {
        if (variante === 'B') await area.locator('svg').evaluate(aplicarB);
        const fora = await area.locator('svg').evaluate(foraDoViewBox);
        const axe = await new AxeBuilder({ page }).include(`figure.walkthrough[data-walkthrough="${caso.wt}"] .wt-area`)
          .withRules(['color-contrast']).analyze();
        await area.screenshot({ path: path.join(OUT, `${caso.id}-${largura}-${variante}.png`) });
        resultados.push({ diagrama: caso.id, largura, variante, fora, contraste: axe.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))) });
      }
    });
  }
}

test.afterAll(() => {
  // Custo em produção da variante B: a função em diagram.js e uma regra CSS.
  const js = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'js', 'courses', 'diagram.js'));
  const fn = fs.readFileSync(path.join(__dirname, 'profundidade.js'), 'utf8').replace(/^\/\/.*\n/gm, '');
  const css = '.diagrama-no-profundidade { fill: color-mix(in srgb, var(--surface2) 55%, black); }\n';
  const bytes = zlib.gzipSync(Buffer.concat([js, Buffer.from(fn + css)])).length - zlib.gzipSync(js).length;
  fs.writeFileSync(path.join(__dirname, 'resultados.json'), `${JSON.stringify({ bytesGzipB: bytes, resultados }, null, 2)}\n`);
});
