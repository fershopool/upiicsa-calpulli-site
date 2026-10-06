import { el } from '../utils/dom.js';
import { avatar, tokenFor } from '../components/ui.js';
import { openLightbox } from '../components/lightbox.js';
import { putVideo, deleteVideo } from '../services/media-db.js';
import { postGallery } from '../components/gallery.js';

// Componentes compartidos con aspecto de red social: portada, avatar, pestañas y ajustes.
const RASTER_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,/;
export const imageUrl = (media) => {
  const url = media?.type === 'data' && typeof media.url === 'string' ? media.url : '';
  return RASTER_DATA_URL.test(url) && !url.includes('"') && !url.includes("'") ? url : '';
};

export function profileShell({ id, name, subtitle, avatarMedia, coverMedia, token, stats = [], badges = [], tabs = [], active, onTab, actions = [] }) {
  const coverUrl = imageUrl(coverMedia);
  const cover = el('div', { className: 'sp-cover', style: coverUrl ? `background-image:url("${coverUrl}")` : '--c1:var(--jade);--c2:var(--turquoise)', attrs: { role: 'img', 'aria-label': coverUrl ? 'Portada' : 'Portada de ejemplo' } });
  const photo = imageUrl(avatarMedia) ? el('img', { className: 'avatar avatar-xl sp-photo', src: imageUrl(avatarMedia), alt: `Foto de perfil de ${name}` }) : avatar(name, token || tokenFor(id || name), 'xl');
  const tabBar = el('div', { className: 'sp-tabs', attrs: { role: 'tablist', 'aria-label': 'Secciones del perfil' } }, tabs.map(([key, label]) => {
    const tab = el('button', { className: 'sp-tab', type: 'button', text: label, attrs: { role: 'tab', 'aria-selected': String(key === active), tabindex: key === active ? '0' : '-1' } });
    tab.dataset.tab = key;
    tab.addEventListener('click', () => onTab(key));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.findIndex(([item]) => item === active);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      onTab(tabs[next][0]);
      tabBar.querySelector(`[data-tab="${tabs[next][0]}"]`)?.focus();
    });
    return tab;
  }));
  const meta = el('div', { className: 'sp-meta' }, [photo, el('div', { className: 'sp-id' }, [el('h1', { text: name }), subtitle ? el('p', { className: 'muted', text: subtitle }) : null, badges.length ? el('div', { className: 'sp-badges' }, badges) : null]), actions.length ? el('div', { className: 'sp-actions' }, actions) : null]);
  const summary = stats.length ? el('ul', { className: 'sp-stats' }, stats.map(([value, label]) => el('li', {}, [el('strong', { text: value }), el('span', { className: 'muted', text: label })]))) : null;
  return el('section', { className: 'card sp-head' }, [cover, meta, summary, tabBar]);
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

function reducedImage(file, max) {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const img = new Image();
    const finish = () => URL.revokeObjectURL(source);
    img.onload = () => {
      const side = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const scale = Math.min(1, max / side);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const context = canvas.getContext('2d');
      if (!context) { finish(); reject(new Error('No se pudo procesar la imagen.')); return; }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      finish();
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', file.type === 'image/png' ? undefined : 0.9));
    };
    img.onerror = () => { finish(); reject(new Error('No se pudo leer la imagen.')); };
    img.src = source;
  });
}

export async function readImage(file, max = 2048) {
  if (!file?.type?.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
  if (file.size <= 1.2 * 1024 * 1024) return fileAsDataUrl(file);
  return reducedImage(file, max);
}

export const resizeImage = readImage;

// value: media actual ({type:'data',url}) o null. onChange(media|null) se llama al elegir o quitar.
export function imagePicker({ label, value, max = 512, shape = 'square', onChange }) {
  const currentUrl = imageUrl(value);
  const status = el('span', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const preview = el('span', { className: `sp-pick-preview ${shape}`, style: `background-image:${currentUrl ? `url("${currentUrl}")` : 'none'};background-size:${shape === 'photo' ? 'contain' : 'cover'}`, attrs: { role: 'img', 'aria-label': currentUrl ? `${label}: vista previa` : `${label}: sin imagen` } });
  const input = el('input', { type: 'file', accept: 'image/*', className: 'sr-only', id: `pick-${Math.random().toString(36).slice(2, 9)}` });
  const choose = el('label', { className: 'button secondary small', attrs: { for: input.id }, text: currentUrl ? 'Cambiar' : 'Subir' });
  const drop = currentUrl ? el('button', { className: 'button secondary small', type: 'button', text: 'Quitar', attrs: { 'aria-label': `Quitar ${label.toLowerCase()}` } }) : null;
  const setLoading = (loading) => { input.disabled = loading; choose.setAttribute('aria-disabled', String(loading)); if (drop) drop.disabled = loading; };
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    setLoading(true);
    status.textContent = 'Cargando imagen…';
    try { onChange({ type: 'data', url: await readImage(file, max) }); status.textContent = 'Imagen lista.'; } catch (error) { status.textContent = error.message; } finally { setLoading(false); input.value = ''; }
  });
  drop?.addEventListener('click', () => onChange(null));
  return el('div', { className: 'sp-pick' }, [preview, el('div', { className: 'stack' }, [el('strong', { text: label }), el('div', { className: 'row-actions' }, [choose, drop]), status]), input]);
}

