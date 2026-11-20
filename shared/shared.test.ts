import { describe, expect, it } from 'vitest';
import { GAMES, gameFromHost, mirrorPose, simToField, wrapAngle, type Shape } from './field';
import { nearestOnPath, posToS, samplePath, sampleAt } from './path';
import { applyAutoHandles, makeAction, makeWaypoint, mirrorRoutine, newRoutine, parseRoutine, type Routine } from './routine';
import { buildSchedule, buttonsAt, referenceAt } from './schedule';
import { profileRange } from './trajectory';
import { stickFromVelocity } from './stick';

const C = { maxVel: 3, maxAccel: 3, maxAngVel: 4 };

function straight(len = 3, h0: number | null = 0, h1: number | null = null): Routine {
  return {
    version: 1,
    id: 't',
    name: 't',
    waypoints: applyAutoHandles([makeWaypoint(2, 4, h0), makeWaypoint(2 + len, 4, h1)]),
    actions: [],
    constraints: C,
    updatedAt: 0,
  };
}

describe('field', () => {
  it('wraps angles', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });
  const R = GAMES.rebuilt, E = GAMES.reefscape, K = GAMES.crescendo;
  const labeled = (g: typeof R, label: string) => g.shapes.filter((x): x is Extract<Shape, { t: 'rect' } | { t: 'poly' }> => (x.t === 'rect' || x.t === 'poly') && x.label === label);
  const cx = (x: Shape) => (x.t === 'rect' ? (x.x0 + x.x1) / 2 : x.t === 'poly' ? x.pts.reduce((a, p) => a + p[0], 0) / x.pts.length : 0);

  it('rotates Rebuilt/Reefscape and mirrors Crescendo for the red side', () => {
    const m = mirrorPose(R, { x: 1, y: 2, heading: 0 });
    expect(m.x).toBeCloseTo(R.field.length - 1);
    expect(m.y).toBeCloseTo(R.field.width - 2);
    expect(Math.abs(m.heading)).toBeCloseTo(Math.PI);
    const c = mirrorPose(K, { x: 1, y: 2, heading: 0.3 });
    expect(c.x).toBeCloseTo(K.field.length - 1);
    expect(c.y).toBeCloseTo(2); // Crescendo is mirrored left-right: same y
    expect(c.heading).toBeCloseTo(Math.PI - 0.3);
  });
  it('converts sim coordinates (FRS map: Rebuilt blue start at X=-3.8259, Z=-3.5653)', () => {
    const p = simToField(R, -3.825875, -3.565337);
    expect(p.x).toBeCloseTo(4.4446, 3);
    expect(p.y).toBeCloseTo(7.6, 3);
  });
  it('matches each FRS field map', () => {
    expect([R.field.length, R.field.width]).toEqual([16.540988, 8.069326]);
    expect([E.field.length, E.field.width]).toEqual([17.548, 8.052]);
    expect([K.field.length, K.field.width]).toEqual([16.541, 8.211]);
    const hubs = labeled(R, 'HUB');
    expect(hubs).toHaveLength(2);
    expect(cx(hubs[0])).toBeCloseTo(4.6256, 3);
    expect(cx(hubs[1])).toBeCloseTo(R.field.length - 4.6256, 3);
    // Reefscape reef centers (FRS: 4.285 m either side of center)
    const reefs = labeled(E, 'REEF');
    expect(reefs.map(cx).sort((a, b) => a - b).map((v) => +v.toFixed(3))).toEqual([4.489, 13.059]);
    // Crescendo speakers are on the same side of the field (mirror symmetry)
    const sp = labeled(K, 'SPEAKER');
    expect(sp).toHaveLength(2);
    if (sp[0].t === 'rect' && sp[1].t === 'rect') expect((sp[0].y0 + sp[0].y1) / 2).toBeCloseTo((sp[1].y0 + sp[1].y1) / 2, 6);
  });
  it('detects the game from the page host', () => {
    expect(gameFromHost('rebuilt.frsim.com')).toBe('rebuilt');
    expect(gameFromHost('reefscape.frsim.com')).toBe('reefscape');
    expect(gameFromHost('crescendo.frsim.com')).toBe('crescendo');
    expect(gameFromHost('example.com')).toBe(null);
  });
});

