// @ts-check
// Reestruturação da go-fintech (Fase A): os 8 marcos antigos mudaram de
// posição (03 -> 06, 04 -> 08 ... 08 -> 16), mas o progresso é guardado por id
// em tr:progress:go-fintech. Quem concluiu a trilha antiga continua com os
// mesmos marcos concluídos, agora nas posições novas, e os marcos novos
// começam em aberto.
const { test, expect } = require('@playwright/test');

const SLUG = 'go-fintech';
// id -> posição (1-based) na trilha de 16 marcos.
const ANTIGOS = {
  introducao: 1, fundamentos: 2, concorrencia: 6, 'rest-bff': 8,
  'grpc-antifraude': 10, 'production-observabilidade': 12, performance: 14, 'java-vs-go': 16,
};
const NOVOS = {
  'slices-maps-e-strings': 3, 'interfaces-e-tipos': 4, 'erros-defer-e-panic': 5,
  'goroutines-em-producao': 7, 'persistencia-e-transacoes': 9, 'testes-em-go': 11,
  'seguranca-e-cadeia-de-modulos': 13, 'estrutura-e-arquitetura': 15,
};

test('progresso salvo com os ids antigos marca os mesmos marcos, nas posições novas', async ({ page }) => {
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(({ slug, ids }) => {
    localStorage.clear();
    localStorage.setItem(`tr:progress:${slug}`, JSON.stringify(ids));
  }, { slug: SLUG, ids: Object.keys(ANTIGOS) });
  await page.reload();

  const nodes = page.locator('.timeline-node');
  await expect(nodes).toHaveCount(16);
  for (const [id, pos] of Object.entries(ANTIGOS)) {
    const node = nodes.nth(pos - 1);
    await expect(node, id).toHaveAttribute('data-id', id);
    await expect(node, id).toHaveClass(/done/);
  }
  for (const [id, pos] of Object.entries(NOVOS)) {
    const node = nodes.nth(pos - 1);
    await expect(node, id).toHaveAttribute('data-id', id);
    await expect(node, id).not.toHaveClass(/done/);
  }
  await expect(page.locator('.course-progress .progress-label')).toContainText('8 de 16');
});

test('pontes de outras trilhas chegam ao marco renumerado', async ({ page }) => {
  // system-design/12 cita `go-fintech/06` e a abreviação herdada `/10`.
  await page.goto('/#/learn/system-design');
  const node = page.locator('.timeline-node[data-id="caso-antifraude-em-tempo-real"]');
  await node.locator('.node-toggle').click();
  const body = node.locator('.node-body');
  await expect(body.locator('a[href="#/learn/go-fintech/concorrencia"]').first()).toBeVisible();
  await expect(body.locator('a[href="#/learn/go-fintech/grpc-antifraude"] code', { hasText: /^\/10$/ })).toBeVisible();
});
