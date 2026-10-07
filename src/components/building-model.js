// Modelo 3D de un edificio a partir del JSON de metros (docs/modelo-3d.md).
// Recibe THREE por parámetro; no importa nada. Geometría instanciada/fusionada: pocos draw calls.

const SLAB_T = 0.25; // espesor de losa
const PARAPET_H = 0.9;
const HOUSING_H = 2.4; // caja de escalera en azotea
const BEAM_H = 14;

const HEX = {
  ext: '#efe9dc', int: '#eae4d6', zocalo: '#9d9588', rodapie: '#a39b8d', frame: '#26363a',
  cap: '#8a8273', cornice: '#b9b2a3', stairs: '#e9e3d6', roof: '#c9c9c4'
};
const TONES = ['#d9d2c3', '#ddd6c8', '#d6cfc0', '#dbd4c5', '#d8d1c2'];
const KIND = {
  salon: '#e9dfc9', laboratorio: '#bfdcd6', oficina: '#ecd3a6', academia: '#d6c6ea', sanitarios: '#a9d4f2',
  servicio: '#ccc5ba', circulacion: '#f3eee0', auditorio: '#e3bfae', deportivo: '#b9d9b0', otro: '#e0d7c4'
};
const CUT_H = 1.25; // altura de corte arquitectónico
const PAL = {
  light: { tint: '#ffffff', glass: '#2f6b66', glassOp: 0.55, emi: '#000000', emiI: 0 },
  dark: { tint: '#7f88a8', glass: '#2a5a60', glassOp: 0.72, emi: '#ffc27a', emiI: 0.6 }
};

