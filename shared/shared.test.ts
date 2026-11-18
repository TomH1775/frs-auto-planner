import { describe, expect, it } from 'vitest';
import { FIELD, mirrorPose, simToField, wrapAngle } from './field';
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
  it('mirrors through field center', () => {
    const m = mirrorPose({ x: 1, y: 2, heading: 0 });
    expect(m.x).toBeCloseTo(FIELD.length - 1);
    expect(m.y).toBeCloseTo(FIELD.width - 2);
    expect(Math.abs(m.heading)).toBeCloseTo(Math.PI);
  });
  it('converts sim coordinates (recon: blue start at X=-3.826, Z=-3.562)', () => {
    const p = simToField(-3.826, -3.562);
    expect(p.x).toBeCloseTo(4.444, 2);
    expect(p.y).toBeCloseTo(7.573, 2);
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
  it('clamps to the unit circle', () => {
    const s = stickFromVelocity(10, 10, 100, 'blue', cal);
    expect(Math.hypot(s.lx, s.ly)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.abs(s.rx)).toBeLessThanOrEqual(1);
  });
});
