export type ZeroPointRound = {
  level: number;
  name: string;
  targetMs: number;
  timerWindows: Array<[number, number]> | null;
  distraction: boolean;
};

export type ZeroPointRoundResult = {
  level: number;
  name: string;
  targetMs: number;
  actualElapsedMs: number;
  errorMs: number;
  score: number;
};

export const ZERO_POINT_ROUNDS = 8;
export const TIME_MASTER_RANGE = { minMs: 8_000, maxMs: 14_000 };
export const EVENT_HORIZON_RANGE = { minMs: 18_000, maxMs: 25_000 };
export const ZERO_POINT_TARGET_RANGES = [
  { minMs: 3_500, maxMs: 6_500 },
  { minMs: 6_000, maxMs: 9_000 },
  { minMs: 8_000, maxMs: 12_000 },
  { minMs: 10_000, maxMs: 14_000 },
  TIME_MASTER_RANGE,
  { minMs: 13_000, maxMs: 17_000 },
  { minMs: 16_000, maxMs: 20_000 },
  EVENT_HORIZON_RANGE
] as const;
export const ZERO_POINT_RULESET = "zero-point-v3";

export function createRoundTargets(random: () => number = Math.random): ZeroPointRound[] {
  const sample = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random source must return a value from 0 (inclusive) to 1 (exclusive).");
    }
    return value;
  };
  const chooseTarget = (range: { minMs: number; maxMs: number }) =>
    range.minMs + Math.floor(sample() * (range.maxMs - range.minMs + 1));
  const names = ["Rookie", "Focus", "Blind Timing", "Chaos", "Time Master", "Overdrive", "Singularity", "Event Horizon"];
  return ZERO_POINT_TARGET_RANGES.map((range, index) => {
    const targetMs = chooseTarget(range);
    let timerWindows: Array<[number, number]> | null = null;
    if (index > 0) {
      const initialEnd = Math.round((index === 1 ? 1_400 : 600) + sample() * 400);
      timerWindows = [[0, initialEnd]];
      for (const fraction of [0.28, 0.47, 0.66, 0.82]) {
        const start = Math.round(targetMs * (fraction + (sample() - 0.5) * 0.06));
        const duration = Math.round(300 + sample() * 250);
        timerWindows.push([start, start + duration]);
      }
      // Always offer one final calibration glimpse, with randomized timing.
      const finalEnd = targetMs - Math.round(100 + sample() * 100);
      timerWindows.push([finalEnd - Math.round(300 + sample() * 150), finalEnd]);
    }
    return { level: index + 1, name: names[index], targetMs, timerWindows, distraction: index === 3 || index >= 5 };
  });
}

export function calculateErrorMs(actualElapsedMs: number, targetMs: number): number {
  if (!Number.isFinite(actualElapsedMs) || actualElapsedMs < 0) {
    throw new RangeError("Elapsed time must be a finite non-negative number.");
  }
  if (!Number.isFinite(targetMs) || targetMs <= 0) {
    throw new RangeError("Target time must be a finite positive number.");
  }
  return Math.abs(actualElapsedMs - targetMs);
}

export function calculateRoundScore(errorMs: number): number {
  if (!Number.isFinite(errorMs) || errorMs < 0) {
    throw new RangeError("Timing error must be a finite non-negative number.");
  }
  return Math.round(10_000 / (1 + errorMs / 25));
}

export function createRoundResult(round: ZeroPointRound, actualElapsedMs: number): ZeroPointRoundResult {
  const errorMs = calculateErrorMs(actualElapsedMs, round.targetMs);
  return {
    level: round.level,
    name: round.name,
    targetMs: round.targetMs,
    actualElapsedMs,
    errorMs,
    score: calculateRoundScore(errorMs)
  };
}

export function isTimerVisible(round: ZeroPointRound, elapsedMs: number): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("Elapsed time must be a non-negative finite number.");
  }
  return round.timerWindows === null || round.timerWindows.some(([startMs, endMs]) => elapsedMs >= startMs && elapsedMs < endMs);
}

export function formatMilliseconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(3);
}
