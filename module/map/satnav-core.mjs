// Sat nav core: one road network for all twenty London street maps, routes along it, and turn-by-turn steps.
// Pure functions, no Foundry. The street maps are tiles cut from one traced London, so a point on any map has a single
// global position, (col × width + x, row × height + y), and the London overview map is the same city at 0.32 scale.
// The road network is rebuilt from the traced road lines every map stores (each map also carries the roads that run
// just past its edges, so the shared pieces are merged once).

export const OVERVIEW_ID = 'LDN-OVERVIEW';
/** Cost per pixel by road class. Drivers favour main roads and keep off footpaths; on foot every way is fair. */
export const ROAD_COST = Object.freeze({drive: {A: 0.85, B: 0.95, C: 1.1, P: 8}, walk: {A: 1, B: 1, C: 1, P: 0.9}});
/** A side road whose end comes this close to another road's drawn edge joins it (px; one square of slack). */
export const SNAP = 100;
const WIDTH = {A: 320, B: 250, C: 170, P: 120};
/** Average London speeds for the time estimate (metres per minute): 12 mph in traffic, 10 mph by bike, 3 mph on foot. */
export const SPEED = Object.freeze({drive: 322, bike: 268, walk: 80});

export const tileOf = (atlas, mapId) => (atlas?.maps || []).find(m => m.id === mapId) ?? null;
export const origin = m => [Number(m.col) * Number(m.width), Number(m.row) * Number(m.height)];
/** Global position of a point (px) on a street map. */
export function toGlobal(atlas, mapId, x, y) { const m = tileOf(atlas, mapId); if (!m) return null; const [ox, oy] = origin(m); return [ox + Number(x), oy + Number(y)]; }
/** The street map a global position falls on, with the position on it. */
export function toLocal(atlas, X, Y) {
  const m = (atlas?.maps || []).find(t => { const [ox, oy] = origin(t); return X >= ox && X < ox + t.width && Y >= oy && Y < oy + t.height; });
  if (!m) return null; const [ox, oy] = origin(m); return {mapId: m.id, map: m, x: X - ox, y: Y - oy};
}
export function worldSize(atlas) {
  let w = 0, h = 0; for (const m of atlas?.maps || []) { const [ox, oy] = origin(m); w = Math.max(w, ox + m.width); h = Math.max(h, oy + m.height); }
  return [w, h];
}
/** Overview px per global px (0.32 for the supplied maps): the overview's first district box against its street map. */
export function overviewScale(atlas, overview) {
  const ov = (overview?.maps || []).find(m => m.id === OVERVIEW_ID) ?? overview?.maps?.[0];
  const z = ov?.zones?.find(q => q.kind === 'district'), link = ov?.links?.find(l => l.rect?.[0] === z?.rect?.[0] && l.rect?.[1] === z?.rect?.[1]);
  const m = tileOf(atlas, link?.to) ?? atlas?.maps?.[0];
  return z && m ? z.rect[2] / m.width : 0.32;
}
/** Metres per global px: the traced reference frame is about 2 m per reference px, drawn `scale` times larger. */
export const metresPerPx = atlas => 2 / (Number(atlas?.scale) || 8.29);

/* ------------------------------------------------------------------ geometry */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const keyOf = p => `${Math.round(p[0])},${Math.round(p[1])}`;
/** Closest point to p on segment ab: {t, p, d}. */
export function project(p, a, b) {
  const ab = sub(b, a), len2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2)) : 0;
  const q = lerp(a, b, t); return {t, p: q, d: dist(p, q)};
}
/** Where segments ab and cd cross: the parameters on each, or null. */
function crossing(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
  const ca = sub(c, a), t = (ca[0] * s[1] - ca[1] * s[0]) / den, u = (ca[0] * r[1] - ca[1] * r[0]) / den;
  const e = 1e-9; return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? {t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u))} : null;
}
/** Compass bearing in degrees (0 = north, clockwise) of the step from a to b; maps are north-up. */
export const bearing = (a, b) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360;
/** Signed turn from heading h1 to h2, in degrees: negative is left, positive is right. */
export const turnAngle = (h1, h2) => ((h2 - h1 + 540) % 360) - 180;
export const compass = h => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((h % 360) + 360) % 360 / 45) % 8];

