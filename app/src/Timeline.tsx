import { useEffect, useRef } from 'react';
import { ACTIONS, AUTO_LENGTH, BUTTONS, type ButtonId } from '../../shared/routine';
import { useStore } from './store';
import { useRoutine, useSchedule } from './useSchedule';

export function Timeline() {
  const sched = useSchedule();
  const r = useRoutine();
  const previewT = useStore((s) => s.previewT);
  const playing = useStore((s) => s.playing);
  const setPreviewT = useStore((s) => s.setPreviewT);
  const setPlaying = useStore((s) => s.setPlaying);
  const select = useStore((s) => s.select);
  const bar = useRef<HTMLDivElement>(null);

  const span = Math.max(AUTO_LENGTH, Math.ceil(sched.total + 0.5));
  const pct = (t: number) => `${(Math.min(t, span) / span) * 100}%`;
  const w = (t0: number, t1: number) => `${((Math.min(t1, span) - t0) / span) * 100}%`;

  // playback
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const end = Math.max(sched.total, 0.1);
    const step = (now: number) => {
      const s = useStore.getState();
      let t = s.previewT + (now - last) / 1000;
      last = now;
      if (t >= end) {
        t = end;
        s.setPlaying(false);
      }
      s.setPreviewT(t);
      if (t < end) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, sched.total]);

  const scrub = (clientX: number) => {
    const b = bar.current!.getBoundingClientRect();
    setPreviewT(Math.max(0, Math.min(span, ((clientX - b.left) / b.width) * span)));
  };

  const buttonsUsed = [...new Set(sched.spans.map((x) => x.button))] as ButtonId[];
  const ticks = Array.from({ length: span + 1 }, (_, i) => i);

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button
          className="play"
          onClick={() => {
            if (!playing && previewT >= sched.total - 0.01) setPreviewT(0);
            setPlaying(!playing);
          }}
          title="Play / pause (Space)"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="tl-time">
          {previewT.toFixed(1)} s / {sched.total.toFixed(1)} s
        </span>
        {sched.warnings.map((m) => (
          <span key={m} className="warn">
            ⚠ {m}
          </span>
        ))}
        {sched.warnings.length === 0 && sched.total > 0 && <span className="ok">Fits in auto with {(AUTO_LENGTH - sched.total).toFixed(1)} s to spare</span>}
      </div>
      <div
        className="tl-body"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setPlaying(false);
          scrub(e.clientX);
        }}
        onPointerMove={(e) => e.buttons & 1 && scrub(e.clientX)}
      >
        <div className="tl-row tl-axis">
          <label />
          <div className="lane">
            {ticks.map((t) => (
              <span key={t} className={t % 5 === 0 ? 'major' : ''} style={{ left: pct(t) }}>
                {t % 5 === 0 ? t + 's' : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="tl-row">
          <label>Robot</label>
          <div className="lane">
            {sched.steps.map((st, i) =>
              st.kind === 'drive' ? (
                <div key={i} className="blk drive" style={{ left: pct(st.t0), width: w(st.t0, st.t1) }}>
                  drive
                </div>
              ) : (
                <div key={i} className="blk hold" style={{ left: pct(st.t0), width: w(st.t0, st.t1) }}>
                  {st.actionIds
                    .map((id) => r.actions.find((a) => a.id === id))
                    .filter(Boolean)
                    .map((a) => ACTIONS[a!.type].label)
                    .join(' → ')}
                </div>
              ),
            )}
            {sched.zones.map((z) => {
              const tm = sched.timing[z.actionId];
              if (!tm) return null;
              return (
                <div key={'z' + z.actionId} className="blk slow" style={{ left: pct(tm.t0), width: w(tm.t0, tm.t1) }} title="Slowed down while shooting">
                  slow
                </div>
              );
            })}
          </div>
        </div>
        {buttonsUsed.map((b) => (
          <div className="tl-row" key={b}>
            <label>{BUTTONS[b].label}</label>
            <div className="lane">
              {sched.spans
                .filter((x) => x.button === b)
                .map((x, i) => {
                  const a = r.actions.find((q) => q.id === x.actionId);
                  const color = a ? ACTIONS[a.type].color : '#999';
                  return (
                    <div
                      key={i}
                      className="blk btn"
                      style={{ left: pct(x.t0), width: w(x.t0, Number.isFinite(x.t1) ? x.t1 : span), background: color }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        select({ kind: 'action', id: x.actionId });
                      }}
                      title={a ? ACTIONS[a.type].label : ''}
                    />
                  );
                })}
            </div>
          </div>
        ))}
        <div className="tl-overlay" ref={bar}>
          <div className="tl-end" style={{ left: pct(AUTO_LENGTH) }} title="Auto ends" />
          <div className="tl-head" style={{ left: pct(previewT) }} />
        </div>
      </div>
    </div>
  );
}
