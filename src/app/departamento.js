import { el, announce } from '../utils/dom.js';
import { activeStories, feed } from './store.js';
import { avatar, badge, contactList, emptyState, plural, profileHref } from './ui.js';
import { openStories } from './historias.js';
import { postCard } from './inicio.js';

const TOKEN_PAIRS = { mayaBlue: ['#2D78B8', '#149D98'], turquoise: ['#149D98', '#13745E'], jade: ['#13745E', '#2D78B8'], mexicanPink: ['#C83F83', '#A93647'], cempasuchil: ['#DA8A0B', '#C83F83'], cochineal: ['#A93647', '#DA8A0B'] };

function shareButton(kind, id) {
  const button = el('button', { className: 'button secondary', type: 'button', text: 'Compartir perfil' });
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${profileHref(kind, id)}`); announce('Enlace del perfil copiado'); } catch { announce('No se pudo copiar el enlace'); }
  });
  return button;
}
function stat(value, label) { return el('div', { className: 'profile-stat' }, [el('strong', { text: String(value) }), el('span', { text: label })]); }
function tabButton(label, value, selected, onSelect) {
  const button = el('button', { className: 'profile-tab', type: 'button', text: label, attrs: { id: `profile-tab-${value}`, role: 'tab', 'aria-selected': String(selected), 'aria-controls': 'profile-tab-panel', tabindex: selected ? '0' : '-1' } });
  button.dataset.profileTab = String(value);
  button.addEventListener('click', onSelect);
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'ArrowRight' ? (value + 1) % 3 : (value + 2) % 3;
    document.querySelector(`[data-profile-tab="${next}"]`)?.click();
    document.querySelector(`[data-profile-tab="${next}"]`)?.focus();
  });
  return button;
}

export function perfilDepartamento({ state, id, params, setParam }) {
  const department = state.byId.departments[id];
  if (!department?.isActive) return emptyState('Departamento no disponible', 'Este perfil ya no está disponible.', el('a', { className: 'button', href: '#/', text: 'Volver a Avisos' }));
  const posts = feed(state, id);
  const stories = activeStories(state).filter((story) => story.departmentId === id);
  const views = stories.reduce((total, story) => total + (story.views || 0), 0);
  const [from, to] = TOKEN_PAIRS[department.accentToken] || TOKEN_PAIRS.jade;
  let current = Math.min(2, Math.max(0, Number(params.get('tab')) || 0));
  const content = el('div', { className: 'profile-tab-panel', attrs: { id: 'profile-tab-panel', role: 'tabpanel', tabindex: '0' } });
  const tabs = el('div', { className: 'profile-tabs', attrs: { role: 'tablist', 'aria-label': `Información de ${department.name}` } });

  function paintTab() {
    content.setAttribute('aria-labelledby', `profile-tab-${current}`);
    tabs.replaceChildren(...['Avisos', 'Historias', 'Acerca de'].map((label, index) => tabButton(label, index, current === index, () => { current = index; setParam('tab', current ? String(current) : ''); paintTab(); announce(`${label} de ${department.name}`); })));
    if (current === 0) content.replaceChildren(...(posts.length ? posts.map((post) => postCard(state, post)) : [emptyState('Sin avisos por ahora', 'Cuando se publique un aviso aparecerá aquí.')]));
    else if (current === 1) content.replaceChildren(...(stories.length ? stories.map((story) => { const button = el('button', { className: 'story-profile-card', type: 'button' }, [el('span', { className: 'story-profile-kicker', text: 'Historia activa' }), el('strong', { text: story.title }), el('span', { className: 'muted', text: story.body })]); button.addEventListener('click', () => openStories(state, id)); return button; }) : [emptyState('Sin historias activas', 'Las historias aparecerán aquí cuando el departamento publique una.')]));
    else content.replaceChildren(el('div', { className: 'about-grid' }, [el('div', {}, [el('h2', { text: 'Sobre el departamento' }), el('p', { text: department.description })]), contactList(department.contact) || el('p', { className: 'muted', text: 'No hay contactos publicados.' })]));
  }

  const avatarNode = avatar(department.name, department.accentToken, 'xl', department.avatar);
  if (stories.length) {
    avatarNode.classList.add('has-stories');
    avatarNode.removeAttribute('aria-hidden');
    avatarNode.setAttribute('role', 'button'); avatarNode.setAttribute('tabindex', '0'); avatarNode.setAttribute('aria-label', `Ver historias de ${department.name}`);
    const show = () => openStories(state, id);
    avatarNode.addEventListener('click', show); avatarNode.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
  }
  paintTab();
  return el('div', { className: 'profile-page department-profile' }, [
    el('a', { className: 'back', href: '#/', text: '← Avisos' }),
    el('section', { className: 'profile-hero', style: `--profile-from:${from};--profile-to:${to}` }, [el('div', { className: 'profile-hero-copy' }, [el('span', { className: 'eyebrow', text: 'Departamento de la comunidad' }), el('h1', { text: department.name }), el('p', { text: department.description })]), el('div', { className: 'profile-hero-avatar' }, [avatarNode])]),
    el('div', { className: 'profile-toolbar' }, [el('div', { className: 'profile-actions' }, [el('a', { className: 'button', href: '#/', text: 'Ver avisos' }), shareButton('department', id)]), badge('Activo', 'on')]),
    el('div', { className: 'profile-stats', attrs: { 'aria-label': 'Estadísticas del departamento' } }, [stat(posts.length, 'avisos'), stat(stories.length, 'historias activas'), stat(views, 'visualizaciones')]),
    tabs, content, el('p', { className: 'sr-only', text: `Perfil de ${department.name}. ${plural(posts.length, 'aviso', 'avisos')} y ${plural(stories.length, 'historia activa', 'historias activas')}.` }),
  ]);
}
