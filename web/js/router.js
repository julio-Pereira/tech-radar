// @ts-check
// Hash routing keeps the app immune to the GitHub Pages /tech-radar/ prefix and
// needs no 404.html. Routes: #/ (radar), #/learn (index), #/learn/<slug> (course).
import { announceRoute } from './announce.js';
import { renderRadar } from './radar.js';
import { renderCoursesIndex } from './courses/index-view.js';
import { renderCourse } from './courses/course-view.js';

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

/** @returns {{ name: 'radar' | 'learn' | 'course', slug?: string }} */
function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean); // "#/learn/x" → ["learn","x"]
  if (parts[0] === 'learn') {
    return parts[1] ? { name: 'course', slug: parts[1] } : { name: 'learn' };
  }
  return { name: 'radar' };
}

function route() {
  const isFirstNavigation = !hasNavigatedOnce;
  hasNavigatedOnce = true;

  const r = parseRoute();
  showView(r.name === 'radar' ? 'radar' : 'learn');
  setNavActive(r.name === 'radar' ? 'radar' : 'learn');

  if (r.name === 'radar') {
    announceRoute('Radar', isFirstNavigation);
    renderRadar();
  } else if (r.name === 'learn') {
    announceRoute('Trilhas', isFirstNavigation);
    renderCoursesIndex();
  } else if (r.name === 'course' && r.slug) {
    renderCourse(r.slug, isFirstNavigation); // announces its own title once loaded (or not-found)
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
