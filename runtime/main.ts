// FRS Auto in-game runtime. Loaded by the bookmarklet the planner app generates
// (or pasted into the console). Safe to run more than once.
import { attach } from './game';
import { gameFromHost } from '../shared/field';
import { installPad } from './pad';
import { Runner } from './runner';
import { Recorder } from './recorder';
import { loadRoutines, mountHud } from './hud';

interface Api {
  runner: Runner;
  recorder: Recorder;
  hud: ReturnType<typeof mountHud>;
  load: (data: unknown) => void;
  version: string;
}

declare const __BUILD_ID__: string;

declare global {
  interface Window {
    __FRS_AUTO?: Api;
    __FRS_AUTO_EMBED?: unknown;
  }
}

const VERSION = __BUILD_ID__;

function toast(msg: string) {
  const d = document.createElement('div');
  d.textContent = 'FRS Auto: ' + msg;
  d.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.4)';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 6000);
}

async function boot() {
  const embed = window.__FRS_AUTO_EMBED;
  delete window.__FRS_AUTO_EMBED;

  const existing = window.__FRS_AUTO;
  if (existing && existing.version !== VERSION) {
    // a different build is loaded: replace it
    existing.runner.destroy();
    existing.recorder?.destroy();
    existing.hud.destroy();
    delete window.__FRS_AUTO;
  } else if (existing) {
    if (embed) existing.load(embed);
    existing.hud.show();
    return;
  }
  if (!gameFromHost(location.hostname)) {
    toast('open a game on frsim.com (Rebuilt, Reefscape or Crescendo) first, then click the bookmark again.');
    return;
  }
  try {
    await attach();
  } catch (e) {
    toast((e as Error).message);
    return;
  }
  installPad();
  if (embed) {
    try {
      loadRoutines(embed);
    } catch (e) {
      toast('Embedded routine was invalid: ' + (e as Error).message);
    }
  }
  const runner = new Runner();
  const recorder = new Recorder();
  const hud = mountHud(runner, recorder);
  window.__FRS_AUTO = {
    runner,
    recorder,
    hud,
    version: VERSION,
    load(data: unknown) {
      try {
        loadRoutines(data);
        hud.refresh();
      } catch (e) {
        toast('Could not load routine: ' + (e as Error).message);
      }
    },
  };
}

boot().catch((e) => toast(String(e && (e as Error).message)));
