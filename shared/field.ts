// The three FRS games, as modeled in FRS. WPILib blue-origin coordinates, meters:
// +x from the blue wall toward red, +y toward the far guardrail (left when standing at blue).
// Every field drawing comes from FRS's own field map (the meter-scaled SVG on each game's
// Singleplayer setup screen). FRS scenes are centered on the field: x = X + L/2, y = W/2 - Z.
// See docs/recon.md.

export type GameId = 'rebuilt' | 'reefscape' | 'crescendo';
export const GAME_IDS: GameId[] = ['rebuilt', 'reefscape', 'crescendo'];
export const DEFAULT_GAME: GameId = 'rebuilt';

export interface Pose {
  x: number;
  y: number;
  heading: number; // radians, CCW from +x
}

export type Style =
  | 'zoneBlue' | 'zoneRed' // tinted area
  | 'blue' | 'red' // alliance structure
  | 'solidBlue' | 'solidRed' // scoring target
  | 'neutral' | 'lane' | 'bar' // shared structures
  | 'lineBlue' | 'lineRed' | 'lineCenter'
  | 'piece'; // pre-placed game piece mark

export type Shape =
  | { t: 'rect'; x0: number; y0: number; x1: number; y1: number; style: Style; label?: string }
  | { t: 'poly'; pts: [number, number][]; style: Style; label?: string }
  | { t: 'circle'; x: number; y: number; r: number; style: Style; label?: string }
  | { t: 'line'; x0: number; y0: number; x1: number; y1: number; style: Style };

export interface ButtonDef {
  label: string;
  /** standard-gamepad button index FRS uses by default */
  pad: number;
  /** KeyboardEvent.code values FRS binds by default */
  keys: string[];
}

