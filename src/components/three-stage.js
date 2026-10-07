// Escenario 3D del plantel: renderer, cámara/órbita, picking, etiquetas HTML y apertura de edificios.
// Contrato: docs/modelo-3d.md. Sin innerHTML; los textos se asignan con textContent.
import * as THREE_NS from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { buildEnvironment } from './campus-environment.js';
import { buildBuilding } from './building-model.js';

const DEG = Math.PI / 180;
const NO_OP_API = ['openBuilding', 'closeBuilding', 'setLevel', 'setHighlight', 'focusPoi', 'setPoiActive', 'resetView', 'rotateBy', 'tiltBy', 'zoomBy', 'resize', 'setTheme', 'dispose'];

/* ---------- lógica pura (exportada para pruebas) ---------- */

export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Ajuste del modelo detallado al slot: misma rotación, escala uniforme que iguala el lado mayor.
export function fitToSlot(slot, size, north) {
  if (typeof north === 'number') {
    // El modelo se gira para que el norte de su plano coincida con el norte del campus; la escala iguala el lado mayor.
    const a = (north * Math.PI) / 180;
    const swap = Math.abs(Math.sin(a)) > 0.7;
    const rw = swap ? size.d : size.w;
    const rd = swap ? size.w : size.d;
    const sm = Math.max(slot.w, slot.d);
    const mm = Math.max(rw, rd);
    return { scale: sm > 0 && mm > 0 ? sm / mm : 1, rotY: (slot.rot || 0) + a, x: slot.x, z: slot.z, swap };
  }
  const sm = Math.max(slot.w, slot.d);
  const mm = Math.max(size.w, size.d);
  const scale = sm > 0 && mm > 0 ? sm / mm : 1;
  const lr = Math.log((slot.w || 1) / (slot.d || 1));
  const lm = Math.log((size.w || 1) / (size.d || 1));
  const swap = Math.abs(lr) > 0.12 && Math.abs(lm) > 0.12 && lr > 0 !== lm > 0;
  return { scale, rotY: (slot.rot || 0) + (swap ? Math.PI / 2 : 0), x: slot.x, z: slot.z, swap };
}

// Posición de cámara a distancia `dist` del centro; az=0 mira desde el sur (+Z), el = elevación en rad.
export function framePose(center, dist, az, el) {
  return {
    x: center.x + dist * Math.sin(az) * Math.cos(el),
    y: center.y + dist * Math.sin(el),
    z: center.z + dist * Math.cos(az) * Math.cos(el),
  };
}

// Distancia para que una esfera de radio r quepa en el canvas (fov vertical en rad, aspect = w/h).
export function fitDistance(r, fov, aspect, margin = 1.08) {
  const v = r / Math.sin(fov / 2);
  const h = r / Math.sin(Math.atan(Math.tan(fov / 2) * aspect));
  return Math.max(v, h) * margin;
}

// Distancia mínima (exacta) para que 8 esquinas quepan en pantalla mirando a `center` desde (az, el).
export function fitBoxDistance(corners, center, az, el, fov, aspect, margin = 1.08, inset = null) {
  const dir = { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: Math.cos(az) * Math.cos(el) };
  const right = { x: Math.cos(az), y: 0, z: -Math.sin(az) };
  const up = { x: -Math.sin(az) * Math.sin(el), y: Math.cos(el), z: -Math.cos(az) * Math.sin(el) };
  let tv = Math.tan(fov / 2);
  let th = tv * aspect;
  if (inset && inset.w > 0 && inset.h > 0) { // área libre = canvas menos inset superior y laterales
    tv *= Math.max(0.3, (inset.h - inset.top) / inset.h);
    th *= Math.max(0.3, (inset.w - 2 * inset.side) / inset.w);
  }
  let D = 1;
  for (const c of corners) {
    const q = { x: c.x - center.x, y: c.y - center.y, z: c.z - center.z };
    const dq = q.x * dir.x + q.y * dir.y + q.z * dir.z;
    const x = Math.abs(q.x * right.x + q.z * right.z);
    const y = Math.abs(q.x * up.x + q.y * up.y + q.z * up.z);
    D = Math.max(D, (x * margin) / th + dq, (y * margin) / tv + dq);
  }
  return D;
}

// Azimut que alinea el eje largo (dirección mundo {x,z}) con el eje largo de la pantalla; elige el más cercano a `prefer`.
export function pickAzimuth(long, aspect, prefer = 0.35) {
  const a = aspect >= 1 ? Math.atan2(-long.z, long.x) : Math.atan2(-long.x, -long.z);
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  return Math.abs(wrap(a - prefer)) <= Math.abs(wrap(a + Math.PI - prefer)) ? wrap(a) : wrap(a + Math.PI);
}

