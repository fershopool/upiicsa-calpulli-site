import { environment } from './environment.js';

const base = (environment.baseUrl || '/').replace(/\/+$/, '');
export function withBase(path) { if (!path || path === '#') return path; if (path.startsWith('#')) return base ? `${base}/${path}` : `/${path}`; if (path.startsWith('http')) return path; return `${base}${path.startsWith('/') ? path : `/${path}`}` || '/'; }
export const routes = { home: withBase('/'), calpulli: withBase('/calpulli/'), explora: withBase('/explora/'), proyecto: withBase('/proyecto/'), privacidad: withBase('/privacidad/'), contacto: withBase('/contacto/') };
export function routeForPath(pathname = window.location.pathname) { const relative = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname; const clean = relative.replace(/index\.html$/, '').replace(/\/+$/, '') || '/'; return ({'/':'home','/calpulli':'calpulli','/explora':'explora','/proyecto':'proyecto','/privacidad':'privacidad','/contacto':'contacto'})[clean] || 'not-found'; }
