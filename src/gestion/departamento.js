import { el, announce } from '../utils/dom.js';
import { avatar, badge, emptyState, openDialog, relativeTime, CONTACT_LABEL, PRIORITY_LABEL } from '../components/ui.js';
import { get, list, upsert, remove, uid, profiles } from './store.js';
import { field, formData, confirmDelete } from './forms.js';
import { profileShell, imagePicker, toggleRow, settingsLayout, imageUrl, galleryPicker, storyMediaPicker, postGallery } from './social.js';
import { deleteVideo } from '../services/media-db.js';

// Colores de acento (mismos tokens que components/ui.js) para las muestras tocables.
const ACCENTS = [['mayaBlue', 'Azul maya', '#2D78B8'], ['turquoise', 'Turquesa', '#149D98'], ['jade', 'Jade', '#13745E'], ['mexicanPink', 'Rosa mexicano', '#C83F83'], ['cempasuchil', 'Cempasúchil', '#DA8A0B'], ['cochineal', 'Cochinilla', '#A93647']];
const PRIORITIES = [['normal', 'Normal'], ['featured', 'Destacado'], ['important', 'Importante'], ['urgent', 'Urgente']];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESC = 200;
const DURATIONS = [12, 24, 36, 48];
const HOUR = 3600000;
const nearestDuration = (story) => (story?.startsAt && story?.expiresAt ? DURATIONS.reduce((best, h) => (Math.abs(h * HOUR - (Date.parse(story.expiresAt) - Date.parse(story.startsAt))) < Math.abs(best * HOUR - (Date.parse(story.expiresAt) - Date.parse(story.startsAt))) ? h : best)) : 24);
const timeLeft = (iso) => { const ms = Date.parse(iso) - Date.now(); return ms >= HOUR ? `${Math.round(ms / HOUR)} h` : `${Math.max(1, Math.round(ms / 60000))} min`; };
const storyThumb = (media) => (media?.type === 'video' ? media.poster : imageUrl(media)) || '';
const storyLive = (s, t = Date.now()) => s.isActive && (!s.startsAt || Date.parse(s.startsAt) <= t) && (!s.expiresAt || Date.parse(s.expiresAt) > t);