/* ------------------------------------------------------------------ the road network */
/**
 * Every traced road as one graph: nodes where roads meet, cross or end; edges along the roads with their name and
 * class. Roads that cross get a junction; a side road that stops just short of another (within SNAP) joins it.
 */
export function roadNetwork(atlas) {
  const segs = [], seen = new Set();
  for (const m of atlas?.maps || []) {
    const [ox, oy] = origin(m);
    for (const r of m.roads || []) {
      const pts = (r.pts || []).map(([x, y]) => [ox + Math.round(Number(x)), oy + Math.round(Number(y))]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (a[0] === b[0] && a[1] === b[1]) continue;
        const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
        const k = `${r.name}|${p}|${q}`; if (seen.has(k)) continue; seen.add(k);
        const cls = ['A', 'B', 'C', 'P'].includes(r.cls) ? r.cls : 'C';
        segs.push({a, b, name: String(r.name || 'Unnamed road'), cls, width: Number(r.width) || WIDTH[cls]});
      }
    }
  }
  const cuts = segs.map(s => [{t: 0, p: s.a}, {t: 1, p: s.b}]);
  // a coarse grid so only nearby segments are compared
  const CELL = 1200, grid = new Map(), cellsOf = (a, b, pad = 0) => {
    const out = []; for (let gx = Math.floor((Math.min(a[0], b[0]) - pad) / CELL); gx <= Math.floor((Math.max(a[0], b[0]) + pad) / CELL); gx++)
      for (let gy = Math.floor((Math.min(a[1], b[1]) - pad) / CELL); gy <= Math.floor((Math.max(a[1], b[1]) + pad) / CELL); gy++) out.push(`${gx},${gy}`);
    return out;
  };
  segs.forEach((s, i) => { for (const c of cellsOf(s.a, s.b)) (grid.get(c) ?? grid.set(c, []).get(c)).push(i); });
  const near = (a, b, pad = 0) => { const set = new Set(); for (const c of cellsOf(a, b, pad)) for (const i of grid.get(c) || []) set.add(i); return set; };
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  // crossings
  segs.forEach((s, i) => {
    for (const j of near(s.a, s.b)) {
      if (j <= i) continue; const o = segs[j];
      if (same(s.a, o.a) || same(s.a, o.b) || same(s.b, o.a) || same(s.b, o.b)) continue;
      const x = crossing(s.a, s.b, o.a, o.b); if (!x) continue;
      const p = lerp(s.a, s.b, x.t).map(Math.round); cuts[i].push({t: x.t, p}); cuts[j].push({t: x.u, p});
    }
  });
  // Loose ends: where a road stops (or two roads meet end to end) without another road passing through. If another
  // road comes within reach there, the drawn roads touch, so they join: a side road that stops just short of a main
  // road, or two roads that meet a cross street a few metres apart.
  const reach = Math.max(...Object.values(WIDTH)) + SNAP, touch = new Map();
  const at = p => touch.get(keyOf(p)) ?? touch.set(keyOf(p), {names: new Map(), crossed: false}).get(keyOf(p));
  segs.forEach(s => { for (const p of [s.a, s.b]) { const t = at(p); t.names.set(s.name, (t.names.get(s.name) || 0) + 1); } });
  cuts.forEach(list => { for (const c of list) if (c.t > 0 && c.t < 1) at(c.p).crossed = true; });
  const links = [], done = new Set();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const t = touch.get(keyOf(p)); if (t.crossed || t.names.size > 2 || [...t.names.values()].some(n => n > 1)) continue;
      let best = null;
      for (const j of near(p, p, reach)) {
        const o = segs[j]; if (t.names.has(o.name) || same(o.a, p) || same(o.b, p)) continue;
        const pr = project(p, o.a, o.b); if (pr.d <= (s.width + o.width) / 2 + SNAP && (!best || pr.d < best.d)) best = {...pr, j};
      }
      if (!best) continue;
      const q = best.p.map(Math.round), k = `${keyOf(p)}>${keyOf(q)}`; if (done.has(k)) continue; done.add(k);
      cuts[best.j].push({t: best.t, p: q});
      if (keyOf(q) !== keyOf(p)) links.push({a: p, b: q, name: s.name, cls: s.cls});
    }
  });
  // nodes and edges
  const nodes = [], index = new Map(), edges = [];
  const node = p => { const k = keyOf(p); if (!index.has(k)) { index.set(k, nodes.length); nodes.push({x: Math.round(p[0]), y: Math.round(p[1]), edges: []}); } return index.get(k); };
  const edge = (p, q, name, cls) => {
    const u = node(p), v = node(q); if (u === v) return;
    const len = dist([nodes[u].x, nodes[u].y], [nodes[v].x, nodes[v].y]), id = edges.length;
    edges.push({u, v, len, name, cls}); nodes[u].edges.push(id); nodes[v].edges.push(id);
  };
  segs.forEach((s, i) => {
    const list = cuts[i].sort((x, y) => x.t - y.t);
    for (let k = 1; k < list.length; k++) edge(list[k - 1].p, list[k].p, s.name, s.cls);
  });
  for (const l of links) edge(l.a, l.b, l.name, l.cls);
  return largestPart({nodes, edges, scale: metresPerPx(atlas)});
}
/** Bridge a stray road piece to the main network when it ends within BRIDGE px of it; drop it otherwise. */
export const BRIDGE = 800;
function parts(net) {
  const part = new Int32Array(net.nodes.length).fill(-1), sizes = [];
  for (let i = 0; i < net.nodes.length; i++) {
    if (part[i] >= 0) continue; const stack = [i]; part[i] = sizes.length; let n = 0;
    while (stack.length) { const v = stack.pop(); n++; for (const id of net.nodes[v].edges) { const e = net.edges[id], o = e.u === v ? e.v : e.u; if (part[o] < 0) { part[o] = sizes.length; stack.push(o); } } }
    sizes.push(n);
  }
  return {part, sizes, main: sizes.indexOf(Math.max(...sizes))};
}
/** Keep one connected network: a stray road piece that joins nothing would strand a route. */
function largestPart(net) {
  for (let guard = 0; guard < 50; guard++) {
    const {part, sizes, main} = parts(net); if (sizes.length < 2) break;
    let best = null;
    net.nodes.forEach((n, i) => {
      if (part[i] === main) return;
      net.edges.forEach((e, id) => { if (part[e.u] !== main) return; const pr = project([n.x, n.y], [net.nodes[e.u].x, net.nodes[e.u].y], [net.nodes[e.v].x, net.nodes[e.v].y]); if (!best || pr.d < best.d) best = {...pr, node: i, edge: id}; });
    });
    if (!best || best.d > BRIDGE) break;
    // split the main road where the bridge meets it, then lay the bridge (named after the stray road)
    const e = net.edges[best.edge], q = best.p.map(Math.round), from = net.nodes[best.node], stray = net.edges[from.edges[0]];
    let mid = [e.u, e.v].find(v => net.nodes[v].x === q[0] && net.nodes[v].y === q[1]);
    if (mid === undefined) {
      mid = net.nodes.length; net.nodes.push({x: q[0], y: q[1], edges: []});
      const tail = {u: mid, v: e.v, name: e.name, cls: e.cls, len: Math.hypot(net.nodes[e.v].x - q[0], net.nodes[e.v].y - q[1])};
      net.nodes[e.v].edges = net.nodes[e.v].edges.filter(x => x !== best.edge); e.v = mid; e.len = Math.hypot(net.nodes[e.u].x - q[0], net.nodes[e.u].y - q[1]);
      net.nodes[mid].edges.push(best.edge); const tid = net.edges.length; net.edges.push(tail); net.nodes[mid].edges.push(tid); net.nodes[tail.v].edges.push(tid);
    }
    const bid = net.edges.length; net.edges.push({u: best.node, v: mid, name: stray.name, cls: stray.cls, len: best.d, bridge: true}); from.edges.push(bid); net.nodes[mid].edges.push(bid);
  }
  const {part, main} = parts(net), map = new Int32Array(net.nodes.length).fill(-1), nodes = [], edges = [];
  net.nodes.forEach((n, i) => { if (part[i] === main) { map[i] = nodes.length; nodes.push({x: n.x, y: n.y, edges: []}); } });
  for (const e of net.edges) { if (map[e.u] < 0) continue; const id = edges.length; edges.push({...e, u: map[e.u], v: map[e.v]}); nodes[map[e.u]].edges.push(id); nodes[map[e.v]].edges.push(id); }
  return {nodes, edges, scale: net.scale, dropped: net.edges.length - edges.length};
}

