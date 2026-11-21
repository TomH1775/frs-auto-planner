import { DEFAULT_BLUE_START, mirrorPoint, wrapAngle } from './field';

export interface Vec2 {
  x: number;
  y: number;
}

/** Robot mechanisms we can trigger. `pad` is the standard-gamepad button index FRS uses by default. */
export type ButtonId = 'intake' | 'score' | 'outtake' | 'climb' | 'special' | 'intakeIn' | 'hoodUp';

export const BUTTONS: Record<ButtonId, { label: string; pad: number; key: string }> = {
  intake: { label: 'Intake', pad: 6, key: 'Shift' },
  score: { label: 'Score / Shoot', pad: 7, key: 'Space' },
  outtake: { label: 'Outtake', pad: 4, key: 'Q' },
  climb: { label: 'Climb', pad: 3, key: 'F' },
  special: { label: 'Robot special', pad: 5, key: 'I' },
  intakeIn: { label: 'Intake in', pad: 2, key: 'E' },
  hoodUp: { label: 'Hood up', pad: 1, key: 'Z' },
};

export const BUTTON_IDS = Object.keys(BUTTONS) as ButtonId[];

export type ActionType = 'intakeOn' | 'intakeOff' | 'intakeFor' | 'shoot' | 'climb' | 'button' | 'wait';

export interface ActionMeta {
  label: string;
  short: string;
  color: string;
  hasDuration: boolean;
  defaultDuration: number;
  defaultStop: boolean;
  help: string;
}

export const ACTIONS: Record<ActionType, ActionMeta> = {
  intakeOn: { label: 'Intake on', short: 'I+', color: '#22c55e', hasDuration: false, defaultDuration: 0, defaultStop: false, help: 'Start intaking here and keep going until an "Intake off" (or auto ends).' },
  intakeOff: { label: 'Intake off', short: 'I−', color: '#64748b', hasDuration: false, defaultDuration: 0, defaultStop: false, help: 'Stop intaking here.' },
  intakeFor: { label: 'Intake for…', short: 'I', color: '#16a34a', hasDuration: true, defaultDuration: 1.5, defaultStop: false, help: 'Run the intake for a set time starting here.' },
  shoot: { label: 'Shoot', short: 'S', color: '#f59e0b', hasDuration: true, defaultDuration: 2, defaultStop: true, help: 'Hold the score button for a set time.' },
  climb: { label: 'Climb', short: 'C', color: '#a855f7', hasDuration: true, defaultDuration: 0.2, defaultStop: true, help: 'Press the climb button. Raise the time to hold it longer.' },
  button: { label: 'Press button', short: 'B', color: '#06b6d4', hasDuration: true, defaultDuration: 0.2, defaultStop: false, help: 'Press or hold any robot button.' },
  wait: { label: 'Wait', short: 'W', color: '#ef4444', hasDuration: true, defaultDuration: 1, defaultStop: true, help: 'Stop here for a set time.' },
};

export const ACTION_TYPES = Object.keys(ACTIONS) as ActionType[];

/** Position on the path: segment index (between waypoint seg and seg+1) and Bézier parameter u ∈ [0,1]. */
export interface PathPos {
  seg: number;
  u: number;
}

export interface Action {
  id: string;
  type: ActionType;
  at: PathPos;
  /** seconds; for tap-like actions this is the hold time */
  duration: number;
  /** robot stops at this point while the action runs */
  stop: boolean;
  /** only for type 'button' */
  button?: ButtonId;
  /** shoot on the move: drive at this % of max speed while shooting (default 50) */
  speedPct?: number;
}

export interface Waypoint {
  id: string;
  x: number;
  y: number;
  /** robot heading to reach at this waypoint (swerve rotates independently of travel). null = interpolate */
  heading: number | null;
  /** Bézier handle offsets, relative to the waypoint */
  hin: Vec2;
  hout: Vec2;
  /** handles follow the neighbors automatically until the user drags one */
  autoHandles: boolean;
}

export interface Constraints {
  maxVel: number; // m/s
  maxAccel: number; // m/s^2
  maxAngVel: number; // rad/s
  /** sideways (centripetal) acceleration allowed in curves, m/s^2. Higher = keeps more speed through waypoints. */
  maxLatAccel?: number;
}

/** Swerve robots in FRS hold a lot of speed through curves; only tight turns need slowing. */
export const DEFAULT_LAT_ACCEL = 15;

export interface Routine {
  robotId?: number;
  version: 1;
  id: string;
  name: string;
  waypoints: Waypoint[];
  actions: Action[];
  constraints: Constraints;
  updatedAt: number;
}

export const AUTO_LENGTH = 20;

export const DEFAULT_SHOOT_SPEED_PCT = 50;

