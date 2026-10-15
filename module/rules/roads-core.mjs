// Pure polyline maths for traffic and police on the traced London roads (no Foundry globals).
// A road is {name, cls, width, pts:[[x,y]...]} in map pixels. Positions along it are arc lengths `s`.
// The UK drives on the left: a vehicle keeps to the left of its direction of travel.

export function lengths(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}
export const roadLength = road => { const L = road._len ?? (road._len = lengths(road.pts)); return L[L.length - 1]; };

/** Point and unit tangent at arc length s (clamped). */
export function pointAt(road, s) {
  const L = road._len ?? (road._len = lengths(road.pts)), pts = road.pts;
  const t = Math.max(0, Math.min(L[L.length - 1], s));
  let i = 1; while (i < L.length - 1 && L[i] < t) i++;
  const a = pts[i - 1], b = pts[i], seg = (L[i] - L[i - 1]) || 1, f = (t - L[i - 1]) / seg;
  const dx = (b[0] - a[0]) / seg, dy = (b[1] - a[1]) / seg;
  return {x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, tx: dx, ty: dy};
}

/** Nearest point on a road to (x, y): {s, d}. */
export function project(road, x, y) {
  const L = road._len ?? (road._len = lengths(road.pts)), pts = road.pts;
  let best = {s: 0, d: Infinity};
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(x - (ax + dx * f), y - (ay + dy * f));
    if (d < best.d) best = {s: L[i - 1] + f * Math.sqrt(l2), d};
  }
  return best;
}
export function nearestRoad(roads, x, y, {drivable = true} = {}) {
  let best = null;
  roads.forEach((r, i) => { if (drivable && r.cls === 'P') return; const p = project(r, x, y); if (!best || p.d < best.d) best = {ri: i, s: p.s, d: p.d}; });
  return best;
}

/** Lane position for a vehicle at s travelling dir (+1 along the points, −1 against): kept left. */
export function lanePosition(road, s, dir) {
  const p = pointAt(road, s), vx = p.tx * dir, vy = p.ty * dir;
  const off = (Number(road.width) || 250) * 0.24;
  return {x: p.x + vy * off, y: p.y - vx * off, rotation: tokenRotation(vx, vy)};
}
/** Foundry rotation for top-down art whose front is the bottom edge (rotation 0 faces south). */
export function tokenRotation(vx, vy) {
  const deg = Math.atan2(vy, vx) * 180 / Math.PI;
  return ((deg - 90) % 360 + 360) % 360;
}

/** Where roads cross or join each other: per road, a sorted list of {s, other, os}. */
export function crossings(roads, tolerance = 60) {
  const out = roads.map(() => []);
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    const A = roads[i], B = roads[j];
    for (let k = 1; k < A.pts.length; k++) for (let m = 1; m < B.pts.length; m++) {
      const hit = segHit(A.pts[k - 1], A.pts[k], B.pts[m - 1], B.pts[m], tolerance);
      if (!hit) continue;
      const sa = project(A, hit[0], hit[1]).s, sb = project(B, hit[0], hit[1]).s;
      if (out[i].some(c => c.other === j && Math.abs(c.s - sa) < 150)) continue;
      out[i].push({s: sa, other: j, os: sb}); out[j].push({s: sb, other: i, os: sa});
    }
  }
  for (const list of out) list.sort((a, b) => a.s - b.s);
  return out;
}
function segHit(a, b, c, d, tol) {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) > 1e-9) {
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) return [a[0] + r[0] * t, a[1] + r[1] * t];
  }
  // end-to-segment touches (one road ending on another)
  for (const [p, s0, s1] of [[a, c, d], [b, c, d], [c, a, b], [d, a, b]]) {
    const dx = s1[0] - s0[0], dy = s1[1] - s0[1], l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / l2));
    if (Math.hypot(p[0] - (s0[0] + dx * f), p[1] - (s0[1] + dy * f)) <= tol) return [p[0], p[1]];
  }
  return null;
}

/**
 * One traffic step. state = {ri, s, dir}. Returns the new state, or {despawn:true} when it drives off the map.
 * At a crossing it may turn onto the other road (chance `turn`).
 */
export function trafficStep(roads, cross, state, step, {width, height, r = Math.random, turn = 0.3, keep = false} = {}) {
  let {ri, s, dir} = state; const road = roads[ri]; if (!road) return {despawn: true};
  const next = s + dir * step;
  const passed = (cross[ri] || []).filter(c => dir > 0 ? c.s > s + 1 && c.s <= next : c.s < s - 1 && c.s >= next);
  for (const c of passed) {
    const other = roads[c.other];
    if (other && other.cls !== 'P' && r() < turn) {
      const nd = r() < 0.5 ? 1 : -1, ns = c.os + nd * Math.max(0, Math.abs(next - c.s));
      return {ri: c.other, s: ns, dir: nd, turned: true};
    }
  }
  const L = roadLength(road);
  if (next < 0 || next > L) {
    if (keep) return {ri, s: Math.max(0, Math.min(L, next)), dir: -dir};
    return {despawn: true};
  }
  const p = pointAt(road, next);
  if (!keep && (p.x < -60 || p.y < -60 || p.x > width + 60 || p.y > height + 60)) return {despawn: true};
  if (keep && (p.x < 0 || p.y < 0 || p.x > width || p.y > height)) return {ri, s, dir: -dir};
  return {ri, s: next, dir};
}

/** One police step toward a target point: pick the direction (and road, at crossings) that closes the distance. */
export function huntRoadStep(roads, cross, state, step, [tx, ty]) {
  let {ri, s} = state; const road = roads[ri]; if (!road) return null;
  const L = roadLength(road), here = pointAt(road, s);
  if (Math.hypot(here.x - tx, here.y - ty) < step * 0.8) return null;
  const options = [];
  for (const dir of [1, -1]) {
    const ns = Math.max(0, Math.min(L, s + dir * step)); const p = pointAt(road, ns);
    options.push({ri, s: ns, dir, d: Math.hypot(p.x - tx, p.y - ty)});
    for (const c of (cross[ri] || []).filter(c => dir > 0 ? c.s > s && c.s <= s + step : c.s < s && c.s >= s - step)) {
      const other = roads[c.other]; if (!other || other.cls === 'P') continue;
      const rem = Math.abs(s + dir * step - c.s), OL = roadLength(other);
      for (const od of [1, -1]) { const os = Math.max(0, Math.min(OL, c.os + od * rem)); const q = pointAt(other, os); options.push({ri: c.other, s: os, dir: od, d: Math.hypot(q.x - tx, q.y - ty)}); }
    }
  }
  options.sort((a, b) => a.d - b.d);
  const best = options[0];
  return best.d < Math.hypot(here.x - tx, here.y - ty) - 1 ? best : null;
}