/** The closest point on the network to a global position. Drivers are kept off footpaths unless nothing else is near. */
export function nearestOnNetwork(net, X, Y, {mode = 'drive'} = {}) {
  let best = null, road = null; const p = [X, Y];
  net.edges.forEach((e, id) => {
    const a = [net.nodes[e.u].x, net.nodes[e.u].y], b = [net.nodes[e.v].x, net.nodes[e.v].y], pr = project(p, a, b), hit = {...pr, edge: id};
    if (!best || pr.d < best.d) best = hit;
    if (e.cls !== 'P' && (!road || pr.d < road.d)) road = hit;
  });
  if (mode === 'drive' && road && best && best.edge !== road.edge && road.d < best.d + 400) return road;
  return best;
}

/** Shortest way between two global positions along the roads, or null when there is no way. */
export function findRoute(net, from, to, {mode = 'drive'} = {}) {
  if (!net?.edges?.length) return null;
  const cost = ROAD_COST[mode] ?? ROAD_COST.drive, w = e => e.len * (cost[e.cls] ?? 1);
  const s = nearestOnNetwork(net, from[0], from[1], {mode}), g = nearestOnNetwork(net, to[0], to[1], {mode}); if (!s || !g) return null;
  const se = net.edges[s.edge], ge = net.edges[g.edge];
  const n = net.nodes.length, best = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = []; const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const seed = (v, d) => { if (d < best[v]) { best[v] = d; prev[v] = -2; push(d, v); } };
  seed(se.u, w(se) * s.t); seed(se.v, w(se) * (1 - s.t));
  // the same road piece: straight along it
  let total = Infinity, end = -1;
  if (s.edge === g.edge) total = w(se) * Math.abs(s.t - g.t);
  const finish = v => v === ge.u ? w(ge) * g.t : v === ge.v ? w(ge) * (1 - g.t) : Infinity;
  while (heap.length) {
    const [d, v] = pop(); if (d > best[v]) continue; if (d >= total) break;
    const f = d + finish(v); if (f < total) { total = f; end = v; }
    for (const id of net.nodes[v].edges) { const e = net.edges[id], o = e.u === v ? e.v : e.u, nd = d + w(e); if (nd < best[o]) { best[o] = nd; prev[o] = id; push(nd, o); } }
  }
  if (!Number.isFinite(total)) return null;
  // the path: from → onto the road → junctions → off the road → to
  const pieces = [];
  if (end >= 0) {
    const chain = []; let v = end; while (prev[v] >= 0) { const e = net.edges[prev[v]], o = e.u === v ? e.v : e.u; chain.unshift({id: prev[v], from: o, to: v}); v = o; }
    const first = v; // the node we joined the network at
    pieces.push({name: se.name, cls: se.cls, pts: [s.p, [net.nodes[first].x, net.nodes[first].y]]});
    for (const c of chain) { const e = net.edges[c.id]; pieces.push({name: e.name, cls: e.cls, pts: [[net.nodes[c.from].x, net.nodes[c.from].y], [net.nodes[c.to].x, net.nodes[c.to].y]]}); }
    pieces.push({name: ge.name, cls: ge.cls, pts: [[net.nodes[end].x, net.nodes[end].y], g.p]});
  } else pieces.push({name: se.name, cls: se.cls, pts: [s.p, g.p]});
  // merge consecutive pieces of the same road into legs
  const legs = [];
  for (const p of pieces) {
    if (dist(p.pts[0], p.pts[1]) < 0.5) continue;
    const last = legs.at(-1);
    if (last && last.name === p.name) { last.pts.push(p.pts[1]); last.len += dist(p.pts[0], p.pts[1]); }
    else legs.push({name: p.name, cls: p.cls, pts: [p.pts[0], p.pts[1]], len: dist(p.pts[0], p.pts[1])});
  }
  const roadLen = legs.reduce((n, l) => n + l.len, 0), onto = dist(from, s.p), off = dist(g.p, to);
  const points = [from, ...legs.flatMap((l, i) => i ? l.pts.slice(1) : l.pts), to];
  return {mode, from, to, start: s.p, goal: g.p, legs, points, onto, off, length: onto + roadLen + off, roadLength: roadLen, metres: (onto + roadLen + off) * net.scale};
}

