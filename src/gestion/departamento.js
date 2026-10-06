import { el, announce } from '../utils/dom.js';
import { badge, emptyState, openDialog, fullDate, CONTACT_LABEL, PRIORITY_LABEL } from '../app/ui.js';
import { get, list, upsert, remove, uid } from './store.js';
import { field, formData, checkbox, confirmDelete } from './forms.js';

const ACCENTS = [['mayaBlue', 'Azul maya'], ['turquoise', 'Turquesa'], ['jade', 'Jade'], ['mexicanPink', 'Rosa mexicano'], ['cempasuchil', 'Cempasúchil'], ['cochineal', 'Cochinilla']];
const PRIORITIES = [['normal', 'Normal'], ['featured', 'Destacado'], ['important', 'Importante'], ['urgent', 'Urgente']];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad = (n) => String(n).padStart(2, '0');
// ISO -> valor de <input type="datetime-local"> en hora local, y de vuelta.
const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toIso = (local) => (local ? new Date(local).toISOString() : '');

export function departamento({ profile, params, setParam, rerender }) {
  const isAdmin = profile.role === 'admin';
  const id = isAdmin ? params.get('id') : profile.linkedId;
  const dept = id ? get('departments', id) : null;
  const wrap = el('div', { className: 'stack' });
  const live = el('p', { className: 'sr-only', attrs: { 'aria-live': 'polite' } });
  const done = (message) => { announce(message); rerender(); };

  if (isAdmin) {
    const select = el('select', { id: 'dept-pick', name: 'id' }, [el('option', { value: '', text: 'Elige un departamento' }), ...list('departments').map((d) => el('option', { value: d.id, text: d.name, selected: d.id === id }))]);
    select.addEventListener('change', () => { setParam('id', select.value); rerender(); });
    wrap.append(el('div', { className: 'toolbar' }, [el('label', { className: 'field', attrs: { for: 'dept-pick' } }, [el('span', { text: 'Departamento' }), select])]));
  }
  if (!dept) return el('div', {}, [wrap, emptyState('Sin departamento', isAdmin ? 'Elige un departamento para gestionarlo.' : 'Tu perfil no está vinculado a un departamento. Pide al administrador que lo vincule.')]);

  // ---- 1) Perfil ----
  function profileForm(values, errors = {}) {
    const contacts = values.contact.map((c) => ({ ...c }));
    const form = el('form', { className: 'card stack', attrs: { novalidate: '' } });
    const list_ = el('div', { className: 'stack' });
    const paintContacts = () => {
      list_.replaceChildren(...contacts.map((c, i) => {
        const err = errors[`contact-${i}`];
        const set = (key) => (e) => { c[key] = e.target.value; };
        const type = field('Tipo', `ctype-${i}`, { control: 'select', value: c.type, options: Object.entries(CONTACT_LABEL).map(([v, t]) => [v, t]) });
        const label = field('Etiqueta', `clabel-${i}`, { value: c.label });
        const value = field('Valor', `cvalue-${i}`, { value: c.value, error: err });
        type.querySelector('select').addEventListener('change', set('type'));
        label.querySelector('input').addEventListener('input', set('label'));
        value.querySelector('input').addEventListener('input', set('value'));
        const del = el('button', { className: 'button secondary small', type: 'button', text: 'Quitar', attrs: { 'aria-label': `Quitar contacto ${i + 1}` } });
        del.addEventListener('click', () => { contacts.splice(i, 1); paintContacts(); });
        return el('fieldset', { className: 'form-grid' }, [el('legend', { text: `Contacto ${i + 1}` }), type, label, value, del]);
      }));
    };
    paintContacts();
    const add = el('button', { className: 'button secondary small', type: 'button', text: 'Añadir contacto' });
    add.addEventListener('click', () => { contacts.push({ id: uid('contact'), type: 'email', label: '', value: '' }); paintContacts(); });
    form.append(
      el('h2', { text: 'Perfil del departamento' }),
      el('div', { className: 'form-grid' }, [
        field('Nombre', 'name', { value: values.name, required: true, error: errors.name }),
        field('Nombre corto', 'shortName', { value: values.shortName, required: true, error: errors.shortName }),
        field('Color de acento', 'accentToken', { control: 'select', value: values.accentToken, options: ACCENTS }),
      ]),
      field('Descripción', 'description', { control: 'textarea', value: values.description }),
      el('h3', { text: 'Contactos' }), list_, add,
      isAdmin ? checkbox('Departamento activo', 'isActive', values.isActive) : null,
      el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: 'Guardar perfil' })]),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const d = formData(form);
      const next = { name: d.name.trim(), shortName: d.shortName.trim(), description: d.description.trim(), accentToken: d.accentToken, contact: contacts, isActive: isAdmin ? !!d.isActive : dept.isActive };
      const errs = {};
      if (!next.name) errs.name = 'El nombre es obligatorio.';
      if (!next.shortName) errs.shortName = 'El nombre corto es obligatorio.';
      contacts.forEach((c, i) => { if (!c.value.trim()) errs[`contact-${i}`] = 'El valor es obligatorio.'; else if (c.type === 'email' && !EMAIL.test(c.value.trim())) errs[`contact-${i}`] = 'Escribe un correo válido.'; });
      if (Object.keys(errs).length) { form.replaceWith(profileForm(next, errs)); announce('Revisa los campos marcados.'); return; }
      upsert('departments', { id: dept.id, ...next, contact: contacts.map((c) => ({ ...c, label: c.label.trim() || CONTACT_LABEL[c.type], value: c.value.trim() })) });
      done('Perfil guardado.');
    });
    return form;
  }

  // ---- Diálogo genérico crear/editar ----
  function editor(title, buildFields, validate, save) {
    const show = (values, errors = {}) => {
      const form = el('form', { className: 'stack', attrs: { novalidate: '' } });
      form.append(...buildFields(values, errors), el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: 'Guardar' }), el('button', { className: 'button secondary', type: 'button', text: 'Cancelar', onclick: () => form.closest('dialog').close() })]));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const d = formData(form); const next = { ...d, flag: !!d.flag };
        const errs = validate(next);
        if (Object.keys(errs).length) { form.replaceWith(show(next, errs)); announce('Revisa los campos marcados.'); return; }
        const dialog = form.closest('dialog'); save(next); dialog.close(); done('Guardado.');
      });
      return form;
    };
    return (values) => openDialog(title, [el('h2', { text: title }), show(values)]);
  }

  // ---- 2) Avisos ----
  const openPost = (post) => editor(post ? 'Editar aviso' : 'Nuevo aviso', (v, e) => [
    field('Título', 'title', { value: v.title, required: true, error: e.title }),
    field('Texto', 'body', { control: 'textarea', value: v.body, required: true, error: e.body }),
    field('Prioridad', 'priority', { control: 'select', value: v.priority, options: PRIORITIES }),
    checkbox('Publicado', 'flag', !!v.flag),
    post?.isHiddenByModerator ? el('p', { className: 'notice', text: 'Este aviso está oculto por moderación; no podrás mostrarlo aunque esté publicado.' }) : null,
  ], (v) => ({ ...(!v.title?.trim() && { title: 'El título es obligatorio.' }), ...(!v.body?.trim() && { body: 'El texto es obligatorio.' }) }), (v) => {
    const base = { title: v.title.trim(), body: v.body.trim(), priority: v.priority, isPublished: v.flag };
    const publishedAt = v.flag && !post?.publishedAt ? new Date().toISOString() : post?.publishedAt;
    if (post) upsert('institutionalPosts', { id: post.id, ...base, publishedAt });
    else upsert('institutionalPosts', { departmentId: dept.id, media: [], views: 0, visibility: { showDepartment: true, showLocation: false }, ...base, publishedAt }, 'inst');
  })({ title: post?.title || '', body: post?.body || '', priority: post?.priority || 'normal', flag: post?.isPublished });
  const posts = list('institutionalPosts', (p) => p.departmentId === dept.id);
  const postState = (p) => (p.isHiddenByModerator ? badge('Oculto por moderación', 'urgent') : p.isPublished ? badge('Publicado') : badge('Borrador'));
  const newPost = el('button', { className: 'button', type: 'button', text: 'Nuevo aviso', onclick: () => openPost(null) });

  // ---- 3) Historias ----
  const openStory = (story) => editor(story ? 'Editar historia' : 'Nueva historia', (v, e) => [
    field('Título', 'title', { value: v.title, required: true, error: e.title }),
    field('Texto', 'body', { control: 'textarea', value: v.body }),
    el('div', { className: 'form-grid' }, [field('Inicia', 'startsAt', { type: 'datetime-local', value: v.startsAt, error: e.startsAt }), field('Expira', 'expiresAt', { type: 'datetime-local', value: v.expiresAt, error: e.expiresAt })]),
    checkbox('Activa', 'flag', !!v.flag),
  ], (v) => ({ ...(!v.title?.trim() && { title: 'El título es obligatorio.' }), ...(v.startsAt && v.expiresAt && v.expiresAt <= v.startsAt && { expiresAt: 'Debe ser posterior al inicio.' }) }), (v) => {
    const base = { title: v.title.trim(), body: v.body.trim(), startsAt: toIso(v.startsAt) || undefined, expiresAt: toIso(v.expiresAt) || undefined, isActive: v.flag };
    if (story) upsert('stories', { id: story.id, ...base });
    else upsert('stories', { departmentId: dept.id, media: [], views: 0, ...base }, 'story');
  })({ title: story?.title || '', body: story?.body || '', startsAt: toLocal(story?.startsAt), expiresAt: toLocal(story?.expiresAt), flag: story ? story.isActive : true });
  const stories = list('stories', (s) => s.departmentId === dept.id);
  const newStory = el('button', { className: 'button', type: 'button', text: 'Nueva historia', onclick: () => openStory(null) });

  const row = (title, meta, badges, onEdit, onDelete, what) => el('li', { className: 'card stack' }, [
    el('div', { className: 'toolbar' }, [el('h3', { text: title }), el('div', { className: 'row-actions' }, badges)]),
    el('p', { className: 'muted', text: meta }),
    el('div', { className: 'row-actions' }, [
      el('button', { className: 'button secondary small', type: 'button', text: 'Editar', attrs: { 'aria-label': `Editar ${title}` }, onclick: onEdit }),
      el('button', { className: 'button danger small', type: 'button', text: 'Eliminar', attrs: { 'aria-label': `Eliminar ${title}` }, onclick: () => { if (confirmDelete(what)) { onDelete(); done('Eliminado.'); } } }),
    ]),
  ]);

  wrap.append(
    live,
    profileForm({ name: dept.name, shortName: dept.shortName, description: dept.description || '', accentToken: dept.accentToken || 'mayaBlue', contact: dept.contact || [], isActive: dept.isActive !== false }),
    el('section', { className: 'stack', attrs: { 'aria-labelledby': 'h-posts' } }, [
      el('div', { className: 'toolbar' }, [el('h2', { id: 'h-posts', text: 'Avisos institucionales' }), newPost]),
      posts.length ? el('ul', { className: 'stack' }, posts.map((p) => row(p.title, `${PRIORITY_LABEL[p.priority] || 'Normal'}${p.publishedAt ? ` · ${fullDate(p.publishedAt)}` : ''}`, [postState(p)], () => openPost(p), () => remove('institutionalPosts', p.id), `el aviso "${p.title}"`))) : el('p', { className: 'muted', text: 'Aún no hay avisos.' }),
    ]),
    el('section', { className: 'stack', attrs: { 'aria-labelledby': 'h-stories' } }, [
      el('div', { className: 'toolbar' }, [el('h2', { id: 'h-stories', text: 'Historias' }), newStory]),
      stories.length ? el('ul', { className: 'stack' }, stories.map((s) => row(s.title, s.expiresAt ? `Expira ${fullDate(s.expiresAt)}` : 'Sin fecha de expiración', [badge(s.isActive ? 'Activa' : 'Inactiva')], () => openStory(s), () => remove('stories', s.id), `la historia "${s.title}"`))) : el('p', { className: 'muted', text: 'Aún no hay historias.' }),
    ]),
  );
  return wrap;
}
