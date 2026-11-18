// Hooks into the running FRS page. Everything here is specific to FRS's current build;
// see docs/recon.md. All functions fail closed (return null / throw a readable Error).
import { SIM_ORIGIN, type Pose } from '../shared/field';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export type FrontAxis = '-x' | '+x' | '-z' | '+z';

let three: Any = null;
/** Shared with any earlier copy of the runtime that already hooked the renderer. */
interface HookState {
  scene: Any;
  seenAt: number;
  checked: WeakSet<object>;
}
let hook: HookState = { scene: null, seenAt: 0, checked: new WeakSet() };
let robot: Any = null;
let robotCount = 0;
let robotScanAt = 0;

function getTurbopackContext(): Promise<Any> {
  const T = (window as Any).TURBOPACK;
  if (!T || typeof T.push !== 'function') return Promise.reject(new Error('This page is not FRS (game bundle not found).'));
  return new Promise((resolve, reject) => {
    const id = 'frsauto-' + Math.random().toString(36).slice(2);
    let done = false;
    try {
      T.push([id + '-a.js', id, (ctx: Any) => {
        done = true;
        resolve(ctx);
      }]);
      T.push([id + '-b.js', { otherChunks: [], runtimeModuleIds: [id] }]);
    } catch (e) {
      reject(new Error('Could not reach the game modules: ' + (e as Error).message));
      return;
    }
    setTimeout(() => {
      if (!done) reject(new Error('Could not reach the game modules (timed out).'));
    }, 3000);
  });
}

/** Find Three.js inside the game bundle and start watching for the match scene. */
export async function attach(): Promise<void> {
  if (three) return;
  const ctx = await getTurbopackContext();
  const cache: Map<unknown, Any> | undefined = ctx && ctx.c;
  if (!cache || typeof cache.values !== 'function') throw new Error('Game module cache not found (FRS may have updated).');
  for (const m of cache.values()) {
    try {
      const e = m && m.exports;
      if (e && e.Object3D && e.Vector3 && e.Object3D.prototype && typeof e.Object3D.prototype.updateMatrixWorld === 'function') {
        three = e;
        break;
      }
    } catch {
      /* some exports throw on access */
    }
  }
  if (!three) throw new Error('Three.js not found in the game (FRS may have updated).');
  const proto = three.Object3D.prototype;
  if (proto.__frsAutoHook) {
    hook = proto.__frsAutoHook;
    return;
  }
  const state = hook;
  const orig = proto.updateMatrixWorld;
  proto.updateMatrixWorld = function (this: Any, force?: boolean) {
    if (this.isScene) {
      if (this !== state.scene && !state.checked.has(this)) {
        state.checked.add(this);
        try {
          if (this.getObjectByName('field')) state.scene = this;
        } catch {
          /* ignore */
        }
      }
      if (this === state.scene) state.seenAt = performance.now();
    }
    return orig.call(this, force);
  };
  proto.__frsAutoHook = state;
}

function isWarmup(o: Any): boolean {
  for (let p = o.parent; p; p = p.parent) if (p.name === 'shader-warmup-robot') return true;
  return false;
}

function scanRobots() {
  robotScanAt = performance.now();
  const found: Any[] = [];
  if (hook.scene) {
    hook.scene.traverse((o: Any) => {
      if (/^robot:\d+$/.test(o.name) && !isWarmup(o)) found.push(o);
    });
  }
  robotCount = found.length;
  robot = found[0] ?? null;
}

function attachedToScene(o: Any): boolean {
  let p = o;
  while (p.parent) p = p.parent;
  return p === hook.scene;
}

/** Is a match on screen right now? */
export function inMatch(): boolean {
  if (!hook.scene) return false;
  // Rendering pauses when the window is hidden, so also accept "scoreboard is on screen".
  return performance.now() - hook.seenAt < 1000 || readPhase() !== null;
}

export function robotInfo(): { count: number; name: string | null } {
  if (!robot || !attachedToScene(robot) || performance.now() - robotScanAt > 2000) scanRobots();
  return { count: robotCount, name: robot ? robot.name : null };
}

/** Robot pose in WPILib blue-origin field coordinates, or null if unavailable. */
export function readPose(front: FrontAxis = '-x'): Pose | null {
  if (!inMatch()) return null;
  if (!robot || !attachedToScene(robot)) scanRobots();
  if (!robot) return null;
  robot.updateWorldMatrix(true, false);
  const m = robot.matrixWorld.elements as number[];
  // local axis -> world direction (X, Z); field dir = (X, -Z)
  let wx: number, wz: number;
  switch (front) {
    case '+x': wx = m[0]; wz = m[2]; break;
    case '-x': wx = -m[0]; wz = -m[2]; break;
    case '+z': wx = m[8]; wz = m[10]; break;
    case '-z': wx = -m[8]; wz = -m[10]; break;
  }
  return { x: m[12] + SIM_ORIGIN.x, y: SIM_ORIGIN.z - m[14], heading: Math.atan2(-wz, wx) };
}

let phaseEl: Element | null = null;
let phaseScanAt = 0;
const PHASE_RE = /^(Ready|Starting|Auto|Auto scoring|Teleop|End game|Paused|Match over)$|^(Transition|Shift \d|End game) ·/;

/** The scoreboard phase label: "Auto", "Transition · 0:10", "Shift 2 · 0:20", ... */
export function readPhase(): string | null {
  if (!phaseEl || !phaseEl.isConnected || !PHASE_RE.test((phaseEl.textContent || '').trim())) {
    phaseEl = null;
    if (performance.now() - phaseScanAt < 400) return null;
    phaseScanAt = performance.now();
    const els = document.querySelectorAll('span,div,p');
    for (const el of Array.from(els)) {
      if (el.children.length) continue;
      if (el.closest('#frs-auto-hud')) continue;
      if (PHASE_RE.test((el.textContent || '').trim())) {
        phaseEl = el;
        break;
      }
    }
  }
  return phaseEl ? (phaseEl.textContent || '').trim() : null;
}

export const isAutoPhase = (p: string | null) => p === 'Auto';

/** Match clock (seconds remaining in the current period), read from the span next to the phase label. */
export function readClock(): number | null {
  readPhase();
  const parent = phaseEl?.parentElement;
  if (!parent) return null;
  for (const c of Array.from(parent.children)) {
    const m = /^(\d+):(\d\d)$/.exec((c.textContent || '').trim());
    if (m) return +m[1] * 60 + +m[2];
  }
  return null;
}
