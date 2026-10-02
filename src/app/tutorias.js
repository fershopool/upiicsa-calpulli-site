import { el } from '../utils/dom.js';
import { tutors } from './store.js';
import { MODE_LABEL, avatar, badge, chip, contactList, emptyState, normalize, plural, tokenFor } from './ui.js';

const NOTICE = 'El contacto y acuerdo de tutoría se realiza fuera de UPIICSA Calpulli.';
const matchesMode = (tutor, mode) => !mode || tutor.modes.includes(mode) || tutor.modes.includes('hybrid');

export function tutorCard(tutor) {
  const subjects = [...new Set(tutor.offers.map((offer) => offer.subject))];
  return el('article', { className: 'card tutor-card' }, [el('div', { className: 'post-head' }, [avatar(tutor.displayName, tokenFor(tutor.id), 'lg'), el('div', {}, [el('h3', { text: tutor.displayName }), el('p', { className: 'muted', text: tutor.modes.map((mode) => MODE_LABEL[mode]).join(' · ') })])]), el('p', { text: tutor.description }), el('ul', { className: 'tags', attrs: { 'aria-label': 'Materias' } }, subjects.slice(0, 3).map((subject) => el('li', { text: subject }))), el('a', { className: 'button secondary', href: `#/tutor/${tutor.id}`, text: 'Ver perfil' })]);
}

export function tutorias({ state, params, setParam }) {
  const all = tutors(state);
  let mode = MODE_LABEL[params.get('modo')] ? params.get('modo') : '';
  let query = params.get('q') || '';
  const search = el('input', { type: 'search', id: 'tutor-search', name: 'q', value: query, placeholder: 'Materia o nombre', attrs: { autocomplete: 'off' } });
  const chips = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por modalidad' } });
  const grid = el('div', { className: 'grid-cards' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  function paint() {
    chips.replaceChildren(chip('Todas', !mode, () => pick('')), ...Object.entries(MODE_LABEL).map(([key, label]) => chip(label, mode === key, () => pick(key))));
    const needle = normalize(query.trim());
    const found = all.filter((tutor) => matchesMode(tutor, mode) && (!needle || normalize(`${tutor.displayName} ${tutor.offers.map((offer) => offer.subject).join(' ')}`).includes(needle)));
    count.textContent = plural(found.length, 'tutor', 'tutores');
    grid.replaceChildren(...(found.length ? found.map(tutorCard) : [emptyState('No encontramos tutores', 'Prueba con otra materia o modalidad.')]));
  }
  const sync = () => { setParam('modo', mode); setParam('q', query); };
  const pick = (key) => { mode = key; sync(); paint(); };
  search.addEventListener('input', () => { query = search.value; sync(); paint(); });
  paint();
  return el('div', {}, [el('h1', { text: 'Tutorías' }), el('p', { className: 'lead', text: 'Encuentra alumnos tutores por materia o modalidad.' }), el('p', { className: 'notice', text: NOTICE }), el('label', { className: 'field', attrs: { for: 'tutor-search' } }, [el('span', { text: 'Buscar' }), search]), chips, count, grid]);
}

export function perfilTutor({ state, id }) {
  const tutor = tutors(state).find((item) => item.id === id);
  if (!tutor) return emptyState('Tutor no disponible', 'Este perfil ya no está disponible.', el('a', { className: 'button', href: '#/tutorias', text: 'Volver a Tutorías' }));
  return el('div', {}, [el('a', { className: 'back', href: '#/tutorias', text: '← Tutorías' }), el('div', { className: 'post-head profile-head' }, [avatar(tutor.displayName, tokenFor(tutor.id), 'xl'), el('div', {}, [el('h1', { text: tutor.displayName }), el('p', { className: 'muted', text: tutor.modes.map((mode) => MODE_LABEL[mode]).join(' · ') })])]), el('p', { text: tutor.description }), el('h2', { text: 'Materias' }), el('ul', { className: 'offer-list' }, tutor.offers.map((offer) => el('li', {}, [el('strong', { text: offer.subject }), offer.description ? el('p', { text: offer.description }) : null, el('p', { className: 'muted' }, [offer.modes.map((mode) => MODE_LABEL[mode]).join(' · '), offer.availabilityLabel ? ` · ${offer.availabilityLabel}` : ''])]))), el('h2', { text: 'Contacto' }), contactList(tutor.externalContacts), el('p', { className: 'notice', text: NOTICE }), badge('Datos de demostración')]);
}
