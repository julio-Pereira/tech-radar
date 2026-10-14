// @ts-check
// Self-assessment: answers themselves are never persisted, so
// `tr:progress:<slug>` stays the single source of truth for progress — only
// the outcome (best score, when) is (UX item 18, `tr:quiz:<slug>` via
// storage.js). Question/option text is set via textContent — quiz content
// is plain text and never interpreted as HTML.
import { getQuizHistory, saveQuizAttempt } from '../storage.js';

/** @typedef {import('../types.js').Milestone} Milestone */

/**
 * @param {Milestone} milestone
 * @param {(() => void) | null} onPass called once the reader gets every question
 *   right — used by `completion: quiz` to unlock the complete checkbox.
 */
export function buildQuiz(slug, milestone, onPass) {
  const section = document.createElement('section');
  section.className = 'milestone-quiz';

  const heading = document.createElement('p');
  heading.className = 'milestone-quiz-title';
  heading.textContent = `Quiz · ${milestone.quiz.length} pergunta${milestone.quiz.length === 1 ? '' : 's'}`;
  section.appendChild(heading);

  const best = getQuizHistory(slug)[milestone.id];
  if (best) {
    const bestLine = document.createElement('p');
    bestLine.className = 'milestone-quiz-best';
    const date = new Date(best.lastAttemptAt).toLocaleDateString('pt-BR');
    bestLine.textContent = `Sua melhor nota: ${best.bestScore} de ${best.total} (${date})`;
    section.appendChild(bestLine);
  }

  const name = `quiz-${slug}-${milestone.id}`;
  /** @type {{ inputs: HTMLInputElement[], answer: number, explanation: HTMLElement }[]} */
  const questions = [];

  milestone.quiz.forEach((q, qi) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'quiz-question';

    const legend = document.createElement('legend');
    legend.textContent = `${qi + 1}. ${q.question}`;
    fieldset.appendChild(legend);

    const inputs = [];
    q.options.forEach((option, oi) => {
      const row = document.createElement('div');
      row.className = 'quiz-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${name}-${qi}`;
      input.id = `${name}-${qi}-${oi}`;
      input.value = String(oi);

      const label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = option;

      row.append(input, label);
      fieldset.appendChild(row);
      inputs.push(input);
    });

    const explanation = document.createElement('p');
    explanation.className = 'quiz-explanation hidden';
    explanation.textContent = q.explanation || '';
    fieldset.appendChild(explanation);

    section.appendChild(fieldset);
    questions.push({ inputs, answer: q.answer, explanation });
  });

  const actions = document.createElement('div');
  actions.className = 'quiz-actions';

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'quiz-check-btn';
  checkBtn.textContent = 'Verificar respostas';

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'quiz-retry-btn hidden';
  retryBtn.textContent = 'Refazer tudo';

  const retryWrongBtn = document.createElement('button');
  retryWrongBtn.type = 'button';
  retryWrongBtn.className = 'quiz-retry-wrong-btn hidden';
  retryWrongBtn.textContent = 'Refazer só as erradas';

  const score = document.createElement('span');
  score.className = 'quiz-score';
  score.setAttribute('role', 'status');

  actions.append(checkBtn, retryBtn, retryWrongBtn, score);
  section.appendChild(actions);

  checkBtn.addEventListener('click', () => {
    let correct = 0;
    let answered = 0;
    for (const q of questions) {
      // Already-correct questions from a "refazer só as erradas" pass stay
      // disabled and checked — findIndex still reports their chosen option,
      // so re-scoring the whole set here is safe either way.
      const chosen = q.inputs.findIndex((i) => i.checked);
      if (chosen >= 0) answered++;
      q.inputs.forEach((input, oi) => {
        input.disabled = true;
        const row = input.parentElement;
        // Always reveal the right answer; only flag the wrong one actually picked.
        if (oi === q.answer) row.classList.add('correct');
        else if (oi === chosen) row.classList.add('incorrect');
      });
      if (chosen === q.answer) correct++;
      if (q.explanation.textContent) q.explanation.classList.remove('hidden');
    }
    score.textContent = answered < questions.length
      ? `${correct} de ${questions.length} — ${questions.length - answered} sem resposta`
      : `${correct} de ${questions.length} corretas`;
    checkBtn.classList.add('hidden');
    retryBtn.classList.remove('hidden');
    retryWrongBtn.classList.toggle('hidden', correct === questions.length);
    saveQuizAttempt(slug, milestone.id, correct, questions.length);
    if (onPass && correct === questions.length) onPass();
  });

  retryBtn.addEventListener('click', () => {
    for (const q of questions) {
      q.inputs.forEach((input) => {
        input.disabled = false;
        input.checked = false;
        input.parentElement.classList.remove('correct', 'incorrect');
      });
      q.explanation.classList.add('hidden');
    }
    score.textContent = '';
    retryBtn.classList.add('hidden');
    retryWrongBtn.classList.add('hidden');
    checkBtn.classList.remove('hidden');
  });

  retryWrongBtn.addEventListener('click', () => {
    for (const q of questions) {
      const chosen = q.inputs.findIndex((i) => i.checked);
      if (chosen === q.answer) continue; // already correct — leave it locked as-is
      q.inputs.forEach((input) => {
        input.disabled = false;
        input.checked = false;
        input.parentElement.classList.remove('correct', 'incorrect');
      });
      q.explanation.classList.add('hidden');
    }
    score.textContent = '';
    retryBtn.classList.add('hidden');
    retryWrongBtn.classList.add('hidden');
    checkBtn.classList.remove('hidden');
  });

  return section;
}
