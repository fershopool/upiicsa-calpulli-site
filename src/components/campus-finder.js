import { el } from '../utils/dom.js';
import { normalize } from './ui.js';
import { createStage } from './three-stage.js';

const KIND_LABELS = { salon: 'Salón', laboratorio: 'Laboratorio', oficina: 'Oficina', sanitarios: 'Sanitarios', servicio: 'Servicio', academia: 'Academia', otro: 'Otro' };
const WING_TEXT = { izquierda: 'el ala izquierda', derecha: 'el ala derecha', centro: 'el ala central' };
const BAND_TEXT = { superior: 'la franja superior', media: 'la franja media', inferior: 'la franja inferior' };
const THIRDS = { izquierda: [0, 1 / 3], centro: [1 / 3, 1 / 3], derecha: [2 / 3, 1 / 3], superior: [0, 1 / 3], media: [1 / 3, 1 / 3], inferior: [2 / 3, 1 / 3] };
const POI_KIND = { metrobus: 'Metrobús', acceso: 'Acceso' };
const POI_MODE = { entrada: 'Entrada', salida: 'Salida', ambos: 'Entrada y salida' };
const POI_GLYPH = { entrada: '→', salida: '←', ambos: '⇄' };
const M_PER_PX = 0.56;
const NOTE = 'Esquema orientativo basado en vista aérea; no a escala.';
const SVG_NS = 'http://www.w3.org/2000/svg';




const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const inRect = (x, y, r, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;

function distToRect(px, py, r) {
  const nx = clamp(px, r.x, r.x + r.w);
  const ny = clamp(py, r.y, r.y + r.h);
  return { x: nx, y: ny, d: Math.hypot(px - nx, py - ny) };
}

function segmentHitsRect(a, b, r) {
  for (let t = 0; t <= 1; t += 0.04) if (inRect(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r, -3)) return true;
  return false;
}

function pointsOnRoads(roads) {
  const out = [];
  roads.filter((road) => road.kind !== 'rail').forEach((road) => {
    for (let i = 0; i < road.pts.length - 1; i += 1) {
      const [x1, y1] = road.pts[i];
      const [x2, y2] = road.pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 8));
      for (let s = 0; s <= steps; s += 1) out.push({ x: x1 + ((x2 - x1) * s) / steps, y: y1 + ((y2 - y1) * s) / steps, name: road.name });
    }
  });
  return out;
}

/** Camino recto o con un codo que evita los edificios dados. */
function walk(a, b, others) {
  const options = [[a, b], [a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]];
  return options.find((pts) => pts.every((pt, i) => i === 0 || !others.some((other) => segmentHitsRect(pts[i - 1], pt, other)))) || options[0];
}

const nearestPoi = (from, pois, kind) => pois.filter((p) => p.kind === kind && p !== from).map((p) => ({ poi: p, d: Math.hypot(p.x - from.x, p.y - from.y) })).sort((x, y) => x.d - y.d)[0];

/** Ruta orientativa: parada de Metrobús más cercana al acceso más cercano al edificio, y de ahí al edificio. */
function computeRoute(item, layout, samples) {
  const rect = item.rect;
  const pois = layout.pois || [];
  const others = layout.buildings.filter((other) => other.id !== item.id);
  const access = pois.filter((p) => p.kind === 'acceso').map((p) => ({ poi: p, ...distToRect(p.x, p.y, rect) })).sort((x, y) => x.d - y.d)[0];
  const station = access && nearestPoi(access.poi, pois, 'metrobus');
  if (access && station) {
    const leg1 = walk(station.poi, access.poi, layout.buildings);
    const leg2 = walk(access.poi, { x: access.x, y: access.y }, others);
    const alt = pois.find((p) => p.kind === 'metrobus' && p !== station.poi);
    return { points: [...leg1, ...leg2.slice(1)].map((p) => ({ x: p.x, y: p.y })), name: access.poi.name, access: access.poi, station: station.poi, alt };
  }
  let best = null;
  samples.forEach((p) => { const hit = distToRect(p.x, p.y, rect); if (!best || hit.d < best.d) best = { ...p, ...hit }; });
  if (!best) return null;
  const start = { x: best.x, y: best.y };
  const end = { x: clamp(start.x, rect.x, rect.x + rect.w), y: clamp(start.y, rect.y, rect.y + rect.h) };
  return { points: walk(start, end, others), name: best.name };
}

