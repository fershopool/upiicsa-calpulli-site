import seed from '../data/seed.json' with { type: 'json' };

const FAVORITES_KEY = 'calpulli:v1:favorites';
const GESTION_KEY = 'calpulli:gestion:v1'; // misma clave que escribe /gestion/
const COLLECTIONS = ['departments', 'entrepreneurs', 'tutors', 'stands', 'standRequests', 'fairs', 'institutionalPosts', 'stories', 'products', 'entrepreneurPosts', 'tutoringOffers'];
const SEEN_KEY = 'calpulli:v1:stories-seen';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const PRIORITY_RANK = { normal: 0, featured: 1, important: 2, urgent: 3 };
const WEDNESDAY = 3;
const FAIR_HOUR_UTC = 18;

function readList(key) { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeList(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* sin persistencia: queda en memoria */ } }

// La semilla se generó en una fecha fija; se corre al presente para que "hace 3 h" siga siendo "hace 3 h".
function shiftDates(text, delta) { return JSON.parse(text, (_key, value) => (typeof value === 'string' && ISO.test(value) ? new Date(Date.parse(value) + delta).toISOString() : value)); }

// Regla de la feria: próximo miércoles 18:00 UTC; es solo una sugerencia editable cuando exista Gestión.
export function nextFairDate(now = Date.now()) {
  const date = new Date(now);
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), FAIR_HOUR_UTC));
  candidate.setUTCDate(candidate.getUTCDate() + ((WEDNESDAY - candidate.getUTCDay() + 7) % 7));
  if (candidate.getTime() <= now) candidate.setUTCDate(candidate.getUTCDate() + 7);
  return candidate.toISOString();
}

export const GESTION_STORAGE_KEY = GESTION_KEY;
export function loadState() {
  const text = JSON.stringify(seed);
  const state = shiftDates(text, Date.now() - Date.parse(seed.meta.createdAt));
  // Lo guardado en Gestión (mismo navegador/origen) sustituye las colecciones de la semilla; sus fechas ya están al presente.
  try {
    const saved = JSON.parse(localStorage.getItem(GESTION_KEY));
    if (saved?.data && typeof saved.data === 'object') COLLECTIONS.forEach((name) => { state[name] = Array.isArray(saved.data[name]) ? saved.data[name] : []; });
  } catch { /* JSON inválido o sin acceso: se usa la semilla */ }
  state.fair = state.fairs[0] || shiftDates(JSON.stringify(seed.fairs[0]), Date.now() - Date.parse(seed.meta.createdAt));
  if (state.fair.status === 'upcoming' && !(Date.parse(state.fair.nextDate) > Date.now())) state.fair.nextDate = nextFairDate();
  state.byId = Object.fromEntries(['departments', 'entrepreneurs', 'tutors', 'stands'].map((key) => [key, Object.fromEntries(state[key].map((item) => [item.id, item]))]));
  pruneFavorites(feed(state).map((post) => post.id));
  return state;
}

// --- Reglas públicas (equivalen a los selectores de @calpulli/domain/repositories) ---
const inWindow = (item, now) => Date.parse(item.startsAt) <= now && now < Date.parse(item.expiresAt);
const isLive = (state, post, now) => post.isPublished && !post.isHiddenByModerator && state.byId.departments[post.departmentId]?.isActive && (!post.scheduledAt || Date.parse(post.scheduledAt) <= now);

// D028: urgent > important > featured > normal; luego más reciente; id como desempate.
export function feed(state, departmentId = '', now = Date.now()) {
  return state.institutionalPosts
    .filter((post) => isLive(state, post, now) && (!departmentId || post.departmentId === departmentId))
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.id < b.id ? -1 : 1));
}

export function activeStories(state, now = Date.now()) { return state.stories.filter((story) => story.isActive && inWindow(story, now) && state.byId.departments[story.departmentId]?.isActive); }
export function activeDepartments(state) { return state.departments.filter((department) => department.isActive); }
export function products(state) { return state.products.filter((item) => item.isActive && state.byId.entrepreneurs[item.entrepreneurId]?.isActive); }
export function entrepreneurPosts(state, entrepreneurId) { return state.entrepreneurPosts.filter((post) => post.entrepreneurId === entrepreneurId && post.isPublished && !post.isHiddenByModerator); }
export function tutors(state) { return state.tutors.filter((tutor) => tutor.isActive).map((tutor) => ({ ...tutor, offers: state.tutoringOffers.filter((offer) => offer.tutorId === tutor.id && offer.isActive) })); }
export function standFor(state, entrepreneurId) { return state.stands.find((stand) => stand.status === 'assigned' && stand.assignedEntrepreneurId === entrepreneurId); }

// --- Estado local del visitante (solo este navegador) ---
let favorites = new Set(readList(FAVORITES_KEY));
let seen = new Set(readList(SEEN_KEY));
export const isFavorite = (id) => favorites.has(id);
export function toggleFavorite(id) { favorites.has(id) ? favorites.delete(id) : favorites.add(id); writeList(FAVORITES_KEY, [...favorites]); return favorites.has(id); }
export function pruneFavorites(validIds) { const valid = new Set(validIds); favorites = new Set([...favorites].filter((id) => valid.has(id))); writeList(FAVORITES_KEY, [...favorites]); }
export const favoriteIds = () => [...favorites];
export const isSeen = (id) => seen.has(id);
export function markSeen(id) { seen.add(id); writeList(SEEN_KEY, [...seen]); }