// Foto para galerías: se reescala (nunca se amplía ni recorta) a `max` px por lado largo y se guarda con su
// tamaño {w,h} para que la galería respete la proporción original. Siempre JPEG para que quepan varias en localStorage.
export function readPhoto(file, max = 1600) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error(`«${file?.name || 'Archivo'}» no es una imagen.`)); return; }
    const source = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width; const height = img.naturalHeight || img.height;
      const scale = Math.min(1, max / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(source);
      if (!context) { reject(new Error('No se pudo procesar la imagen.')); return; }
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ type: 'data', url: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height });
    };
    img.onerror = () => { URL.revokeObjectURL(source); reject(new Error(`No se pudo leer «${file.name}».`)); };
    img.src = source;
  });
}

// Varias fotos con vista previa en el mismo acomodo que tendrá la publicación; se pueden reordenar y quitar.
// value: arreglo de media ({type:'data',url,w,h}). onChange(arreglo) en cada cambio.
export function galleryPicker({ label = 'Fotos (opcional)', value = [], limit = 10, max = 1600, onChange }) {
  let items = [...value];
  const status = el('span', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true, className: 'sr-only', id: `gal-${Math.random().toString(36).slice(2, 9)}` });
  const choose = el('label', { className: 'button secondary small', attrs: { for: input.id } });
  const list = el('ul', { className: 'gal gal-edit' });
  const host = el('div', { className: 'gal-picker stack' }, [el('strong', { text: label }), list, el('div', { className: 'row-actions' }, [choose, status]), input]);
  const commit = () => { onChange([...items]); draw(); };
  const tool = (text, name, disabled, run) => { const b = el('button', { className: 'gal-tool', type: 'button', text, disabled, attrs: { 'aria-label': name } }); b.addEventListener('click', run); return b; };
  const move = (i, to) => { [items[i], items[to]] = [items[to], items[i]]; commit(); };
  function draw() {
    list.hidden = !items.length;
    list.replaceChildren(...items.map((m, i) => el('li', { className: 'gal-item', style: `--ar:${(m.w && m.h ? m.w / m.h : 1.5).toFixed(4)}` }, [
      el('img', { src: m.url, alt: `Foto ${i + 1} de ${items.length}` }),
      el('div', { className: 'gal-tools' }, [tool('‹', `Mover foto ${i + 1} a la izquierda`, i === 0, () => move(i, i - 1)), tool('×', `Quitar foto ${i + 1}`, false, () => { items.splice(i, 1); status.textContent = ''; commit(); }), tool('›', `Mover foto ${i + 1} a la derecha`, i === items.length - 1, () => move(i, i + 1))]),
    ])));
    const full = items.length >= limit;
    choose.textContent = items.length ? `Agregar más (${items.length}/${limit})` : 'Agregar fotos';
    choose.setAttribute('aria-disabled', String(full)); input.disabled = full;
    choose.hidden = full;
  }
  input.addEventListener('change', async () => {
    const files = [...input.files]; input.value = '';
    if (!files.length) return;
    const room = limit - items.length;
    const errors = []; let added = 0;
    input.disabled = true; status.textContent = 'Cargando fotos…';
    for (const file of files.slice(0, room)) { try { items.push(await readPhoto(file, max)); added += 1; } catch (error) { errors.push(error.message); } }
    if (files.length > room) errors.push(`Máximo ${limit} fotos: se omitieron ${files.length - room}.`);
    commit();
    status.textContent = errors[0] || (added ? `${added} ${added === 1 ? 'foto agregada' : 'fotos agregadas'}.` : '');
  });
  draw();
  return host;
}

