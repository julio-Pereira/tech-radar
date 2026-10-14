// @ts-check
// UX item 17: export/import every tr:* localStorage key as one JSON file —
// progress, hands-on state, quiz history, last-visited markers, and
// whatever a future feature adds under the same prefix (e.g. melhoria 5's
// spaced-review state) comes along for free, without this file needing an
// edit when that happens.
const TR_PREFIX = 'tr:';
const EXPORT_VERSION = 1;

/** @returns {{ version: number, exportedAt: string, data: Record<string, string> }} */
export function exportProgress() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TR_PREFIX)) {
      data[key] = localStorage.getItem(key);
    }
  }
  return { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Triggers a browser download of the current export. */
export function downloadExport() {
  const payload = exportProgress();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tech-radar-progresso-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parses and validates a prospective import file WITHOUT touching
 * localStorage — a corrupted or malformed file must never wipe current
 * state, so every check happens before any write.
 * @returns {{ ok: true, data: Record<string, string> } | { ok: false, error: string }}
 */
export function parseImport(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Arquivo não é um JSON válido.' };
  }
  if (!payload || typeof payload !== 'object' || typeof payload.version !== 'number'
    || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    return { ok: false, error: 'Arquivo não tem o formato esperado (version + data).' };
  }
  return { ok: true, data: payload.data };
}

/**
 * Merges imported tr:* keys into localStorage by union — array-shaped
 * values (progress ids, hands-on open/done/seen lists) union together;
 * anything else keeps the local value when both sides have one, so an
 * import can only ever add, never silently overwrite. Returns how many
 * keys were written.
 */
export function importProgress(data) {
  let merged = 0;
  for (const [key, importedRaw] of Object.entries(data)) {
    if (!key.startsWith(TR_PREFIX) || typeof importedRaw !== 'string') continue; // ignore anything outside our own namespace
    try {
      const existingRaw = localStorage.getItem(key);
      localStorage.setItem(key, mergeValue(existingRaw, importedRaw));
      merged++;
    } catch {
      // Storage full/unavailable — skip this key, keep going with the rest.
    }
  }
  return merged;
}

function mergeValue(existingRaw, importedRaw) {
  if (existingRaw == null) return importedRaw;
  if (existingRaw === importedRaw) return existingRaw;

  const existing = tryParse(existingRaw);
  const imported = tryParse(importedRaw);
  if (existing === undefined || imported === undefined) return existingRaw; // not JSON — local wins, never guess

  if (Array.isArray(existing) && Array.isArray(imported)) {
    return JSON.stringify([...new Set([...existing, ...imported])]);
  }
  if (isPlainObject(existing) && isPlainObject(imported)) {
    const keys = new Set([...Object.keys(existing), ...Object.keys(imported)]);
    const result = {};
    for (const k of keys) result[k] = mergeField(existing[k], imported[k]);
    return JSON.stringify(result);
  }
  return existingRaw; // mismatched shapes — don't guess, keep local
}

function mergeField(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...new Set([...a, ...b])];
  return a !== undefined ? a : b; // local wins when both sides have a value
}

function tryParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
