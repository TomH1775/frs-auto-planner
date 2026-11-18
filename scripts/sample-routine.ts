// Prints the default demo routine as JSON (used for testing the runtime).
import { newRoutine } from '../shared/routine';
import { buildSchedule } from '../shared/schedule';
const r = newRoutine('Demo: trench run + shoot');
r.id = 'demo';
const s = buildSchedule(r);
console.error(`total ${s.total.toFixed(2)}s, steps ${s.steps.map((x) => x.kind + ':' + (x.t1 - x.t0).toFixed(2)).join(' ')}`);
console.log(JSON.stringify(r));