describe('path sampling', () => {
  it('measures a straight line', () => {
    const p = samplePath(straight(3).waypoints);
    expect(p.length).toBeCloseTo(3, 3);
    expect(p.waypointS).toEqual([0, p.length]);
    expect(sampleAt(p, 1.5).x).toBeCloseTo(3.5, 3);
  });
  it('maps (seg,u) to arc length and back', () => {
    const r = newRoutine();
    const p = samplePath(r.waypoints);
    const s = posToS(p, { seg: 1, u: 0.5 });
    expect(s).toBeGreaterThan(p.waypointS[1]);
    expect(s).toBeLessThan(p.waypointS[2]);
    const pt = sampleAt(p, s);
    const near = nearestOnPath(p, pt.x, pt.y)!;
    expect(near.dist).toBeLessThan(0.02);
    expect(near.pos.seg).toBe(1);
    expect(near.pos.u).toBeCloseTo(0.5, 1);
  });
  it('blends heading between waypoints the short way', () => {
    const r = straight(4, Math.PI - 0.1, -Math.PI + 0.1);
    const p = samplePath(r.waypoints);
    const mid = sampleAt(p, 2).heading;
    // short way passes through ±π, not through 0
    expect(Math.abs(wrapAngle(mid))).toBeGreaterThan(3);
  });
});

describe('trajectory', () => {
  it('respects velocity and acceleration limits and ends at rest', () => {
    const p = samplePath(straight(6).waypoints);
    const tr = profileRange(p, 0, p.length, C);
    expect(tr[0].v).toBe(0);
    expect(tr[tr.length - 1].v).toBe(0);
    for (let i = 1; i < tr.length; i++) {
      expect(tr[i].v).toBeLessThanOrEqual(C.maxVel + 1e-9);
      const dt = tr[i].t - tr[i - 1].t;
      if (dt > 1e-6) expect(Math.abs(tr[i].v - tr[i - 1].v) / dt).toBeLessThanOrEqual(C.maxAccel * 1.05);
    }
    // trapezoid: 1s accel (1.5m) + 1s cruise (3m) + 1s decel (1.5m) = 3s
    expect(tr[tr.length - 1].t).toBeCloseTo(3, 1);
  });
  it('slows down to rotate', () => {
    const fast = profileRange(samplePath(straight(2, 0, 0).waypoints), 0, 2, C);
    const r = straight(2, 0, Math.PI); // 180° turn over 2m
    const p = samplePath(r.waypoints);
    const slow = profileRange(p, 0, 2, { ...C, maxAngVel: 1 });
    expect(slow[slow.length - 1].t).toBeGreaterThan(fast[fast.length - 1].t);
    for (const st of slow) expect(Math.abs(st.omega)).toBeLessThan(1.2);
  });
});

describe('waypoints', () => {
  it('keeps speed through a gentle waypoint but still slows for a hairpin', () => {
    const mk = (pts: [number, number][]) => ({ ...straight(), waypoints: applyAutoHandles(pts.map(([x, y], i) => makeWaypoint(x, y, i === 0 ? 0 : null))), constraints: { ...C, maxVel: 3.5, maxAccel: 4 } });
    const gentle = buildSchedule(mk([[2, 2], [6, 3], [10, 2]]));
    const g = gentle.steps[0];
    if (g.kind !== 'drive') throw new Error('expected drive');
    const wpS = gentle.path.waypointS[1];
    const atWp = g.traj.reduce((best, p) => (Math.abs(p.s - wpS) < Math.abs(best.s - wpS) ? p : best));
    expect(atWp.v).toBeGreaterThan(3.5 * 0.9);

    const hairpin = buildSchedule(mk([[2, 2], [6, 2], [2, 2.6]]));
    const h = hairpin.steps[0];
    if (h.kind !== 'drive') throw new Error('expected drive');
    // slowest point in the middle of the turn (ignoring the start/end where it is at rest)
    const L = hairpin.path.length;
    const mid = h.traj.filter((p) => p.s > 1.5 && p.s < L - 1.5);
    const slowest = Math.min(...mid.map((p) => p.v));
    expect(slowest).toBeLessThan(3.5 * 0.75);
  });
});

