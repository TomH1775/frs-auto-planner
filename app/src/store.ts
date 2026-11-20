import { create } from 'zustand';
import type { GameId } from '../../shared/field';
import {
  applyAutoHandles,
  blankRoutine,
  gameOf,
  makeAction,
  makeWaypoint,
  mirrorRoutine,
  newRoutine,
  uid,
  type Action,
  type ActionType,
  type Constraints,
  type PathPos,
  type Routine,
  type Vec2,
  type Waypoint,
} from '../../shared/routine';

export type Tool = 'select' | 'waypoint' | ActionType;
export type Selection = { kind: 'wp' | 'action'; id: string } | null;

interface Persisted {
  routines: Routine[];
  currentId: string;
}

const KEY = 'frsAutoPlanner:v1';

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.routines?.length) return { routines: p.routines, currentId: p.routines.some((r) => r.id === p.currentId) ? p.currentId : p.routines[0].id };
    }
  } catch {
    /* fall through to demo */
  }
  const demo = newRoutine('Trench run + shoot');
  return { routines: [demo], currentId: demo.id };
}

interface State extends Persisted {
  tool: Tool;
  selection: Selection;
  previewT: number;
  playing: boolean;
  past: Routine[];
  future: Routine[];

  current: () => Routine;
  setTool: (t: Tool) => void;
  select: (s: Selection) => void;
  setPreviewT: (t: number) => void;
  setPlaying: (p: boolean) => void;

  /** Save an undo point (call once at the start of a drag). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  /** Change the current routine. Pass checkpoint=false while dragging. */
  edit: (fn: (r: Routine) => Routine, checkpoint?: boolean) => void;

  addWaypoint: (x: number, y: number) => void;
  insertWaypoint: (at: PathPos, x: number, y: number) => void;
  moveWaypoint: (id: string, x: number, y: number) => void;
  setHandle: (id: string, which: 'hin' | 'hout', v: Vec2) => void;
  resetHandles: (id: string) => void;
  setHeading: (id: string, h: number | null) => void;
  deleteWaypoint: (id: string) => void;

  addAction: (type: ActionType, at: PathPos) => void;
  updateAction: (id: string, patch: Partial<Action>) => void;
  deleteAction: (id: string) => void;

  setConstraints: (c: Partial<Constraints>) => void;
  rename: (name: string) => void;
  newRoutine: () => void;
  /** show another game's autos (creates a blank one if there are none yet) */
  switchGame: (g: GameId) => void;
  duplicate: () => void;
  deleteRoutine: () => void;
  switchTo: (id: string) => void;
  importRoutines: (rs: Routine[]) => void;
  mirror: () => void;
}

const touch = (r: Routine): Routine => ({ ...r, updatedAt: Date.now() });