const MAX_VIDEO_MB = 40;
const MAX_VIDEO_S = 60;
// Fotograma del video como miniatura (JPEG pequeño en localStorage) + duración y tamaño.
function videoInfo(file) {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement('video');
    const fail = (message) => { URL.revokeObjectURL(source); reject(new Error(message)); };
    video.muted = true; video.preload = 'metadata'; video.playsInline = true;
    video.onerror = () => fail('Este navegador no puede leer ese video. Prueba con MP4 (H.264).');
    video.onloadedmetadata = () => {
      if (video.duration > MAX_VIDEO_S) { fail(`El video dura más de ${MAX_VIDEO_S} s.`); return; }
      video.currentTime = Math.min(0.1, video.duration / 2 || 0);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 540 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const info = { poster: canvas.toDataURL('image/jpeg', 0.8), w: video.videoWidth, h: video.videoHeight, duration: Math.round(video.duration * 10) / 10 };
      URL.revokeObjectURL(source); resolve(info);
    };
    video.src = source;
  });
}

// Foto o video para una historia. value: {type:'data',url,…} | {type:'video',id,poster,…} | null.
export function storyMediaPicker({ label = 'Foto o video (opcional)', value, onChange }) {
  const thumbOf = (m) => (m?.type === 'video' ? m.poster : imageUrl(m)) || '';
  const status = el('span', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const input = el('input', { type: 'file', accept: 'image/*,video/*', className: 'sr-only', id: `pick-${Math.random().toString(36).slice(2, 9)}` });
  const host = el('div', {});
  let created = null; // video guardado por este selector, para no dejar huérfano el anterior si se reemplaza
  const draw = (media) => {
    const url = thumbOf(media);
    const preview = el('span', { className: 'sp-pick-preview story', style: `background-image:${url ? `url("${url}")` : 'none'};background-size:cover`, attrs: { role: 'img', 'aria-label': url ? `${label}: vista previa` : `${label}: sin archivo` } }, [media?.type === 'video' ? el('span', { className: 'sp-pick-play', text: '▶', attrs: { 'aria-hidden': 'true' } }) : null]);
    const choose = el('label', { className: 'button secondary small', attrs: { for: input.id }, text: media ? 'Cambiar' : 'Subir' });
    const drop = media ? el('button', { className: 'button secondary small', type: 'button', text: 'Quitar', attrs: { 'aria-label': 'Quitar archivo de la historia' } }) : null;
    drop?.addEventListener('click', () => { if (created) { deleteVideo(created); created = null; } onChange(null); status.textContent = ''; draw(null); });
    host.replaceChildren(el('div', { className: 'sp-pick' }, [preview, el('div', { className: 'stack' }, [el('strong', { text: label }), el('small', { className: 'muted', text: `Foto, o video de hasta ${MAX_VIDEO_S} s y ${MAX_VIDEO_MB} MB.` }), el('div', { className: 'row-actions' }, [choose, drop]), status]), input]));
  };
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    input.disabled = true; status.textContent = 'Procesando…';
    try {
      let media;
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`El video pesa más de ${MAX_VIDEO_MB} MB.`);
        const info = await videoInfo(file);
        const id = await putVideo(file).catch(() => { throw new Error('No hay espacio para guardar el video en el navegador.'); });
        media = { type: 'video', id, mime: file.type, ...info };
      } else media = await readPhoto(file, 1600);
      if (created) deleteVideo(created);
      created = media.type === 'video' ? media.id : null;
      onChange(media); draw(media); status.textContent = media.type === 'video' ? 'Video listo.' : 'Foto lista.';
    } catch (error) { status.textContent = error.message; } finally { input.disabled = false; }
  });
  draw(value);
  return host;
}

export { postGallery };

export function postImage({ url, alt = 'Imagen de la publicación' }) {
  const image = el('img', { className: 'post-media-img', src: url, alt, loading: 'lazy', decoding: 'async' });
  const button = el('button', { className: 'post-media-btn', type: 'button', attrs: { 'aria-label': 'Ampliar foto' } }, [image]);
  button.addEventListener('click', () => openLightbox({ url, alt }));
  return el('figure', { className: 'post-media' }, [button]);
}

export { openLightbox };

export function toggleRow(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', className: 'sp-switch', checked, attrs: { 'aria-label': label } });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'sp-toggle' }, [el('span', {}, [el('strong', { text: label }), hint ? el('small', { className: 'muted', text: hint }) : null]), input]);
}

// Ajustes con menú lateral (como «Editar perfil / Contactos / Privacidad»).
export function settingsLayout(sections, active, onSelect) {
  const menu = el('nav', { className: 'sp-menu', attrs: { 'aria-label': 'Ajustes' } }, sections.map(([key, label]) => {
    const item = el('button', { className: 'sp-menu-item', type: 'button', text: label, attrs: key === active ? { 'aria-current': 'true' } : {} });
    item.addEventListener('click', () => onSelect(key));
    return item;
  }));
  const [, , body] = sections.find(([key]) => key === active) || sections[0];
  return el('div', { className: 'sp-settings' }, [menu, el('div', { className: 'sp-panel card' }, [typeof body === 'function' ? body() : body])]);
}
