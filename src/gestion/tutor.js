import { el, announce } from '../utils/dom.js';
import { badge, emptyState, MODE_LABEL, openDialog } from '../components/ui.js';
import { field, checkbox, formData, confirmDelete } from './forms.js';
import { get, list, upsert, remove, uid } from './store.js';
import { imagePicker, imageUrl, postImage, profileShell } from './social.js';
import { pickEntity, validateContacts, modesField, editDialog, tabState, profileSettings, previewCard, activeToggle } from './emprendimiento.js';

const modesText = (modes = []) => modes.map((m) => MODE_LABEL[m]).join(', ');
const btn = (text, onClick, cls = 'secondary small') => el('button', { className: `button ${cls}`, type: 'button', text, onclick: onClick });
const media1 = (item) => item?.media?.find((m) => m.type === 'data') || null;
const photoField = (value, onChange) => {
  const host = el('div', { className: 'composer-photo' });
  const draw = (media) => host.replaceChildren(imagePicker({ label: 'Foto (opcional)', value: media, max: 2048, onChange: (next) => { onChange(next); draw(next); } }));
  draw(value); return host;
};

function offersTab(ctx, id) {
  let media = null;
  const editor = {
    values: (o) => { media = media1(o); return { subject: o?.subject, description: o?.description, modes: o?.modes || [], availabilityLabel: o?.availabilityLabel, isActive: o ? o.isActive !== false : true }; },
    build: (v, e) => [field('Materia', 'subject', { required: true, value: v.subject, error: e.subject }), field('Descripción', 'description', { control: 'textarea', value: v.description }), modesField(v.modes, e.modes), field('Disponibilidad', 'availabilityLabel', { value: v.availabilityLabel, hint: 'Ej. Dos tardes entre semana' }), photoField(media, (next) => { media = next; }), checkbox('Oferta activa', 'isActive', v.isActive)],
    save: (v, o) => {
      const errs = {};
      if (!v.subject?.trim()) errs.subject = 'La materia es obligatoria.';
      if (!v.modes.length) errs.modes = 'Elige al menos una modalidad.';
      if (Object.keys(errs).length) return errs;
      upsert('tutoringOffers', { ...(o && { id: o.id }), tutorId: id, subject: v.subject.trim(), description: v.description?.trim() || '', modes: v.modes, availabilityLabel: v.availabilityLabel?.trim() || '', media: media ? [{ type: 'data', url: media.url }] : [], isActive: v.isActive }, 'tutoring-offer'); return null;
    },
  };
  const rows = list('tutoringOffers', (o) => o.tutorId === id);
  const cards = rows.map((o) => el('li', { className: `card ep-offer${o.isActive ? '' : ' is-off'}` }, [
    imageUrl(media1(o)) ? postImage({ url: imageUrl(media1(o)), alt: `Foto de la oferta ${o.subject}` }) : null,
    el('div', { className: 'ep-card-head' }, [el('h3', { text: o.subject }), badge(o.isActive ? 'Activa' : 'Pausada', o.isActive ? 'status-ok' : 'status-off')]),
    el('p', { text: [modesText(o.modes), o.availabilityLabel].filter(Boolean).join(' · ') || 'Sin detalles' }),
    o.description ? el('p', { className: 'muted', text: o.description }) : null,
    el('div', { className: 'row-actions' }, [btn('Editar', () => editDialog(ctx, 'oferta', o, editor)), btn('Eliminar', () => { if (confirmDelete(`la oferta «${o.subject}»`)) { remove('tutoringOffers', o.id); announce('Oferta eliminada'); ctx.rerender(); } }, 'danger small')]),
  ]));
  return el('section', { attrs: { 'aria-label': 'Materias' } }, [el('p', { className: 'notice', text: 'El contacto y acuerdo de tutoría se realiza fuera de UPIICSA Calpulli.' }), el('div', { className: 'toolbar' }, [el('h2', { text: 'Materias que ofrezco' }), btn('Nueva oferta', () => editDialog(ctx, 'oferta', null, editor), 'small')]), cards.length ? el('ul', { className: 'g-list ep-grid' }, cards) : el('p', { className: 'muted', text: 'Aún no hay materias.' })]);
}

