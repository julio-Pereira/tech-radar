// @ts-check
// Walkthrough por eventos (PLANO Fase 1.7) on the real pilot: kubernetes,
// milestone "arquitetura", "Do kubectl apply ao Pod recebendo tráfego".
// Runs on the output of `go run .`, like diagram-real.spec.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SLUG = 'kubernetes';
const MARCO = 'arquitetura';
const WT = 'k8s-do-apply-ao-pod-ready';
const file = path.join(__dirname, '..', 'data', 'walkthroughs', `${SLUG}.json`);
const spec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).walkthroughs[WT] : null;
const TOTAL = spec ? spec.total : 0;
const ETAPAS = spec ? spec.etapas.length : 0;

/** @param {import('@playwright/test').Page} page */
async function watchCsp(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}

/** @param {import('@playwright/test').Page} page @param {string} [hash] */
async function open(page, hash = `#/learn/${SLUG}`) {
  await watchCsp(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${hash}`);
  const node = page.locator(`.timeline-node[data-id="${MARCO}"]`);
  if (!hash.includes(`/${MARCO}`)) await node.locator('.node-toggle').click();
  const figure = page.locator(`figure.walkthrough[data-walkthrough="${SLUG}/${WT}"]`);
  await expect(figure.locator('.wt-area svg')).toBeVisible().catch((err) => {
    throw new Error(`${err.message}\n${errors.join('\n')}`);
  });
  return figure;
}

const num = (figure) => figure.locator('.wt-num');

test('the build produced the pilot walkthrough', () => {
  expect(spec, 'run `go run .` in aggregator/ first').not.toBeNull();
  expect(TOTAL).toBe(19);
  expect(ETAPAS).toBe(7);
});

test('the player is downloaded only for a milestone with a walkthrough', async ({ page }) => {
  const loaded = [];
  page.on('request', (r) => { if (r.url().includes('walkthrough')) loaded.push(r.url()); });
  await page.goto('/#/learn/kafka');
  const node = page.locator('.timeline-node').first();
  await node.locator('.node-toggle').click();
  await expect(node.locator('figure.diagrama svg').first()).toBeVisible();
  expect(loaded).toEqual([]);
  await open(page);
  expect(loaded.some((u) => u.endsWith('/js/courses/walkthrough-player.js'))).toBe(true);
});

test.describe('Walkthrough player', () => {
  test('starts paused on event 1 and never advances on its own', async ({ page }) => {
    const figure = await open(page);
    await expect(num(figure)).toHaveText(`Evento 1 de ${TOTAL}`);
    await expect(figure.locator('.wt-etapa-pos')).toContainText(`Etapa 1 de ${ETAPAS}`);
    await expect(figure.locator('.wt-rota')).toHaveText('kubectl → kube-apiserver');
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa');
    await expect(figure.locator('.wt-ant')).toHaveAttribute('aria-disabled', 'true');
    await expect(figure.locator('.wt-trilha [aria-current="location"]')).toHaveText('Cluster');
    await expect(figure.locator('[data-aresta="kubectl>api"]')).toHaveClass(/diagrama-percorrida/);
    await page.waitForTimeout(3000);
    await expect(num(figure)).toHaveText(`Evento 1 de ${TOTAL}`);
  });

  test('the keyboard drives the whole walkthrough, PageUp/PageDown included', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.wt-area').focus();
    await page.keyboard.press('ArrowRight');
    await expect(num(figure)).toHaveText(`Evento 2 de ${TOTAL}`);
    await page.keyboard.press('PageDown');
    await expect(num(figure)).toHaveText(`Evento 4 de ${TOTAL}`);
    await expect(figure.locator('.wt-etapa-titulo')).toHaveText('Os controllers reagem');
    await page.keyboard.press('ArrowRight');
    // Mid-step, PageUp goes to the start of the current step; at its start,
    // to the previous step.
    await page.keyboard.press('PageUp');
    await expect(num(figure)).toHaveText(`Evento 4 de ${TOTAL}`);
    await page.keyboard.press('PageUp');
    await expect(num(figure)).toHaveText(`Evento 1 de ${TOTAL}`);
    await page.keyboard.press('End');
    await expect(num(figure)).toHaveText(`Evento ${TOTAL} de ${TOTAL}`);
    await expect(figure.locator('.wt-prox')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(num(figure)).toHaveText(`Evento ${TOTAL - 1} de ${TOTAL}`);
    await page.keyboard.press('Home');
    await expect(num(figure)).toHaveText(`Evento 1 de ${TOTAL}`);
    await page.keyboard.press(' ');
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Pausar');
    await page.keyboard.press(' ');
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa');
    // Every control is a real button, reachable by Tab.
    await expect(figure.locator('.wt-controles button')).toHaveCount(7);
  });

  test('aria-live announces each event, and the step title when the step changes', async ({ page }) => {
    const figure = await open(page);
    const vivo = figure.locator('.wt-lado [aria-live="polite"]');
    await expect(vivo).toHaveCount(1);
    await figure.locator('.wt-prox').click();
    await expect(vivo).toHaveText(`Evento 2 de ${TOTAL}. kube-apiserver para etcd. ${spec.etapas[0].eventos[1].msg}`);
    await figure.locator('.wt-etapa-prox').click();
    await expect(vivo).toHaveText(
      `Etapa 2 de ${ETAPAS}: Os controllers reagem. Evento 4 de ${TOTAL}. kube-apiserver para kube-controller-manager. ${spec.etapas[1].eventos[0].msg}`,
    );
  });

  test('play runs to the end of the current step and stops there', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.wt-velocidade').click(); // 2×: 1,25 s per event
    await figure.locator('.wt-play').click();
    await expect(num(figure)).toHaveText(`Evento 3 de ${TOTAL}`, { timeout: 6000 });
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa', { timeout: 3000 });
    await page.waitForTimeout(2000);
    await expect(num(figure)).toHaveText(`Evento 3 de ${TOTAL}`);
    // Play again at the end of a step starts the next one.
    await figure.locator('.wt-play').click();
    await expect(num(figure)).toHaveText(`Evento 4 de ${TOTAL}`);
    await figure.locator('.wt-play').click();
  });

  test('a deep link opens paused on its event, and moving replaces the entry', async ({ page }) => {
    await page.goto(`/#/learn/${SLUG}`);
    const before = await page.evaluate(() => history.length);
    const figure = await open(page, `#/learn/${SLUG}/${MARCO}/wt/${WT}/14`);
    await expect(num(figure)).toHaveText(`Evento 14 de ${TOTAL}`);
    await expect(figure.locator('.wt-trilha li')).toHaveText(['Cluster', 'fin-platform-worker2']);
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa');
    await expect(figure).toBeInViewport();
    const entries = await page.evaluate(() => history.length);
    expect(entries).toBe(before + 1);
    await figure.locator('.wt-prox').click();
    await figure.locator('.wt-prox').click();
    await expect(page).toHaveURL(new RegExp(`#/learn/${SLUG}/${MARCO}/wt/${WT}/16$`));
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test('switching to Sequência keeps the event, and back', async ({ page }) => {
    const figure = await open(page, `#/learn/${SLUG}/${MARCO}/wt/${WT}/9`);
    await figure.locator('.wt-aba', { hasText: 'Sequência' }).click();
    await expect(figure.locator('.wt-aba', { hasText: 'Sequência' })).toHaveAttribute('aria-selected', 'true');
    await expect(num(figure)).toHaveText(`Evento 9 de ${TOTAL}`);
    const svg = figure.locator('.wt-area svg');
    await expect(svg).toHaveAttribute('data-tipo', 'sequencia');
    // Event 9 is the 2nd of its step: message 1 is lit, nothing after it shows.
    await expect(svg.locator('[data-msg="1"]')).toHaveClass(/diagrama-percorrida/);
    await page.keyboard.press('ArrowLeft'); // on the tab: back to Topologia
    await expect(figure.locator('.wt-area svg')).toHaveAttribute('data-tipo', 'topologia');
    await expect(num(figure)).toHaveText(`Evento 9 de ${TOTAL}`);
    await expect(figure.locator('[data-aresta="sched>api"]')).toHaveClass(/diagrama-percorrida/);
  });

  test('the panel is closed by default and highlights the event lines', async ({ page }) => {
    const figure = await open(page, `#/learn/${SLUG}/${MARCO}/wt/${WT}/9`);
    const painel = figure.locator('.wt-painel');
    await expect(painel).not.toHaveAttribute('open', '');
    await painel.locator('summary').click();
    await expect(painel.locator('.wt-linha-on')).toHaveText([/resources:/, /requests: \{ cpu: 250m/]);
    await figure.locator('.wt-prox').click();
    await expect(painel.locator('.wt-linha-on')).toHaveText([/Successfully assigned payments\/pix-gateway-7c9d6f-x2k8p to fin-platform-worker2/]);
    await figure.locator('.wt-ant').click();
    await figure.locator('.wt-ant').click(); // event 8 has no panel
    await expect(painel).toBeHidden();
  });

  test('Ampliar opens the view with its own card and controls, in sync with the figure', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    const figure = await open(page, `#/learn/${SLUG}/${MARCO}/wt/${WT}/9`);
    await figure.locator('.diagrama-ampliar').click();
    const dialog = page.locator('dialog.diagrama-dialogo');
    await expect(dialog).toBeVisible();
    // The page behind a modal dialog is inert: the dialog has the controls.
    const bar = dialog.locator('.wt-zoom');
    await expect(bar.locator('.wt-controles button')).toHaveCount(7);
    await expect(bar.locator('.wt-num')).toHaveText(`Evento 9 de ${TOTAL}`);
    await expect(dialog.locator('[data-aresta="sched>api"]')).toHaveClass(/diagrama-percorrida/);
    await expect(bar.locator('[aria-live="polite"]')).toHaveCount(1);

    // Next crosses into the node layer: the zoomed view follows it.
    await bar.locator('.wt-prox').click();
    await expect(bar.locator('.wt-num')).toHaveText(`Evento 10 de ${TOTAL}`);
    await expect(dialog.locator('svg [data-id="kubelet"]')).toHaveCount(1);
    await expect(dialog.locator('[data-aresta="api>kubelet"]')).toHaveClass(/diagrama-percorrida/);
    await expect(dialog.locator('h2')).toHaveText(/kubelet puxa o trabalho/);
    await expect(dialog.locator('svg')).toHaveCount(1);

    // The keyboard works on the dialog's controls too.
    await bar.locator('.wt-prox').focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar.locator('.wt-num')).toHaveText(`Evento 11 de ${TOTAL}`);

    // Play runs inside the dialog and stops at the end of the step.
    await bar.locator('.wt-velocidade').click(); // 2×
    await bar.locator('.wt-play').click();
    await expect(bar.locator('.wt-play')).toHaveAttribute('aria-label', 'Pausar');
    await expect(bar.locator('.wt-num')).toHaveText(`Evento 12 de ${TOTAL}`, { timeout: 4000 });
    await expect(bar.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa', { timeout: 4000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    // Closing keeps the event in the figure and gives the focus back.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(dialog.locator('.wt-zoom')).toHaveCount(0);
    await expect(figure.locator('.diagrama-ampliar')).toBeFocused();
    await expect(num(figure)).toHaveText(`Evento 12 de ${TOTAL}`);
    await expect(figure.locator('.wt-velocidade')).toHaveText('2×');

    // Opened again, it starts on the current event, with one set of controls.
    await figure.locator('.diagrama-ampliar').click();
    await expect(dialog.locator('.wt-zoom')).toHaveCount(1);
    await expect(dialog.locator('.wt-zoom .wt-num')).toHaveText(`Evento 12 de ${TOTAL}`);
    await expect(dialog.locator('[data-id="pod"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('with reduced motion nothing animates, not even the change of layer', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page);
    // Nothing outside the player either: the header's active link has no
    // transition (it used to fade its color on every route change).
    expect(await page.locator('.nav-link').first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
    for (let i = 0; i < 12; i++) {
      await figure.locator('.wt-prox').click();
      expect(await page.evaluate(() => document.getAnimations().map((a) => {
        const t = /** @type {any} */ (a.effect)?.target;
        return `${a.constructor.name} ${/** @type {any} */ (a).animationName || /** @type {any} */ (a).transitionProperty || ''} ${t ? t.className?.baseVal ?? t.className : ''}`;
      }))).toEqual([]);
    }
    await expect(figure.locator('.wt-trilha [aria-current="location"]')).toHaveText('fin-platform-worker2');
  });

  test('no CSP violation and no style attribute with the player running', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.wt-play').click();
    await page.waitForTimeout(1200);
    await figure.locator('.wt-etapa-prox').click();
    await figure.locator('.wt-etapa-prox').click();
    await figure.locator('.wt-etapa-prox').click();
    await figure.locator('.wt-aba', { hasText: 'Sequência' }).click();
    await figure.locator('.wt-prox').click();
    // No style attribute anywhere on the page, the course's progress bar
    // included (a native <progress> since the walkthrough audit).
    expect(await page.evaluate(() => [...document.querySelectorAll('[style]')]
      .map((e) => e.outerHTML.slice(0, 120)))).toEqual([]);
    // @ts-ignore
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('pauses when the tab is hidden', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.wt-play').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(figure.locator('.wt-play')).toHaveAttribute('aria-label', 'Reproduzir até o fim da etapa');
  });

  test('at 360px: sticky view up to 45vh, no sideways scroll, labels inside the drawing', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    const figure = await open(page);
    const visao = figure.locator('.wt-visao');
    expect(await visao.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
    const area = await figure.locator('.wt-area').boundingBox();
    expect(area && area.height).toBeLessThanOrEqual(760 * 0.45 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

// The same legibility rule as diagram-real.spec.js, on what every compiled
// walkthrough draws: its layers and every derived sequence, at every event,
// plus no CSP violation, on a desktop and at 360px.
const wtDir = path.join(__dirname, '..', 'data', 'walkthroughs');
const all = fs.existsSync(wtDir) ? fs.readdirSync(wtDir).filter((f) => f.endsWith('.json')).flatMap((f) => {
  const slug = f.slice(0, -5);
  const course = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'courses', `${slug}.json`), 'utf8'));
  return Object.values(JSON.parse(fs.readFileSync(path.join(wtDir, f), 'utf8')).walkthroughs).map((/** @type {any} */ w) => ({
    slug, w,
    marco: course.milestones.find((/** @type {any} */ m) => JSON.stringify(m).includes(`data-walkthrough=\\"${slug}/${w.id}\\"`))?.id,
  }));
}) : [];

test('every compiled walkthrough is cited by a milestone', () => {
  expect(all.length).toBeGreaterThan(1);
  for (const { slug, w, marco } of all) expect(marco, `${slug}/${w.id}`).toBeTruthy();
});

for (const { slug, w, marco } of all) {
  for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['360px', { width: 360, height: 760 }]]) {
    test(`${slug}/${w.id} (${label}): every view keeps its labels inside the viewBox`, async ({ page }) => {
      await page.setViewportSize(vp);
      await watchCsp(page);
      await page.goto(`/#/learn/${slug}/${marco}/wt/${w.id}/1`);
      const figure = page.locator(`figure.walkthrough[data-walkthrough="${slug}/${w.id}"]`);
      await expect(figure.locator('.wt-area svg')).toBeVisible();
      const problems = [];
      for (const aba of ['Topologia', 'Sequência']) {
        await figure.locator('.wt-aba', { hasText: aba }).click();
        await figure.locator('.wt-area').focus();
        await page.keyboard.press('Home');
        for (let n = 1; n <= w.total; n++) {
          problems.push(...await figure.evaluate((fig, where) => {
            const out = [];
            const svg = /** @type {SVGSVGElement} */ (fig.querySelector('.wt-area svg'));
            const box = svg.getBoundingClientRect();
            for (const t of svg.querySelectorAll('text')) {
              if (t.closest('.diagrama-oculto')) continue;
              const r = t.getBoundingClientRect();
              if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
                out.push(`${where}: "${t.textContent}" sai do viewBox`);
              }
            }
            // A node carries at most one state mark, however many events
            // re-apply the cumulative states.
            for (const t of svg.querySelectorAll('.diagrama-no-rotulo')) {
              if (/^[●+↓∅✕○★▶] [●+↓∅✕○★▶] /.test(t.textContent || '')) out.push(`${where}: marca repetida em "${t.textContent}"`);
            }
            return out;
          }, `${aba} evento ${n}`));
          if (n < w.total) await page.keyboard.press('ArrowRight');
        }
      }
      expect(problems).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // @ts-ignore
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
    });
  }
}

// Ajustes pós-Fase 1.7, frente 3: a request that got no answer is a timeout,
// never a reply drawn for an absence. Every compiled timeout event, in both
// views, with normal motion: no packet, and "sem resposta" said in text.
const timeouts = all.flatMap(({ slug, w, marco }) => w.etapas.flatMap((e) => e.eventos)
  .filter((/** @type {any} */ ev) => ev.tipo === 'timeout').map((/** @type {any} */ ev) => ({ slug, w, marco, ev })));

test('the pilots of open-finance and system-design model the absence as a timeout', () => {
  // The two events fixed in frente 3 stay timeouts; new walkthroughs may add more.
  const ids = timeouts.map((t) => `${t.slug}/${t.w.id}`);
  expect(ids).toContain('open-finance-brasil/of-iniciacao-ponta-a-ponta');
  expect(ids).toContain('system-design/sd-pix-resultado-desconhecido');
});

/**
 * What moves inside the walkthrough figure, named: Web Animations (packets)
 * and CSS animations (the layer crossfade). CSS transitions of color and
 * stroke are styling, not motion, and the page around the figure (an
 * animated Fase 1.6 diagram in the same milestone, the header) is not the
 * walkthrough's.
 */
const running = (/** @type {import('@playwright/test').Locator} */ figure) => figure.evaluate((fig) => fig.getAnimations({ subtree: true })
  .filter((a) => !(a instanceof CSSTransition))
  .map((a) => {
    const t = /** @type {any} */ (a.effect)?.target;
    return `${a.constructor.name} ${/** @type {any} */ (a).animationName || ''} ${t ? (t.className?.baseVal ?? t.className) : ''}`.trim();
  }));

for (const { slug, w, marco, ev } of timeouts) {
  test(`${slug}/${w.id}: event ${ev.n} (timeout) moves nothing and says "sem resposta"`, async ({ page }) => {
    await watchCsp(page);
    // Arrive on the event before, then step into the timeout as a reader would.
    await page.goto(`/#/learn/${slug}/${marco}/wt/${w.id}/${ev.n - 1}`);
    const figure = page.locator(`figure.walkthrough[data-walkthrough="${slug}/${w.id}"]`);
    await expect(figure.locator('.wt-area svg')).toBeVisible();
    // By keyboard: a mouse click would start the button's hover transition,
    // which is not the player's.
    await figure.locator('.wt-area').focus();
    // The event before has settled (its crossfade on arrival is over).
    await expect.poll(() => running(figure)).toEqual([]);
    await page.keyboard.press('ArrowRight');
    await expect(num(figure)).toHaveText(`Evento ${ev.n} de ${w.total}`);
    // Normal motion: any other event would be moving a packet right now.
    expect(await running(figure)).toEqual([]);
    const de = w.atores.find((/** @type {any} */ a) => a.id === ev.de).rotulo;
    const para = w.atores.find((/** @type {any} */ a) => a.id === ev.para).rotulo;
    await expect(figure.locator('.wt-rota')).toHaveText(`${de} ⇢ ${para} · sem resposta`);
    await expect(figure.locator('.wt-lado [aria-live="polite"]')).toContainText(`Sem resposta de ${para} para ${de}. ${ev.msg}`);
    const edge = figure.locator(`.wt-area [data-aresta="${ev.de}>${ev.para}"]`);
    await expect(edge).toHaveClass(/wt-sem-resposta/);
    await expect(edge.locator('.wt-marca-timeout')).toHaveText('✕ sem resposta');

    await figure.locator('.wt-aba', { hasText: 'Sequência' }).click();
    const msg = figure.locator('.wt-area .diagrama-mensagem--timeout');
    await expect(msg).toHaveCount(1);
    await expect(msg).toHaveClass(/diagrama-percorrida/);
    await expect(msg.locator('text')).toHaveText(['✕', 'sem resposta']);
    expect(await msg.locator('line').getAttribute('marker-end')).toBeNull();
    // The view swap fades in; once it is done, nothing runs on the timeout.
    await expect.poll(() => running(figure)).toEqual([]);

    await expect(figure.locator('.walkthrough-descricao')).toContainText(`${de} → ${para} (sem resposta): ${ev.msg}`, { useInnerText: false });
    // @ts-ignore
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });
}