describe('schedule', () => {
  it('stops for stop-actions and orders everything in time', () => {
    const r = straight(4);
    r.actions = [
      makeAction('intakeOn', { seg: 0, u: 0.1 }),
      { ...makeAction('shoot', { seg: 0, u: 0.5 }), duration: 2 },
      makeAction('intakeOff', { seg: 0, u: 0.9 }),
    ];
    const s = buildSchedule(r);
    expect(s.steps.map((x) => x.kind)).toEqual(['drive', 'hold', 'drive']);
    const hold = s.steps[1];
    expect(hold.t1 - hold.t0).toBeCloseTo(2);
    const shoot = s.timing[r.actions[1].id];
    expect(shoot.t0).toBeCloseTo(hold.t0);
    expect(buttonsAt(s, shoot.t0 + 1)).toEqual(new Set(['intake', 'score']));
    const off = s.timing[r.actions[2].id].t0;
    expect(off).toBeGreaterThan(hold.t1);
    expect(buttonsAt(s, off + 0.01).has('intake')).toBe(false);
    // reference is stationary during the hold
    const ref = referenceAt(s, hold.t0 + 0.5);
    expect(ref.vx).toBe(0);
    expect(ref.pose.x).toBeCloseTo(4, 1);
  });
  it('slows to a % of max speed while shooting on the move', () => {
    const r = straight(6);
    const shoot = { ...makeAction('shoot', { seg: 0, u: 0.4 }), stop: false, duration: 1, speedPct: 25 };
    r.actions = [shoot];
    const s = buildSchedule(r);
    expect(s.steps.map((x) => x.kind)).toEqual(['drive']);
    const slow = C.maxVel * 0.25;
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0].s1 - s.zones[0].s0).toBeCloseTo(slow * 1, 5);
    const tm = s.timing[shoot.id];
    // for the whole time the button is held, the robot is at or below the slow speed
    for (let t = tm.t0; t <= tm.t1; t += 0.02) {
      const ref = referenceAt(s, t);
      expect(Math.hypot(ref.vx, ref.vy)).toBeLessThanOrEqual(slow + 1e-6);
    }
    expect(buttonsAt(s, tm.t0 + 0.5).has('score')).toBe(true);
    // and it is slower overall than without slowing
    const fast = buildSchedule({ ...r, actions: [{ ...shoot, speedPct: 100 }] });
    expect(s.driveEnd).toBeGreaterThan(fast.driveEnd);
    // stopping shots get no zone
    expect(buildSchedule({ ...r, actions: [{ ...shoot, stop: true }] }).zones).toHaveLength(0);
  });
  it('a stop inside a moving shot uses up shot time (no extra slow driving afterwards)', () => {
    const r = straight(10);
    const shoot = { ...makeAction('shoot', { seg: 0, u: 0.1 }), stop: false, duration: 3, speedPct: 25 };
    const wait = { ...makeAction('wait', { seg: 0, u: 0.2 }), duration: 1.5 };
    r.actions = [shoot, wait];
    const s = buildSchedule(r);
    const v = C.maxVel * 0.25;
    const z = s.zones[0];
    // drive (0.2-0.1)*10 = 1 m slowly (1.33 s), park 1.5 s, leaving ~0.17 s => ~0.13 m past the wait
    const drive1 = 1 / v;
    expect(z.s1 - z.s0).toBeCloseTo(1 + v * (3 - drive1 - 1.5), 2);
    // and once the shot's time is over, the robot is no longer held slow
    const shotEnd = s.timing[shoot.id].t1;
    const later = referenceAt(s, shotEnd + 1.0);
    expect(Math.hypot(later.vx, later.vy)).toBeGreaterThan(v * 1.5);
  });
  it('warns when over 20 s', () => {
    const r = straight(2);
    r.actions = [{ ...makeAction('wait', { seg: 0, u: 1 }), duration: 25 }];
    expect(buildSchedule(r).warnings.join()).toMatch(/only 20 s/);
  });
  it('default routine builds without warnings', () => {
    const s = buildSchedule(newRoutine());
    expect(s.warnings).toEqual([]);
    expect(s.total).toBeGreaterThan(3);
    expect(s.total).toBeLessThan(20);
  });
});

describe('routine io', () => {
  it('round-trips JSON and mirrors twice to identity', () => {
    const r = newRoutine();
    expect(parseRoutine(JSON.stringify(r))).toEqual(r);
    const mm = mirrorRoutine(mirrorRoutine(r));
    mm.waypoints.forEach((w, i) => {
      expect(w.x).toBeCloseTo(r.waypoints[i].x);
      expect(w.y).toBeCloseTo(r.waypoints[i].y);
    });
    expect(() => parseRoutine('{"hello":1}')).toThrow();
  });
});

