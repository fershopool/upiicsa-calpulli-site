import { el, announce } from '../utils/dom.js';
import { badge, emptyState, openDialog, avatar, tokenFor, CONTACT_LABEL, MODE_LABEL, fullDate } from '../components/ui.js';
import { imagePicker, toggleRow, settingsLayout, imageUrl, profileShell, postImage, openLightbox, readImage } from './social.js';
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

// --- Piezas nuevas compartidas con tutor.js (estilo red social) -----------------------------------

const media1 = (item) => item?.media?.find((m) => m.type === 'data') || null;
// Devuelve el foco a la pestaña activa si el diálogo cerrado dejó el foco en <body> (el trigger pudo redibujarse).
const restoreFocus = () => window.setTimeout(() => { if (document.activeElement === document.body) document.querySelector('.sp-tab[aria-selected=true]')?.focus(); }, 30);

// Selector de imagen que se redibuja solo. get() -> media|null, set(media|null).
export function mediaField(label, get, set, max = 800) {
  const box = el('div');
  const draw = () => box.replaceChildren(imagePicker({ label, value: get(), max, onChange: (m) => { set(m); draw(); } }));
  draw(); return box;
}

// Diálogo con formView. editor = {build(v,e,item), save(v,item)->errores|null, values(item)}.
export function editDialog(ctx, noun, item, editor) {
  const title = `${item ? 'Editar' : 'Nuevo'} ${noun}`;
  const dialog = openDialog(title, [el('h2', { text: title }), formView((v, e) => editor.build(v, e, item), (v) => editor.save(v, item), { values: editor.values(item), onCancel: () => dialog.close(), onSaved: () => { dialog.close(); announce(`${noun} guardado`); ctx.rerender(); } })], { onClose: restoreFocus });
  return dialog;
}

// Pestañas en URL (?tab=). tabs: [[key,label,build]]. Devuelve {active, body, onTab}.
export function tabState(ctx, tabs) {
  const active = tabs.some(([k]) => k === ctx.params.get('tab')) ? ctx.params.get('tab') : tabs[0][0];
  const onTab = (key, focus) => { ctx.setParam('tab', key); ctx.setParam('s', ''); ctx.rerender(); if (focus) window.setTimeout(() => document.querySelector('.sp-tab[aria-selected=true]')?.focus(), 30); };
  const [, , build] = tabs.find(([k]) => k === active);
  return { active, onTab, body: el('div', { className: 'ep-body', attrs: { role: 'tabpanel' } }, [build()]), tabs: tabs.map(([k, l]) => [k, l]) };
}

const drafts = new Map(); const pendingErrors = new Map();
const norm = (d) => JSON.stringify({ ...d, contacts: (d.contacts || []).filter((c) => c.value || c.label).map(({ type, label, value }) => ({ type, label, value })) });

