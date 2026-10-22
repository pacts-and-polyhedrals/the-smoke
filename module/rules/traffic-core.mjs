// Traffic on the traced roads: pure maths, no Foundry. The sat nav's one London road network is cut to a street map's
// rectangle; where a road leaves the map is an exit. A car is given a trip from one exit to another (or from where it
// is to an exit) along the roads, kept in the left-hand lane, and drives along that path a step at a time: easing off
// for sharp turns, queueing behind whatever is in its lane, leaving by the far edge of the map.

/** Drawn road widths by class (px), as the sat nav network draws them. */
export const ROAD_WIDTH = Object.freeze({A: 320, B: 250, C: 170, P: 120});
/** Cost per px by class: drivers favour main roads. Footpaths are not in a driving network at all. */
export const DRIVE_COST = Object.freeze({A: 0.85, B: 0.95, C: 1.1});
/** How far a car sits left of the road's centre line, and how far out a parked car sits (px). */
export const laneOffset = width => Math.round(Math.min(80, Math.max(36, (Number(width) || 250) * 0.22)));
/** A sharper turn than this (degrees) and a car eases off: its step ends at the corner. */
export const CORNER = 30;

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const keyOf = (x, y) => `${Math.round(x)},${Math.round(y)}`;

/** Clip segment ab to [0,w]×[0,h]: [t0, t1] along it, or null (Liang–Barsky). */
function clipT(a, b, w, h) {
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0]], [dx, w - a[0]], [-dy, a[1]], [dy, h - a[1]]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : null;
}

/**
 * The driving network on one street map. `net` is the sat nav network (global px: nodes {x, y, edges}, edges
 * {u, v, len, name, cls}); `origin` and `size` place the map in it. Returns local px: nodes, edges (with width) and
 * exits (node indexes on the map's edge, each with the side it leaves by).
 */
export function localNetwork(net, origin, size) {
  const [ox, oy] = origin, [w, h] = size, nodes = [], index = new Map(), edges = [];
  const node = (x, y) => { const k = keyOf(x, y); if (!index.has(k)) { index.set(k, nodes.length); nodes.push({x: Math.round(x), y: Math.round(y), edges: []}); } return index.get(k); };
  for (const e of net?.edges || []) {
    if (e.cls === 'P' || !DRIVE_COST[e.cls]) continue;
    const A = net.nodes[e.u], B = net.nodes[e.v]; if (!A || !B) continue;
    const a = [A.x - ox, A.y - oy], b = [B.x - ox, B.y - oy], t = clipT(a, b, w, h); if (!t) continue;
    const p = [a[0] + (b[0] - a[0]) * t[0], a[1] + (b[1] - a[1]) * t[0]], q = [a[0] + (b[0] - a[0]) * t[1], a[1] + (b[1] - a[1]) * t[1]];
    const u = node(...p), v = node(...q); if (u === v) continue;
    const id = edges.length;
    edges.push({u, v, len: dist([nodes[u].x, nodes[u].y], [nodes[v].x, nodes[v].y]), name: e.name, cls: e.cls, width: Number(e.width) || ROAD_WIDTH[e.cls] || 250});
    nodes[u].edges.push(id); nodes[v].edges.push(id);
  }
  const side = n => n.x <= 1 ? 'W' : n.x >= w - 1 ? 'E' : n.y <= 1 ? 'N' : n.y >= h - 1 ? 'S' : null;
  const exits = [];
  nodes.forEach((n, i) => { const s = side(n); if (s && n.edges.length === 1) { n.exit = s; exits.push(i); } });
  return {nodes, edges, exits, size: [w, h]};
}

/** Cheapest ways out from a node: {cost, prev} (prev holds the edge used to reach each node). */
export function paths(local, start) {
  const n = local.nodes.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = [[0, start]]; cost[start] = 0;
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, v] = pop(); if (d > cost[v]) continue;
    for (const id of local.nodes[v].edges) { const e = local.edges[id], o = e.u === v ? e.v : e.u, nd = d + e.len * (DRIVE_COST[e.cls] ?? 1); if (nd < cost[o]) { cost[o] = nd; prev[o] = id; push(nd, o); } }
  }
  return {cost, prev};
}

/** Node chain → points along the roads, with the width of the road each piece runs on. */
function chainTo(local, prev, target) {
  const pts = [], widths = []; let v = target;
  pts.unshift([local.nodes[v].x, local.nodes[v].y]);
  while (prev[v] >= 0) { const e = local.edges[prev[v]], o = e.u === v ? e.v : e.u; pts.unshift([local.nodes[o].x, local.nodes[o].y]); widths.unshift(e.width); v = o; }
  return {pts, widths};
}
const pickFrom = (list, r) => list[Math.floor(r() * list.length) % list.length];

