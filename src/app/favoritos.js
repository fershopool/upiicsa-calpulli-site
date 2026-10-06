import { el } from '../utils/dom.js';
import { favoriteIds, feed } from '../services/public-store.js';
import { emptyState, linkButton, plural } from '../components/ui.js';
import { postCard } from './inicio.js';

export function favoritos({ state }) {
  const list = el('div', { className: 'feed' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  function paint() {
    const saved = new Set(favoriteIds());
    const posts = feed(state).filter((post) => saved.has(post.id));
    count.textContent = plural(posts.length, 'aviso guardado', 'avisos guardados');
    list.replaceChildren(...(posts.length ? posts.map((post) => postCard(state, post, { onToggle: paint })) : [emptyState('Aún no tienes favoritos', 'Guarda avisos importantes para consultarlos rápidamente.', linkButton('Ir a Avisos', '#/', false))]));
  }
  paint();
  return el('div', {}, [el('h1', { text: 'Favoritos' }), el('p', { className: 'lead', text: 'Se guardan solo en este navegador; no se crea ninguna cuenta.' }), count, list]);
}