// Ajustes con borrador, indicador de cambios sin guardar, guardado explícito y vista previa en vivo.
// cfg = {collection, entity, admin, toDraft(e), toRecord(d), validate(d)->errores, where:{campo:sección}, sections:(d,api)->[[key,label,nodo|fn]], preview(d)->nodo}
export function profileSettings(ctx, cfg) {
  const key = `${cfg.collection}:${cfg.entity.id}`;
  const saved = cfg.toDraft(cfg.entity);
  const d = drafts.get(key) || structuredClone(saved);
  drafts.set(key, d);
  const errors = pendingErrors.get(key) || {}; pendingErrors.delete(key);
  let contactsNode = null;
  const sync = () => { if (contactsNode?.isConnected) d.contacts = contactsNode.read(); };
  const dirty = () => { sync(); return norm(d) !== norm(saved); };
  const status = el('span', { className: 'ep-dirty', attrs: { 'aria-live': 'polite' } });
  const previewBox = el('section', { className: 'ep-preview', attrs: { 'aria-label': 'Vista previa de la tarjeta pública' } });
  const refresh = () => { const x = dirty(); status.textContent = x ? 'Cambios sin guardar' : 'Todo guardado'; status.classList.toggle('is-dirty', x); previewBox.replaceChildren(el('h2', { text: 'Vista previa de tu tarjeta pública' }), cfg.preview(d)); };

  const api = {
    errors, d,
    field(label, prop, opts = {}) {
      const node = field(label, prop, { value: d[prop] ?? '', error: errors[prop], 'data-prop': prop, ...opts });
      if (opts.maxlength) {
        const count = el('span', { className: 'muted ep-count', attrs: { 'aria-hidden': 'true' } }); const input = node.querySelector('textarea,input');
        const upd = () => { count.textContent = `${input.value.length}/${opts.maxlength}`; }; upd(); input.addEventListener('input', upd); node.append(count);
      }
      return node;
    },
    pick(label, prop, shape, max) { return imagePicker({ label, value: d[prop], max, shape, onChange: (m) => { sync(); d[prop] = m; ctx.rerender(); } }); },
    contacts() { contactsNode = contactsEditor(d.contacts, errors.contacts); return contactsNode; },
    toggle(label, hint, checked, onChange) { return toggleRow(label, hint, checked, (v) => { onChange(v); refresh(); }); },
    error: (prop) => (errors[prop] ? el('span', { className: 'field-error', text: errors[prop], attrs: { role: 'alert' } }) : null),
    reload() { sync(); ctx.rerender(); },
  };
  const sections = cfg.sections(d, api);
  const activeSection = sections.some(([k]) => k === ctx.params.get('s')) ? ctx.params.get('s') : sections[0][0];

  const save = () => {
    sync();
    const errs = cfg.validate(d);
    if (Object.keys(errs).length) {
      pendingErrors.set(key, errs); ctx.setParam('s', cfg.where[Object.keys(errs)[0]] || sections[0][0]); ctx.rerender(); announce('Revisa los campos marcados');
      window.setTimeout(() => document.querySelector('.sp-panel [aria-invalid]')?.focus(), 50); return;
    }
    upsert(cfg.collection, cfg.toRecord(d)); drafts.delete(key); announce('Cambios guardados'); ctx.rerender();
  };
  const bar = el('div', { className: 'ep-savebar card' }, [status, el('div', { className: 'row-actions' }, [el('button', { className: 'button secondary small', type: 'button', text: 'Descartar', onclick: () => { drafts.delete(key); ctx.rerender(); } }), el('button', { className: 'button', type: 'button', text: 'Guardar cambios', onclick: save })])]);
  const layout = settingsLayout(sections, activeSection, (k) => { sync(); ctx.setParam('s', k); ctx.rerender(); });
  const root = el('div', { className: 'stack ep-settings' }, [bar, layout, previewBox]);
  root.addEventListener('input', (e) => { const p = e.target.dataset?.prop; if (p) d[p] = e.target.value; refresh(); });
  root.addEventListener('change', () => refresh());
  root.addEventListener('click', () => window.setTimeout(refresh, 0));
  refresh();
  return root;
}

export const previewCard = (d, id, subtitle) => el('div', { className: 'card ep-card-preview' }, [imageUrl(d.avatar) ? el('img', { className: 'avatar avatar-xl ep-prev-photo', src: imageUrl(d.avatar), alt: '' }) : avatar(d.displayName || '?', tokenFor(id), 'xl'), el('div', {}, [el('strong', { text: d.displayName || 'Sin nombre' }), subtitle ? el('p', { className: 'muted', text: subtitle }) : null, el('p', { text: d.description || 'Sin descripción.' })])]);

export const activeToggle = (api, d, noun, admin) => admin ? api.toggle(`${noun} activo`, 'Controla si aparece públicamente.', d.isActive, (v) => { d.isActive = v; }) : el('p', { className: 'muted', text: `Estado: ${d.isActive ? 'activo' : 'inactivo'}. Solo la administración puede cambiarlo.` });

// --- Vista de emprendimiento -------------------------------------------------------------------

const statusBadge = (p) => (p.isHiddenByModerator ? badge('Oculto por moderación', 'status-off') : p.isPublished ? badge('Publicado', 'status-ok') : badge('Borrador', 'status-off'));

const imageButton = (url, alt, style = '') => {
  const button = el('button', { className: 'ep-image-button', type: 'button', style: 'display:block;width:100%;padding:0;border:0;background:none;color:inherit;cursor:zoom-in;', attrs: { 'aria-label': `Ampliar ${alt}` } });
  button.append(el('img', { src: url, alt, loading: 'lazy', decoding: 'async', style }));
  button.addEventListener('click', () => openLightbox({ url, alt }));
  return button;
};

