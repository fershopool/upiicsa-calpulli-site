import { el } from '../utils/dom.js';
import { activeDepartments, activeStories, feed, isFavorite, isSeen, markSeen, toggleFavorite } from './store.js';
import { PRIORITY_LABEL, avatar, badge, chip, emptyState, mediaFrom, openDialog, plural, prefersReducedMotion, relativeTime } from './ui.js';

const STORY_MS = 5000;

export function postCard(state, post, { onToggle } = {}) {
  const department = state.byId.departments[post.departmentId];
  const visibility = { showDepartment: true, showDate: true, showMedia: true, showLocation: true, showViews: true, ...post.visibility };
  const save = el('button', { className: 'save-button', type: 'button' });
  const paint = () => { const on = isFavorite(post.id); save.textContent = on ? 'Guardado' : 'Guardar aviso'; save.setAttribute('aria-pressed', String(on)); save.classList.toggle('on', on); };
  save.addEventListener('click', () => { toggleFavorite(post.id); paint(); onToggle?.(post); });
  paint();
  const meta = el('div', { className: 'post-meta' }, [
    visibility.showDepartment && department ? el('strong', { text: department.name }) : el('strong', { text: 'Aviso institucional' }),
    visibility.showDate ? el('span', { className: 'muted', text: relativeTime(post.publishedAt) }) : null,
  ]);
  return el('article', { className: `post post-${post.priority}` }, [
    el('header', { className: 'post-head' }, [visibility.showDepartment && department ? avatar(department.name, department.accentToken, 'md', department.avatar) : null, meta, PRIORITY_LABEL[post.priority] ? badge(PRIORITY_LABEL[post.priority], post.priority) : null]),
    el('h3', { text: post.title }),
    el('p', { text: post.body }),
    visibility.showMedia && post.media?.length ? mediaFrom(post.media[0], post.title, 'media-wide') : null,
    visibility.showLocation && post.location ? el('p', { className: 'post-location', text: `Ubicación: ${post.location}` }) : null,
    post.document ? el('p', { className: 'muted', text: 'Incluye un documento de ejemplo.' }) : null,
    el('footer', { className: 'post-foot' }, [visibility.showViews ? el('span', { className: 'muted', text: plural(post.views || 0, 'visualización', 'visualizaciones') }) : el('span'), save]),
  ]);
}

function openStories(state, departmentId, stories, onClose) {
  const department = state.byId.departments[departmentId];
  const list = stories.filter((story) => story.departmentId === departmentId);
  let index = 0; let timer;
  const segments = list.map(() => el('span', { className: 'segment' }));
  const stage = el('div', { className: 'story-stage' });
  const next = () => { if (index < list.length - 1) { index += 1; show(); } else dialog.close(); };
  const prev = () => { index = Math.max(0, index - 1); show(); };
  function show() {
    const story = list[index];
    markSeen(story.id);
    segments.forEach((segment, i) => { segment.classList.toggle('done', i < index); segment.classList.toggle('current', i === index); });
    nextButton.textContent = index === list.length - 1 ? 'Cerrar' : 'Siguiente';
    stage.replaceChildren(mediaFrom(story.media?.[0] || { key: story.id }, story.title || department.name, 'media-story'), el('div', { className: 'story-text' }, [el('h2', { text: story.title || department.name }), story.body ? el('p', { text: story.body }) : null, el('p', { className: 'muted', text: plural(story.views || 0, 'visualización', 'visualizaciones') })]));
    clearTimeout(timer);
    if (!prefersReducedMotion()) timer = setTimeout(next, STORY_MS);
  }
  const nextButton = el('button', { className: 'button', type: 'button', onclick: next });
  const controls = el('div', { className: 'story-controls' }, [el('button', { className: 'button secondary', type: 'button', text: 'Anterior', onclick: prev }), nextButton]);
  const dialog = openDialog(`Historias de ${department.name}`, [el('div', { className: 'story-progress' }, segments), el('div', { className: 'post-head' }, [avatar(department.name, department.accentToken, 'md', department.avatar), el('strong', { text: department.name })]), stage, controls], { className: 'story-dialog', onClose: () => { clearTimeout(timer); onClose(); } });
  show();
}

export function inicio({ state, params, setParam }) {
  let selected = params.get('depto') || '';
  if (!state.byId.departments[selected]) selected = '';
  const departments = activeDepartments(state);
  const railNode = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por departamento' } });
  const storiesNode = el('div', { className: 'rail stories', attrs: { role: 'list', 'aria-label': 'Historias de departamentos' } });
  const feedNode = el('div', { className: 'feed' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });

  function paintRail() {
    railNode.replaceChildren(chip('Todos', !selected, () => select('')), ...departments.map((department) => chip(department.shortName || department.name, selected === department.id, () => select(department.id), avatar(department.name, department.accentToken, 'xs', department.avatar))));
  }
  function paintStories() {
    const stories = activeStories(state);
    const ids = [...new Set(stories.map((story) => story.departmentId))].sort((a, b) => (b === selected) - (a === selected));
    storiesNode.replaceChildren(...ids.map((id) => {
      const department = state.byId.departments[id];
      const unseen = stories.some((story) => story.departmentId === id && !isSeen(story.id));
      const button = el('button', { className: `story-button${unseen ? ' unseen' : ''}`, type: 'button', attrs: { 'aria-label': `Ver historias de ${department.name}${unseen ? ' (sin ver)' : ''}` } }, [avatar(department.name, department.accentToken, 'lg', department.avatar), el('span', { text: department.shortName || department.name })]);
      button.addEventListener('click', () => openStories(state, id, stories, paintStories));
      return el('div', { role: 'listitem' }, [button]);
    }));
    storiesNode.hidden = !ids.length;
  }
  function paintFeed() {
    const posts = feed(state, selected);
    count.textContent = plural(posts.length, 'aviso', 'avisos');
    feedNode.replaceChildren(...(posts.length ? posts.map((post) => postCard(state, post)) : [emptyState(selected ? 'Este departamento no tiene avisos por ahora' : 'Aún no hay avisos', 'Cuando se publiquen avisos aparecerán aquí.', selected ? el('button', { className: 'button secondary', type: 'button', text: 'Ver todos', onclick: () => select('') }) : null)]));
  }
  function select(id) { selected = id; setParam('depto', id); paintRail(); paintStories(); paintFeed(); }

  paintRail(); paintStories(); paintFeed();
  return el('div', {}, [el('h1', { text: 'Avisos de la comunidad' }), el('p', { className: 'lead', text: 'Avisos y actividades de los departamentos de UPIICSA en un solo lugar.' }), storiesNode, railNode, count, feedNode]);
}
