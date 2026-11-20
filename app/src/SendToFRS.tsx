import { useEffect, useMemo, useRef, useState } from 'react';
import runtimeCode from '../../runtime-dist/frs-auto-runtime.js?raw';
import { useStore } from './store';
import { useGame, useRoutine } from './useSchedule';
import type { Routine } from '../../shared/routine';

/** Script that installs the runtime in the FRS tab with these routines preloaded. */
export function runtimeScript(routines: Routine[]): string {
  // `</` must not appear raw if someone pastes this into an HTML context
  const json = JSON.stringify(routines).replace(/</g, '\\u003c');
  return `(function(){window.__FRS_AUTO_EMBED=${json};${runtimeCode}\n})();`;
}

export function bookmarklet(routines: Routine[]): string {
  return 'javascript:' + encodeURIComponent(runtimeScript(routines) + 'void 0');
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SendToFRS({ onClose }: { onClose: () => void }) {
  const current = useRoutine();
  const game = useGame();
  const routines = useStore((s) => s.routines);
  const [all, setAll] = useState(true);
  const [msg, setMsg] = useState('');
  const link = useRef<HTMLAnchorElement>(null);

  // current routine last, so it ends up selected in the game
  const payload = useMemo(() => (all ? [...routines.filter((r) => r.id !== current.id), current] : [current]), [all, routines, current]);
  const href = useMemo(() => bookmarklet(payload), [payload]);

  // React refuses javascript: hrefs, so set it on the DOM node directly
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>Send to FRS</h2>
        <ol className="steps">
          <li>
            <b>Drag this button to your bookmarks bar</b> (show it with ⌘⇧B):
            <div className="bm-row">
              <a ref={link} className="bookmarklet" onClick={(e) => e.preventDefault()} draggable>
                ⚡ FRS Auto
              </a>
              <label className="check">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> include all {routines.length} routines (every game)
              </label>
            </div>
            <span className="hint">The bookmark carries the autos inside it. Re-drag it after big changes, or use "Copy routine" below.</span>
          </li>
          <li>
            Open <a href={`https://${game.host}`} target="_blank" rel="noreferrer">{game.host}</a>, start a <b>Singleplayer</b> match or join a <b>Multiplayer</b> room, and click the bookmark. The FRS AUTO panel appears.
          </li>
          <li>
            The panel shows this game's autos. Choose one and click <b>Arm for Auto</b> before the match starts. It drives the routine when Auto begins and re-arms for the next match. (In Singleplayer, press <kbd>R</kbd> to restart and run it again.)
          </li>
          <li>
            The first time, open <b>Setup &amp; calibration</b> → <b>Calibrate</b> with the robot in open space (for example the neutral zone).
          </li>
        </ol>
        <div className="row">
          <button
            onClick={async () => flash((await copy(JSON.stringify(current))) ? 'Routine copied. In the game panel: Load routine → paste → Load.' : 'Copy failed')}
          >
            Copy routine (paste into the game panel)
          </button>
          <button onClick={async () => flash((await copy(runtimeScript(payload))) ? 'Script copied. Paste it into the DevTools console on the FRS tab.' : 'Copy failed')}>
            Copy console script
          </button>
        </div>
        {msg && <p className="flash">{msg}</p>}
        <p className="hint">
          FRS Auto runs in Singleplayer and regular Multiplayer. It's disabled in Ranked, events, and while spectating. Pressing any key or touching a real
          controller gives control straight back to you.
        </p>
      </div>
    </div>
  );
}
