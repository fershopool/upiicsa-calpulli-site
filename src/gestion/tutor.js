import { el, announce } from '../utils/dom.js';
import { badge, emptyState, MODE_LABEL } from '../app/ui.js';
import { field, checkbox } from './forms.js';
import { get, list, upsert } from './store.js';
import { pickEntity, contactsEditor, validateContacts, modesField, formView, crudSection } from './emprendimiento.js';

const modesText = (modes = []) => modes.map((m) => MODE_LABEL[m]).join(', ');

export function tutor(ctx) {
  const admin = ctx.profile.role === 'admin';
  const { id, selector } = pickEntity(ctx, 'tutors', 'un tutor', 'displayName');
  const t = id && get('tutors', id);
  const root = el('div', { className: 'stack' }, [el('h1', { text: 'Mi perfil de tutor' }), el('p', { className: 'notice', text: 'El contacto y acuerdo de tutoría se realiza fuera de UPIICSA Calpulli.' }), selector]);
  if (!t) return (root.append(emptyState('Sin perfil de tutor', admin ? 'Elige un tutor arriba.' : 'Tu perfil aún no está vinculado a un tutor. Pide a un administrador que lo vincule.')), root);

  const form = formView((v, e) => [
    field('Nombre', 'displayName', { required: true, value: v.displayName, error: e.displayName }),
    field('Descripción', 'description', { control: 'textarea', value: v.description }),
    modesField(v.modes, e.modes), contactsEditor(v.contacts, e.contacts), admin && checkbox('Tutor activo', 'isActive', v.isActive),
  ], (v) => {
    const errs = {};
    if (!v.displayName?.trim()) errs.displayName = 'El nombre es obligatorio.';
    if (!v.modes.length) errs.modes = 'Elige al menos una modalidad.';
    const c = validateContacts(v.contacts);
    if (Object.keys(c.errors).length) errs.contacts = c.errors;
    if (Object.keys(errs).length) return errs;
    upsert('tutors', { id: t.id, displayName: v.displayName.trim(), description: v.description?.trim() || '', modes: v.modes, externalContacts: c.rows, ...(admin && { isActive: v.isActive }) });
    announce('Perfil guardado'); ctx.rerender(); return null;
  }, { values: { displayName: t.displayName, description: t.description, modes: t.modes || [], contacts: t.externalContacts || [], isActive: t.isActive !== false }, submitLabel: 'Guardar perfil' });
  root.append(el('section', { attrs: { 'aria-label': 'Perfil' } }, [el('h2', { text: 'Perfil' }), form]));

  root.append(crudSection(ctx, {
    title: 'Ofertas de tutoría', noun: 'oferta', rows: list('tutoringOffers', (o) => o.tutorId === id),
    line: (o) => [el('strong', { text: o.subject }), ' ', badge(o.isActive ? 'Activa' : 'Pausada', o.isActive ? 'status-ok' : 'status-off'), el('p', { text: [modesText(o.modes), o.availabilityLabel].filter(Boolean).join(' · ') }), o.description && el('p', { className: 'muted', text: o.description })],
    editor: {
      collection: 'tutoringOffers', values: (o) => ({ subject: o?.subject, description: o?.description, modes: o?.modes || [], availabilityLabel: o?.availabilityLabel, isActive: o ? o.isActive !== false : true }),
      build: (v, e) => [field('Materia', 'subject', { required: true, value: v.subject, error: e.subject }), field('Descripción', 'description', { control: 'textarea', value: v.description }), modesField(v.modes, e.modes), field('Disponibilidad', 'availabilityLabel', { value: v.availabilityLabel, hint: 'Ej. Dos tardes entre semana' }), checkbox('Oferta activa', 'isActive', v.isActive)],
      save: (v, o) => {
        const errs = {};
        if (!v.subject?.trim()) errs.subject = 'La materia es obligatoria.';
        if (!v.modes.length) errs.modes = 'Elige al menos una modalidad.';
        if (Object.keys(errs).length) return errs;
        upsert('tutoringOffers', { ...(o && { id: o.id }), tutorId: id, subject: v.subject.trim(), description: v.description?.trim() || '', modes: v.modes, availabilityLabel: v.availabilityLabel?.trim() || '', isActive: v.isActive }, 'tutoring-offer'); return null;
      },
    },
  }));
  return root;
}