const tutorPosts = (tutor) => Array.isArray(tutor.gallery) ? tutor.gallery : [];

function postComposer(tutor, post, onDone, onCancel) {
  let media = media1(post);
  const draw = (value, errors = {}) => {
    const actions = [el('button', { className: 'button', type: 'submit', text: post ? 'Guardar publicación' : 'Publicar' }), onCancel ? btn('Cancelar', onCancel) : null].filter(Boolean);
    const form = el('form', { className: 'ep-composer card', attrs: { novalidate: '', 'aria-label': post ? 'Editar publicación' : 'Nueva publicación' } }, [
      field('Texto', 'body', { control: 'textarea', value: value.body, error: errors.body, hint: 'Puedes publicar solo una foto.' }),
      photoField(media, (next) => { media = next; }),
      el('div', { className: 'form-actions' }, actions),
    ]);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = formData(form).body?.trim() || '';
      if (!body && !media) {
        const fresh = draw({ body }, { body: 'Escribe un texto o agrega una foto.' });
        form.replaceWith(fresh); fresh.querySelector('[aria-invalid]')?.focus(); announce('Revisa los campos marcados.'); return;
      }
      const current = get('tutors', tutor.id) || tutor;
      const next = { id: post?.id || uid('tutor-post'), body, media: media ? [{ type: 'data', url: media.url }] : [], createdAt: post?.createdAt || new Date().toISOString() };
    const saved = upsert('tutors', { id: tutor.id, gallery: [next, ...tutorPosts(current).filter((item) => item.id !== next.id)] });
    if (!saved) { form.prepend(el('p', { className: 'notice', text: 'No hay espacio en el navegador: usa una foto más pequeña', attrs: { role: 'alert' } })); return; }
      announce('Publicación guardada.'); onDone();
    });
    return form;
  };
  return draw({ body: post?.body || '' });
}

function postsTab(ctx, tutor) {
  const posts = [...tutorPosts(tutor)].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const open = (post) => {
    let dialog;
    dialog = openDialog(post ? 'Editar publicación' : 'Nueva publicación', [postComposer(tutor, post, () => { dialog.close(); ctx.rerender(); }, () => dialog.close())]);
  };
  const cards = posts.map((post) => el('article', { className: 'card sp-post ep-post' }, [
    media1(post) ? postImage({ url: imageUrl(media1(post)), alt: post.body || 'Foto de publicación' }) : null,
    el('p', { text: post.body || 'Publicación con foto' }),
    el('div', { className: 'row-actions' }, [btn('Editar', () => open(post)), btn('Eliminar', () => { if (confirmDelete('la publicación')) { const current = get('tutors', tutor.id) || tutor; upsert('tutors', { id: tutor.id, gallery: tutorPosts(current).filter((item) => item.id !== post.id) }); announce('Publicación eliminada'); ctx.rerender(); } }, 'danger small')]),
  ]));
  return el('div', { className: 'sp-feed' }, [el('h2', { text: 'Nueva publicación' }), postComposer(tutor, null, ctx.rerender), el('h2', { text: 'Publicaciones' }), cards.length ? cards : el('p', { className: 'muted', text: 'Aún no hay publicaciones.' })]);
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
  const publications = tutorPosts(t).length;
  const tabs = tabState(ctx, [['offers', 'Materias', () => offersTab(ctx, id)], ['posts', 'Publicaciones', () => postsTab(ctx, t)], ['settings', 'Ajustes', () => settingsTab(ctx, t, admin)]]);
  root.append(profileShell({ id, name: t.displayName, subtitle: modesText(t.modes), avatarMedia: t.avatar, coverMedia: t.cover, stats: [[active, 'materias activas'], [publications, 'publicaciones']], badges: [badge(t.isActive !== false ? 'Activo' : 'Inactivo', t.isActive !== false ? 'status-ok' : 'status-off')], tabs: tabs.tabs, active: tabs.active, onTab: tabs.onTab }), tabs.body);
  return root;
}
