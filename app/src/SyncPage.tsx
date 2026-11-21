import { useEffect, useState } from 'react';
import { FRS_ORIGIN_RE, type SyncMessage } from '../../shared/config';
import type { Routine } from '../../shared/routine';

const KEY = 'frsAutoPlanner:v1';

/**
 * Shown when FRS's in-game panel opens the planner with ?sync=<frs origin>: hands the saved
 * autos to that window (only to an FRS game origin) and closes itself.
 */
export function SyncPage({ target }: { target: string }) {
  const [msg, setMsg] = useState('Sending your autos to FRS…');

  useEffect(() => {
    if (!FRS_ORIGIN_RE.test(target)) {
      setMsg("This sync link didn't come from an FRS game page, so nothing was sent.");
      return;
    }
    const opener = window.opener as Window | null;
    if (!opener) {
      setMsg('Open this from the ↻ Sync button in the FRS AUTO panel inside the game.');
      return;
    }
    let routines: Routine[] = [];
    try {
      routines = (JSON.parse(localStorage.getItem(KEY) || 'null')?.routines ?? []) as Routine[];
    } catch {
      /* nothing saved */
    }
    const onAck = (e: MessageEvent) => {
      if (e.origin !== target || e.source !== opener) return;
      const m = e.data as SyncMessage;
      if (m?.type !== 'frs-auto:ack') return;
      setMsg(`✓ Sent ${routines.length} auto${routines.length === 1 ? '' : 's'}. This window will close.`);
      setTimeout(() => window.close(), 700);
    };
    window.addEventListener('message', onAck);
    opener.postMessage({ type: 'frs-auto:routines', routines } satisfies SyncMessage, target);
    const t = setTimeout(() => setMsg("FRS didn't answer. Make sure the game tab is still open, then click Sync again."), 6000);
    return () => {
      window.removeEventListener('message', onAck);
      clearTimeout(t);
    };
  }, [target]);

  return (
    <div className="sync-page">
      <div className="brand">
        FRS <span>AUTO</span>
      </div>
      <p>{msg}</p>
    </div>
  );
}
