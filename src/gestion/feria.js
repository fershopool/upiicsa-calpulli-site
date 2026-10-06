import { el, announce } from '../utils/dom.js';
import { openDialog, badge, plural } from '../app/ui.js';
import { nextFairDate } from '../app/store.js';
import { list, get, upsert, remove } from './store.js';
import { field, formData, confirmDelete } from './forms.js';

const TZ = 'America/Mexico_City';
const STATUS = [['upcoming', 'Próxima'], ['live', 'En curso'], ['finished', 'Finalizada'], ['cancelled', 'Cancelada']];
const REQ_LABEL = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'short', timeZone: TZ });
const partsFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// ISO (UTC) -> "YYYY-MM-DDTHH:mm" en hora de Ciudad de México.
const toLocalInput = (iso) => (iso ? partsFmt.format(new Date(iso)).replace(' ', 'T') : '');
// ponytail: México sin horario de verano desde 2022 (UTC-6 fijo); si vuelve, calcular el desfase con Intl.
const fromLocalInput = (value) => new Date(`${value}:00-06:00`).toISOString();
const btn = (text, label, onClick, cls = 'button secondary') => { const b = el('button', { className: cls, type: 'button', text, attrs: { 'aria-label': label } }); b.addEventListener('click', onClick); return b; };
const section = (title, ...children) => el('section', { className: 'card', attrs: { 'aria-label': title } }, [el('h2', { text: title }), ...children]);

