import type { Pose } from './field';
import { posToS, samplePath, sampleAt, type SampledPath } from './path';
import { ACTIONS, actionPlan, gameOf, moveSpeedFraction, type Action, type ButtonId, type Routine } from './routine';
import { duration, profileRange, stateAt, timeAtS, type SpeedZone, type TrajState } from './trajectory';

export type Step =
  | { kind: 'drive'; t0: number; t1: number; traj: TrajState[] }
  | { kind: 'hold'; t0: number; t1: number; pose: Pose; actionIds: string[] };

/** A button held down from t0 to t1 (t1 may be Infinity = until auto ends). */
export interface ButtonSpan {
  button: ButtonId;
  t0: number;
  t1: number;
  actionId: string;
}

export interface ActionTiming {
  t0: number;
  t1: number;
  s: number;
}

export interface Schedule {
  path: SampledPath;
  steps: Step[];
  spans: ButtonSpan[];
  timing: Record<string, ActionTiming>;
  /** windows (absolute seconds) where FRS's auto-align drives and the follower must let go */
  assists: { t0: number; t1: number; actionId: string }[];
  /** stretches of path driven slowly (shooting on the move) */
  zones: (SpeedZone & { actionId: string })[];
  /** when the last drive/hold step ends */
  driveEnd: number;
  /** when everything (including button spans) is done */
  total: number;
  warnings: string[];
}

const SAME_SPOT = 0.01; // m: stop actions this close together run back-to-back at one spot

