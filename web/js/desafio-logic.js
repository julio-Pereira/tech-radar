// @ts-check
// Pure logic of a desafio round (PLANO jornada de entrevistas §4, §8): the
// seeded draw of parameters, placeholder filling, and the four correction
// layers — estimativas, decisões and entregável are VERIFIED; the rubrica
// is SELF-ASSESSED, and the two are never mixed into one number. No DOM, no
// storage: everything injected, so it runs under `node --test`.
import { evalFormula } from './desafio-formula.js';

/** mulberry32: small, fast, deterministic — the same seed draws the same round. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A new seed for a new round (not security-sensitive). */
export function newSeed() {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

/**
 * Draws one value per parameter, in sorted name order so the same seed always
 * gives the same values whatever the JSON key order.
 * @param {Record<string, { min?: number, max?: number, passo?: number, valores?: (number|string)[] }>} parametros
 * @param {number} seed
 * @returns {Record<string, number|string>}
 */
export function drawParams(parametros, seed) {
  const next = rng(seed);
  const out = {};
  for (const name of Object.keys(parametros || {}).sort()) {
    const p = parametros[name];
    if (Array.isArray(p.valores) && p.valores.length > 0) {
      out[name] = p.valores[Math.floor(next() * p.valores.length)];
    } else {
      const steps = Math.floor((p.max - p.min) / p.passo + 1e-9);
      out[name] = roundTo(p.min + Math.floor(next() * (steps + 1)) * p.passo, 6);
    }
  }
  return out;
}

function roundTo(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Numeric parameters only — what formulas may use. */
export function numericParams(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) if (typeof v === 'number') out[k] = v;
  return out;
}

/** Number as the reader sees it: pt-BR grouping, at most 2 decimals. */
export function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
}

/**
 * Replaces {param} with its drawn value. Used on plain text (inserted with
 * textContent) — and, through fillHTML, on build-sanitized HTML.
 */
export function fillText(text, values) {
  return String(text || '').replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? displayValue(values[name]) : m);
}

/** Same as fillText for HTML: the value is HTML-escaped before it goes in. */
export function fillHTML(html, values) {
  return String(html || '').replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? escapeHTML(displayValue(values[name])) : m);
}

function displayValue(v) {
  return typeof v === 'number' ? formatNumber(v) : String(v);
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Parses what the reader typed: "1.234,5", "1234.5", "2,5 TB" → number, or null. */
export function parseAnswer(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // pt-BR
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ id: string, ast: any, tolerancia: number }[]} estimativas
 * @param {Record<string, string>} answers raw text by estimativa id
 * @param {Record<string, number|string>} values drawn parameters
 */
export function checkEstimativas(estimativas, answers, values) {
  const vars = numericParams(values);
  return (estimativas || []).map((e) => {
    const expected = evalFormula(e.ast, vars);
    const given = parseAnswer(answers[e.id]);
    const ok = given !== null && Math.abs(given - expected) <= e.tolerancia * Math.abs(expected);
    return { id: e.id, expected, given, ok };
  });
}

/** @param {{ correta: number }[]} decisoes @param {Record<number, number>} chosen index by decision */
export function checkDecisoes(decisoes, chosen) {
  return (decisoes || []).map((q, i) => ({ index: i, chosen: chosen[i] ?? null, ok: chosen[i] === q.correta }));
}

/**
 * Structure of the entregável: each required section must exist as a
 * "## Nome" heading (accents and case ignored) with non-empty text under it.
 */
export function checkEntregavel(secoes, draft) {
  const found = {};
  let current = null;
  for (const line of String(draft || '').split('\n')) {
    const h = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (h) {
      current = normKey(h[1]);
      if (!(current in found)) found[current] = '';
      continue;
    }
    if (current) found[current] += line.trim();
  }
  return (secoes || []).map((s) => ({ secao: s, ok: (found[normKey(s)] || '').length > 0 }));
}

function normKey(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Words → minutes of speech at ~130 words/min; STAR answers should take 2–4 min. */
export function speakingMinutes(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return words / 130;
}

/**
 * The score, always in two separate parts.
 * @returns {{ verificado: { acertos: number, total: number, pct: number, partes: Record<'estimativas'|'decisoes'|'entregavel', { acertos: number, total: number }> }, autoavaliado: { marcados: number, total: number, pct: number } }}
 */
export function score({ estimativas = [], decisoes = [], entregavel = [] }, rubricaMarcada = 0, rubricaTotal = 0) {
  const items = [...estimativas, ...decisoes, ...entregavel];
  const acertos = items.filter((x) => x.ok).length;
  /** @param {{ ok: boolean }[]} xs */
  const parte = (xs) => ({ acertos: xs.filter((x) => x.ok).length, total: xs.length });
  return {
    verificado: {
      acertos, total: items.length, pct: items.length ? Math.round((acertos / items.length) * 100) : 0,
      // Per part, for the readiness radar (desafio-radar.js).
      partes: { estimativas: parte(estimativas), decisoes: parte(decisoes), entregavel: parte(entregavel) },
    },
    autoavaliado: { marcados: rubricaMarcada, total: rubricaTotal, pct: rubricaTotal ? Math.round((rubricaMarcada / rubricaTotal) * 100) : 0 },
  };
}

/** Pre-requisites still missing, given a completed(slug) → Set reader. */
export function missingPrereqs(desafio, completed) {
  return (desafio.prerequisitos || []).filter((p) => !completed(p.slug).has(p.marcoId));
}

/**
 * Phases of a simulated round (§8.2), scaled to the desafio's duration:
 * esclarecer 5, estimar 5, desenho 15, aprofundar 15, fechamento 5 (of 45).
 */
export function phases(duracaoMin) {
  const base = [['Esclarecer', 5], ['Estimar', 5], ['Desenho', 15], ['Aprofundar', 15], ['Fechamento', 5]];
  const k = duracaoMin / 45;
  let start = 0;
  return base.map(([nome, min]) => {
    const p = { nome, inicioSeg: Math.round(start * 60), fimSeg: Math.round((start + min * k) * 60) };
    start += min * k;
    return p;
  });
}

/** Phase name at a given elapsed second. */
export function phaseAt(duracaoMin, elapsedSeg) {
  const ps = phases(duracaoMin);
  return (ps.find((p) => elapsedSeg < p.fimSeg) || ps[ps.length - 1]).nome;
}

/** Placeholder values for a title shown outside a round: the range, never a drawn value. */
export function rangeValues(parametros) {
  const out = {};
  for (const [k, p] of Object.entries(parametros || {})) {
    if (Array.isArray(p.valores) && p.valores.length) {
      out[k] = p.valores.map((v) => (typeof v === 'number' ? formatNumber(v) : v)).join(' ou ');
    } else {
      out[k] = `${formatNumber(p.min)}–${formatNumber(p.max)}`;
    }
  }
  return out;
}
