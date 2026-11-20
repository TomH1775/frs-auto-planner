// Turn a recorded drive (poses + buttons held over time) into an editable Routine.
import { wrapAngle } from './field';
import {
  applyAutoHandles,
  BUTTON_IDS,
  DEFAULT_CONSTRAINTS,
  DEFAULT_LAT_ACCEL,
  makeAction,
  makeWaypoint,
  parseRoutine,
  uid,
  type Action,
  type ButtonId,
  type PathPos,
  type Routine,
  type Waypoint,
} from './routine';

export interface RecSample {
  t: number; // seconds
  x: number;
  y: number;
  heading: number;
  buttons: ButtonId[];
}

export interface RecOptions {
  name?: string;
  /** below this speed (m/s) the robot counts as stopped */
  pauseSpeed?: number;
  /** a stop must last at least this long (s) to become a pause */
  minPause?: number;
  /** path simplification tolerance (m) */
  epsilon?: number;
}

interface Pause {
  i0: number; // first stopped sample
  i1: number; // last stopped sample
  t0: number;
  t1: number;
}

const HEADING_WEIGHT = 0.25; // m per radian when simplifying, so big turns keep a waypoint
const TAP = 0.2;

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

/** Ramer–Douglas–Peucker on (x, y, weighted heading); returns kept indices in [a, b]. */
function simplify(pts: { x: number; y: number; h: number }[], a: number, b: number, eps: number, out: Set<number>) {
  out.add(a);
  out.add(b);
  if (b - a < 2) return;
  const A = pts[a], B = pts[b];
  const dx = B.x - A.x, dy = B.y - A.y, dh = (B.h - A.h) * HEADING_WEIGHT;
  const len2 = dx * dx + dy * dy + dh * dh;
  let worst = -1, worstD = 0;
  for (let i = a + 1; i < b; i++) {
    const P = pts[i];
    const px = P.x - A.x, py = P.y - A.y, ph = (P.h - A.h) * HEADING_WEIGHT;
    let t = len2 > 1e-12 ? (px * dx + py * dy + ph * dh) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - t * dx, py - t * dy, ph - t * dh);
    if (d > worstD) {
      worstD = d;
      worst = i;
    }
  }
  if (worstD > eps && worst > 0) {
    simplify(pts, a, worst, eps, out);
    simplify(pts, worst, b, eps, out);
  }
}

/**
 * Where the driver stopped, keep a sharp corner instead of rounding it off: point each
 * handle along its own segment (the robot is at rest there, so it can turn any way).
 */
function cornerHandles(list: Waypoint[], stopped: boolean[]): Waypoint[] {
  return list.map((w, i) => {
    if (!stopped[i] || i === 0 || i === list.length - 1) return w;
    const a = list[i - 1], b = list[i + 1];
    const toPrev = { x: (a.x - w.x) / 3, y: (a.y - w.y) / 3 };
    const toNext = { x: (b.x - w.x) / 3, y: (b.y - w.y) / 3 };
    return { ...w, hin: toPrev, hout: toNext, autoHandles: false };
  });
}

