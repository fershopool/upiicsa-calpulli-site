import { el } from '../utils/dom.js';
import { avatar, tokenFor } from '../app/ui.js';

// Componentes compartidos con aspecto de red social: portada + avatar + pestañas, ajustes en dos paneles, selector de imagen.
// Las imágenes se guardan como data URL ({type:'data', url}) reducidas en el navegador; ponytail: localStorage ~5 MB, con backend subir archivos.
export const imageUrl = (media) => (media?.type === 'data' ? media.url : '');

export function profileShell({ id, name, subtitle, avatarMedia, coverMedia, token, stats = [], badges = [], tabs, active, onTab, actions = [] }) {
  const cover = el('div', { className: 'sp-cover', style: imageUrl(coverMedia) ? `background-image:url(${imageUrl(coverMedia)})` : `--c1:var(--jade);--c2:var(--maya,#2D78B8)`, attrs: { role: 'img', 'aria-label': coverMedia ? 'Portada' : 'Portada de ejemplo' } });
  const photo = imageUrl(avatarMedia) ? el('img', { className: 'avatar avatar-xl sp-photo', src: imageUrl(avatarMedia), alt: '' }) : avatar(name, token || tokenFor(id || name), 'xl');
  const bar = el('div', { className: 'sp-tabs', attrs: { role: 'tablist', 'aria-label': 'Secciones del perfil' } }, tabs.map(([key, label]) => {
    const tab = el('button', { className: 'sp-tab', type: 'button', text: label, attrs: { role: 'tab', 'aria-selected': String(key === active), tabindex: key === active ? '0' : '-1' } });
    tab.addEventListener('click', () => onTab(key));
    tab.addEventListener('keydown', (e) => { const i = tabs.findIndex(([k]) => k === active); const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (n !== null) { e.preventDefault(); onTab(tabs[(n + tabs.length) % tabs.length][0], true); } });
    return tab;
  }));
  return el('header', { className: 'sp-head card' }, [cover, el('div', { className: 'sp-meta' }, [photo, el('div', { className: 'sp-id' }, [el('h1', { text: name }), subtitle ? el('p', { className: 'muted', text: subtitle }) : null, badges.length ? el('div', { className: 'sp-badges' }, badges) : null]), el('div', { className: 'sp-actions' }, actions)]), stats.length ? el('ul', { className: 'sp-stats' }, stats.map(([n, label]) => el('li', {}, [el('strong', { text: String(n) }), ` ${label}`]))) : null, bar]);
}

// Reduce la imagen elegida (lado mayor <= max) y devuelve un data URL JPEG; rechaza archivos que no son imagen.
export function resizeImage(file, max) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) return reject(new Error('Elige un archivo de imagen.'));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

// value: media actual ({type:'data',url}) o null. onChange(media|null) se llama al elegir o quitar.
export function imagePicker({ label, value, max = 512, shape = 'square', onChange }) {
  const status = el('span', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const preview = el('span', { className: `sp-pick-preview ${shape}`, style: imageUrl(value) ? `background-image:url(${imageUrl(value)})` : '' });
  const input = el('input', { type: 'file', accept: 'image/*', className: 'sr-only', id: `pick-${Math.random().toString(36).slice(2, 7)}` });
  input.addEventListener('change', async () => {
    try { const url = await resizeImage(input.files[0], max); onChange({ type: 'data', url }); } catch (e) { status.textContent = e.message; }
  });
  const choose = el('label', { className: 'button secondary small', attrs: { for: input.id }, text: imageUrl(value) ? 'Cambiar' : 'Subir' });
  const drop = imageUrl(value) ? el('button', { className: 'button secondary small', type: 'button', text: 'Quitar', onclick: () => onChange(null) }) : null;
  return el('div', { className: 'sp-pick' }, [preview, el('div', {}, [el('strong', { text: label }), el('div', { className: 'row-actions' }, [choose, drop]), status]), input]);
}

// Interruptor accesible tipo ajustes de red social.
export function toggleRow(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked, className: 'sp-switch', attrs: { role: 'switch' } });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { className: 'sp-toggle' }, [el('span', {}, [el('strong', { text: label }), hint ? el('span', { className: 'muted', text: hint }) : null]), input]);
}

// Ajustes con menú lateral (como "Editar perfil / Contactos / Privacidad"). sections: [[key,label,node|fn]]
export function settingsLayout(sections, active, onSelect) {
  const menu = el('nav', { className: 'sp-menu', attrs: { 'aria-label': 'Ajustes' } }, sections.map(([key, label]) => {
    const a = el('button', { className: 'sp-menu-item', type: 'button', text: label, attrs: key === active ? { 'aria-current': 'true' } : {} });
    a.addEventListener('click', () => onSelect(key)); return a;
  }));
  const [, , body] = sections.find(([key]) => key === active) || sections[0];
  return el('div', { className: 'sp-settings' }, [menu, el('div', { className: 'sp-panel card' }, [typeof body === 'function' ? body() : body])]);
}
