import seed from '../data/seed.json' with { type: 'json' };

// Persistencia local (sin backend): todo vive en localStorage bajo una sola clave.
// ponytail: sin autenticación real; "entrar como" es un selector de demo. Al añadir backend, sustituir load()/save() y session.
// Misma clave que lee la demo pública (/app/): al compartir origen, lo guardado aquí se ve allí.
export const STORAGE_KEY = 'calpulli:gestion:v1';
const KEY = STORAGE_KEY;
const COLLECTIONS = ['departments', 'entrepreneurs', 'tutors', 'stands', 'standRequests', 'fairs', 'institutionalPosts', 'stories', 'products', 'entrepreneurPosts', 'tutoringOffers'];

export const ROLES = {
  admin: { label: 'Administrador', home: '/perfiles' },
  department: { label: 'Departamento', home: '/departamento', collection: 'departments' },
  entrepreneur: { label: 'Emprendedor', home: '/emprendimiento', collection: 'entrepreneurs' },
  tutor: { label: 'Tutor', home: '/tutor', collection: 'tutors' },
  fair_admin: { label: 'Administrador de la feria', home: '/feria' },
};
export const ROLE_KEYS = Object.keys(ROLES);

const now = () => new Date().toISOString();
export const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// La semilla trae fechas fijas; se corren al presente una sola vez para que lo nuevo y lo sembrado convivan sin desfase.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const shifted = (value, delta) => JSON.parse(JSON.stringify(value), (_k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(Date.parse(v) + delta).toISOString() : v));

function initial() {
  const delta = Date.now() - Date.parse(seed.meta.createdAt);
  const data = Object.fromEntries(COLLECTIONS.map((name) => [name, shifted(seed[name] || [], delta)]));
  const t = now();
  const first = (collection) => data[collection][0]?.id;
  const profiles = [
    { id: 'profile-admin', role: 'admin', name: 'Administración Calpulli', email: 'admin@calpulli.demo', linkedId: null, isActive: true, createdAt: t, updatedAt: t },
    { id: 'profile-fair', role: 'fair_admin', name: 'Coordinación de la feria', email: 'feria@calpulli.demo', linkedId: first('fairs'), isActive: true, createdAt: t, updatedAt: t },
    { id: 'profile-dept', role: 'department', name: data.departments[0]?.name || 'Departamento', email: 'departamento@calpulli.demo', linkedId: first('departments'), isActive: true, createdAt: t, updatedAt: t },
    { id: 'profile-emp', role: 'entrepreneur', name: data.entrepreneurs[0]?.displayName || 'Emprendedor', email: 'emprendedor@calpulli.demo', linkedId: first('entrepreneurs'), isActive: true, createdAt: t, updatedAt: t },
    { id: 'profile-tutor', role: 'tutor', name: data.tutors[0]?.displayName || 'Tutor', email: 'tutor@calpulli.demo', linkedId: first('tutors'), isActive: true, createdAt: t, updatedAt: t },
  ];
  return { data, profiles, session: null };
}

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.data && Array.isArray(saved.profiles)) { COLLECTIONS.forEach((name) => { saved.data[name] ||= []; }); return saved; }
  } catch { /* datos corruptos o sin acceso: se reinicia con la semilla */ }
  return initial();
}

let db = read();
const listeners = new Set();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin persistencia: queda en memoria */ } listeners.forEach((fn) => fn()); }
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function resetDemo() { db = initial(); save(); }

// --- Entidades (departamentos, emprendimientos, tutores, publicaciones, productos, puestos…) ---
export const list = (collection, filter = () => true) => db.data[collection].filter(filter);
export const get = (collection, id) => db.data[collection].find((item) => item.id === id);
export function upsert(collection, item, prefix = collection.slice(0, 4)) {
  const rows = db.data[collection];
  const t = now();
  const index = rows.findIndex((row) => row.id === item.id);
  if (index >= 0) { rows[index] = { ...rows[index], ...item, updatedAt: t }; save(); return rows[index]; }
  const created = { isActive: true, createdAt: t, ...item, id: item.id || uid(prefix), updatedAt: t };
  rows.push(created); save(); return created;
}
export function remove(collection, id) { db.data[collection] = db.data[collection].filter((item) => item.id !== id); save(); }

// --- Perfiles (los gestiona el administrador) ---
export const profiles = () => db.profiles;
export const profileById = (id) => db.profiles.find((profile) => profile.id === id);
// Devuelve {ok:true, profile} o {ok:false, errors:{campo:mensaje}} para pintarlo junto al campo.
export function validateProfile(input, ignoreId) {
  const errors = {};
  if (!ROLES[input.role]) errors.role = 'Elige un rol válido.';
  if (!input.name?.trim()) errors.name = 'El nombre es obligatorio.';
  const email = input.email?.trim().toLowerCase() || '';
  if (!EMAIL.test(email)) errors.email = 'Escribe un correo válido.';
  else if (db.profiles.some((p) => p.email === email && p.id !== ignoreId)) errors.email = 'Ya existe un perfil con este correo.';
  if (ROLES[input.role]?.collection && !input.linkedId) errors.linkedId = 'Vincula o crea el registro de este perfil.';
  return errors;
}
export function saveProfile(input) {
  const errors = validateProfile(input, input.id);
  if (Object.keys(errors).length) return { ok: false, errors };
  const t = now();
  const clean = { ...input, name: input.name.trim(), email: input.email.trim().toLowerCase(), linkedId: input.linkedId || null };
  const index = db.profiles.findIndex((p) => p.id === input.id);
  let profile;
  if (index >= 0) { profile = db.profiles[index] = { ...db.profiles[index], ...clean, updatedAt: t }; }
  else { profile = { isActive: true, ...clean, id: uid('profile'), createdAt: t, updatedAt: t }; db.profiles.push(profile); }
  save(); return { ok: true, profile };
}
export function deleteProfile(id) {
  const target = profileById(id);
  if (!target) return { ok: false, error: 'El perfil no existe.' };
  if (target.role === 'admin' && db.profiles.filter((p) => p.role === 'admin' && p.isActive && p.id !== id).length === 0) return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
  db.profiles = db.profiles.filter((p) => p.id !== id);
  if (db.session === id) db.session = null;
  save(); return { ok: true };
}
export function setProfileActive(id, isActive) {
  const target = profileById(id);
  if (!target) return { ok: false, error: 'El perfil no existe.' };
  if (!isActive && target.role === 'admin' && db.profiles.filter((p) => p.role === 'admin' && p.isActive && p.id !== id).length === 0) return { ok: false, error: 'Debe quedar al menos un administrador activo.' };
  target.isActive = isActive; target.updatedAt = now();
  if (!isActive && db.session === id) db.session = null;
  save(); return { ok: true };
}

// --- Sesión de demostración ---
export const currentProfile = () => { const p = profileById(db.session); return p?.isActive ? p : null; };
export function signInAs(id) { if (profileById(id)?.isActive) { db.session = id; save(); } }
export function signOut() { db.session = null; save(); }
