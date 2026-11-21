import { useMemo } from 'react';
import { buildSchedule, type Schedule } from '../../shared/schedule';
import { useStore } from './store';
import { gameOf, type Routine } from '../../shared/routine';
import type { GameDef } from '../../shared/field';

export function useRoutine(): Routine {
  return useStore((s) => s.routines.find((r) => r.id === s.currentId) ?? s.routines[0]);
}

export function useGame(): GameDef {
  return gameOf(useRoutine());
}

export function useSchedule(): Schedule {
  const r = useRoutine();
  return useMemo(() => buildSchedule(r), [r]);
}

export const fmtDeg = (rad: number) => Math.round((((rad * 180) / Math.PI) % 360 + 540) % 360 - 180);
