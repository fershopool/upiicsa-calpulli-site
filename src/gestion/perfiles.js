import { el } from '../utils/dom.js';
import { avatar, badge, chip, emptyState, normalize, openDialog, plural, tokenFor } from '../app/ui.js';
import { ROLES, ROLE_KEYS, deleteProfile, get, list, profiles, saveProfile, setProfileActive, upsert, validateProfile } from './store.js';
import { checkbox, confirmDelete, field, formData } from './forms.js';

// Registro mínimo válido para "Crear registro nuevo" en cada colección vinculada.
const NEW_RECORD = {
  department: (name) => ({ name, shortName: name.slice(0, 12), description: '', accentToken: 'jade', contact: [], logoKey: '' }),
  entrepreneur: (name) => ({ displayName: name, category: 'Otros', description: '', externalContacts: [], gallery: [] }),
  tutor: (name) => ({ displayName: name, description: '', modes: ['hybrid'], externalContacts: [] }),
};
const LINK_LABEL = (collection) => (record) => record.displayName || record.name || record.id;
const recordName = (p) => {
  const collection = ROLES[p.role].collection;
  if (collection) { const r = p.linkedId && get(collection, p.linkedId); return r ? LINK_LABEL(collection)(r) : '(registro no encontrado)'; }
  if (p.role === 'fair_admin') { const f = p.linkedId && get('fairs', p.linkedId); return f ? (f.name || f.title || f.id) : '(feria no encontrada)'; }
  return '—';
};

