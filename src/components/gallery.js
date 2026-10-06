import { el } from '../utils/dom.js';
import { openLightbox } from './lightbox.js';

const RASTER = /^data:image\/(png|jpe?g|webp|gif);base64,/;
export const photoItems = (media) => (media || []).filter((m) => m?.type === 'data' && RASTER.test(m.url || '') && !/["']/.test(m.url));

// Galería en filas justificadas: cada foto conserva su proporción original (sin recortar) y solo se reescala
// para que las de una misma fila queden a la misma altura. Clic o teclado abre el visor con flechas.
export function postGallery(media, alt = 'Foto de la publicación') {
  const items = photoItems(media);
  if (!items.length) return null;
  const label = (i) => (items.length > 1 ? `${alt} (${i + 1} de ${items.length})` : alt);
  const slides = items.map((m, i) => ({ url: m.url, alt: label(i) }));
  const tiles = items.map((m, i) => {
    const ratio = m.w && m.h ? m.w / m.h : 1.5;
    const image = el('img', { src: m.url, alt: label(i), loading: 'lazy', decoding: 'async' });
    if (m.w && m.h) { image.width = m.w; image.height = m.h; }
    const button = el('button', { className: 'gal-btn', type: 'button', attrs: { 'aria-label': `Ampliar foto ${i + 1} de ${items.length}` } }, [image]);
    button.addEventListener('click', () => openLightbox({ items: slides, index: i }));
    return el('li', { className: 'gal-item', style: `--ar:${ratio.toFixed(4)}` }, [button]);
  });
  return el('ul', { className: `gal ${items.length === 1 ? 'gal-one' : ''}`.trim(), attrs: { 'aria-label': `${items.length} ${items.length === 1 ? 'foto' : 'fotos'}` } }, tiles);
}
