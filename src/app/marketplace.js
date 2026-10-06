import { el } from '../utils/dom.js';
import { products } from '../services/public-store.js';
import { avatar, chip, contactList, emptyState, linkButton, mediaFrom, normalize, openDialog, plural, tokenFor } from '../components/ui.js';

function productDialog(state, product) {
  const owner = state.byId.entrepreneurs[product.entrepreneurId];
  openDialog(product.name, [mediaFrom(product.media?.[0] || { key: product.id }, product.name, 'media-wide'), el('h2', { text: product.name }), product.priceLabel ? el('p', { className: 'price', text: product.priceLabel }) : null, el('p', { className: 'muted', text: `${product.category} · ${owner.displayName}` }), product.description ? el('p', { text: product.description }) : null, contactList(owner.externalContacts), el('p', { className: 'notice', text: 'Calpulli solo muestra el catálogo: no hay compras ni pagos aquí. El trato se acuerda directamente con el emprendimiento.' }), linkButton('Ver emprendimiento', `#/emprendimiento/${owner.id}`, false)]);
}

export function productCard(state, product) {
  const owner = state.byId.entrepreneurs[product.entrepreneurId];
  const card = el('button', { className: 'card product-card', type: 'button' }, [mediaFrom(product.media?.[0] || { key: product.id }, product.name), el('div', { className: 'card-body' }, [el('strong', { text: product.name }), product.priceLabel ? el('span', { className: 'price', text: product.priceLabel }) : null, el('span', { className: 'muted', text: `${owner.displayName} · ${product.category}` })])]);
  card.addEventListener('click', () => productDialog(state, product));
  return card;
}

export function marketplace({ state, params, setParam }) {
  const items = products(state);
  const categories = [...new Set(items.map((item) => item.category))].sort();
  let category = categories.includes(params.get('cat')) ? params.get('cat') : '';
  let query = params.get('q') || '';
  const search = el('input', { type: 'search', id: 'market-search', name: 'q', value: query, placeholder: 'Buscar producto o emprendimiento', attrs: { autocomplete: 'off' } });
  const chips = el('div', { className: 'rail', attrs: { role: 'group', 'aria-label': 'Filtrar por categoría' } });
  const grid = el('div', { className: 'grid-cards' });
  const count = el('p', { className: 'muted', attrs: { 'aria-live': 'polite' } });
  const owners = el('div', { className: 'rail' }, state.entrepreneurs.filter((owner) => owner.isActive).map((owner) => el('a', { className: 'chip', href: `#/emprendimiento/${owner.id}` }, [avatar(owner.displayName, tokenFor(owner.id), 'xs', owner.avatar), owner.displayName])));

  function paint() {
    chips.replaceChildren(chip('Todas', !category, () => pick('')), ...categories.map((name) => chip(name, category === name, () => pick(name))));
    const needle = normalize(query.trim());
    const found = items.filter((item) => (!category || item.category === category) && (!needle || normalize(`${item.name} ${item.description || ''} ${item.category} ${state.byId.entrepreneurs[item.entrepreneurId].displayName}`).includes(needle)));
    count.textContent = plural(found.length, 'resultado', 'resultados');
    grid.replaceChildren(...(found.length ? found.map((item) => productCard(state, item)) : [emptyState('No encontramos resultados', 'Prueba con otra palabra o quita los filtros.', el('button', { className: 'button secondary', type: 'button', text: 'Limpiar filtros', onclick: () => { category = ''; query = ''; search.value = ''; sync(); paint(); } }))]));
  }
  const sync = () => { setParam('cat', category); setParam('q', query); };
  const pick = (name) => { category = name; sync(); paint(); };
  search.addEventListener('input', () => { query = search.value; sync(); paint(); });
  paint();
  return el('div', {}, [el('h1', { text: 'Marketplace' }), el('p', { className: 'lead', text: 'Descubre emprendimientos y productos de la comunidad. Sin carrito ni pagos.' }), el('label', { className: 'field', attrs: { for: 'market-search' } }, [el('span', { text: 'Buscar' }), search]), chips, count, grid, el('h2', { text: 'Emprendimientos' }), owners]);
}