export function perfiles({ profile: me, params, setParam, rerender }) {
  let rol = ROLES[params.get('rol')] ? params.get('rol') : '';
  let query = params.get('q') || '';
  const chips = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por rol' } });
  const summary = el('ul', { className: 'tags', attrs: { 'aria-label': 'Perfiles por rol' } });
  const body = el('tbody');
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const message = el('p', { className: 'notice', attrs: { role: 'alert' }, hidden: true });
  const say = (text) => { message.textContent = text; message.hidden = !text; };
  const search = el('input', { type: 'search', id: 'perfil-search', name: 'q', value: query, placeholder: 'Nombre o correo', attrs: { autocomplete: 'off' } });
  const all = profiles();

  summary.replaceChildren(...ROLE_KEYS.map((key) => el('li', { text: `${ROLES[key].label}: ${all.filter((p) => p.role === key).length}` })));

  function paint() {
    chips.replaceChildren(chip('Todos', !rol, () => pick('')), ...ROLE_KEYS.map((key) => chip(ROLES[key].label, rol === key, () => pick(key))));
    const needle = normalize(query.trim());
    const found = profiles().filter((p) => (!rol || p.role === rol) && (!needle || normalize(`${p.name} ${p.email}`).includes(needle)));
    count.textContent = plural(found.length, 'perfil', 'perfiles');
    body.replaceChildren(...(found.length ? found.map(row) : [el('tr', {}, [el('td', { text: 'No hay perfiles con este filtro.', attrs: { colspan: '6' } })])]));
  }
  const pick = (key) => { rol = key; setParam('rol', rol); paint(); };
  search.addEventListener('input', () => { query = search.value; setParam('q', query); paint(); });

  function row(p) {
    const edit = el('button', { className: 'button secondary small', type: 'button', text: 'Editar', attrs: { 'aria-label': `Editar ${p.name}` } });
    const toggle = el('button', { className: 'button secondary small', type: 'button', text: p.isActive ? 'Desactivar' : 'Activar', attrs: { 'aria-label': `${p.isActive ? 'Desactivar' : 'Activar'} ${p.name}` } });
    const del = el('button', { className: 'button danger small', type: 'button', text: 'Eliminar', attrs: { 'aria-label': `Eliminar ${p.name}` } });
    edit.addEventListener('click', () => openForm(p, edit));
    toggle.addEventListener('click', () => {
      if (p.id === me.id && p.isActive) return say('No puedes desactivar tu propio perfil mientras estás en sesión.');
      const res = setProfileActive(p.id, !p.isActive);
      if (!res.ok) return say(res.error);
      say(''); rerender();
    });
    del.addEventListener('click', () => {
      if (p.id === me.id) return say('No puedes eliminar tu propio perfil mientras estás en sesión.');
      if (!confirmDelete(`el perfil de ${p.name}`)) return;
      const res = deleteProfile(p.id);
      if (!res.ok) return say(res.error);
      say(''); rerender();
    });
    return el('tr', {}, [
      el('th', { attrs: { scope: 'row' } }, [el('span', { className: 'post-head' }, [avatar(p.name, tokenFor(p.id)), p.name])]),
      el('td', { text: ROLES[p.role].label }),
      el('td', { text: p.email }),
      el('td', { text: recordName(p) }),
      el('td', {}, [p.isActive ? badge('Activo', 'status-ok') : badge('Inactivo', 'status-off')]),
      el('td', {}, [el('div', { className: 'row-actions' }, [edit, toggle, del])]),
    ]);
  }

  // Formulario crear/editar. values = estado actual del formulario; se repinta al cambiar rol/modo o con errores.
  function openForm(p, opener) {
    let dialog;
    const build = (values, errors = {}) => {
      const collection = ROLES[values.role]?.collection;
      const mode = collection ? values.mode || 'link' : '';
      const form = el('form', { className: 'form-grid', attrs: { novalidate: '' } });
      const roleField = field('Rol', 'role', { control: 'select', value: values.role, required: true, error: errors.role, options: ROLE_KEYS.map((k) => [k, ROLES[k].label]) });
      const parts = [
        roleField,
        field('Nombre', 'name', { value: values.name, required: true, error: errors.name }),
        field('Correo', 'email', { type: 'email', value: values.email, required: true, error: errors.email }),
      ];
      if (collection) {
        parts.push(field('Registro vinculado', 'mode', { control: 'select', value: mode, options: [['link', 'Vincular registro existente'], ['new', 'Crear registro nuevo']] }));
        if (mode === 'link') parts.push(field('Registro', 'linkedId', { control: 'select', value: values.linkedId || '', required: true, error: errors.linkedId, options: [['', 'Elige un registro…'], ...list(collection).map((r) => [r.id, LINK_LABEL(collection)(r)])] }));
        else parts.push(el('p', { className: 'muted', text: `Se creará un registro nuevo con el nombre del perfil (${ROLES[values.role].label.toLowerCase()}).` }));
      } else if (values.role === 'fair_admin') {
        const fair = list('fairs')[0];
        parts.push(el('p', { className: 'muted', text: fair ? `Vinculado a la feria: ${fair.name || fair.title || fair.id}.` : 'No hay ferias registradas.' }));
      } else parts.push(el('p', { className: 'muted', text: 'El administrador no se vincula a ningún registro.' }));
      parts.push(checkbox('Perfil activo', 'isActive', values.isActive));
      const submit = el('button', { className: 'button', type: 'submit', text: 'Guardar' });
      const cancel = el('button', { className: 'button secondary', type: 'button', text: 'Cancelar' });
      cancel.addEventListener('click', () => dialog.close());
      form.append(...parts, el('div', { className: 'form-actions' }, [submit, cancel]));
      const read = () => { const d = formData(form); return { ...values, role: d.role, name: d.name, email: d.email, mode: d.mode || values.mode, linkedId: d.linkedId || '', isActive: 'isActive' in d }; };
      form.querySelector('[name=role]').addEventListener('change', () => { const v = read(); show({ ...v, linkedId: '', mode: 'link' }); });
      form.querySelector('[name=mode]')?.addEventListener('change', () => show({ ...read(), linkedId: '' }));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const v = read();
        const input = { id: p?.id, role: v.role, name: v.name, email: v.email, isActive: v.isActive, linkedId: v.linkedId };
        const col = ROLES[v.role]?.collection;
        if (v.role === 'fair_admin') input.linkedId = list('fairs')[0]?.id || null;
        else if (!col) input.linkedId = null;
        const creating = col && v.mode === 'new';
        const errors2 = validateProfile(creating ? { ...input, linkedId: 'pendiente' } : input, p?.id);
        if (Object.keys(errors2).length) return show(v, errors2);
        if (creating) input.linkedId = upsert(col, NEW_RECORD[v.role](v.name.trim()), col.slice(0, 4)).id;
        const res = saveProfile(input);
        if (!res.ok) return show(v, res.errors);
        rerender();
      });
      return form;
    };
    const show = (values, errors) => {
      const form = build(values, errors);
      dialog.querySelector('form').replaceWith(form);
      (form.querySelector('[aria-invalid]') || form.querySelector('[name=role]')).focus();
    };
    const values = p ? { ...p, mode: 'link' } : { role: 'department', name: '', email: '', linkedId: '', mode: 'link', isActive: true };
    dialog = openDialog(p ? 'Editar perfil' : 'Nuevo perfil', [el('h2', { text: p ? 'Editar perfil' : 'Nuevo perfil' }), build(values)], { onClose: () => opener?.isConnected && opener.focus() });
  }

  const add = el('button', { className: 'button', type: 'button', text: 'Nuevo perfil' });
  add.addEventListener('click', () => openForm(null, add));
  paint();
  if (!all.length) return emptyState('Sin perfiles', 'Crea el primer perfil.', add);
  return el('div', {}, [
    el('div', { className: 'toolbar' }, [el('h1', { text: 'Perfiles' }), add]),
    el('p', { className: 'lead', text: 'Gestiona los accesos de los cinco roles de la plataforma.' }),
    summary,
    el('label', { className: 'field', attrs: { for: 'perfil-search' } }, [el('span', { text: 'Buscar' }), search]),
    chips, count, message,
    el('div', { className: 'table-wrap' }, [el('table', { className: 'table' }, [
      el('caption', { className: 'sr-only', text: 'Perfiles de acceso' }),
      el('thead', {}, [el('tr', {}, ['Nombre', 'Rol', 'Correo', 'Vínculo', 'Estado', 'Acciones'].map((h) => el('th', { text: h, attrs: { scope: 'col' } })))]),
      body,
    ])]),
  ]);
}
