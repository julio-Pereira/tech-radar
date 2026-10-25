// @ts-check
import { init } from './router.js';
import { initSearch } from './search.js';
import { initConceitos } from './courses/conceitos.js';

init();
initSearch();
const learnView = document.getElementById('view-learn');
if (learnView) initConceitos(learnView);
