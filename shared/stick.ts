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
 * Field-relative velocity command -> stick positions.
 * FRS drives field-relative from the driver's perspective (see docs/recon.md):
 * blue: stick up = +x, stick right = -y; red: both flipped. Right stick right = clockwise.
 * The game applies a radial deadzone and a linear response, so we invert that.
 */
export function stickFromVelocity(vx: number, vy: number, omega: number, alliance: 'blue' | 'red', cal: Calibration): Sticks {
  const sign = alliance === 'blue' ? 1 : -1;
  const ux = (vx / cal.maxVel) * sign; // + = "up" on stick
  const uy = (vy / cal.maxVel) * sign; // + = "left" on stick
  const m = Math.hypot(ux, uy);
  let lx = 0, ly = 0;
  if (m > 0) {
    const out = shape(Math.min(1, m), cal.deadzone);
    lx = (-uy / m) * out;
    ly = (-ux / m) * out;
  }
  const w = omega / cal.maxOmega;
  const rx = -Math.sign(w) * shape(Math.min(1, Math.abs(w)), cal.deadzone);
  return { lx: lx + 0, ly: ly + 0, rx: rx + 0 };
}
