import { el, announce } from '../utils/dom.js';
import { badge, emptyState, MODE_LABEL } from '../app/ui.js';
import { field, checkbox, confirmDelete } from './forms.js';
import { get, list, upsert, remove } from './store.js';
import { profileShell } from './social.js';
import { pickEntity, validateContacts, modesField, editDialog, tabState, profileSettings, previewCard, activeToggle } from './emprendimiento.js';

const modesText = (modes = []) => modes.map((m) => MODE_LABEL[m]).join(', ');
const btn = (text, onClick, cls = 'secondary small') => el('button', { className: `button ${cls}`, type: 'button', text, onclick: onClick });

function offersTab(ctx, id) {
  const editor = {
    values: (o) => ({ subject: o?.subject, description: o?.description, modes: o?.modes || [], availabilityLabel: o?.availabilityLabel, isActive: o ? o.isActive !== false : true }),
    build: (v, e) => [field('Materia', 'subject', { required: true, value: v.subject, error: e.subject }), field('Descripción', 'description', { control: 'textarea', value: v.description }), modesField(v.modes, e.modes), field('Disponibilidad', 'availabilityLabel', { value: v.availabilityLabel, hint: 'Ej. Dos tardes entre semana' }), checkbox('Oferta activa', 'isActive', v.isActive)],
    save: (v, o) => {
      const errs = {};
      if (!v.subject?.trim()) errs.subject = 'La materia es obligatoria.';
      if (!v.modes.length) errs.modes = 'Elige al menos una modalidad.';
      if (Object.keys(errs).length) return errs;
      upsert('tutoringOffers', { ...(o && { id: o.id }), tutorId: id, subject: v.subject.trim(), description: v.description?.trim() || '', modes: v.modes, availabilityLabel: v.availabilityLabel?.trim() || '', isActive: v.isActive }, 'tutoring-offer'); return null;
    },
  };
  const rows = list('tutoringOffers', (o) => o.tutorId === id);
  const cards = rows.map((o) => el('li', { className: `card ep-offer${o.isActive ? '' : ' is-off'}` }, [
    el('div', { className: 'ep-card-head' }, [el('h3', { text: o.subject }), badge(o.isActive ? 'Activa' : 'Pausada', o.isActive ? 'status-ok' : 'status-off')]),
    el('p', { text: [modesText(o.modes), o.availabilityLabel].filter(Boolean).join(' · ') || 'Sin detalles' }),
    o.description ? el('p', { className: 'muted', text: o.description }) : null,
    el('div', { className: 'row-actions' }, [btn('Editar', () => editDialog(ctx, 'oferta', o, editor)), btn('Eliminar', () => { if (confirmDelete(`la oferta «${o.subject}»`)) { remove('tutoringOffers', o.id); announce('Oferta eliminada'); ctx.rerender(); } }, 'danger small')]),
  ]));
  return el('section', { attrs: { 'aria-label': 'Materias' } }, [el('p', { className: 'notice', text: 'El contacto y acuerdo de tutoría se realiza fuera de UPIICSA Calpulli.' }), el('div', { className: 'toolbar' }, [el('h2', { text: 'Materias que ofrezco' }), btn('Nueva oferta', () => editDialog(ctx, 'oferta', null, editor), 'small')]), cards.length ? el('ul', { className: 'g-list ep-grid' }, cards) : el('p', { className: 'muted', text: 'Aún no hay materias.' })]);
}

function settingsTab(ctx, t, admin) {
  return profileSettings(ctx, {
    collection: 'tutors', entity: t, admin,
    toDraft: (e) => ({ displayName: e.displayName || '', description: e.description || '', avatar: e.avatar?.type === 'data' ? e.avatar : null, cover: e.cover?.type === 'data' ? e.cover : null, modes: [...(e.modes || [])], contacts: structuredClone(e.externalContacts || []), isActive: e.isActive !== false }),
    validate: (d) => {
      const errs = {};
      if (!d.displayName.trim()) errs.displayName = 'El nombre es obligatorio.';
      if (d.description.length > 300) errs.description = 'Máximo 300 caracteres.';
      if (!d.modes.length) errs.modes = 'Elige al menos una modalidad.';
      const c = validateContacts(d.contacts); if (Object.keys(c.errors).length) errs.contacts = c.errors;
      return errs;
    },
    where: { displayName: 'perfil', description: 'perfil', modes: 'modalidades', contacts: 'contacto' },
    toRecord: (d) => ({ id: t.id, displayName: d.displayName.trim(), description: d.description.trim(), avatar: d.avatar || t.avatar, cover: d.cover, modes: d.modes, externalContacts: validateContacts(d.contacts).rows, ...(admin && { isActive: d.isActive }) }),
    preview: (d) => previewCard(d, t.id, modesText(d.modes)),
    sections: (d, api) => [
      ['perfil', 'Editar perfil', () => [el('h2', { text: 'Editar perfil' }), api.pick('Foto de perfil', 'avatar', 'round', 256), api.pick('Portada', 'cover', 'wide', 1200), api.field('Nombre', 'displayName', { required: true }), api.field('Descripción', 'description', { control: 'textarea', maxlength: 300, rows: 4 })]],
      ['modalidades', 'Modalidades', () => [el('h2', { text: 'Modalidades' }), ...Object.entries(MODE_LABEL).map(([m, label]) => api.toggle(label, '', d.modes.includes(m), (on) => { d.modes = on ? [...d.modes, m] : d.modes.filter((x) => x !== m); })), api.error('modes') || el('p', { className: 'muted', text: 'Elige al menos una.' })]],
      ['contacto', 'Contacto', () => [el('h2', { text: 'Contacto' }), api.contacts()]],
      ['cuenta', 'Cuenta', () => [el('h2', { text: 'Cuenta' }), activeToggle(api, d, 'Tutor', admin)]],
    ],
  });
}

export function tutor(ctx) {
  const admin = ctx.profile.role === 'admin';
  const { id, selector } = pickEntity(ctx, 'tutors', 'un tutor', 'displayName');
  const t = id && get('tutors', id);
  const root = el('div', { className: 'stack' }, [selector]);
  if (!t) return (root.append(emptyState('Sin perfil de tutor', admin ? 'Elige un tutor arriba.' : 'Tu perfil aún no está vinculado a un tutor. Pide a un administrador que lo vincule.')), root);

  const active = list('tutoringOffers', (o) => o.tutorId === id && o.isActive).length;
  const tabs = tabState(ctx, [['offers', 'Materias', () => offersTab(ctx, id)], ['settings', 'Ajustes', () => settingsTab(ctx, t, admin)]]);
  root.append(profileShell({ id, name: t.displayName, subtitle: modesText(t.modes), avatarMedia: t.avatar, coverMedia: t.cover, stats: [[active, 'materias activas']], badges: [badge(t.isActive !== false ? 'Activo' : 'Inactivo', t.isActive !== false ? 'status-ok' : 'status-off')], tabs: tabs.tabs, active: tabs.active, onTab: tabs.onTab }), tabs.body);
  return root;
}
