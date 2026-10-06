import { el, announce } from '../utils/dom.js';
import { tutors } from '../services/public-store.js';
import { MODE_LABEL, avatar, badge, chip, contactList, emptyState, normalize, plural, profileHref, tokenFor } from '../components/ui.js';

const NOTICE = 'El contacto y acuerdo de tutoría se realiza fuera de UPIICSA Calpulli.';
const TOKEN_PAIRS = { mayaBlue: ['#2D78B8', '#149D98'], turquoise: ['#149D98', '#13745E'], jade: ['#13745E', '#2D78B8'], mexicanPink: ['#C83F83', '#A93647'], cempasuchil: ['#DA8A0B', '#C83F83'], cochineal: ['#A93647', '#DA8A0B'] };
const matchesMode = (tutor, mode) => !mode || (tutor.modes || []).includes(mode) || (tutor.modes || []).includes('hybrid');
function shareButton(id) {
  const button = el('button', { className: 'button secondary', type: 'button', text: 'Compartir perfil' });
  button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${profileHref('tutor', id)}`); announce('Enlace del perfil copiado'); } catch { announce('No se pudo copiar el enlace'); } });
  return button;
}
function stat(value, label) { return el('div', { className: 'profile-stat' }, [el('strong', { text: String(value) }), el('span', { text: label })]); }

export function tutorCard(tutor) {
  const subjects = [...new Set(tutor.offers.map((offer) => offer.subject))];
  const href = profileHref('tutor', tutor.id);
  const card = el('article', { className: 'card tutor-card' }, [el('div', { className: 'post-head' }, [avatar(tutor.displayName, tokenFor(tutor.id), 'lg', tutor.avatar), el('div', {}, [el('h3', { text: tutor.displayName }), el('p', { className: 'muted', text: (tutor.modes || []).map((mode) => MODE_LABEL[mode]).join(' · ') })])]), el('p', { text: tutor.description }), el('ul', { className: 'tags', attrs: { 'aria-label': 'Materias' } }, subjects.slice(0, 3).map((subject) => el('li', { text: subject }))), el('a', { className: 'button secondary', href, text: 'Ver perfil' })]);
  const go = () => { location.hash = href; };
  card.addEventListener('click', (event) => { if (!event.target.closest('a')) go(); });
  return card;
}

export function tutorias({ state, params, setParam }) {
  const all = tutors(state);
  let mode = MODE_LABEL[params.get('modo')] ? params.get('modo') : '';
  let query = params.get('q') || '';
  const search = el('input', { type: 'search', id: 'tutor-search', name: 'q', value: query, placeholder: 'Materia o nombre', attrs: { autocomplete: 'off' } });
  const chips = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por modalidad' } });
  const grid = el('div', { className: 'grid-cards' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const sync = () => { setParam('modo', mode); setParam('q', query); };
  const pick = (key) => { mode = key; sync(); paint(); };
  function paint() {
    chips.replaceChildren(chip('Todas', !mode, () => pick('')), ...Object.entries(MODE_LABEL).map(([key, label]) => chip(label, mode === key, () => pick(key))));
    const needle = normalize(query.trim());
    const found = all.filter((tutor) => matchesMode(tutor, mode) && (!needle || normalize(`${tutor.displayName} ${tutor.offers.map((offer) => offer.subject).join(' ')}`).includes(needle)));
    count.textContent = plural(found.length, 'tutor', 'tutores');
    grid.replaceChildren(...(found.length ? found.map(tutorCard) : [emptyState('No encontramos tutores', 'Prueba con otra materia o modalidad.')]));
  }
  search.addEventListener('input', () => { query = search.value; sync(); paint(); }); paint();
  return el('div', { className: 'tutoring-page' }, [el('div', { className: 'page-intro' }, [el('span', { className: 'eyebrow', text: 'Aprendizaje entre pares' }), el('h1', { text: 'Tutorías' }), el('p', { className: 'lead', text: 'Encuentra alumnos tutores por materia o modalidad.' })]), el('p', { className: 'notice', text: NOTICE }), el('label', { className: 'field', attrs: { for: 'tutor-search' } }, [el('span', { text: 'Buscar' }), search]), chips, count, grid]);
}

export function perfilTutor({ state, id }) {
  const tutor = tutors(state).find((item) => item.id === id);
  if (!tutor) return emptyState('Tutor no disponible', 'Este perfil ya no está disponible.', el('a', { className: 'button', href: '#/tutorias', text: 'Volver a Tutorías' }));
  const subjects = [...new Set(tutor.offers.map((offer) => offer.subject))];
  const related = tutors(state).filter((item) => item.id !== id).slice(0, 3);
  const [from, to] = TOKEN_PAIRS[tokenFor(tutor.id)] || TOKEN_PAIRS.jade;
  return el('div', { className: 'profile-page tutor-profile' }, [
    el('a', { className: 'back', href: '#/tutorias', text: '← Tutorías' }),
    tutor.cover?.type === 'data' ? el('img', { className: 'profile-cover cover-image', src: tutor.cover.url, alt: `Portada de ${tutor.displayName}` }) : el('div', { className: 'profile-cover', style: `--profile-from:${from};--profile-to:${to}`, attrs: { role: 'img', 'aria-label': `Portada abstracta de ${tutor.displayName}` } }, [el('span', { text: 'Aprender en comunidad' })]),
    el('div', { className: 'profile-identity' }, [avatar(tutor.displayName, tokenFor(tutor.id), 'xl', tutor.avatar), el('div', {}, [el('span', { className: 'eyebrow', text: 'Tutor activo' }), el('h1', { text: tutor.displayName }), el('p', { className: 'muted', text: (tutor.modes || []).map((mode) => MODE_LABEL[mode]).join(' · ') })])]),
    el('div', { className: 'profile-toolbar' }, [el('div', { className: 'profile-actions' }, [el('a', { className: 'button', href: '#/tutorias', text: 'Explorar tutorías' }), shareButton(id)]), badge('Perfil activo', 'on')]),
    el('div', { className: 'profile-stats' }, [stat(subjects.length, 'materias'), stat(tutor.offers.length, 'ofertas activas'), stat((tutor.modes || []).length, 'modalidades')]),
    el('p', { className: 'profile-description', text: tutor.description }),
    el('section', {}, [el('div', { className: 'section-heading' }, [el('h2', { text: 'Materias' }), el('span', { className: 'muted', text: `${tutor.offers.length} opciones` })]), el('ul', { className: 'offer-list' }, tutor.offers.map((offer) => el('li', {}, [el('div', { className: 'offer-heading' }, [el('strong', { text: offer.subject }), el('a', { className: 'text-link', href: `#/tutorias?q=${encodeURIComponent(offer.subject)}`, text: 'Ver similares' })]), offer.description ? el('p', { text: offer.description }) : null, el('p', { className: 'muted', text: `${(offer.modes || tutor.modes || []).map((mode) => MODE_LABEL[mode]).join(' · ')}${offer.availabilityLabel ? ` · ${offer.availabilityLabel}` : ''}` })])))]),
    el('section', {}, [el('h2', { text: 'Contacto' }), contactList(tutor.externalContacts), el('p', { className: 'notice', text: NOTICE })]),
    el('section', {}, [el('div', { className: 'section-heading' }, [el('h2', { text: 'Más tutores' }), el('a', { className: 'text-link', href: '#/tutorias', text: 'Ver todos' })]), el('div', { className: 'grid-cards related-tutors' }, related.map(tutorCard))]),
  ]);
}