export function feria({ params, setParam, rerender }) {
  const fair = list('fairs')[0];
  if (!fair) return el('p', { className: 'notice', text: 'No hay una feria registrada.' });
  const stands = () => list('stands', (s) => s.fairId === fair.id).sort((a, b) => a.number - b.number);
  const standOf = (entId) => stands().find((s) => s.status === 'assigned' && s.assignedEntrepreneurId === entId);
  const nameOf = (id) => get('entrepreneurs', id)?.displayName || 'Emprendedor eliminado';
  const done = (msg) => { rerender(); announce(msg); };
  const assign = (stand, entId, extra) => { upsert('stands', { id: stand.id, status: 'assigned', assignedEntrepreneurId: entId }); extra?.(); done(`Puesto ${stand.number} asignado a ${nameOf(entId)}.`); };
  const live = el('p', { className: 'sr-only', attrs: { 'aria-live': 'polite' } });

  // 1) Datos de la feria
  const dateField = field('Próxima fecha (hora de Ciudad de México)', 'nextDate', { type: 'datetime-local', value: toLocalInput(fair.nextDate) });
  const form = el('form', { className: 'form-grid' }, [
    field('Nombre', 'name', { value: fair.name, required: true }),
    field('Estado', 'status', { control: 'select', value: fair.status, options: STATUS.some(([v]) => v === fair.status) ? STATUS : [...STATUS, [fair.status, fair.status]] }),
    dateField,
    field('Recurrencia sugerida (días)', 'recurrenceHintDays', { type: 'number', value: fair.recurrenceHintDays ?? '', min: '1', max: '365' }),
    el('div', { className: 'row-actions' }, [
      btn('Usar próximo miércoles', 'Usar próximo miércoles como fecha', () => { form.elements.nextDate.value = toLocalInput(nextFairDate()); }),
      el('button', { className: 'button', type: 'submit', text: 'Guardar datos' }),
    ]),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const d = formData(form);
    if (!d.name.trim()) { form.elements.name.focus(); return; }
    upsert('fairs', { id: fair.id, name: d.name.trim(), status: d.status, nextDate: d.nextDate ? fromLocalInput(d.nextDate) : fair.nextDate, recurrenceHintDays: d.recurrenceHintDays ? Number(d.recurrenceHintDays) : undefined });
    done('Datos de la feria guardados.');
  });
  const next = el('p', { className: 'muted', text: fair.nextDate ? `Fecha actual: ${dateFmt.format(new Date(fair.nextDate))}` : 'Sin fecha definida.' });

  // 2) Puestos
  const all = stands();
  const free = all.filter((s) => s.status === 'available');
  const withoutStand = () => list('entrepreneurs', (e) => e.isActive && !standOf(e.id));
  const assignDialog = (stand) => {
    const options = withoutStand();
    if (!options.length) { announce('No hay emprendedores activos sin puesto.'); live.textContent = 'No hay emprendedores activos sin puesto.'; return; }
    const f = el('form', { className: 'form-grid' }, [field('Emprendedor', 'ent', { control: 'select', required: true, options: options.map((e) => [e.id, e.displayName]) }), el('button', { className: 'button', type: 'submit', text: `Asignar puesto ${stand.number}` })]);
    const dlg = openDialog(`Asignar puesto ${stand.number}`, [el('h2', { text: `Asignar puesto ${stand.number}` }), f]);
    f.addEventListener('submit', (e) => { e.preventDefault(); const id = formData(f).ent; if (standOf(id)) { live.textContent = 'Ese emprendedor ya tiene puesto.'; return; } dlg.close(); assign(stand, id); });
  };
  const standCard = (s) => {
    const assigned = s.status === 'assigned';
    const actions = assigned
      ? [btn('Liberar', `Liberar puesto ${s.number}`, () => { upsert('stands', { id: s.id, status: 'available', assignedEntrepreneurId: undefined }); done(`Puesto ${s.number} liberado.`); })]
      : [btn('Asignar', `Asignar puesto ${s.number}`, () => assignDialog(s)), btn('Eliminar', `Eliminar puesto ${s.number}`, () => { if (confirmDelete(`el puesto ${s.number}`)) { remove('stands', s.id); done(`Puesto ${s.number} eliminado.`); } })];
    return el('li', { className: 'card' }, [el('strong', { text: `Puesto ${s.number}` }), ' ', badge(assigned ? 'Asignado' : 'Disponible', assigned ? '' : 'status-ok'), assigned ? el('p', { text: nameOf(s.assignedEntrepreneurId) }) : null, el('div', { className: 'row-actions' }, actions)]);
  };
  const addStand = btn('Crear puesto', 'Crear puesto nuevo', () => {
    const n = Math.max(0, ...all.map((s) => s.number)) + 1;
    const col = all.length;
    upsert('stands', { id: `stand-${String(n).padStart(2, '0')}-${Date.now().toString(36)}`, fairId: fair.id, number: n, status: 'available', coordinate: { row: 0, column: col, branch: 'top', order: n } }, 'stand');
    done(`Puesto ${n} creado.`);
  }, 'button');
  const standsSec = section('Puestos',
    el('p', { text: `${plural(free.length, 'disponible', 'disponibles')} · ${plural(all.length - free.length, 'asignado', 'asignados')} · ${all.length} en total` }),
    el('div', { className: 'toolbar' }, [addStand]), live,
    all.length ? el('ul', { className: 'stand-admin-grid', attrs: { 'aria-label': 'Puestos de la feria' } }, all.map(standCard)) : el('p', { className: 'muted', text: 'Aún no hay puestos.' }));

  // 3) Solicitudes
  const filter = params.get('estado') || '';
  const reqs = list('standRequests', (r) => r.fairId === fair.id && (!filter || r.status === filter)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const approve = (r) => {
    const open = stands().filter((s) => s.status === 'available');
    if (!open.length) { live.textContent = 'No hay puestos disponibles; crea uno antes de aprobar.'; announce(live.textContent); return; }
    if (standOf(r.entrepreneurId)) { live.textContent = `${nameOf(r.entrepreneurId)} ya tiene un puesto asignado.`; announce(live.textContent); return; }
    const f = el('form', { className: 'form-grid' }, [field('Puesto disponible', 'stand', { control: 'select', required: true, options: open.map((s) => [s.id, `Puesto ${s.number}`]) }), el('button', { className: 'button', type: 'submit', text: 'Aprobar y asignar' })]);
    const dlg = openDialog('Aprobar solicitud', [el('h2', { text: `Aprobar a ${nameOf(r.entrepreneurId)}` }), f]);
    f.addEventListener('submit', (e) => { e.preventDefault(); const s = get('stands', formData(f).stand); dlg.close(); assign(s, r.entrepreneurId, () => upsert('standRequests', { id: r.id, status: 'approved' })); });
  };
  const reqRow = (r) => el('tr', {}, [
    el('td', { text: nameOf(r.entrepreneurId) }), el('td', { text: dateFmt.format(new Date(r.createdAt)) }), el('td', {}, [badge(REQ_LABEL[r.status] || r.status)]),
    el('td', {}, r.status === 'pending' ? [el('div', { className: 'row-actions' }, [
      btn('Aprobar', `Aprobar solicitud de ${nameOf(r.entrepreneurId)}`, () => approve(r)),
      btn('Rechazar', `Rechazar solicitud de ${nameOf(r.entrepreneurId)}`, () => { if (window.confirm(`¿Rechazar la solicitud de ${nameOf(r.entrepreneurId)}?`)) { upsert('standRequests', { id: r.id, status: 'rejected' }); done('Solicitud rechazada.'); } }),
    ])] : []),
  ]);
  const sel = field('Filtrar por estado', 'estado', { control: 'select', value: filter, options: [['', 'Todas'], ...Object.entries(REQ_LABEL)] });
  sel.querySelector('select').addEventListener('change', (e) => { setParam('estado', e.target.value); rerender(); });
  const reqSec = section('Solicitudes de puesto', sel, reqs.length
    ? el('div', { className: 'table-wrap' }, [el('table', { className: 'table' }, [el('caption', { className: 'sr-only', text: 'Solicitudes de puesto' }), el('thead', {}, [el('tr', {}, ['Emprendedor', 'Fecha', 'Estado', 'Acciones'].map((h) => el('th', { text: h, attrs: { scope: 'col' } })))]), el('tbody', {}, reqs.map(reqRow))])])
    : el('p', { className: 'muted', text: 'No hay solicitudes con este filtro.' }));

  // 4) Participantes
  const part = all.filter((s) => s.status === 'assigned');
  const partSec = section('Emprendedores participantes', part.length
    ? el('div', { className: 'table-wrap' }, [el('table', { className: 'table' }, [el('caption', { className: 'sr-only', text: 'Emprendedores con puesto asignado' }), el('thead', {}, [el('tr', {}, ['Emprendedor', 'Categoría', 'Puesto'].map((h) => el('th', { text: h, attrs: { scope: 'col' } })))]), el('tbody', {}, part.map((s) => el('tr', {}, [el('td', { text: nameOf(s.assignedEntrepreneurId) }), el('td', { text: get('entrepreneurs', s.assignedEntrepreneurId)?.category || '' }), el('td', { text: String(s.number) })])))])])
    : el('p', { className: 'muted', text: 'Aún no hay participantes con puesto.' }));

  return el('div', {}, [el('h1', { text: 'Administración de la feria' }), section('Datos de la feria', form, next), standsSec, reqSec, partSec]);
}
