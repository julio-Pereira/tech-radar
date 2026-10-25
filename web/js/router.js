// @ts-check
// Hash routing keeps the app immune to the GitHub Pages /tech-radar/ prefix and
// needs no 404.html. Routes: #/ (radar), #/learn (index), #/learn/<slug> (course),
// #/learn/<slug>/<marco-id> (course, scrolled to that marco — UX item 14's
// bridge links; not a separate page/fetch, trilha-as-page stays trilha-as-page),
// #/paths (role-based paths list), #/paths/<slug> (one path's steps — UX
// platform melhoria 1, always a guide, never a gate), #/glossario (every
// term across every trilha), #/glossario/<anchor> (one term's definitions,
// UX item 16), #/skills (competencies by marco, melhoria 2), #/revisar
// (spaced review, melhoria 5), and #/fin-platform (capstone component map,
// melhoria 7 phase 1).
import { announceRoute } from './announce.js';
import { renderRadar } from './radar.js';
import { renderCoursesIndex } from './courses/index-view.js';
import { renderCourse } from './courses/course-view.js';
import { renderPathsIndex, renderPath } from './courses/paths-view.js';
import { renderGlossarioIndex, renderGlossarioTerm } from './courses/glossario-view.js';
import { renderSkills } from './courses/skills-view.js';
import { renderReview } from './courses/review-view.js';
import { renderCapstoneMap } from './courses/capstone-view.js';

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

/** @returns {{ name: 'radar' | 'learn' | 'course' | 'paths' | 'path' | 'glossario' | 'glossario-term' | 'skills' | 'review' | 'capstone', slug?: string, marcoId?: string, conceitoId?: string }} */
function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean); // "#/learn/x/y" → ["learn","x","y"]
  if (parts[0] === 'learn') {
    // 4th segment: a concept's return point (#/learn/<slug>/<marco>/<conceito>).
    return parts[1] ? { name: 'course', slug: parts[1], marcoId: parts[2], conceitoId: parts[3] } : { name: 'learn' };
  }
  if (parts[0] === 'paths') {
    return parts[1] ? { name: 'path', slug: parts[1] } : { name: 'paths' };
  }
  if (parts[0] === 'glossario') {
    return parts[1] ? { name: 'glossario-term', slug: parts[1] } : { name: 'glossario' };
  }
  if (parts[0] === 'skills') {
    return { name: 'skills' };
  }
  if (parts[0] === 'revisar') {
    return { name: 'review' };
  }
  if (parts[0] === 'fin-platform') {
    return { name: 'capstone' };
  }
  return { name: 'radar' };
}

function route() {
  const isFirstNavigation = !hasNavigatedOnce;
  hasNavigatedOnce = true;

  const r = parseRoute();
  showView(r.name === 'radar' ? 'radar' : 'learn');
  const navKey = r.name === 'radar' ? 'radar'
    : r.name === 'paths' || r.name === 'path' ? 'paths'
    : r.name === 'glossario' || r.name === 'glossario-term' ? 'glossario'
    : r.name === 'skills' ? 'skills'
    : r.name === 'review' ? 'review'
    : r.name === 'capstone' ? 'capstone'
    : 'learn';
  setNavActive(navKey);

  if (r.name === 'radar') {
    announceRoute('Radar', isFirstNavigation);
    renderRadar();
  } else if (r.name === 'learn') {
    announceRoute('Trilhas', isFirstNavigation);
    renderCoursesIndex();
  } else if (r.name === 'course' && r.slug) {
    renderCourse(r.slug, isFirstNavigation, r.marcoId, r.conceitoId); // announces its own title once loaded (or not-found)
  } else if (r.name === 'paths') {
    announceRoute('Caminhos', isFirstNavigation);
    renderPathsIndex();
  } else if (r.name === 'path' && r.slug) {
    renderPath(r.slug, isFirstNavigation); // announces its own title once loaded (or not-found)
  } else if (r.name === 'glossario') {
    announceRoute('Glossário', isFirstNavigation);
    renderGlossarioIndex();
  } else if (r.name === 'glossario-term' && r.slug) {
    renderGlossarioTerm(r.slug, isFirstNavigation); // announces its own title once loaded (or not-found)
  } else if (r.name === 'skills') {
    renderSkills(); // announces its own title once loaded
  } else if (r.name === 'review') {
    renderReview(); // announces its own title once loaded
  } else if (r.name === 'capstone') {
    renderCapstoneMap(); // announces its own title once loaded
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
