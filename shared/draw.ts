import { FIELD, FIELD_ELEMENTS, ROBOT_SIZE, STARTING_LINE_X, type ElementKind, type Pose } from './field';
import type { SampledPath } from './path';

/** Field -> canvas transform. Blue wall on the left, +y up. */
export interface View {
  scale: number; // px per meter
  ox: number;
  oy: number;
}

export function fitView(w: number, h: number, pad = 12): View {
  const scale = Math.min((w - 2 * pad) / FIELD.length, (h - 2 * pad) / FIELD.width);
  return { scale, ox: (w - FIELD.length * scale) / 2, oy: (h - FIELD.width * scale) / 2 };
}

export const toCanvas = (v: View, x: number, y: number) => ({ cx: v.ox + x * v.scale, cy: v.oy + (FIELD.width - y) * v.scale });
export const toField = (v: View, cx: number, cy: number) => ({ x: (cx - v.ox) / v.scale, y: FIELD.width - (cy - v.oy) / v.scale });

const FILL: Record<ElementKind, [string, string]> = {
  zone: ['rgba(59,130,246,0.10)', 'rgba(239,68,68,0.10)'],
  hub: ['rgba(59,130,246,0.55)', 'rgba(239,68,68,0.55)'],
  tower: ['rgba(59,130,246,0.35)', 'rgba(239,68,68,0.35)'],
  depot: ['rgba(59,130,246,0.25)', 'rgba(239,68,68,0.25)'],
  bump: ['rgba(148,163,184,0.25)', 'rgba(148,163,184,0.25)'],
  trench: ['rgba(148,163,184,0.08)', 'rgba(148,163,184,0.08)'],
  trenchWall: ['rgba(59,130,246,0.7)', 'rgba(239,68,68,0.7)'],
  trenchBar: ['rgba(203,213,225,0.55)', 'rgba(203,213,225,0.55)'],
  outpost: ['rgba(59,130,246,0.6)', 'rgba(239,68,68,0.6)'],
};

const OUTLINED: ElementKind[] = ['hub', 'tower', 'depot', 'bump', 'trench'];
const LABELED: ElementKind[] = ['hub', 'tower', 'depot', 'bump', 'trench'];

export function drawField(ctx: CanvasRenderingContext2D, v: View, opts: { labels?: boolean } = {}) {
  const { cx: x0, cy: y0 } = toCanvas(v, 0, FIELD.width);
  ctx.fillStyle = '#1b1f27';
  ctx.fillRect(x0, y0, FIELD.length * v.scale, FIELD.width * v.scale);
  for (const r of FIELD_ELEMENTS) {
    const a = toCanvas(v, r.x0, r.y1);
    const w = (r.x1 - r.x0) * v.scale;
    const h = (r.y1 - r.y0) * v.scale;
    ctx.fillStyle = FILL[r.kind][r.alliance === 'blue' ? 0 : 1];
    ctx.fillRect(a.cx, a.cy, w, h);
    if (OUTLINED.includes(r.kind)) {
      ctx.strokeStyle = r.kind === 'bump' || r.kind === 'trench' ? 'rgba(148,163,184,0.45)' : r.alliance === 'blue' ? '#3b82f6' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(a.cx + 0.5, a.cy + 0.5, w - 1, h - 1);
    }
    if (opts.labels && LABELED.includes(r.kind)) {
      ctx.fillStyle = 'rgba(226,232,240,0.55)';
      ctx.font = `${Math.max(9, v.scale * 0.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.kind.toUpperCase(), a.cx + w / 2, a.cy + h / 2);
    }
  }
  const vline = (x: number, color: string, dash: number[]) => {
    const p0 = toCanvas(v, x, 0);
    const p1 = toCanvas(v, x, FIELD.width);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    ctx.lineTo(p1.cx, p1.cy);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  // starting lines and center line
  vline(STARTING_LINE_X, 'rgba(96,165,250,0.6)', []);
  vline(FIELD.length - STARTING_LINE_X, 'rgba(248,113,113,0.6)', []);
  vline(FIELD.length / 2, 'rgba(226,232,240,0.25)', [4, 4]);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, FIELD.length * v.scale, FIELD.width * v.scale);
}

export function drawPathLine(ctx: CanvasRenderingContext2D, v: View, path: SampledPath, color = '#facc15', width = 3) {
  if (path.samples.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  path.samples.forEach((p, i) => {
    const { cx, cy } = toCanvas(v, p.x, p.y);
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
}

/** Robot footprint with a front marker (front = direction of `heading`). */
export function drawRobot(ctx: CanvasRenderingContext2D, v: View, pose: Pose, opts: { size?: number; fill?: string; stroke?: string; alpha?: number } = {}) {
  const size = (opts.size ?? ROBOT_SIZE) * v.scale;
  const { cx, cy } = toCanvas(v, pose.x, pose.y);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(cx, cy);
  ctx.rotate(-pose.heading);
  ctx.fillStyle = opts.fill ?? 'rgba(250,204,21,0.25)';
  ctx.strokeStyle = opts.stroke ?? '#facc15';
  ctx.lineWidth = 2;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  // front triangle
  ctx.fillStyle = opts.stroke ?? '#facc15';
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2 - size * 0.3, -size * 0.22);
  ctx.lineTo(size / 2 - size * 0.3, size * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
