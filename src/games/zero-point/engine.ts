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
export const ZERO_POINT_RULESET = "zero-point-v2";

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
  const flickerWindows = (targetMs: number, fraction: number): Array<[number, number]> => [
    [0, 700],
    [Math.round(targetMs * 0.17), Math.round(targetMs * 0.22)],
    [Math.round(targetMs * 0.39), Math.round(targetMs * 0.44)],
    [Math.round(targetMs * 0.62), Math.round(targetMs * 0.67)],
    [Math.round(targetMs * 0.81), Math.round(targetMs * 0.86)],
    [Math.round(targetMs * fraction), Math.round(targetMs * fraction + 450)],
    [Math.max(0, targetMs - 650), Math.max(0, targetMs - 150)]
  ];
  const timeMasterTarget = chooseTarget(TIME_MASTER_RANGE);
  const eventHorizonTarget = chooseTarget(EVENT_HORIZON_RANGE);

  return [
    { level: 1, name: "Rookie", targetMs: 5_000, timerWindows: null, distraction: false },
    { level: 2, name: "Focus", targetMs: 7_500, timerWindows: [[0, 2_500], [4_000, 4_700], [6_750, 7_350]], distraction: false },
    { level: 3, name: "Blind Timing", targetMs: 10_000, timerWindows: [[0, 1_200], [2_400, 3_000], [4_200, 4_800], [7_000, 7_600], [9_200, 9_700]], distraction: false },
    { level: 4, name: "Chaos", targetMs: 12_345, timerWindows: [[0, 700], [1_800, 2_450], [4_400, 5_000], [7_400, 8_000], [10_700, 11_300], [12_050, 12_300]], distraction: true },
    { level: 5, name: "Time Master", targetMs: timeMasterTarget, timerWindows: flickerWindows(timeMasterTarget, 0.53), distraction: false },
    { level: 6, name: "Overdrive", targetMs: 15_250, timerWindows: flickerWindows(15_250, 0.48), distraction: true },
    { level: 7, name: "Singularity", targetMs: 18_000, timerWindows: flickerWindows(18_000, 0.57), distraction: true },
    { level: 8, name: "Event Horizon", targetMs: eventHorizonTarget, timerWindows: flickerWindows(eventHorizonTarget, 0.51), distraction: true }
  ];
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
