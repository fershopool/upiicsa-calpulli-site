// Entorno 3D del campus: suelo, vegetación, calles, canchas, árboles, jacarandas, proxies y POIs.
// Contrato: web/docs/modelo-3d.md. Recibe THREE por parámetro; sin imports, sin recursos externos.

const S = 0.56; // metros por px del plano
const DEG = Math.PI / 180;
const MAX_TREES = 450;
const MAX_PETALS = 1500;
const MAX_JAC = 90;

const THEMES = {
  light: {
    sky: ['#f8ead0', '#d6e3ec', '#92bbe0'], fog: '#f1e5cd',
    hemi: ['#d7e6f4', '#b9a98d', 0.8], sun: ['#ffd9a8', 2.1], az: -38,
    tint: [1, 1, 1], windows: 0, void: '#ffffff',
  },
  dark: {
    sky: ['#cf8f86', '#56649a', '#1b2551'], fog: '#59628f',
    hemi: ['#7f8fc8', '#2b2a3b', 0.85], sun: ['#ffa57a', 1.35], az: -62,
    tint: [0.8, 0.86, 1], windows: 1, void: '#7a80a8',
  },
};

// ---------- utilidades ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function buildEnvironment({ THREE, layout, byId = {}, index = {}, theme = 'light' }) {
  index = index || {};
  byId = byId || {};
  const plan = layout.plan || { w: 1369, h: 897 };
  const PW = num(plan.w, 1369), PH = num(plan.h, 897);
  const X = (x) => (x - PW / 2) * S;
  const Z = (y) => (y - PH / 2) * S;
  const group = new THREE.Group();
  group.name = 'campus-environment';
  const groundSize = { w: PW * S, d: PH * S };

  const geos = [], mats = [], texs = [];
  const G = (g) => { geos.push(g); return g; };
  const registry = []; // materiales con tinte de tema
  const winMats = [];
  const M = (m, tint = true) => {
    mats.push(m);
    if (tint && m.color) registry.push({ m, base: m.color.clone() });
    return m;
  };

  function canvasTex(w, h, draw, repeat = false) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texs.push(t);
    return t;
  }
  const rngT = mulberry32(77);

  // ---------- materiales de decales (capas sobre el suelo) ----------
  const layerY = (l) => 0.03 * l;
  function decal(color, layer, extra = {}) {
    return M(new THREE.MeshStandardMaterial({
      color, roughness: 0.95, metalness: 0, polygonOffset: true,
      polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 2, ...extra,
    }));
  }
  function mesh(geo, mat, name, { cast = false, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }

  // Plano horizontal (hacia arriba) con uv en metros / period (repite) o 0..1 (period = 0).
  function quad(cx, cz, w, d, y, period = 0, seg = 1, relief = 0) {
    const g = G(new THREE.PlaneGeometry(w, d, seg, seg));
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getZ(i);
      if (relief) {
        const e = Math.min(w / 2 - Math.abs(lx), d / 2 - Math.abs(lz));
        const f = smooth(0, 7, e);
        p.setY(i, relief * f * (0.5 + 0.5 * Math.sin((cx + lx) * 0.09) * Math.cos((cz + lz) * 0.11)));
      }
      if (period) uv.setXY(i, (cx + lx) / period, (cz + lz) / period);
    }
    if (relief) g.computeVertexNormals();
    g.translate(cx, y, cz);
    return g;
  }

  // Cinta a lo largo de una polilínea [[X,Z]...]; uv.u = longitud/period, uv.v = 0..1
  function ribbon(pts, width, y, { period = 0, offset = 0 } = {}) {
    const n = pts.length, pos = [], uvs = [], idx = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz, nz = tx;
      // inglete limitado
      let k = 1;
      if (i > 0 && i < n - 1) {
        const s0x = pts[i][0] - pts[i - 1][0], s0z = pts[i][1] - pts[i - 1][1];
        const sl = Math.hypot(s0x, s0z) || 1;
        k = 1 / Math.max(0.55, nx * (-s0z / sl) + nz * (s0x / sl));
      }
      if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const hw = (width / 2) * k, c = offset * k;
      const u = period ? acc / period : acc;
      pos.push(pts[i][0] + nx * (c + hw), y, pts[i][1] + nz * (c + hw), pts[i][0] + nx * (c - hw), y, pts[i][1] + nz * (c - hw));
      uvs.push(u, 1, u, 0);
    }
    for (let i = 0; i < n - 1; i++) {
      const L0 = i * 2, R0 = L0 + 1, L1 = L0 + 2, R1 = L0 + 3;
      idx.push(L0, L1, R0, R0, L1, R1);
    }
    const g = G(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }
  const toM = (pts) => pts.map(([x, y]) => [X(x), Z(y)]);

  // ---------- cielo, niebla, luces ----------
  const fog = new THREE.Fog(0xf1e3c9, 550, 1500);
  const background = new THREE.Color(0xf1e3c9);
  const skyGeo = G(new THREE.SphereGeometry(1900, 24, 16));
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const skyMat = M(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }), false);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky'; sky.renderOrder = -1000; sky.frustumCulled = false;
  group.add(sky);

  const hemi = new THREE.HemisphereLight(0xd7e6f4, 0xb9a98d, 1.05);
  const sun = new THREE.DirectionalLight(0xffd7a1, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  sun.shadow.radius = 5;
  sun.target.position.set(0, 0, 0);
  group.add(hemi, sun, sun.target);
  const sunState = { az: -38, el: 35, cx: 0, cz: 0, r: Math.hypot(groundSize.w, groundSize.d) * 0.5 };
  function aimSun() {
    const a = sunState.az * DEG, e = sunState.el * DEG, dist = 900;
    sun.position.set(sunState.cx + Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, sunState.cz + Math.cos(a) * Math.cos(e) * dist);
    sun.target.position.set(sunState.cx, 0, sunState.cz);
    const c = sun.shadow.camera, r = sunState.r;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 50; c.far = 2200;
    c.updateProjectionMatrix();
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  }
  // Recentra la sombra sobre una zona (p. ej. el edificio abierto) para más definición.
  function focusShadow(x = 0, z = 0, radius = 0) {
    sunState.cx = num(x); sunState.cz = num(z);
    sunState.r = radius > 0 ? radius : Math.hypot(groundSize.w, groundSize.d) * 0.5;
    aimSun();
  }

  // ---------- suelo, plataforma y vacío ----------
  const stoneSide = decal('#a99f8b', 0);
  const plateTop = decal('#d8cdb8', 0);
  const groundTop = decal('#c8c0ad', 0);
  const groundSideM = decal('#8f8672', 0);
  const voidMat = decal('#cfc8b6', 0);
  const toShape = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(X(x), -Z(y))));
  function slab(pts, depth, top, side, yTop, name) {
    const g = G(new THREE.ExtrudeGeometry(toShape(pts), { depth, bevelEnabled: false, curveSegments: 1 }));
    g.rotateX(-Math.PI / 2);
    g.translate(0, yTop - depth, 0);
    return mesh(g, [top, side], name);
  }
  voidMat.map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b4b5aa'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      g.fillStyle = rngT() > 0.5 ? 'rgba(189,185,173,0.32)' : 'rgba(169,173,163,0.32)';
      g.beginPath(); g.ellipse(rngT() * w, rngT() * h, 4 + rngT() * 26, 3 + rngT() * 18, rngT() * 3, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(120,124,116,0.07)'; // calles: tono sobre tono
    g.fillRect(0, 0, w, 9); g.fillRect(0, h - 9, w, 9); g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
  }, true);
  if (voidMat.map) voidMat.map.repeat.set(1 / 64, 1 / 64);
  const radial = (stops) => canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, c] of stops) r.addColorStop(o, c); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const hazeMat = M(new THREE.MeshBasicMaterial({ color: 0xf1e5cd, map: radial([[0, 'rgba(255,255,255,0)'], [0.3, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0.95)']]), transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), false);
  const haloMat = M(new THREE.MeshBasicMaterial({ color: 0xfff3d8, map: radial([[0, 'rgba(255,255,255,0.4)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), false);
  const haze = mesh(G(new THREE.CircleGeometry(2300, 48).rotateX(-Math.PI / 2).translate(0, -0.11, 0)), hazeMat, 'bruma', { receive: false });
  const halo = mesh(G(new THREE.CircleGeometry(Math.max(groundSize.w, groundSize.d) * 0.62, 48).rotateX(-Math.PI / 2).translate(0, -0.105, 0)), haloMat, 'halo-campus', { receive: false });
  haze.renderOrder = 1; halo.renderOrder = 0;
  group.add(haze, halo);
  const voidPlane = mesh(quad(0, 0, 6000, 6000, -0.12, 1), voidMat, 'suelo-urbano');
  group.add(voidPlane);
  if (layout.ground) group.add(slab(layout.ground, 2.4, groundTop, groundSideM, -0.06, 'terreno'));
  if (layout.plate) {
    group.add(slab(layout.plate, 1.9, plateTop, stoneSide, 0, 'plataforma'));
    const rim = toM([...layout.plate, layout.plate[0]]);
    const rimM = decal('#efe8da', 2);
    group.add(mesh(ribbon(rim, 1.6, layerY(2)), rimM, 'borde-plataforma'));
    const shM = decal('#000000', 1, { transparent: true, depthWrite: false, map: canvasTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(40,30,20,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), opacity: 0.5 });
    if (!shM.map) shM.opacity = 0.12;
    group.add(mesh(ribbon(rim, 12, layerY(1) - 0.005), shM, 'sombra-contacto', { receive: false }));
  }

  // ---------- texturas procedurales ----------
  const stripeTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#6aa150'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#659c4c'; g.fillRect(0, 0, w / 2, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = rngT() > 0.5 ? 'rgba(120,170,80,0.12)' : 'rgba(60,110,50,0.12)'; g.fillRect(rngT() * w, rngT() * h, 6 + rngT() * 14, 6 + rngT() * 14); }
  }, true);
  const mottleTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4f8442'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rngT() > 0.5 ? 'rgba(102,150,72,0.35)' : 'rgba(54,98,52,0.35)';
      g.beginPath(); g.arc(rngT() * w, rngT() * h, 4 + rngT() * 14, 0, 7); g.fill();
    }
  }, true);
  const paveTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e6dcc8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,146,120,0.45)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, true);
  const dashTex = canvasTex(64, 8, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#f2dc78'; g.fillRect(0, 0, w * 0.55, h);
  }, true);
  const stallTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#3f4348'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(245,245,240,0.85)';
    g.fillRect(0, 0, 3, 80); g.fillRect(0, h - 80, 3, 80);
    g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2);
  }, true);
  const railTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#2b2e33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4b5057'; g.fillRect(8, 12, 48, 14);
    g.fillStyle = '#3a3e44'; g.fillRect(8, 12, 48, 3);
  }, true);
  const pitchTex = canvasTex(1024, 480, (g, w, h) => {
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#5f9a4a' : '#69a652'; g.fillRect((i * w) / 12, 0, w / 12 + 1, h); }
    g.strokeStyle = '#f4f1e6'; g.lineWidth = 6;
    const m = 24; g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    g.beginPath(); g.moveTo(w / 2, m); g.lineTo(w / 2, h - m); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 62, 0, 7); g.stroke();
    for (const s of [0, 1]) {
      const x0 = s ? w - m : m, dir = s ? -1 : 1;
      g.strokeRect(s ? x0 - 150 : x0, h / 2 - 140, 150, 280);
      g.strokeRect(s ? x0 - 56 : x0, h / 2 - 70, 56, 140);
    }
  });
  const trackTex = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#b9553c'; g.fillRect(0, 0, w, h);
    const oval = (inset, c) => {
      g.fillStyle = c; const r = (h - 2 * inset) / 2;
      g.beginPath(); g.moveTo(inset + r, inset); g.lineTo(w - inset - r, inset);
      g.arc(w - inset - r, h / 2, r, -Math.PI / 2, Math.PI / 2); g.lineTo(inset + r, h - inset);
      g.arc(inset + r, h / 2, r, Math.PI / 2, Math.PI * 1.5); g.fill();
    };
    oval(6, '#c8664a'); oval(70, '#69a652');
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
    g.strokeRect(150, 120, 212, 144);
  });
  const facadeTex = canvasTex(256, 214, (g, w, h) => {
    g.fillStyle = '#e9e2d3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4c9b3'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.fillStyle = '#bfb39b'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#5d554a'; g.fillRect(26, 48, w - 52, 112);
    const grd = g.createLinearGradient(0, 52, 0, 156);
    grd.addColorStop(0, '#3f7f7b'); grd.addColorStop(1, '#2f6b66');
    g.fillStyle = grd; g.fillRect(30, 52, w - 60, 104);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(30, 52, w - 60, 18);
    g.fillStyle = '#e9e2d3'; g.fillRect(w / 2 - 3, 52, 6, 104); g.fillRect(30, 102, w - 60, 4);
  }, true);
  const facadeEmi = canvasTex(256, 214, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8a95e'; g.fillRect(30, 52, w - 60, 104);
    g.fillStyle = '#000'; g.fillRect(w / 2 - 3, 52, 6, 104); g.fillRect(30, 102, w - 60, 4);
  }, true);
  const carpetTex = canvasTex(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, 'rgba(165,130,215,0.85)'); r.addColorStop(0.75, 'rgba(165,130,215,0.5)'); r.addColorStop(1, 'rgba(160,130,205,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const a = rngT() * 6.28, d = Math.sqrt(rngT()) * 58;
      g.fillStyle = rngT() > 0.5 ? 'rgba(183,155,224,0.9)' : 'rgba(142,107,191,0.85)';
      g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2.4, 1.4, rngT() * 3, 0, 7); g.fill();
    }
  });
  const glyphM = canvasTex(256, 256, (g) => {
    g.fillStyle = '#cc3a42'; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('M', 128, 138);
  });
  const glyphA = canvasTex(256, 256, (g) => {
    g.fillStyle = '#1f9c6c'; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.stroke();
    g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const y = 128 + s * 30, x0 = 128 - s * 56, x1 = 128 + s * 56;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.moveTo(x1 - s * 22, y - 20); g.lineTo(x1, y); g.lineTo(x1 - s * 22, y + 20); g.stroke();
    }
  });
  const rep = (t, rx, ry) => { if (t) { t.repeat.set(rx, ry); } return t; };

  // ---------- áreas verdes, canchas, estacionamientos ----------
  const rects = [];
  const lawnM = decal('#ffffff', 1, { map: rep(stripeTex, 1 / 8, 1 / 8) });
  const denseM = decal('#ffffff', 1, { map: rep(mottleTex, 1 / 32, 1 / 32) });
  const plazaM = decal('#ffffff', 1, { map: rep(paveTex, 1 / 3, 1 / 3) });
  const pitchM = decal('#ffffff', 2, { map: pitchTex });
  const trackM = decal('#ffffff', 2, { map: trackTex });
  for (const gr of layout.greens || []) {
    const w = gr.w * S, d = gr.h * S, cx = X(gr.x + gr.w / 2), cz = Z(gr.y + gr.h / 2);
    let g, m;
    if (gr.kind === 'field') { g = quad(cx, cz, w, d, layerY(2), 0); m = pitchM; }
    else if (gr.kind === 'stadium') { g = quad(cx, cz, w, d, layerY(2), 0); m = trackM; }
    else if (gr.kind === 'plaza') { g = quad(cx, cz, w, d, layerY(1), 1); m = plazaM; }
    else if (gr.kind === 'dense') { g = quad(cx, cz, w, d, layerY(1), 1, Math.max(2, Math.round(Math.max(w, d) / 5)), 0.04); m = denseM; }
    else { g = quad(cx, cz, w, d, layerY(1), 1); m = lawnM; }
    group.add(mesh(g, m, 'verde-' + gr.kind));
    rects.push({ kind: gr.kind, x: gr.x, y: gr.y, w: gr.w, h: gr.h });
  }
  const lotM = decal('#ffffff', 2, { map: rep(stallTex, 1 / 2.6, 1 / 16) });
  for (const lot of layout.lots || []) {
    const w = lot.w * S, d = lot.h * S;
    group.add(mesh(quad(X(lot.x + lot.w / 2), Z(lot.y + lot.h / 2), w, d, layerY(2), 1), lotM, 'estacionamiento'));
    rects.push({ kind: 'lot', x: lot.x, y: lot.y, w: lot.w, h: lot.h });
  }

  // ---------- calles, andadores y vía de Metrobús (todo plano) ----------
  const walkM = decal('#e9dfcb', 2);
  const kerbM = decal('#b7ac97', 2);
  const walkEdgeM = decal('#cfc4ae', 2);
  const asphaltM = decal('#4a4d52', 3);
  const dashM = decal('#ffffff', 4, { map: dashTex, transparent: true, alphaTest: 0.4 });
  const railM = decal('#ffffff', 3, { map: railTex });
  const railLineM = decal('#9aa0a6', 4, { metalness: 0.3, roughness: 0.5 });
  const railEdgeM = decal('#e0b43c', 4);
  for (const r of layout.roads || []) {
    const pts = toM(r.pts), w = r.w * S;
    if (r.kind === 'street') {
      group.add(mesh(ribbon(pts, w + 2.6, layerY(2)), walkM, 'acera'));
      group.add(mesh(ribbon(pts, w + 0.5, layerY(2) + 0.005), kerbM, 'bordillo'));
      group.add(mesh(ribbon(pts, w, layerY(3)), asphaltM, 'calle'));
      const dm = dashM; if (dm.map) dm.map.repeat.set(1 / 6, 1);
      group.add(mesh(ribbon(pts, 0.35, layerY(4), { period: 1 }), dm, 'linea-central'));
    } else if (r.kind === 'rail') {
      const rm = railM; if (rm.map) rm.map.repeat.set(1 / 1.6, 1);
      group.add(mesh(ribbon(pts, w, layerY(3), { period: 1 }), rm, 'via-metrobus'));
      for (const o of [-w * 0.28, w * 0.28]) group.add(mesh(ribbon(pts, 0.28, layerY(4), { offset: o }), railLineM, 'riel'));
      for (const o of [-(w / 2 - 0.5), w / 2 - 0.5]) group.add(mesh(ribbon(pts, 0.3, layerY(4), { offset: o }), railEdgeM, 'borde-via'));
    } else {
      group.add(mesh(ribbon(pts, w + 1.0, layerY(2)), walkEdgeM, 'andador-borde'));
      group.add(mesh(ribbon(pts, w, layerY(2) + 0.006), walkM, 'andador'));
    }
  }
  if (dashM.map) dashM.map.repeat.set(1 / 6, 1);

  // ---------- edificios: slots y proxies ----------
  const slots = new Map(), proxies = new Map();
  const bldRects = [];
  const proxyList = [];
  const roofColor = { naranja: '#bda08c', gris: '#b9bcbe' };

  function levelsOf(b) {
    const d = byId[b.id];
    return Math.max(1, (d && d.levels && d.levels.length) || b.levels || 2);
  }
  for (const b of layout.buildings || []) {
    const w = b.w * S, d = b.h * S;
    const cx = X(b.x + b.w / 2), cz = Z(b.y + b.h / 2), rot = -num(b.rot) * DEG;
    const idx = index[b.id];
    const lv = levelsOf(b);
    const floorH = idx && idx.height && idx.levels ? idx.height / idx.levels : 3.4;
    const h = Math.max(6.8, num(idx && idx.height, Math.max(2, lv) * 3.4));
    slots.set(b.id, { x: cx, z: cz, w, d, rot, h });
    bldRects.push({ cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: num(b.rot) * DEG });

    // contorno
    let shape;
    const ol = idx && Array.isArray(idx.outline) && idx.outline.length >= 3 && idx.outline.every((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) ? idx.outline : null;
    if (ol) {
      const bb = Array.isArray(idx.bbox) && idx.bbox.length === 4 ? idx.bbox : [Math.min(...ol.map((p) => p[0])), Math.min(...ol.map((p) => p[1])), Math.max(...ol.map((p) => p[0])), Math.max(...ol.map((p) => p[1]))];
      const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
      const sc = Math.max(w, d) / (Math.max(bw, bh) || 1);
      const mx = (bb[0] + bb[2]) / 2, my = (bb[1] + bb[3]) / 2;
      shape = new THREE.Shape(ol.map(([x, y]) => new THREE.Vector2((x - mx) * sc, -(y - my) * sc)));
    } else {
      shape = new THREE.Shape([new THREE.Vector2(-w / 2, -d / 2), new THREE.Vector2(w / 2, -d / 2), new THREE.Vector2(w / 2, d / 2), new THREE.Vector2(-w / 2, d / 2)]);
      for (const p of b.patio || []) {
        const x0 = (p.x - 0.5) * w, x1 = (p.x + p.w - 0.5) * w, z0 = (p.y - 0.5) * d, z1 = (p.y + p.h - 0.5) * d;
        shape.holes.push(new THREE.Path([new THREE.Vector2(x0, -z0), new THREE.Vector2(x1, -z0), new THREE.Vector2(x1, -z1), new THREE.Vector2(x0, -z1)]));
      }
    }
    const grow = 1 + 1.6 / Math.max(w, d);
    const ext = (depth, sc) => {
      const g = G(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 }));
      g.rotateX(-Math.PI / 2);
      if (sc !== 1) g.scale(sc, 1, sc);
      return g;
    };
    const wallTex = facadeTex ? facadeTex.clone() : null, emiTex = facadeEmi ? facadeEmi.clone() : null;
    for (const t of [wallTex, emiTex]) if (t) { t.repeat.set(1 / 4, 1 / floorH); t.offset.set(0, -1 / floorH); t.needsUpdate = true; texs.push(t); }
    const wall = M(new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallTex, emissive: 0xffffff, emissiveMap: emiTex, emissiveIntensity: 0, roughness: 0.82, metalness: 0.02 }), false);
    winMats.push(wall);
    const roof = M(new THREE.MeshStandardMaterial({ color: roofColor[b.roof] || '#e0d9c8', roughness: 0.9 }));
    const cornice = M(new THREE.MeshStandardMaterial({ color: '#cbbfa8', roughness: 0.85 }));
    const plinth = M(new THREE.MeshStandardMaterial({ color: '#a79c86', roughness: 0.9 }));
    const gp = new THREE.Group();
    gp.name = 'proxy-' + b.id;
    gp.position.set(cx, 0, cz); gp.rotation.y = rot;
    const body = mesh(ext(h - 0.45, 1), [roof, wall], 'cuerpo', { cast: true });
    const cor = mesh(ext(0.45, grow).translate(0, h - 0.45, 0), cornice, 'cornisa', { cast: true });
    const pl = mesh(ext(0.7, 1.012), plinth, 'zocalo', { cast: true });
    const patioMeshes = [];
    if (!ol) for (const p of b.patio || []) {
      const pw = p.w * w, pd = p.h * d;
      const g = G(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2).translate((p.x + p.w / 2 - 0.5) * w, layerY(3), (p.y + p.h / 2 - 0.5) * d));
      patioMeshes.push(mesh(g, decal(p.suelo === 'arena' ? '#d9c28f' : '#6a9f50', 3), 'patio'));
    }
    const roofBits = [];
    if (!ol && !(b.patio && b.patio.length)) {
      const bm = M(new THREE.MeshStandardMaterial({ color: '#c3bba9', roughness: 0.9 }));
      gp.userData.extra = bm;
      for (const [fx, fz, sx, sz, sh] of [[-0.28, -0.22, 0.12, 0.16, 1.4], [0.25, 0.2, 0.16, 0.12, 1.1], [0.05, -0.1, 0.07, 0.07, 2.0]]) {
        const bg = G(new THREE.BoxGeometry(Math.min(7, w * sx), sh, Math.min(7, d * sz)));
        const bx = mesh(bg, bm, 'techo-detalle', { cast: true });
        bx.position.set(fx * w, h + sh / 2, fz * d); roofBits.push(bx);
      }
    }
    gp.add(body, cor, pl, ...patioMeshes, ...roofBits);
    gp.userData = { id: b.id, mats: [wall, roof, cornice, plinth, ...(gp.userData.extra ? [gp.userData.extra] : [])] };
    proxies.set(b.id, gp);
    proxyList.push(gp);
    group.add(gp);
  }

  // ---------- POIs planos ----------
  const pois = new Map();
  const poiRings = [];
  const poiDiscM = M(new THREE.MeshBasicMaterial({ color: '#23282d', polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }), false);
  const poiRimM = M(new THREE.MeshBasicMaterial({ color: '#f4efe4', polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -14 }), false);
  const discG = G(new THREE.CircleGeometry(6.6, 40).rotateX(-Math.PI / 2));
  const rimG = G(new THREE.RingGeometry(6.6, 7.3, 40).rotateX(-Math.PI / 2));
  const actG = G(new THREE.RingGeometry(7.8, 9.0, 48).rotateX(-Math.PI / 2));
  const glyphG = G(new THREE.PlaneGeometry(10.6, 10.6).rotateX(-Math.PI / 2));
  const glyphMats = {
    metrobus: M(new THREE.MeshBasicMaterial({ color: glyphM ? 0xffffff : 0xcc3a42, map: glyphM, transparent: true, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }), false),
    acceso: M(new THREE.MeshBasicMaterial({ color: glyphA ? 0xffffff : 0x1f9c6c, map: glyphA, transparent: true, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }), false),
  };
  for (const p of layout.pois || []) {
    const g = new THREE.Group();
    g.name = 'poi-' + p.id;
    g.position.set(X(p.x), 0.09, Z(p.y));
    const disc = mesh(discG, poiDiscM, 'disco', { receive: false });
    const rim = mesh(rimG, poiRimM, 'anillo', { receive: false });
    const glyph = mesh(glyphG, glyphMats[p.kind === 'metrobus' ? 'metrobus' : 'acceso'], 'glifo', { receive: false });
    glyph.position.y = 0.01;
    const actM = M(new THREE.MeshBasicMaterial({ color: '#f5cc54', transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -18 }), false);
    const act = mesh(actG, actM, 'activo', { receive: false });
    act.visible = false; act.position.y = 0.02;
    g.add(disc, rim, glyph, act);
    g.userData = { id: p.id, kind: p.kind, ring: act };
    poiRings.push({ id: p.id, act, mat: actM });
    pois.set(p.id, g);
    group.add(g);
  }

  // ---------- reparto de árboles ----------
  const rng = mulberry32(20241006);
  const roads = layout.roads || [];
  const poiPx = layout.pois || [];
  function inBuilding(px, py, m) {
    for (const r of bldRects) {
      const dx = px - r.cx, dy = py - r.cy, c = Math.cos(r.rot), s = Math.sin(r.rot);
      if (Math.abs(dx * c + dy * s) <= r.w / 2 + m && Math.abs(-dx * s + dy * c) <= r.h / 2 + m) return true;
    }
    return false;
  }
  function blocked(px, py, skipRoad = -1) {
    if (layout.ground && !inPoly(px, py, layout.ground)) return true;
    if (inBuilding(px, py, 7)) return true;
    for (const r of rects) {
      if (r.kind === 'dense' || r.kind === 'lawn') continue;
      if (px > r.x - 4 && px < r.x + r.w + 4 && py > r.y - 4 && py < r.y + r.h + 4) return true;
    }
    for (let i = 0; i < roads.length; i++) {
      if (i === skipRoad) continue;
      const r = roads[i], lim = r.w / 2 + (r.kind === 'path' ? 3 : 5);
      for (let j = 0; j < r.pts.length - 1; j++) {
        const a = r.pts[j], b = r.pts[j + 1];
        if (segDist(px, py, a[0], a[1], b[0], b[1]) < lim) return true;
      }
    }
    for (const p of poiPx) if (Math.hypot(px - p.x, py - p.y) < 16) return true;
    return false;
  }
  const placed = [];
  const free = (px, py, md) => { for (const q of placed) if (Math.hypot(px - q.x, py - q.y) < md) return false; return true; };

  // Jacarandas junto a los andadores principales
  const jacRoads = [];
  roads.forEach((r, i) => { if (r.kind === 'path' || r.kind === 'street') jacRoads.push(i); });
  const jacs = [];
  let side = 1;
  for (const ri of jacRoads) {
    const r = roads[ri];
    for (let j = 0; j < r.pts.length - 1; j++) {
      const a = r.pts[j], b = r.pts[j + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      for (let t = 18; t < len - 10 && jacs.length < MAX_JAC; t += 21 + rng() * 5) {
        side = -side;
        const off = r.w / 2 + (r.kind === 'street' ? 13 : 9) + rng() * 3;
        const px = a[0] + ((b[0] - a[0]) * t) / len + nx * off * side + (rng() - 0.5) * 3;
        const py = a[1] + ((b[1] - a[1]) * t) / len + ny * off * side + (rng() - 0.5) * 3;
        if (blocked(px, py, ri) || !free(px, py, 13)) continue;
        placed.push({ x: px, y: py });
        jacs.push({ x: px, y: py });
      }
    }
  }
  // Árboles normales según layout.trees
  const normals = [];
  const cap = MAX_TREES - jacs.length;
  for (const t of layout.trees || []) {
    const n = Math.round(num(t.n) * 1.8);
    let ok = 0;
    for (let tries = 0; tries < n * 14 && ok < n && normals.length < cap; tries++) {
      const px = t.x + rng() * t.w, py = t.y + rng() * t.h;
      if (blocked(px, py) || !free(px, py, 5.2)) continue;
      placed.push({ x: px, y: py });
      normals.push({ x: px, y: py, conifer: t.kind === 'conifer' });
      ok++;
    }
  }

  // ---------- geometrías y mallas instanciadas de árboles ----------
  const blob = G(new THREE.IcosahedronGeometry(1, 1));
  { const p = blob.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.14 * Math.sin(x * 3.1 + 1.3) * Math.cos(z * 2.7) + 0.08 * Math.sin(y * 4.2 + x * 2);
      p.setXYZ(i, x * k, y * k, z * k);
    } }
  const flowerG = G(new THREE.IcosahedronGeometry(1, 0));
  const trunkG = G(new THREE.CylinderGeometry(0.16, 0.28, 1, 6).translate(0, 0.5, 0));
  const coneG = G(new THREE.ConeGeometry(1, 1, 7, 1).translate(0, 0.5, 0));
  const uTime = { value: 0 };
  function sway(mat, amp) {
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = uTime;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
float hw = position.y * 0.5 + 0.5;
transformed.x += sin(uTime * 0.9 + ph) * ${amp} * hw;
transformed.z += cos(uTime * 0.7 + ph * 1.3) * ${amp} * 0.7 * hw;
#endif`);
    };
    mat.customProgramCacheKey = () => 'env-sway-' + amp;
  }
  const crownM = M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: false }), false);
  const jacCrownM = M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, emissive: 0x6a4aa0, emissiveIntensity: 0.14 }), false);
  const flowerM = M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), false);
  const coneM = M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), false);
  const trunkM = M(new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 1 }));
  sway(crownM, 0.05); sway(jacCrownM, 0.04); sway(flowerM, 0.04); sway(coneM, 0.03);
  const treeMats = [crownM, jacCrownM, flowerM, coneM, trunkM];

  const nBlobs = normals.filter((t) => !t.conifer).length * 3;
  const nCone = normals.filter((t) => t.conifer).length * 3;
  const nTrunk = normals.length + jacs.length * 3;
  const nJBlob = jacs.length * 6, nFlower = jacs.length * 18;
  const mk = (g, m, n, name) => {
    const im = new THREE.InstancedMesh(g, m, Math.max(1, n));
    im.name = name; im.count = n; im.castShadow = true; im.receiveShadow = false; im.frustumCulled = false;
    group.add(im); return im;
  };
  const trunkI = mk(trunkG, trunkM, nTrunk, 'troncos');
  const crownI = mk(blob, crownM, nBlobs, 'copas');
  const coneI = mk(coneG, coneM, nCone, 'coniferas');
  const jCrownI = mk(blob, jacCrownM, nJBlob, 'copas-jacaranda');
  const flowerI = mk(flowerG, flowerM, nFlower, 'flores-jacaranda');
  flowerI.castShadow = false;
  let cB = 0, cC = 0, cT = 0, cJ = 0, cF = 0;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const greens = ['#3f7a3c', '#4f8f45', '#5fa14f', '#2f6b3a'];
  const lilacs = ['#a888d6', '#b095dc', '#9f7fd0', '#b79be0'];
  const put = (im, i, x, y, z, sx, sy, sz, ry = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
  };
  const tint = (im, i, hex, dl) => { col.set(hex); col.offsetHSL((rng() - 0.5) * 0.03, 0, dl); im.setColorAt(i, col); };

  for (const t of normals) {
    const x = X(t.x), z = Z(t.y), ht = 1.6 + rng() * 2.0, r = 1.9 + rng() * 2.2, ry = rng() * 6.28;
    put(trunkI, cT++, x, 0, z, 0.8 + rng() * 0.5, ht + r * 0.4, 0.8 + rng() * 0.5, ry);
    if (t.conifer) {
      const hh = 6 + rng() * 3, rr = 1.9 + rng() * 0.8;
      for (let k = 0; k < 3; k++) {
        put(coneI, cC, x, ht * 0.7 + k * hh * 0.24, z, rr * (1 - k * 0.27), hh * (0.5 - k * 0.08), rr * (1 - k * 0.27), ry);
        tint(coneI, cC++, '#2c5a3a', (rng() - 0.5) * 0.06);
      }
    } else {
      const hex = greens[Math.floor(rng() * greens.length)];
      put(crownI, cB, x, ht + r * 0.75, z, r, r * 0.86, r, ry); tint(crownI, cB++, hex, (rng() - 0.5) * 0.08);
      for (let k = 0; k < 2; k++) {
        const a = rng() * 6.28, rr = r * (0.6 + rng() * 0.15);
        put(crownI, cB, x + Math.cos(a) * r * 0.62, ht + r * 0.45 + rng() * 0.3, z + Math.sin(a) * r * 0.62, rr, rr * 0.82, rr, rng() * 6.28);
        tint(crownI, cB++, greens[Math.floor(rng() * greens.length)], (rng() - 0.5) * 0.08);
      }
    }
  }
  const jacData = [];
  for (const j of jacs) {
    const x = X(j.x), z = Z(j.y), ht = 4 + rng() * 1.4, R = 5.6 + rng() * 2.4, cy = ht + 1.5;
    put(trunkI, cT++, x, 0, z, 1.5, ht, 1.5, rng() * 6.28);
    for (let k = 0; k < 2; k++) { // ramas en horquilla
      dummy.position.set(x, ht * 0.8, z); dummy.rotation.order = 'YXZ';
      dummy.rotation.set(0.7, rng() * 6.28 + k * 3.14, 0); dummy.scale.set(1.0, 2.8, 1.0); dummy.updateMatrix();
      trunkI.setMatrixAt(cT++, dummy.matrix);
    }
    dummy.rotation.order = 'XYZ';
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 6.28 + rng() * 0.6, rr = R * (0.6 + rng() * 0.08);
      put(jCrownI, cJ, x + Math.cos(a) * R * 0.52, cy + rng() * 0.5, z + Math.sin(a) * R * 0.52, rr, rr * 0.48, rr, rng() * 6.28);
      tint(jCrownI, cJ++, lilacs[Math.floor(rng() * 4)], (rng() - 0.5) * 0.06);
    }
    put(jCrownI, cJ, x, cy + 0.7, z, R * 0.7, R * 0.34, R * 0.7, rng() * 6.28); tint(jCrownI, cJ++, lilacs[Math.floor(rng() * 4)], 0.02);
    put(jCrownI, cJ, x, cy - 0.9, z, R * 0.58, R * 0.22, R * 0.58, 0); tint(jCrownI, cJ++, '#58814a', 0);
    for (let k = 0; k < 18; k++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * R * 0.85, s = 0.35 + rng() * 0.3;
      put(flowerI, cF, x + Math.cos(a) * d, cy + 0.55 + (1 - (d / R) ** 2) * R * 0.28 + rng() * 0.3, z + Math.sin(a) * d, s, s * 0.8, s, rng() * 6.28);
      tint(flowerI, cF++, rng() > 0.3 ? '#d6c7f5' : '#c4aeea', (rng() - 0.5) * 0.05);
    }
    jacData.push({ x, z, R, top: cy + R * 0.35 });
  }
  for (const im of [trunkI, crownI, coneI, jCrownI, flowerI]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  // Alfombra de pétalos bajo las jacarandas
  const carpetM = M(new THREE.MeshBasicMaterial({ color: carpetTex ? 0xffffff : 0xa98ad4, map: carpetTex, transparent: true, opacity: carpetTex ? 1 : 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }), false);
  const carpetG = G(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2));
  const carpetI = new THREE.InstancedMesh(carpetG, carpetM, Math.max(1, jacData.length));
  carpetI.name = 'alfombra-petalos'; carpetI.count = jacData.length; carpetI.renderOrder = 2; carpetI.frustumCulled = false;
  jacData.forEach((j, i) => put(carpetI, i, j.x, layerY(4) + 0.01, j.z, j.R * 1.35, 1, j.R * 1.35, rng() * 6.28));
  carpetI.instanceMatrix.needsUpdate = true;
  group.add(carpetI);

  // Pétalos cayendo
  const nPetals = jacData.length ? Math.min(MAX_PETALS, jacData.length * 21) : 0;
  const petalG = G(new THREE.PlaneGeometry(0.2, 0.13));
  const petalM = M(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), false);
  const petalI = new THREE.InstancedMesh(petalG, petalM, Math.max(1, nPetals));
  petalI.name = 'petalos'; petalI.count = nPetals; petalI.frustumCulled = false;
  const petals = [];
  for (let i = 0; i < nPetals; i++) {
    const j = jacData[i % jacData.length];
    petals.push({ j, a: rng() * 6.28, d: Math.sqrt(rng()) * j.R * 0.85, dur: 7 + rng() * 6, ph: rng(), sp: 0.6 + rng() * 1.4, w: rng() * 6.28 });
    col.set(rng() > 0.5 ? '#b79be0' : '#9d7ccb'); col.offsetHSL(0, 0, (rng() - 0.5) * 0.1); petalI.setColorAt(i, col);
  }
  if (petalI.instanceColor) petalI.instanceColor.needsUpdate = true;
  group.add(petalI);

  // ---------- barrio alrededor (cajas instanciadas, bajo contraste) ----------
  const CITY_MAX = 250, STREET_TREES = 60, CELL = 64;
  const cityB = [], cityT = [];
  {
    const r2 = mulberry32(5150), px = (x) => x / S + PW / 2, pz = (z) => z / S + PH / 2;
    const near = (x, z, m) => {
      const ax = px(x), ay = pz(z);
      for (const r of roads) for (let j = 0; j < r.pts.length - 1; j++) {
        const a = r.pts[j], b = r.pts[j + 1];
        if (segDist(ax, ay, a[0], a[1], b[0], b[1]) < r.w / 2 + m) return true;
      }
      return false;
    };
    const inCampus = (x, z, m) => {
      const ax = px(x), ay = pz(z), k = m / S;
      for (const [dx, dy] of [[0, 0], [k, k], [-k, k], [k, -k], [-k, -k]]) {
        if ((layout.ground && inPoly(ax + dx, ay + dy, layout.ground)) || (layout.plate && inPoly(ax + dx, ay + dy, layout.plate))) return true;
      }
      return false;
    };
    const cells = [];
    const rx = Math.ceil(900 / CELL), rz = Math.ceil(650 / CELL);
    for (let i = -rx; i < rx; i++) for (let k = -rz; k < rz; k++) cells.push({ i, k, d: Math.hypot((i + 0.5) * CELL, (k + 0.5) * CELL) });
    cells.sort((a, b) => a.d - b.d);
    const tones = ['#d6d0c3', '#cfc9bb', '#c9c3b5', '#d6d0c3', '#cfc9bb', '#cdbfb0'];
    for (const c of cells) {
      const x0 = c.i * CELL + 7, z0 = c.k * CELL + 7, bw = CELL - 14;
      if (inCampus(x0 + bw / 2, z0 + bw / 2, 80 + bw * 0.5) || near(x0 + bw / 2, z0 + bw / 2, 34)) continue;
      const n = r2() < 0.45 ? 1 : r2() < 0.6 ? 2 : 4;
      const sub = n === 1 ? [[0, 0, 1, 1]] : n === 2 ? [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
      for (const [fx, fz, fw, fd] of sub) {
        if (cityB.length >= CITY_MAX) break;
        const gap = 1.2, w = bw * fw - gap * 2, d = bw * fd - gap * 2;
        const tall = r2() < 0.2;
        cityB.push({ x: x0 + bw * (fx + fw / 2), z: z0 + bw * (fz + fd / 2), w, d, h: tall ? 12 + r2() * 6 : 6 + r2() * 6, c: tones[Math.floor(r2() * tones.length)] });
      }
      if (cityT.length < STREET_TREES && r2() < 0.35) {
        const side = r2() < 0.5;
        const tx = side ? x0 - 7 : x0 + r2() * bw, tz = side ? z0 + r2() * bw : z0 - 7;
        if (!near(tx, tz, 6) && !inCampus(tx, tz, 4)) cityT.push({ x: tx, z: tz, s: 1.8 + r2() * 1.4 });
      }
    }
  }
  const cityBoxG = G(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const cityM = M(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }), false);
  const cityI = new THREE.InstancedMesh(cityBoxG, cityM, Math.max(1, cityB.length));
  cityI.name = 'barrio'; cityI.count = cityB.length; cityI.castShadow = false; cityI.receiveShadow = true; cityI.frustumCulled = false;
  cityB.forEach((b, i) => {
    dummy.position.set(b.x, -0.1, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    cityI.setMatrixAt(i, dummy.matrix); col.set(b.c); col.offsetHSL(0, -0.03, (rng() - 0.5) * 0.03); cityI.setColorAt(i, col);
  });
  cityI.instanceMatrix.needsUpdate = true; if (cityI.instanceColor) cityI.instanceColor.needsUpdate = true;
  group.add(cityI);
  const stTrunk = new THREE.InstancedMesh(trunkG, trunkM, Math.max(1, cityT.length));
  const stCrown = new THREE.InstancedMesh(blob, crownM, Math.max(1, cityT.length));
  for (const im of [stTrunk, stCrown]) { im.count = cityT.length; im.castShadow = true; im.frustumCulled = false; im.name = 'arboles-calle'; group.add(im); }
  cityT.forEach((t, i) => {
    dummy.position.set(t.x, -0.1, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, t.s + 1.2, 1); dummy.updateMatrix(); stTrunk.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.s + 2.4, t.z); dummy.scale.set(t.s * 1.1, t.s * 0.9, t.s * 1.1); dummy.updateMatrix(); stCrown.setMatrixAt(i, dummy.matrix);
    col.set(greens[i % 4]); col.offsetHSL(0, -0.1, 0.04); stCrown.setColorAt(i, col);
  });
  stTrunk.instanceMatrix.needsUpdate = stCrown.instanceMatrix.needsUpdate = true; if (stCrown.instanceColor) stCrown.instanceColor.needsUpdate = true;

  // ---------- estado, tema, apertura, animación ----------
  let motion = true, openId = '', openT = 0, curTheme = 'light';
  const activeIds = new Set();
  const skyCol = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const tmpC = new THREE.Color();
  function paintSky(t) {
    skyCol[0].set(t.sky[0]); skyCol[1].set(t.sky[1]); skyCol[2].set(t.sky[2]);
    const p = skyGeo.attributes.position, c = skyGeo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 1900;
      if (y <= 0) tmpC.copy(skyCol[0]);
      else if (y < 0.25) tmpC.copy(skyCol[0]).lerp(skyCol[1], smooth(0, 0.25, y));
      else tmpC.copy(skyCol[1]).lerp(skyCol[2], smooth(0.25, 0.95, y));
      c.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
    }
    c.needsUpdate = true;
  }
  function setTheme(name) {
    curTheme = name === 'dark' ? 'dark' : 'light';
    const t = THEMES[curTheme];
    paintSky(t);
    fog.color.set(t.fog); background.set(t.fog); hazeMat.color.set(t.fog); haloMat.color.set(curTheme === 'dark' ? '#8f9ad0' : '#fff3d8');
    voidMat.color.set(t.void); registry.find((r) => r.m === voidMat).base.set(t.void);
    hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
    sun.color.set(t.sun[0]); sun.intensity = t.sun[1];
    sunState.az = t.az; aimSun();
    for (const r of registry) r.m.color.copy(r.base).multiply(tmpC.setRGB(...t.tint));
    for (const m of winMats) m.emissiveIntensity = t.windows * (1 - 0.0);
    flowerM.emissive.set(0x000000);
  }
  function setPoiActive(ids = []) {
    activeIds.clear(); for (const id of ids || []) activeIds.add(id);
    for (const r of poiRings) r.act.visible = activeIds.has(r.id);
  }
  function setOpen(id) { openId = id && slots.has(id) ? id : ''; }
  function applyOpen() {
    for (const gp of proxyList) {
      const own = gp.userData.id === openId;
      const target = openId ? (own ? 0 : 0.14) : 1;
      const o = own && openT > 0.98 ? 0 : 1 + (target - 1) * openT;
      gp.visible = !(own && openT > 0.98);
      for (const m of gp.userData.mats) {
        const tr = o < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = o; m.depthWrite = !tr;
      }
    }
    const f = 1 - 0.5 * openT; // el entorno cercano baja protagonismo
    for (const m of treeMats) { const tr = f < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = f; }
    carpetM.opacity = (carpetTex ? 1 : 0.35) * f;
    petalM.opacity = f; if (petalM.transparent !== f < 0.999) { petalM.transparent = f < 0.999; petalM.needsUpdate = true; }
  }
  const ds = new THREE.Object3D();
  function update(dt = 0, t = 0) {
    const target = openId ? 1 : 0;
    if (Math.abs(target - openT) > 1e-3) {
      openT += Math.sign(target - openT) * Math.min(Math.abs(target - openT), dt / 0.5 || 1);
      applyOpen();
    } else if (openT !== target) { openT = target; applyOpen(); }
    const tt = motion ? t : 0;
    uTime.value = tt;
    for (const r of poiRings) {
      if (!r.act.visible) continue;
      const ph = motion ? (t * 0.9) % 1 : 0.3;
      const s = 1 + ph * 0.35; r.act.scale.set(s, 1, s); r.mat.opacity = 0.95 * (1 - ph * 0.8);
    }
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i], j = p.j;
      const k = (((tt / p.dur + p.ph) % 1) + 1) % 1;
      const sc = smooth(0, 0.05, k) * (1 - smooth(0.9, 1, k));
      const x = j.x + Math.cos(p.a) * p.d + k * 5 * p.sp + Math.sin(k * 14 + p.w) * 0.6;
      const z = j.z + Math.sin(p.a) * p.d + k * 2 + Math.cos(k * 11 + p.w) * 0.5;
      ds.position.set(x, 0.06 + (j.top - 0.06) * (1 - k), z);
      ds.rotation.set(k * 9 + p.w, k * 7 + p.a, k * 5);
      ds.scale.setScalar(sc * (0.8 + 0.4 * p.sp / 2));
      ds.updateMatrix();
      petalI.setMatrixAt(i, ds.matrix);
    }
    petalI.instanceMatrix.needsUpdate = true;
  }
  function setMotion(on) { motion = !!on; }
  function dispose() {
    group.traverse((o) => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const t of texs) t.dispose();
    group.removeFromParent();
    geos.length = mats.length = texs.length = 0;
  }

  setTheme(theme);
  setOpen('');
  update(0, 0);

  return {
    group, groundSize, slots, proxies, pois,
    setTheme, setPoiActive, setOpen, update, dispose,
    // extras opcionales para three-stage.js
    sun, hemi, fog, background, sky, focusShadow, setMotion,
    exposure: 0.88,
    stats: { trees: normals.length + jacs.length + cityT.length, cityBuildings: cityB.length, jacarandas: jacs.length, petals: nPetals },
  };
}
