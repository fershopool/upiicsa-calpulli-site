import { el } from '../utils/dom.js';
import { videoUrl } from '../services/media-db.js';
import mediaMap from '../data/media-map.json' with { type: 'json' };

const PROFILE_ROUTES = { department: 'departamento', entrepreneur: 'emprendimiento', tutor: 'tutor' };
export function profileHref(kind, id) {
  const route = PROFILE_ROUTES[kind];
  return route && id != null ? `#/${route}/${encodeURIComponent(id)}` : '#/';
}

export function reveal(node) {
  node?.classList.add('reveal');
  return node;
}

// Tokens de la paleta cultural del MVP móvil: [fondo, texto] con contraste AA.
const TOKENS = { mayaBlue: ['#2D78B8', '#FFFFFF'], turquoise: ['#149D98', '#06201C'], jade: ['#13745E', '#FFFFFF'], mexicanPink: ['#C83F83', '#FFFFFF'], cempasuchil: ['#DA8A0B', '#1F1400'], cochineal: ['#A93647', '#FFFFFF'] };
const TOKEN_KEYS = Object.keys(TOKENS);
const TZ = 'America/Mexico_City';

export const PRIORITY_LABEL = { featured: 'Destacado', important: 'Importante', urgent: 'Urgente' };
export const MODE_LABEL = { 'in-person': 'Presencial', online: 'En línea', hybrid: 'Híbrido' };
export const CONTACT_LABEL = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Correo', instagram: 'Instagram', phone: 'Teléfono', other: 'Contacto' };

export const normalize = (text) => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function hash(text) { let h = 0; for (const char of String(text)) h = (h * 31 + char.codePointAt(0)) >>> 0; return h; }
export const tokenFor = (key) => TOKEN_KEYS[hash(key) % TOKEN_KEYS.length];

export function avatar(name, token, size = 'md', image) {
  if (image?.type === 'data') return el('img', { className: `avatar avatar-${size}`, src: image.url, alt: '', style: 'object-fit:cover', attrs: { 'aria-hidden': 'true' } });
  const [bg, fg] = TOKENS[token] || TOKENS.jade;
  const initials = String(name).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return el('span', { className: `avatar avatar-${size}`, style: `background:${bg};color:${fg}`, attrs: { 'aria-hidden': 'true' }, text: initials });
}

// Las claves "bundled" del seed no tienen archivo: se muestra un mosaico abstracto determinista.
// Si data/media-map.json mapea la clave a un archivo de assets/media/, se muestra esa imagen.
const IMAGE_SIZE = { 'media-wide': [1280, 720], 'media-story': [900, 1200] };
export function mediaTile(key, label, className = '') {
  const file = mediaMap[key];
  if (file) {
    const [width, height] = IMAGE_SIZE[className.split(' ').find((name) => IMAGE_SIZE[name])] || [800, 600];
    const image = el('img', { src: `../src/assets/media/${file}`, alt: label, loading: 'lazy', width, height });
    return el('div', { className: `media has-image ${className}`.trim() }, [image]);
  }
  const [c1] = TOKENS[tokenFor(key)];
  const [c2] = TOKENS[tokenFor(`${key}:2`)];
  return el('div', { className: `media ${className}`.trim(), style: `--c1:${c1};--c2:${c2}`, attrs: { role: 'img', 'aria-label': `Imagen de ejemplo: ${label}` } });
}

// Imagen subida en Gestión ({type:'data'}) o clave del seed (mosaico / archivo mapeado).
export function mediaFrom(media, label, className = '') {
  if (media?.type === 'video') {
    const video = el('video', { poster: media.poster || '', muted: true, loop: true, playsInline: true, preload: 'metadata', attrs: { 'aria-label': label, muted: '', playsinline: '' } });
    if (!prefersReducedMotion()) video.autoplay = true; else video.controls = true;
    videoUrl(media.id).then((url) => { if (url) { video.src = url; if (video.autoplay) video.play().catch(() => {}); } });
    return el('div', { className: `media has-image ${className}`.trim() }, [video]);
  }
  if (media?.type !== 'data') return mediaTile(media?.key || label, label, className);
  const [width, height] = IMAGE_SIZE[className.split(' ').find((name) => IMAGE_SIZE[name])] || [800, 600];
  return el('div', { className: `media has-image ${className}`.trim() }, [el('img', { src: media.url, alt: label, loading: 'lazy', width, height })]);
}

export function badge(text, kind = '') { return el('span', { className: `badge ${kind}`.trim(), text }); }
export function chip(label, pressed, onToggle, lead) {
  const button = el('button', { className: 'chip', type: 'button', attrs: { 'aria-pressed': String(pressed) } }, [lead, label]);
  button.addEventListener('click', onToggle);
  return button;
}
export function emptyState(title, text, action) { return el('div', { className: 'empty-state' }, [el('h2', { text: title }), el('p', { className: 'muted', text }), action]); }
export function linkButton(label, href, secondary = true) { return el('a', { className: `button${secondary ? ' secondary' : ''}`, href, text: label }); }

const relative = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const full = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ });
export function relativeTime(iso, now = Date.now()) {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return Math.abs(days) < 8 ? relative.format(days, 'day') : absolute.format(new Date(iso));
}
export const fullDate = (iso) => full.format(new Date(iso));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const SVG = 'http://www.w3.org/2000/svg';
export function icon(path) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'icon');
  const node = document.createElementNS(SVG, 'path'); node.setAttribute('d', path); svg.append(node);
  return svg;
}

// <dialog> nativo: foco atrapado, Esc y ::backdrop sin código extra.
export function openDialog(title, content, { onClose, className = '' } = {}) {
  const opener = document.activeElement;
  const close = el('button', { className: 'dialog-close', type: 'button', text: '×', attrs: { 'aria-label': 'Cerrar' } });
  const dialog = el('dialog', { className: `dialog ${className}`.trim(), attrs: { 'aria-label': title, 'aria-modal': 'true' } }, [close, ...[content].flat()]);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); if (opener?.isConnected) opener.focus(); });
  document.body.append(dialog); dialog.showModal(); close.focus();
  return dialog;
}
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function contactList(contacts) {
  if (!contacts?.length) return null;
  return el('ul', { className: 'contact-list' }, contacts.map((contact) => el('li', {}, [el('strong', { text: `${CONTACT_LABEL[contact.type] || 'Contacto'}: ` }), contact.value, el('span', { className: 'muted', text: ` (${contact.label})` })])));
}
