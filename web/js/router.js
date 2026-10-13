// @ts-check
// Hash routing keeps the app immune to the GitHub Pages /tech-radar/ prefix and
// needs no 404.html. Routes: #/ (radar), #/learn (index), #/learn/<slug> (course),
// #/learn/<slug>/<marco-id> (course, scrolled to that marco — UX item 14's
// bridge links; not a separate page/fetch, trilha-as-page stays trilha-as-page),
// #/paths (role-based paths list), #/paths/<slug> (one path's steps — UX
// platform melhoria 1, always a guide, never a gate).
import { announceRoute } from './announce.js';
import { renderRadar } from './radar.js';
import { renderCoursesIndex } from './courses/index-view.js';
import { renderCourse } from './courses/course-view.js';
import { renderPathsIndex, renderPath } from './courses/paths-view.js';

// Whether any route has already been entered. Decided synchronously inside
// route(), never by timing of the async work a route kicks off — a course
// route's announceRoute() fires only after its fetch resolves, well after
// route() itself returned, so the flag must be captured up front and
// threaded through, not read later from a module-level variable.
let hasNavigatedOnce = false;

export function init() {
  window.addEventListener('hashchange', route);
  route();
}

/** @returns {{ name: 'radar' | 'learn' | 'course' | 'paths' | 'path', slug?: string, marcoId?: string }} */
function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean); // "#/learn/x/y" → ["learn","x","y"]
  if (parts[0] === 'learn') {
    return parts[1] ? { name: 'course', slug: parts[1], marcoId: parts[2] } : { name: 'learn' };
  }
  if (parts[0] === 'paths') {
    return parts[1] ? { name: 'path', slug: parts[1] } : { name: 'paths' };
  }
  return { name: 'radar' };
}

function route() {
  const isFirstNavigation = !hasNavigatedOnce;
  hasNavigatedOnce = true;

  const r = parseRoute();
  showView(r.name === 'radar' ? 'radar' : 'learn');
  setNavActive(r.name === 'radar' ? 'radar' : r.name === 'paths' || r.name === 'path' ? 'paths' : 'learn');

  if (r.name === 'radar') {
    announceRoute('Radar', isFirstNavigation);
    renderRadar();
  } else if (r.name === 'learn') {
    announceRoute('Trilhas', isFirstNavigation);
    renderCoursesIndex();
  } else if (r.name === 'course' && r.slug) {
    renderCourse(r.slug, isFirstNavigation, r.marcoId); // announces its own title once loaded (or not-found)
  } else if (r.name === 'paths') {
    announceRoute('Caminhos', isFirstNavigation);
    renderPathsIndex();
  } else if (r.name === 'path' && r.slug) {
    renderPath(r.slug, isFirstNavigation); // announces its own title once loaded (or not-found)
  }
}

function showView(which) {
  document.getElementById('view-radar').classList.toggle('hidden', which !== 'radar');
  document.getElementById('view-learn').classList.toggle('hidden', which !== 'learn');
}

function setNavActive(route) {
  document.querySelectorAll('.nav-link').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-route') === route);
  });
}
