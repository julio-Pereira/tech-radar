// @ts-check
// Split out of router.js so course-view.js can announce its own route
// (once its fetch resolves) without importing router.js back — router.js
// already imports renderCourse from course-view.js, and a cycle there would
// serve no purpose.

/**
 * Sets document.title and announces the change to screen readers via the
 * aria-live region. Called once a route's content has actually rendered, so
 * the announcement matches what is on screen. Moves focus to <main> too,
 * unless this is the very first navigation of the session — on a fresh
 * load, leaving focus alone keeps the skip link reachable as the first Tab
 * stop, same as it would be on any other page.
 */
export function announceRoute(label, isFirstNavigation) {
  document.title = label ? `${label} · Tech Radar` : 'Tech Radar';
  const announcer = document.getElementById('route-announcer');
  // "Página carregada: X" — fixed phrasing sidesteps pt-BR gender/number
  // agreement, since "página" (feminine) never varies with the label.
  if (announcer) announcer.textContent = `Página carregada: ${label}`;
  if (isFirstNavigation) return;
  const main = document.getElementById('main-content');
  if (main) main.focus();
}
