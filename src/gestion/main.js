import { el, $, announce } from '../utils/dom.js';
import { getPreferences, savePreferences } from '../services/local-storage.service.js';
import { ROLES, currentProfile, profiles, signInAs, signOut, resetDemo } from './store.js';
import { perfiles } from './perfiles.js';
import { departamento } from './departamento.js';
import { emprendimiento } from './emprendimiento.js';
import { tutor } from './tutor.js';
import { feria } from './feria.js';

// Cada ruta declara qué roles la ven; el router rechaza el resto (en backend, repetir la regla en el servidor).
const ROUTES = {
  perfiles: { view: perfiles, roles: ['admin'], title: 'Perfiles' },
  departamento: { view: departamento, roles: ['department', 'admin'], title: 'Departamento' },
  emprendimiento: { view: emprendimiento, roles: ['entrepreneur', 'admin'], title: 'Emprendimiento' },
  tutor: { view: tutor, roles: ['tutor', 'admin'], title: 'Tutor' },
  feria: { view: feria, roles: ['fair_admin', 'admin'], title: 'Feria' },
};
const root = document.documentElement;
root.dataset.theme = getPreferences().theme || 'system';
let leaveHooks = [];

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', id = ''] = path.split('/');
  return { name, id, params: new URLSearchParams(query) };
}
function setParam(key, value) {
  const { name, id, params } = parseHash();
  value ? params.set(key, value) : params.delete(key);
  const query = params.toString();
  history.replaceState(null, '', `#/${[name, id].filter(Boolean).join('/')}${query ? `?${query}` : ''}`);
}

function loginView() {
  const options = profiles().filter((p) => p.isActive);
  const select = el('select', { id: 'who', name: 'who' }, options.map((p) => el('option', { value: p.id, text: `${ROLES[p.role].label} · ${p.name}` })));
  const form = el('form', { className: 'card login-card' }, [
    el('h1', { text: 'Gestión UPIICSA Calpulli' }),
    el('p', { className: 'notice', text: 'Demo sin contraseñas ni cuentas reales: elige un perfil para probar su módulo. Los datos se guardan solo en este navegador.' }),
    el('label', { className: 'field', attrs: { for: 'who' } }, [el('span', { text: 'Entrar como' }), select]),
    el('button', { className: 'button', type: 'submit', text: 'Entrar' }),
  ]);
  form.addEventListener('submit', (event) => { event.preventDefault(); signInAs(select.value); location.hash = `#${ROLES[currentProfile().role].home}`; render(); });
  return el('div', { className: 'login-wrap' }, [form]);
}

function header(profile) {
  const links = Object.entries(ROUTES).filter(([, r]) => r.roles.includes(profile.role)).map(([name, r]) => el('a', { href: `#/${name}`, text: r.title, attrs: { 'data-route': name } }));
  const out = el('button', { className: 'button secondary', type: 'button', text: 'Salir' });
  out.addEventListener('click', () => { signOut(); location.hash = '#/'; });
  const reset = el('button', { className: 'button secondary', type: 'button', text: 'Reiniciar demo' });
  reset.addEventListener('click', () => { if (confirm('Se borrarán todos los cambios locales y se restaurarán los datos de ejemplo. ¿Continuar?')) { resetDemo(); location.hash = '#/'; } });
  const theme = el('button', { className: 'theme-button', type: 'button', text: '◐', attrs: { 'aria-label': 'Cambiar tema' } });
  theme.addEventListener('click', () => { const next = root.dataset.theme === 'dark' ? 'light' : root.dataset.theme === 'light' ? 'system' : 'dark'; root.dataset.theme = next; savePreferences({ theme: next }); });
  return el('header', { className: 'app-header' }, [
    el('div', { className: 'app-bar' }, [
      el('a', { className: 'brand', href: '#/', attrs: { 'aria-label': 'Gestión UPIICSA Calpulli' } }, [el('img', { src: '../src/assets/brand/logo.png', alt: 'UPIICSA Calpulli' })]),
      el('nav', { className: 'tabs', attrs: { 'aria-label': 'Módulos' } }, links),
      el('span', { className: 'who muted', text: `${ROLES[profile.role].label}: ${profile.name}` }),
      el('div', { className: 'app-actions', attrs: { 'aria-label': 'Acciones de sesión' } }, [reset, out, theme]),
    ]),
    el('p', { className: 'demo-banner', text: 'Gestión · demo con datos ficticios, guardados solo en este navegador' }),
  ]);
}

function render({ focus = true } = {}) {
  leaveHooks.forEach((hook) => hook()); leaveHooks = [];
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  const profile = currentProfile();
  const app = $('.app') || $('#app');
  const { name, id, params } = parseHash();
  const route = ROUTES[name];
  let header_ = null; let content;
  if (!profile) { content = loginView(); document.title = 'Entrar · Gestión Calpulli'; }
  else if (!route || !route.roles.includes(profile.role)) { location.replace(`#${ROLES[profile.role].home}`); return; }
  else {
    header_ = header(profile);
    content = route.view({ profile, id, params, setParam, rerender: () => render({ focus: false }), onLeave: (hook) => leaveHooks.push(hook) });
    document.title = `${route.title} · Gestión Calpulli`;
  }
  const main = el('main', { id: 'contenido-principal', className: 'app-main', attrs: { tabindex: '-1' } }, [content]);
  app.replaceWith(el('div', { className: 'app' }, [el('a', { className: 'skip-link', href: '#contenido-principal', text: 'Saltar al contenido' }), header_, main, el('div', { id: 'site-live', className: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } })]));
  document.querySelectorAll('.tabs a').forEach((a) => a.dataset.route === name && a.setAttribute('aria-current', 'page'));
  if (focus) { window.scrollTo(0, 0); $('#contenido-principal').focus({ preventScroll: true }); announce(document.title); }
}

render({ focus: false });
window.addEventListener('hashchange', () => render());
