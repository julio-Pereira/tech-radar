// Step player for typed diagrams (PLANO Fase 1.6), imported by diagram.js
// only for a spec with animacao. The compiler already wrote the steps,
// cumulative, into the spec and as a numbered list in the description.
// Never autoplays; pauses off screen and in a hidden tab; with reduced
// motion, steps still change but nothing moves. Packets run on the Web
// Animations API, which sets no style attribute (CSP style-src 'self').
import { nodesOf, setState, still, packet, pauseWhenHidden, button } from './diagram-core.js';

const STEP_MS = 2500;
const SPEEDS = [1, 2, 0.5];
const players = new WeakMap();

/**
 * Wires a player to a drawn diagram. `mount` is the element the controls
 * go after; `twin` is the figure whose player this one mirrors (Ampliar).
 */
export function attach(svg, spec, mount, twin) {
  const steps = spec.animacao;
  const last = steps.length - 1;
  const nodes = nodesOf(svg);
  const edges = [...svg.querySelectorAll('[data-aresta]')].map((g) => {
    const t = g.querySelector('.diagrama-aresta-rotulo');
    return { g, t, base: t && t.textContent };
  });
  const msgs = [...svg.querySelectorAll('[data-msg]')];

  const box = document.createElement('div');
  box.className = 'diagrama-player';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Animação passo a passo');
  const first = button('diagrama-player-inicio', '⏮', 'Primeiro passo');
  const prev = button('diagrama-player-anterior', '◀', 'Passo anterior');
  const play = button('diagrama-player-play', '▶', 'Reproduzir');
  const next = button('diagrama-player-proximo', '▶|', 'Próximo passo');
  const speedBtn = button('diagrama-player-velocidade', '1×', 'Velocidade: 1×');
  const pos = document.createElement('span');
  pos.className = 'diagrama-player-posicao';
  const legend = document.createElement('p');
  legend.className = 'diagrama-legenda';
  box.append(first, prev, play, next, pos, speedBtn, legend);
  mount.after(box);

  let i = 0;
  let timer = 0;
  let speed = 1;
  let playing = false;

  function go(n, sync = true) {
    i = Math.max(0, Math.min(last, n));
    const s = steps[i];
    still(svg);
    const moving = [];
    for (const n of nodes) {
      const id = n.g.dataset.id;
      const st = s.atual ? (s.atual === id ? 'atual' : '') : (s.estados || {})[id] || '';
      setState(n, st, (s.rotulos || {})[id] || n.base);
    }
    const flows = s.transicao ? [s.transicao] : s.fluxos || [];
    for (const { g, t, base } of edges) {
      const f = flows.find((x) => `${x.de}>${x.para}` === g.dataset.aresta);
      g.classList.toggle('diagrama-percorrida', !!f);
      if (t) t.textContent = (f && f.rotulo) || base;
      if (f) moving.push(g);
    }
    const from = i ? steps[i - 1].ate || 0 : 0;
    msgs.forEach((g, k) => {
      g.classList.toggle('diagrama-oculto', s.ate > 0 && k >= s.ate);
      const fresh = s.ate > 0 && k >= from && k < s.ate;
      g.classList.toggle('diagrama-percorrida', fresh);
      if (fresh) moving.push(g);
    });
    moving.forEach((g) => packet(svg, g.querySelector('.diagrama-aresta'), speed));

    pos.textContent = `passo ${i + 1} de ${steps.length}`;
    // aria-disabled, not disabled: the focused button keeps the focus.
    for (const [b, off] of [[first, i === 0], [prev, i === 0], [next, i === last]]) b.setAttribute('aria-disabled', String(off));
    // aria-live announces each change (the figure behind an open Ampliar
    // is inert, so only the dialog's legend speaks).
    legend.textContent = s.anotacao ? `${s.legenda} — ${s.anotacao}` : s.legenda;
    if (mirror && sync) mirror.go(i, false);
  }

  function pause() {
    clearTimeout(timer);
    playing = false;
    play.textContent = '▶';
    play.setAttribute('aria-label', 'Reproduzir');
  }

  function tick() {
    timer = setTimeout(() => {
      if (i < last) {
        go(i + 1);
        tick();
      } else pause();
    }, STEP_MS / speed);
  }

  function toggle() {
    if (playing) return pause();
    if (i === last) go(0);
    playing = true;
    play.textContent = '⏸';
    play.setAttribute('aria-label', 'Pausar');
    tick();
  }

  const stepTo = (n) => { pause(); go(n); };
  first.addEventListener('click', () => stepTo(0));
  prev.addEventListener('click', () => stepTo(i - 1));
  next.addEventListener('click', () => stepTo(i + 1));
  play.addEventListener('click', toggle);
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    const label = `${String(speed).replace('.', ',')}×`;
    speedBtn.textContent = label;
    speedBtn.setAttribute('aria-label', `Velocidade: ${label}`);
  });
  box.addEventListener('keydown', (e) => {
    const keys = { ' ': toggle, ArrowLeft: () => stepTo(i - 1), ArrowRight: () => stepTo(i + 1), Home: () => stepTo(0), End: () => stepTo(last) };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  });

  // Out of sight, out of motion (WCAG 2.2.2).
  const host = mount.closest('figure, dialog');
  pauseWhenHidden(host, pause);

  const api = { go, pause, get step() { return i; } };
  // The figure's player and the Ampliar one stay on the same step.
  const mirror = twin && players.get(twin);
  if (host.tagName === 'FIGURE') players.set(host, api);
  go(mirror ? mirror.step : 0, false);
  // Live only after the first step is shown: opening a milestone with
  // several animated diagrams does not read all their captions at once.
  legend.setAttribute('aria-live', 'polite');
  return api;
}