export function buildSchedule(r: Routine): Schedule {
  const game = gameOf(r);
  const path = samplePath(r.waypoints);
  const warnings: string[] = [];
  const steps: Step[] = [];
  const timing: Record<string, ActionTiming> = {};
  if (path.samples.length === 0) return { path, steps, spans: [], assists: [], timing, zones: [], driveEnd: 0, total: 0, warnings: ['Add a starting waypoint.'] };

  const withS = r.actions
    .map((a, order) => ({ a: ACTIONS[a.type].forcedStop && !a.stop ? { ...a, stop: true } : a, order, s: posToS(path, a.at) }))
    .sort((p, q) => p.s - q.s || p.order - q.order);

  // stop points split the path into legs that each start and end at rest
  const stopSpots: { s: number; actions: Action[] }[] = [];
  for (const it of withS) {
    if (!it.a.stop) continue;
    const last = stopSpots[stopSpots.length - 1];
    if (last && Math.abs(last.s - it.s) < SAME_SPOT) last.actions.push(it.a);
    else stopSpots.push({ s: it.s, actions: [it.a] });
  }

  // shooting on the move: hold a reduced speed from the action's spot until its time is used up.
  // Time spent parked at stops inside the stretch (e.g. a Wait) counts toward the shot, so the
  // slow stretch ends where the shot actually ends instead of carrying on after the stop.
  const zones: (SpeedZone & { actionId: string })[] = [];
  const stopTime = (spot: { actions: Action[] }) => Math.max(0.05, spot.actions.reduce((sum, a) => sum + Math.max(0, a.duration), 0));
  for (const it of withS) {
    const f = moveSpeedFraction(it.a);
    if (f === null || f >= 1) continue;
    const v = Math.max(0.05, f * r.constraints.maxVel);
    let remaining = Math.max(0.1, it.a.duration);
    let cursor = it.s;
    let s1 = path.length;
    for (const spot of stopSpots) {
      if (spot.s <= it.s + 1e-6) continue; // stops at or before the shot's spot happen before it starts
      const driveTime = (spot.s - cursor) / v;
      if (driveTime >= remaining) break;
      remaining -= driveTime + stopTime(spot);
      cursor = spot.s;
      if (remaining <= 0) {
        s1 = spot.s;
        break;
      }
    }
    if (remaining > 0) s1 = Math.min(path.length, cursor + v * remaining);
    if (s1 - it.s > 0.02) zones.push({ s0: it.s, s1, v, actionId: it.a.id }); // nothing to slow at the very end of the path
  }

  let t = 0;
  let s = 0;
  const legs: { traj: TrajState[]; t0: number }[] = [];
  const driveLeg = (sEnd: number) => {
    if (sEnd - s < 1e-4) return;
    const traj = profileRange(path, s, sEnd, r.constraints, zones);
    const d = duration(traj);
    steps.push({ kind: 'drive', t0: t, t1: t + d, traj });
    legs.push({ traj, t0: t });
    t += d;
    s = sEnd;
  };

  for (const spot of stopSpots) {
    driveLeg(spot.s);
    const p = sampleAt(path, spot.s);
    const t0 = t;
    for (const a of spot.actions) {
      const d = Math.max(0, a.duration);
      timing[a.id] = { t0: t, t1: t + d, s: spot.s };
      t += d;
    }
    // even a zero-length stop needs a brief settle so the robot actually stops
    if (t - t0 < 0.05) t = t0 + 0.05;
    steps.push({ kind: 'hold', t0, t1: t, pose: { x: p.x, y: p.y, heading: p.heading }, actionIds: spot.actions.map((a) => a.id) });
  }
  driveLeg(path.length);
  const driveEnd = t;

  // actions done while driving: find when the robot passes their spot
  for (const it of withS) {
    if (it.a.stop) continue;
    let at = driveEnd;
    for (const leg of legs) {
      const first = leg.traj[0].s;
      const last = leg.traj[leg.traj.length - 1].s;
      if (it.s >= first - 1e-6 && it.s <= last + 1e-6) {
        at = leg.t0 + timeAtS(leg.traj, it.s);
        break;
      }
    }
    // an action sitting exactly on a stop spot (but not stopping) fires on arrival
    timing[it.a.id] = { t0: at, t1: at + Math.max(0, it.a.duration), s: it.s };
  }

  // turn actions into button holds
  const spans: ButtonSpan[] = [];
  const assists: Schedule['assists'] = [];
  const ordered = [...withS].sort((p, q) => timing[p.a.id].t0 - timing[q.a.id].t0 || p.order - q.order);
  let intakeOn: { t0: number; id: string } | null = null;
  for (const { a } of ordered) {
    const tm = timing[a.id];
    if (a.type === 'intakeOn') {
      if (!intakeOn) intakeOn = { t0: tm.t0, id: a.id };
      tm.t1 = Infinity;
      continue;
    }
    if (a.type === 'intakeOff') {
      if (intakeOn) {
        spans.push({ button: game.roles.intake, t0: intakeOn.t0, t1: tm.t0, actionId: intakeOn.id });
        timing[intakeOn.id].t1 = tm.t0;
        intakeOn = null;
      } else warnings.push('"Intake off" with no "Intake on" before it.');
      continue;
    }
    if (!ACTIONS[a.type].hasDuration) continue;
    const plan = actionPlan(a, game);
    for (const p of plan.presses) spans.push({ button: p.button, t0: tm.t0 + p.t0, t1: tm.t0 + p.t1, actionId: a.id });
    if (plan.assist) assists.push({ t0: tm.t0 + plan.assist[0], t1: tm.t0 + plan.assist[1], actionId: a.id });
  }
  if (intakeOn) spans.push({ button: game.roles.intake, t0: intakeOn.t0, t1: Infinity, actionId: intakeOn.id });

  const finite = spans.map((x) => x.t1).filter(Number.isFinite);
  const total = Math.max(driveEnd, ...finite, 0);
  if (total > game.autoLength) warnings.push(`Routine takes ${total.toFixed(1)} s but auto is only ${game.autoLength} s.`);
  for (const a of r.actions) {
    if (a.type === 'wait' && !a.stop) warnings.push('A "Wait" that does not stop the robot does nothing.');
    if (ACTIONS[a.type].games && !ACTIONS[a.type].games!.includes(game.id)) warnings.push(`"${ACTIONS[a.type].label}" isn't a ${game.name} action.`);
  }
  if (game.id === 'crescendo' && r.actions.some((a) => a.type === 'climb')) {
    warnings.push('Crescendo only lets robots climb in Teleop, so a climb in Auto does nothing.');
  }
  return { path, steps, spans, assists, timing, zones, driveEnd, total, warnings };
}

/** Reference pose at schedule time t (for previews and the follower). */
export function referenceAt(sched: Schedule, t: number): { pose: Pose; vx: number; vy: number; omega: number; step: Step | null } {
  const steps = sched.steps;
  if (steps.length === 0) {
    const p = sched.path.samples[0];
    return { pose: { x: p?.x ?? 0, y: p?.y ?? 0, heading: p?.heading ?? 0 }, vx: 0, vy: 0, omega: 0, step: null };
  }
  let step = steps[steps.length - 1];
  for (const st of steps) {
    if (t < st.t1) {
      step = st;
      break;
    }
  }
  if (step.kind === 'hold') return { pose: step.pose, vx: 0, vy: 0, omega: 0, step };
  const st = stateAt(step.traj, t - step.t0);
  const ended = t >= step.t1;
  return {
    pose: { x: st.x, y: st.y, heading: st.heading },
    vx: ended ? 0 : st.vx,
    vy: ended ? 0 : st.vy,
    omega: ended ? 0 : st.omega,
    step,
  };
}

export function buttonsAt(sched: Schedule, t: number): Set<ButtonId> {
  const on = new Set<ButtonId>();
  for (const sp of sched.spans) if (t >= sp.t0 && t < sp.t1) on.add(sp.button);
  return on;
}
