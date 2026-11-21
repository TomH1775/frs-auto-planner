// Where the planner website is published (GitHub Pages). The auto-updating bookmark loads the
// in-game runtime from here, and the in-game "Sync" button pulls routines from here.
export const PLANNER_URL = 'https://maxthecobbler.github.io/frs-auto-planner/';
export const PLANNER_ORIGIN = new URL(PLANNER_URL).origin;
export const RUNTIME_FILE = 'frs-auto-runtime.js';

/** Origins the planner is allowed to hand routines to. */
export const FRS_ORIGIN_RE = /^https:\/\/(rebuilt|reefscape|crescendo)\.frsim\.com$/;

/** postMessage payloads between the planner (sync window) and the game page. */
export type SyncMessage =
  | { type: 'frs-auto:hello' } // game -> planner: ready, send routines
  | { type: 'frs-auto:routines'; routines: unknown[] } // planner -> game
  | { type: 'frs-auto:ack'; count: number }; // game -> planner: got them
