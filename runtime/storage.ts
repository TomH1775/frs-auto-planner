import { BUTTONS, BUTTON_IDS, parseRoutine, type ButtonId, type Routine } from '../shared/routine';
import { DEFAULT_CALIBRATION, type Calibration } from '../shared/stick';
import type { FrontAxis } from './game';

export interface Settings {
  cal: Calibration;
  front: FrontAxis;
  /** standard-gamepad button index for each mechanism */
  buttonMap: Record<ButtonId, number>;
  autoRearm: boolean;
  kP: number; // 1/s, position correction
  kTheta: number; // 1/s, heading correction
}

export const DEFAULT_SETTINGS: Settings = {
  cal: { ...DEFAULT_CALIBRATION },
  front: '-x',
  buttonMap: Object.fromEntries(BUTTON_IDS.map((b) => [b, BUTTONS[b].pad])) as Record<ButtonId, number>,
  autoRearm: true,
  kP: 2.5,
  kTheta: 3,
};

const K = { routines: 'frsAuto:routines', selected: 'frsAuto:selected', settings: 'frsAuto:settings' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: keep working in memory */
  }
}

let routines: Routine[] = read<Routine[]>(K.routines, []).filter((r) => {
  try {
    parseRoutine(JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
});
let selected: string | null = read<string | null>(K.selected, null);
let settings: Settings = (() => {
  const s = read<Partial<Settings>>(K.settings, {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    cal: { ...DEFAULT_SETTINGS.cal, ...(s.cal ?? {}) },
    buttonMap: { ...DEFAULT_SETTINGS.buttonMap, ...(s.buttonMap ?? {}) },
  };
})();

export const store = {
  routines: () => routines,
  selected: () => routines.find((r) => r.id === selected) ?? routines[0] ?? null,
  select(id: string) {
    selected = id;
    write(K.selected, id);
  },
  upsert(r: Routine) {
    const i = routines.findIndex((x) => x.id === r.id);
    if (i >= 0) routines[i] = r;
    else routines.push(r);
    write(K.routines, routines);
    store.select(r.id);
  },
  remove(id: string) {
    routines = routines.filter((r) => r.id !== id);
    write(K.routines, routines);
  },
  settings: () => settings,
  setSettings(patch: Partial<Settings>) {
    settings = { ...settings, ...patch };
    write(K.settings, settings);
  },
};
