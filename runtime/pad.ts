// Virtual "standard" gamepad. While active it is the only controller the game sees,
// so the routine has full control; while idle the real controllers pass straight through.

const N_BUTTONS = 17;
const state = {
  active: false,
  axes: [0, 0, 0, 0],
  buttons: new Array<number>(N_BUTTONS).fill(0),
};

let origGetGamepads: (() => (Gamepad | null)[]) | null = null;

const button = (v: number) => ({ pressed: v > 0.5, touched: v > 0, value: v });

function makePad() {
  return {
    id: 'FRS Auto (STANDARD GAMEPAD Vendor: 0000 Product: 0000)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: performance.now(),
    axes: state.axes.slice(),
    buttons: state.buttons.map(button),
    vibrationActuator: null,
    hapticActuators: [],
  } as unknown as Gamepad;
}

export function installPad() {
  if (origGetGamepads) return;
  const nav = navigator as Navigator & { __frsAutoOrig?: () => (Gamepad | null)[] };
  // survive a second bookmarklet click
  origGetGamepads = nav.__frsAutoOrig ?? navigator.getGamepads.bind(navigator);
  nav.__frsAutoOrig = origGetGamepads;
  navigator.getGamepads = function () {
    if (!state.active) return origGetGamepads!();
    return [makePad(), null, null, null];
  };
}

export function realPads(): Gamepad[] {
  if (!origGetGamepads) return [];
  return Array.from(origGetGamepads()).filter((p): p is Gamepad => !!p && p.connected);
}

/** True if a real controller is being touched (used to hand control back to the driver). */
export function realInputActive(): boolean {
  for (const p of realPads()) {
    if (p.axes.some((a) => Math.abs(a) > 0.35)) return true;
    if (p.buttons.some((b) => b.pressed)) return true;
  }
  return false;
}

function fire(type: 'gamepadconnected' | 'gamepaddisconnected') {
  try {
    const ev = new Event(type);
    Object.defineProperty(ev, 'gamepad', { value: makePad() });
    window.dispatchEvent(ev);
  } catch {
    /* ignore */
  }
}

export function setActive(on: boolean) {
  if (on === state.active) return;
  if (!on) releaseAll();
  state.active = on;
  fire(on ? 'gamepadconnected' : 'gamepaddisconnected');
}

export function isActive() {
  return state.active;
}

export function setSticks(lx: number, ly: number, rx: number, ry = 0) {
  state.axes[0] = lx;
  state.axes[1] = ly;
  state.axes[2] = rx;
  state.axes[3] = ry;
}

export function setButtons(pressed: Set<number>) {
  for (let i = 0; i < N_BUTTONS; i++) state.buttons[i] = pressed.has(i) ? 1 : 0;
}

export function releaseAll() {
  state.axes.fill(0);
  state.buttons.fill(0);
}
