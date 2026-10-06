import { el, announce } from '../utils/dom.js';
import { badge, emptyState, openDialog, CONTACT_LABEL, MODE_LABEL, fullDate } from '../app/ui.js';
import { field, formData, checkbox, confirmDelete } from './forms.js';
import { list, get, upsert, remove } from './store.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CATEGORIES = ['Alimentos', 'Bebidas', 'Artesanías', 'Tecnología', 'Servicios', 'Moda', 'Otros'];
const catOptions = (empty) => [...(empty ? [['', empty]] : []), ...CATEGORIES.map((c) => [c, c])];
const btn = (text, onClick, cls = 'secondary small') => el('button', { className: `button ${cls}`, type: 'button', text, onclick: onClick });
const errSpan = (text) => (text ? el('span', { className: 'field-error', text, attrs: { role: 'alert' } }) : null);

// --- Helpers compartidos con tutor.js ---------------------------------------------------------

// Entidad vinculada: el rol propio usa su linkedId; el admin elige con un <select> (?id=).
export function pickEntity({ profile, params, setParam, rerender }, collection, noun, labelKey) {
  if (profile.role !== 'admin') return { id: profile.linkedId, selector: null };
  const id = params.get('id') || '';
  const select = el('select', { id: 'entity-pick', attrs: { 'aria-label': noun } }, [el('option', { value: '', text: `Elige ${noun}…` }), ...list(collection).map((r) => el('option', { value: r.id, text: r[labelKey], selected: r.id === id }))]);
  select.addEventListener('change', () => { setParam('id', select.value); rerender(); });
  return { id, selector: el('div', { className: 'toolbar' }, [el('label', { className: 'field', attrs: { for: 'entity-pick' } }, [el('span', { text: `Registro a administrar (${noun})` }), select])]) };
}

// Editor de contactos [{id,type,label,value}]. node.read() devuelve las filas actuales; errors = {índice: mensaje}.
export function contactsEditor(initial = [], errors = {}) {
  const ul = el('ul', { className: 'g-list' });
  const rowsNow = () => [...ul.children].map((li) => ({ id: li.dataset.id, type: li.querySelector('select').value, label: li.querySelector('[data-k=label]').value.trim(), value: li.querySelector('[data-k=value]').value.trim() }));
  const draw = (rows, errs = {}) => {
    ul.replaceChildren(...rows.map((c, i) => {
      const type = el('select', { attrs: { 'aria-label': `Tipo de contacto ${i + 1}` } }, Object.entries(CONTACT_LABEL).map(([v, t]) => el('option', { value: v, text: t, selected: v === c.type })));
      const label = el('input', { type: 'text', value: c.label || '', attrs: { 'data-k': 'label', 'aria-label': `Etiqueta del contacto ${i + 1}`, placeholder: 'Etiqueta (ej. Mi WhatsApp)' } });
      const value = el('input', { type: 'text', value: c.value || '', attrs: { 'data-k': 'value', 'aria-label': `Valor del contacto ${i + 1}`, placeholder: 'Valor', ...(errs[i] && { 'aria-invalid': 'true' }) } });
      return el('li', { className: 'contact-row', attrs: { 'data-id': c.id || `contact-${crypto.randomUUID().slice(0, 8)}` } }, [type, label, value, btn('Quitar', () => { draw(rowsNow().filter((_, j) => j !== i)); announce('Contacto quitado'); }, 'secondary small'), errSpan(errs[i])]);
    }));
  };
  draw(initial, errors);
  const add = btn('Añadir contacto', () => draw([...rowsNow(), { type: 'whatsapp', label: '', value: '' }]));
  const node = el('fieldset', { className: 'contacts-editor' }, [el('legend', { text: 'Contactos externos' }), ul, add]);
  node.read = rowsNow;
  return node;
}
// Quita filas vacías y valida correos. Devuelve {rows, errors}.
export function validateContacts(raw = []) {
  const rows = raw.filter((c) => c.value || c.label);
  const errors = {};
  rows.forEach((c, i) => {
    if (!c.value) errors[i] = 'Escribe el valor del contacto.';
    else if (c.type === 'email' && !EMAIL.test(c.value)) errors[i] = 'Escribe un correo válido.';
  });
  return { rows: rows.map((c) => ({ ...c, label: c.label || CONTACT_LABEL[c.type] })), errors };
}
export function modesField(selected = [], error = '') {
  return el('fieldset', { className: 'field' }, [el('legend', { text: 'Modalidades *' }), ...Object.entries(MODE_LABEL).map(([m, t]) => el('label', { className: 'check' }, [el('input', { type: 'checkbox', name: 'modes', value: m, checked: selected.includes(m) }), el('span', { text: t })])), errSpan(error)]);
}

