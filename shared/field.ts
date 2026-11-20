// 2026 REBUILT field as modeled in FRS. WPILib blue-origin coordinates, meters:
// +x from the blue wall toward red, +y toward the "far" guardrail (left when standing at blue).
// Dimensions come from FRS's own field map (the SVG on the Singleplayer setup screen, drawn in
// meters, centered on the field): 16.541 x 8.069 m. See docs/recon.md.

export const FIELD = { length: 16.540988, width: 8.069326 } as const;

/** FRS scene (X, Z) -> field (x, y): x = X + 8.2705, y = 4.0347 - Z. */
export const SIM_ORIGIN = { x: FIELD.length / 2, z: FIELD.width / 2 } as const;

/** Blue starting line (robots start touching it); red is mirrored. */
export const STARTING_LINE_X = 4.003294;

export interface Pose {
  x: number;
  y: number;
  heading: number; // radians, CCW from +x
}

export type ElementKind = 'zone' | 'hub' | 'tower' | 'depot' | 'bump' | 'trench' | 'trenchWall' | 'trenchBar' | 'outpost';

export interface FieldRect {
  name: string;
  kind: ElementKind;
  alliance: 'blue' | 'red';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const rect = (name: string, kind: ElementKind, alliance: 'blue' | 'red', x0: number, y0: number, x1: number, y1: number): FieldRect => ({
  name, kind, alliance, x0, y0, x1, y1,
});

// FRS map (X, Z) -> field: x = X + 8.270494, y = 4.034663 - Z
const W = FIELD.width;
const BLUE: FieldRect[] = [
  rect('Blue alliance zone', 'zone', 'blue', 0, 0, 4.0288, W),
  rect('Blue trench', 'trench', 'blue', 4.0287, 0, 5.2225, 1.2787),
  rect('Blue trench', 'trench', 'blue', 4.0287, 6.7907, 5.2225, W),
  rect('Blue trench bar', 'trenchBar', 'blue', 4.5495, 0, 4.7019, 1.2787),
  rect('Blue trench bar', 'trenchBar', 'blue', 4.5749, 6.7907, 4.6765, W),
  rect('Blue trench wall', 'trenchWall', 'blue', 4.0287, 1.2787, 5.2225, 1.5837),
  rect('Blue trench wall', 'trenchWall', 'blue', 4.0287, 6.4857, 5.2225, 6.7907),
  rect('Blue bump', 'bump', 'blue', 4.0617, 1.5837, 5.1895, 3.4377),
  rect('Blue bump', 'bump', 'blue', 4.0617, 4.6317, 5.1895, 6.4857),
  rect('Blue hub', 'hub', 'blue', 4.0287, 3.4377, 5.2225, 4.6317),
  rect('Blue tower', 'tower', 'blue', 0, 3.2497, 1.1477, 4.2407),
  rect('Blue depot', 'depot', 'blue', 0, 5.4318, 0.6858, 6.4986),
  rect('Blue outpost', 'outpost', 'blue', 0, 0, 0.12, 1.2917),
];

export function mirrorPoint(p: { x: number; y: number }): { x: number; y: number } {
  return { x: FIELD.length - p.x, y: FIELD.width - p.y };
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function mirrorPose(p: Pose): Pose {
  return { ...mirrorPoint(p), heading: wrapAngle(p.heading + Math.PI) };
}

/** The field is rotationally symmetric, so red elements are the blue ones rotated 180°. */
export const FIELD_ELEMENTS: FieldRect[] = [
  ...BLUE,
  ...BLUE.map((r) => {
    const a = mirrorPoint({ x: r.x0, y: r.y0 });
    const b = mirrorPoint({ x: r.x1, y: r.y1 });
    return {
      ...r,
      name: r.name.replace('Blue', 'Red'),
      alliance: 'red' as const,
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    };
  }),
];

/** Default FRS blue starting spot (robot front facing -y). */
export const DEFAULT_BLUE_START: Pose = { x: 4.4446, y: 7.6, heading: -Math.PI / 2 };

/** Robot bumper footprint in FRS (2910's robot is 0.851 x 0.857 m). */
export const ROBOT_SIZE = 0.86;

export function simToField(X: number, Z: number): { x: number; y: number } {
  return { x: X + SIM_ORIGIN.x, y: SIM_ORIGIN.z - Z };
}

export function allianceOfX(x: number): 'blue' | 'red' {
  return x < FIELD.length / 2 ? 'blue' : 'red';
}