export const useStore = create<State>((set, get) => {
  const init = load();

  const replaceCurrent = (r: Routine) => {
    const { routines, currentId } = get();
    set({ routines: routines.map((x) => (x.id === currentId ? touch(r) : x)) });
  };

  const wps = (fn: (w: Waypoint[]) => Waypoint[]) => (r: Routine): Routine => ({ ...r, waypoints: applyAutoHandles(fn(r.waypoints)) });

  return {
    ...init,
    tool: 'select',
    selection: null,
    previewT: 0,
    playing: false,
    past: [],
    future: [],

    current: () => {
      const { routines, currentId } = get();
      return routines.find((r) => r.id === currentId) ?? routines[0];
    },
    setTool: (tool) => set({ tool }),
    select: (selection) => set({ selection }),
    setPreviewT: (previewT) => set({ previewT }),
    setPlaying: (playing) => set({ playing }),

    checkpoint: () => set((s) => ({ past: [...s.past.slice(-60), s.current()], future: [] })),
    undo: () => {
      const { past, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      const cur = get().current();
      set({ past: past.slice(0, -1), future: [cur, ...future] });
      replaceCurrent(prev);
    },
    redo: () => {
      const { past, future } = get();
      const next = future[0];
      if (!next) return;
      set({ past: [...past, get().current()], future: future.slice(1) });
      replaceCurrent(next);
    },
    edit: (fn, checkpoint = true) => {
      if (checkpoint) get().checkpoint();
      replaceCurrent(fn(get().current()));
    },

    addWaypoint: (x, y) => {
      const w = makeWaypoint(x, y, null);
      get().edit(wps((list) => [...list, w]));
      set({ selection: { kind: 'wp', id: w.id } });
    },
    insertWaypoint: (at, x, y) => {
      const w = makeWaypoint(x, y, null);
      const u0 = Math.min(0.98, Math.max(0.02, at.u));
      get().edit((r) => ({
        ...wps((list) => [...list.slice(0, at.seg + 1), w, ...list.slice(at.seg + 1)])(r),
        actions: r.actions.map((a) => {
          if (a.at.seg < at.seg) return a;
          if (a.at.seg > at.seg) return { ...a, at: { seg: a.at.seg + 1, u: a.at.u } };
          return a.at.u < u0 ? { ...a, at: { seg: at.seg, u: a.at.u / u0 } } : { ...a, at: { seg: at.seg + 1, u: (a.at.u - u0) / (1 - u0) } };
        }),
      }));
      set({ selection: { kind: 'wp', id: w.id } });
    },
    moveWaypoint: (id, x, y) => get().edit(wps((list) => list.map((w) => (w.id === id ? { ...w, x, y } : w))), false),
    setHandle: (id, which, v) =>
      get().edit(
        (r) => ({
          ...r,
          waypoints: r.waypoints.map((w) => {
            if (w.id !== id) return w;
            // keep the curve smooth: the opposite handle points the other way, keeping its length
            const other = which === 'hin' ? 'hout' : 'hin';
            const len = Math.hypot(w[other].x, w[other].y);
            const n = Math.hypot(v.x, v.y) || 1;
            return { ...w, [which]: v, [other]: { x: (-v.x / n) * len, y: (-v.y / n) * len }, autoHandles: false };
          }),
        }),
        false,
      ),
    resetHandles: (id) => get().edit(wps((list) => list.map((w) => (w.id === id ? { ...w, autoHandles: true } : w)))),
    setHeading: (id, h) => get().edit((r) => ({ ...r, waypoints: r.waypoints.map((w) => (w.id === id ? { ...w, heading: h } : w)) }), false),
    deleteWaypoint: (id) => {
      const r = get().current();
      const k = r.waypoints.findIndex((w) => w.id === id);
      if (k < 0) return;
      const last = r.waypoints.length - 1;
      get().edit((r) => {
        const list = r.waypoints.filter((w) => w.id !== id);
        if (k === 0 && list[0] && list[0].heading === null) list[0] = { ...list[0], heading: r.waypoints[0].heading };
        const segs = Math.max(0, list.length - 2);
        const actions = r.actions
          .map((a): Action => {
            const { seg, u } = a.at;
            if (k === 0) return seg === 0 ? { ...a, at: { seg: 0, u: 0 } } : { ...a, at: { seg: seg - 1, u } };
            if (k === last) return seg >= k - 1 ? { ...a, at: { seg: Math.max(0, k - 2), u: 1 } } : a;
            // merge segments k-1 and k
            if (seg === k - 1) return { ...a, at: { seg, u: u / 2 } };
            if (seg === k) return { ...a, at: { seg: k - 1, u: 0.5 + u / 2 } };
            return seg > k ? { ...a, at: { seg: seg - 1, u } } : a;
          })
          .map((a) => ({ ...a, at: { seg: Math.min(a.at.seg, segs), u: a.at.u } }));
        return { ...r, waypoints: applyAutoHandles(list), actions: list.length > 1 ? actions : [] };
      });
      set({ selection: null });
    },

    addAction: (type, at) => {
      const a = makeAction(type, at, gameOf(get().current()));
      get().edit((r) => ({ ...r, actions: [...r.actions, a] }));
      set({ selection: { kind: 'action', id: a.id } });
    },
    updateAction: (id, patch) => get().edit((r) => ({ ...r, actions: r.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), !('at' in patch) && !('speedPct' in patch)),
    deleteAction: (id) => {
      get().edit((r) => ({ ...r, actions: r.actions.filter((a) => a.id !== id) }));
      set({ selection: null });
    },

    setConstraints: (c) => get().edit((r) => ({ ...r, constraints: { ...r.constraints, ...c } })),
    rename: (name) => get().edit((r) => ({ ...r, name }), false),
    switchGame: (g) => {
      const existing = get().routines.find((r) => gameOf(r).id === g);
      if (existing) return get().switchTo(existing.id);
      const r = blankRoutine(`${g[0].toUpperCase() + g.slice(1)} auto 1`, g);
      set((s) => ({ routines: [...s.routines, r], currentId: r.id, selection: null, past: [], future: [], tool: 'waypoint', previewT: 0 }));
    },
    newRoutine: () => {
      const game = gameOf(get().current()).id;
      const count = get().routines.filter((r) => gameOf(r).id === game).length;
      const r = blankRoutine(`Auto ${count + 1}`, game);
      set((s) => ({ routines: [...s.routines, r], currentId: r.id, selection: null, past: [], future: [], tool: 'waypoint', previewT: 0 }));
    },
    duplicate: () => {
      const cur = get().current();
      const r = { ...structuredClone(cur), id: uid('r'), name: cur.name + ' copy', updatedAt: Date.now() };
      set((s) => ({ routines: [...s.routines, r], currentId: r.id, selection: null, past: [], future: [] }));
    },
    deleteRoutine: () => {
      const { routines, currentId } = get();
      const game = gameOf(get().current()).id;
      const rest = routines.filter((r) => r.id !== currentId);
      const next = rest.find((r) => gameOf(r).id === game) ?? blankRoutine('Auto 1', game);
      if (!rest.includes(next)) rest.push(next);
      set({ routines: rest, currentId: next.id, selection: null, past: [], future: [], previewT: 0 });
    },
    switchTo: (id) => set({ currentId: id, selection: null, past: [], future: [], previewT: 0, playing: false }),
    importRoutines: (rs) => {
      if (!rs.length) return;
      set((s) => {
        const map = new Map(s.routines.map((r) => [r.id, r]));
        for (const r of rs) map.set(r.id, r);
        return { routines: [...map.values()], currentId: rs[rs.length - 1].id, selection: null, past: [], future: [] };
      });
    },
    mirror: () => get().edit((r) => mirrorRoutine(r)),
  };
});

useStore.subscribe((s, prev) => {
  if (s.routines === prev.routines && s.currentId === prev.currentId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ routines: s.routines, currentId: s.currentId } satisfies Persisted));
  } catch {
    /* ignore */
  }
});