/** Speed cap (fraction of max) the robot holds while this action runs on the move, or null. */
export function moveSpeedFraction(a: Action): number | null {
  if (a.stop || a.type !== 'shoot') return null;
  const pct = a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT;
  return Math.min(100, Math.max(5, pct)) / 100;
}

export const DEFAULT_CONSTRAINTS: Constraints = { maxVel: 3.5, maxAccel: 4, maxAngVel: 4, maxLatAccel: DEFAULT_LAT_ACCEL };

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}

export function buttonForAction(a: Action): ButtonId | null {
  switch (a.type) {
    case 'intakeOn':
    case 'intakeOff':
    case 'intakeFor':
      return 'intake';
    case 'shoot':
      return 'score';
    case 'climb':
      return 'climb';
    case 'button':
      return a.button ?? 'special';
    case 'wait':
      return null;
  }
}

export function makeWaypoint(x: number, y: number, heading: number | null = null): Waypoint {
  return { id: uid('w'), x, y, heading, hin: { x: 0, y: 0 }, hout: { x: 0, y: 0 }, autoHandles: true };
}

export function makeAction(type: ActionType, at: PathPos): Action {
  const m = ACTIONS[type];
  return { id: uid('a'), type, at, duration: m.defaultDuration, stop: m.defaultStop, ...(type === 'button' ? { button: 'special' as ButtonId } : {}) };
}

/** Recompute automatic (Catmull-Rom style) handles for waypoints flagged autoHandles. */
export function applyAutoHandles(wps: Waypoint[]): Waypoint[] {
  return wps.map((w, i) => {
    if (!w.autoHandles) return w;
    const prev = wps[i - 1];
    const next = wps[i + 1];
    if (!prev && !next) return { ...w, hin: { x: 0, y: 0 }, hout: { x: 0, y: 0 } };
    const a = prev ?? w;
    const b = next ?? w;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const dIn = prev ? Math.hypot(w.x - prev.x, w.y - prev.y) / 3 : 0;
    const dOut = next ? Math.hypot(next.x - w.x, next.y - w.y) / 3 : 0;
    return { ...w, hin: { x: -dx * dIn + 0, y: -dy * dIn + 0 }, hout: { x: dx * dOut + 0, y: dy * dOut + 0 } };
  });
}

export function newRoutine(name = 'New auto'): Routine {
  const s = DEFAULT_BLUE_START;
  const wps = applyAutoHandles([
    makeWaypoint(s.x, s.y, s.heading),
    makeWaypoint(7.2, 7.2, null),
    makeWaypoint(8.0, 5.5, -Math.PI / 2),
    makeWaypoint(6.2, 7.3, null),
    makeWaypoint(3.6, 7.35, null),
    makeWaypoint(2.6, 6.2, -Math.PI / 4),
  ]);
  return {
    version: 1,
    id: uid('r'),
    name,
    waypoints: wps,
    actions: [
      makeAction('intakeOn', { seg: 0, u: 0.6 }),
      makeAction('intakeOff', { seg: 2, u: 0.5 }),
      { ...makeAction('shoot', { seg: 4, u: 1 }), duration: 3 },
    ],
    constraints: { ...DEFAULT_CONSTRAINTS },
    updatedAt: Date.now(),
  };
}

export function blankRoutine(name = 'New auto'): Routine {
  const s = DEFAULT_BLUE_START;
  return { version: 1, id: uid('r'), name, waypoints: [makeWaypoint(s.x, s.y, s.heading)], actions: [], constraints: { ...DEFAULT_CONSTRAINTS }, updatedAt: Date.now() };
}

/** Rotate the whole routine 180° about field center (blue <-> red). */
export function mirrorRoutine(r: Routine): Routine {
  return {
    ...r,
    waypoints: r.waypoints.map((w) => ({
      ...w,
      ...mirrorPoint(w),
      heading: w.heading === null ? null : wrapAngle(w.heading + Math.PI),
      hin: { x: -w.hin.x, y: -w.hin.y },
      hout: { x: -w.hout.x, y: -w.hout.y },
    })),
  };
}

/** Basic shape validation for imported JSON. Throws with a readable message. */
export function parseRoutine(json: string): Routine {
  const r = JSON.parse(json) as Routine;
  if (!r || r.version !== 1 || !Array.isArray(r.waypoints) || !Array.isArray(r.actions) || !r.constraints) {
    throw new Error('Not an FRS Auto routine (version 1).');
  }
  for (const w of r.waypoints) {
    if (typeof w.x !== 'number' || typeof w.y !== 'number') throw new Error('Waypoint is missing x/y.');
  }
  for (const a of r.actions) {
    if (!(a.type in ACTIONS)) throw new Error(`Unknown action type "${a.type}".`);
  }
  return r;
}
