import { el, announce } from '../utils/dom.js';
import { entrepreneurPosts, products, standFor } from '../services/public-store.js';
import { avatar, badge, contactList, emptyState, mediaFrom, profileHref, relativeTime, tokenFor } from '../components/ui.js';
import { productCard } from './marketplace.js';

const TOKEN_PAIRS = { mayaBlue: ['#2D78B8', '#149D98'], turquoise: ['#149D98', '#13745E'], jade: ['#13745E', '#2D78B8'], mexicanPink: ['#C83F83', '#A93647'], cempasuchil: ['#DA8A0B', '#C83F83'], cochineal: ['#A93647', '#DA8A0B'] };
function shareButton(id) {
  const button = el('button', { className: 'button secondary', type: 'button', text: 'Compartir perfil' });
  button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}${profileHref('entrepreneur', id)}`); announce('Enlace del perfil copiado'); } catch { announce('No se pudo copiar el enlace'); } });
  return button;
}
function stat(value, label) { return el('div', { className: 'profile-stat' }, [el('strong', { text: String(value) }), el('span', { text: label })]); }

export function perfilEmprendimiento({ state, id }) {
  const owner = state.byId.entrepreneurs[id];
  if (!owner?.isActive) return emptyState('Emprendimiento no disponible', 'Este perfil ya no está disponible.', el('a', { className: 'button', href: '#/marketplace', text: 'Volver al Marketplace' }));
  const stand = standFor(state, id);
  const items = products(state).filter((item) => item.entrepreneurId === id);
  const posts = entrepreneurPosts(state, id);
  const [from, to] = TOKEN_PAIRS[tokenFor(owner.id)] || TOKEN_PAIRS.jade;
  return el('div', { className: 'profile-page entrepreneur-profile' }, [
    el('a', { className: 'back', href: '#/marketplace', text: '← Marketplace' }),
    owner.cover?.type === 'data' ? mediaFrom(owner.cover, `Portada de ${owner.displayName}`, 'media-wide cover') : el('div', { className: 'profile-cover', style: `--profile-from:${from};--profile-to:${to}`, attrs: { role: 'img', 'aria-label': `Portada abstracta de ${owner.displayName}` } }, [el('span', { text: owner.category })]),
    el('div', { className: 'profile-identity' }, [avatar(owner.displayName, tokenFor(owner.id), 'xl', owner.avatar), el('div', {}, [el('span', { className: 'eyebrow', text: 'Emprendimiento activo' }), el('h1', { text: owner.displayName }), el('p', { className: 'muted', text: owner.category })])]),
    el('div', { className: 'profile-toolbar' }, [el('div', { className: 'profile-actions' }, [stand ? el('a', { className: 'button', href: '#/feria', text: `Ver mesa ${stand.number} en la feria` }) : el('a', { className: 'button secondary', href: '#/feria', text: 'Conoce la feria' }), shareButton(id)]), badge('Activo', 'on')]),
    el('div', { className: 'profile-stats' }, [stat(items.length, 'productos'), stat(posts.length, 'publicaciones'), stat(owner.gallery?.length || 0, 'piezas en galería')]),
    el('p', { className: 'profile-description', text: owner.description }), contactList(owner.externalContacts),
    owner.gallery?.length ? el('section', {}, [el('div', { className: 'section-heading' }, [el('h2', { text: 'Galería' }), el('span', { className: 'muted', text: 'Una mirada al proyecto' })]), el('div', { className: 'gallery' }, owner.gallery.map((media, index) => mediaFrom(media, `${owner.displayName}, imagen ${index + 1}`)))]) : null,
    items.length ? el('section', {}, [el('div', { className: 'section-heading' }, [el('h2', { text: 'Productos' }), el('a', { className: 'text-link', href: '#/marketplace', text: 'Ver Marketplace' })]), el('div', { className: 'grid-cards' }, items.map((item) => productCard(state, item)))]) : emptyState('Aún no hay productos', 'Este emprendimiento todavía no ha publicado productos.'),
    posts.length ? el('section', {}, [el('h2', { text: 'Publicaciones' }), el('div', { className: 'profile-posts' }, posts.map((post) => el('article', { className: 'post' }, [el('h3', { text: post.title }), post.media?.length ? mediaFrom(post.media[0], post.title, 'media-wide') : null, el('p', { className: 'muted', text: relativeTime(post.publishedAt) })])))]) : null,
  ]);
}
