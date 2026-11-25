// Walkthrough player (PLANO Fase 1.7), imported by sections.js only for a
// milestone with a figure.walkthrough. The compiler wrote everything: steps,
// events with cumulative states, the derived sequence of each step and the
// textual description already in the figure. Never autoplays; play stops at
// the end of the current step; pauses off screen and in a hidden tab; with
// reduced motion nothing moves, not even the change of layer. CSS classes
// only, and the Web Animations API, which sets no style attribute.
import { draw, fitViewBox, openZoom } from './diagram.js';
import { nodesOf, setState, still, packet, pauseWhenHidden, button, reduceMotion } from './diagram-core.js';
import { label } from './diagram-svg.js';
import { setBuildHTML } from '../trusted-html.js';

const EVENT_MS = 2500;
const SPEEDS = [1, 2, 0.5];
let seq = 0;

const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

const make = (tag, cls, text = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.textContent = text;
  return e;
};

export async function renderWalkthroughs(root) {
  for (const figure of root.querySelectorAll('figure.walkthrough[data-walkthrough]')) {
    if (figure.querySelector('.wt')) continue;
    const [slug, id] = figure.dataset.walkthrough.split('/');
    const [w, d] = await Promise.all([json(`./data/walkthroughs/${slug}.json`), json(`./data/diagramas/${slug}.json`)]);
    const spec = (w.walkthroughs || {})[id];
    if (spec && !figure.querySelector('.wt')) attach(figure, slug, spec, d.diagramas || {});
  }
}

