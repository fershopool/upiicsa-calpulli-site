import { el } from '../utils/dom.js';
import { activeDepartments, activeStories, feed, isFavorite, toggleFavorite } from '../services/public-store.js';
import { postGallery } from '../components/gallery.js';
import { PRIORITY_LABEL, avatar, badge, chip, emptyState, mediaFrom, plural, profileHref, relativeTime } from '../components/ui.js';
import { createStoriesRail, openStories } from './historias.js';

export function postCard(state, post, { onToggle } = {}) {
  const department = state.byId.departments[post.departmentId];
  const visibility = { showDepartment: true, showDate: true, showMedia: true, showLocation: true, showViews: true, ...post.visibility };
  const save = el('button', { className: 'save-button', type: 'button' });
  const paint = () => { const on = isFavorite(post.id); save.textContent = on ? 'Guardado' : 'Guardar aviso'; save.setAttribute('aria-pressed', String(on)); save.classList.toggle('on', on); };
  save.addEventListener('click', () => { toggleFavorite(post.id); paint(); onToggle?.(post); });
  paint();
  const departmentLink = department && el('a', { className: 'post-profile-link', href: profileHref('department', department.id), attrs: { 'aria-label': `Ver perfil de ${department.name}` } }, [avatar(department.name, department.accentToken, 'md', department.avatar), el('strong', { text: department.name })]);
  const meta = el('div', { className: 'post-meta' }, [visibility.showDepartment && department ? departmentLink : el('strong', { text: 'Aviso institucional' }), visibility.showDate ? el('span', { className: 'muted', text: relativeTime(post.publishedAt) }) : null]);
  return el('article', { className: `post post-${post.priority}` }, [el('header', { className: 'post-head' }, [meta, PRIORITY_LABEL[post.priority] ? badge(PRIORITY_LABEL[post.priority], post.priority) : null]), el('h3', { text: post.title }), el('p', { text: post.body }), visibility.showMedia && post.media?.length ? postGallery(post.media, post.title) || mediaFrom(post.media[0], post.title, 'media-wide') : null, visibility.showLocation && post.location ? el('p', { className: 'post-location', text: `Ubicación: ${post.location}` }) : null, post.document ? el('p', { className: 'muted', text: 'Incluye un documento de ejemplo.' }) : null, el('footer', { className: 'post-foot' }, [visibility.showViews ? el('span', { className: 'muted', text: plural(post.views || 0, 'visualización', 'visualizaciones') }) : el('span'), save])]);
}

function greeting() { const hour = new Date().getHours(); return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'; }

export function inicio({ state, params, setParam }) {
  let selected = params.get('depto') || '';
  if (!state.byId.departments[selected]?.isActive) selected = '';
  const departments = activeDepartments(state);
  const railNode = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por departamento' } });
  const feedNode = el('div', { className: 'feed' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const selectedHeader = el('div', { className: 'selected-department' });
  function paintRail() { railNode.replaceChildren(chip('Todos', !selected, () => select('')), ...departments.map((department) => chip(department.shortName || department.name, selected === department.id, () => select(department.id), avatar(department.name, department.accentToken, 'xs', department.avatar)))); }
  const stories = createStoriesRail(state);
  function paintStories() { stories.update(selected); }
  function paintSelected() {
    const department = state.byId.departments[selected];
    if (!department) { selectedHeader.replaceChildren(); return; }
    const hasStories = activeStories(state).some((story) => story.departmentId === selected);
    selectedHeader.replaceChildren(el('div', { className: 'selected-department-copy' }, [avatar(department.name, department.accentToken, 'lg', department.avatar), el('div', {}, [el('span', { className: 'eyebrow', text: 'Estás explorando' }), el('h2', { text: department.name }), el('p', { className: 'muted', text: department.description })])]), el('div', { className: 'profile-actions' }, [el('a', { className: 'button secondary', href: profileHref('department', department.id), text: 'Ver perfil' }), hasStories ? el('button', { className: 'button secondary', type: 'button', text: 'Ver historias', onclick: () => openStories(state, department.id) }) : null]));
  }
  function paintFeed() { const posts = feed(state, selected); count.textContent = plural(posts.length, 'aviso', 'avisos'); feedNode.replaceChildren(...(posts.length ? posts.map((post) => postCard(state, post)) : [emptyState(selected ? 'Este departamento no tiene avisos por ahora' : 'Aún no hay avisos', 'Cuando se publiquen avisos aparecerán aquí.', selected ? el('button', { className: 'button secondary', type: 'button', text: 'Ver todos', onclick: () => select('') }) : null)])); }
  function select(id) { selected = id; setParam('depto', id); paintRail(); paintStories(); paintSelected(); paintFeed(); }
  paintRail(); paintStories(); paintSelected(); paintFeed();
  return el('div', { className: 'home-page' }, [el('section', { className: 'home-hero' }, [el('div', {}, [el('span', { className: 'eyebrow', text: 'Calpulli en movimiento' }), el('h1', { text: `${greeting()}, comunidad` }), el('p', { className: 'lead', text: 'Todo lo que pasa en UPIICSA, reunido en un solo lugar.' })]), el('div', { className: 'hero-count' }, [el('strong', { text: String(feed(state).length) }), el('span', { text: 'avisos activos' })])]), stories.node, railNode, selectedHeader, count, feedNode]);
}