/* ------------------------------------------------------------------ turn by turn */
/** Heading at the end (or start) of a leg, measured over its last (first) 120 px so kinks in the tracing don't count. */
function legHeading(leg, atEnd) {
  const pts = atEnd ? leg.pts.slice().reverse() : leg.pts; let a = pts[0], b = pts[1], run = 0;
  for (let i = 1; i < pts.length; i++) { b = pts[i]; run += dist(pts[i - 1], pts[i]); if (run >= 120) break; }
  return atEnd ? bearing(b, a) : bearing(a, b);
}
export function turnKind(angle) {
  const a = Math.abs(angle), side = angle < 0 ? 'left' : 'right';
  if (a < 22) return 'straight'; if (a < 55) return `slight-${side}`; if (a < 150) return side; return 'uturn';
}
/**
 * Steps for a route: depart, every change of road (with the turn), every crossing to another street map (by its road
 * exit), and arrival. Each step has `at` (global px) and `dist` (px from the start of the route).
 */
export function routeSteps(route, atlas, {label = 'your destination'} = {}) {
  if (!route) return [];
  const steps = [], legs = route.legs;
  let run = route.onto;
  if (legs.length) steps.push({type: 'depart', kind: 'depart', road: legs[0].name, heading: legHeading(legs[0], false), at: legs[0].pts[0], dist: run, text: `Head ${compass(legHeading(legs[0], false))} on ${legs[0].name}`});
  legs.forEach((leg, i) => {
    // a short stretch you only drive straight through (a road changing its name at a junction) gets no step of its own
    if (i && !(leg.len < 300 && i < legs.length - 1 && Math.abs(turnAngle(legHeading(legs[i - 1], true), legHeading(leg, false))) < 55)) {
      const angle = turnAngle(legHeading(legs[i - 1], true), legHeading(leg, false)), kind = turnKind(angle);
      const verb = {straight: 'Continue onto', 'slight-left': 'Bear left onto', 'slight-right': 'Bear right onto', left: 'Turn left onto', right: 'Turn right onto', uturn: 'Turn round onto'}[kind];
      steps.push({type: 'turn', kind, angle: Math.round(angle), road: leg.name, from: legs[i - 1].name, at: leg.pts[0], dist: run, text: `${verb} ${leg.name}`});
    }
    // crossings to the next street map along this leg
    for (let k = 1; k < leg.pts.length; k++) {
      const a = leg.pts[k - 1], b = leg.pts[k], la = toLocal(atlas, ...a), lb = toLocal(atlas, ...b);
      if (la && lb && la.mapId !== lb.mapId) {
        const [ox, oy] = origin(lb.map), edgeX = lb.map.col !== la.map.col, t = edgeX ? ((lb.map.col > la.map.col ? ox : ox + lb.map.width) - a[0]) / (b[0] - a[0]) : ((lb.map.row > la.map.row ? oy : oy + lb.map.height) - a[1]) / (b[1] - a[1]);
        const side = edgeX ? (lb.map.col > la.map.col ? 'east' : 'west') : (lb.map.row > la.map.row ? 'south' : 'north');
        const at = lerp(a, b, Math.max(0, Math.min(1, t)));
        steps.push({type: 'cross', kind: 'cross', road: leg.name, side, fromMap: la.mapId, toMap: lb.mapId, toName: lb.map.name, at, dist: run + dist(a, at), text: `Leave by the ${side} exit on ${leg.name} into ${lb.map.name}`});
      }
      run += dist(a, b);
    }
  });
  steps.push({type: 'arrive', kind: 'arrive', at: route.to, dist: route.length, text: `Arrive at ${label}`});
  return steps.sort((x, y) => x.dist - y.dist);
}

