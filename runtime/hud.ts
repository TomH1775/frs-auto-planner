import { drawField, drawPathLine, drawRobot, fitView, toCanvas } from '../shared/draw';
import { mirrorRoutine, parseRoutine, BUTTONS, BUTTON_IDS, type Routine } from '../shared/routine';
import { samplePath } from '../shared/path';
import { allianceOfX } from '../shared/field';
import type { Runner } from './runner';
import { store } from './storage';
import { readPhase } from './game';

const CSS = `
:host { all: initial; }
.box { position: fixed; top: 64px; left: 12px; z-index: 2147483647; width: 300px; background: rgba(15,17,23,0.94);
  color: #e5e7eb; font: 12px/1.4 system-ui, -apple-system, sans-serif; border: 1px solid #334155; border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5); user-select: none; }
.hd { display: flex; align-items: center; gap: 6px; padding: 8px 10px; cursor: move; border-bottom: 1px solid #1f2937; }
.hd b { font-size: 13px; letter-spacing: .3px; color: #facc15; }
.hd .sp { flex: 1; }
.ic { background: none; border: 0; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0 4px; }
.ic:hover { color: #fff; }
.bd { padding: 8px 10px 10px; display: grid; gap: 8px; }
.st { padding: 6px 8px; border-radius: 6px; background: #111827; border: 1px solid #1f2937; min-height: 18px; }
.st.running { border-color: #22c55e; } .st.armed { border-color: #facc15; } .st.calibrating { border-color: #06b6d4; }
.row { display: flex; gap: 6px; align-items: center; }
select, input, textarea { background: #0b0d12; color: #e5e7eb; border: 1px solid #334155; border-radius: 6px; padding: 4px 6px; font: inherit; }
select { flex: 1; min-width: 0; }
textarea { width: 100%; box-sizing: border-box; height: 70px; resize: vertical; font-family: ui-monospace, monospace; font-size: 11px; }
button.b { flex: 1; background: #1f2937; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 6px 4px; cursor: pointer; font: 600 12px system-ui, sans-serif; }
button.b:hover { background: #273244; }
button.go { background: #facc15; color: #111; border-color: #facc15; }
button.go:hover { background: #fde047; }
button.stop { background: #7f1d1d; border-color: #991b1b; }
canvas { width: 100%; border-radius: 6px; display: block; }
details summary { cursor: pointer; color: #94a3b8; }
details .grid { display: grid; grid-template-columns: 1fr 70px; gap: 4px 8px; margin-top: 6px; align-items: center; }
details input { width: 100%; box-sizing: border-box; }
.muted { color: #94a3b8; font-size: 11px; }
.min .bd { display: none; }
`;

