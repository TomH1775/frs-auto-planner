import { DEFAULT_GAME, GAMES, getGame, mirrorHeading, mirrorPoint, mirrorVec, type GameDef, type GameId } from './field';

export interface Vec2 {
  x: number;
  y: number;
}

/** A robot mechanism button; ids are per game (see GameDef.buttons). */
export type ButtonId = string;

export function buttonIds(g: GameDef): ButtonId[] {
  return Object.keys(g.buttons);
}

export function buttonLabel(g: GameDef, id: ButtonId): string {
  return g.buttons[id]?.label ?? id;
}

/** Buttons that aren't already covered by the intake / score / climb actions. */
export function extraButtons(g: GameDef): ButtonId[] {
  const roles = new Set(Object.values(g.roles));
  return buttonIds(g).filter((b) => !roles.has(b));
}

export type ActionType =
  | 'intakeOn' | 'intakeOff' | 'intakeFor' | 'shoot' | 'climb' | 'button' | 'wait'
  // Reefscape
  | 'coral' | 'algaeReef' | 'net' | 'processor'
  // Crescendo
  | 'amp';

export interface ActionMeta {
  label: string;
  short: string;
  color: string;
  hasDuration: boolean;
  defaultDuration: number;
  defaultStop: boolean;
  help: string;
  /** only offered in these games (default: every game) */
  games?: GameId[];
  /** always stops the robot (it auto-aligns or needs to be parked) */
  forcedStop?: boolean;
}

export const ACTIONS: Record<ActionType, ActionMeta> = {
  intakeOn: { label: 'Intake on', short: 'I+', color: '#22c55e', hasDuration: false, defaultDuration: 0, defaultStop: false, help: 'Start intaking here and keep going until an "Intake off" (or auto ends).' },
  intakeOff: { label: 'Intake off', short: 'I−', color: '#64748b', hasDuration: false, defaultDuration: 0, defaultStop: false, help: 'Stop intaking here.' },
  intakeFor: { label: 'Intake for…', short: 'I', color: '#16a34a', hasDuration: true, defaultDuration: 1.5, defaultStop: false, help: 'Run the intake for a set time starting here.' },
  shoot: { label: 'Shoot / Score', short: 'S', color: '#f59e0b', hasDuration: true, defaultDuration: 2, defaultStop: true, help: 'Hold the score button for a set time.' },
  climb: { label: 'Climb', short: 'C', color: '#a855f7', hasDuration: true, defaultDuration: 0.2, defaultStop: true, help: 'Press the climb button. Raise the time to hold it longer.' },
  button: { label: 'Press button', short: 'B', color: '#06b6d4', hasDuration: true, defaultDuration: 0.2, defaultStop: false, help: 'Press or hold any robot button.' },
  wait: { label: 'Wait', short: 'W', color: '#ef4444', hasDuration: true, defaultDuration: 1, defaultStop: true, help: 'Stop here for a set time.' },
  coral: {
    label: 'Score coral', short: 'Co', color: '#f472b6', hasDuration: true, defaultDuration: 2.5, defaultStop: true, forcedStop: true, games: ['reefscape'],
    help: "Holds the level (L1–L4) and a pole button so FRS auto-aligns to the nearest reef pole, then scores. Place it near your reef (within 8 m); FRS does the final lining up.",
  },
  algaeReef: {
    label: 'Take reef algae', short: 'Al', color: '#2dd4bf', hasDuration: true, defaultDuration: 2.5, defaultStop: true, forcedStop: true, games: ['reefscape'],
    help: 'Holds L2 or L3 and a pole button so FRS auto-aligns to the algae on the nearest reef face, then runs the intake.',
  },
  net: {
    label: 'Algae → net', short: 'N', color: '#38bdf8', hasDuration: true, defaultDuration: 3, defaultStop: true, forcedStop: true, games: ['reefscape'],
    help: 'With algae held: holds L4 and a pole button so FRS auto-aligns to the barge, then scores in the net.',
  },
  processor: {
    label: 'Algae → processor', short: 'P', color: '#818cf8', hasDuration: true, defaultDuration: 1.2, defaultStop: true, forcedStop: true, games: ['reefscape'],
    help: "With algae held: holds L1 and scores into the processor. Auto-align always prefers the net, so end your path at the processor with the robot's algae side facing it.",
  },
  amp: {
    label: 'Score amp', short: 'A', color: '#fb923c', hasDuration: true, defaultDuration: 1.2, defaultStop: true, forcedStop: true, games: ['crescendo'],
    help: "Presses Amp. End your path at the amp (top wall) with the robot's amp side facing it. FRS needs it within about 40°.",
  },
};

