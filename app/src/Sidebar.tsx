import { ACTIONS, ACTION_TYPES, BUTTONS, BUTTON_IDS, DEFAULT_LAT_ACCEL, DEFAULT_SHOOT_SPEED_PCT, type ActionType, type ButtonId } from '../../shared/routine';
import { posToS } from '../../shared/path';
import { useStore, type Tool } from './store';
import { fmtDeg, useRoutine, useSchedule } from './useSchedule';

const num = (v: string, fallback: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const T = (t: Tool, label: string, key: string, color?: string) => (
    <button key={t} className={'tool' + (tool === t ? ' on' : '')} onClick={() => setTool(t)} title={`${label} (${key})`}>
      {color && <span className="dot" style={{ background: color }} />}
      {label}
      <kbd>{key}</kbd>
    </button>
  );
  return (
    <section className="panel">
      <h3>Tools</h3>
      <div className="tools">
        {T('select', 'Select / move', 'V')}
        {T('waypoint', 'Draw path', 'P')}
      </div>
      <h4>Add action on the path</h4>
      <div className="tools">{ACTION_TYPES.map((t, i) => T(t, ACTIONS[t].label, String(i + 1), ACTIONS[t].color))}</div>
      <p className="hint">
        {tool === 'select' && 'Drag points, curve handles, the blue heading knob, or action markers. Right-click deletes.'}
        {tool === 'waypoint' && 'Click empty field to extend the path. Click on the path to insert a point.'}
        {tool !== 'select' && tool !== 'waypoint' && ACTIONS[tool].help + ' Click on the path to place it.'}
      </p>
    </section>
  );
}

