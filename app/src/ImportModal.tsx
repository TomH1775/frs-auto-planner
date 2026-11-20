import { useRef, useState } from 'react';
import { parseRoutine, type Routine } from '../../shared/routine';
import { useStore } from './store';

/** Accepts one routine or an array of routines. */
function parseAll(text: string): Routine[] {
  const data = JSON.parse(text);
  return (Array.isArray(data) ? data : [data]).map((item) => parseRoutine(JSON.stringify(item)));
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const importRoutines = useStore((s) => s.importRoutines);
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  const finish = (rs: Routine[]) => {
    if (!rs.length) return setErr('Nothing to import.');
    importRoutines(rs);
    onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>Import autos</h2>
        <p className="hint">
          Bring in a routine exported from the planner, or one recorded in FRS (FRS AUTO panel → <b>Record a drive</b> → Download .json or Copy JSON).
        </p>
        <div className="row">
          <button className="go" onClick={() => file.current?.click()}>
            Choose .json file(s)…
          </button>
        </div>
        <label className="paste">
          …or paste JSON
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{"version":1, ...}' spellCheck={false} />
        </label>
        <div className="row">
          <button
            disabled={!text.trim()}
            onClick={() => {
              try {
                finish(parseAll(text.trim()));
              } catch (x) {
                setErr('Import failed: ' + (x as Error).message);
              }
            }}
          >
            Import pasted JSON
          </button>
        </div>
        {err && <p className="warn">{err}</p>}
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={async (e) => {
            try {
              const out: Routine[] = [];
              for (const f of Array.from(e.target.files ?? [])) out.push(...parseAll(await f.text()));
              finish(out);
            } catch (x) {
              setErr('Import failed: ' + (x as Error).message);
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
