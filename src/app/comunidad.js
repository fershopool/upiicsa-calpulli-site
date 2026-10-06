import { el } from '../utils/dom.js';
import { tutors } from '../services/public-store.js';
import { avatar, badge, chip, emptyState, normalize, profileHref, tokenFor } from '../components/ui.js';

function personCard(item, kind) {
  const name = item.name || item.displayName;
  const token = item.accentToken || tokenFor(item.id);
  const category = kind === 'department' ? 'Departamento' : kind === 'entrepreneur' ? item.category : (item.modes || []).map((mode) => ({ hybrid: 'Híbrido', online: 'En línea', 'in-person': 'Presencial' })[mode]).join(' · ');
  return el('a', { className: 'community-profile-card', href: profileHref(kind, item.id) }, [el('div', { className: 'community-card-top' }, [avatar(name, token, 'lg', item.avatar), badge(kind === 'department' ? 'Área activa' : category, kind)]), el('h3', { text: name }), el('p', { className: 'muted', text: item.description || 'Perfil activo de la comunidad.' }), el('span', { className: 'profile-card-cta', text: 'Ver perfil →' })]);
}

export function comunidad({ state, params, setParam }) {
  let query = params.get('q') || '';
  let type = ['departamentos', 'emprendimientos', 'tutores'].includes(params.get('tipo')) ? params.get('tipo') : '';
  const search = el('input', { type: 'search', id: 'community-search', name: 'q', value: query, placeholder: 'Busca personas, áreas o proyectos', attrs: { autocomplete: 'off' } });
  const filters = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar comunidad' } });
  const resultCount = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const results = el('div', { className: 'community-sections' });
  const sections = [
    ['departamentos', 'Departamentos', state.departments.filter((item) => item.isActive), 'department'],
    ['emprendimientos', 'Emprendimientos', state.entrepreneurs.filter((item) => item.isActive), 'entrepreneur'],
    ['tutores', 'Tutores', tutors(state), 'tutor'],
  ];
  const sync = () => { setParam('q', query); setParam('tipo', type); };
  function paint() {
    const needle = normalize(query.trim());
    filters.replaceChildren(chip('Todos', !type, () => pick('')), ...sections.map(([key, label]) => chip(label, type === key, () => pick(key))));
    const visible = sections.map(([key, title, items, kind]) => [key, title, items.filter((item) => !needle || normalize(`${item.name || item.displayName} ${item.description || ''} ${item.category || ''}`).includes(needle)), kind]).filter(([key]) => !type || key === type);
    const count = visible.reduce((total, [, , items]) => total + items.length, 0);
    resultCount.textContent = `${count} ${count === 1 ? 'perfil encontrado' : 'perfiles encontrados'}`;
    results.replaceChildren(...(count ? visible.filter(([, , items]) => items.length).map(([, title, items, kind]) => el('section', { className: 'community-section' }, [el('div', { className: 'section-heading' }, [el('h2', { text: title }), el('span', { className: 'muted', text: String(items.length) })]), el('div', { className: 'community-grid' }, items.map((item) => personCard(item, kind)))])) : [emptyState('No encontramos perfiles', 'Prueba con otro nombre, área o categoría.') ]));
  }
  const pick = (key) => { type = key; sync(); paint(); };
  search.addEventListener('input', () => { query = search.value; sync(); paint(); });
  paint();
  return el('div', { className: 'community-page' }, [el('div', { className: 'page-intro' }, [el('span', { className: 'eyebrow', text: 'Red viva de UPIICSA' }), el('h1', { text: 'Comunidad' }), el('p', { className: 'lead', text: 'Encuentra áreas, proyectos y personas que hacen comunidad todos los días.' })]), el('label', { className: 'field', attrs: { for: 'community-search' } }, [el('span', { text: 'Buscar en la comunidad' }), search]), filters, resultCount, results]);
}
