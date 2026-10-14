// @ts-check
// UX platform melhoria 5 (revisão espaçada): #/revisar, a Leitner spaced-
// repetition session over quiz questions and glossary terms. The deck is
// built fresh each visit from quiz-bank.json + glossary.json (both already
// used elsewhere, lazy-loaded here too) — never a separately authored file.
// Review outcomes live only in tr:review:v1: this never touches
// tr:progress:/tr:quiz:, so it never affects a milestone's completion gate
// or its own quiz history.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty } from '../dom-helpers.js';
import { cyrb53 } from '../hash.js';
import { schedule, isDue } from '../review-scheduler.js';
import { getReviewState, setDailyLimit, recordReview, DEFAULT_DAILY_LIMIT } from '../storage.js';

export async function renderReview() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando revisão…'));

  let quizBank, glossary;
  try {
    const [quizResp, glossaryResp] = await Promise.all([
      fetch('./data/quiz-bank.json'),
      fetch('./data/glossary.json'),
    ]);
    quizBank = quizResp.ok ? await quizResp.json() : { items: [] };
    glossary = glossaryResp.ok ? await glossaryResp.json() : { entries: [] };
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar a revisão: ${err.message}`));
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildReviewView(buildDeck(quizBank, glossary)));
  announceRoute('Revisão espaçada', true);
}

/** Stable id = cyrb53(slug|context-key|text) — changing the text changes the id, restarting that card's box on purpose (documented, not a bug). */
function buildDeck(quizBank, glossary) {
  const deck = [];
  for (const q of quizBank.items || []) {
    deck.push({
      id: String(cyrb53(`${q.slug}|${q.marcoId}|${q.question}`)),
      kind: 'quiz',
      track: q.milestoneTitle,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    });
  }
  for (const g of glossary.entries || []) {
    deck.push({
      id: String(cyrb53(`${g.slug}|${g.anchor}|${g.term}`)),
      kind: 'glossary',
      track: g.track,
      term: g.term,
      summary: g.summary,
    });
  }
  return deck;
}

function buildReviewView(deck) {
  const root = document.createElement('div');
  root.className = 'course-view review-view';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Revisão espaçada';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'Perguntas de quiz e verbetes do glossário de todas as trilhas, com repetição espaçada. Não afeta a conclusão de nenhum marco.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  root.appendChild(heading);

  let reviewState = getReviewState();
  const today = new Date();

  const limitWrap = document.createElement('div');
  limitWrap.className = 'review-limit';
  const limitLabel = document.createElement('label');
  limitLabel.setAttribute('for', 'review-daily-limit');
  limitLabel.textContent = 'Limite diário:';
  const limitInput = document.createElement('input');
  limitInput.type = 'number';
  limitInput.id = 'review-daily-limit';
  limitInput.min = '1';
  limitInput.max = '200';
  limitInput.value = String(reviewState.dailyLimit);
  limitWrap.append(limitLabel, limitInput);
  root.appendChild(limitWrap);

  const status = document.createElement('p');
  status.className = 'review-status';
  status.setAttribute('role', 'status');
  root.appendChild(status);

  const cardSlot = document.createElement('div');
  cardSlot.className = 'review-card-slot';
  root.appendChild(cardSlot);

  limitInput.addEventListener('change', () => {
    const value = Math.max(1, Math.min(200, Number(limitInput.value) || DEFAULT_DAILY_LIMIT));
    limitInput.value = String(value);
    setDailyLimit(value);
    reviewState = getReviewState();
    renderNext();
  });

  function dueQueue() {
    return deck
      .filter((card) => isDue(reviewState.cards[card.id], today))
      // Oldest-due (or never-reviewed, "") first, so a backlog clears
      // before fresh cards pile on top of it.
      .sort((a, b) => {
        const aDue = reviewState.cards[a.id] ? reviewState.cards[a.id].dueAt : '';
        const bDue = reviewState.cards[b.id] ? reviewState.cards[b.id].dueAt : '';
        return aDue < bDue ? -1 : aDue > bDue ? 1 : 0;
      });
  }

  function renderNext() {
    cardSlot.innerHTML = '';
    const remaining = reviewState.dailyLimit - reviewState.todayCount;
    status.textContent = `${reviewState.todayCount} de ${reviewState.dailyLimit} revisados hoje`;

    if (deck.length === 0) {
      cardSlot.appendChild(buildEmpty('Nenhum conteúdo de quiz ou glossário disponível ainda.'));
      return;
    }
    if (remaining <= 0) {
      cardSlot.appendChild(buildEmpty('Limite diário atingido. Volte amanhã, ou aumente o limite acima.'));
      return;
    }
    const queue = dueQueue();
    if (queue.length === 0) {
      cardSlot.appendChild(buildEmpty('Nenhum cartão para revisar agora. Volte mais tarde.'));
      return;
    }

    const card = queue[0];
    const onAnswer = (correct) => {
      const result = schedule(reviewState.cards[card.id], correct, today);
      reviewState = recordReview(card.id, result.box, result.dueAt);
      renderNext();
    };
    cardSlot.appendChild(card.kind === 'quiz' ? buildQuizCard(card, onAnswer) : buildGlossaryCard(card, onAnswer));
  }

  renderNext();
  return root;
}

function buildQuizCard(card, onAnswer) {
  // .review-card carries the visible border/padding; the <fieldset> inside
  // stays borderless (same split .milestone-quiz/.quiz-question already
  // use elsewhere) — a <legend> straddles its OWN element's border by
  // default, so putting both classes on the same element pushed the
  // question text outside the card's border.
  const wrap = document.createElement('div');
  wrap.className = 'review-card';

  const track = document.createElement('p');
  track.className = 'review-card-track';
  track.textContent = card.track;
  wrap.appendChild(track);

  const fieldset = document.createElement('fieldset');
  fieldset.className = 'quiz-question';
  wrap.appendChild(fieldset);

  const legend = document.createElement('legend');
  legend.textContent = card.question;
  fieldset.appendChild(legend);

  const inputs = [];
  card.options.forEach((option, oi) => {
    const row = document.createElement('div');
    row.className = 'quiz-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `review-${card.id}`;
    input.id = `review-${card.id}-${oi}`;
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
  explanation.textContent = card.explanation || '';
  fieldset.appendChild(explanation);

  const actions = document.createElement('div');
  actions.className = 'quiz-actions';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'quiz-check-btn';
  checkBtn.textContent = 'Verificar';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'quiz-retry-btn hidden';
  nextBtn.textContent = 'Próximo cartão';
  actions.append(checkBtn, nextBtn);
  fieldset.appendChild(actions);

  checkBtn.addEventListener('click', () => {
    const chosen = inputs.findIndex((i) => i.checked);
    inputs.forEach((input, oi) => {
      input.disabled = true;
      const row = input.parentElement;
      if (oi === card.answer) row.classList.add('correct');
      else if (oi === chosen) row.classList.add('incorrect');
    });
    if (card.explanation) explanation.classList.remove('hidden');
    checkBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    nextBtn.focus();
    nextBtn.addEventListener('click', () => onAnswer(chosen === card.answer), { once: true });
  });

  return wrap;
}

function buildGlossaryCard(card, onAnswer) {
  const wrap = document.createElement('div');
  wrap.className = 'review-card review-glossary-card';

  const track = document.createElement('p');
  track.className = 'review-card-track';
  track.textContent = card.track;
  wrap.appendChild(track);

  const term = document.createElement('p');
  term.className = 'review-glossary-term';
  term.textContent = card.term;
  wrap.appendChild(term);

  const summary = document.createElement('p');
  summary.className = 'review-glossary-summary hidden';
  summary.textContent = card.summary;
  wrap.appendChild(summary);

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'review-reveal-btn';
  revealBtn.textContent = 'Mostrar resposta';
  wrap.appendChild(revealBtn);

  const selfAssess = document.createElement('div');
  selfAssess.className = 'review-self-assess hidden';
  const rememberedBtn = document.createElement('button');
  rememberedBtn.type = 'button';
  rememberedBtn.className = 'review-remembered-btn';
  rememberedBtn.textContent = 'Lembrei';
  const forgotBtn = document.createElement('button');
  forgotBtn.type = 'button';
  forgotBtn.className = 'review-forgot-btn';
  forgotBtn.textContent = 'Não lembrei';
  selfAssess.append(rememberedBtn, forgotBtn);
  wrap.appendChild(selfAssess);

  revealBtn.addEventListener('click', () => {
    summary.classList.remove('hidden');
    revealBtn.classList.add('hidden');
    selfAssess.classList.remove('hidden');
    rememberedBtn.focus();
  });
  rememberedBtn.addEventListener('click', () => onAnswer(true));
  forgotBtn.addEventListener('click', () => onAnswer(false));

  return wrap;
}