// Formulario con errores por campo. build(values, errors) -> nodos; save(values) -> errores | null.
export function formView(build, save, { values = {}, submitLabel = 'Guardar', onSaved, onCancel } = {}) {
  const draw = (v, errors) => {
    const form = el('form', { attrs: { novalidate: '' } }, [el('div', { className: 'form-grid' }, build(v, errors)), el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: submitLabel }), onCancel && btn('Cancelar', onCancel)])]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const fd = new FormData(form); const next = formData(form);
      next.modes = fd.getAll('modes');
      form.querySelectorAll('input[type=checkbox]:not([name=modes])').forEach((c) => { next[c.name] = c.checked; });
      const ed = form.querySelector('.contacts-editor'); if (ed) next.contacts = ed.read();
      const errs = save(next);
      if (!errs) return onSaved?.();
      const fresh = draw(next, errs); form.replaceWith(fresh);
      fresh.querySelector('[aria-invalid]')?.focus(); announce('Revisa los campos marcados');
    });
    return form;
  };
  return draw(values, {});
}

// Lista editable con crear/editar/eliminar. editor = {build(v,e,item), save(v,item)->errores|null, values(item)}.
export function crudSection(ctx, { title, noun, rows, line, editor }) {
  const open = (item) => {
    const dialog = openDialog(`${item ? 'Editar' : 'Nuevo'} ${noun}`, [el('h2', { text: `${item ? 'Editar' : 'Nuevo'} ${noun}` }), formView((v, e) => editor.build(v, e, item), (v) => editor.save(v, item), { values: editor.values(item), onCancel: () => dialog.close(), onSaved: () => { dialog.close(); announce(`${noun} guardado`); ctx.rerender(); } })]);
  };
  const items = rows.map((item) => el('li', { className: 'card' }, [el('div', {}, line(item)), el('div', { className: 'row-actions' }, [btn('Editar', () => open(item)), btn('Eliminar', () => { if (confirmDelete(`${noun} «${item.name || item.title || item.subject}»`)) { remove(editor.collection, item.id); announce(`${noun} eliminado`); ctx.rerender(); } }, 'danger small')])]));
  return el('section', { attrs: { 'aria-label': title } }, [el('div', { className: 'toolbar' }, [el('h2', { text: title }), btn(`Nuevo ${noun}`, () => open(null), 'small')]), items.length ? el('ul', { className: 'g-list' }, items) : el('p', { className: 'muted', text: 'Aún no hay registros.' })]);
}

// --- Vista de emprendimiento -------------------------------------------------------------------