export function Inspector() {
  const sel = useStore((s) => s.selection);
  const r = useRoutine();
  const sched = useSchedule();
  const s = useStore.getState();

  if (!sel) {
    return (
      <section className="panel">
        <h3>Inspector</h3>
        <p className="hint">Select a waypoint or action to edit it.</p>
      </section>
    );
  }

  if (sel.kind === 'wp') {
    const idx = r.waypoints.findIndex((w) => w.id === sel.id);
    const w = r.waypoints[idx];
    if (!w) return null;
    const isStart = idx === 0;
    return (
      <section className="panel">
        <h3>{isStart ? 'Start position' : idx === r.waypoints.length - 1 ? `Waypoint ${idx} (end)` : `Waypoint ${idx}`}</h3>
        <div className="grid2">
          <label>
            x (m)
            <input type="number" step="0.05" value={+w.x.toFixed(3)} onChange={(e) => (s.checkpoint(), s.moveWaypoint(w.id, num(e.target.value, w.x), w.y))} />
          </label>
          <label>
            y (m)
            <input type="number" step="0.05" value={+w.y.toFixed(3)} onChange={(e) => (s.checkpoint(), s.moveWaypoint(w.id, w.x, num(e.target.value, w.y)))} />
          </label>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={w.heading !== null}
            disabled={isStart}
            onChange={(e) => (s.checkpoint(), s.setHeading(w.id, e.target.checked ? sched.path.samples.find((p) => p.s >= sched.path.waypointS[idx])?.heading ?? 0 : null))}
          />
          Robot faces a set direction here
        </label>
        {w.heading !== null && (
          <label>
            Heading (° — 0 faces red, 90 faces the far wall)
            <input type="number" step="5" value={fmtDeg(w.heading)} onChange={(e) => (s.checkpoint(), s.setHeading(w.id, (num(e.target.value, 0) * Math.PI) / 180))} />
          </label>
        )}
        <div className="row">
          {!w.autoHandles && <button onClick={() => s.resetHandles(w.id)}>Reset curve</button>}
          <button className="danger" onClick={() => s.deleteWaypoint(w.id)}>
            Delete point
          </button>
        </div>
      </section>
    );
  }

  const a = r.actions.find((x) => x.id === sel.id);
  if (!a) return null;
  const meta = ACTIONS[a.type];
  const tm = sched.timing[a.id];
  const pct = sched.path.length > 0 ? (posToS(sched.path, a.at) / sched.path.length) * 100 : 0;
  return (
    <section className="panel">
      <h3>
        <span className="dot" style={{ background: meta.color }} /> Action
      </h3>
      <label>
        Type
        <select value={a.type} onChange={(e) => s.updateAction(a.id, { type: e.target.value as ActionType, duration: ACTIONS[e.target.value as ActionType].defaultDuration })}>
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIONS[t].label}
            </option>
          ))}
        </select>
      </label>
      {a.type === 'button' && (
        <label>
          Button
          <select value={a.button ?? 'special'} onChange={(e) => s.updateAction(a.id, { button: e.target.value as ButtonId })}>
            {BUTTON_IDS.map((b) => (
              <option key={b} value={b}>
                {BUTTONS[b].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {meta.hasDuration && (
        <label>
          {a.type === 'wait' ? 'Wait for (s)' : 'Hold button for (s)'}
          <input type="number" min="0" step="0.1" value={a.duration} onChange={(e) => s.updateAction(a.id, { duration: Math.max(0, num(e.target.value, a.duration)) })} />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={a.stop} onChange={(e) => s.updateAction(a.id, { stop: e.target.checked })} />
        Stop the robot while doing this
      </label>
      {a.type === 'shoot' && !a.stop && (
        <label>
          Drive speed while shooting: {a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT}% of max ({(((a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT) / 100) * r.constraints.maxVel).toFixed(2)} m/s)
          <div className="slider">
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT}
              onPointerDown={() => s.checkpoint()}
              onChange={(e) => s.updateAction(a.id, { speedPct: +e.target.value })}
            />
            <input
              type="number"
              min="5"
              max="100"
              step="5"
              value={a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT}
              onChange={(e) => s.updateAction(a.id, { speedPct: Math.min(100, Math.max(5, num(e.target.value, DEFAULT_SHOOT_SPEED_PCT))) })}
            />
          </div>
          {!sched.zones.some((z) => z.actionId === a.id) && <span className="hint">This shot is at the end of the path, so the robot is already stopped there.</span>}
        </label>
      )}
      <p className="hint">
        {pct.toFixed(0)}% along the path · {tm ? `${tm.t0.toFixed(2)} s` : ''}
        {tm && Number.isFinite(tm.t1) && tm.t1 > tm.t0 ? ` → ${tm.t1.toFixed(2)} s` : ''}
        {tm && !Number.isFinite(tm.t1) ? ' → end of auto' : ''}
        <br />
        {meta.help}
      </p>
      <div className="row">
        <button className="danger" onClick={() => s.deleteAction(a.id)}>
          Delete action
        </button>
      </div>
    </section>
  );
}

export function ActionList() {
  const r = useRoutine();
  const sched = useSchedule();
  const sel = useStore((s) => s.selection);
  const s = useStore.getState();
  const list = [...r.actions].sort((p, q) => (sched.timing[p.id]?.t0 ?? 0) - (sched.timing[q.id]?.t0 ?? 0));
  return (
    <section className="panel">
      <h3>Action items ({list.length})</h3>
      {list.length === 0 && <p className="hint">Pick an action tool, then click on the path.</p>}
      <ul className="alist">
        {list.map((a) => {
          const m = ACTIONS[a.type];
          const tm = sched.timing[a.id];
          return (
            <li
              key={a.id}
              className={sel?.kind === 'action' && sel.id === a.id ? 'on' : ''}
              onClick={() => {
                s.select({ kind: 'action', id: a.id });
                if (tm) s.setPreviewT(tm.t0);
              }}
            >
              <span className="dot" style={{ background: m.color, borderRadius: a.stop ? 2 : 99 }} />
              <span className="grow">
                {a.type === 'button' ? `Press ${BUTTONS[a.button ?? 'special'].label}` : m.label}
                {m.hasDuration && a.type !== 'climb' && a.type !== 'button' ? ` ${a.duration}s` : ''}
                {a.stop ? <em> · stop</em> : null}
                {a.type === 'shoot' && !a.stop ? <em> · moving {a.speedPct ?? DEFAULT_SHOOT_SPEED_PCT}%</em> : null}
              </span>
              <span className="t">{tm ? tm.t0.toFixed(1) + 's' : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ConstraintsPanel() {
  const r = useRoutine();
  const sched = useSchedule();
  const s = useStore.getState();
  const c = r.constraints;
  return (
    <section className="panel">
      <h3>Speed limits</h3>
      <div className="grid2">
        <label>
          Max speed (m/s)
          <input type="number" step="0.1" min="0.2" value={c.maxVel} onChange={(e) => s.setConstraints({ maxVel: Math.max(0.2, num(e.target.value, c.maxVel)) })} />
        </label>
        <label>
          Accel (m/s²)
          <input type="number" step="0.1" min="0.2" value={c.maxAccel} onChange={(e) => s.setConstraints({ maxAccel: Math.max(0.2, num(e.target.value, c.maxAccel)) })} />
        </label>
        <label>
          Turn (°/s)
          <input
            type="number"
            step="10"
            min="10"
            value={Math.round((c.maxAngVel * 180) / Math.PI)}
            onChange={(e) => s.setConstraints({ maxAngVel: (Math.max(10, num(e.target.value, 180)) * Math.PI) / 180 })}
          />
        </label>
        <label title="How hard the robot may corner. Higher keeps more speed through waypoints and curves; lower slows down more for turns.">
          Corner accel (m/s²)
          <input
            type="number"
            step="1"
            min="1"
            value={c.maxLatAccel ?? DEFAULT_LAT_ACCEL}
            onChange={(e) => s.setConstraints({ maxLatAccel: Math.max(1, num(e.target.value, DEFAULT_LAT_ACCEL)) })}
          />
        </label>
      </div>
      <p className="hint">
        Corner accel controls how much the robot slows at waypoints and curves: raise it to keep speed, lower it if the robot drifts wide on turns.
        <br />
        Path length {sched.path.length.toFixed(2)} m · driving {sched.driveEnd.toFixed(2)} s · total {sched.total.toFixed(2)} s
      </p>
    </section>
  );
}
