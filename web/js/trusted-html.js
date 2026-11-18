// @ts-check
// Trusted Types (hardening antes da divulgação, Fase 4). The CSP in index.html
// requires Trusted Types for every HTML sink, so a plain string assigned to
// innerHTML throws. The only HTML the site renders is milestone/desafio prose
// compiled and sanitized at build time (bluemonday, aggregator/internal/course);
// it goes through this one named policy. Anything else that tries to write
// HTML — a future bug, an injected script — is refused by the browser. To clear
// an element, use replaceChildren(), never innerHTML = ''.

const POLICY_NAME = 'tech-radar-build';

/** @type {{ createHTML: (s: string) => any } | null} */
let policy = null;
const tt = /** @type {any} */ (globalThis).trustedTypes;
if (tt && typeof tt.createPolicy === 'function') {
  // The input is already sanitized at build time: the policy is a typed
  // marker for "this string came from the build", not a second sanitizer.
  policy = tt.createPolicy(POLICY_NAME, { createHTML: (s) => s });
}

/**
 * Sets an element's content to build-time-sanitized HTML.
 * @param {Element} el
 * @param {string} html HTML from the compiled JSON (data/), never user input
 */
export function setBuildHTML(el, html) {
  el.innerHTML = policy ? policy.createHTML(html) : html;
}
