import { el, $, announce } from '../utils/dom.js';
import { getPreferences, savePreferences } from '../services/local-storage.service.js';
import { GESTION_STORAGE_KEY, loadState } from '../services/public-store.js';
import { icon } from '../components/ui.js';
import { inicio } from './inicio.js';
import { feria } from './feria.js';
import { marketplace } from './marketplace.js';
import { tutorias, perfilTutor } from './tutorias.js';
import { favoritos } from './favoritos.js';
import { perfilEmprendimiento } from './emprendimiento.js';
import { perfilDepartamento } from './departamento.js';
import { comunidad } from './comunidad.js';

const TABS = [
  ['/', 'Inicio', 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['/feria', 'Feria', 'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4'],
  ['/marketplace', 'Marketplace', 'M5 8h14l-1 13H6z M9 8V6a3 3 0 0 1 6 0v2'],
  ['/tutorias', 'Tutorías', 'M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5'],
  ['/comunidad', 'Comunidad', 'M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0z M4 20c0-3 3-5 8-5s8 2 8 5 M5 9a2.5 2.5 0 1 0 0-5 M19 9a2.5 2.5 0 1 0 0-5'],
  ['/favoritos', 'Favoritos', 'M6 3h12v18l-6-4-6 4z'],
];
const ROUTES = {
  '': { view: inicio, tab: '/', title: 'Avisos' },
  feria: { view: feria, tab: '/feria', title: 'Feria' },
  marketplace: { view: marketplace, tab: '/marketplace', title: 'Marketplace' },
  tutorias: { view: tutorias, tab: '/tutorias', title: 'Tutorías' },
  comunidad: { view: comunidad, tab: '/comunidad', title: 'Comunidad' },
  departamento: { view: perfilDepartamento, tab: '/comunidad', title: 'Departamento' },
  favoritos: { view: favoritos, tab: '/favoritos', title: 'Favoritos' },
  emprendimiento: { view: perfilEmprendimiento, tab: '/marketplace', title: 'Emprendimiento' },
  tutor: { view: perfilTutor, tab: '/tutorias', title: 'Tutor' },
};

let state = loadState();
let leaveHooks = [];
const root = document.documentElement;
root.dataset.theme = getPreferences().theme || 'system';

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', id = ''] = path.split('/');
  return { name, id, params: new URLSearchParams(query) };
}
// Filtros en la URL sin disparar otra navegación: se puede compartir o recargar.
function setParam(key, value) {
  const { name, id, params } = parseHash();
  value ? params.set(key, value) : params.delete(key);
  const query = params.toString();
  history.replaceState(null, '', `#/${[name, id].filter(Boolean).join('/')}${query ? `?${query}` : ''}`);
}

function nav() {
  const link = ([path, label, d]) => el('a', { href: `#${path}`, attrs: { 'data-tab': path } }, [icon(d), el('span', { text: label })]);
  return el('nav', { className: 'tabs', attrs: { 'aria-label': 'Secciones' } }, TABS.map(link));
}
const THEME_NAME = { system: 'del sistema', dark: 'oscuro', light: 'claro' };
function themeButton() {
  const button = el('button', { className: 'theme-button', type: 'button', text: '◐' });
  const label = () => button.setAttribute('aria-label', `Cambiar tema (actual: ${THEME_NAME[root.dataset.theme] || 'del sistema'})`); label();
  button.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : root.dataset.theme === 'light' ? 'system' : 'dark';
    root.dataset.theme = next; savePreferences({ theme: next }); label();
    announce(`Tema ${THEME_NAME[next]} activado`);
  });
  return button;
}

function shell() {
  const header = el('header', { className: 'app-header' }, [el('div', { className: 'app-bar' }, [el('a', { className: 'brand', href: '#/', attrs: { 'aria-label': 'UPIICSA Calpulli, avisos' } }, [el('img', { src: '../src/assets/brand/logo.png', alt: 'UPIICSA Calpulli' })]), nav(), el('a', { className: 'site-link', href: '../', text: 'Sobre el proyecto' }), el('a', { className: 'site-link', href: '../gestion/', text: 'Gestión' }), themeButton()]), el('p', { className: 'demo-banner', text: 'Demo con datos ficticios · Proyecto en desarrollo para la comunidad UPIICSA' })]);
  const footer = el('footer', { className: 'app-footer' }, [el('a', { href: '../privacidad/', text: 'Privacidad' }), el('a', { href: '../contacto/', text: 'Contacto' }), el('span', { className: 'muted', text: 'Tema y favoritos se guardan solo en este navegador.' })]);
  $('#app').replaceWith(el('div', { className: 'app' }, [el('a', { className: 'skip-link', href: '#contenido-principal', text: 'Saltar al contenido' }), header, el('main', { id: 'contenido-principal', className: 'app-main', attrs: { tabindex: '-1' } }), footer, el('div', { id: 'site-live', className: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } })]));
}

function render({ focus = true } = {}) {
  leaveHooks.forEach((hook) => hook()); leaveHooks = [];
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const { name, id, params } = parseHash();
  const route = ROUTES[name];
  const main = $('#contenido-principal');
  document.querySelectorAll('.tabs a').forEach((a) => (a.dataset.tab === route?.tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const tabs = document.querySelector('.tabs');
  const activeTab = TABS.findIndex(([path]) => path === route?.tab);
  tabs?.style.setProperty('--active-index', String(Math.max(0, activeTab)));
  if (!route) {
    main.replaceChildren(el('div', { className: 'empty-state' }, [el('h1', { text: 'Esta sección no existe' }), el('a', { className: 'button', href: '#/', text: 'Volver a Avisos' })]));
    document.title = 'No encontrado · UPIICSA Calpulli';
  } else {
    main.replaceChildren(route.view({ state, id, params, setParam, rerender: () => render({ focus: false }), onLeave: (hook) => leaveHooks.push(hook) }));
    document.title = `${route.title} · UPIICSA Calpulli Demo`;
  }
  main.classList.remove('page-enter');
  void main.offsetWidth;
  main.classList.add('page-enter');
  main.querySelectorAll('.feed, .grid-cards').forEach((group) => {
    [...group.children].slice(0, 12).forEach((child, index) => child.style.setProperty('--i', String(index)));
  });
  if (focus) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); announce(document.title); }
}

shell();
render({ focus: false });
window.addEventListener('hashchange', () => render());
// Gestión comparte localStorage con la demo: se recarga el estado sin recargar la página.
const refresh = () => { state = loadState(); render({ focus: false }); };
window.addEventListener('storage', (event) => { if (event.key === GESTION_STORAGE_KEY || event.key === null) refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