/** Action types offered for this game, in palette order. */
export function actionTypesFor(g: GameDef): ActionType[] {
  return (Object.keys(ACTIONS) as ActionType[]).filter((t) => !ACTIONS[t].games || ACTIONS[t].games!.includes(g.id));
}

export const ACTION_TYPES = Object.keys(ACTIONS) as ActionType[];

/** Action label in this game's words (e.g. "Shoot" vs "Score"). */
export function actionLabel(type: ActionType, g: GameDef): string {
  return type === 'shoot' ? (g.id === 'crescendo' ? 'Shoot (speaker)' : g.scoreLabel) : ACTIONS[type].label;
}

/** e.g. "Score coral L4 · left" */
export function actionTitle(a: Action, g: GameDef): string {
  const base = a.type === 'button' ? `Press ${buttonLabel(g, a.button ?? '')}` : actionLabel(a.type, g);
  if (a.type === 'coral') return `${base} L${a.level ?? 4} · ${a.side ?? 'left'}`;
  if (a.type === 'algaeReef') return `${base} L${a.level === 3 ? 3 : 2} · ${a.side ?? 'left'}`;
  if (a.type === 'net') return `${base} · ${a.side ?? 'left'}`;
  return base;
}

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
  /** Reefscape: reef level 1–4 (coral) or 2–3 (algae on the reef) */
  level?: number;
  /** Reefscape: which pole button to align with (left/right as seen from your camera) */
  side?: 'left' | 'right';
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
  /** which FRS game this auto is for (missing = Rebuilt, for routines made before multi-game) */
  game?: GameId;
  waypoints: Waypoint[];
  actions: Action[];
  constraints: Constraints;
  updatedAt: number;
}

export function gameOf(r: { game?: GameId }): GameDef {
  return getGame(r.game);
}

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

export function buttonForAction(a: Action, g: GameDef): ButtonId | null {
  switch (a.type) {
    case 'intakeOn':
    case 'intakeOff':
    case 'intakeFor':
      return g.roles.intake;
    case 'shoot':
      return g.roles.score;
    case 'climb':
      return g.roles.climb;
    case 'button':
      return a.button && a.button in g.buttons ? a.button : extraButtons(g)[0] ?? null;
    case 'coral':
    case 'net':
    case 'processor':
      return g.roles.score;
    case 'algaeReef':
      return g.roles.intake;
    case 'amp':
      return 'amp' in g.buttons ? 'amp' : null;
    case 'wait':
      return null;
  }
}

/** One button held during an action, in seconds from the action's start. */
export interface PlannedPress {
  button: ButtonId;
  t0: number;
  t1: number;
}

/**
 * What an action does with the robot's buttons, and when the path follower must let go of
 * the sticks so FRS's own auto-align can drive (`assist`, seconds from the action's start).
 * Recipes for Reefscape and Crescendo were worked out in FRS (see docs/recon.md).
 */