// Punto en polígono [[x,z],...] (par-impar).
export function inPoly(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Room que contiene (x,z) local; menor área gana. rooms: [{x,z,w,d,poly?}]
export function roomAt(rooms, x, z) {
  let best = null;
  for (const r of rooms) {
    const ok = r.poly && r.poly.length > 2 ? inPoly(x, z, r.poly) : Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2;
    if (ok && (!best || r.w * r.d < best.w * best.d)) best = r;
  }
  return best;
}

export const KIND_NAME = { salon: 'Salón', laboratorio: 'Laboratorio', oficina: 'Oficina', academia: 'Academia', sanitarios: 'Sanitarios', servicio: 'Servicio', circulacion: 'Circulación', auditorio: 'Auditorio', deportivo: 'Deportivo', otro: 'Espacio' };
const KIND_ICON = {
  salon: 'M4 5h16v10H4z M8 19h8 M12 15v4',
  laboratorio: 'M9 3h6 M10 3v5l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3',
  oficina: 'M4 8h16v11H4z M9 8V5h6v3',
  academia: 'M2 9l10-5 10 5-10 5z M6 11.5V16c3 2.5 9 2.5 12 0v-4.5',
  sanitarios_h: 'M12 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M8.5 10h7v6H14v5h-4v-5H8.5z',
  sanitarios_m: 'M12 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 10l5 8H7z M10.5 18v3h3v-3',
  sanitarios_x: 'M7 3h10v6H7z M6 11h12l-2 8H8z',
  servicio: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  circulacion: 'M4 12h15 M13 6l6 6-6 6',
  auditorio: 'M3 5h18v9H3z M7 19h10',
  deportivo: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3v18',
  otro: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
};
export const iconPath = (kind, g) => (kind === 'sanitarios' ? KIND_ICON[`sanitarios_${g === 'h' || g === 'm' ? g : 'x'}`] : KIND_ICON[kind] || KIND_ICON.otro);

// Nivel cuyo suelo (bases ordenadas ascendente) contiene la altura local y.
export function levelAt(levels, y) {
  let found = levels[0] ? levels[0].id : null;
  for (const l of levels) if (l.base <= y + 0.5) found = l.id;
  return found;
}

// Evita solapes: gana mayor prioridad. items {id,x,y,w,h,pri}; (x,y) = ancla abajo-centro. Devuelve Set de ids visibles.
export function layoutLabels(items, pad = 4, max = Infinity) {
  const shown = new Set();
  const boxes = [];
  for (const it of [...items].sort((a, b) => b.pri - a.pri)) {
    const b = { x0: it.x - it.w / 2 - pad, x1: it.x + it.w / 2 + pad, y0: it.y - it.h - pad, y1: it.y + pad };
    if (boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0)) continue;
    boxes.push(b);
    shown.add(it.id);
    if (shown.size >= max) break;
  }
  return shown;
}

/* ---------- escenario ---------- */

