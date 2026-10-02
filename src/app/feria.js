import { el } from '../utils/dom.js';
import { avatar, badge, fullDate, linkButton, openDialog, plural, tokenFor } from './ui.js';

const UNITS = [['días', 86400000], ['horas', 3600000], ['min', 60000], ['seg', 1000]];

function countdown(target, onLeave) {
  const cells = UNITS.map(([label]) => ({ value: el('strong', { text: '0' }), label }));
  const node = el('div', { className: 'countdown', attrs: { role: 'timer', 'aria-label': 'Cuenta regresiva para la próxima feria' } }, cells.map(({ value, label }) => el('div', {}, [value, el('span', { text: label })])));
  const tick = () => {
    let rest = Math.max(0, Date.parse(target) - Date.now());
    UNITS.forEach(([, size], i) => { cells[i].value.textContent = String(Math.floor(rest / size)).padStart(2, '0'); rest %= size; });
  };
  tick();
  const timer = setInterval(tick, 1000);
  onLeave(() => clearInterval(timer));
  return node;
}

function standDialog(state, stand) {
  const owner = stand.status === 'assigned' ? state.byId.entrepreneurs[stand.assignedEntrepreneurId] : null;
  if (!owner) return openDialog(`Mesa ${stand.number}`, [el('h2', { text: `Mesa ${stand.number}` }), el('p', { text: stand.status === 'available' ? 'Esta mesa está disponible.' : 'Esta mesa está reservada para esta feria.' })]);
  return openDialog(`Mesa ${stand.number}: ${owner.displayName}`, [el('div', { className: 'post-head' }, [avatar(owner.displayName, tokenFor(owner.id), 'lg'), el('div', {}, [el('h2', { text: owner.displayName }), el('p', { className: 'muted', text: `Mesa ${stand.number} · ${owner.category}` })])]), el('p', { text: owner.description }), linkButton('Ver perfil', `#/emprendimiento/${owner.id}`, false)]);
}

function fairMap(state) {
  const grid = el('div', { className: 'fair-map', attrs: { role: 'group', 'aria-label': 'Mapa de mesas de la feria' } });
  state.stands.slice().sort((a, b) => a.coordinate.order - b.coordinate.order || a.number - b.number).forEach((stand) => {
    const owner = stand.status === 'assigned' ? state.byId.entrepreneurs[stand.assignedEntrepreneurId] : null;
    const label = owner ? `Mesa ${stand.number}, ${owner.displayName}` : `Mesa ${stand.number}, ${stand.status === 'available' ? 'disponible' : 'reservada'}`;
    const button = el('button', { className: `stand ${owner ? 'assigned' : stand.status}`, type: 'button', style: `grid-column:${stand.coordinate.column + 1};grid-row:${stand.coordinate.row + 1}`, attrs: { 'aria-label': label } }, [owner ? avatar(owner.displayName, tokenFor(owner.id), 'xs') : null, el('span', { text: String(stand.number) })]);
    button.addEventListener('click', () => standDialog(state, stand));
    grid.append(button);
  });
  return el('div', { className: 'fair-map-wrap' }, [grid]);
}

function standList(state) {
  const assigned = state.stands.filter((stand) => stand.status === 'assigned' && state.byId.entrepreneurs[stand.assignedEntrepreneurId]?.isActive).sort((a, b) => a.number - b.number);
  return el('section', {}, [el('h2', { text: 'Emprendimientos en la feria' }), el('ul', { className: 'stand-list' }, assigned.map((stand) => { const owner = state.byId.entrepreneurs[stand.assignedEntrepreneurId]; return el('li', {}, [el('a', { href: `#/emprendimiento/${owner.id}` }, [avatar(owner.displayName, tokenFor(owner.id), 'sm'), el('span', {}, [el('strong', { text: owner.displayName }), el('span', { className: 'muted', text: ` · Mesa ${stand.number} · ${owner.category}` })])])]); }))]);
}

export function feria({ state, params, setParam, rerender, onLeave }) {
  const { fair } = state;
  const active = fair.status === 'active';
  const preview = params.get('mapa') === 'demo';
  const showMap = active || preview;
  const head = [el('h1', { text: 'Feria de Emprendimiento' }), el('p', { className: 'lead', text: fair.name })];
  if (active) return el('div', {}, [...head, badge('Feria en curso', 'on'), fairMap(state), standList(state)]);

  const toggle = el('button', { className: 'button secondary', type: 'button', text: showMap ? 'Ocultar vista previa del mapa' : 'Ver vista previa del mapa' });
  toggle.addEventListener('click', () => { setParam('mapa', showMap ? '' : 'demo'); rerender(); });
  return el('div', {}, [...head, el('section', { className: 'fair-hero' }, [el('p', { text: 'Próxima feria' }), el('h2', { text: fullDate(fair.nextDate) }), countdown(fair.nextDate, onLeave), el('p', { className: 'muted', text: 'El mapa se habilita durante la feria. Mientras tanto puedes ver una vista previa con mesas de ejemplo.' }), toggle]), showMap ? el('div', {}, [el('p', { className: 'notice', text: `Vista previa de ejemplo: ${plural(state.stands.length, 'mesa', 'mesas')} con emprendimientos ficticios.` }), fairMap(state), standList(state)]) : null]);
}