export function actionPlan(a: Action, g: GameDef): { presses: PlannedPress[]; assist: [number, number] | null } {
  const D = Math.max(0.1, a.duration);
  const has = (b: string) => b in g.buttons;
  const press = (button: string, t0: number, t1: number): PlannedPress[] => (has(button) ? [{ button, t0, t1 }] : []);
  const pole = a.side === 'right' ? 'rightPole' : 'leftPole';
  switch (a.type) {
    case 'intakeOn':
    case 'intakeOff':
    case 'wait':
      return { presses: [], assist: null };
    case 'intakeFor':
      return { presses: press(g.roles.intake, 0, D), assist: null };
    case 'shoot':
      return { presses: press(g.roles.score, 0, D), assist: null };
    case 'climb':
      return { presses: press(g.roles.climb, 0, D), assist: null };
    case 'button': {
      const b = buttonForAction(a, g);
      return { presses: b ? press(b, 0, D) : [], assist: null };
    }
    case 'coral': {
      // hold level + pole: FRS drives to the pole (~0.5–1.5 s), then score while still holding the level
      const at = Math.max(0.6, D - 1);
      const level = `l${Math.min(4, Math.max(1, a.level ?? 4))}`;
      return { presses: [...press(level, 0, D), ...press(pole, 0, at + 0.4), ...press(g.roles.score, at, at + 0.4)], assist: [0, D] };
    }
    case 'algaeReef': {
      const level = `l${a.level === 3 ? 3 : 2}`;
      const grab = Math.max(0.6, D - 1.2);
      return { presses: [...press(level, 0, D), ...press(pole, 0, D), ...press(g.roles.intake, grab, D)], assist: [0, D] };
    }
    case 'net': {
      const at = Math.max(0.8, D - 0.9);
      return { presses: [...press('l4', 0, D), ...press(pole, 0, at + 0.4), ...press(g.roles.score, at, at + 0.4)], assist: [0, D] };
    }
    case 'processor': {
      const at = Math.max(0.2, D - 0.6);
      return { presses: [...press('l1', 0, D), ...press(g.roles.score, at, Math.max(at + 0.2, D - 0.2))], assist: null };
    }
    case 'amp':
      return { presses: press('amp', 0, D), assist: null };
  }
}

export function makeWaypoint(x: number, y: number, heading: number | null = null): Waypoint {
  return { id: uid('w'), x, y, heading, hin: { x: 0, y: 0 }, hout: { x: 0, y: 0 }, autoHandles: true };
}

export function makeAction(type: ActionType, at: PathPos, g: GameDef = GAMES[DEFAULT_GAME]): Action {
  const m = ACTIONS[type];
  const button = type === 'button' ? extraButtons(g)[0] ?? buttonIds(g)[0] : undefined;
  const extra: Partial<Action> = {};
  if (button) extra.button = button;
  if (type === 'coral') Object.assign(extra, { level: 4, side: 'left' });
  if (type === 'algaeReef') Object.assign(extra, { level: 2, side: 'left' });
  if (type === 'net') extra.side = 'left';
  return { id: uid('a'), type, at, duration: m.defaultDuration, stop: m.defaultStop, ...extra };
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

/** The demo auto for a fresh planner (Rebuilt). */
export function newRoutine(name = 'New auto'): Routine {
  const s = GAMES.rebuilt.defaultStart;
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
    game: 'rebuilt',
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

export function blankRoutine(name = 'New auto', game: GameId = DEFAULT_GAME): Routine {
  const s = GAMES[game].defaultStart;
  return { version: 1, id: uid('r'), name, game, waypoints: [makeWaypoint(s.x, s.y, s.heading)], actions: [], constraints: { ...DEFAULT_CONSTRAINTS }, updatedAt: Date.now() };
}

/** Move the whole routine to the other alliance (rotated or mirrored, per the game). */
export function mirrorRoutine(r: Routine): Routine {
  const g = gameOf(r);
  return {
    ...r,
    waypoints: r.waypoints.map((w) => ({
      ...w,
      ...mirrorPoint(g, w),
      heading: w.heading === null ? null : mirrorHeading(g, w.heading),
      hin: mirrorVec(g, w.hin),
      hout: mirrorVec(g, w.hout),
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
  if (r.game !== undefined && !(r.game in GAMES)) throw new Error(`Unknown game "${r.game}".`);
  return r;
}
