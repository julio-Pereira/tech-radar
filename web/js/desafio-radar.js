// @ts-check
// Readiness radar of the entrevista-senior path (PLANO-jornada-entrevistas
// §6): five axes computed ONLY from the machine-checked part of each
// desafio's latest round — the self-assessed rubric never counts. Pure: no
// DOM, no storage, so it runs under node --test.

/** @typedef {{ acertos: number, total: number }} Parte */
/** @typedef {{ estimativas?: Parte, decisoes?: Parte, entregavel?: Parte }} Partes */
/** @typedef {{ seed: number, at: string, verificadoPct: number, autoPct: number, partes?: Partes }} Rodada */
/** @typedef {{ id: string, tipo: string, dominio?: boolean }} DesafioRef */
/** @typedef {'hld'|'lld'|'estimativa'|'dominio'|'comportamental'} Eixo */
/** @typedef {{ id: Eixo, label: string, acertos: number, total: number, pct: number|null, desafios: number }} EixoScore */

/** @type {{ id: Eixo, label: string }[]} */
export const EIXOS = [
  { id: 'hld', label: 'HLD' },
  { id: 'lld', label: 'LLD' },
  { id: 'estimativa', label: 'Estimativa' },
  { id: 'dominio', label: 'Domínio' },
  { id: 'comportamental', label: 'Comportamental' },
];

/**
 * Which verified parts of a desafio feed which axis. A system design (or an
 * incident) splits: its numbers go to estimativa, its decisions and
 * deliverable structure to HLD. A domain desafio also counts its decisions on
 * the domain axis — the decisions are where the fintech knowledge shows.
 * @param {DesafioRef} d
 * @returns {[Eixo, (keyof Partes)[]][]}
 */
export function contributions(d) {
  const all = /** @type {(keyof Partes)[]} */ (['estimativas', 'decisoes', 'entregavel']);
  /** @type {[Eixo, (keyof Partes)[]][]} */
  let out;
  switch (d.tipo) {
    case 'system-design':
    case 'incidente':
      out = [['hld', ['decisoes', 'entregavel']], ['estimativa', ['estimativas']]];
      break;
    case 'lld': out = [['lld', all]]; break;
    case 'estimativa': out = [['estimativa', all]]; break;
    case 'comportamental': out = [['comportamental', all]]; break;
    default: out = [];
  }
  if (d.dominio) out.push(['dominio', ['decisoes']]);
  return out;
}

/** @param {Rodada[]|undefined} list */
export function latest(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.reduce((a, b) => (String(b.at) > String(a.at) ? b : a));
}

/** @param {any} p @returns {p is Parte} */
function isParte(p) {
  return p && Number.isFinite(p.acertos) && Number.isFinite(p.total) && p.total > 0 && p.acertos >= 0 && p.acertos <= p.total;
}

/**
 * @param {DesafioRef[]} desafios
 * @param {Record<string, Rodada[]>} rodadas
 * @returns {EixoScore[]}
 */
export function radar(desafios, rodadas) {
  /** @type {Record<string, { acertos: number, total: number, ids: Set<string> }>} */
  const acc = {};
  for (const e of EIXOS) acc[e.id] = { acertos: 0, total: 0, ids: new Set() };

  for (const d of desafios || []) {
    const r = latest(rodadas?.[d.id]);
    if (!r) continue;
    const contrib = contributions(d);
    if (r.partes && typeof r.partes === 'object') {
      for (const [eixo, keys] of contrib) {
        for (const k of keys) {
          const p = r.partes[k];
          if (!isParte(p)) continue;
          acc[eixo].acertos += p.acertos;
          acc[eixo].total += p.total;
          acc[eixo].ids.add(d.id);
        }
      }
    } else if (Number.isFinite(r.verificadoPct) && contrib.length > 0) {
      // A round saved before the per-part breakdown existed: its single
      // verified percentage counts once, on the desafio's main axis only.
      const eixo = contrib[0][0];
      acc[eixo].acertos += Math.max(0, Math.min(100, r.verificadoPct)) / 100;
      acc[eixo].total += 1;
      acc[eixo].ids.add(d.id);
    }
  }

  return EIXOS.map((e) => {
    const a = acc[e.id];
    return {
      id: e.id, label: e.label, acertos: a.acertos, total: a.total,
      pct: a.total > 0 ? Math.round((a.acertos / a.total) * 100) : null,
      desafios: a.ids.size,
    };
  });
}

/**
 * Vertex of axis i (of n) at radius r around (cx, cy), axis 0 straight up.
 * @param {number} i @param {number} n @param {number} r @param {number} cx @param {number} cy
 */
export function vertex(i, n, r, cx, cy) {
  const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)].map((v) => Math.round(v * 10) / 10);
}