function createSteps(entry, route) {
  const { building, level, space } = entry;
  const levelCount = building.levels?.length || 1;
  const stairs = (building.connections || []).find((text) => /escaler|elevador|rampa/i.test(text));
  const zone = [WING_TEXT[space.wing], BAND_TEXT[space.band]].filter(Boolean);
  const steps = [
    ...(route?.station
      ? [
        `Llega en Metrobús a la estación ${route.station.name.replace('Metrobús ', '')}${route.alt ? ` (o ${route.alt.name.replace('Metrobús ', '')})` : ''}.`,
        `Camina por la línea punteada hasta el ${route.access.name.charAt(0).toLowerCase()}${route.access.name.slice(1)} (${POI_MODE[route.access.mode].toLowerCase()}).`,
        `Entra y sigue la línea punteada hasta ${building.shortName || building.name}.`,
      ]
      : [route ? `Parte de ${route.name} y sigue la línea punteada hasta ${building.shortName || building.name}.` : `Dirígete a ${building.shortName || building.name}.`]),
    level.order === 0 ? 'Permanece en planta baja.' : `Sube hasta ${level.label.toLowerCase()} (el edificio tiene ${levelCount} niveles).`,
    zone.length ? `En el plano, busca ${zone.join(', ')}.` : 'El plano no precisa el ala; recorre el nivel con el marcador como guía.',
    `Destino: ${space.name} (${(KIND_LABELS[space.kind] || space.kind || 'espacio').toLowerCase()}).`,
  ];
  if (stairs) steps.splice(route?.station ? 4 : 2, 0, `Referencia: ${stairs}`);
  if (space.note) steps.push(`Nota: ${space.note}`);
  return steps;
}

const CATEGORIES = [
  ['sanitarios', 'Baños'],
  ['salones', 'Salones y espacios numerados'],
  ['laboratorio', 'Laboratorios'],
  ['academia', 'Academias'],
  ['oficina', 'Oficinas'],
  ['servicio', 'Servicios'],
  ['otros', 'Otros espacios'],
];
const categoryOf = (space) => (space.kind === 'salon' || (space.kind === 'otro' && /^\d/.test(space.name)) ? 'salones' : CATEGORIES.some(([k]) => k === space.kind) ? space.kind : 'otros');
const locationText = (space) => [space.wing && `ala ${space.wing}`, space.band && `franja ${space.band}`].filter(Boolean).join(', ');

const labelFor = (entry) => `${entry.space.name} · ${entry.building.shortName || entry.building.name} · ${entry.level.label}`;

function flattenSpaces(buildings) {
  return buildings.flatMap((building) => building.levels.flatMap((level) => level.spaces.map((space) => ({
    building,
    level,
    space,
    name: normalize(space.name),
    text: normalize([space.name, space.kind, KIND_LABELS[space.kind], building.name, building.shortName, building.id, level.label].filter(Boolean).join(' ')),
  }))));
}

/* ---------- Escenario 2D ---------- */

const svg = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (parent) parent.append(node);
  return node;
};

/** Zona aproximada (ala + franja) dentro del plano [x, y, w, h]. */
function zoneBox(space, [x, y, w, h]) {
  const [x0, wx] = THIRDS[space.wing] || [0, 1];
  const [y0, hy] = THIRDS[space.band] || [0, 1];
  return { x: x + x0 * w, y: y + y0 * h, w: wx * w, h: hy * h };
}

/** Busca el rótulo del espacio en el plano; si no hay, devuelve la zona. */
function locate(meta, space) {
  const zone = zoneBox(space, meta.vb);
  const n = normalize(space.name);
  const hits = meta.labels.filter((l) => { const t = normalize(l.t); return t && (t === n || (t.length > 2 && n.length > 6 && n.includes(t))); });
  if (!hits.length) return { ...zone, exact: false };
  const cx = zone.x + zone.w / 2; const cy = zone.y + zone.h / 2;
  const near = (l) => Math.hypot(l.x + l.w / 2 - cx, l.y + l.h / 2 - cy);
  const first = hits.slice().sort((a, b) => near(a) - near(b))[0];
  const group = hits.filter((l) => Math.hypot(l.x - first.x, l.y - first.y) < 420);
  const x0 = Math.min(...group.map((l) => l.x)); const y0 = Math.min(...group.map((l) => l.y));
  const x1 = Math.max(...group.map((l) => l.x + l.w)); const y1 = Math.max(...group.map((l) => l.y + l.h));
  return { x: x0 - 30, y: y0 - 30, w: x1 - x0 + 60, h: y1 - y0 + 60, exact: true };
}