const composerPhoto = (value, onChange) => {
  const host = el('div', { className: 'composer-photo' });
  const input = el('input', { type: 'file', accept: 'image/*', className: 'sr-only', id: `post-photo-${Math.random().toString(36).slice(2, 7)}` });
  const status = el('span', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const draw = (media) => {
    const preview = media ? el('img', { src: media.url, alt: 'Vista previa de la publicación', loading: 'lazy', decoding: 'async' }) : null;
    const choose = el('label', { className: 'button secondary', attrs: { for: input.id }, text: media ? 'Cambiar foto' : 'Foto (opcional)' });
    const removePhoto = media ? btn('Quitar', () => { input.value = ''; onChange(null); draw(null); }, 'secondary') : null;
    host.replaceChildren(...[preview, el('div', { className: 'row-actions' }, [choose, removePhoto]), status, input].filter(Boolean));
  };
  input.addEventListener('change', async () => {
    try { const url = await readImage(input.files[0], 2048); onChange({ type: 'data', url }); draw({ type: 'data', url }); }
    catch (error) { status.textContent = error.message; }
  });
  draw(value);
  return host;
};

// Compositor (nuevo o edición). onDone se llama tras guardar; onCancel opcional.
function composer(ctx, id, item, { onDone, onCancel } = {}) {
  let media = media1(item);
  const draw = (v, errs = {}) => {
    let pub = !!v.isPublished;
    const form = el('form', { className: `ep-composer${item ? '' : ' card'}`, attrs: { novalidate: '', 'aria-label': item ? 'Editar publicación' : 'Nueva publicación' } }, [
      field('Título (opcional)', 'title', { value: v.title || '', error: errs.title }),
      field('Texto (opcional)', 'body', { control: 'textarea', value: v.body || '', error: errs.body }),
      composerPhoto(media, (m) => { media = m; }),
      toggleRow('Publicar', 'Si está apagado se guarda como borrador.', pub, (c) => { pub = c; }),
      item?.isHiddenByModerator ? el('p', { className: 'notice', text: 'Un moderador ocultó esta publicación; no puedes revertirlo.' }) : null,
      el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: item ? 'Guardar publicación' : 'Publicar' }), onCancel && btn('Cancelar', onCancel)]),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = formData(form); const errs2 = {};
      if (!fd.title?.trim() && !fd.body?.trim() && !media?.url) errs2.body = 'Escribe un texto o agrega una foto.';
      if (Object.keys(errs2).length) { const fresh = draw({ ...fd, isPublished: pub }, errs2); form.replaceWith(fresh); fresh.querySelector('[aria-invalid]')?.focus(); announce('Revisa los campos marcados'); return; }
      const saved = upsert('entrepreneurPosts', { ...(item && { id: item.id }), entrepreneurId: id, title: fd.title?.trim() || '', body: fd.body?.trim() || '', isPublished: pub, publishedAt: pub ? item?.publishedAt || new Date().toISOString() : item?.publishedAt || null, isHiddenByModerator: item?.isHiddenByModerator ?? false, media: media ? [{ type: 'data', url: media.url }] : [] }, 'entrepreneur-post');
      if (!saved) { form.prepend(el('p', { className: 'notice', text: 'No hay espacio en el navegador: usa una foto más pequeña', attrs: { role: 'alert' } })); return; }
      announce('Publicación guardada'); onDone();
    });
    return form;
  };
  return draw({ title: item?.title, body: item?.body, isPublished: item ? !!item.isPublished : true });
}

function postsTab(ctx, id) {
  const posts = list('entrepreneurPosts', (p) => p.entrepreneurId === id).sort((a, b) => String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)));
  const edit = (p) => { let dialog; dialog = openDialog('Editar publicación', [el('h2', { text: 'Editar publicación' }), composer(ctx, id, p, { onCancel: () => dialog.close(), onDone: () => { dialog.close(); ctx.rerender(); } })], { onClose: restoreFocus }); };
  const cards = posts.map((p) => el('article', { className: 'card sp-post ep-post' }, [
    imageUrl(media1(p)) ? postImage({ url: imageUrl(media1(p)), alt: `Imagen de la publicación «${p.title || 'sin título'}»` }) : null,
    el('div', { className: 'ep-card-head' }, [p.title ? el('h3', { text: p.title }) : null, statusBadge(p)]),
    p.publishedAt && p.isPublished ? el('p', { className: 'muted', text: fullDate(p.publishedAt) }) : null,
    p.body ? el('p', { text: p.body }) : null,
    el('div', { className: 'row-actions' }, [btn('Editar', () => edit(p)), btn('Eliminar', () => { if (confirmDelete(`la publicación «${p.title}»`)) { remove('entrepreneurPosts', p.id); announce('Publicación eliminada'); ctx.rerender(); } }, 'danger small')]),
  ]));
  return el('div', { className: 'sp-feed', style: 'width:100%;margin-inline:auto;' }, [el('h2', { text: 'Nueva publicación' }), composer(ctx, id, null, { onDone: ctx.rerender }), el('h2', { text: 'Tus publicaciones' }), cards.length ? cards : el('p', { className: 'muted', text: 'Aún no hay publicaciones. Escribe la primera arriba.' })]);
}