/** A trip across the map: in at one exit, out at another a fair way off. `from` forces the entry exit. */
export function randomTrip(local, r = Math.random, {from = null, minLength = 1200} = {}) {
  const starts = from != null ? [from] : [...local.exits].sort(() => r() - 0.5);
  for (const s of starts) {
    const {cost, prev} = paths(local, s);
    const out = local.exits.filter(x => x !== s && Number.isFinite(cost[x]));
    if (!out.length) continue;
    const far = out.filter(x => dist([local.nodes[x].x, local.nodes[x].y], [local.nodes[s].x, local.nodes[s].y]) >= minLength);
    const target = pickFrom(far.length ? far : out, r), {pts, widths} = chainTo(local, prev, target);
    if (pts.length >= 2) return {from: s, to: target, pts, widths};
  }
  return null;
}

/** The nearest point on the driving network to p: {edge, t, p, d}. */
export function nearestEdge(local, p) {
  let best = null;
  local.edges.forEach((e, id) => {
    const a = [local.nodes[e.u].x, local.nodes[e.u].y], b = [local.nodes[e.v].x, local.nodes[e.v].y], ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)), q = [a[0] + ab[0] * t, a[1] + ab[1] * t], d = dist(p, q);
    if (!best || d < best.d) best = {edge: id, t, p: q, d};
  });
  return best;
}

/**
 * A trip from where a vehicle is now: onto the nearest road, carrying on the way it faces (`heading` [x, y], or
 * either way when null), then by the roads to `goal` (a point: the nearest road to it) or else to an exit.
 */
export function tripFrom(local, p, {heading = null, goal = null, r = Math.random} = {}) {
  const near = nearestEdge(local, p); if (!near) return null;
  const e = local.edges[near.edge], a = [local.nodes[e.u].x, local.nodes[e.u].y], b = [local.nodes[e.v].x, local.nodes[e.v].y];
  let ends = [e.u, e.v];
  if (heading && Math.hypot(...heading) > 0) { const along = (b[0] - a[0]) * heading[0] + (b[1] - a[1]) * heading[1]; ends = along >= 0 ? [e.v, e.u] : [e.u, e.v]; }
  const ahead = ends[0], width = e.width;
  if (goal) {   // to a point: along the roads to the road nearest it
    const g = nearestEdge(local, goal); if (!g) return null;
    const ge = local.edges[g.edge];
    if (g.edge === near.edge) return {pts: [near.p, g.p], widths: [width]};
    let best = null;
    for (const start of ends) {
      const {cost, prev} = paths(local, start);
      for (const end of [ge.u, ge.v]) {
        const c = cost[end] + dist([local.nodes[start].x, local.nodes[start].y], near.p) + dist([local.nodes[end].x, local.nodes[end].y], g.p) + (start === ahead ? 0 : 400);
        if (Number.isFinite(c) && (!best || c < best.c)) best = {c, start, end, prev};
      }
    }
    if (!best) return null;
    const {pts, widths} = chainTo(local, best.prev, best.end);
    return {pts: [near.p, ...pts, g.p], widths: [width, ...widths, ge.width]};
  }
  for (const start of ends) {
    const {cost, prev} = paths(local, start), out = local.exits.filter(x => Number.isFinite(cost[x]));
    if (!out.length) continue;
    const target = pickFrom(out.length > 1 ? out.filter(x => x !== start) : out, r), {pts, widths} = chainTo(local, prev, target);
    return {pts: [near.p, ...pts], widths: [width, ...widths], to: target};
  }
  return null;
}

/** Tidy a polyline: drop repeated and collinear points. Widths follow the pieces. */
function tidy(pts, widths) {
  const P = [pts[0]], W = [];
  for (let i = 1; i < pts.length; i++) {
    if (dist(P.at(-1), pts[i]) < 2) continue;
    if (P.length >= 2) {
      const a = P.at(-2), b = P.at(-1), c = pts[i], cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-3 * dist(a, b) * dist(b, c) && W.at(-1) === (widths[i - 1] ?? W.at(-1))) { P[P.length - 1] = c; continue; }
    }
    P.push(pts[i]); W.push(widths[i - 1] ?? W.at(-1) ?? 250);
  }
  return {pts: P, widths: W};
}

