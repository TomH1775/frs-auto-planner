import type { GameDef, Pose, Shape, Style } from './field';
import type { SampledPath } from './path';

/** Field -> canvas transform. Blue wall on the left, +y up. */
export interface View {
  scale: number; // px per meter
  ox: number;
  oy: number;
  /** field size the view was fitted to */
  L: number;
  W: number;
}

export function fitView(w: number, h: number, pad: number, g: GameDef): View {
  const L = g.field.length, W = g.field.width;
  const scale = Math.min((w - 2 * pad) / L, (h - 2 * pad) / W);
  return { scale, ox: (w - L * scale) / 2, oy: (h - W * scale) / 2, L, W };
}

export const toCanvas = (v: View, x: number, y: number) => ({ cx: v.ox + x * v.scale, cy: v.oy + (v.W - y) * v.scale });
export const toField = (v: View, cx: number, cy: number) => ({ x: (cx - v.ox) / v.scale, y: v.W - (cy - v.oy) / v.scale });

const LOOK: Record<Style, { fill?: string; stroke?: string; width?: number; dash?: number[] }> = {
  zoneBlue: { fill: 'rgba(59,130,246,0.10)' },
  zoneRed: { fill: 'rgba(239,68,68,0.10)' },
  blue: { fill: 'rgba(59,130,246,0.28)', stroke: '#3b82f6' },
  red: { fill: 'rgba(239,68,68,0.28)', stroke: '#ef4444' },
  solidBlue: { fill: 'rgba(59,130,246,0.65)', stroke: '#3b82f6' },
  solidRed: { fill: 'rgba(239,68,68,0.65)', stroke: '#ef4444' },
  neutral: { fill: 'rgba(148,163,184,0.25)', stroke: 'rgba(148,163,184,0.5)' },
  lane: { fill: 'rgba(148,163,184,0.08)', stroke: 'rgba(148,163,184,0.45)' },
  bar: { fill: 'rgba(203,213,225,0.45)' },
  lineBlue: { stroke: 'rgba(96,165,250,0.65)', width: 1.5 },
  lineRed: { stroke: 'rgba(248,113,113,0.65)', width: 1.5 },
  lineCenter: { stroke: 'rgba(226,232,240,0.25)', width: 1.5, dash: [4, 4] },
  piece: { stroke: 'rgba(251,146,60,0.8)', width: 1.5 },
};

function shapePath(ctx: CanvasRenderingContext2D, v: View, s: Shape) {
  ctx.beginPath();
  switch (s.t) {
    case 'rect': {
      const a = toCanvas(v, s.x0, s.y1);
      ctx.rect(a.cx, a.cy, (s.x1 - s.x0) * v.scale, (s.y1 - s.y0) * v.scale);
      break;
    }
    case 'poly':
      s.pts.forEach(([x, y], i) => {
        const p = toCanvas(v, x, y);
        if (i) ctx.lineTo(p.cx, p.cy);
        else ctx.moveTo(p.cx, p.cy);
      });
      ctx.closePath();
      break;
    case 'circle': {
      const c = toCanvas(v, s.x, s.y);
      ctx.arc(c.cx, c.cy, Math.max(1.5, s.r * v.scale), 0, Math.PI * 2);
      break;
    }
    case 'line': {
      const a = toCanvas(v, s.x0, s.y0), b = toCanvas(v, s.x1, s.y1);
      ctx.moveTo(a.cx, a.cy);
      ctx.lineTo(b.cx, b.cy);
      break;
    }
  }
}

function centerOf(s: Shape): { x: number; y: number } {
  switch (s.t) {
    case 'rect': return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
    case 'poly': return { x: s.pts.reduce((a, p) => a + p[0], 0) / s.pts.length, y: s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length };
    case 'circle': return { x: s.x, y: s.y };
    case 'line': return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
  }
}

export function drawField(ctx: CanvasRenderingContext2D, v: View, g: GameDef, opts: { labels?: boolean } = {}) {
  const { cx: x0, cy: y0 } = toCanvas(v, 0, v.W);
  ctx.fillStyle = '#1b1f27';
  ctx.fillRect(x0, y0, v.L * v.scale, v.W * v.scale);
  for (const s of g.shapes) {
    const look = LOOK[s.style];
    shapePath(ctx, v, s);
    if (look.fill && s.t !== 'line') {
      ctx.fillStyle = look.fill;
      ctx.fill();
    }
    if (look.stroke) {
      ctx.strokeStyle = look.stroke;
      ctx.lineWidth = look.width ?? 1;
      ctx.setLineDash(look.dash ?? []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts.labels && s.t !== 'line' && s.label) {
      const c = toCanvas(v, centerOf(s).x, centerOf(s).y);
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.font = `${Math.max(9, v.scale * 0.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, c.cx, c.cy);
    }
  }
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, v.L * v.scale, v.W * v.scale);
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
  const size = (opts.size ?? 0.9) * v.scale;
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