function productsTab(ctx, id) {
  const editor = (p) => { let media = p ? [...(p.media ?? [])] : []; return {
    values: (it) => ({ name: it?.name, description: it?.description, priceLabel: it?.priceLabel, category: it?.category, isActive: it ? it.isActive !== false : true }),
    build: (v, e) => [field('Nombre', 'name', { required: true, value: v.name, error: e.name }), field('Descripción', 'description', { control: 'textarea', value: v.description }), field('Precio (texto libre)', 'priceLabel', { value: v.priceLabel, hint: 'Ej. $85 MXN' }), field('Categoría', 'category', { control: 'select', value: v.category, options: catOptions('Sin categoría') }), mediaField('Foto del producto', () => media1({ media }), (m) => { media = m ? [m] : []; }, 800), checkbox('Visible en el marketplace', 'isActive', v.isActive)],
    save: (v, it) => {
      if (!v.name?.trim()) return { name: 'El nombre es obligatorio.' };
      upsert('products', { ...(it && { id: it.id }), entrepreneurId: id, name: v.name.trim(), description: v.description?.trim() || '', priceLabel: v.priceLabel?.trim() || '', category: v.category || '', isActive: v.isActive, media }, 'product'); return null;
    },
  }; };
  const rows = list('products', (p) => p.entrepreneurId === id);
  const cards = rows.map((p) => el('li', { className: `card ep-product${p.isActive ? '' : ' is-off'}` }, [
    imageUrl(media1(p)) ? imageButton(imageUrl(media1(p)), p.name, 'width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--line);') : el('div', { className: 'ep-ph', attrs: { 'aria-hidden': 'true' }, text: p.name[0] }),
    el('div', { className: 'ep-product-body' }, [el('strong', { text: p.name }), p.priceLabel ? el('span', { className: 'ep-price', text: p.priceLabel }) : null, badge(p.isActive ? 'Activo' : 'Inactivo', p.isActive ? 'status-ok' : 'status-off')]),
    el('div', { className: 'row-actions' }, [btn('Editar', () => editDialog(ctx, 'producto', p, editor(p))), btn('Eliminar', () => { if (confirmDelete(`el producto «${p.name}»`)) { remove('products', p.id); announce('Producto eliminado'); ctx.rerender(); } }, 'danger small')]),
  ]));
  return el('section', { attrs: { 'aria-label': 'Productos' } }, [el('div', { className: 'toolbar' }, [el('h2', { text: 'Catálogo' }), btn('Nuevo producto', () => editDialog(ctx, 'producto', null, editor(null)), 'small')]), cards.length ? el('ul', { className: 'g-list ep-grid' }, cards) : el('p', { className: 'muted', text: 'Aún no hay productos.' })]);
}

function fairTab(ctx, id, stand) {
  const requests = list('standRequests', (r) => r.entrepreneurId === id);
  const pending = requests.find((r) => r.status === 'pending');
  const last = requests.at(-1);
  const fair = list('fairs')[0];
  const STATE = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
  const body = stand ? el('p', {}, [badge(`Puesto ${stand.number}`, 'status-ok'), ' Tienes un puesto asignado en la feria.'])
    : [pending ? el('p', {}, [badge('Solicitud pendiente'), ' Esperando respuesta de la coordinación.']) : [last ? el('p', {}, [badge(`Solicitud ${(STATE[last.status] || last.status).toLowerCase()}`, last.status === 'rejected' ? 'status-off' : ''), last.status === 'rejected' ? ' Puedes volver a solicitar.' : '']) : null, el('p', { className: 'muted', text: 'Aún no tienes puesto asignado.' }), fair ? btn('Solicitar puesto', () => { upsert('standRequests', { fairId: fair.id, entrepreneurId: id, status: 'pending', createdAt: new Date().toISOString() }, 'standreq'); announce('Solicitud enviada'); ctx.rerender(); }, 'small') : el('p', { className: 'muted', text: 'No hay feria registrada.' })]];
  return el('section', { className: 'card ep-fair', attrs: { 'aria-label': 'Puesto en la feria', 'aria-live': 'polite' } }, [el('h2', { text: fair ? `Feria: ${fair.name || fair.title || 'próxima feria'}` : 'Feria' }), body]);
}