/** The left-hand lane of a trip: each piece moved left of the way of travel; corners joined where the lanes meet. */
export function lanePath(pts, widths, {offset = laneOffset} = {}) {
  const t = tidy(pts, widths); if (t.pts.length < 2) return t.pts.map(p => p.map(Math.round));
  const segs = [];
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1], b = t.pts[i], l = dist(a, b), dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, o = typeof offset === 'function' ? offset(t.widths[i - 1]) : offset;
    segs.push({a: [a[0] + dy * o, a[1] - dx * o], b: [b[0] + dy * o, b[1] - dx * o], d: [dx, dy], o});
  }
  const out = [segs[0].a];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i - 1], n = segs[i], den = s.d[0] * n.d[1] - s.d[1] * n.d[0];
    let joint = null;
    if (Math.abs(den) > 1e-6) {
      const w0 = [n.a[0] - s.a[0], n.a[1] - s.a[1]], k = (w0[0] * n.d[1] - w0[1] * n.d[0]) / den, q = [s.a[0] + s.d[0] * k, s.a[1] + s.d[1] * k];
      if (dist(q, t.pts[i]) <= Math.max(s.o, n.o) * 2.5) joint = q;
    }
    if (joint) out.push(joint); else { out.push(s.b); if (dist(s.b, n.a) > 1) out.push(n.a); }
  }
  out.push(segs.at(-1).b);
  return out.map(p => [Math.round(p[0]), Math.round(p[1])]);
}

/** Cumulative lengths of a polyline. */
export function cumulative(path) { const L = [0]; for (let i = 1; i < path.length; i++) L.push(L[i - 1] + dist(path[i - 1], path[i])); return L; }
export const pathLength = path => cumulative(path).at(-1) ?? 0;

/** Point and direction at distance s along a path. At a corner, `incoming` takes the piece before it. */
export function pointAt(path, s, {incoming = false} = {}) {
  const L = cumulative(path), total = L.at(-1), x = Math.max(0, Math.min(total, s));
  let i = 1; while (i < L.length - 1 && (incoming ? L[i] < x : L[i] <= x)) i++;
  const a = path[i - 1], b = path[i], seg = (L[i] - L[i - 1]) || 1, f = Math.max(0, Math.min(1, (x - L[i - 1]) / seg));
  return {x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: (b[0] - a[0]) / seg, dy: (b[1] - a[1]) / seg, s: x};
}
/** Foundry rotation for top-down art whose front is the bottom edge (rotation 0 faces south). */
export function rotationOf(dx, dy) { const deg = Math.atan2(dy, dx) * 180 / Math.PI; return ((deg - 90) % 360 + 360) % 360; }

/**
 * Where a step of `want` px from s ends: past gentle bends, but no further than the next sharp corner (the car eases
 * off there and turns on the next step). A corner in the first `ease` part of the step is taken without stopping, so
 * a car isn't held up by a kink in the road just ahead of it. Returns {s, corner}.
 */
export function stepAlong(path, s, want, {ease = 0.4} = {}) {
  const L = cumulative(path), total = L.at(-1), goal = Math.min(total, s + Math.max(0, want));
  for (let i = 1; i < path.length - 1; i++) {
    if (L[i] <= s + Math.max(0.5, want * ease) || L[i] >= goal) continue;   // a kink right at the start of the step is driven through
    const a = path[i - 1], b = path[i], c = path[i + 1];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const turn = Math.abs(((h2 - h1) * 180 / Math.PI + 540) % 360 - 180);
    if (turn > CORNER) return {s: L[i], corner: true};
  }
  return {s: goal, corner: false};
}

/**
 * How far a car can go along its path before it would run into something. `obstacles` are {x, y, reach, half}: an
 * obstacle is in the way when its centre is within `reach` of the path ahead; the car stops `gap` short of its back
 * (`half` is its half-length). `front` is the car's own half-length. Returns the clear distance from s.
 */
export function clearAhead(path, s, want, obstacles, {front = 100, gap = 40} = {}) {
  const L = cumulative(path), end = Math.min(L.at(-1), s + want + front + gap + 400);
  let clear = want;
  for (const o of obstacles) {
    for (let i = 1; i < path.length; i++) {
      if (L[i] < s || L[i - 1] > end) continue;
      const a = path[i - 1], b = path[i], ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((o.x - a[0]) * ab[0] + (o.y - a[1]) * ab[1]) / l2)), q = [a[0] + ab[0] * t, a[1] + ab[1] * t];
      if (dist(q, [o.x, o.y]) > o.reach) continue;
      const at = L[i - 1] + t * Math.sqrt(l2); if (at <= s + 1) continue;    // beside or behind us
      clear = Math.min(clear, Math.max(0, at - (o.half || 0) - gap - front - s));
      break;
    }
  }
  return clear;
}