export async function createStage({ THREE, container, layout, byId = {}, loadIndex, loadModel, theme = 'light', onPick, onLoading }) {
  const T = THREE || THREE_NS;
  const notify = (on, msg) => { if (onLoading) onLoading(on, msg); };

  container.classList.add('t3-stage');
  container.dataset.theme = theme;

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!renderer.getContext()) throw new Error('sin contexto');
  } catch (err) {
    const notice = document.createElement('p');
    notice.className = 't3-nowebgl';
    notice.setAttribute('role', 'status');
    notice.textContent = 'Tu navegador o dispositivo no admite gráficos 3D (WebGL). Usa la lista de edificios para explorar el plantel.';
    container.append(notice);
    const stub = { supported: false };
    for (const k of NO_OP_API) stub[k] = () => {};
    return stub;
  }

  const spinner = document.createElement('div');
  spinner.className = 't3-spinner';
  spinner.setAttribute('role', 'status');
  const spinDot = document.createElement('span');
  spinDot.className = 't3-spinner__ring';
  const spinTxt = document.createElement('span');
  spinTxt.className = 't3-spinner__text';
  spinner.append(spinDot, spinTxt);
  spinner.hidden = true;
  const setBusy = (on, msg = 'Cargando…') => { spinner.hidden = !on; spinTxt.textContent = msg; notify(on, msg); };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 't3-canvas';
  const labelLayer = document.createElement('div');
  labelLayer.className = 't3-labels';
  container.append(canvas, labelLayer, spinner);
  if (!container.hasAttribute('tabindex')) container.tabIndex = 0;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, 1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.04; // nunca bajo el suelo
  controls.minPolarAngle = 0.05;
  controls.mouseButtons = { LEFT: T.MOUSE.ROTATE, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.PAN };
  controls.touches = { ONE: T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_PAN };

  const offs = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); offs.push(() => t.removeEventListener(ev, fn, opt)); };

  /* --- entorno --- */
  setBusy(true, 'Preparando el plantel…');
  let index = { buildings: {} };
  try { index = (await loadIndex()) || index; } catch { /* sin índice: proxies por caja del layout */ }
  const env = buildEnvironment({ THREE: T, layout, byId, index: index.buildings || {}, theme });
  scene.add(env.group);
  setBusy(false);

  const gw = env.groundSize ? env.groundSize.w : 800;
  const gd = env.groundSize ? env.groundSize.d : 600;
  const gmax = Math.max(gw, gd);
  camera.far = gmax * 6;
  camera.updateProjectionMatrix();

  // Cielo/niebla/luces de respaldo si el entorno no los aporta.
  const skyColor = (t) => (t === 'dark' ? 0x1d2747 : 0xcfe0e6);
  scene.background = env.background || new T.Color(skyColor(theme));
  scene.fog = env.fog || new T.Fog(skyColor(theme), gmax * 0.9, gmax * 3);
  let hasLight = false;
  env.group.traverse((o) => {
    if (!o.isLight) return;
    hasLight = true;
    if (o.castShadow && o.shadow) o.shadow.mapSize.set(2048, 2048);
  });
  if (!hasLight) {
    scene.add(new T.HemisphereLight(0xffffff, 0x8a8f7a, 1.1));
    const sun = new T.DirectionalLight(0xffe2b0, 2.2);
    sun.position.set(-gmax * 0.4, gmax * 0.35, gmax * 0.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -gw / 2; c.right = gw / 2; c.top = gd / 2; c.bottom = -gd / 2; c.far = gmax * 2;
    scene.add(sun);
  }

  /* --- estado --- */
  const reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(reduceMq && reduceMq.matches);
  if (reduceMq) on(reduceMq, 'change', (e) => { reduced = e.matches; });

  let curTheme = theme;
  let openId = '';
  let built = null;
  let curLevel = null;
  let hl = null; // {levelId, pos:Vector3, label}
  let activePois = new Set();
  let focusedPoi = null;
  let openToken = 0;
  let disposed = false;
  const modelCache = new Map();

  const HOME_EL = 52 * DEG;
  const HOME_AZ = -25 * DEG;
  const fitD = (r) => fitDistance(r, camera.fov * DEG, camera.aspect);
  const homeDistance = () => fitD(Math.hypot(gw, gd) * 0.34);
  let homeDist = homeDistance();
  let limits = { min: 15, max: gmax * 1.6 };
  const applyLimits = () => { controls.minDistance = limits.min; controls.maxDistance = limits.max; };
  applyLimits();

  /* --- bucle bajo demanda --- */
  let raf = 0;
  let dirty = true;
  let camChanged = true;
  let visible = true;
  let tabHidden = document.hidden;
  let flight = null;
  let interacting = false;
  let touched = false;
  let lastEnv = 0;
  let lastNow = performance.now();
  const envAnim = typeof env.update === 'function';

  const canRun = () => !disposed && visible && !tabHidden;
  const request = () => { if (!raf && canRun()) raf = requestAnimationFrame(frame); };
  const invalidate = (cam = false) => { dirty = true; if (cam) camChanged = true; request(); };

  const lookAndSnap = () => { controls.update(); camChanged = true; dirty = true; request(); };

  function flyTo(pos, target, dur = 1.1) {
    if (reduced || dur <= 0) {
      flight = null;
      camera.position.set(pos.x, pos.y, pos.z);
      controls.target.set(target.x, target.y, target.z);
      applyLimits();
      lookAndSnap();
      return;
    }
    flight = {
      p0: camera.position.clone(), t0: controls.target.clone(),
      p1: new T.Vector3(pos.x, pos.y, pos.z), t1: new T.Vector3(target.x, target.y, target.z),
      start: performance.now(), dur: dur * 1000,
    };
    controls.minDistance = 0.5; controls.maxDistance = 1e5; // sin choques con límites durante el vuelo
    request();
  }

  const clampTarget = () => {
    const t = controls.target;
    const cx = Math.min(gw / 2, Math.max(-gw / 2, t.x));
    const cz = Math.min(gd / 2, Math.max(-gd / 2, t.z));
    const cy = Math.min(80, Math.max(0, t.y));
    if (cx !== t.x || cz !== t.z || cy !== t.y) {
      camera.position.add(new T.Vector3(cx - t.x, cy - t.y, cz - t.z));
      t.set(cx, cy, cz);
    }
  };

  function frame(now) {
    raf = 0;
    if (!canRun()) return;
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    let keep = false;

    if (flight) {
      const k = Math.min(1, (now - flight.start) / flight.dur);
      const e = easeInOut(k);
      camera.position.lerpVectors(flight.p0, flight.p1, e);
      controls.target.lerpVectors(flight.t0, flight.t1, e);
      if (k >= 1) { flight = null; applyLimits(); }
      camChanged = dirty = true;
      keep = true;
    }
    if (controls.update()) { camChanged = dirty = true; keep = true; }
    if (envAnim) {
      if (reduced) { if (lastEnv === 0) { env.update(0, 0); lastEnv = 1; dirty = true; } }
      else if (now - lastEnv >= 33) { env.update(Math.min((now - lastEnv) / 1000, 0.1) || dt, now / 1000); lastEnv = now; dirty = true; }
      if (!reduced) keep = true;
    }
    if (dirty) {
      clampTarget();
      if (camChanged) updateLabels();
      if (scene.fog) { const d = camera.position.distanceTo(controls.target); scene.fog.near = d * 1.1; scene.fog.far = d * 4.5; camera.far = Math.max(camera.far, d * 6); camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
      dirty = camChanged = false;
    }
    if (keep || interacting) request();
  }

  on(controls, 'change', () => invalidate(true));
  on(controls, 'start', () => { flight = null; applyLimits(); interacting = touched = true; invalidate(); });
  on(controls, 'end', () => { interacting = false; invalidate(); });

  /* --- visibilidad / tamaño --- */
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) invalidate(true); }, { threshold: 0 })
    : null;
  if (io) io.observe(container);
  on(document, 'visibilitychange', () => { tabHidden = document.hidden; if (!tabHidden) invalidate(true); });

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (typeof goHome === 'function' && !openId && !touched) goHome(0);
    invalidate(true);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);
  else on(window, 'resize', resize);
  resize();

  /* --- etiquetas HTML --- */
  const slotLabels = []; // permanentes (edificios, POIs)
  let dynLabels = []; // del edificio abierto (pisos, destino)
  let roomLabels = []; // espacios del nivel en corte
  let roomLabelsOn = false; // etiquetas flotantes: opcionales (el menú de espacios las reemplaza)
  let roomData = []; // rooms del nivel visible con polígono local
  let openSide = 100;
  let frameDist = 100;
  const tmpV = new T.Vector3();

  function mkLabel(kind, text, pri, show, button) {
    const el = document.createElement(button ? 'button' : 'div');
    if (button) { el.type = 'button'; el.addEventListener('click', button); }
    el.className = `t3-label t3-label--${kind} is-off`;
    el.textContent = text;
    labelLayer.append(el);
    return { el, kind, pri, show, pos: new T.Vector3(), w: 0, h: 0, on: false, key: '' };
  }

  const nameOf = (id) => {
    const b = byId[id];
    const lb = (layout.buildings || []).find((x) => x.id === id);
    return (b && (b.shortName || b.name)) || (lb && lb.name) || id;
  };

  for (const [id, s] of env.slots) {
    const L = mkLabel('building', nameOf(id), 50, (d) => !openId && d > Math.max(s.w, s.d) * 0.9);
    L.pos.set(s.x, (s.h || 10) + 2, s.z);
    L.id = id;
    slotLabels.push(L);
  }
  for (const [id, o] of env.pois) {
    const p = (layout.pois || []).find((x) => x.id === id);
    const L = mkLabel('poi', (p && (p.short || p.name)) || id, 40, (d) => activePois.has(id) || focusedPoi === id || !openId && d < homeDist * 0.55);
    o.getWorldPosition(L.pos);
    L.pos.y += 4;
    L.pri = 40;
    L.poiId = id;
    slotLabels.push(L);
  }
  const poiLabelPri = () => { for (const L of slotLabels) if (L.poiId) L.pri = activePois.has(L.poiId) || focusedPoi === L.poiId ? 70 : 40; };

  function updateLabels() {
    const W = canvas.clientWidth || container.clientWidth;
    const H = canvas.clientHeight || container.clientHeight;
    const items = [];
    const all = slotLabels.concat(dynLabels, roomLabels);
    for (const L of all) {
      L.ok = false;
      const d = camera.position.distanceTo(L.pos);
      if (!L.show(d)) continue;
      if (L.kind === 'space' && !L.numeric) {
        const near = d < frameDist * 0.5;
        if (near !== !!L.near) { L.near = near; L.el.classList.toggle('t3-room--wide', near); L.w = 0; }
      }
      tmpV.copy(L.pos).project(camera);
      if (tmpV.z > 1 || tmpV.z < -1) continue;
      const x = (tmpV.x * 0.5 + 0.5) * W;
      const y = (-tmpV.y * 0.5 + 0.5) * H;
      if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      const m = 6;
      L.x = Math.min(W - L.w / 2 - m, Math.max(L.w / 2 + m, x));
      L.y = Math.min(H - m, Math.max(L.h + m, y));
      L.ok = true;
      items.push({ id: L, x: L.x, y: L.y, w: L.w, h: L.h, pri: L.pri });
    }
    const shown = layoutLabels(items, 4, 60);
    for (const L of all) {
      const on_ = L.ok && shown.has(L);
      if (on_ !== L.on) { L.on = on_; L.el.classList.toggle('is-off', !on_); }
      if (on_) {
        const key = `${Math.round(L.x)},${Math.round(L.y)}`;
        if (key !== L.key) { L.key = key; L.el.style.transform = `translate(${Math.round(L.x)}px,${Math.round(L.y)}px) translate(-50%,-100%)`; }
      }
    }
  }
  const dropLabels = (list) => { for (const L of list) L.el.remove(); list.length = 0; };

  /* --- espacios (rooms) del nivel en corte --- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const tip = document.createElement('div');
  tip.className = 't3-tip is-off';
  tip.setAttribute('role', 'tooltip');
  const tipName = document.createElement('strong');
  const tipKind = document.createElement('span');
  tip.append(tipName, tipKind);
  labelLayer.append(tip);
  const showTip = (r, x, y) => {
    if (!r) { tip.classList.add('is-off'); return; }
    tipName.textContent = r.text || KIND_NAME[r.kind] || 'Espacio';
    tipKind.textContent = KIND_NAME[r.kind] || 'Espacio';
    const W = container.clientWidth;
    tip.style.transform = `translate(${Math.round(Math.min(W - 150, Math.max(4, x + 12)))}px,${Math.round(Math.max(4, y - 44))}px)`;
    tip.classList.remove('is-off');
  };
  const roomInfo = (r, levelId) => ({ type: 'room', id: r.id, levelId, text: r.text || '', kind: r.kind });
  let hoverRoomId = null;
  const setRoomHover = (id) => {
    if (id === hoverRoomId) return;
    hoverRoomId = id;
    if (built && built.setRoomHover) built.setRoomHover(id);
    invalidate();
  };

  function mkRoomLabel(r, levelId) {
    const el = document.createElement('button');
    el.type = 'button';
    const k = r.kind || 'otro';
    el.className = `t3-label t3-room t3-room--${k}${r.kind === 'sanitarios' ? ` t3-room--g-${r.g === 'h' || r.g === 'm' ? r.g : 'x'}` : ''}${r.numeric ? ' t3-room--num' : ''} is-off`;
    if (!r.numeric) {
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 't3-room__icon');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', iconPath(k, r.g));
      svg.append(path);
      el.append(svg);
    }
    const t = document.createElement('span');
    t.className = 't3-room__text';
    t.textContent = r.text || (k === 'sanitarios' ? 'WC' : KIND_NAME[k] || '');
    el.append(t);
    el.setAttribute('aria-label', `${r.text || KIND_NAME[k] || 'Espacio'}, ${KIND_NAME[k] || 'espacio'}`);
    el.addEventListener('click', () => { if (onPick) onPick(roomInfo(r, levelId)); });
    el.addEventListener('pointerenter', () => { setRoomHover(r.id); const b = el.getBoundingClientRect(); const c = container.getBoundingClientRect(); showTip(r, b.left - c.left + b.width / 2, b.top - c.top); });
    el.addEventListener('pointerleave', () => { setRoomHover(null); showTip(null); });
    labelLayer.append(el);
    const area = (r.w || 0) * (r.d || 0);
    const pri = r.kind === 'sanitarios' ? 60 : r.numeric ? 20 : 40 + Math.min(9, area / 50);
    const show = (d) => {
      if (hl && hl.roomId === r.id) return false;
      if (hoverRoomId === r.id) return true;
      if (!roomLabelsOn) return false;
      if (r.numeric) return d < frameDist * 0.3;
      if (r.kind === 'sanitarios') return true;
      return d < frameDist * 0.5 || area >= 80;
    };
    return { el, kind: 'space', numeric: !!r.numeric, pri, show, pos: new T.Vector3(), w: 0, h: 0, on: false, key: '' };
  }

  function buildRoomLabels() {
    dropLabels(roomLabels);
    roomData = [];
    if (!built || !curLevel || !built.roomsOf) return;
    const list = built.roomsOf(curLevel) || [];
    const bb = built.model.bbox || [0, 0, 0, 0];
    const cx = (bb[0] + bb[2]) / 2;
    const cy = (bb[1] + bb[3]) / 2;
    const lv = (built.model.levels || []).find((l) => l.id === curLevel);
    const polys = new Map(((lv && lv.rooms) || []).map((m) => [m.id, m.poly]));
    for (const r of list) {
      const poly = polys.get(r.id);
      roomData.push({ ...r, poly: poly ? poly.map(([x, y]) => [x - cx, y - cy]) : null });
      if (r.kind === 'circulacion' || (r.kind === 'otro' && !r.text)) continue; // pasillos y recintos sin nombre: sin etiqueta
      const L = mkRoomLabel(r, curLevel);
      L.pos.copy(built.group.localToWorld(new T.Vector3(r.x, r.y + 0.3, r.z)));
      roomLabels.push(L);
    }
  }

  /* --- picking y hover --- */
  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  const hoverBox = new T.Box3Helper(new T.Box3(), 0xf5cc54);
  hoverBox.visible = false;
  hoverBox.userData.noPick = true;
  scene.add(hoverBox);
  let hoverPlane = null;
  let hoverKey = '';

  function collect(o, ref, list, own) {
    if (!o.visible || o.userData.noPick) return;
    if ((o.isMesh || o.isSprite) && o.material && o.material.visible !== false) { list.push(o); own.set(o, ref); }
    for (const c of o.children) collect(c, ref, list, own);
  }

  function pickAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const list = [];
    const own = new Map();
    env.proxies.forEach((o, id) => { if (id !== openId) collect(o, { info: { type: 'building', id }, root: o }, list, own); });
    env.pois.forEach((o, id) => collect(o, { info: { type: 'poi', id }, root: o }, list, own));
    if (built) collect(built.group, { info: { type: 'level' }, root: built.group }, list, own);
    const hits = raycaster.intersectObjects(list, false);
    if (!hits.length) return null;
    const h = hits[0];
    const ref = own.get(h.object);
    if (ref.info.type === 'level') {
      const y = built.group.worldToLocal(h.point.clone()).y;
      const levelId = curLevel || levelAt(levelBases(), y);
      if (curLevel && roomData.length) {
        const lp = built.group.worldToLocal(h.point.clone());
        const r = roomAt(roomData, lp.x, lp.z);
        if (r) return { info: roomInfo(r, levelId), root: null };
      }
      return { info: { type: 'level', levelId }, root: null };
    }
    return { info: ref.info, root: ref.root };
  }

  const levelBases = () => (built ? built.model.levels.map((l) => ({ id: l.id, base: built.levelBase(l.id) })).sort((a, b) => a.base - b.base) : []);

  function setHover(hit) {
    const key = hit ? `${hit.info.type}:${hit.info.id || ''}:${hit.info.levelId || ''}` : '';
    if (key === hoverKey) return;
    hoverKey = key;
    const isRoom = !!(hit && hit.info.type === 'room');
    setRoomHover(isRoom ? hit.info.id : null);
    showTip(isRoom ? hit.info : null, lastPtr.x, lastPtr.y);
    canvas.style.cursor = hit ? 'pointer' : '';
    hoverBox.visible = !!(hit && hit.root);
    if (hit && hit.root) { hoverBox.box.setFromObject(hit.root); }
    if (hoverPlane) {
      hoverPlane.visible = !!(hit && hit.info.type === 'level' && !curLevel);
      if (hoverPlane.visible) hoverPlane.position.y = built.levelBase(hit.info.levelId) + 0.08;
    }
    invalidate();
  }

  let down = null;
  const ptrs = new Set();
  let lastMove = 0;
  const lastPtr = { x: 0, y: 0 };
  on(canvas, 'pointerdown', (e) => {
    ptrs.add(e.pointerId);
    down = ptrs.size === 1 && e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    setHover(null);
  });
  on(canvas, 'pointerup', (e) => {
    ptrs.delete(e.pointerId);
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    const hit = pickAt(e.clientX, e.clientY);
    if (hit && onPick) onPick(hit.info);
  });
  on(canvas, 'pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; });
  on(canvas, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now();
    if (now - lastMove < 70) return;
    lastMove = now;
    const cr = container.getBoundingClientRect();
    lastPtr.x = e.clientX - cr.left;
    lastPtr.y = e.clientY - cr.top;
    setHover(pickAt(e.clientX, e.clientY));
  });
  on(canvas, 'pointerleave', () => setHover(null));

  /* --- teclado --- */
  on(container, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (e.target !== container && e.target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
    if (k === 'ArrowLeft') api.rotateBy(-12);
    else if (k === 'ArrowRight') api.rotateBy(12);
    else if (k === 'ArrowUp') api.tiltBy(6);
    else if (k === 'ArrowDown') api.tiltBy(-6);
    else if (k === '+' || k === '=') api.zoomBy(1.25);
    else if (k === '-' || k === '_') api.zoomBy(0.8);
    else if (k === '0') api.resetView();
    else return;
    e.preventDefault();
  });

  /* --- cámara: utilidades --- */
  const spherical = new T.Spherical();
  const offset = new T.Vector3();
  const curAz = () => Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);

  function goHome(dur) {
    homeDist = homeDistance();
    const p = framePose({ x: 0, y: 0, z: 0 }, homeDist, HOME_AZ, HOME_EL);
    limits = { min: 15, max: Math.max(gmax * 1.6, homeDist * 1.3) };
    flyTo(p, { x: 0, y: 0, z: 0 }, dur);
  }

  function orbitBy(dTheta, dPhi, factor, dur = 0.25) {
    offset.copy(camera.position).sub(controls.target);
    spherical.setFromVector3(offset);
    spherical.theta += dTheta;
    spherical.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, spherical.phi + dPhi));
    spherical.radius = Math.min(limits.max, Math.max(limits.min, spherical.radius / factor));
    offset.setFromSpherical(spherical);
    const target = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    flyTo({ x: target.x + offset.x, y: target.y + offset.y, z: target.z + offset.z }, target, dur);
  }

  /* --- edificios --- */
  const getModel = (id) => {
    if (!modelCache.has(id)) modelCache.set(id, Promise.resolve().then(() => loadModel(id)).catch((err) => { modelCache.delete(id); throw err; }));
    return modelCache.get(id);
  };

  function levelName(id) {
    const b = byId[openId];
    const l = b && (b.levels || []).find((x) => x.id === id);
    return (l && l.label) || id.toUpperCase();
  }

  function buildLevelLabels() {
    dropLabels(dynLabels);
    const { size, model } = built;
    for (const lv of model.levels) {
      const L = mkLabel('level', levelName(lv.id), 80, () => curLevel === null ? !hl : lv.id === curLevel,
        () => { if (onPick) onPick({ type: 'level', levelId: lv.id }); });
      L.levelId = lv.id;
      L.pos.copy(built.group.localToWorld(new T.Vector3(size.w / 2, built.levelBase(lv.id) + 1.6, size.d / 2)));
      dynLabels.push(L);
    }
  }
  const refreshLevelLabels = () => { for (const L of dynLabels) if (L.levelId) L.el.classList.toggle('is-active', L.levelId === curLevel); };

  function clearBuilt() {
    dropLabels(dynLabels);
    dropLabels(roomLabels);
    roomData = [];
    hoverRoomId = null;
    showTip(null);
    hl = null;
    if (hoverPlane) { hoverPlane.geometry.dispose(); hoverPlane.material.dispose(); hoverPlane = null; }
    if (built) { scene.remove(built.group); built.dispose(); built = null; }
    const px = env.proxies.get(openId);
    if (px) px.visible = true;
    curLevel = null;
    hoverKey = '';
    hoverBox.visible = false;
  }

  // Encuadre de la caja del edificio (o de un nivel) con eje largo alineado a la pantalla.
  function frameBox(levelId) {
    const { size } = built;
    const hw = size.w / 2;
    const hd = size.d / 2;
    let y0 = 0;
    let y1 = size.h;
    if (levelId) {
      const lv = built.model.levels.find((l) => l.id === levelId);
      y0 = built.levelBase(levelId);
      y1 = y0 + ((lv && lv.h) || 3.4);
    }
    const corners = [];
    for (const x of [-hw, hw]) for (const y of [y0, y1]) for (const z of [-hd, hd]) corners.push(built.group.localToWorld(new T.Vector3(x, y, z)));
    const center = new T.Vector3();
    corners.forEach((c) => center.add(c));
    center.multiplyScalar(1 / corners.length);
    const o = built.group.localToWorld(new T.Vector3(0, 0, 0));
    const ax = built.group.localToWorld(size.w >= size.d ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1)).sub(o);
    const az = pickAzimuth({ x: ax.x, z: ax.z }, camera.aspect);
    const el = (levelId ? 62 : 50) * DEG;
    const cw = canvas.clientWidth || container.clientWidth;
    const ch = canvas.clientHeight || container.clientHeight;
    const inset = { top: 52, side: 8, w: cw, h: ch };
    const dist = fitBoxDistance(corners, center, az, el, camera.fov * DEG, camera.aspect, 1.08, inset);
    // el centro del edificio debe quedar en el centro del área libre: se desplaza el objetivo hacia arriba
    const shift = (inset.top / ch) * Math.tan((camera.fov * DEG) / 2) * dist;
    const upv = { x: -Math.sin(az) * Math.sin(el), y: Math.cos(el), z: -Math.cos(az) * Math.sin(el) };
    center.set(center.x + upv.x * shift, center.y + upv.y * shift, center.z + upv.z * shift);
    limits = { min: openSide * 0.12, max: Math.max(openSide * 3.2, dist * 1.5) };
    if (levelId) frameDist = dist;
    return { pos: framePose(center, dist, az, el), target: { x: center.x, y: center.y, z: center.z } };
  }

  const api = {
    supported: true,

    async openBuilding(id, opts = {}) {
      const token = ++openToken;
      const slot = env.slots.get(id);
      if (!slot || disposed) return false;
      if (openId === id && built) {
        if (!opts.highlight) api.setHighlight(null, null, null);
        if (opts.levelId !== undefined) api.setLevel(opts.levelId);
        if (opts.highlight) api.setHighlight(opts.highlight.levelId, opts.highlight.rect, opts.highlight.label, opts.highlight.roomId);
        return true;
      }
      setBusy(true, 'Cargando edificio…');
      let model;
      try { model = await getModel(id); } catch { model = null; }
      if (token !== openToken || disposed) return false;
      setBusy(false);
      if (!model) { notify(false, 'No se pudo cargar el modelo.'); return false; }

      if (built) clearBuilt();
      openId = id;
      const b = buildBuilding({ THREE: T, model, theme: curTheme });
      b.model = model;
      const fit = fitToSlot(slot, b.size, model.north);
      b.group.rotation.y = fit.rotY;
      b.group.scale.setScalar(fit.scale);
      b.group.position.set(fit.x, 0, fit.z);
      scene.add(b.group);
      b.group.updateMatrixWorld(true);
      built = b;
      const px = env.proxies.get(id);
      if (px) px.visible = false;
      env.setOpen(id);

      hoverPlane = new T.Mesh(new T.PlaneGeometry(b.size.w, b.size.d), new T.MeshBasicMaterial({ color: 0xf5cc54, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
      hoverPlane.rotation.x = -Math.PI / 2;
      hoverPlane.visible = false;
      hoverPlane.userData.noPick = true;
      b.group.add(hoverPlane);

      buildLevelLabels();
      curLevel = null;
      const side = Math.max(slot.w, slot.d);
      openSide = side;
      limits = { min: side * 0.12, max: side * 3.2 };
      const fr = frameBox(null);
      flyTo(fr.pos, fr.target, 1.2);
      if (opts.levelId !== undefined) api.setLevel(opts.levelId);
      refreshLevelLabels();
      if (opts.highlight) api.setHighlight(opts.highlight.levelId, opts.highlight.rect, opts.highlight.label, opts.highlight.roomId);
      invalidate(true);
      return true;
    },

    closeBuilding() {
      openToken++;
      setBusy(false);
      if (!openId) return;
      clearBuilt();
      env.setOpen('');
      openId = '';
      goHome(1.0);
      invalidate(true);
    },

    setLevel(levelId) {
      if (hl && hl.levelId !== levelId) api.setHighlight(null, null, null);
      if (!built) return;
      curLevel = levelId || null;
      built.setLevel(curLevel);
      refreshLevelLabels();
      buildRoomLabels();
      if (!hl) { const fr = frameBox(curLevel); flyTo(fr.pos, fr.target, 0.8); }
      invalidate(true);
    },

    setHighlight(levelId, rect, label, roomId) {
      if (!built) return;
      dynLabels = dynLabels.filter((L) => { if (L.kind === 'room') { L.el.remove(); return false; } return true; });
      hl = null;
      const p = rect || roomId ? built.highlight(levelId, rect || null, label, roomId) : (built.highlight(levelId, null, label), null);
      if (p) {
        const pos = built.group.localToWorld(new T.Vector3(p.x, p.y, p.z));
        hl = { levelId, pos, label, roomId: roomId || null };
        if (label) {
          const L = mkLabel('room', label, 100, () => true);
          L.pos.copy(pos).y += 2.2;
          dynLabels.push(L);
        }
        const rr = roomId && built.roomsOf ? (built.roomsOf(levelId) || []).find((x) => x.id === roomId) : null;
        const rs = (rect ? Math.max(rect.w || 0, rect.h || 0) : rr ? Math.max(rr.w, rr.d) : 0) * built.group.scale.x;
        const d = Math.max(18, 5 * rs);
        flyTo(framePose(pos, d, curAz(), 58 * DEG), pos, 1.0);
      }
      invalidate(true);
    },

    getRooms() {
      if (!built || !curLevel || !built.roomsOf) return [];
      return (built.roomsOf(curLevel) || []).filter((r) => r.kind === 'sanitarios' || (r.text && r.kind !== 'circulacion')).map((r) => ({ id: r.id, text: r.text, kind: r.kind, g: r.g, area: Math.round(r.area || 0), numeric: !!r.numeric }));
    },

    hoverRoom(id) { setRoomHover(id || null); invalidate(true); },

    focusRoom(id) {
      if (!built || !curLevel || !built.roomsOf) return;
      const r = (built.roomsOf(curLevel) || []).find((x) => x.id === id);
      if (r) api.setHighlight(curLevel, null, r.text || KIND_NAME[r.kind] || 'Espacio', id);
    },

    setRoomLabels(on) { roomLabelsOn = !!on; invalidate(true); },

    focusPoi(id) {
      focusedPoi = id || null;
      poiLabelPri();
      const o = id && env.pois.get(id);
      if (o && !openId) {
        const c = new T.Vector3();
        o.getWorldPosition(c);
        limits = { min: 15, max: Math.max(gmax * 1.6, homeDist * 1.3) };
        flyTo(framePose(c, 90, curAz(), 45 * DEG), c, 1.0);
      } else if (!id && !openId) goHome(1.0);
      invalidate(true);
    },

    setPoiActive(ids) {
      activePois = new Set(ids || []);
      env.setPoiActive([...activePois]);
      poiLabelPri();
      invalidate(true);
    },

    resetView() {
      if (openId) api.closeBuilding();
      else goHome(1.0);
    },
    rotateBy(deg) { orbitBy(deg * DEG, 0, 1); },
    tiltBy(deg) { orbitBy(0, -deg * DEG, 1); },
    zoomBy(f) { orbitBy(0, 0, f); },
    resize,

    setTheme(t) {
      curTheme = t;
      container.dataset.theme = t;
      env.setTheme(t);
      if (built) built.setTheme(t);
      if (!env.background) scene.background = new T.Color(skyColor(t));
      if (!env.fog) scene.fog.color.setHex(skyColor(t));
      invalidate(true);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      openToken++;
      if (raf) cancelAnimationFrame(raf);
      offs.forEach((f) => f());
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      controls.dispose();
      clearBuilt();
      dropLabels(slotLabels);
      env.dispose();
      hoverBox.geometry.dispose();
      hoverBox.material.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      labelLayer.remove();
      spinner.remove();
      modelCache.clear();
    },
  };

  const curElev = () => {
    offset.copy(camera.position).sub(controls.target);
    return Math.PI / 2 - spherical.setFromVector3(offset).phi;
  };

  goHome(0);
  resize();
  return api;
}