describe('stick mapping', () => {
  const cal = { maxVel: 4, maxOmega: 6, deadzone: 0.12 };
  it('is zero for tiny commands and adds deadzone otherwise', () => {
    expect(stickFromVelocity(0, 0, 0, 'blue', cal)).toEqual({ lx: 0, ly: 0, rx: 0 });
    const s = stickFromVelocity(2, 0, 0, 'blue', cal);
    expect(s.ly).toBeCloseTo(-(0.12 + 0.88 * 0.5));
    expect(s.lx).toBeCloseTo(0);
  });
  it('flips for red and maps rotation (right stick right = clockwise)', () => {
    const b = stickFromVelocity(0, 1, 3, 'blue', cal);
    const r = stickFromVelocity(0, 1, 3, 'red', cal);
    expect(b.lx).toBeLessThan(0); // +y is stick-left for blue
    expect(r.lx).toBeGreaterThan(0);
    expect(b.rx).toBeLessThan(0); // CCW = stick left
    expect(r.rx).toBeCloseTo(b.rx);
  });
  it('inverts Crescendo first-person (robot-relative) driving', () => {
    // measured in FRS: yaw -2.057 with intake on the back (lead = yaw + π): stick up moved (0.884, 0.468) in scene X,Z
    const lead = -2.0568 + Math.PI;
    // ask for that same direction in field terms: scene (0.884, 0.468) = field (0.884, -0.468)
    const s = stickFromVelocity(0.884 * 2, -0.468 * 2, 0, 'blue', cal, { kind: 'robot', leadYaw: lead });
    expect(s.ly).toBeLessThan(-0.3); // stick pushed up
    expect(Math.abs(s.lx)).toBeLessThan(0.02);
  });
  it('clamps to the unit circle', () => {
    const s = stickFromVelocity(10, 10, 100, 'blue', cal);
    expect(Math.hypot(s.lx, s.ly)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.abs(s.rx)).toBeLessThanOrEqual(1);
  });
});

describe('recording -> routine', () => {
  // synthetic 60 Hz drive: straight while intaking, stop & shoot, L-turn while shooting on the move, stop & climb
  function fakeDrive() {
    const out: { t: number; x: number; y: number; heading: number; buttons: ('intake' | 'score' | 'climb')[] }[] = [];
    for (let i = 0; i <= 450; i++) {
      const t = i / 60;
      let x: number, y: number, heading: number;
      if (t < 2) [x, y, heading] = [2 + 2 * t, 2, 0];
      else if (t < 4) [x, y, heading] = [6, 2, 0];
      else if (t < 6.5) {
        const f = (t - 4) / 2.5;
        [x, y, heading] = [6, 2 + 3 * f, (Math.PI / 2) * f];
      } else [x, y, heading] = [6, 5, Math.PI / 2];
      const buttons: ('intake' | 'score' | 'climb')[] = [];
      if (t >= 0.5 && t < 1.5) buttons.push('intake');
      if ((t >= 2.3 && t < 4.0) || (t >= 4.5 && t < 5.5)) buttons.push('score');
      if (t >= 6.7 && t < 7.0) buttons.push('climb');
      out.push({ t: 100 + t, x, y, heading, buttons });
    }
    return out;
  }

  it('keeps the shape with few waypoints and recovers every action', async () => {
    const { recordingToRoutine } = await import('./recording');
    const r = recordingToRoutine(fakeDrive());
    expect(r.waypoints.length).toBeLessThanOrEqual(6);
    const first = r.waypoints[0], last = r.waypoints[r.waypoints.length - 1];
    expect(first.x).toBeCloseTo(2, 1);
    expect(last.x).toBeCloseTo(6, 1);
    expect(last.y).toBeCloseTo(5, 1);
    expect(r.waypoints.some((w) => Math.hypot(w.x - 6, w.y - 2) < 0.1)).toBe(true); // the stop corner

    const types = r.actions.map((a) => a.type);
    expect(types).toContain('intakeOn');
    expect(types).toContain('intakeOff');
    const shots = r.actions.filter((a) => a.type === 'shoot');
    expect(shots).toHaveLength(2);
    const parked = shots.find((a) => a.stop)!;
    expect(parked.duration).toBeCloseTo(1.7, 1);
    const moving = shots.find((a) => !a.stop)!;
    expect(moving.speedPct).toBeGreaterThan(0);
    expect(moving.speedPct).toBeLessThan(100);
    const climb = r.actions.find((a) => a.type === 'climb')!;
    expect(climb.stop).toBe(true);
    // the 0.3 s before the parked shot becomes a wait
    expect(r.actions.some((a) => a.type === 'wait' && Math.abs(a.duration - 0.3) < 0.1)).toBe(true);

    const s = buildSchedule(r);
    expect(s.warnings).toEqual([]);
    expect(s.total).toBeGreaterThan(7.5 * 0.75);
    expect(s.total).toBeLessThan(7.5 * 1.25);
  });

  it('rejects an empty recording', async () => {
    const { recordingToRoutine } = await import('./recording');
    expect(() => recordingToRoutine([])).toThrow(/too short/);
  });
});
