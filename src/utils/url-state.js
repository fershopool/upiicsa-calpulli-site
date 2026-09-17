export function readCategory() { return new URLSearchParams(window.location.search).get('categoria') || ''; }
export function goWithCategory(path, category = '') { const query = category ? `?categoria=${encodeURIComponent(category)}` : ''; window.location.href = `${path}${query}`; }
