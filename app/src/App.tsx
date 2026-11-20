import { useEffect, useState } from 'react';
import { ACTION_TYPES } from '../../shared/routine';
import { FieldCanvas } from './FieldCanvas';
import { ImportModal } from './ImportModal';
import { SendToFRS } from './SendToFRS';
import { ActionList, ConstraintsPanel, Inspector, ToolPalette } from './Sidebar';
import { Timeline } from './Timeline';
import { useStore } from './store';
import { useRoutine } from './useSchedule';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function TopBar({ onSend, onImport }: { onSend: () => void; onImport: () => void }) {
  const routines = useStore((s) => s.routines);
  const currentId = useStore((s) => s.currentId);
  const r = useRoutine();
  const s = useStore.getState();

  return (
    <header className="topbar">
      <div className="brand">
        FRS <span>AUTO</span> <small>2026 Rebuilt</small>
      </div>
      <select value={currentId} onChange={(e) => s.switchTo(e.target.value)}>
        {routines.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <input className="name" value={r.name} onFocus={() => s.checkpoint()} onChange={(e) => s.rename(e.target.value)} aria-label="Routine name" />
      <button onClick={() => s.newRoutine()}>New</button>
      <button onClick={() => s.duplicate()}>Duplicate</button>
      <button onClick={() => s.mirror()} title="Flip the routine to the other alliance (rotate 180°)">
        Flip alliance
      </button>
      <button onClick={onImport}>Import</button>
      <button onClick={() => download(`${r.name.replace(/[^\w-]+/g, '_')}.json`, JSON.stringify(r, null, 2))}>Export</button>
      <button
        className="danger"
        onClick={() => {
          if (window.confirm(`Delete "${r.name}"?`)) s.deleteRoutine();
        }}
      >
        Delete
      </button>
      <span className="grow" />
      <button className="go" onClick={onSend}>
        Send to FRS ▸
      </button>
    </header>
  );
}

export function App() {
  const [send, setSend] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea')) return;
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod) return;
      if (e.key === 'v' || e.key === 'Escape') s.setTool('select');
      else if (e.key === 'p') s.setTool('waypoint');
      else if (/^[1-9]$/.test(e.key) && ACTION_TYPES[+e.key - 1]) s.setTool(ACTION_TYPES[+e.key - 1]);
      else if (e.key === ' ') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        if (s.selection.kind === 'wp') s.deleteWaypoint(s.selection.id);
        else s.deleteAction(s.selection.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar onSend={() => setSend(true)} onImport={() => setImporting(true)} />
      <main>
        <FieldCanvas />
        <aside>
          <ToolPalette />
          <Inspector />
          <ActionList />
          <ConstraintsPanel />
        </aside>
      </main>
      <Timeline />
      {send && <SendToFRS onClose={() => setSend(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}