export function buildBuilding({ THREE, model, theme = 'light' }) {
  const T = THREE;
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const levels = ((model && model.levels) || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const num = (v, d) => (Number.isFinite(v) ? v : d);

  // ---- bbox y origen -------------------------------------------------------
  let [bx0, by0, bx1, by1] = (model && model.bbox) || [];
  if (![bx0, by0, bx1, by1].every(Number.isFinite)) {
    bx0 = by0 = Infinity; bx1 = by1 = -Infinity;
    const grow = (p) => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); };
    levels.forEach((l) => {
      (l.slabs || []).forEach((s) => (s.outer || []).forEach(grow));
      (l.walls || []).forEach((w) => { grow(w.a); grow(w.b); });
    });
    if (!Number.isFinite(bx0)) { bx0 = by0 = -5; bx1 = by1 = 5; }
  }
  const ox = (bx0 + bx1) / 2, oy = (by0 + by1) / 2;

  // ---- bases por nivel -----------------------------------------------------
  const bases = [];
  let H = 0;
  levels.forEach((l) => { bases.push(H); H += num(l.h, 3.4); });

  // ---- recursos compartidos -----------------------------------------------
  const boxGeo = track(new T.BoxGeometry(1, 1, 1));
  const boxNB = track(new T.BoxGeometry(1, 1, 1)); // sin cara inferior (10 triángulos)
  boxNB.setIndex(Array.from(boxNB.index.array).filter((_, i) => i < 18 || i >= 24));

  let atlas = null, gradTex = null;
  try {
    if (typeof document !== 'undefined') atlas = track(makeAtlas(T));
    if (typeof document !== 'undefined') gradTex = track(makeGradient(T));
  } catch (e) { atlas = null; gradTex = null; }

  const col = (h) => new T.Color(h);
  const C = { ext: col(HEX.ext), int: col(HEX.int), zoc: col(HEX.zocalo), rod: col(HEX.rodapie), frame: col(HEX.frame), cap: col(HEX.cap), capD: col('#5a554b'), cor: col(HEX.cornice) };
  const GREY = col('#8a8a8a');
  const YAX = new T.Vector3(0, 1, 0);
  const _p = new T.Vector3(), _s = new T.Vector3(), _q = new T.Quaternion();

  const newList = () => ({ m: [], c: [] });
  function add(list, x, y, z, sx, sy, sz, ry, color) {
    if (![x, y, z, sx, sy, sz, ry].every(Number.isFinite) || !(sx > 0 && sy > 0 && sz > 0)) return;
    _q.setFromAxisAngle(YAX, ry);
    list.m.push(new T.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
    list.c.push(color || null);
  }
  function inst(geo, mat, list, cast, recv) {
    const n = list.m.length;
    if (!n) return null;
    const im = new T.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      im.setMatrixAt(i, list.m[i]);
      if (list.c[i]) im.setColorAt(i, list.c[i]);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = recv;
    im.userData.cast = cast;
    track({ dispose: () => im.dispose() });
    return im;
  }
  const mkMat = (role, base, opts, op, dimOp, alwaysT) => {
    const m = track(new T.MeshStandardMaterial(opts));
    m.userData = { role, base: new T.Color(base), op, dimOp, alwaysT: !!alwaysT };
    return m;
  };

  // ---- construcción por nivel ---------------------------------------------
  const totalWalls = levels.reduce((n, l) => n + (l.walls || []).length, 0);
  const withTrim = totalWalls <= 3500; // ponytail: rodapié omitido si el presupuesto de triángulos peligra
  const levelObjs = [], roomMap = new Map(), roomsByLevel = [];
  const root = new T.Group();

  levels.forEach((lv, li) => {
    const base = bases[li];
    const h = num(lv.h, 3.4);
    const g = new T.Group();
    g.name = 'nivel-' + lv.id;
    const walls = newList(), glass = newList(), trim = newList(), stairs = newList(), cwalls = newList(), cstairs = newList(), shP = [], stairArrows = [];
    const walls_ = lv.walls || [], ops = lv.openings || [];

    // asignar cada vano al muro más cercano
    const byWall = new Map();
    ops.forEach((o) => {
      if (!o.c) return;
      let best = -1, bd = Infinity;
      for (let wi = 0; wi < walls_.length; wi++) {
        const w = walls_[wi];
        const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy);
        if (len < 0.05) continue;
        const ux = dx / len, uy = dy / len;
        const rx = o.c[0] - w.a[0], ry = o.c[1] - w.a[1];
        const s = rx * ux + ry * uy, d = Math.abs(rx * uy - ry * ux);
        if (s > -0.3 && s < len + 0.3 && d < num(w.t, 0.25) / 2 + 0.35 && d < bd) { bd = d; best = wi; }
      }
      if (best >= 0) {
        if (!byWall.has(best)) byWall.set(best, []);
        byWall.get(best).push(o);
      }
    });

    walls_.forEach((w, wi) => {
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy);
      if (!(len >= 0.05)) return;
      const t = num(w.t, 0.25), ux = dx / len, uy = dy / len, ry = -Math.atan2(dy, dx);
      const color = w.ext ? C.ext : C.int;
      const place = (list, s0, s1, y0, y1, depth, c) => {
        const sm = (s0 + s1) / 2;
        add(list, w.a[0] + ux * sm - ox, base + (y0 + y1) / 2, w.a[1] + uy * sm - oy, s1 - s0, y1 - y0, depth, ry, c);
      };
      if (w.rail) {
        // barandal: muro delgado de 0.94 m + pasamanos oscuro; igual en vista completa y en corte
        const rt = Math.min(t, 0.12);
        [walls, cwalls].forEach((L2) => {
          place(L2, -rt / 2, len + rt / 2, 0, 0.94, rt, color);
          place(L2, -rt / 2, len + rt / 2, 0.94, 1.0, rt + 0.06, C.capD);
        });
        const hx = len / 2 + 0.05, nw = rt / 2 + 0.2, cx = w.a[0] + ux * len / 2 - ox, cy = w.a[1] + uy * len / 2 - oy;
        const A = [cx - ux * hx - uy * nw, cy - uy * hx + ux * nw], B = [cx - ux * hx + uy * nw, cy - uy * hx - ux * nw];
        const D = [cx + ux * hx - uy * nw, cy + uy * hx + ux * nw], E = [cx + ux * hx + uy * nw, cy + uy * hx - ux * nw];
        pushTri(shP, A, B, E, base + 0.05); pushTri(shP, A, E, D, base + 0.05);
        return;
      }
      if (w.ext && li > 0) place(trim, -t / 2, len + t / 2, -0.1, 0.12, t + 0.08, C.cor); // losa de entrepiso en fachada
      // intervalos de vanos
      const iv = (byWall.get(wi) || []).map((o) => {
        const type = o.type || 'door';
        const wd = Math.min(num(o.w, type === 'window' ? 1.2 : 0.9), len);
        const s = (o.c[0] - w.a[0]) * ux + (o.c[1] - w.a[1]) * uy;
        const sill = type === 'window' ? 0.9 : 0;
        const top = Math.min(type === 'window' ? 2.1 : type === 'gate' ? 2.7 : 2.2, h - 0.15);
        return { type, cx: o.c[0], cy: o.c[1], s0: Math.max(0, s - wd / 2), s1: Math.min(len, s + wd / 2), sill, top };
      }).filter((o) => o.s1 - o.s0 > 0.1).sort((a, b) => a.s0 - b.s0);

      // caja de muro; remata con filete oscuro fino en la coronación (lee el muro en el corte)
      const wbox = (s0, s1, y0, y1) => {
        place(walls, s0, s1, y0, y1, t, color);
        if (y1 >= h - 0.001) place(trim, s0, s1, h, h + 0.04, t + 0.03, C.cap);
      };
      const solid = (s0, s1) => {
        if (s1 - s0 < 0.02) return;
        const e0 = s0 <= 0.001 ? -t / 2 : 0, e1 = s1 >= len - 0.001 ? t / 2 : 0;
        const a0 = s0 + e0, a1 = s1 + e1;
        if (w.ext && s1 - s0 >= 2 && h >= 2.8) {
          // franja continua de ventanas: pilares de 0.3 m y vidrio entre antepecho y dintel
          const y0 = 0.95, y1 = Math.min(2.45, h - 0.3), m0 = s0 + 0.3, m1 = s1 - 0.3, fd = t + 0.04;
          wbox(a0, m0, 0, h); wbox(m1, a1, 0, h);
          wbox(m0, m1, 0, y0); wbox(m0, m1, y1, h);
          place(glass, m0, m1, y0, y1, 0.04, null);
          place(trim, m0, m1, y0, y0 + 0.05, fd, C.frame);
          place(trim, m0, m1, y1 - 0.05, y1, fd, C.frame);
          for (let k = 1, n = Math.floor((m1 - m0) / 2.4); k <= n; k++) {
            const sm = m0 + ((m1 - m0) * k) / (n + 1);
            place(trim, sm - 0.02, sm + 0.02, y0, y1, fd, C.frame);
          }
        } else wbox(a0, a1, 0, h);
        if (withTrim) {
          if (w.ext) place(trim, a0 - 0.01, a1 + 0.01, 0, 0.4, t + 0.06, C.zoc);
          else place(trim, a0 - 0.01, a1 + 0.01, 0, 0.12, t + 0.02, C.rod);
        }
      };
      let cur = 0;
      iv.forEach((o) => {
        if (o.s0 > cur) solid(cur, o.s0);
        const s0 = Math.max(o.s0, cur), s1 = o.s1;
        if (s1 - s0 > 0.05) {
          if (h - o.top > 0.02) wbox(s0, s1, o.top, h);
          if (o.sill > 0) wbox(s0, s1, 0, o.sill);
          if (o.type === 'gate') {
            // marquesina: losa fina volada hacia afuera del centro del edificio
            let nx = -uy, ny = ux;
            if (nx * (o.cx - ox) + ny * (o.cy - oy) < 0) { nx = -nx; ny = -ny; }
            add(trim, o.cx + nx * 0.95 - ox, base + o.top + 0.4, o.cy + ny * 0.95 - oy, s1 - s0 + 1.2, 0.14, 1.9, ry, C.frame);
          }
          const fd = t + 0.04, fy0 = o.sill, fh = o.top - o.sill, sm = (s0 + s1) / 2;
          place(trim, s0, s0 + 0.06, fy0, o.top, fd, C.frame);
          place(trim, s1 - 0.06, s1, fy0, o.top, fd, C.frame);
          place(trim, s0, s1, o.top - 0.06, o.top, fd, C.frame);
          if (o.type === 'window') place(trim, s0, s1, fy0, fy0 + 0.06, fd, C.frame);
          if (o.type !== 'door' && (s1 - s0 > 1.4 || o.type === 'gate')) place(trim, sm - 0.025, sm + 0.025, fy0, o.top, fd, C.frame);
          if (o.type !== 'door') place(glass, s0 + 0.06, s1 - 0.06, fy0 + (o.type === 'window' ? 0.06 : 0), o.top - 0.06, 0.04, null);
          if (fh > 0) cur = Math.max(cur, s1);
        }
        cur = Math.max(cur, s1);
      });
      if (cur < len) solid(cur, len);
      // corte: muros bajos sin dinteles (puertas = huecos) ni ventanas, coronación oscura y sombra falsa en el piso
      {
        const cb = (s0, s1) => {
          if (s1 - s0 < 0.02) return;
          const e0 = s0 <= 0.001 ? -t / 2 : 0, e1 = s1 >= len - 0.001 ? t / 2 : 0;
          place(cwalls, s0 + e0, s1 + e1, 0, CUT_H, t, color);
          place(cwalls, s0 + e0, s1 + e1, CUT_H, CUT_H + 0.04, t, C.capD);
          const sm = (s0 + s1) / 2, hl2 = (s1 - s0) / 2 + 0.05, nw = t / 2 + 0.22;
          const cx = w.a[0] + ux * sm - ox, cy = w.a[1] + uy * sm - oy;
          const A = [cx - ux * hl2 - uy * nw, cy - uy * hl2 + ux * nw], B = [cx - ux * hl2 + uy * nw, cy - uy * hl2 - ux * nw];
          const D = [cx + ux * hl2 - uy * nw, cy + uy * hl2 + ux * nw], E = [cx + ux * hl2 + uy * nw, cy + uy * hl2 - ux * nw];
          pushTri(shP, A, B, E, base + 0.05); pushTri(shP, A, E, D, base + 0.05);
        };
        let c0 = 0;
        iv.filter((o) => o.type !== 'window').forEach((o) => { if (o.s0 > c0) cb(c0, o.s0); c0 = Math.max(c0, o.s1); });
        if (c0 < len) cb(c0, len);
      }
    });

    // escaleras
    (lv.stairs || []).forEach((s) => {
      if (!s.c) return;
      const a = (num(s.ang, 0) * Math.PI) / 180, d = num(s.d, 4), wd = num(s.w, 2.4);
      stairArrows.push({ x: s.c[0], y: s.c[1], tile: 5, size: Math.min(wd * 0.7, d * 0.6, 1.8), rot: a, yy: base + CUT_H - 0.05 });
      const n = Math.max(3, Math.min(40, Math.round(d / 0.29))), rise = Math.min(0.17, (h * 0.95) / n);
      for (let i = 0; i < n; i++) {
        const sm = -d / 2 + ((i + 0.5) * d) / n, sh = (i + 1) * rise;
        const sh2 = ((i + 1) / n) * (CUT_H - 0.1);
        add(cstairs, s.c[0] + Math.cos(a) * sm - ox, base + sh2 / 2, s.c[1] + Math.sin(a) * sm - oy, d / n, sh2, wd, -a, null);
        add(stairs, s.c[0] + Math.cos(a) * sm - ox, base + sh / 2, s.c[1] + Math.sin(a) * sm - oy, d / n, sh, wd, -a, null);
      }
    });

    // losa
    const shapes = [];
    const pts = (arr) => (arr || []).map((p) => new T.Vector2(p[0] - ox, p[1] - oy));
    (lv.slabs || []).forEach((sl) => {
      if (!sl.outer || sl.outer.length < 3) return;
      const sh = new T.Shape(pts(sl.outer));
      (sl.holes || []).forEach((hl) => { if (hl.length >= 3) sh.holes.push(new T.Path(pts(hl))); });
      shapes.push(sh);
    });
    if (!shapes.length) {
      shapes.push(new T.Shape([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]].map((p) => new T.Vector2(p[0] - ox, p[1] - oy))));
    }
    const slabGeo = track(new T.ExtrudeGeometry(shapes, { depth: SLAB_T, bevelEnabled: false }));
    slabGeo.rotateX(Math.PI / 2);
    slabGeo.translate(0, base, 0);

    // materiales
    const mats = {
      wall: mkMat('wall', '#ffffff', { roughness: 0.9, metalness: 0 }, 1, 0.28),
      slab: mkMat('slab:' + li, TONES[Math.min(li, TONES.length - 1)], { roughness: 0.85, metalness: 0, side: T.DoubleSide }, 1, 0.45),
      glass: mkMat('glass', '#2f6b66', { roughness: 0.08, metalness: 0.25, side: T.DoubleSide }, 0.55, 0.08, true),
      trim: mkMat('trim', '#ffffff', { roughness: 0.7, metalness: 0.05 }, 1, 0.25),
      stairs: mkMat('stairs', HEX.stairs, { roughness: 0.8, metalness: 0 }, 1, 0.3),
      shade: mkMat('shade', '#000000', { roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, 0.22, 0.22, true)
    };
    const lvRooms = (lv.rooms || []).filter((r) => r && Array.isArray(r.poly) && r.poly.length >= 3);
    if (lvRooms.length) {
      mats.patch = mkMat('patch', '#ffffff', {
        roughness: 0.95, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      }, 1, 0.3);
    }
    const meshes = {};
    meshes.slab = new T.Mesh(slabGeo, mats.slab);
    meshes.slab.castShadow = true; meshes.slab.receiveShadow = true; meshes.slab.userData.cast = true;
    meshes.wall = inst(boxNB, mats.wall, walls, true, true);
    meshes.glass = inst(boxGeo, mats.glass, glass, false, false);
    meshes.trim = inst(boxNB, mats.trim, trim, false, true);
    meshes.stairs = inst(boxNB, mats.stairs, stairs, true, true);
    meshes.cutWall = inst(boxNB, mats.wall, cwalls, true, true);
    meshes.cutStairs = inst(boxNB, mats.stairs, cstairs, true, true);
    if (shP.length) {
      const hg = track(new T.BufferGeometry());
      hg.setAttribute('position', new T.BufferAttribute(new Float32Array(shP), 3));
      const nr = new Float32Array(shP.length); for (let q = 1; q < nr.length; q += 3) nr[q] = 1;
      hg.setAttribute('normal', new T.BufferAttribute(nr, 3));
      meshes.shade = new T.Mesh(hg, mats.shade);
      meshes.shade.userData.cast = false;
    }

    // espacios: parche de piso por kind + contorno, una sola malla con color por vértice
    const signs = [];
    const hasBathRooms = lvRooms.some((r) => r.kind === 'sanitarios');
    if (lvRooms.length) {
      const P = [], Cc = [], doors = ops.filter((o) => o.type === 'door' && o.c);
      const outline = col('#33322f');
      // los espacios grandes van abajo y los pequeños encima (+1 mm por posición), así un baño nunca queda tapado por una sala amplia
      const order = lvRooms.map((r, k) => ({ r, k, a: num(r.a, polyArea(r.poly)) })).sort((p, q) => q.a - p.a);
      order.forEach(({ r, k }, rank) => {
        const lift = Math.min(0.012, rank * 0.0001);
        if (r.kind === 'vacio') return; // vacío/patio: sin parche ni contorno
        const poly = r.poly.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]));
        if (poly.length < 3) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        poly.forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
        const c = Array.isArray(r.c) && Number.isFinite(r.c[0]) ? r.c : [(x0 + x1) / 2, (y0 + y1) / 2];
        const kind = KIND[r.kind] ? r.kind : 'otro', id = r.id || lv.id + '-' + k;
        const pub = { id, text: r.t || '', kind, g: r.g || '', area: num(r.a, polyArea(poly)), numeric: !!r.n, x: c[0] - ox, y: base + 0.05, z: c[1] - oy, w: x1 - x0, d: y1 - y0 };
        roomMap.set(id, { pub, poly, li, c, base });
        (roomsByLevel[li] = roomsByLevel[li] || []).push(pub);
        const kc = col(KIND[kind]), n0 = P.length;
        polyTris(T, poly, ox, oy).forEach((t) => pushTri(P, t[0], t[1], t[2], base + 0.03 + lift));
        for (let q = n0; q < P.length; q += 3) Cc.push(kc.r, kc.g, kc.b);
        const r0 = P.length;
        ribbon(P, poly, base + 0.045 + lift, 0.15, ox, oy);
        for (let q = r0; q < P.length; q += 3) Cc.push(outline.r, outline.g, outline.b);
        if (kind === 'sanitarios') {
          const sz = Math.max(0.6, Math.min(1.6, 0.85 * Math.min(pub.w, pub.d)));
          signs.push({ x: c[0], y: c[1], tile: r.g === 'h' ? 0 : r.g === 'm' ? 1 : 2, size: sz });
          let bd = 0.9, bo = null; // «WC» sobre la puerta más cercana al espacio
          doors.forEach((o) => { const dd = distToPoly(o.c, poly); if (dd < bd) { bd = dd; bo = o; } });
          if (bo) signs.push({ x: bo.c[0], y: bo.c[1], tile: 4, size: 1, sw: 1.1, sh: 0.55 });
        }
      });
      if (P.length) {
        const pg = track(new T.BufferGeometry());
        pg.setAttribute('position', new T.BufferAttribute(new Float32Array(P), 3));
        const nr = new Float32Array(P.length); for (let q = 1; q < nr.length; q += 3) nr[q] = 1;
        pg.setAttribute('normal', new T.BufferAttribute(nr, 3));
        pg.setAttribute('color', new T.BufferAttribute(new Float32Array(Cc), 3));
        meshes.patch = new T.Mesh(pg, mats.patch);
        meshes.patch.receiveShadow = true; meshes.patch.userData.cast = false;
      }
    }
    // pictogramas de baños (si no hay rooms) y salidas: un solo plano fusionado
    if (!hasBathRooms) (lv.baths || []).forEach((b) => b.c && signs.push({ x: b.c[0], y: b.c[1], tile: b.g === 'h' ? 0 : b.g === 'm' ? 1 : 2, size: 1.2 }));
    (lv.exits || []).forEach((e) => e.c && signs.push({ x: e.c[0], y: e.c[1], tile: 3, size: 1.6 }));
    stairArrows.forEach((a) => signs.push(a));
    if (signs.length) {
      const sg = track(buildSigns(T, signs, base + 0.06, ox, oy));
      const sm = track(new T.MeshBasicMaterial({
        map: atlas, color: atlas ? 0xffffff : 0x1f9d63, transparent: true, alphaTest: 0.05,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
      }));
      meshes.signs = new T.Mesh(sg, sm);
      meshes.signs.userData.cast = false;
    }
    Object.keys(meshes).forEach((k) => meshes[k] && g.add(meshes[k]));
    root.add(g);
    levelObjs.push({ id: lv.id, base, h, group: g, mats, meshes });
  });

  // ---- techo con parapeto -------------------------------------------------
  const roof = new T.Group();
  roof.name = 'techo';
  const roofMats = {
    slab: mkMat('roof', HEX.roof, { roughness: 0.9, metalness: 0, side: T.DoubleSide }, 1, 1),
    par: mkMat('wall', '#ffffff', { roughness: 0.85, metalness: 0 }, 1, 1)
  };
  let topExtra = PARAPET_H + 0.06;
  if (levels.length) {
    const top = levels[levels.length - 1];
    const shapes = [];
    const pts = (arr) => arr.map((p) => new T.Vector2(p[0] - ox, p[1] - oy));
    const polys = [];
    (top.slabs || []).forEach((sl) => {
      if (!sl.outer || sl.outer.length < 3) return;
      const sh = new T.Shape(pts(sl.outer));
      polys.push([sl.outer, false]);
      (sl.holes || []).forEach((hl) => { if (hl.length >= 3) { sh.holes.push(new T.Path(pts(hl))); polys.push([hl, true]); } });
      shapes.push(sh);
    });
    if (!shapes.length) {
      const r = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
      shapes.push(new T.Shape(pts(r)));
      polys.push([r, false]);
    }
    const rg = track(new T.ExtrudeGeometry(shapes, { depth: SLAB_T, bevelEnabled: false }));
    rg.rotateX(Math.PI / 2);
    rg.translate(0, H + SLAB_T, 0);
    const rm = new T.Mesh(rg, roofMats.slab);
    rm.castShadow = true; rm.receiveShadow = true;
    roof.add(rm);

    const par = newList(), yTop = H + SLAB_T;
    const pt = 0.22;
    polys.forEach(([poly, isHole]) => {
      let A = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        A += p[0] * q[1] - q[0] * p[1];
      }
      const side = (A >= 0 ? 1 : -1) * (isHole ? -1 : 1);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
        if (len < 0.05) continue;
        const nx = (-dy / len) * side * (pt / 2), ny = (dx / len) * side * (pt / 2);
        const mx = (p[0] + q[0]) / 2 + nx - ox, my = (p[1] + q[1]) / 2 + ny - oy, ry = -Math.atan2(dy, dx);
        add(par, mx, yTop + PARAPET_H / 2, my, len + pt, PARAPET_H, pt, ry, C.ext);
        add(par, mx, yTop + PARAPET_H + 0.03, my, len + pt + 0.04, 0.06, pt + 0.1, ry, C.zoc);
      }
    });
    (top.stairs || []).forEach((s) => {
      if (!s.c) return;
      const a = (num(s.ang, 0) * Math.PI) / 180;
      add(par, s.c[0] - ox, yTop + HOUSING_H / 2, s.c[1] - oy, num(s.d, 4) + 0.4, HOUSING_H, num(s.w, 2.4) + 0.4, -a, C.ext);
      topExtra = HOUSING_H;
    });
    const pm = inst(boxNB, roofMats.par, par, true, true);
    if (pm) roof.add(pm);
  }
  root.add(roof);

  // ---- resaltado (relleno + borde dinámicos, haz y etiqueta) ----------------
  const hl = new T.Group();
  hl.visible = false;
  const dyn = (color, opacity, order) => {
    const g0 = new T.BufferGeometry();
    g0.setAttribute('position', new T.BufferAttribute(new Float32Array(0), 3));
    const m = new T.Mesh(g0, track(new T.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6
    })));
    m.renderOrder = order; m.visible = false;
    track({ dispose: () => m.geometry.dispose() });
    return m;
  };
  const setP = (m, P) => {
    m.geometry.dispose();
    m.geometry = new T.BufferGeometry();
    m.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(P), 3));
    m.visible = P.length > 0;
  };
  const hlFill = dyn(0xf5cc54, 0.5, 3), hlEdge = dyn(0xffe28a, 0.95, 4), hover = dyn(0x6ed7b2, 0.45, 2);
  const beamMat = track(new T.MeshBasicMaterial({
    color: 0xf5cc54, transparent: true, opacity: 0.45, depthWrite: false, alphaMap: gradTex || null, side: T.DoubleSide
  }));
  const none = track(new T.MeshBasicMaterial({ visible: false }));
  const hlBeam = new T.Mesh(boxGeo, [beamMat, beamMat, none, none, beamMat, beamMat]);
  hlBeam.renderOrder = 3; hlBeam.scale.set(0, 0, 0); // sin volumen hasta highlight()
  hl.add(hlFill, hlEdge, hlBeam);
  let lblCanvas = null, lblTex = null, lblMesh = null;
  if (typeof document !== 'undefined') {
    try {
      lblCanvas = document.createElement('canvas'); lblCanvas.width = 512; lblCanvas.height = 96;
      lblTex = track(new T.CanvasTexture(lblCanvas));
      if (T.SRGBColorSpace) lblTex.colorSpace = T.SRGBColorSpace;
      const lg = track(new T.PlaneGeometry(1, 1)); lg.rotateX(-Math.PI / 2);
      lblMesh = new T.Mesh(lg, track(new T.MeshBasicMaterial({ map: lblTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 })));
      lblMesh.renderOrder = 5; lblMesh.scale.set(0, 0, 0);
      hl.add(lblMesh);
    } catch (e) { lblMesh = null; }
  }
  function drawLabel(text) {
    const cx = lblCanvas.getContext('2d');
    if (!cx) return false;
    cx.clearRect(0, 0, 512, 96);
    cx.fillStyle = 'rgba(30,32,36,0.8)';
    cx.beginPath(); cx.moveTo(24, 6); cx.arcTo(506, 6, 506, 90, 24); cx.arcTo(506, 90, 6, 90, 24); cx.arcTo(6, 90, 6, 6, 24); cx.arcTo(6, 6, 506, 6, 24); cx.closePath(); cx.fill();
    cx.strokeStyle = '#f5cc54'; cx.lineWidth = 4; cx.stroke();
    let px = 44; cx.font = '600 ' + px + 'px sans-serif';
    while (px > 18 && cx.measureText(text).width > 470) { px -= 2; cx.font = '600 ' + px + 'px sans-serif'; }
    cx.fillStyle = '#ffffff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(text, 256, 50);
    lblTex.needsUpdate = true;
    return true;
  }
  root.add(hl, hover);
  let hlIdx = -1, hovIdx = -1;

  // ---- estado / tema -------------------------------------------------------
  let cut = -1, curTheme = theme === 'dark' ? 'dark' : 'light';
  const tmp = new T.Color();
  function paint(m, dim, pal, i) {
    const u = m.userData;
    if (u.role === 'glass') {
      m.color.set(pal.glass);
      m.emissive.set(pal.emi); m.emissiveIntensity = pal.emiI;
    } else {
      m.color.copy(u.base).multiply(tmp.set(pal.tint));
    }
    if (dim) m.color.lerp(GREY, 0.55);
    const op = dim ? u.dimOp : (u.role === 'glass' ? pal.glassOp : u.op);
    m.opacity = op;
    m.transparent = u.alwaysT || dim;
    m.depthWrite = !m.transparent;
  }
  function refresh() {
    const pal = PAL[curTheme];
    levelObjs.forEach((L, i) => {
      const dim = cut >= 0 && i < cut;
      L.group.visible = cut < 0 || i <= cut;
      Object.values(L.mats).forEach((m) => paint(m, dim, pal, i));
      Object.values(L.meshes).filter(Boolean).forEach((me) => { me.castShadow = !!me.userData.cast && !dim; });
      if (L.meshes.signs) L.meshes.signs.visible = !dim;
      const act = cut >= 0 && i === cut; // corte arquitectónico en el nivel activo
      ['wall', 'trim', 'glass', 'stairs'].forEach((k) => { if (L.meshes[k]) L.meshes[k].visible = !act; });
      ['cutWall', 'cutStairs', 'shade'].forEach((k) => { if (L.meshes[k]) L.meshes[k].visible = act; });
    });
    Object.values(roofMats).forEach((m) => paint(m, false, pal, 0));
    roof.visible = cut < 0;
    hl.visible = hlIdx >= 0 && (cut < 0 || hlIdx <= cut);
    hover.visible = hovIdx >= 0 && (cut < 0 || hovIdx <= cut);
  }
  const idxOf = (id) => levelObjs.findIndex((L) => L.id === id);

  // ---- API ------------------------------------------------------------------
  const api = {
    group: root,
    size: { w: bx1 - bx0, d: by1 - by0, h: H + SLAB_T + topExtra },
    levelBase(id) { const i = idxOf(id); return i < 0 ? 0 : bases[i]; },
    setLevel(id) { cut = id == null ? -1 : idxOf(id); refresh(); },
    highlight(levelId, rect, label, roomId) {
      let i = idxOf(levelId), poly = null, lc = null;
      const rr = roomId ? roomMap.get(roomId) : null;
      if (rr) { i = rr.li; poly = rr.poly; lc = rr.c; }
      else if (i >= 0 && rect && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) {
        const w2 = Math.max(rect.w, 0.3) / 2, h2 = Math.max(rect.h, 0.3) / 2;
        poly = [[rect.x - w2, rect.y - h2], [rect.x + w2, rect.y - h2], [rect.x + w2, rect.y + h2], [rect.x - w2, rect.y + h2]];
        lc = [rect.x, rect.y];
      }
      if (i < 0 || !poly) { hlIdx = -1; refresh(); return null; }
      hlIdx = i;
      const y = bases[i], P = [], E = [];
      polyTris(T, poly, ox, oy).forEach((t) => pushTri(P, t[0], t[1], t[2], y + 0.065));
      ribbon(E, poly, y + 0.07, 0.22, ox, oy);
      setP(hlFill, P); setP(hlEdge, E);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      poly.forEach((q) => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      hlBeam.scale.set(Math.max(x1 - x0, 0.3), BEAM_H, Math.max(y1 - y0, 0.3));
      hlBeam.position.set((x0 + x1) / 2 - ox, y + BEAM_H / 2, (y0 + y1) / 2 - oy);
      const x = lc[0] - ox, z = lc[1] - oy;
      hl.userData.label = label || '';
      if (lblMesh) {
        const txt = String(label || '');
        if (txt && drawLabel(txt)) {
          const lw = Math.min(12, Math.max(3, txt.length * 0.45 + 1));
          lblMesh.scale.set(lw, 1, (lw * 96) / 512); lblMesh.position.set(x, y + 0.16, z);
        } else lblMesh.scale.set(0, 0, 0);
      }
      refresh();
      return { x, y: y + 1, z };
    },
    roomsOf(levelId) { const i = idxOf(levelId); return i < 0 ? [] : (roomsByLevel[i] || []).map((r) => ({ ...r })); },
    getRoom(id) { const r = roomMap.get(id); return r ? { ...r.pub } : null; },
    setRoomHover(id) {
      const r = id ? roomMap.get(id) : null;
      if (!r) { hovIdx = -1; hover.visible = false; return; }
      hovIdx = r.li;
      const P = [];
      polyTris(T, r.poly, ox, oy).forEach((t) => pushTri(P, t[0], t[1], t[2], r.base + 0.055));
      setP(hover, P);
      refresh();
    },
    setTheme(t) { curTheme = t === 'dark' ? 'dark' : 'light'; refresh(); },
    dispose() {
      disposables.forEach((d) => { try { d.dispose(); } catch (e) { /* ya liberado */ } });
      disposables.length = 0;
      root.clear();
    }
  };
  refresh();
  return api;
}

