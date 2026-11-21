export interface Calibration {
  /** robot speed at full stick, m/s */
  maxVel: number;
  /** turn rate at full stick, rad/s */
  maxOmega: number;
  /** game stick deadzone (Settings → Controller), 0..1 */
  deadzone: number;
}

export const DEFAULT_CALIBRATION: Calibration = { maxVel: 5.5, maxOmega: 5.4, deadzone: 0.12 };

export interface Sticks {
  lx: number; // axes[0], + = right
  ly: number; // axes[1], + = down
  rx: number; // axes[2], + = right (clockwise turn)
}

function shape(m: number, dz: number): number {
  if (m < 0.004) return 0;
  return Math.min(1, dz + (1 - dz) * m);
}

/**
 * How the game turns the left stick into motion.
 * - 'field' (default): driver-perspective field-relative. Blue: stick up = +x, stick right = -y;
 *   red: both flipped (Rebuilt, Reefscape, Crescendo third-person/station cameras).
 * - 'robot': robot-relative (Crescendo's first-person camera). `leadYaw` is the FRS scene yaw of
 *   the side the camera faces; FRS moves the robot by moveY·(sin e, cos e) + moveX·(−cos e, sin e)
 *   in scene (X, Z), with e = leadYaw.
 */
export type DriveFrame = { kind: 'field' } | { kind: 'robot'; leadYaw: number };

/**
 * Field-relative velocity command -> stick positions.
 * The game applies a radial deadzone and a linear response, so we invert that.
 * Right stick right = clockwise in every game.
 */
export function stickFromVelocity(
  vx: number,
  vy: number,
  omega: number,
  alliance: 'blue' | 'red',
  cal: Calibration,
  frame: DriveFrame = { kind: 'field' },
): Sticks {
  // desired "moveY" (stick up) and "moveX" (stick right) in m/s
  let moveY: number, moveX: number;
  if (frame.kind === 'robot') {
    // scene velocity (X, Z) = (vx, -vy); invert FRS's robot-relative mapping
    const e = frame.leadYaw;
    const VX = vx, VZ = -vy;
    moveY = VX * Math.sin(e) + VZ * Math.cos(e);
    moveX = -VX * Math.cos(e) + VZ * Math.sin(e);
  } else {
    const sign = alliance === 'blue' ? 1 : -1;
    moveY = vx * sign;
    moveX = -vy * sign;
  }
  const ux = moveX / cal.maxVel;
  const uy = moveY / cal.maxVel;
  const m = Math.hypot(ux, uy);
  let lx = 0, ly = 0;
  if (m > 0) {
    const out = shape(Math.min(1, m), cal.deadzone);
    lx = (ux / m) * out;
    ly = (-uy / m) * out;
  }
  const w = omega / cal.maxOmega;
  const rx = -Math.sign(w) * shape(Math.min(1, Math.abs(w)), cal.deadzone);
  return { lx: lx + 0, ly: ly + 0, rx: rx + 0 };
}
