import type { SampledPath } from './path';
import { sampleAt } from './path';
import { DEFAULT_LAT_ACCEL, type Constraints } from './routine';

export interface TrajState {
  t: number; // seconds from the start of this trajectory
  s: number;
  x: number;
  y: number;
  heading: number;
  v: number; // speed along the path
  vx: number; // field-relative velocity
  vy: number;
  omega: number; // rad/s
}

/** Speed limit over an arc-length range (e.g. "slow down while shooting"). */
export interface SpeedZone {
  s0: number;
  s1: number;
  v: number;
}

/**
 * Time-parameterize the path between arc lengths s0 and s1, starting and ending at rest.
 * Speed is capped by maxVel, by sideways acceleration on curves (maxLatAccel), and by how fast the robot
 * can rotate to follow the heading plan, and by any speed zones; then forward/backward passes apply maxAccel.
 */
export function profileRange(path: SampledPath, s0: number, s1: number, c: Constraints, zones: SpeedZone[] = []): TrajState[] {
  const pts = path.samples.filter((p) => p.s > s0 && p.s < s1);
  pts.unshift(sampleAt(path, s0));
  if (s1 > s0) pts.push(sampleAt(path, s1));
  const n = pts.length;
  if (n === 1) {
    const p = pts[0];
    return [{ t: 0, s: p.s, x: p.x, y: p.y, heading: p.heading, v: 0, vx: 0, vy: 0, omega: 0 }];
  }

  const maxV = Math.max(0.05, c.maxVel);
  const maxA = Math.max(0.1, c.maxAccel);
  const maxW = Math.max(0.1, c.maxAngVel);
  const maxLat = Math.max(0.5, c.maxLatAccel ?? DEFAULT_LAT_ACCEL);

  const cap = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const ds = b.s - a.s;
    const dHds = ds > 1e-9 ? Math.abs((b.heading - a.heading) / ds) : 0;
    const k = Math.abs(pts[i].curvature);
    let v = maxV;
    if (k > 1e-6) v = Math.min(v, Math.sqrt(maxLat / k));
    if (dHds > 1e-6) v = Math.min(v, maxW / dHds);
    for (const z of zones) if (pts[i].s >= z.s0 - 1e-9 && pts[i].s <= z.s1 + 1e-9) v = Math.min(v, Math.max(0.05, z.v));
    cap[i] = v;
  }

  const v = new Array<number>(n).fill(0);
  v[0] = 0;
  for (let i = 1; i < n; i++) {
    const ds = pts[i].s - pts[i - 1].s;
    v[i] = Math.min(cap[i], Math.sqrt(v[i - 1] ** 2 + 2 * maxA * ds));
  }
  v[n - 1] = 0;
  for (let i = n - 2; i >= 0; i--) {
    const ds = pts[i + 1].s - pts[i].s;
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * maxA * ds));
  }

  const out: TrajState[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const ds = pts[i].s - pts[i - 1].s;
      const vAvg = (v[i] + v[i - 1]) / 2;
      t += vAvg > 1e-6 ? ds / vAvg : ds > 1e-9 ? Math.sqrt((2 * ds) / maxA) : 0;
    }
    out.push({ t, s: pts[i].s, x: pts[i].x, y: pts[i].y, heading: pts[i].heading, v: v[i], vx: 0, vy: 0, omega: 0 });
  }
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    out[i].vx = v[i] * Math.cos(p.tangent);
    out[i].vy = v[i] * Math.sin(p.tangent);
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(n - 1, i + 1)];
    const dt = b.t - a.t;
    out[i].omega = dt > 1e-6 ? (b.heading - a.heading) / dt : 0;
  }
  return out;
}

export function duration(traj: TrajState[]): number {
  return traj.length ? traj[traj.length - 1].t : 0;
}

/** Interpolated state at time t (clamped). */
export function stateAt(traj: TrajState[], t: number): TrajState {
  if (t <= 0 || traj.length === 1) return traj[0];
  const last = traj[traj.length - 1];
  if (t >= last.t) return last;
  let lo = 0, hi = traj.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (traj[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const b = traj[lo];
  const a = traj[lo - 1];
  const f = (t - a.t) / (b.t - a.t || 1);
  const L = (p: number, q: number) => p + (q - p) * f;
  return { t, s: L(a.s, b.s), x: L(a.x, b.x), y: L(a.y, b.y), heading: L(a.heading, b.heading), v: L(a.v, b.v), vx: L(a.vx, b.vx), vy: L(a.vy, b.vy), omega: L(a.omega, b.omega) };
}

/** Time at which the trajectory reaches arc length s. */
export function timeAtS(traj: TrajState[], s: number): number {
  if (s <= traj[0].s) return 0;
  const last = traj[traj.length - 1];
  if (s >= last.s) return last.t;
  let lo = 0, hi = traj.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (traj[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  const b = traj[lo];
  const a = traj[lo - 1];
  const f = (s - a.s) / (b.s - a.s || 1);
  return a.t + (b.t - a.t) * f;
}