export function departamento({ profile, params, setParam, rerender }) {
  const isAdmin = profile.role === 'admin';
  const id = isAdmin ? params.get('id') : profile.linkedId;
  const dept = id ? get('departments', id) : null;
  const wrap = el('div', { className: 'stack dp' });

  const picker = isAdmin ? el('div', { className: 'toolbar' }, [(() => {
    const select = el('select', { id: 'dept-pick', name: 'id' }, [el('option', { value: '', text: 'Elige un departamento' }), ...list('departments').map((d) => el('option', { value: d.id, text: d.name, selected: d.id === id }))]);
    select.addEventListener('change', () => { setParam('id', select.value); setParam('tab', ''); rerender(); });
    return el('label', { className: 'field', attrs: { for: 'dept-pick' } }, [el('span', { text: 'Departamento' }), select]);
  })()]) : null;
  if (!dept) return el('div', { className: 'stack' }, [picker, emptyState('Sin departamento', isAdmin ? 'Elige un departamento para gestionarlo.' : 'Tu perfil no está vinculado a un departamento. Pide al administrador que lo vincule.')]);

  const TABS = [['avisos', 'Avisos'], ['historias', 'Historias'], ['ajustes', 'Ajustes']];
  const state = { tab: TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'avisos', menu: 'perfil', dirty: false, errors: {}, composer: null };
  const fromDept = (d) => ({ name: d.name, shortName: d.shortName || '', description: d.description || '', accentToken: d.accentToken || 'mayaBlue', avatar: d.avatar || null, cover: d.cover || null, contact: (d.contact || []).map((c) => ({ ...c })), isActive: d.isActive !== false });
  let draft = fromDept(dept);
  const current = () => get('departments', dept.id) || dept;
  const accentHex = (token) => (ACCENTS.find(([k]) => k === token) || ACCENTS[0])[2];

  const focusTab = () => wrap.querySelector('[role=tab][aria-selected=true]')?.focus();
  // Diálogo: al cerrar, el foco vuelve al disparador (o a la pestaña activa si ya no existe).
  const dialog = (title, content, opener) => openDialog(title, content, { onClose: () => (opener?.isConnected ? opener : wrap.querySelector('[role=tab][aria-selected=true]'))?.focus() });
  // Imagen con vista previa que se repinta sola al elegir/quitar.
  const pickerHost = (opts, onChange) => {
    const host = el('div', {});
    const draw = (value) => host.replaceChildren(imagePicker({ ...opts, value, onChange: (m) => { onChange(m); draw(m); } }));
    draw(opts.value); return host;
  };
  const composerPhotos = (value, onChange) => galleryPicker({ label: 'Fotos (opcional)', value, onChange });

  // ---------- Avisos ----------
  function composerView() {
    const v = state.composer || { title: '', body: '', priority: 'normal', now: true, media: [], errors: {} };
    let media = v.media || [];
    const form = el('form', { className: 'card dp-composer stack', attrs: { novalidate: '', 'aria-label': 'Publicar aviso' } });
    let publishNow = v.now;
    form.append(
      el('div', { className: 'dp-who' }, [headAvatar(), el('strong', { text: `¿Qué quieres avisar, ${current().shortName || current().name}?` })]),
      field('Título', 'title', { value: v.title, required: true, error: v.errors?.title }),
      field('Texto', 'body', { control: 'textarea', value: v.body, required: true, error: v.errors?.body }),
      composerPhotos(media, (next) => { media = next; }),
      el('div', { className: 'dp-composer-row' }, [field('Prioridad', 'priority', { control: 'select', value: v.priority, options: PRIORITIES }), toggleRow('Publicar ahora', 'Si lo apagas se guarda como borrador.', publishNow, (c) => { publishNow = c; })]),
      el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: 'Publicar' })]),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = formData(form); const next = { title: d.title.trim(), body: d.body.trim(), priority: d.priority, now: publishNow, media };
      const errors = { ...(!next.title && { title: 'El título es obligatorio.' }), ...(!next.body && { body: 'El texto es obligatorio.' }) };
      if (Object.keys(errors).length) { state.composer = { ...next, errors }; form.replaceWith(composerView()); announce('Revisa los campos marcados.'); wrap.querySelector('.dp-composer [aria-invalid]')?.focus(); return; }
      const saved = upsert('institutionalPosts', { departmentId: dept.id, media, views: 0, visibility: { showDepartment: true, showLocation: false }, title: next.title, body: next.body, priority: next.priority, isPublished: next.now, publishedAt: next.now ? new Date().toISOString() : undefined }, 'inst');
      if (!saved) { form.prepend(el('p', { className: 'notice', text: 'No hay espacio en el navegador: quita alguna foto', attrs: { role: 'alert' } })); return; }
      state.composer = null; announce(next.now ? 'Aviso publicado.' : 'Borrador guardado.'); paint(); wrap.querySelector('.dp-composer input')?.focus();
    });
    return form;
  }
  function headAvatar(size = 'md') {
    const d = current(); const url = imageUrl(d.avatar);
    return url ? el('img', { className: `avatar avatar-${size} dp-round`, src: url, alt: '' }) : avatar(d.name, d.accentToken || 'mayaBlue', size);
  }
  function postDialog(post, opener) {
    let media = (post?.media || []).filter((m) => m.type === 'data');
    const show = (v, errors = {}) => {
      const form = el('form', { className: 'stack', attrs: { novalidate: '' } });
      let published = !!v.published;
      form.append(
        el('h2', { text: 'Editar aviso' }),
        field('Título', 'title', { value: v.title, required: true, error: errors.title }),
        field('Texto', 'body', { control: 'textarea', value: v.body, required: true, error: errors.body }),
        composerPhotos(media, (next) => { media = next; }),
        field('Prioridad', 'priority', { control: 'select', value: v.priority, options: PRIORITIES }),
        toggleRow('Publicado', post.isHiddenByModerator ? 'Oculto por moderación: no se mostrará aunque esté publicado.' : '', published, (c) => { published = c; }),
        el('div', { className: 'form-actions' }, [el('button', { className: 'button', type: 'submit', text: 'Guardar' }), el('button', { className: 'button secondary', type: 'button', text: 'Cancelar', onclick: () => form.closest('dialog').close() })]),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = formData(form); const next = { title: d.title.trim(), body: d.body.trim(), priority: d.priority, published };
        const errs = { ...(!next.title && { title: 'El título es obligatorio.' }), ...(!next.body && { body: 'El texto es obligatorio.' }) };
        if (Object.keys(errs).length) { form.replaceWith(show(next, errs)); announce('Revisa los campos marcados.'); dlg.querySelector('[aria-invalid]')?.focus(); return; }
        upsert('institutionalPosts', { id: post.id, title: next.title, body: next.body, priority: next.priority, media, isPublished: next.published, publishedAt: next.published && !post.publishedAt ? new Date().toISOString() : post.publishedAt });
        dlg.close(); announce('Aviso guardado.'); paint();
      });
      return form;
    };
    const dlg = dialog('Editar aviso', [show({ title: post.title, body: post.body, priority: post.priority || 'normal', published: post.isPublished })], opener);
  }
  function postCard(p) {
    const d = current();
    const state_ = p.isHiddenByModerator ? badge('Oculto por moderación', 'urgent') : p.isPublished ? badge('Publicado') : badge('Borrador');
    const edit = el('button', { className: 'button secondary small', type: 'button', text: 'Editar', attrs: { 'aria-label': `Editar ${p.title}` } });
    edit.addEventListener('click', () => postDialog(p, edit));
    const del = el('button', { className: 'button danger small', type: 'button', text: 'Eliminar', attrs: { 'aria-label': `Eliminar ${p.title}` } });
    del.addEventListener('click', () => { if (confirmDelete(`el aviso "${p.title}"`)) { remove('institutionalPosts', p.id); announce('Aviso eliminado.'); paint(); focusTab(); } });
    const when = p.publishedAt || p.createdAt;
    return el('li', { className: 'card sp-post' }, [
      el('div', { className: 'dp-who' }, [headAvatar(), el('div', { className: 'dp-grow' }, [el('strong', { text: d.name }), el('div', { className: 'muted', text: [when ? relativeTime(when) : 'Sin publicar', p.priority && p.priority !== 'normal' ? PRIORITY_LABEL[p.priority] : null].filter(Boolean).join(' · ') })]), state_]),
      el('h3', { text: p.title }), el('p', { text: p.body }),
      postGallery(p.media, p.title),
      el('div', { className: 'toolbar' }, [el('span', { className: 'muted', text: `${p.views || 0} ${p.views === 1 ? 'vista' : 'vistas'}` }), el('div', { className: 'row-actions' }, [edit, del])]),
    ]);
  }
  function avisosView() {
    const posts = list('institutionalPosts', (p) => p.departmentId === dept.id).sort((a, b) => Date.parse(b.publishedAt || b.createdAt || 0) - Date.parse(a.publishedAt || a.createdAt || 0));
    return el('div', { className: 'sp-feed' }, [composerView(), posts.length ? el('ul', { className: 'g-list' }, posts.map(postCard)) : el('p', { className: 'muted', text: 'Aún no hay avisos. Publica el primero arriba.' })]);
  }

  // ---------- Historias ----------
  function storyDialog(story, opener) {
    const original = story?.media?.[0] || null;
    let media = original;
    const startDuration = nearestDuration(story);
    const show = (v, errors = {}) => {
      const form = el('form', { className: 'stack', attrs: { novalidate: '' } });
      let active = v.active;
      const state_ = story ? (storyLive(story) ? `Se muestra ${timeLeft(story.expiresAt)} más.` : 'Ya no se muestra (expiró o está inactiva).') : '';
      form.append(
        el('h2', { text: story ? 'Editar historia' : 'Nueva historia' }),
        field('Título', 'title', { value: v.title, required: true, error: errors.title }),
        field('Texto', 'body', { control: 'textarea', value: v.body }),
        field('Duración', 'duration', { control: 'select', value: String(v.duration), options: DURATIONS.map((h) => [String(h), `${h} horas`]), hint: story ? `Cuenta desde que se publicó. ${state_}` : 'Cuenta desde que la guardes; después desaparece sola.' }),
        storyMediaPicker({ value: media, onChange: (m) => { media = m; } }),
        toggleRow('Activa', 'Si la apagas, se oculta aunque no haya expirado.', active, (c) => { active = c; }),
        el('div', { className: 'form-actions' }, [
          el('button', { className: 'button', type: 'submit', text: 'Guardar' }),
          el('button', { className: 'button secondary', type: 'button', text: 'Cancelar', onclick: () => dlg.close() }),
          story ? el('button', { className: 'button danger', type: 'button', text: 'Eliminar', onclick: () => { if (confirmDelete(`la historia "${story.title}"`)) { if (original?.type === 'video') deleteVideo(original.id); remove('stories', story.id); dlg.close(); announce('Historia eliminada.'); paint(); } } }) : null,
        ]),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = formData(form); const next = { title: d.title.trim(), body: d.body.trim(), duration: Number(d.duration), active };
        if (!next.title) { form.replaceWith(show(next, { title: 'El título es obligatorio.' })); announce('Revisa los campos marcados.'); dlg.querySelector('[aria-invalid]')?.focus(); return; }
        const startsAt = story?.startsAt || new Date().toISOString();
        const keepWindow = story && next.duration === startDuration && story.expiresAt;
        const base = { title: next.title, body: next.body, isActive: next.active, media: media ? [media] : [], startsAt, expiresAt: keepWindow ? story.expiresAt : new Date(Date.parse(startsAt) + next.duration * HOUR).toISOString() };
        const saved = story ? upsert('stories', { id: story.id, ...base }) : upsert('stories', { departmentId: dept.id, views: 0, ...base }, 'story');
        if (!saved) { form.prepend(el('p', { className: 'notice', text: 'No hay espacio en el navegador: usa una foto más pequeña.', attrs: { role: 'alert' } })); return; }
        if (original?.type === 'video' && original.id !== media?.id) deleteVideo(original.id);
        dlg.close(); announce('Historia guardada.'); paint();
      });
      return form;
    };
    // ponytail: si se cancela el diálogo tras subir un video nuevo, queda huérfano en IndexedDB; barrerlo al abrir si molesta.
    const dlg = dialog(story ? 'Editar historia' : 'Nueva historia', [show({ title: story?.title || '', body: story?.body || '', duration: startDuration, active: story ? story.isActive : true })], opener);
  }
  function historiasView() {
    const stories = list('stories', (s) => s.departmentId === dept.id);
    const add = el('button', { className: 'dp-story', type: 'button', attrs: { 'aria-label': 'Nueva historia' } }, [el('span', { className: 'dp-ring dp-add', text: '+' }), el('span', { className: 'dp-story-label', text: 'Nueva' })]);
    add.addEventListener('click', () => storyDialog(null, add));
    const circles = stories.map((s) => {
      const live = storyLive(s); const url = storyThumb(s.media?.[0]);
      const b = el('button', { className: 'dp-story', type: 'button', attrs: { 'aria-label': `Editar historia ${s.title} (${live ? 'activa' : 'expirada o inactiva'})` } }, [
        el('span', { className: `dp-ring ${live ? 'live' : 'off'}` }, [url ? el('img', { className: 'dp-round', src: url, alt: '' }) : avatar(s.title, current().accentToken || 'mayaBlue', 'lg')]),
        el('span', { className: 'dp-story-label', text: s.title }), badge(live ? `Activa · ${timeLeft(s.expiresAt)}` : 'Expirada', live ? '' : 'urgent'),
      ]);
      b.addEventListener('click', () => storyDialog(s, b)); return b;
    });
    return el('div', { className: 'stack' }, [el('div', { className: 'dp-stories' }, [add, ...circles]), stories.length ? null : el('p', { className: 'muted', text: 'Aún no hay historias. Toca "+" para crear la primera.' })]);
  }

  // ---------- Ajustes ----------
  let previewNode = null; let saveInfo = null;
  const touch = () => { state.dirty = true; if (saveInfo) { saveInfo.textContent = 'Cambios sin guardar'; saveInfo.classList.add('dirty'); } updatePreview(); };
  function previewCard() {
    const url = imageUrl(draft.cover); const hex = accentHex(draft.accentToken);
    const ph = imageUrl(draft.avatar);
    return el('div', { className: 'card dp-preview', attrs: { 'aria-label': 'Vista previa en la demo pública', role: 'group' } }, [
      el('div', { className: 'dp-prev-cover', style: url ? `background-image:url("${url}")` : `background:${hex}` }),
      el('div', { className: 'dp-prev-body' }, [ph ? el('img', { className: 'avatar avatar-lg dp-round', src: ph, alt: '' }) : avatar(draft.name || '?', draft.accentToken, 'lg'), el('strong', { text: draft.name || 'Nombre del departamento' }), el('p', { className: 'muted', text: draft.description || 'Sin descripción.' })]),
    ]);
  }
  function updatePreview() { if (!previewNode?.isConnected) return; const n = previewCard(); previewNode.replaceWith(n); previewNode = n; }

  function perfilSection() {
    const e = state.errors;
    const name = field('Nombre', 'name', { value: draft.name, required: true, error: e.name });
    const short = field('Nombre corto', 'shortName', { value: draft.shortName, required: true, error: e.shortName });
    const desc = field('Descripción', 'description', { control: 'textarea', value: draft.description, maxlength: String(MAX_DESC) });
    const counter = el('span', { className: 'muted dp-count', text: `${draft.description.length}/${MAX_DESC}` });
    const bind = (label, key, after) => label.querySelector('input,textarea').addEventListener('input', (ev) => { draft[key] = ev.target.value; after?.(); touch(); });
    bind(name, 'name'); bind(short, 'shortName'); bind(desc, 'description', () => { counter.textContent = `${draft.description.length}/${MAX_DESC}`; });
    const swatches = el('div', { className: 'dp-swatches', attrs: { role: 'group', 'aria-label': 'Color de acento' } }, ACCENTS.map(([key, label, hex]) => {
      const b = el('button', { className: 'dp-swatch', type: 'button', style: `background:${hex}`, attrs: { 'aria-label': label, 'aria-pressed': String(draft.accentToken === key), title: label } });
      b.addEventListener('click', () => { draft.accentToken = key; swatches.querySelectorAll('.dp-swatch').forEach((s) => s.setAttribute('aria-pressed', String(s === b))); touch(); });
      return b;
    }));
    previewNode = previewCard();
    return el('div', { className: 'stack' }, [
      el('h2', { text: 'Editar perfil' }),
      pickerHost({ label: 'Foto de perfil', value: draft.avatar, shape: 'round', max: 256 }, (m) => { draft.avatar = m; touch(); }),
      pickerHost({ label: 'Portada', value: draft.cover, shape: 'wide', max: 1280 }, (m) => { draft.cover = m; touch(); }),
      el('div', { className: 'form-grid' }, [name, short]),
      el('div', {}, [desc, counter]),
      el('div', {}, [el('strong', { text: 'Color de acento' }), swatches]),
      el('h3', { text: 'Vista previa' }), previewNode,
    ]);
  }
  function contactoSection() {
    const e = state.errors;
    const box = el('div', { className: 'stack' });
    const draw = () => box.replaceChildren(...(draft.contact.length ? draft.contact.map((c, i) => {
      const type = field('Tipo', `ctype-${i}`, { control: 'select', value: c.type, options: Object.entries(CONTACT_LABEL) });
      const label = field('Etiqueta', `clabel-${i}`, { value: c.label });
      const value = field('Valor', `cvalue-${i}`, { value: c.value, error: e[`contact-${i}`] });
      type.querySelector('select').addEventListener('change', (ev) => { c.type = ev.target.value; touch(); });
      label.querySelector('input').addEventListener('input', (ev) => { c.label = ev.target.value; touch(); });
      value.querySelector('input').addEventListener('input', (ev) => { c.value = ev.target.value; touch(); });
      const del = el('button', { className: 'button secondary small', type: 'button', text: 'Quitar', attrs: { 'aria-label': `Quitar contacto ${i + 1}` } });
      del.addEventListener('click', () => { draft.contact.splice(i, 1); state.errors = {}; touch(); draw(); (box.querySelector('fieldset button') || add).focus(); });
      return el('fieldset', { className: 'form-grid' }, [el('legend', { text: `Contacto ${i + 1}` }), type, label, value, del]);
    }) : [el('p', { className: 'muted', text: 'Sin contactos todavía.' })]));
    const add = el('button', { className: 'button secondary small', type: 'button', text: 'Añadir contacto' });
    add.addEventListener('click', () => { draft.contact.push({ id: uid('contact'), type: 'email', label: '', value: '' }); touch(); draw(); box.querySelector('fieldset:last-of-type select')?.focus(); });
    draw();
    return el('div', { className: 'stack' }, [el('h2', { text: 'Contacto' }), box, el('div', {}, [add])]);
  }
  function cuentaSection() {
    const active = toggleRow('Departamento activo', isAdmin ? 'Si lo desactivas, deja de verse en la demo pública.' : 'Solo el administrador puede cambiarlo.', draft.isActive, (c) => { draft.isActive = c; touch(); });
    if (!isAdmin) active.querySelector('input').disabled = true;
    return el('div', { className: 'stack' }, [el('h2', { text: 'Cuenta' }), active, el('p', {}, [el('strong', { text: 'Correo de la cuenta: ' }), profileEmail()])]);
  }
  const profileEmail = () => (isAdmin ? profiles().find((p) => p.role === 'department' && p.linkedId === dept.id)?.email || 'Sin perfil vinculado' : profile.email);

  function save() {
    const e = {}; const d = draft;
    if (!d.name.trim()) e.name = 'El nombre es obligatorio.';
    if (!d.shortName.trim()) e.shortName = 'El nombre corto es obligatorio.';
    d.contact.forEach((c, i) => { if (!c.value.trim()) e[`contact-${i}`] = 'El valor es obligatorio.'; else if (c.type === 'email' && !EMAIL.test(c.value.trim())) e[`contact-${i}`] = 'Escribe un correo válido.'; });
    state.errors = e;
    if (Object.keys(e).length) {
      state.menu = e.name || e.shortName ? 'perfil' : 'contacto';
      paint(); announce('Revisa los campos marcados.'); wrap.querySelector('[aria-invalid]')?.focus(); return;
    }
    upsert('departments', { id: dept.id, name: d.name.trim(), shortName: d.shortName.trim(), description: d.description.trim(), accentToken: d.accentToken, avatar: d.avatar, cover: d.cover, isActive: isAdmin ? d.isActive : current().isActive, contact: d.contact.map((c) => ({ ...c, label: c.label.trim() || CONTACT_LABEL[c.type], value: c.value.trim() })) });
    draft = fromDept(current()); state.dirty = false; state.errors = {};
    announce('Cambios guardados'); paint();
  }
  function ajustesView() {
    saveInfo = el('span', { className: `dp-saveinfo${state.dirty ? ' dirty' : ''}`, text: state.dirty ? 'Cambios sin guardar' : 'Todo guardado', attrs: { role: 'status' } });
    const bar = el('div', { className: 'dp-savebar card' }, [saveInfo, el('button', { className: 'button', type: 'button', text: 'Guardar cambios', onclick: save })]);
    const menu = [['perfil', 'Editar perfil', perfilSection], ['contacto', 'Contacto', contactoSection], ['cuenta', 'Cuenta', cuentaSection]];
    return el('div', { className: 'stack' }, [bar, settingsLayout(menu, state.menu, (key) => { state.menu = key; state.errors = {}; paint(); })]);
  }

  // ---------- Armado ----------
  function paint() {
    const d = current(); const posts = list('institutionalPosts', (p) => p.departmentId === dept.id); const stories = list('stories', (s) => s.departmentId === dept.id);
    const shell = profileShell({
      id: d.id, name: d.name, subtitle: `@${(d.shortName || d.name).toLowerCase().replace(/\s+/g, '')}`, avatarMedia: d.avatar, coverMedia: d.cover, token: d.accentToken || 'mayaBlue',
      badges: [badge(d.isActive !== false ? 'Activo' : 'Inactivo', d.isActive !== false ? '' : 'urgent')],
      stats: [[posts.filter((p) => p.isPublished && !p.isHiddenByModerator).length, 'avisos publicados'], [stories.filter((s) => storyLive(s)).length, 'historias activas'], [posts.reduce((n, p) => n + (p.views || 0), 0), 'vistas totales']],
      tabs: TABS, active: state.tab,
      onTab: (key, focus) => { state.tab = key; setParam('tab', key); paint(); if (focus) focusTab(); },
    });
    const view = state.tab === 'historias' ? historiasView() : state.tab === 'ajustes' ? ajustesView() : avisosView();
    wrap.replaceChildren(...[picker, shell, el('section', { attrs: { role: 'tabpanel', 'aria-label': TABS.find(([k]) => k === state.tab)[1] } }, [view])].filter(Boolean));
  }
  paint();
  return wrap;
}
