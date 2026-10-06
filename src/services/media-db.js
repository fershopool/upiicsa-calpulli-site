// Videos de historias: no caben en localStorage (~5 MB), así que el archivo vive en IndexedDB
// y la historia solo guarda {type:'video', id, poster}. Mismo origen en /gestion y /app.
const DB = 'calpulli-media';
const STORE = 'videos';
const urls = new Map();

const open = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export async function putVideo(blob) {
  const id = `vid-${crypto.randomUUID().slice(0, 8)}`;
  await run('readwrite', (store) => store.put(blob, id));
  return id;
}

// URL temporal reutilizable del video; null si ya no existe (otro navegador o datos borrados).
export async function videoUrl(id) {
  if (urls.has(id)) return urls.get(id);
  try {
    const blob = await run('readonly', (store) => store.get(id));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch { return null; }
}

export async function deleteVideo(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  try { await run('readwrite', (store) => store.delete(id)); } catch { /* sin acceso: no hay nada que borrar */ }
}