export function emprendimiento(ctx) {
  const { profile } = ctx;
  const admin = profile.role === 'admin';
  const { id, selector } = pickEntity(ctx, 'entrepreneurs', 'un emprendimiento', 'displayName');
  const emp = id && get('entrepreneurs', id);
  const root = el('div', { className: 'stack' }, [el('h1', { text: 'Mi emprendimiento' }), selector]);
  if (!emp) return (root.append(emptyState('Sin emprendimiento', admin ? 'Elige un emprendimiento arriba.' : 'Tu perfil aún no está vinculado a un emprendimiento. Pide a un administrador que lo vincule.')), root);

  // 1) Perfil
  const profileForm = formView((v, e) => [
    field('Nombre', 'displayName', { required: true, value: v.displayName, error: e.displayName }),
    field('Categoría', 'category', { control: 'select', required: true, value: v.category, options: catOptions('Elige…'), error: e.category }),
    field('Descripción', 'description', { control: 'textarea', value: v.description }),
    contactsEditor(v.contacts, e.contacts), admin && checkbox('Emprendimiento activo', 'isActive', v.isActive),
  ], (v) => {
    const errs = {};
    if (!v.displayName?.trim()) errs.displayName = 'El nombre es obligatorio.';
    if (!CATEGORIES.includes(v.category)) errs.category = 'Elige una categoría.';
    const c = validateContacts(v.contacts);
    if (Object.keys(c.errors).length) errs.contacts = c.errors;
    if (Object.keys(errs).length) return errs;
    upsert('entrepreneurs', { id: emp.id, displayName: v.displayName.trim(), category: v.category, description: v.description?.trim() || '', externalContacts: c.rows, ...(admin && { isActive: v.isActive }) });
    announce('Perfil guardado'); ctx.rerender(); return null;
  }, { values: { displayName: emp.displayName, category: emp.category, description: emp.description, contacts: emp.externalContacts || [], isActive: emp.isActive !== false }, submitLabel: 'Guardar perfil' });
  root.append(el('section', { attrs: { 'aria-label': 'Perfil' } }, [el('h2', { text: 'Perfil' }), profileForm]));

  // 2) Productos
  root.append(crudSection(ctx, {
    title: 'Productos', noun: 'producto', rows: list('products', (p) => p.entrepreneurId === id),
    line: (p) => [el('strong', { text: p.name }), ' ', badge(p.isActive ? 'Activo' : 'Oculto', p.isActive ? 'status-ok' : 'status-off'), p.priceLabel && el('p', { text: `${p.priceLabel}${p.category ? ` · ${p.category}` : ''}` }), p.description && el('p', { className: 'muted', text: p.description })],
    editor: {
      collection: 'products', values: (p) => ({ name: p?.name, description: p?.description, priceLabel: p?.priceLabel, category: p?.category, isActive: p ? p.isActive !== false : true }),
      build: (v, e) => [field('Nombre', 'name', { required: true, value: v.name, error: e.name }), field('Descripción', 'description', { control: 'textarea', value: v.description }), field('Precio (texto libre)', 'priceLabel', { value: v.priceLabel, hint: 'Ej. $85 MXN' }), field('Categoría', 'category', { control: 'select', value: v.category, options: catOptions('Sin categoría') }), checkbox('Visible en el marketplace', 'isActive', v.isActive)],
      save: (v, p) => {
        if (!v.name?.trim()) return { name: 'El nombre es obligatorio.' };
        upsert('products', { ...(p && { id: p.id }), entrepreneurId: id, name: v.name.trim(), description: v.description?.trim() || '', priceLabel: v.priceLabel?.trim() || '', category: v.category || '', isActive: v.isActive, media: p?.media ?? [] }, 'product'); return null;
      },
    },
  }));

  // 3) Publicaciones
  root.append(crudSection(ctx, {
    title: 'Publicaciones', noun: 'publicación', rows: list('entrepreneurPosts', (p) => p.entrepreneurId === id),
    line: (p) => [el('strong', { text: p.title }), ' ', badge(p.isPublished ? 'Publicada' : 'Borrador', p.isPublished ? 'status-ok' : 'status-off'), p.isHiddenByModerator && [' ', badge('Oculta por moderación', 'status-off')], p.publishedAt && el('p', { className: 'muted', text: fullDate(p.publishedAt) }), el('p', { text: p.body })],
    editor: {
      collection: 'entrepreneurPosts', values: (p) => ({ title: p?.title, body: p?.body, isPublished: !!p?.isPublished }),
      build: (v, e, p) => [field('Título', 'title', { required: true, value: v.title, error: e.title }), field('Texto', 'body', { control: 'textarea', required: true, value: v.body, error: e.body }), checkbox('Publicada', 'isPublished', v.isPublished), p?.isHiddenByModerator && el('p', { className: 'notice', text: 'Un moderador ocultó esta publicación; no puedes revertirlo.' })],
      save: (v, p) => {
        const errs = {};
        if (!v.title?.trim()) errs.title = 'El título es obligatorio.';
        if (!v.body?.trim()) errs.body = 'El texto es obligatorio.';
        if (Object.keys(errs).length) return errs;
        upsert('entrepreneurPosts', { ...(p && { id: p.id }), entrepreneurId: id, title: v.title.trim(), body: v.body.trim(), isPublished: v.isPublished, publishedAt: v.isPublished ? p?.publishedAt || new Date().toISOString() : p?.publishedAt || null, isHiddenByModerator: p?.isHiddenByModerator ?? false, media: p?.media ?? [] }, 'entrepreneur-post'); return null;
      },
    },
  }));

  // 4) Puesto en la feria (el módulo feria.js aprueba o rechaza)
  const stand = list('stands', (s) => s.assignedEntrepreneurId === id)[0];
  const requests = list('standRequests', (r) => r.entrepreneurId === id);
  const pending = requests.find((r) => r.status === 'pending');
  const fair = list('fairs')[0];
  const last = requests.at(-1);
  const fairBody = stand ? el('p', {}, [badge(`Puesto ${stand.number}`, 'status-ok'), ' Tienes un puesto asignado en la feria.'])
    : pending ? el('p', {}, [badge('Solicitud pendiente'), ' Esperando respuesta de la coordinación.'])
      : [last?.status === 'rejected' && el('p', {}, [badge('Solicitud rechazada', 'status-off'), ' Puedes volver a solicitar.']), el('p', { className: 'muted', text: 'Aún no tienes puesto asignado.' }), fair ? btn('Solicitar puesto', () => { upsert('standRequests', { fairId: fair.id, entrepreneurId: id, status: 'pending', createdAt: new Date().toISOString() }, 'standreq'); announce('Solicitud enviada'); ctx.rerender(); }, 'small') : el('p', { className: 'muted', text: 'No hay feria registrada.' })];
  root.append(el('section', { attrs: { 'aria-label': 'Puesto en la feria', 'aria-live': 'polite' } }, [el('h2', { text: 'Puesto en la feria' }), fairBody]));
  return root;
}