/* ------------------------------------------------------------------ display helpers */
export function formatDistance(metres, units = 'imperial') {
  const m = Math.max(0, Number(metres) || 0);
  if (units === 'metric') return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  const yd = m * 1.09361; if (yd < 440) return `${Math.max(10, Math.round(yd / 10) * 10)} yd`;
  const mi = m / 1609.344; return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
}
export function formatMinutes(metres, speed = SPEED.drive) { const min = Math.max(1, Math.round(Math.max(0, Number(metres) || 0) / speed)); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`; }
/** Cut a polyline to a rectangle [x, y, w, h]: the pieces that lie inside it (for drawing one street map's part). */
export function clipToRect(points, rect) {
  const [x0, y0] = rect, x1 = rect[0] + rect[2], y1 = rect[1] + rect[3], out = []; let cur = null;
  for (let i = 1; i < points.length; i++) {
    let [ax, ay] = points[i - 1], [bx, by] = points[i]; let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay; let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const a = [ax + dx * t0, ay + dy * t0], b = [ax + dx * t1, ay + dy * t1];
    if (cur && t0 === 0) cur.push(b); else { cur = [a, b]; out.push(cur); }
    if (t1 < 1) cur = null;
  }
  return out;
}
/** Total length of a polyline. */
export const polylineLength = pts => pts.reduce((n, p, i) => i ? n + dist(pts[i - 1], p) : 0, 0);

/* ------------------------------------------------------------------ destinations */
const centre = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
/** The point a driver aims for to reach a block: the middle of the touching road nearest the block's middle. */
export function kerbFor(map, zone) {
  if (!zone) return null; if (zone.kind === 'road' || zone.kind === 'junction') return centre(zone.rect);
  const c = centre(zone.rect), roads = (map?.zones || []).filter(z => (z.kind === 'road' || z.kind === 'junction') && (zone.adjacent || []).includes(z.id));
  return roads.map(z => centre(z.rect)).sort((a, b) => dist(a, c) - dist(b, c))[0] ?? c;
}
const SERVICE = {hospital: 'A&E', police: 'Police station', fire: 'Fire station', respray: 'Respray', clothes: 'Change your look', rank: 'Taxi rank', gang: 'Your crew', safehouse: 'Your flat'};
/**
 * Everywhere the sat nav can take you: the crew's doors, services (A&E, police, respray, the market …), landmarks and
 * each district's main junction. Positions are on the street map (`mapId`, `x`, `y`); `goal` is the kerb to drive to.
 */
export const DISTRICT_CODES = Object.freeze(['HB', 'SN', 'CL', 'HM', 'LY', 'CG', 'DA', 'HC', 'WW', 'ON', 'DB', 'LF', 'WS', 'VW', 'ST', 'HX', 'HR', 'BG', 'OF', 'BF']);
export function satnavDestinations(atlas, places = null, venues = null) {
  const out = [], names = new Set();
  const vby = new Map((venues?.maps || []).map(v => [v.id, v]));
  const placeName = id => (places?.maps || []).find(p => p.id === id)?.name ?? vby.get(id)?.title;
  for (const m of atlas?.maps || []) for (const l of (m.links || []).filter(l => l.kind === 'door' && l.to)) {
    if (l.venue) {   // a campaign venue (or the approach to one or two): one entry per venue, filed by district
      const v = vby.get(l.to), at = centre(l.rect); if (!v) continue;
      const list = v.kind === 'approach' ? (v.serves || []).map(id => vby.get(id)).filter(Boolean) : [v];
      for (const x of list) { names.add(x.title); out.push({key: `${m.id}:door:${x.id}`, group: `Venues · ${x.districtCode} ${x.district}`, label: x.title, sub: `${x.code}${v.kind === 'approach' ? ` · via ${v.short}` : ''} · ${m.name}`, mapId: m.id, x: at[0], y: at[1], goal: at, placeId: x.id, icon: 'fa-solid fa-door-open'}); }
      continue;
    }
    const at = centre(l.rect), crew = ['LDP-ARCHES', 'LDP-FLAT'].includes(l.to);
    const inside = placeName(l.to) ?? l.toName, label = l.at || inside; names.add(label); if (inside) names.add(inside);
    out.push({key: `${m.id}:door:${l.to}`, group: crew ? 'The Chainring' : 'Services', label, sub: inside && inside !== label ? `${inside} · ${m.name}` : m.name, mapId: m.id, x: at[0], y: at[1], goal: at, placeId: l.to, icon: crew ? 'fa-solid fa-house-chimney' : 'fa-solid fa-door-open'});
  }
  for (const m of atlas?.maps || []) {
    const seenHere = new Map();
    for (const z of (m.zones || []).filter(z => z.service || z.landmark)) {
      const area = z.rect[2] * z.rect[3], prev = seenHere.get(z.name);
      if (!prev || area > prev.rect[2] * prev.rect[3]) seenHere.set(z.name, z);
    }
    for (const z of seenHere.values()) {
      if (names.has(z.name)) continue;
      const kind = z.service && SERVICE[z.service] ? (['gang', 'safehouse'].includes(z.service) ? 'The Chainring' : 'Services') : 'Landmarks';
      const goal = kerbFor(m, z), c = centre(z.rect);
      out.push({key: `${m.id}:${z.id}`, group: kind, label: z.name, sub: `${z.service && SERVICE[z.service] ? `${SERVICE[z.service]} · ` : ''}${m.name}`, mapId: m.id, x: c[0], y: c[1], goal, icon: z.kind === 'park' ? 'fa-solid fa-tree' : 'fa-solid fa-location-dot'});
    }
    const hub = (m.zones || []).filter(z => z.kind === 'junction').sort((a, b) => dist(centre(a.rect), [m.width / 2, m.height / 2]) - dist(centre(b.rect), [m.width / 2, m.height / 2]))[0];
    if (hub) out.push({key: `${m.id}:centre`, group: 'Districts', label: m.name, sub: hub.name, mapId: m.id, x: centre(hub.rect)[0], y: centre(hub.rect)[1], goal: centre(hub.rect), icon: 'fa-solid fa-map-pin'});
  }
  // landmarks named on several maps (Hackney Marshes, Victoria Park …) keep their first entry
  const once = new Set(); const order = ['The Chainring', 'Services', 'Landmarks', 'Venues', 'Districts'];
  const rank = g => order.indexOf(g.startsWith('Venues') ? 'Venues' : g), vrank = d => DISTRICT_CODES.indexOf(d.group.split(' ')[2]);
  return out.filter(d => { const k = `${d.group}|${d.label}`; if (d.group !== 'Districts' && once.has(k)) return false; once.add(k); return true; })
    .sort((a, b) => rank(a.group) - rank(b.group) || (a.group.startsWith('Venues') && b.group.startsWith('Venues') ? vrank(a) - vrank(b) || a.sub.localeCompare(b.sub, 'en', {numeric: true}) : 0) || (a.group === 'Districts' ? 0 : a.label.localeCompare(b.label)));
}