const planBase = (file) => new URL(`../assets/models/${file.replace(/^\.\.\/models\//, '')}`, import.meta.url);
const cache = new Map();
const fetchCached = (file, parse) => {
  if (!cache.has(file)) cache.set(file, fetch(planBase(file)).then((r) => { if (!r.ok) throw new Error(file); return parse(r); }).catch((error) => { cache.delete(file); throw error; }));
  return cache.get(file);
};
const loadModel = (bid) => fetchCached(`${bid}.json`, (r) => r.json());

const legendIcon = (kind) => {
  const icon = svg('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
  if (kind === 'metrobus' || kind === 'acceso') { svg('circle', { cx: 10, cy: 10, r: 9, fill: kind === 'metrobus' ? '#cc3a42' : '#1f9c6c' }, icon); svg('text', { x: 10, y: 14, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#fff' }, icon).textContent = kind === 'metrobus' ? 'M' : '⇄'; }
  if (kind === 'edificio') svg('rect', { x: 2, y: 4, width: 16, height: 12, rx: 2, fill: '#f4ecd9', stroke: '#8a7b5c', 'stroke-width': 1.5 }, icon);
  if (kind === 'salida') svg('rect', { x: 2, y: 5, width: 16, height: 10, rx: 2, fill: '#1f9c6c' }, icon);
  if (kind === 'bano') { svg('rect', { x: 1, y: 3, width: 18, height: 14, rx: 3, fill: '#2b3a35' }, icon); svg('text', { x: 10, y: 14, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 800, fill: '#fff' }, icon).textContent = 'WC'; }
  if (kind === 'destino') svg('rect', { x: 2, y: 4, width: 16, height: 12, rx: 3, fill: 'rgb(245 204 84/.35)', stroke: '#f5cc54', 'stroke-width': 2 }, icon);
  return icon;
};
const LEGEND = {
  campus: [['metrobus', 'Metrobús'], ['acceso', 'Acceso'], ['edificio', 'Edificio']],
  plan: [['bano', 'Baños'], ['salida', 'Salida de emergencia'], ['destino', 'Destino']],
};

export function mount(container, campusData, options = {}) {
  const layout = campusData?.layout;
  const buildings = campusData?.buildings;
  const root = el('section', { className: `campus-finder${options.compact ? ' campus-finder-compact' : ''}`, attrs: { 'aria-label': 'Encuentra tu salón' } });
  if (!layout || !buildings?.length) {
    root.append(el('p', { className: 'campus-detail-empty', text: 'Cargando el modelo del plantel…' }));
    container.replaceChildren(root);
    return root;
  }

  const byId = Object.fromEntries(buildings.map((building) => [building.id, building]));
  const entries = flattenSpaces(buildings);
  const uid = Math.random().toString(36).slice(2, 8);
  const itemById = Object.fromEntries(layout.buildings.map((b) => [b.id, { id: b.id, rect: { x: b.x, y: b.y, w: b.w, h: b.h } }]));
  const poiList = layout.pois || [];
  const poiById = Object.fromEntries(poiList.map((p) => [p.id, p]));
  const poiEntries = poiList.map((poi) => ({
    poi,
    name: normalize(poi.name),
    text: normalize([poi.name, POI_KIND[poi.kind], POI_MODE[poi.mode], poi.mode === 'ambos' ? 'entrada salida' : '', poi.kind === 'metrobus' ? 'estacion parada autobus' : 'puerta acceso', poi.note].filter(Boolean).join(' ')),
  }));
  const samples = pointsOnRoads(layout.roads);

  let query = '';
  let buildingFilter = '';
  let activeEntry = null;
  let selectedIndex = -1;
  let focusId = '';
  let viewLevelId = '';
  let activePoi = null;
  let poiShow = '';
  let stageToken = 0;
  let stage3d = null;

  const heading = options.heading === false ? null : el('div', { className: 'campus-finder-heading' }, [
    el('div', {}, [el('span', { className: 'eyebrow', text: 'Mapa de espacios' }), el('h2', { text: 'Encuentra tu salón' })]),
  ]);

  const search = el('input', {
    className: 'campus-search-input',
    id: `campus-search-${uid}`,
    type: 'search',
    autocomplete: 'off',
    placeholder: 'Ej. 204, laboratorio, Metrobús, entrada',
    attrs: { role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': `campus-list-${uid}`, 'aria-expanded': 'false', 'aria-label': 'Buscar salón, edificio, tipo de espacio, Metrobús o acceso' },
  });
  const suggestions = el('div', { className: 'campus-suggestions', id: `campus-list-${uid}`, role: 'listbox', attrs: { hidden: '', 'aria-label': 'Resultados' } });
  const resultCount = el('p', { className: 'campus-result-count', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const status = el('p', { className: 'campus-sr', attrs: { role: 'status', 'aria-live': 'polite' } });
  const chips = el('div', { className: 'campus-chips', attrs: { role: 'group', 'aria-label': 'Filtrar por edificio, Metrobús o accesos' } });
  const caption = el('div', { className: 'cs-caption', attrs: { hidden: '', role: 'status' } });
  const stage = el('div', { className: 'cs-stage', attrs: { tabindex: '0', role: 'application', 'aria-label': 'Mapa 3D del campus. Flechas para rotar, más y menos para acercar, cero para ver todo.' } });
  stage.append(caption);
  const legend = el('ul', { className: 'campus-legend', attrs: { 'aria-label': 'Leyenda' } });
  const detail = el('aside', { className: 'campus-detail', attrs: { 'aria-label': 'Detalles del espacio' } });

  /* --- escenario WebGL (three-stage.js) --- */
  const themeName = () => 'light'; // escena siempre de tarde: se lee mejor que el atardecer
  const currentLevel = () => {
    const levels = focusId ? [...byId[focusId].levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
    return levels.find((l) => l.id === (viewLevelId && viewLevelId !== 'all' ? viewLevelId : activeEntry?.level.id)) || levels[0];
  };

  function paintLegend(kind) {
    legend.replaceChildren(...LEGEND[kind].map(([icon, text]) => el('li', {}, [legendIcon(icon), el('span', { text })])));
  }

  /** Rótulo del espacio en el modelo (metros, centro x,y); si no hay, la zona (ala + franja). */
  function locateModel(modelLevel, bbox, space) {
    const n = normalize(space.name);
    const labels = modelLevel?.labels || [];
    const hits = labels.filter((l) => { const t = normalize(l.t); return t && (t === n || (t.length > 2 && n.length > 6 && n.includes(t))); });
    const [x0, y0, x1, y1] = bbox;
    const [fx, fw] = THIRDS[space.wing] || [0, 1];
    const [fy, fh] = THIRDS[space.band] || [0, 1];
    const zone = { x: x0 + (fx + fw / 2) * (x1 - x0), y: y0 + (fy + fh / 2) * (y1 - y0), w: fw * (x1 - x0), h: fh * (y1 - y0), exact: false };
    if (!hits.length) return zone;
    const cx = zone.x; const cy = zone.y;
    const near = (l) => Math.hypot(l.x - cx, l.y - cy);
    const first = hits.slice().sort((a, b) => near(a) - near(b))[0];
    const group = hits.filter((l) => Math.hypot(l.x - first.x, l.y - first.y) < 12);
    const ax = Math.min(...group.map((l) => l.x - l.w / 2)); const ay = Math.min(...group.map((l) => l.y - l.h / 2));
    const bx = Math.max(...group.map((l) => l.x + l.w / 2)); const by = Math.max(...group.map((l) => l.y + l.h / 2));
    return { x: (ax + bx) / 2, y: (ay + by) / 2, w: Math.max(2.5, bx - ax + 1.5), h: Math.max(2.5, by - ay + 1.5), exact: true };
  }

  function showCampus() {
    stage3d.closeBuilding();
    stage3d.focusPoi(activePoi ? activePoi.id : null);
    if (!activePoi) stage3d.resetView();
    caption.hidden = true;
    paintLegend('campus');
  }

  async function showBuilding() {
    const token = ++stageToken;
    const building = byId[focusId];
    const level = currentLevel();
    const all = viewLevelId === 'all' || (!activeEntry && !viewLevelId);
    caption.hidden = false;
    caption.replaceChildren(el('span', { text: `${building.shortName || building.name} · cargando modelo…` }));
    try {
      const model = await loadModel(building.id);
      if (token !== stageToken) return;
      const modelLevel = model.levels.find((l) => l.id === level.id);
      const space = !all && activeEntry && activeEntry.level.id === level.id ? activeEntry.space : null;
      const highlight = space ? { levelId: level.id, rect: locateModel(modelLevel, model.bbox, space), label: space.name } : null;
      const opened = await stage3d.openBuilding(building.id, { levelId: all ? null : level.id, highlight });
      if (token !== stageToken) return;
      if (!opened) throw new Error('sin modelo');
      const back = el('button', { className: 'campus-chip', type: 'button', text: '← Campus' });
      back.addEventListener('click', reset);
      caption.replaceChildren(el('span', { text: `${building.shortName || building.name} · ${all ? 'edificio completo' : level.label}` }), back);
      paintLegend('plan');
    } catch {
      if (token !== stageToken) return;
      reset();
      status.textContent = 'No se pudo cargar el modelo de este edificio.';
    }
  }

  function renderStage() {
    if (!stage3d || !stage3d.supported) return;
    stage3d.setPoiActive([activePoi?.id, activeEntry?.route?.access?.id, activeEntry?.route?.station?.id].filter(Boolean));
    if (focusId) showBuilding(); else { stageToken += 1; showCampus(); }
  }

  /* --- selección --- */
  function paintDetail() {
    if (activePoi) { paintPoiDetail(activePoi); return; }
    if (!activeEntry && poiShow) {
      const list = poiList.filter((p) => p.kind === poiShow).map((poi) => {
        const button = el('button', { className: 'campus-chip', type: 'button', text: `${poi.name} · ${POI_MODE[poi.mode].toLowerCase()}` });
        button.addEventListener('click', () => choosePoi(poi));
        return el('li', {}, [button]);
      });
      detail.replaceChildren(el('span', { className: 'eyebrow', text: poiShow === 'metrobus' ? 'Paradas de Metrobús' : 'Entradas y salidas' }), el('ul', { className: 'campus-poi-list' }, list));
      return;
    }
    if (!activeEntry && !focusId) {
      detail.replaceChildren(el('p', { className: 'campus-detail-empty', text: 'Toca un edificio, o busca un salón, acceso o parada de Metrobús, para ver su plano.' }));
      return;
    }
    const building = activeEntry?.building || byId[focusId];
    const space = activeEntry?.space;
    const levels = [...building.levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const shown = currentLevel();
    const connections = building.connections || [];
    const fullTab = () => {
      const isAll = viewLevelId === 'all' || (!activeEntry && !viewLevelId);
      const tab = el('button', { className: `campus-floor-tab${isAll ? ' is-active' : ''}`, type: 'button', text: 'Completo', attrs: { 'aria-pressed': String(isAll), title: 'Ver el edificio completo' } });
      tab.addEventListener('click', () => { viewLevelId = 'all'; paintDetail(); renderStage(); });
      return tab;
    };
    const groups = CATEGORIES.map(([key, title]) => [key, title, shown.spaces.filter((s) => categoryOf(s) === key)]).filter(([, , list]) => list.length);
    const chip = (s, withWhere) => {
      const where = locationText(s);
      const button = el('button', { className: `campus-chip${s === space ? ' is-current' : ''}`, type: 'button', text: s.name, attrs: s === space ? { 'aria-current': 'true' } : {} });
      if (where) button.title = where;
      button.addEventListener('click', () => choose({ building, level: shown, space: s }));
      return el('li', {}, [button, ...(withWhere && where ? [el('span', { className: 'campus-where', text: where })] : [])]);
    };
    const children = [
      el('span', { className: 'eyebrow', text: activeEntry ? 'Destino' : 'Edificio' }),
      el('h3', { text: space?.name || building.name }),
      el('p', { className: 'campus-detail-meta', text: activeEntry ? `${building.name} · ${activeEntry.level.label}` : `${levels.length} ${levels.length === 1 ? 'nivel' : 'niveles'}` }),
      el('div', { className: 'campus-floor-tabs', attrs: { role: 'group', 'aria-label': `Pisos de ${building.shortName || building.name}` } }, [fullTab(), ...[...levels].reverse().map((lvl) => {
        const tab = el('button', { className: `campus-floor-tab${lvl === shown && !(viewLevelId === 'all' || (!activeEntry && !viewLevelId)) ? ' is-active' : ''}`, type: 'button', text: lvl.label, attrs: { 'aria-pressed': String(lvl === shown && !(viewLevelId === 'all' || (!activeEntry && !viewLevelId))), title: `${lvl.spaces.length} espacios` } });
        tab.addEventListener('click', () => { viewLevelId = lvl.id; paintDetail(); renderStage(); });
        return tab;
      })]),
      ...groups.map(([key, title, list]) => el('section', { className: 'campus-floor-group' }, [
        el('h4', { text: `${title} · ${list.length}` }),
        el('ul', { className: `campus-floor-list${key === 'salones' ? ' is-numbered' : ''}` }, list.map((s) => chip(s, key !== 'salones'))),
      ])),
    ];
    if (activeEntry) children.push(el('details', { className: 'campus-more' }, [el('summary', { text: 'Cómo llegar' }), el('ol', { className: 'campus-steps' }, createSteps(activeEntry, activeEntry.route).map((step) => el('li', { text: step })))]));
    if (connections.length || building.doubts?.length) {
      children.push(el('details', { className: 'campus-more' }, [
        el('summary', { text: 'Conexiones y pendientes' }),
        ...(connections.length ? [el('ul', {}, connections.map((text) => el('li', { text })))] : []),
        ...(building.doubts?.length ? [el('p', { className: 'campus-detail-meta', text: 'Pendiente de confirmar' }), el('ul', {}, building.doubts.map((text) => el('li', { text })))] : []),
      ]));
    }
    detail.replaceChildren(...children);
  }

  function paintPoiDetail(poi) {
    const near = poi.kind === 'metrobus' ? nearestPoi(poi, poiList, 'acceso') : nearestPoi(poi, poiList, 'metrobus');
    const meters = near ? Math.round((near.d * M_PER_PX) / 10) * 10 : 0;
    detail.replaceChildren(
      el('span', { className: 'eyebrow', text: POI_KIND[poi.kind] }),
      el('h3', { text: poi.name }),
      el('p', { className: 'campus-detail-meta', text: POI_MODE[poi.mode] }),
      el('p', { text: poi.note }),
      ...(poi.supuesto ? [el('p', { className: 'campus-detail-empty', text: 'Ubicación y sentido supuestos a partir de la vista aérea; pendiente de confirmar.' })] : []),
      ...(near ? [el('p', { text: `${poi.kind === 'metrobus' ? 'Acceso más cercano' : 'Estación de Metrobús más cercana'}: ${near.poi.name} (unos ${meters} m en línea recta).` })] : []),
    );
  }

  function closeSuggestions() { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); }

  function choosePoi(poi) {
    activeEntry = null; activePoi = poi; poiShow = ''; focusId = ''; viewLevelId = '';
    query = poi.name; search.value = query; selectedIndex = -1; buildingFilter = '';
    paintChips(); paintResults(); closeSuggestions();
    paintDetail(); renderStage();
    status.textContent = `${POI_KIND[poi.kind]} seleccionado: ${poi.name}.`;
  }

  function choose(entry) {
    if (entry.poi) { choosePoi(entry.poi); return; }
    activePoi = null; poiShow = ''; viewLevelId = '';
    activeEntry = entry;
    activeEntry.route = computeRoute(itemById[entry.building.id], layout, samples);
    query = entry.space.name; search.value = query; selectedIndex = -1; buildingFilter = '';
    focusId = entry.building.id;
    paintChips(); paintResults(); closeSuggestions();
    paintDetail(); renderStage();
    status.textContent = `Destino seleccionado: ${labelFor(entry)}.`;
  }

  function pickBuilding(id) {
    activeEntry = null; activePoi = null; poiShow = ''; viewLevelId = ''; focusId = id; buildingFilter = id;
    query = ''; search.value = '';
    paintChips(); paintResults(); paintDetail(); renderStage();
    status.textContent = `Edificio seleccionado: ${byId[id].name}.`;
  }

  function reset() {
    activeEntry = null; activePoi = null; poiShow = ''; focusId = ''; viewLevelId = ''; buildingFilter = ''; query = ''; search.value = '';
    paintChips(); paintResults(); paintDetail(); renderStage();
    status.textContent = 'Vista general del campus.';
  }

  /* --- búsqueda --- */
  function filteredEntries() {
    const needle = normalize(query.trim());
    const kind = buildingFilter.startsWith('kind:') ? buildingFilter.slice(5) : '';
    const found = [
      ...entries.filter((entry) => (!buildingFilter || entry.building.id === buildingFilter) && (!needle || entry.text.includes(needle))),
      ...poiEntries.filter((entry) => (!buildingFilter || entry.poi.kind === kind) && (!needle || entry.text.includes(needle))),
    ];
    if (needle) found.sort((a, b) => (a.name.startsWith(needle) ? 0 : a.name.includes(needle) ? 1 : 2) - (b.name.startsWith(needle) ? 0 : b.name.includes(needle) ? 1 : 2));
    return found;
  }

  function paintResults() {
    const all = filteredEntries();
    const found = all.slice(0, 8);
    selectedIndex = Math.min(selectedIndex, found.length - 1);
    suggestions.replaceChildren(...found.map((entry, index) => {
      const option = el('div', {
        className: `campus-suggestion${index === selectedIndex ? ' is-active' : ''}`,
        attrs: { role: 'option', 'aria-selected': String(index === selectedIndex), id: `campus-option-${uid}-${index}`, tabindex: '-1' },
      }, entry.poi
        ? [el('strong', { text: entry.poi.name }), el('span', { text: `${POI_KIND[entry.poi.kind]} · ${POI_MODE[entry.poi.mode]}` })]
        : [el('strong', { text: entry.space.name }), el('span', { text: `${entry.building.shortName || entry.building.name} · ${entry.level.label} · ${KIND_LABELS[entry.space.kind] || entry.space.kind}` })]);
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => choose(entry));
      return option;
    }));
    suggestions.hidden = !search.value || !found.length;
    search.setAttribute('aria-expanded', String(!suggestions.hidden));
    search.removeAttribute('aria-activedescendant');
    if (selectedIndex >= 0) search.setAttribute('aria-activedescendant', `campus-option-${uid}-${selectedIndex}`);
    resultCount.textContent = `${all.length} ${all.length === 1 ? 'resultado' : 'resultados'}${all.length > 8 ? ' (se muestran 8)' : ''}`;
  }

  function paintChips() {
    const make = (id, text) => {
      const button = el('button', { className: `campus-chip${buildingFilter === id ? ' is-active' : ''}`, type: 'button', text, attrs: { 'aria-pressed': String(buildingFilter === id) } });
      button.addEventListener('click', () => {
        if (!id || buildingFilter === id) { reset(); return; }
        if (id.startsWith('kind:')) {
          buildingFilter = id; query = ''; search.value = '';
          activeEntry = null; activePoi = null; focusId = ''; viewLevelId = ''; poiShow = id.slice(5);
          paintChips(); paintResults(); paintDetail(); renderStage();
          status.textContent = poiShow === 'metrobus' ? 'Mostrando las paradas de Metrobús.' : 'Mostrando las entradas y salidas del plantel.';
        } else pickBuilding(id);
      });
      return button;
    };
    chips.replaceChildren(make('', 'Todos'), ...buildings.map((b) => make(b.id, b.shortName || b.name)), ...(poiList.length ? [make('kind:metrobus', 'Metrobús'), make('kind:acceso', 'Accesos')] : []));
  }

  /* --- controles --- */
  const controls = el('div', { className: 'campus-controls', attrs: { role: 'group', 'aria-label': 'Controles del mapa' } });
  [['Rotar a la izquierda', '↺', () => stage3d?.rotateBy(-20)], ['Rotar a la derecha', '↻', () => stage3d?.rotateBy(20)], ['Inclinar hacia arriba', '↑', () => stage3d?.tiltBy(-8)], ['Inclinar hacia abajo', '↓', () => stage3d?.tiltBy(8)], ['Alejar', '−', () => stage3d?.zoomBy(0.8)], ['Acercar', '+', () => stage3d?.zoomBy(1.25)], ['Ver todo el campus', 'Ver campus', reset]].forEach(([label, text, action]) => {
    const button = el('button', { className: 'campus-control', type: 'button', text, attrs: { 'aria-label': label, title: label } });
    button.addEventListener('click', action);
    controls.append(button);
  });

  function onPick(pick) {
    if (pick.type === 'poi' && poiById[pick.id]) choosePoi(poiById[pick.id]);
    else if (pick.type === 'building' && byId[pick.id] && pick.id !== focusId) pickBuilding(pick.id);
    else if (pick.type === 'level' && focusId) { viewLevelId = pick.levelId; activeEntry = activeEntry && activeEntry.level.id === pick.levelId ? activeEntry : null; paintDetail(); renderStage(); }
  }

  search.addEventListener('input', () => { query = search.value; selectedIndex = -1; paintResults(); });
  search.addEventListener('keydown', (event) => {
    const found = filteredEntries().slice(0, 8);
    if (event.key === 'ArrowDown' && found.length) { event.preventDefault(); selectedIndex = (selectedIndex + 1) % found.length; paintResults(); }
    if (event.key === 'ArrowUp' && found.length) { event.preventDefault(); selectedIndex = selectedIndex <= 0 ? found.length - 1 : selectedIndex - 1; paintResults(); }
    if (event.key === 'Enter' && found.length) { event.preventDefault(); choose(found[Math.max(selectedIndex, 0)]); }
    if (event.key === 'Escape') { closeSuggestions(); selectedIndex = -1; }
  });
  search.addEventListener('blur', closeSuggestions);

  const searchPanel = el('div', { className: 'campus-search-panel' }, [
    el('label', { className: 'campus-search-label', attrs: { for: search.id }, text: 'Busca por nombre, número, edificio, tipo, Metrobús o acceso' }),
    el('div', { className: 'campus-search-box' }, [search, suggestions]),
    resultCount,
    chips,
  ]);
  const modelPanel = el('div', { className: 'campus-model-panel' }, [
    el('div', { className: 'campus-model-topline' }, [el('strong', { text: 'Mapa del campus' }), el('span', { className: 'campus-model-help', text: 'Arrastra para mover · rueda o + − para acercar' })]),
    el('div', { className: 'campus-stage-row' }, [stage, legend]),
    controls,
  ]);
  root.append(...[heading, searchPanel, el('div', { className: 'campus-main' }, [modelPanel, detail]), el('p', { className: 'campus-orientation', text: NOTE }), status].filter(Boolean));
  container.replaceChildren(root);

  paintChips(); paintResults(); paintDetail(); paintLegend('campus');
  createStage({
    container: stage,
    layout,
    byId,
    loadIndex: () => fetchCached('../models/index.json', (r) => r.json()).then((d) => d.buildings || d),
    loadModel,
    theme: themeName(),
    onPick,
    onLoading: (busy, msg) => { if (busy) { caption.hidden = false; caption.replaceChildren(el('span', { text: msg || 'Cargando…' })); } },
  }).then((instance) => {
    stage3d = instance;
    if (!instance.supported) {
      caption.hidden = false;
      caption.replaceChildren(el('span', { text: 'Tu navegador no puede mostrar el modelo 3D. Usa la búsqueda y la lista de espacios.' }));
      return;
    }
    caption.hidden = true;
    renderStage();
  }).catch(() => {
    caption.hidden = false;
    caption.replaceChildren(el('span', { text: 'No se pudo iniciar el modelo 3D. Usa la búsqueda y la lista de espacios.' }));
  });
  root.destroy = () => { stage3d?.dispose(); stage3d = null; };
  if (reducedMotion()) root.classList.add('prefers-reduced-motion');
  requestAnimationFrame(() => root.classList.add('is-ready'));
  return root;
}
