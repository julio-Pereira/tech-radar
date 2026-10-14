// @ts-check
const { test, expect } = require('@playwright/test');

// arquitetura-de-software/01 has an ungated 4-question quiz; .../02 has
// `completion: quiz` with 6 questions. Answer indices are read from the
// compiled JSON at test time (the build shuffles options deterministically,
// so the index is stable, but we never hardcode it — content can change).
const SLUG = 'arquitetura-de-software';
const UNGATED_ID = 'estilos-arquiteturais';
const GATED_ID = 'atributos-de-qualidade';

async function loadQuiz(page, milestoneId) {
  const course = await page.request.get(`/data/courses/${SLUG}.json`).then((r) => r.json());
  const milestone = course.milestones.find((m) => m.id === milestoneId);
  if (!milestone) throw new Error(`milestone ${milestoneId} not found in ${SLUG}`);
  return milestone;
}

/** Answers every question of the quiz inside `node` correctly, then checks. */
async function answerAllCorrectly(node, milestone) {
  const fieldsets = node.locator('.quiz-question');
  for (let qi = 0; qi < milestone.quiz.length; qi++) {
    const correctIdx = milestone.quiz[qi].answer;
    await fieldsets.nth(qi).locator('.quiz-option input[type="radio"]').nth(correctIdx).check();
  }
  await node.locator('.quiz-check-btn').click();
}

test.describe('Quiz', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/#/learn/${SLUG}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('ungated milestone: can be marked complete without ever touching the quiz', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();

    const checkbox = node.locator('.node-check');
    await expect(checkbox).toBeEnabled();
    await checkbox.check(); // no quiz answered yet — must still succeed
    await expect(checkbox).toBeChecked();

    await answerAllCorrectly(node, milestone);
    await expect(node.locator('.quiz-score')).toContainText(`${milestone.quiz.length} de ${milestone.quiz.length}`);
    await expect(checkbox).toBeChecked();
  });

  test('gated milestone: checkbox stays locked until every answer is right', async ({ page }) => {
    const milestone = await loadQuiz(page, GATED_ID);
    const node = page.locator(`.timeline-node[data-id="${GATED_ID}"]`);
    await node.locator('.node-toggle').click();

    const checkbox = node.locator('.node-check');
    const label = node.locator('.node-complete label');
    await expect(checkbox).toBeDisabled();
    await expect(label).toContainText('Acerte o quiz');

    // Answer everything wrong on purpose: pick the option after the correct one
    // (wrapping to 0), so the gate stays locked.
    const fieldsets = node.locator('.quiz-question');
    for (let qi = 0; qi < milestone.quiz.length; qi++) {
      const options = milestone.quiz[qi].options;
      const wrongIdx = (milestone.quiz[qi].answer + 1) % options.length;
      await fieldsets.nth(qi).locator('.quiz-option input[type="radio"]').nth(wrongIdx).check();
    }
    await node.locator('.quiz-check-btn').click();
    await expect(checkbox).toBeDisabled();

    await node.locator('.quiz-retry-btn').click();
    await answerAllCorrectly(node, milestone);

    await expect(checkbox).toBeEnabled();
    await expect(label).toContainText('Marcar como concluído');
  });

  test('retry clears previous answers and re-enables the check button', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();
    await answerAllCorrectly(node, milestone);

    await expect(node.locator('.quiz-check-btn')).toBeHidden();
    await node.locator('.quiz-retry-btn').click();
    await expect(node.locator('.quiz-check-btn')).toBeVisible();
    await expect(node.locator('.quiz-score')).toHaveText('');
  });
});

// UX item 18: persist best score/date, and "refazer só as erradas" only
// re-opens the questions that were actually wrong.
test.describe('Quiz persistence (UX item 18)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/#/learn/${SLUG}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('no best-score line on a first visit, then it appears and persists across reloads', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();
    await expect(node.locator('.milestone-quiz-best')).toHaveCount(0);

    await answerAllCorrectly(node, milestone);
    await expect(node.locator('.quiz-score')).toContainText(`${milestone.quiz.length} de ${milestone.quiz.length}`);

    await page.reload();
    await node.locator('.node-toggle').click();
    await expect(node.locator('.milestone-quiz-best')).toContainText(`${milestone.quiz.length} de ${milestone.quiz.length}`);
  });

  test('a later worse attempt does not overwrite the best score', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();
    await answerAllCorrectly(node, milestone);

    await node.locator('.quiz-retry-btn').click();
    // Answer everything wrong this time.
    const fieldsets = node.locator('.quiz-question');
    for (let qi = 0; qi < milestone.quiz.length; qi++) {
      const wrongIdx = (milestone.quiz[qi].answer + 1) % milestone.quiz[qi].options.length;
      await fieldsets.nth(qi).locator('.quiz-option input[type="radio"]').nth(wrongIdx).check();
    }
    await node.locator('.quiz-check-btn').click();

    await page.reload();
    await node.locator('.node-toggle').click();
    await expect(node.locator('.milestone-quiz-best')).toContainText(`${milestone.quiz.length} de ${milestone.quiz.length}`);
  });

  test('"refazer só as erradas" only re-opens the wrong questions, leaving correct ones locked', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();

    const fieldsets = node.locator('.quiz-question');
    // Get the first question wrong, the rest right.
    for (let qi = 0; qi < milestone.quiz.length; qi++) {
      const idx = qi === 0
        ? (milestone.quiz[qi].answer + 1) % milestone.quiz[qi].options.length
        : milestone.quiz[qi].answer;
      await fieldsets.nth(qi).locator('.quiz-option input[type="radio"]').nth(idx).check();
    }
    await node.locator('.quiz-check-btn').click();

    const retryWrongBtn = node.locator('.quiz-retry-wrong-btn');
    await expect(retryWrongBtn).toBeVisible();
    await retryWrongBtn.click();

    // Question 0's inputs are re-enabled; the rest stay disabled (still correct).
    await expect(fieldsets.nth(0).locator('.quiz-option input').first()).toBeEnabled();
    if (milestone.quiz.length > 1) {
      await expect(fieldsets.nth(1).locator('.quiz-option input').first()).toBeDisabled();
      await expect(fieldsets.nth(1).locator('.quiz-option.correct')).toHaveCount(1);
    }

    // Answering question 0 correctly now should reach a perfect score.
    await fieldsets.nth(0).locator('.quiz-option input[type="radio"]').nth(milestone.quiz[0].answer).check();
    await node.locator('.quiz-check-btn').click();
    await expect(node.locator('.quiz-score')).toContainText(`${milestone.quiz.length} de ${milestone.quiz.length}`);
  });

  test('"refazer só as erradas" is hidden on a perfect score', async ({ page }) => {
    const milestone = await loadQuiz(page, UNGATED_ID);
    const node = page.locator(`.timeline-node[data-id="${UNGATED_ID}"]`);
    await node.locator('.node-toggle').click();
    await answerAllCorrectly(node, milestone);
    await expect(node.locator('.quiz-retry-wrong-btn')).toBeHidden();
  });
});
