import { useEffect, useRef, useState } from 'react';
import { drawField, drawPathLine, drawRobot, fitView, toCanvas, toField, type View } from '../../shared/draw';
import { nearestOnPath, posToS, sampleAt } from '../../shared/path';
import { ACTIONS, actionLabel, type ActionType, type Routine } from '../../shared/routine';
import { referenceAt, type Schedule } from '../../shared/schedule';
import { useStore } from './store';
import { useGame, useRoutine, useSchedule } from './useSchedule';

const HEADING_KNOB = 0.75; // m from waypoint center
const HIT = 10; // px

type Drag =
  | { kind: 'wp'; id: string; dx: number; dy: number }
  | { kind: 'hin' | 'hout'; id: string }
  | { kind: 'heading'; id: string }
  | { kind: 'action'; id: string };

type Hit = Drag | { kind: 'path' } | null;

function actionXY(sched: Schedule, r: Routine, id: string) {
  const a = r.actions.find((x) => x.id === id)!;
  const p = sampleAt(sched.path, posToS(sched.path, a.at));
  return p;
}

export function FieldCanvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  const routine = useRoutine();
  const sched = useSchedule();
  const game = useGame();
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const previewT = useStore((s) => s.previewT);
  const st = useStore.getState;

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view: View = fitView(size.w, size.h, 28, game);

  // ---- drawing ----
  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    drawField(ctx, view, game, { labels: true });

    // alliance wall labels
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#60a5fa';
    const bl = toCanvas(view, 0, game.field.width / 2);
    ctx.save();
    ctx.translate(bl.cx - 14, bl.cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('BLUE DRIVER STATION', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#f87171';
    const rl = toCanvas(view, game.field.length, game.field.width / 2);
    ctx.save();
    ctx.translate(rl.cx + 14, rl.cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('RED DRIVER STATION', 0, 0);
    ctx.restore();

    // path, colored by stop legs
    drawPathLine(ctx, view, sched.path, 'rgba(250,204,21,0.9)', 3);
    // slow-down stretches (shooting on the move)
    for (const z of sched.zones) {
      ctx.strokeStyle = 'rgba(245,158,11,0.55)';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (const p of sched.path.samples) {
        if (p.s < z.s0 || p.s > z.s1) continue;
        const c = toCanvas(view, p.x, p.y);
        if (started) ctx.lineTo(c.cx, c.cy);
        else ctx.moveTo(c.cx, c.cy);
        started = true;
      }
      ctx.stroke();
    }

    const wps = routine.waypoints;
    // heading ghosts
    wps.forEach((w) => {
      if (w.heading === null) return;
      drawRobot(ctx, view, { x: w.x, y: w.y, heading: w.heading }, { size: game.robotSize, stroke: 'rgba(148,163,184,0.7)', fill: 'rgba(148,163,184,0.08)' });
    });

    // handles for the selected waypoint
    const selWp = selection?.kind === 'wp' ? wps.find((w) => w.id === selection.id) : null;
    if (selWp) {
      const idx = wps.indexOf(selWp);
      const p = toCanvas(view, selWp.x, selWp.y);
      for (const which of ['hin', 'hout'] as const) {
        if (which === 'hin' && idx === 0) continue;
        if (which === 'hout' && idx === wps.length - 1) continue;
        const h = selWp[which];
        const q = toCanvas(view, selWp.x + h.x, selWp.y + h.y);
        ctx.strokeStyle = 'rgba(226,232,240,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.cx, p.cy);
        ctx.lineTo(q.cx, q.cy);
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.rect(q.cx - 5, q.cy - 5, 10, 10);
        ctx.fill();
        ctx.stroke();
      }
    }
    // heading knobs
    wps.forEach((w) => {
      if (w.heading === null) return;
      if (!(selection?.kind === 'wp' && selection.id === w.id)) return;
      const k = toCanvas(view, w.x + Math.cos(w.heading) * HEADING_KNOB, w.y + Math.sin(w.heading) * HEADING_KNOB);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(k.cx, k.cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // waypoints
    wps.forEach((w, i) => {
      const p = toCanvas(view, w.x, w.y);
      const sel = selection?.kind === 'wp' && selection.id === w.id;
      ctx.fillStyle = i === 0 ? '#22c55e' : i === wps.length - 1 ? '#f97316' : '#facc15';
      ctx.strokeStyle = sel ? '#fff' : '#0f172a';
      ctx.lineWidth = sel ? 3 : 2;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i === 0 ? 'S' : String(i), p.cx, p.cy + 0.5);
    });

    // action markers
    routine.actions.forEach((a) => {
      const p = actionXY(sched, routine, a.id);
      const c = toCanvas(view, p.x, p.y);
      const meta = ACTIONS[a.type];
      const sel = selection?.kind === 'action' && selection.id === a.id;
      // offset markers slightly so they don't hide the path
      const ox = c.cx, oy = c.cy - 16;
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.cx, c.cy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.fillStyle = meta.color;
      ctx.strokeStyle = sel ? '#fff' : '#0f172a';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.beginPath();
      if (a.stop) ctx.rect(ox - 9, oy - 9, 18, 18);
      else ctx.arc(ox, oy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.fillText(meta.short, ox, oy + 0.5);
    });

    // preview robot
    if (sched.path.samples.length) {
      const ref = referenceAt(sched, previewT);
      drawRobot(ctx, view, ref.pose, { size: game.robotSize, stroke: '#facc15', fill: 'rgba(250,204,21,0.3)' });
    }

    // tool hint near cursor
    if (hover && tool !== 'select') {
      const c = toCanvas(view, hover.x, hover.y);
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const label = tool === 'waypoint' ? '+ waypoint' : '+ ' + actionLabel(tool, game);
      ctx.fillText(label, c.cx + 12, c.cy + 14);
      if (tool !== 'waypoint') {
        const n = nearestOnPath(sched.path, hover.x, hover.y);
        if (n && n.dist * view.scale < 40) {
          const q = toCanvas(view, sampleAt(sched.path, n.s).x, sampleAt(sched.path, n.s).y);
          ctx.fillStyle = ACTIONS[tool].color;
          ctx.beginPath();
          ctx.arc(q.cx, q.cy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [size, routine, sched, selection, previewT, hover, tool, game]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- interaction ----
  function hitTest(cx: number, cy: number): Hit {
    const r = st().current();
    const sel = st().selection;
    const near = (x: number, y: number) => {
      const p = toCanvas(view, x, y);
      return Math.hypot(p.cx - cx, p.cy - cy) <= HIT;
    };
    if (sel?.kind === 'wp') {
      const w = r.waypoints.find((x) => x.id === sel.id);
      if (w) {
        const idx = r.waypoints.indexOf(w);
        if (idx > 0 && near(w.x + w.hin.x, w.y + w.hin.y)) return { kind: 'hin', id: w.id };
        if (idx < r.waypoints.length - 1 && near(w.x + w.hout.x, w.y + w.hout.y)) return { kind: 'hout', id: w.id };
        if (w.heading !== null && near(w.x + Math.cos(w.heading) * HEADING_KNOB, w.y + Math.sin(w.heading) * HEADING_KNOB)) return { kind: 'heading', id: w.id };
      }
    }
    for (const a of [...r.actions].reverse()) {
      const p = actionXY(sched, r, a.id);
      const c = toCanvas(view, p.x, p.y);
      if (Math.hypot(c.cx - cx, c.cy - 16 - cy) <= HIT + 1) return { kind: 'action', id: a.id };
    }
    for (const w of [...r.waypoints].reverse()) {
      if (near(w.x, w.y)) {
        const p = toCanvas(view, w.x, w.y);
        return { kind: 'wp', id: w.id, dx: cx - p.cx, dy: cy - p.cy };
      }
    }
    const f = toField(view, cx, cy);
    const n = nearestOnPath(sched.path, f.x, f.y);
    if (n && n.dist * view.scale <= HIT) return { kind: 'path' };
    return null;
  }

  function local(e: React.PointerEvent | React.MouseEvent) {
    const r = canvas.current!.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  }

  const clampField = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(game.field.length, p.x)), y: Math.max(0, Math.min(game.field.width, p.y)) });

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const { cx, cy } = local(e);
    const f = clampField(toField(view, cx, cy));
    const hit = hitTest(cx, cy);
    const s = st();
    const actionTool = s.tool !== 'select' && s.tool !== 'waypoint';
    if (actionTool && (!hit || hit.kind === 'path' || hit.kind === 'wp')) {
      // place the action at the clicked waypoint / nearest point on the path
      const r = s.current();
      const wpIdx = hit?.kind === 'wp' ? r.waypoints.findIndex((w) => w.id === hit.id) : -1;
      if (sched.path.samples.length < 2) return;
      if (wpIdx >= 0) {
        s.addAction(s.tool as ActionType, wpIdx === 0 ? { seg: 0, u: 0 } : { seg: wpIdx - 1, u: 1 });
        return;
      }
      const n = nearestOnPath(sched.path, f.x, f.y);
      if (n && n.dist * view.scale < 40) s.addAction(s.tool as ActionType, n.pos);
      return;
    }
    if (hit && hit.kind !== 'path') {
      s.checkpoint();
      drag.current = hit;
      s.select({ kind: hit.kind === 'action' ? 'action' : 'wp', id: hit.id });
      canvas.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (s.tool === 'waypoint') {
      if (hit?.kind === 'path' && s.current().waypoints.length > 1) {
        const n = nearestOnPath(sched.path, f.x, f.y)!;
        const p = sampleAt(sched.path, n.s);
        s.insertWaypoint(n.pos, p.x, p.y);
      } else s.addWaypoint(f.x, f.y);
      return;
    }
    s.select(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const { cx, cy } = local(e);
    const f = toField(view, cx, cy);
    setHover(f);
    const d = drag.current;
    if (!d) {
      const h = hitTest(cx, cy);
      canvas.current!.style.cursor = h && h.kind !== 'path' ? 'grab' : st().tool === 'select' ? 'default' : 'crosshair';
      return;
    }
    const s = st();
    const r = s.current();
    if (d.kind === 'wp') {
      const p = clampField(toField(view, cx - d.dx, cy - d.dy));
      const snap = (v: number) => (e.shiftKey ? Math.round(v * 10) / 10 : v);
      s.moveWaypoint(d.id, snap(p.x), snap(p.y));
    } else if (d.kind === 'hin' || d.kind === 'hout') {
      const w = r.waypoints.find((x) => x.id === d.id)!;
      s.setHandle(d.id, d.kind, { x: f.x - w.x, y: f.y - w.y });
    } else if (d.kind === 'heading') {
      const w = r.waypoints.find((x) => x.id === d.id)!;
      let h = Math.atan2(f.y - w.y, f.x - w.x);
      if (e.shiftKey) h = Math.round(h / (Math.PI / 12)) * (Math.PI / 12);
      s.setHeading(d.id, h);
    } else if (d.kind === 'action') {
      const n = nearestOnPath(sched.path, f.x, f.y);
      if (n) s.updateAction(d.id, { at: n.pos });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    drag.current = null;
    try {
      canvas.current!.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const { cx, cy } = local(e);
    const hit = hitTest(cx, cy);
    if (hit?.kind === 'wp') st().deleteWaypoint(hit.id);
    else if (hit?.kind === 'action') st().deleteAction(hit.id);
  }

  return (
    <div className="field-wrap" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={onContextMenu}
      />
      {hover && (
        <div className="coords">
          x {hover.x.toFixed(2)} m · y {hover.y.toFixed(2)} m
        </div>
      )}
    </div>
  );
}