export function mountHud(runner: Runner) {
  document.getElementById('frs-auto-hud')?.remove();
  const host = document.createElement('div');
  host.id = 'frs-auto-hud';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
  <div class="box">
    <div class="hd"><b>FRS AUTO</b><span class="muted" data-phase></span><span class="sp"></span>
      <button class="ic" data-min title="Minimize">–</button><button class="ic" data-close title="Close">×</button></div>
    <div class="bd">
      <div class="st" data-status></div>
      <div class="row"><select data-routines></select><button class="ic" data-del title="Delete routine">🗑</button></div>
      <canvas data-map width="560" height="280"></canvas>
      <div class="row">
        <button class="b go" data-arm title="Start automatically when Auto begins">Arm for Auto</button>
        <button class="b" data-run title="Run right now (practice, any phase)">Run now</button>
        <button class="b stop" data-stop>Stop</button>
      </div>
      <details data-load><summary>Load routine</summary>
        <div style="margin-top:6px"><textarea data-json placeholder="Paste a routine from the FRS Auto planner (Copy routine)…"></textarea></div>
        <div class="row" style="margin-top:6px"><button class="b" data-paste>Load</button></div>
      </details>
      <details><summary>Setup &amp; calibration</summary>
        <div class="grid">
          <span>Top speed (m/s)</span><input data-cal="maxVel" type="number" step="0.1">
          <span>Turn rate (rad/s)</span><input data-cal="maxOmega" type="number" step="0.1">
          <span>Stick deadzone</span><input data-cal="deadzone" type="number" step="0.01">
          <span>Position gain</span><input data-gain="kP" type="number" step="0.1">
          <span>Heading gain</span><input data-gain="kTheta" type="number" step="0.1">
          <span>Robot front axis</span><select data-front><option>-x</option><option>+x</option><option>-z</option><option>+z</option></select>
          <span>Re-arm after each auto</span><input data-rearm type="checkbox">
          ${BUTTON_IDS.map((b) => `<span>${BUTTONS[b].label} (pad #)</span><input data-btn="${b}" type="number" min="0" max="16">`).join('')}
        </div>
        <div class="row" style="margin-top:8px"><button class="b" data-calibrate>Calibrate (needs ~4 m clear ahead)</button></div>
        <div class="muted" style="margin-top:6px">Esc, any key, or a real controller hands control back to you instantly.</div>
      </details>
    </div>
  </div>`;
  document.body.appendChild(host);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const box = $<HTMLDivElement>('.box');
  const status = $<HTMLDivElement>('[data-status]');
  const phaseEl = $<HTMLSpanElement>('[data-phase]');
  const sel = $<HTMLSelectElement>('[data-routines]');
  const map = $<HTMLCanvasElement>('[data-map]');
  const ctx = map.getContext('2d')!;

  // keep keystrokes in the HUD from driving the robot / triggering game shortcuts
  // (only while typing in a field; after clicking a button, blur it so R etc. reach the game)
  for (const type of ['keydown', 'keyup', 'keypress'])
    root.addEventListener(type, (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('input, textarea, select')) e.stopPropagation();
    });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('button')) t.blur();
  });

  // dragging
  const hd = $<HTMLDivElement>('.hd');
  hd.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = box.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => {
      box.style.left = Math.max(0, ev.clientX - dx) + 'px';
      box.style.top = Math.max(0, ev.clientY - dy) + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  $('[data-min]').addEventListener('click', () => box.classList.toggle('min'));
  $('[data-close]').addEventListener('click', () => {
    runner.stop('Closed.');
    host.style.display = 'none';
  });

  const refreshRoutines = () => {
    const cur = store.selected();
    sel.innerHTML = store.routines().length
      ? store.routines().map((r) => `<option value="${r.id}" ${cur?.id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')
      : '<option>(no routines: load one below)</option>';
    cachedPath = null;
  };
  sel.addEventListener('change', () => {
    store.select(sel.value);
    cachedPath = null;
  });
  $('[data-del]').addEventListener('click', () => {
    const r = store.selected();
    if (r) {
      store.remove(r.id);
      refreshRoutines();
    }
  });

  $('[data-arm]').addEventListener('click', () => runner.arm());
  $('[data-run]').addEventListener('click', () => runner.runNow());
  $('[data-stop]').addEventListener('click', () => runner.stop());
  $('[data-calibrate]').addEventListener('click', () => void runner.calibrate());
  $('[data-paste]').addEventListener('click', () => {
    const ta = $<HTMLTextAreaElement>('[data-json]');
    try {
      loadRoutines(ta.value);
      ta.value = '';
      refreshRoutines();
      runner.t.message = 'Routine loaded.';
      ($('[data-load]') as HTMLDetailsElement).open = false;
    } catch (e) {
      runner.t.message = 'Could not load: ' + (e as Error).message;
    }
    render();
  });

  // settings inputs
  const s0 = store.settings();
  root.querySelectorAll<HTMLInputElement>('[data-cal]').forEach((inp) => {
    const k = inp.dataset.cal as keyof typeof s0.cal;
    inp.value = String(s0.cal[k]);
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && v > 0) store.setSettings({ cal: { ...store.settings().cal, [k]: v } });
    });
  });
  root.querySelectorAll<HTMLInputElement>('[data-gain]').forEach((inp) => {
    const k = inp.dataset.gain as 'kP' | 'kTheta';
    inp.value = String(s0[k]);
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && v >= 0) store.setSettings({ [k]: v });
    });
  });
  root.querySelectorAll<HTMLInputElement>('[data-btn]').forEach((inp) => {
    const k = inp.dataset.btn as keyof typeof s0.buttonMap;
    inp.value = String(s0.buttonMap[k]);
    inp.addEventListener('change', () => {
      const v = parseInt(inp.value, 10);
      if (v >= 0 && v <= 16) store.setSettings({ buttonMap: { ...store.settings().buttonMap, [k]: v } });
    });
  });
  const front = $<HTMLSelectElement>('[data-front]');
  front.value = s0.front;
  front.addEventListener('change', () => store.setSettings({ front: front.value as never }));
  const rearm = $<HTMLInputElement>('[data-rearm]');
  rearm.checked = s0.autoRearm;
  rearm.addEventListener('change', () => store.setSettings({ autoRearm: rearm.checked }));

  // minimap
  let cachedPath: { id: string; alliance: string; path: ReturnType<typeof samplePath> } | null = null;
  const view = fitView(map.width, map.height, 8);
  function render() {
    const t = runner.t;
    status.textContent = t.message + (t.state === 'running' ? `  ·  ${t.elapsed.toFixed(1)} s` : '');
    status.className = 'st ' + t.state;
    const ph = readPhase();
    phaseEl.textContent = ph ? '· ' + ph : '';

    drawField(ctx, view);
    let path = t.state === 'running' && t.schedule ? t.schedule.path : null;
    if (!path) {
      const r = store.selected();
      if (r) {
        const al = t.pose ? allianceOfX(t.pose.x) : 'blue';
        if (!cachedPath || cachedPath.id !== r.id + r.updatedAt || cachedPath.alliance !== al) {
          const drawnFor = r.waypoints.length ? allianceOfX(r.waypoints[0].x) : 'blue';
          cachedPath = { id: r.id + r.updatedAt, alliance: al, path: samplePath((drawnFor === al ? r : mirrorRoutine(r)).waypoints) };
        }
        path = cachedPath.path;
      }
    }
    if (path) drawPathLine(ctx, view, path, 'rgba(250,204,21,0.8)', 3);
    if (t.trail.length > 1) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      t.trail.forEach((p, i) => {
        const { cx, cy } = toCanvas(view, p.x, p.y);
        if (i) ctx.lineTo(cx, cy);
        else ctx.moveTo(cx, cy);
      });
      ctx.stroke();
    }
    if (t.state === 'running' && t.ref) drawRobot(ctx, view, t.ref, { stroke: '#facc15', fill: 'rgba(250,204,21,0.1)', alpha: 0.8 });
    if (t.pose) drawRobot(ctx, view, t.pose, { stroke: '#22c55e', fill: 'rgba(34,197,94,0.3)' });
  }
  refreshRoutines();
  runner.onChange = render;
  const iv = setInterval(() => {
    try {
      render();
    } catch {
      /* ignore */
    }
  }, 100);
  render();
  return {
    show() {
      host.style.display = '';
      refreshRoutines();
    },
    refresh: refreshRoutines,
    destroy() {
      clearInterval(iv);
      host.remove();
    },
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Accepts a single routine or an array of routines (JSON text or already-parsed). */
export function loadRoutines(input: string | unknown) {
  const text = typeof input === 'string' ? input.trim() : JSON.stringify(input);
  if (!text) throw new Error('Nothing pasted.');
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : [data];
  let last: Routine | null = null;
  for (const item of list) {
    last = parseRoutine(JSON.stringify(item));
    store.upsert(last);
  }
  if (last) store.select(last.id);
}