function settingsTab(ctx, emp, admin) {
  return profileSettings(ctx, {
    collection: 'entrepreneurs', entity: emp, admin,
    toDraft: (e) => ({ displayName: e.displayName || '', category: e.category || '', description: e.description || '', avatar: imageUrl(e.avatar) ? e.avatar : null, cover: imageUrl(e.cover) ? e.cover : null, gallery: (e.gallery || []).filter((g) => g.type === 'data'), contacts: structuredClone(e.externalContacts || []), isActive: e.isActive !== false }),
    validate: (d) => {
      const errs = {};
      if (!d.displayName.trim()) errs.displayName = 'El nombre es obligatorio.';
      if (!CATEGORIES.includes(d.category)) errs.category = 'Elige una categoría.';
      if (d.description.length > 300) errs.description = 'Máximo 300 caracteres.';
      const c = validateContacts(d.contacts); if (Object.keys(c.errors).length) errs.contacts = c.errors;
      return errs;
    },
    where: { displayName: 'perfil', category: 'perfil', description: 'perfil', contacts: 'contacto' },
      toRecord: (d) => ({ id: emp.id, displayName: d.displayName.trim(), category: d.category, description: d.description.trim(), avatar: d.avatar, cover: d.cover, gallery: d.gallery, externalContacts: validateContacts(d.contacts).rows, ...(admin && { isActive: d.isActive }) }),
    preview: (d) => previewCard(d, emp.id, d.category),
    sections: (d, api) => [
      ['perfil', 'Editar perfil', () => [el('h2', { text: 'Editar perfil' }), api.pick('Foto de perfil', 'avatar', 'round', 256), api.pick('Portada', 'cover', 'wide', 1200), api.field('Nombre', 'displayName', { required: true }), api.field('Categoría', 'category', { control: 'select', required: true, options: catOptions('Elige…') }), api.field('Descripción', 'description', { control: 'textarea', maxlength: 300, rows: 4 })]],
      ['galeria', 'Galería', () => [el('h2', { text: `Galería (${d.gallery.length} de 6)` }), d.gallery.length ? el('ul', { className: 'ep-gallery' }, d.gallery.map((g, i) => el('li', {}, [imageButton(g.url, `Foto ${i + 1} de la galería`), btn('Quitar', () => { d.gallery.splice(i, 1); announce('Foto quitada'); api.reload(); }, 'secondary')]))) : el('p', { className: 'muted', text: 'Aún no hay fotos.' }), d.gallery.length < 6 ? imagePicker({ label: 'Agregar foto', value: null, max: 800, onChange: (m) => { if (m) { d.gallery.push(m); api.reload(); } } }) : el('p', { className: 'muted', text: 'Llegaste al máximo de 6 fotos.' })]],
      ['contacto', 'Contacto', () => [el('h2', { text: 'Contacto' }), api.contacts()]],
      ['cuenta', 'Cuenta', () => [el('h2', { text: 'Cuenta' }), activeToggle(api, d, 'Emprendimiento', admin)]],
    ],
  });
}

export function emprendimiento(ctx) {
  const admin = ctx.profile.role === 'admin';
  const { id, selector } = pickEntity(ctx, 'entrepreneurs', 'un emprendimiento', 'displayName');
  const emp = id && get('entrepreneurs', id);
  const root = el('div', { className: 'stack' }, [selector]);
  if (!emp) return (root.append(emptyState('Sin emprendimiento', admin ? 'Elige un emprendimiento arriba.' : 'Tu perfil aún no está vinculado a un emprendimiento. Pide a un administrador que lo vincule.')), root);

  const posts = list('entrepreneurPosts', (p) => p.entrepreneurId === id).length;
  const products = list('products', (p) => p.entrepreneurId === id).length;
  const stand = list('stands', (s) => s.assignedEntrepreneurId === id)[0];
  const t = tabState(ctx, [['posts', 'Publicaciones', () => postsTab(ctx, id)], ['products', 'Productos', () => productsTab(ctx, id)], ['fair', 'Feria', () => fairTab(ctx, id, stand)], ['settings', 'Ajustes', () => settingsTab(ctx, emp, admin)]]);
  root.append(profileShell({ id, name: emp.displayName, subtitle: emp.category, avatarMedia: emp.avatar, coverMedia: emp.cover, stats: [[posts, 'publicaciones'], [products, 'productos'], [stand ? `#${stand.number}` : 'Sin', 'puesto']], badges: [badge(emp.isActive !== false ? 'Activo' : 'Inactivo', emp.isActive !== false ? 'status-ok' : 'status-off'), stand ? badge(`Con puesto ${stand.number}`, 'status-ok') : null], tabs: t.tabs, active: t.active, onTab: t.onTab }), t.body);
  return root;
}