function attach(figure, slug, w, diagramas) {
  const n = ++seq;
  const events = w.etapas.flatMap((e, k) => e.eventos.map((ev, j) => ({ ...ev, k, j })));
  const last = events.length - 1;
  const rotulo = Object.fromEntries(w.atores.map((a) => [a.id, a.rotulo]));
  const camadas = Object.fromEntries(w.camadas.map((c) => [c.id, c]));
  const paineis = Object.fromEntries((w.paineis || []).map((p) => [p.id, p]));
  const views = new Map(); // "t:<camada>" or "s:<etapa>" → drawn svg

  const root = make('div', 'wt');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', `Roteiro: ${w.titulo}`);

  // The view: breadcrumb, Topologia | Sequência, the drawing, Ampliar.
  const visao = make('div', 'wt-visao');
  const trilha = make('nav', 'wt-trilha');
  trilha.setAttribute('aria-label', 'Camada');
  const crumbs = make('ol');
  trilha.append(crumbs);
  const tabs = make('div', 'wt-abas');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Visão');
  const area = make('div', 'wt-area');
  area.id = `wt-${n}-visao`;
  area.setAttribute('role', 'tabpanel');
  const tab = (label) => {
    const b = make('button', 'wt-aba', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', area.id);
    tabs.append(b);
    return b;
  };
  const tabT = tab('Topologia');
  const tabS = tab('Sequência');
  const zoom = make('button', 'diagrama-ampliar', 'Ampliar');
  zoom.type = 'button';
  zoom.setAttribute('aria-label', 'Ampliar a visão');
  visao.append(trilha, tabs, area, zoom);

  // A face is the event card, the controls and the live region. The figure
  // has one; Ampliar builds a second inside the dialog (the page behind a
  // modal dialog is inert), and every face shows the same state.
  const faces = [];
  function face() {
    const f = {
      cartao: make('div', 'wt-cartao'), num: make('p', 'wt-num'), rota: make('p', 'wt-rota'),
      msg: make('p', 'wt-msg'), anot: make('p', 'wt-anot'), ctl: make('div', 'wt-controles'), vivo: make('p', 'sr-only'),
      first: button('wt-inicio', '⏮', 'Início'),
      prevE: button('wt-etapa-ant', '«', 'Etapa anterior'),
      prev: button('wt-ant', '◀', 'Evento anterior'),
      play: button('wt-play', '▶', 'Reproduzir até o fim da etapa'),
      next: button('wt-prox', '▶|', 'Próximo evento'),
      nextE: button('wt-etapa-prox', '»', 'Próxima etapa'),
      speed: button('wt-velocidade', speedLabel(), `Velocidade: ${speedLabel()}`),
    };
    f.cartao.append(f.num, f.rota, f.msg, f.anot);
    f.ctl.setAttribute('role', 'group');
    f.ctl.setAttribute('aria-label', 'Controles do roteiro');
    f.ctl.append(f.first, f.prevE, f.prev, f.play, f.next, f.nextE, f.speed);
    f.first.addEventListener('click', () => to(0));
    f.prev.addEventListener('click', () => to(i - 1));
    f.next.addEventListener('click', () => to(i + 1));
    f.prevE.addEventListener('click', () => etapaAnterior());
    f.nextE.addEventListener('click', () => toEtapa(k + 1));
    f.play.addEventListener('click', toggle);
    f.speed.addEventListener('click', () => {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      for (const x of faces) {
        x.speed.textContent = speedLabel();
        x.speed.setAttribute('aria-label', `Velocidade: ${speedLabel()}`);
      }
    });
    faces.push(f);
    return f;
  }
  const speedLabel = () => `${String(speed).replace('.', ',')}×`;

  // The figure's face, then the step's prose and panel.
  const lado = make('div', 'wt-lado');
  const etapaPos = make('p', 'wt-etapa-pos');
  const pontos = make('span', 'wt-pontos');
  pontos.setAttribute('aria-hidden', 'true');
  const etapaTxt = make('span');
  etapaPos.append(etapaTxt, pontos);
  const titulo = make('p', 'wt-etapa-titulo');
  const sub = make('p', 'wt-etapa-sub');
  const prosa = make('div', 'wt-prosa');
  const painel = make('details', 'wt-painel');
  const painelSum = make('summary');
  const painelNota = make('p', 'wt-painel-nota');
  const pre = make('pre');
  const code = make('code');
  pre.append(code);
  painel.append(painelSum, painelNota, pre);
  let speed = 1;
  const main = face();
  lado.append(main.cartao, main.ctl, etapaPos, titulo, sub, prosa, painel, main.vivo);
  root.append(visao, lado);
  figure.querySelector('.walkthrough-resumo').after(root);

  let i = 0;
  let k = -1;
  let showSeq = false;
  let timer = 0;
  let zoomed = null; // { svg, spec } while Ampliar is open
  let playing = false;

  function view(e) {
    const key = showSeq ? `s:${e.k}` : `t:${w.etapas[e.k].camada}`;
    if (!views.has(key)) {
      const spec = showSeq ? w.etapas[e.k].sequencia : diagramas[camadas[w.etapas[e.k].camada].diagrama];
      const svg = draw(spec, `wt${n}${views.size}`, false);
      svg.setAttribute('aria-label', spec.titulo);
      views.set(key, { svg, spec });
    }
    return views.get(key);
  }

  // Lights the event on one drawing: cumulative states, the edge (or the
  // messages so far, in a sequence) and, when `move`, the packet. A timeout
  // lights its request's edge dashed, never moves, and says "sem resposta".
  function light(svg, e, move) {
    still(svg);
    const t = e.tipo === 'timeout';
    svg.querySelectorAll('.wt-marca-timeout').forEach((x) => x.remove());
    for (const node of nodesOf(svg)) setState(node, (e.estados || {})[node.g.dataset.id] || '', node.base);
    let path = null;
    for (const g of svg.querySelectorAll('[data-aresta]')) {
      const on = g.dataset.aresta === `${e.de}>${e.para}`;
      g.classList.toggle('diagrama-percorrida', on);
      g.classList.toggle('wt-sem-resposta', on && t);
      if (on) path = g;
    }
    if (t && path && !svg.querySelector('[data-msg]')) {
      // Near the end that never answered: a text mark, not only a dash.
      const geo = path.querySelector('.diagrama-aresta');
      const p = geo.getPointAtLength(geo.getTotalLength() * 0.75);
      path.appendChild(label(p.x, p.y - 10, '✕ sem resposta', 'wt-marca-timeout'));
    }
    for (const g of svg.querySelectorAll('[data-msg]')) {
      const m = Number(g.dataset.msg);
      g.classList.toggle('diagrama-oculto', m > e.j);
      g.classList.toggle('diagrama-percorrida', m === e.j);
      if (m === e.j) path = g;
    }
    if (move && path && !t) packet(svg, path.querySelector('.diagrama-aresta'), speed);
  }

  function go(to, user = true) {
    i = Math.max(0, Math.min(last, to));
    const e = events[i];
    const etapa = w.etapas[e.k];
    const novaEtapa = e.k !== k;
    k = e.k;

    const v = view(e);
    if (area.firstChild !== v.svg) {
      area.replaceChildren(v.svg);
      fitViewBox(v.svg);
      area.classList.remove('wt-entra');
      if (!reduceMotion()) {
        void area.offsetWidth; // restart the crossfade
        area.classList.add('wt-entra');
      }
    }
    light(v.svg, e, user);
    // Ampliar follows the walkthrough, layer and view included.
    if (zoomed) {
      if (zoomed.spec !== v.spec) {
        const z = draw(v.spec, `wt${n}z${++seq}`, false);
        z.setAttribute('aria-labelledby', 'diagrama-dialogo-titulo');
        zoomed.svg.replaceWith(z);
        fitViewBox(z);
        z.closest('dialog').querySelector('h2').textContent = v.spec.titulo;
        zoomed = { svg: z, spec: v.spec };
      }
      light(zoomed.svg, e, user);
    }

    const c = camadas[etapa.camada];
    crumbs.replaceChildren(...c.trilha.map((id, x) => {
      const li = make('li', '', camadas[id].rotulo);
      if (x === c.trilha.length - 1) li.setAttribute('aria-current', 'location');
      return li;
    }));
    tabT.setAttribute('aria-selected', String(!showSeq));
    tabS.setAttribute('aria-selected', String(showSeq));
    tabT.tabIndex = showSeq ? -1 : 0;
    tabS.tabIndex = showSeq ? 0 : -1;


    if (novaEtapa) {
      etapaTxt.textContent = `Etapa ${k + 1} de ${w.etapas.length}`;
      pontos.textContent = w.etapas.map((_, x) => (x === k ? '●' : '○')).join(' ');
      titulo.textContent = etapa.titulo;
      sub.textContent = etapa.subtitulo || '';
      sub.hidden = !etapa.subtitulo;
      setBuildHTML(prosa, etapa.html); // sanitized at build time (bluemonday)
    }
    const p = e.painel && paineis[e.painel.id];
    painel.hidden = !p;
    if (p) {
      painelSum.textContent = p.titulo;
      painelNota.textContent = p.nota || '';
      painelNota.hidden = !p.nota;
      code.replaceChildren(...p.linhas.map((l, x) => make('span', x + 1 >= e.painel.de && x + 1 <= e.painel.ate ? 'wt-linha wt-linha-on' : 'wt-linha', `${l}\n`)));
    }

    for (const f of faces) {
      f.num.textContent = `Evento ${e.n} de ${events.length}`;
      f.rota.textContent = e.tipo === 'timeout' ? `${rotulo[e.de]} ⇢ ${rotulo[e.para]} · sem resposta` : `${rotulo[e.de]} → ${rotulo[e.para]}`;
      f.msg.textContent = e.msg;
      f.anot.textContent = e.anotacao || '';
      f.anot.hidden = !e.anotacao;
      for (const [b, off] of [[f.first, i === 0], [f.prev, i === 0], [f.prevE, i === 0], [f.next, i === last], [f.nextE, k === w.etapas.length - 1]]) {
        b.setAttribute('aria-disabled', String(off));
      }
      f.vivo.textContent = `${novaEtapa ? `Etapa ${k + 1} de ${w.etapas.length}: ${etapa.titulo}. ` : ''}Evento ${e.n} de ${events.length}. ${e.tipo === 'timeout' ? `Sem resposta de ${rotulo[e.para]} para ${rotulo[e.de]}` : `${rotulo[e.de]} para ${rotulo[e.para]}`}. ${e.msg}`;
    }
    if (user) link();
  }

  // Deep link: #/learn/<slug>/<marco>/wt/<id>/<evento>, replaced in place.
  const marco = figure.closest('.timeline-node')?.dataset.id;
  function link() {
    const parts = location.hash.split('/');
    if (!marco || parts[1] !== 'learn' || parts[2] !== slug || (parts[4] && parts[4] !== 'wt')) return;
    history.replaceState(history.state, '', `#/learn/${slug}/${marco}/wt/${w.id}/${events[i].n}`);
  }

  function pause() {
    clearTimeout(timer);
    playing = false;
    labelPlay();
  }

  function labelPlay() {
    for (const f of faces) {
      f.play.textContent = playing ? '⏸' : '▶';
      f.play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir até o fim da etapa');
    }
  }

  function tick() {
    timer = setTimeout(() => {
      const e = events[i];
      if (i < last && e.j < w.etapas[e.k].eventos.length - 1) {
        go(i + 1);
        tick();
      } else pause();
    }, EVENT_MS / speed);
  }

  function toggle() {
    if (playing) return pause();
    const e = events[i];
    if (i === last) go(0);
    else if (e.j === w.etapas[e.k].eventos.length - 1) go(i + 1);
    playing = true;
    labelPlay();
    tick();
  }

  const to = (x) => { pause(); go(x); };
  const etapaStart = (x) => events.findIndex((e) => e.k === x);
  const toEtapa = (x) => to(etapaStart(Math.max(0, Math.min(w.etapas.length - 1, x))));
  // Mid-step, « goes to the step's start; at its start, to the previous step.
  const etapaAnterior = () => toEtapa(k - (events[i].j === 0 ? 1 : 0));
  const setView = (s) => {
    if (s === showSeq) return;
    showSeq = s;
    go(i, false);
    (s ? tabS : tabT).focus();
  };

  tabT.addEventListener('click', () => setView(false));
  tabS.addEventListener('click', () => setView(true));
  // Ampliar: the view full screen, with its own card and controls (the
  // class diagrama-player makes openZoom remove them on close).
  zoom.addEventListener('click', async () => {
    const v = view(events[i]);
    // The dialog module is downloaded on the first click; if play moved on
    // meanwhile, go() below redraws the zoomed view for the current event.
    const svg = await openZoom(v.spec, v.spec.titulo, zoom);
    const dlg = svg.closest('dialog');
    const f = face();
    const bar = make('div', 'diagrama-player wt-zoom');
    bar.append(f.cartao, f.ctl, f.vivo);
    bar.addEventListener('keydown', onKey);
    dlg.append(bar);
    zoomed = { svg, spec: v.spec };
    dlg.addEventListener('close', () => {
      pause();
      faces.splice(faces.indexOf(f), 1);
      zoomed = null;
    }, { once: true });
    go(i, false);
    labelPlay();
    f.vivo.setAttribute('aria-live', 'polite');
  });
  root.addEventListener('keydown', onKey);
  function onKey(ev) {
    const t = ev.target;
    if (t.getAttribute('role') === 'tab' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      ev.preventDefault();
      return setView(!showSeq);
    }
    // Space plays and pauses, as in the diagram player; on the panel's
    // summary it keeps opening and closing it.
    if (ev.key === ' ' && t.tagName === 'SUMMARY') return;
    const keys = {
      ' ': toggle,
      ArrowLeft: () => to(i - 1),
      ArrowRight: () => to(i + 1),
      PageUp: etapaAnterior,
      PageDown: () => toEtapa(k + 1),
      Home: () => to(0),
      End: () => to(last),
    };
    if (!keys[ev.key]) return;
    ev.preventDefault();
    keys[ev.key]();
  }
  area.tabIndex = 0;

  pauseWhenHidden(figure, pause);

  // Opened from a deep link: the right event, paused, in view.
  const parts = location.hash.split('/');
  const start = parts[4] === 'wt' && parts[5] === w.id ? events.findIndex((e) => e.n === Number(parts[6])) : -1;
  go(Math.max(0, start), false);
  if (start >= 0) figure.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  // Live only after the first event is shown: opening the milestone does
  // not read the whole card at once.
  main.vivo.setAttribute('aria-live', 'polite');
}
