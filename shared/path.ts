import { wrapAngle } from './field';
import type { PathPos, Vec2, Waypoint } from './routine';

/** One densely-sampled point along the path. */
export interface PathSample {
  x: number;
  y: number;
  s: number; // arc length from path start, m
  seg: number;
  u: number;
  tangent: number; // direction of travel, rad
  curvature: number; // 1/m
  heading: number; // robot heading target, rad
}

export interface SampledPath {
  samples: PathSample[];
  length: number;
  /** arc length at each waypoint */
  waypointS: number[];
}

const STEPS_PER_SEG = 240;

export function segmentControls(wps: Waypoint[], i: number): [Vec2, Vec2, Vec2, Vec2] {
  const a = wps[i];
  const b = wps[i + 1];
  return [
    { x: a.x, y: a.y },
    { x: a.x + a.hout.x, y: a.y + a.hout.y },
    { x: b.x + b.hin.x, y: b.y + b.hin.y },
    { x: b.x, y: b.y },
  ];
}

export function bezier(c: [Vec2, Vec2, Vec2, Vec2], u: number): Vec2 {
  const m = 1 - u;
  const a = m * m * m, b = 3 * m * m * u, d = 3 * m * u * u, e = u * u * u;
  return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
}

function bezierD1(c: [Vec2, Vec2, Vec2, Vec2], u: number): Vec2 {
  const m = 1 - u;
  return {
    x: 3 * m * m * (c[1].x - c[0].x) + 6 * m * u * (c[2].x - c[1].x) + 3 * u * u * (c[3].x - c[2].x),
    y: 3 * m * m * (c[1].y - c[0].y) + 6 * m * u * (c[2].y - c[1].y) + 3 * u * u * (c[3].y - c[2].y),
  };
}

function bezierD2(c: [Vec2, Vec2, Vec2, Vec2], u: number): Vec2 {
  const m = 1 - u;
  return {
    x: 6 * m * (c[2].x - 2 * c[1].x + c[0].x) + 6 * u * (c[3].x - 2 * c[2].x + c[1].x),
    y: 6 * m * (c[2].y - 2 * c[1].y + c[0].y) + 6 * u * (c[3].y - 2 * c[2].y + c[1].y),
  };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export function samplePath(wps: Waypoint[]): SampledPath {
  const samples: PathSample[] = [];
  const waypointS: number[] = [0];
  if (wps.length === 0) return { samples, length: 0, waypointS: [] };
  if (wps.length === 1) {
    const w = wps[0];
    samples.push({ x: w.x, y: w.y, s: 0, seg: 0, u: 0, tangent: w.heading ?? 0, curvature: 0, heading: w.heading ?? 0 });
    return { samples, length: 0, waypointS };
  }
  let s = 0;
  let prev: Vec2 | null = null;
  let lastTangent = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const c = segmentControls(wps, i);
    for (let k = i === 0 ? 0 : 1; k <= STEPS_PER_SEG; k++) {
      const u = k / STEPS_PER_SEG;
      const p = bezier(c, u);
      if (prev) s += Math.hypot(p.x - prev.x, p.y - prev.y);
      const d1 = bezierD1(c, u);
      const d2 = bezierD2(c, u);
      const sp = Math.hypot(d1.x, d1.y);
      let tangent = lastTangent;
      let curvature = 0;
      if (sp > 1e-6) {
        tangent = Math.atan2(d1.y, d1.x);
        curvature = (d1.x * d2.y - d1.y * d2.x) / (sp * sp * sp);
      } else if (prev) {
        // degenerate handle: fall back to chord direction
        const nx = bezier(c, Math.min(1, u + 1e-3));
        if (Math.hypot(nx.x - p.x, nx.y - p.y) > 1e-9) tangent = Math.atan2(nx.y - p.y, nx.x - p.x);
      }
      lastTangent = tangent;
      samples.push({ x: p.x, y: p.y, s, seg: i, u, tangent, curvature, heading: 0 });
      prev = p;
    }
    waypointS.push(s);
  }
  // first sample's tangent may be undefined for zero handles; copy from the next one
  if (samples.length > 1 && Math.abs(samples[0].curvature) === 0) samples[0].tangent = samples[1].tangent;

  assignHeadings(wps, samples, waypointS);
  return { samples, length: s, waypointS };
}