export function recordingToRoutine(raw: RecSample[], opts: RecOptions = {}): Routine {
  const pauseSpeed = opts.pauseSpeed ?? 0.15;
  const minPause = opts.minPause ?? 0.4;
  const eps = opts.epsilon ?? 0.12;

  // clean: sorted, strictly increasing time, starting at 0
  const sorted = [...raw].filter((s) => Number.isFinite(s.t) && Number.isFinite(s.x) && Number.isFinite(s.y)).sort((a, b) => a.t - b.t);
  const S: RecSample[] = [];
  for (const s of sorted) if (!S.length || s.t - S[S.length - 1].t > 1e-4) S.push(s);
  if (S.length < 2) throw new Error('Recording is too short.');
  const T0 = S[0].t;
  const t = S.map((s) => s.t - T0);
  const n = S.length;
  const tEnd = t[n - 1];

  // unwrapped heading, cumulative distance, speed
  const h: number[] = [S[0].heading];
  for (let i = 1; i < n; i++) h.push(h[i - 1] + wrapAngle(S[i].heading - S[i - 1].heading));
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y));
  const speed: number[] = [];
  const omega: number[] = [];
  {
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      while (t[i] - t[lo] > 0.06 && lo < i) lo++;
      while (hi < n - 1 && t[hi] - t[i] < 0.06) hi++;
      const dt = t[hi] - t[lo];
      speed.push(dt > 1e-6 ? (cum[hi] - cum[lo]) / dt : 0);
      omega.push(dt > 1e-6 ? Math.abs(h[hi] - h[lo]) / dt : 0);
    }
  }

  // pauses
  const pauses: Pause[] = [];
  for (let i = 0; i < n; ) {
    if (speed[i] >= pauseSpeed) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && speed[j + 1] < pauseSpeed) j++;
    if (t[j] - t[i] >= minPause || (i === 0 && t[j] - t[i] >= 0.1) || (j === n - 1 && i > 0)) pauses.push({ i0: i, i1: j, t0: t[i], t1: t[j] });
    i = j + 1;
  }

  // waypoints: simplify each moving stretch; every pause is a waypoint
  const pts = S.map((s, i) => ({ x: s.x, y: s.y, h: h[i] }));
  const anchors: { i: number; leave: number; pause: Pause | null }[] = [];
  const startPause = pauses.find((p) => p.i0 === 0) ?? null;
  anchors.push({ i: 0, leave: startPause ? startPause.i1 : 0, pause: startPause });
  for (const p of pauses) {
    if (p === startPause) continue;
    anchors.push({ i: p.i0, leave: p.i1, pause: p });
  }
  if (anchors[anchors.length - 1].leave < n - 1) anchors.push({ i: n - 1, leave: n - 1, pause: null });

  interface WpInfo {
    wp: Waypoint;
    arrive: number; // time
    leave: number;
    iArrive: number;
    iLeave: number;
    pause: Pause | null;
  }
  const wps: WpInfo[] = [];
  const pushWp = (iArrive: number, iLeave: number, pause: Pause | null) => {
    const hIdx = iLeave; // leave aimed the way the driver left (turning happens on approach)
    const prev = wps[wps.length - 1];
    if (prev && Math.hypot(S[iArrive].x - prev.wp.x, S[iArrive].y - prev.wp.y) < 0.05) {
      // same spot: merge (keeps the later heading and pause)
      prev.leave = t[iLeave];
      prev.iLeave = iLeave;
      prev.wp.heading = wrapAngle(h[hIdx]);
      prev.pause = prev.pause ?? pause;
      return;
    }
    wps.push({ wp: makeWaypoint(S[iArrive].x, S[iArrive].y, wrapAngle(h[hIdx])), arrive: t[iArrive], leave: t[iLeave], iArrive, iLeave, pause });
  };
  pushWp(anchors[0].i, anchors[0].leave, anchors[0].pause);
  for (let k = 1; k < anchors.length; k++) {
    const from = anchors[k - 1].leave;
    const to = anchors[k].i;
    const keep = new Set<number>();
    simplify(pts, from, to, eps, keep);
    const inner = [...keep].filter((i) => i > from && i < to).sort((a, b) => a - b);
    for (const i of inner) pushWp(i, i, null);
    pushWp(anchors[k].i, anchors[k].leave, anchors[k].pause);
  }
  if (wps.length === 1) {
    // never moved: add a tiny second point so actions have somewhere to live
    const w = wps[0];
    wps.push({ wp: makeWaypoint(w.wp.x + 0.02, w.wp.y, w.wp.heading), arrive: tEnd, leave: tEnd, iArrive: n - 1, iLeave: n - 1, pause: null });
  }

  // time -> position on the new path (monotonic, so crossing paths map correctly)
  const cumAt = (time: number) => {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return cum[0];
    const f = (time - t[lo - 1]) / (t[lo] - t[lo - 1] || 1);
    return cum[lo - 1] + (cum[lo] - cum[lo - 1]) * Math.max(0, Math.min(1, f));
  };
  const spotOf = (k: number): PathPos => (k === 0 ? { seg: 0, u: 0 } : { seg: k - 1, u: 1 });
  const posAt = (time: number): PathPos => {
    if (time <= wps[0].leave) return { seg: 0, u: 0 };
    for (let k = 0; k < wps.length - 1; k++) {
      const a = wps[k], b = wps[k + 1];
      if (time >= a.leave && time < b.arrive) {
        const c0 = cum[a.iLeave], c1 = cum[b.iArrive];
        const u = c1 - c0 > 1e-6 ? (cumAt(time) - c0) / (c1 - c0) : (time - a.leave) / (b.arrive - a.leave || 1);
        return { seg: k, u: Math.max(0, Math.min(1, u)) };
      }
      if (time >= b.arrive && time <= b.leave) return spotOf(k + 1);
    }
    return spotOf(wps.length - 1);
  };
  const pauseWpIndex = (p: Pause) => wps.findIndex((w) => w.pause === p);
  const pausedFraction = (a: number, b: number) => {
    if (b <= a) return pauses.some((p) => a >= p.t0 && a <= p.t1) ? 1 : 0;
    let inside = 0;
    for (const p of pauses) inside += Math.max(0, Math.min(b, p.t1) - Math.max(a, p.t0));
    return inside / (b - a);
  };
  const pauseFor = (a: number, b: number) => pauses.find((p) => Math.min(b, p.t1) - Math.max(a, p.t0) > -0.15);
  const avgSpeed = (a: number, b: number) => (b - a > 1e-3 ? (cumAt(b) - cumAt(a)) / (b - a) : 0);

  // constraints from how the driver actually drove
  const moving = speed.filter((v) => v >= pauseSpeed);
  const maxVel = Math.min(6, Math.max(1, Math.ceil(percentile(moving.length ? moving : [1], 0.95) * 10) / 10));
  // only look at moments the robot was actually speeding up/slowing down or turning;
  // most samples are steady and would drag a percentile toward zero
  const accels: number[] = [];
  for (let i = 0, j = 0; i < n; i++) {
    while (j < n - 1 && t[j] - t[i] < 0.1) j++;
    const dt = t[j] - t[i];
    const acc = dt > 1e-3 ? Math.abs(speed[j] - speed[i]) / dt : 0;
    if (acc > 0.3) accels.push(acc);
  }
  const maxAccel = accels.length ? Math.min(10, Math.max(2, +percentile(accels, 0.9).toFixed(1))) : DEFAULT_CONSTRAINTS.maxAccel;
  const turning = omega.filter((w) => w > 0.2);
  const maxAngVel = turning.length ? Math.min(10, Math.max(1, +percentile(turning, 0.95).toFixed(2))) : DEFAULT_CONSTRAINTS.maxAngVel;

  // button presses -> actions
  type Timed = { a: Action; time: number; spot?: number };
  const acts: Timed[] = [];
  const stopIntervals = new Map<number, [number, number][]>(); // waypoint index -> busy intervals
  const addStop = (k: number, a: number, b: number) => {
    const list = stopIntervals.get(k) ?? [];
    list.push([a, b]);
    stopIntervals.set(k, list);
  };
  for (const btn of BUTTON_IDS) {
    let start: number | null = null;
    const runs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const on = S[i].buttons.includes(btn);
      if (on && start === null) start = t[i];
      if (!on && start !== null) {
        runs.push([start, t[i]]);
        start = null;
      }
    }
    if (start !== null) runs.push([start, Infinity]);

    for (const [a, bRaw] of runs) {
      const held = bRaw === Infinity ? tEnd - a : bRaw - a;
      const dur = held < 0.08 ? TAP : +held.toFixed(2);
      const b = Math.min(tEnd, a + dur);
      const stop = pausedFraction(a, b) > 0.6;
      const p = stop ? pauseFor(a, b) : undefined;
      const k = p ? pauseWpIndex(p) : -1;
      const at = k >= 0 ? spotOf(k) : posAt(a);
      if (btn === 'intake') {
        if (stop && k >= 0) {
          acts.push({ a: { ...makeAction('intakeFor', at), duration: dur, stop: true }, time: a, spot: k });
          addStop(k, a, a + dur);
        } else {
          acts.push({ a: makeAction('intakeOn', posAt(a)), time: a });
          if (bRaw !== Infinity && bRaw < tEnd - 0.05) acts.push({ a: makeAction('intakeOff', posAt(bRaw)), time: bRaw });
        }
        continue;
      }
      const type = btn === 'score' ? 'shoot' : btn === 'climb' ? 'climb' : 'button';
      const action: Action = { ...makeAction(type, at), duration: dur, stop: stop && k >= 0 };
      if (type === 'button') action.button = btn;
      if (type === 'shoot' && !action.stop) {
        const pct = Math.round(((avgSpeed(a, b) / maxVel) * 100) / 5) * 5;
        action.speedPct = Math.min(100, Math.max(5, pct));
      }
      acts.push({ a: action, time: a, spot: action.stop ? k : undefined });
      if (action.stop) addStop(k, a, a + dur);
    }
  }

  // time spent stopped that no action explains -> Wait
  for (let k = 0; k < wps.length; k++) {
    const w = wps[k];
    if (!w.pause) continue;
    const busy = (stopIntervals.get(k) ?? []).sort((p, q) => p[0] - q[0]);
    let cursor = w.arrive;
    const gaps: [number, number][] = [];
    for (const [a, b] of busy) {
      if (a > cursor) gaps.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (w.leave > cursor) gaps.push([cursor, w.leave]);
    // the robot sitting still at the very end of the recording isn't a wait
    const isEnd = k === wps.length - 1;
    for (const [a, b] of gaps) {
      if (b - a < 0.25 || (isEnd && b >= tEnd - 0.05)) continue;
      acts.push({ a: { ...makeAction('wait', spotOf(k)), duration: +(b - a).toFixed(2), stop: true }, time: a, spot: k });
    }
  }

  acts.sort((p, q) => p.time - q.time);
  const stamp = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const routine: Routine = {
    version: 1,
    id: uid('r'),
    name: opts.name ?? `Recorded auto · ${stamp}`,
    waypoints: cornerHandles(applyAutoHandles(wps.map((w) => w.wp)), wps.map((w) => !!w.pause)),
    actions: acts.map((x) => x.a),
    constraints: { maxVel, maxAccel, maxAngVel, maxLatAccel: DEFAULT_LAT_ACCEL },
    updatedAt: Date.now(),
  };
  return parseRoutine(JSON.stringify(routine));
}
