// @ts-check
// Campo opcional `code` de uma questão de quiz ("o que este código imprime?"):
// aparece num <pre><code> com as quebras de linha preservadas, no quiz do
// marco e no cartão de #/revisar, e nunca é interpretado como HTML.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const SLUG = 'go-fintech';
const MARCO = 'slices-maps-e-strings';

test('o quiz do marco mostra o trecho de código com as linhas preservadas', async ({ page }) => {
  const course = await (await page.request.get(`/data/courses/${SLUG}.json`)).json();
  const quiz = course.milestones.find((m) => m.id === MARCO).quiz;
  const comCodigo = quiz.filter((q) => q.code);
  expect(comCodigo.length).toBeGreaterThanOrEqual(5);

  await page.goto(`/#/learn/${SLUG}/${MARCO}`);
  const node = page.locator(`.timeline-node[data-id="${MARCO}"]`);
  const blocos = node.locator('.milestone-quiz .quiz-question pre.quiz-code code');
  await expect(blocos).toHaveCount(comCodigo.length);
  const primeiro = await blocos.first().evaluate((el) => el.textContent);
  expect(primeiro).toBe(quiz.find((q) => q.code).code);
  expect(primeiro.split('\n').length).toBeGreaterThan(3);
  // O trecho rola dentro da própria caixa; a página não ganha scroll lateral.
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const results = await new AxeBuilder({ page }).include('.milestone-quiz').analyze();
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('o cartão de revisão mostra o código como texto, nunca como HTML', async ({ page }) => {
  const item = {
    slug: SLUG, marcoId: 'introducao', milestoneTitle: 'Introdução',
    question: 'O que este código imprime?', code: 'fmt.Println("<b>oi</b>")\nfmt.Println(1)',
    options: ['oi', '<b>oi</b> e 1'], answer: 1, explanation: 'Texto puro.',
  };
  await page.goto('/#/revisar');
  await page.evaluate((slug) => {
    localStorage.clear();
    localStorage.setItem(`tr:progress:${slug}`, JSON.stringify(['introducao']));
  }, SLUG);
  await page.route('**/data/quiz-bank.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [item] }),
  }));
  await page.route('**/data/glossary.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }),
  }));
  await page.reload();

  const code = page.locator('.review-card pre.quiz-code code');
  await expect(code).toHaveCount(1);
  expect(await code.evaluate((el) => el.textContent)).toBe(item.code);
  await expect(page.locator('.review-card pre.quiz-code b')).toHaveCount(0);
});
