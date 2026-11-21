// Pull routines straight from the planner website. Opens the planner in a small window
// (a top-level window can read the planner's saved autos), which posts them back here.
import { PLANNER_ORIGIN, PLANNER_URL, type SyncMessage } from '../shared/config';
import { parseRoutine, type Routine } from '../shared/routine';

export function syncFromPlanner(save: (routines: Routine[]) => number): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = `${PLANNER_URL}?sync=${encodeURIComponent(location.origin)}`;
    const w = window.open(url, 'frs-auto-sync', 'popup,width=460,height=260');
    if (!w) {
      reject(new Error('The sync window was blocked. Allow pop-ups for this site, then click Sync again.'));
      return;
    }
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      fn();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLANNER_ORIGIN || e.source !== w) return;
      const msg = e.data as SyncMessage;
      if (!msg || msg.type !== 'frs-auto:routines' || !Array.isArray(msg.routines)) return;
      finish(() => {
        try {
          const list = msg.routines.map((r) => parseRoutine(JSON.stringify(r)));
          const count = save(list);
          w.postMessage({ type: 'frs-auto:ack', count } satisfies SyncMessage, PLANNER_ORIGIN);
          resolve(count);
        } catch (err) {
          reject(new Error('The planner sent something unreadable: ' + (err as Error).message));
        }
      });
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(() => reject(new Error("No answer from the planner. Check your connection and try again."))), 20000);
  });
}