export interface GameDef {
  id: GameId;
  name: string;
  year: number;
  host: string;
  autoLength: number;
  /** what the scoreboard says during Auto */
  autoLabel: string;
  field: { length: number; width: number };
  /** how the red side relates to blue: 180° rotation, or a left-right mirror */
  symmetry: 'rotate' | 'mirror';
  shapes: Shape[];
  defaultStart: Pose;
  robotSize: number;
  buttons: Record<string, ButtonDef>;
  /** which buttons the generic actions press */
  roles: { intake: string; score: string; climb: string };
  /** label for the generic score action */
  scoreLabel: string;
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// ---------- symmetry ----------

export function mirrorPoint(g: GameDef, p: { x: number; y: number }): { x: number; y: number } {
  return g.symmetry === 'rotate' ? { x: g.field.length - p.x, y: g.field.width - p.y } : { x: g.field.length - p.x, y: p.y };
}

/** Mirror a direction vector (e.g. a Bézier handle). */
export function mirrorVec(g: GameDef, v: { x: number; y: number }): { x: number; y: number } {
  return g.symmetry === 'rotate' ? { x: -v.x, y: -v.y } : { x: -v.x, y: v.y };
}

export function mirrorHeading(g: GameDef, h: number): number {
  return wrapAngle(g.symmetry === 'rotate' ? h + Math.PI : Math.PI - h);
}

export function mirrorPose(g: GameDef, p: Pose): Pose {
  return { ...mirrorPoint(g, p), heading: mirrorHeading(g, p.heading) };
}

const SWAP: Partial<Record<Style, Style>> = {
  zoneBlue: 'zoneRed', blue: 'red', solidBlue: 'solidRed', lineBlue: 'lineRed',
};

/** Blue shapes plus their red counterparts (by the game's symmetry). */
function withRed(g: Omit<GameDef, 'shapes'>, blue: Shape[], shared: Shape[] = []): Shape[] {
  const P = (x: number, y: number) => mirrorPoint(g as GameDef, { x, y });
  const red = blue.map((s): Shape => {
    const style = SWAP[s.style] ?? s.style;
    switch (s.t) {
      case 'rect': {
        const a = P(s.x0, s.y0), b = P(s.x1, s.y1);
        return { ...s, style, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
      }
      case 'poly':
        return { ...s, style, pts: s.pts.map(([x, y]) => { const q = P(x, y); return [q.x, q.y] as [number, number]; }) };
      case 'circle': {
        const q = P(s.x, s.y);
        return { ...s, style, x: q.x, y: q.y };
      }
      case 'line': {
        const a = P(s.x0, s.y0), b = P(s.x1, s.y1);
        return { ...s, style, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      }
    }
  });
  return [...blue, ...red, ...shared];
}

const rect = (x0: number, y0: number, x1: number, y1: number, style: Style, label?: string): Shape => ({ t: 'rect', x0, y0, x1, y1, style, label });
const poly = (pts: [number, number][], style: Style, label?: string): Shape => ({ t: 'poly', pts, style, label });
const circle = (x: number, y: number, r: number, style: Style, label?: string): Shape => ({ t: 'circle', x, y, r, style, label });
const line = (x0: number, y0: number, x1: number, y1: number, style: Style): Shape => ({ t: 'line', x0, y0, x1, y1, style });

// ---------- 2026 REBUILT ----------

const REBUILT_BASE = {
  id: 'rebuilt' as const,
  name: 'Rebuilt',
  year: 2026,
  host: 'rebuilt.frsim.com',
  autoLength: 20,
  autoLabel: 'Auto',
  field: { length: 16.540988, width: 8.069326 },
  symmetry: 'rotate' as const,
  defaultStart: { x: 4.4446, y: 7.6, heading: -Math.PI / 2 },
  robotSize: 0.86,
  buttons: {
    intake: { label: 'Intake', pad: 6, keys: ['ShiftLeft', 'ShiftRight'] },
    score: { label: 'Score / Shoot', pad: 7, keys: ['Space', 'KeyK'] },
    outtake: { label: 'Outtake', pad: 4, keys: ['KeyQ'] },
    climb: { label: 'Climb', pad: 3, keys: ['KeyF'] },
    special: { label: 'Robot special', pad: 5, keys: ['KeyI'] },
    intakeIn: { label: 'Intake in', pad: 2, keys: ['KeyE'] },
    hoodUp: { label: 'Hood up', pad: 1, keys: ['KeyZ'] },
  },
  roles: { intake: 'intake', score: 'score', climb: 'climb' },
  scoreLabel: 'Shoot',
};
const RW = REBUILT_BASE.field.width;
const REBUILT: GameDef = {
  ...REBUILT_BASE,
  shapes: withRed(
    REBUILT_BASE,
    [
      rect(0, 0, 4.0288, RW, 'zoneBlue'),
      rect(4.0287, 0, 5.2225, 1.2787, 'lane', 'TRENCH'),
      rect(4.0287, 6.7907, 5.2225, RW, 'lane', 'TRENCH'),
      rect(4.5495, 0, 4.7019, 1.2787, 'bar'),
      rect(4.5749, 6.7907, 4.6765, RW, 'bar'),
      rect(4.0287, 1.2787, 5.2225, 1.5837, 'solidBlue'),
      rect(4.0287, 6.4857, 5.2225, 6.7907, 'solidBlue'),
      rect(4.0617, 1.5837, 5.1895, 3.4377, 'neutral', 'BUMP'),
      rect(4.0617, 4.6317, 5.1895, 6.4857, 'neutral', 'BUMP'),
      rect(4.0287, 3.4377, 5.2225, 4.6317, 'solidBlue', 'HUB'),
      rect(0, 3.2497, 1.1477, 4.2407, 'blue', 'TOWER'),
      rect(0, 5.4318, 0.6858, 6.4986, 'blue', 'DEPOT'),
      rect(0, 0, 0.12, 1.2917, 'solidBlue'),
      line(4.003294, 0, 4.003294, RW, 'lineBlue'),
    ],
    [line(REBUILT_BASE.field.length / 2, 0, REBUILT_BASE.field.length / 2, RW, 'lineCenter')],
  ),
};

// ---------- 2025 REEFSCAPE ----------

const REEF_BASE = {
  id: 'reefscape' as const,
  name: 'Reefscape',
  year: 2025,
  host: 'reefscape.frsim.com',
  autoLength: 15,
  autoLabel: 'Autonomous',
  field: { length: 17.548, width: 8.052 },
  symmetry: 'rotate' as const,
  defaultStart: { x: 7.0482, y: 1.5, heading: 0.7918727 - Math.PI / 2 },
  robotSize: 0.95,
  buttons: {
    intake: { label: 'Intake', pad: 6, keys: ['ShiftLeft', 'ShiftRight', 'KeyF'] },
    score: { label: 'Score', pad: 7, keys: ['KeyK', 'Space'] },
    climb: { label: 'Climb', pad: 10, keys: ['KeyC'] },
    l1: { label: 'Setpoint 1 (L1)', pad: 0, keys: ['KeyU', 'Digit1'] },
    l2: { label: 'Setpoint 2 (L2)', pad: 1, keys: ['KeyI', 'Digit2'] },
    l3: { label: 'Setpoint 3 (L3)', pad: 2, keys: ['KeyO', 'Digit3'] },
    l4: { label: 'Setpoint 4 (L4)', pad: 3, keys: ['KeyP', 'Digit4'] },
    leftPole: { label: 'Left pole', pad: 4, keys: ['KeyQ'] },
    rightPole: { label: 'Right pole', pad: 5, keys: ['KeyE'] },
    piece: { label: 'Coral / algae', pad: 13, keys: ['KeyZ'] },
    intakeMode: { label: 'Intake mode', pad: 15, keys: ['KeyX'] },
  },
  roles: { intake: 'intake', score: 'score', climb: 'climb' },
  scoreLabel: 'Score',
};
const EL = REEF_BASE.field.length, EW = REEF_BASE.field.width;
const hex = (cx: number, cy: number, r: number): [number, number][] =>
  [0, 1, 2, 3, 4, 5].map((i) => [cx + r * Math.cos((Math.PI / 3) * i + Math.PI / 6), cy + r * Math.sin((Math.PI / 3) * i + Math.PI / 6)]);
const REEFSCAPE: GameDef = {
  ...REEF_BASE,
  shapes: withRed(
    REEF_BASE,
    [
      rect(0, 0, EL / 2, EW, 'zoneBlue'),
      poly(hex(4.4892, EW / 2, 1.3713), 'blue'),
      poly(hex(4.4892, EW / 2, 0.96), 'solidBlue', 'REEF'),
      rect(8.19, 4.331, 9.358, EW, 'neutral', 'BARGE'),
      circle(EL / 2, 5.08, 0.12, 'solidBlue'),
      circle(EL / 2, 6.169, 0.12, 'solidBlue'),
      circle(EL / 2, 7.261, 0.12, 'solidBlue'),
      rect(5.632, 0, 6.343, 0.1, 'solidBlue'),
      line(1.671, 0.06, 0.032, 1.251, 'lineBlue'),
      line(0.032, 6.801, 1.671, 7.992, 'lineBlue'),
      circle(1.219, 2.197, 0.206, 'piece'),
      circle(1.219, EW / 2, 0.206, 'piece'),
      circle(1.219, 5.855, 0.206, 'piece'),
      line(7.582, 0, 7.582, EW, 'lineBlue'),
    ],
    [rect(8.215, 0, 9.333, EW, 'bar')],
  ),
};

// ---------- 2024 CRESCENDO ----------

const CRES_BASE = {
  id: 'crescendo' as const,
  name: 'Crescendo',
  year: 2024,
  host: 'crescendo.frsim.com',
  autoLength: 15,
  autoLabel: 'Auto',
  field: { length: 16.541, width: 8.211 },
  symmetry: 'mirror' as const,
  defaultStart: { x: 1.63, y: 5.348, heading: Math.PI },
  robotSize: 0.92,
  buttons: {
    intake: { label: 'Intake', pad: 6, keys: ['ShiftLeft', 'ShiftRight', 'Semicolon'] },
    score: { label: 'Shoot (speaker)', pad: 7, keys: ['KeyK'] },
    amp: { label: 'Amp', pad: 5, keys: ['KeyF'] },
    outtake: { label: 'Outtake', pad: 4, keys: ['KeyQ'] },
    climb: { label: 'Climb', pad: 10, keys: ['KeyC'] },
  },
  roles: { intake: 'intake', score: 'score', climb: 'climb' },
  scoreLabel: 'Shoot',
};
const CL = CRES_BASE.field.length, CW = CRES_BASE.field.width;
const CRESCENDO: GameDef = {
  ...CRES_BASE,
  shapes: withRed(
    CRES_BASE,
    [
      rect(0, 0, 5.87, CW, 'zoneBlue'),
      rect(0, 0, 1.93, CW, 'zoneBlue'),
      rect(0, 4.373, 0.92, 6.723, 'solidBlue', 'SPEAKER'),
      rect(1.24, 8.011, 2.44, CW, 'solidBlue', 'AMP'),
      poly([[5.6506, 5.406], [3.3989, 4.1055], [5.6506, 2.805]], 'blue', 'STAGE'),
      // the blue source is in the red corner
      poly([[15.141, 0], [CL, 0], [CL, 1.4]], 'blue', 'SOURCE'),
      circle(2.896, 4.1055, 0.178, 'piece'),
      circle(2.896, 5.553, 0.178, 'piece'),
      circle(2.896, 7.001, 0.178, 'piece'),
      line(1.93, 0, 1.93, CW, 'lineBlue'),
      line(5.87, 0, 5.87, CW, 'lineBlue'),
    ],
    [
      line(CL / 2, 0, CL / 2, CW, 'lineCenter'),
      ...[0.753, 2.429, 4.1055, 5.782, 7.458].map((y) => circle(CL / 2, y, 0.178, 'piece')),
    ],
  ),
};

export const GAMES: Record<GameId, GameDef> = { rebuilt: REBUILT, reefscape: REEFSCAPE, crescendo: CRESCENDO };

export function getGame(id?: string | null): GameDef {
  return GAMES[(id as GameId) in GAMES ? (id as GameId) : DEFAULT_GAME];
}

export function gameFromHost(host: string): GameId | null {
  for (const g of GAME_IDS) if (host === GAMES[g].host || host.startsWith(g + '.')) return g;
  return null;
}

/** FRS scene (X, Z) -> field (x, y). */
export function simToField(g: GameDef, X: number, Z: number): { x: number; y: number } {
  return { x: X + g.field.length / 2, y: g.field.width / 2 - Z };
}

export function allianceOfX(g: GameDef, x: number): 'blue' | 'red' {
  return x < g.field.length / 2 ? 'blue' : 'red';
}

/** Rotation offset of each robot side from its front (FRS convention). */
export const SIDE_OFFSET: Record<string, number> = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