// ---- helpers (sin THREE global) ---------------------------------------------
function polyArea(poly) {
  let A = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; A += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(A) / 2;
}
function distToPoly(c, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(c[0] - p[0] - t * dx, c[1] - p[1] - t * dy));
  }
  return best;
}
// triángulo (a,b,c = [X,Z]) orientado hacia +Y, a P plano
function pushTri(P, a, b, c, y) {
  if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) { const t = b; b = c; c = t; }
  P.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
}
function polyTris(T, poly, ox, oy) {
  const pts = poly.map((p) => new T.Vector2(p[0] - ox, p[1] - oy));
  try {
    return T.ShapeUtils.triangulateShape(pts, []).map((t) => t.map((i) => [pts[i].x, pts[i].y]));
  } catch (e) { return []; }
}
// cinta plana de ancho wd sobre el contorno
function ribbon(P, poly, y, wd, ox, oy) {
  const e = wd / 2;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    if (len < 0.02) continue;
    const ux = dx / len, uy = dy / len, nx = -uy * e, ny = ux * e;
    const a0 = [p[0] - ux * e + nx - ox, p[1] - uy * e + ny - oy], a1 = [p[0] - ux * e - nx - ox, p[1] - uy * e - ny - oy];
    const b0 = [q[0] + ux * e + nx - ox, q[1] + uy * e + ny - oy], b1 = [q[0] + ux * e - nx - ox, q[1] + uy * e - ny - oy];
    pushTri(P, a0, a1, b1, y); pushTri(P, a0, b1, b0, y);
  }
}
function buildSigns(T, signs, y, ox, oy) {
  const n = signs.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), nor = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  signs.forEach((s, i) => {
    const rx = (s.sw || s.size) / 2, rz = (s.sh || s.size) / 2, x = s.x - ox, z = s.y - oy, u0 = s.tile / 6 + 0.003, u1 = (s.tile + 1) / 6 - 0.003;
    const ph = s.rot == null ? 0 : s.rot + Math.PI / 2, cs = Math.cos(ph), sn = Math.sin(ph), yy = s.yy == null ? y : s.yy;
    const cr = [[-rx, -rz], [rx, -rz], [rx, rz], [-rx, rz]];
    cr.forEach((q, k) => pos.set([x + q[0] * cs - q[1] * sn, yy, z + q[0] * sn + q[1] * cs], i * 12 + k * 3));
    uv.set([u0, 1, u1, 1, u1, 0, u0, 0], i * 8);
    for (let k = 0; k < 4; k++) nor[i * 12 + k * 3 + 1] = 1;
    idx.set([0, 3, 2, 0, 2, 1].map((v) => v + i * 4), i * 6);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(new T.BufferAttribute(idx, 1));
  return g;
}

function makeAtlas(T) {
  const c = document.createElement('canvas');
  c.width = 1536; c.height = 256;
  const x = c.getContext('2d');
  if (!x) return null;
  x.scale(2, 2);
  const tile = (i, bg, fn) => {
    x.save(); x.translate(i * 128, 0);
    x.fillStyle = bg;
    x.beginPath();
    const r = 18;
    x.moveTo(8 + r, 8); x.arcTo(120, 8, 120, 120, r); x.arcTo(120, 120, 8, 120, r); x.arcTo(8, 120, 8, 8, r); x.arcTo(8, 8, 120, 8, r);
    x.closePath(); x.fill();
    x.strokeStyle = '#6ED7B2'; x.lineWidth = 4; x.stroke();
    x.fillStyle = '#ffffff'; x.strokeStyle = '#ffffff';
    fn();
    x.restore();
  };
  const circle = (cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const man = (px, s) => {
    x.save(); x.translate(px - 64 * s, 64 - 64 * s); x.scale(s, s);
    circle(64, 32, 11); x.fillRect(49, 48, 30, 40); x.fillRect(50, 88, 11, 28); x.fillRect(67, 88, 11, 28);
    x.restore();
  };
  const woman = (px, s) => {
    x.save(); x.translate(px - 64 * s, 64 - 64 * s); x.scale(s, s);
    circle(64, 32, 11);
    x.beginPath(); x.moveTo(64, 46); x.lineTo(86, 94); x.lineTo(42, 94); x.closePath(); x.fill();
    x.fillRect(54, 94, 8, 22); x.fillRect(66, 94, 8, 22);
    x.restore();
  };
  tile(0, '#2f6fb0', () => man(64, 1));
  tile(1, '#b03a82', () => woman(64, 1));
  tile(2, '#5d6670', () => { man(40, 0.62); woman(88, 0.62); x.fillRect(62, 24, 4, 80); });
  tile(3, '#1f9d63', () => {
    circle(76, 36, 10); x.lineCap = 'round'; x.lineWidth = 10;
    const ln = (a, b, c, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
    ln(70, 50, 56, 78); ln(70, 52, 90, 62); ln(60, 60, 42, 56); ln(56, 78, 72, 98); ln(56, 78, 40, 100);
  });
  x.save(); x.translate(5 * 128, 0); // flecha de subida (sin fondo)
  x.fillStyle = '#2f3a3a'; x.strokeStyle = '#ffffff'; x.lineWidth = 7; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(64, 10); x.lineTo(100, 62); x.lineTo(76, 62); x.lineTo(76, 118); x.lineTo(52, 118); x.lineTo(52, 62); x.lineTo(28, 62); x.closePath();
  x.stroke(); x.fill(); x.restore();
  tile(4, '#1d2b33', () => {
    x.font = '700 62px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('WC', 64, 68);
  });
  const t = new T.CanvasTexture(c);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeGradient(T) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#000000'); g.addColorStop(1, '#ffffff');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  return new T.CanvasTexture(c);
}
