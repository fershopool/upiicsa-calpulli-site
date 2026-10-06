import { el } from '../utils/dom.js';
import { entrepreneurPosts, products, standFor } from './store.js';
import { avatar, badge, contactList, emptyState, mediaFrom, relativeTime, tokenFor } from './ui.js';
import { productCard } from './marketplace.js';

export function perfilEmprendimiento({ state, id }) {
  const owner = state.byId.entrepreneurs[id];
  if (!owner?.isActive) return emptyState('Emprendimiento no disponible', 'Este perfil ya no está disponible.', el('a', { className: 'button', href: '#/marketplace', text: 'Volver al Marketplace' }));
  const stand = state.fair.status === 'active' ? standFor(state, id) : null;
  const items = products(state).filter((item) => item.entrepreneurId === id);
  const posts = entrepreneurPosts(state, id);
  return el('div', {}, [
    el('a', { className: 'back', href: '#/marketplace', text: '← Marketplace' }),
    owner.cover?.type === 'data' ? mediaFrom(owner.cover, `Portada de ${owner.displayName}`, 'media-wide cover') : null,
    el('div', { className: 'post-head profile-head' }, [avatar(owner.displayName, tokenFor(owner.id), 'xl', owner.avatar), el('div', {}, [el('h1', { text: owner.displayName }), el('p', { className: 'muted', text: owner.category }), stand ? badge(`Mesa ${stand.number} en la feria`, 'on') : null])]),
    el('p', { text: owner.description }),
    contactList(owner.externalContacts),
    owner.gallery?.length ? el('div', { className: 'gallery' }, owner.gallery.map((media, i) => mediaFrom(media, `${owner.displayName}, foto ${i + 1}`))) : null,
    items.length ? el('section', {}, [el('h2', { text: 'Productos' }), el('div', { className: 'grid-cards' }, items.map((item) => productCard(state, item)))]) : null,
    posts.length ? el('section', {}, [el('h2', { text: 'Publicaciones' }), ...posts.map((post) => el('article', { className: 'post' }, [el('h3', { text: post.title }), el('p', { text: post.body }), el('p', { className: 'muted', text: relativeTime(post.publishedAt) })]))]) : null,
  ]);
}
