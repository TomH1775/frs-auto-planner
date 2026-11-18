// 2026 REBUILT field as modeled in FRS. WPILib blue-origin coordinates, meters:
// +x from the blue wall toward red, +y toward the "far" guardrail (left when standing at blue).
// Element rectangles come from the bounding boxes of FRS scene objects (see docs/recon.md).

export const FIELD = { length: 16.54, width: 8.022 } as const;

/** FRS scene (X, Z) -> field (x, y). */
export const SIM_ORIGIN = { x: 8.27, z: 4.011 } as const;

export interface Pose {
  x: number;
  y: number;
  heading: number; // radians, CCW from +x
}

export type ElementKind = 'hub' | 'tower' | 'depot' | 'bump' | 'trench' | 'outpost' | 'zone';

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

const BLUE: FieldRect[] = [
  rect('Blue alliance zone', 'zone', 'blue', 0, 0, 4.028, FIELD.width),
  rect('Blue hub', 'hub', 'blue', 4.008, 3.272, 5.502, 4.75),
  rect('Blue tower', 'tower', 'blue', 0, 3.125, 1.144, 4.319),
  rect('Blue depot', 'depot', 'blue', 0, 5.408, 0.685, 6.475),
  rect('Blue bump', 'bump', 'blue', 4.061, 1.56, 5.189, 3.414),
  rect('Blue bump', 'bump', 'blue', 4.061, 4.608, 5.189, 6.462),
  rect('Blue trench', 'trench', 'blue', 4.028, 0, 5.222, 1.56),
  rect('Blue trench', 'trench', 'blue', 4.028, 6.462, 5.222, FIELD.width),
  rect('Blue outpost', 'outpost', 'blue', 0, 0, 0.25, 1.048),
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
export const DEFAULT_BLUE_START: Pose = { x: 4.44, y: 7.57, heading: -Math.PI / 2 };

export function simToField(X: number, Z: number): { x: number; y: number } {
  return { x: X + SIM_ORIGIN.x, y: SIM_ORIGIN.z - Z };
}

export function allianceOfX(x: number): 'blue' | 'red' {
  return x < FIELD.length / 2 ? 'blue' : 'red';
}