/**
 * Robot heading along the path: smoothly blend between waypoints that set a heading.
 * Before the first set heading we hold it; after the last, we hold the last.
 * If no waypoint sets a heading the robot holds its starting tangent.
 */
function assignHeadings(wps: Waypoint[], samples: PathSample[], waypointS: number[]) {
  const keys: { s: number; h: number }[] = [];
  wps.forEach((w, i) => {
    if (w.heading !== null && w.heading !== undefined) keys.push({ s: waypointS[i], h: w.heading });
  });
  if (keys.length === 0) keys.push({ s: 0, h: samples[0]?.tangent ?? 0 });
  // unwrap so that we always turn the short way
  for (let i = 1; i < keys.length; i++) keys[i].h = keys[i - 1].h + wrapAngle(keys[i].h - keys[i - 1].h);
  let k = 0;
  for (const p of samples) {
    while (k < keys.length - 1 && p.s > keys[k + 1].s) k++;
    const a = keys[k];
    const b = keys[k + 1];
    if (!b || p.s <= a.s) p.heading = p.s <= keys[0].s ? keys[0].h : a.h;
    else {
      const span = b.s - a.s;
      p.heading = span < 1e-9 ? b.h : a.h + (b.h - a.h) * smoothstep((p.s - a.s) / span);
    }
  }
}

function lowerBound(samples: PathSample[], s: number): number {
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Interpolated sample at arc length s (clamped). */
export function sampleAt(path: SampledPath, s: number): PathSample {
  const { samples } = path;
  if (samples.length === 0) throw new Error('empty path');
  if (s <= 0) return samples[0];
  if (s >= path.length) return samples[samples.length - 1];
  const i = lowerBound(samples, s);
  const b = samples[i];
  const a = samples[Math.max(0, i - 1)];
  const span = b.s - a.s;
  const t = span < 1e-12 ? 0 : (s - a.s) / span;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    s,
    seg: b.seg,
    u: a.u + (b.u - a.u) * t,
    tangent: a.tangent + wrapAngle(b.tangent - a.tangent) * t,
    curvature: a.curvature + (b.curvature - a.curvature) * t,
    heading: a.heading + (b.heading - a.heading) * t,
  };
}

/** Arc length of a (seg, u) position. */
export function posToS(path: SampledPath, pos: PathPos): number {
  const { samples, waypointS } = path;
  if (samples.length < 2) return 0;
  const seg = Math.max(0, Math.min(waypointS.length - 2, pos.seg));
  const u = Math.max(0, Math.min(1, pos.u));
  const s0 = waypointS[seg];
  const s1 = waypointS[seg + 1];
  // samples within the segment are evenly spaced in u
  const i0 = lowerBound(samples, s0);
  const f = u * STEPS_PER_SEG;
  const k = Math.floor(f);
  const a = samples[Math.min(samples.length - 1, i0 + k)];
  const b = samples[Math.min(samples.length - 1, i0 + k + 1)];
  const s = k >= STEPS_PER_SEG ? s1 : a.s + (b.s - a.s) * (f - k);
  return Math.max(s0, Math.min(s1, s));
}

/** Closest point on the path to (x, y). */
export function nearestOnPath(path: SampledPath, x: number, y: number): { pos: PathPos; s: number; dist: number } | null {
  let best = -1;
  let bestD = Infinity;
  path.samples.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return null;
  const p = path.samples[best];
  return { pos: { seg: p.seg, u: p.u }, s: p.s, dist: Math.sqrt(bestD) };
}
