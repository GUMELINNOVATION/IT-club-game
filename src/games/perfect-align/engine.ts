export type AlignLevel = {
  level: number;
  name: string;
  speed: number;
  targetWidth: number;
  variableSpeed: boolean;
  movingTarget: boolean;
  attemptsAllowed: number;
};

export type AlignStage = {
  level: AlignLevel;
  stage: number;
  stagesInLevel: number;
  targetCenter: number;
  markerPhase: number;
  targetPhase: number;
};

export type AlignResult = {
  level: number;
  name: string;
  stage: number;
  targetCenter: number;
  targetWidth: number;
  markerPosition: number;
  errorPercent: number;
  withinTarget: boolean;
  elapsedMs: number;
  attempt: number;
};

export const PERFECT_ALIGN_RULESET = "perfect-align-v1";
export const ALIGN_LEVELS: AlignLevel[] = [
  { level: 1, name: "Introduction", speed: 0.18, targetWidth: 0.12, variableSpeed: false, movingTarget: false, attemptsAllowed: 3 },
  { level: 2, name: "Precision", speed: 0.27, targetWidth: 0.08, variableSpeed: false, movingTarget: false, attemptsAllowed: 3 },
  { level: 3, name: "Reflex", speed: 0.38, targetWidth: 0.05, variableSpeed: false, movingTarget: false, attemptsAllowed: 3 },
  { level: 4, name: "Chaos", speed: 0.48, targetWidth: 0.03, variableSpeed: true, movingTarget: true, attemptsAllowed: 3 },
  { level: 5, name: "Perfect Master", speed: 0.62, targetWidth: 0.01, variableSpeed: true, movingTarget: true, attemptsAllowed: 3 }
];

export function createAlignStage(
  levelIndex: number,
  stage: number,
  stagesInLevel: number,
  random: () => number = Math.random
): AlignStage {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= ALIGN_LEVELS.length) {
    throw new RangeError("Level index must refer to one of the five configured levels.");
  }
  if (!Number.isInteger(stage) || stage < 1 || !Number.isInteger(stagesInLevel) || stage > stagesInLevel) {
    throw new RangeError("Stage must be within the configured stage count.");
  }
  const sample = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random source must return a value from 0 (inclusive) to 1 (exclusive).");
    }
    return value;
  };
  const level = ALIGN_LEVELS[levelIndex];
  const halfZone = level.targetWidth / 2;
  return {
    level,
    stage,
    stagesInLevel,
    targetCenter: halfZone + sample() * (1 - level.targetWidth),
    markerPhase: sample(),
    targetPhase: sample()
  };
}

function triangleWave(value: number): number {
  const wrapped = ((value % 2) + 2) % 2;
  return wrapped <= 1 ? wrapped : 2 - wrapped;
}

export function markerPositionAt(stage: AlignStage, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("Elapsed time must be a non-negative finite number.");
  }
  const seconds = elapsedMs / 1_000;
  const speedFactor = stage.level.variableSpeed
    ? 1 + 0.24 * Math.sin(seconds * 2.3 + stage.markerPhase * Math.PI * 2)
    : 1;
  const progress = stage.markerPhase + seconds * stage.level.speed * speedFactor;
  return triangleWave(progress);
}

export function targetCenterAt(stage: AlignStage, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("Elapsed time must be a non-negative finite number.");
  }
  if (!stage.level.movingTarget) return stage.targetCenter;
  const seconds = elapsedMs / 1_000;
  const availableTravel = Math.max(0, 1 - stage.level.targetWidth);
  const oscillation = Math.sin(seconds * 0.65 + stage.targetPhase * Math.PI * 2) * Math.min(0.11, availableTravel / 2);
  return Math.max(stage.level.targetWidth / 2, Math.min(1 - stage.level.targetWidth / 2, stage.targetCenter + oscillation));
}

export function evaluateAlignment(stage: AlignStage, elapsedMs: number, attempt: number): AlignResult {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > stage.level.attemptsAllowed) {
    throw new RangeError("Attempt number is outside the allowed attempt count.");
  }
  const markerPosition = markerPositionAt(stage, elapsedMs);
  const targetCenter = targetCenterAt(stage, elapsedMs);
  const distance = Math.abs(markerPosition - targetCenter);
  const withinTarget = distance <= stage.level.targetWidth / 2 + 1e-12;
  return {
    level: stage.level.level,
    name: stage.level.name,
    stage: stage.stage,
    targetCenter,
    targetWidth: stage.level.targetWidth,
    markerPosition,
    errorPercent: distance * 100,
    withinTarget,
    elapsedMs,
    attempt
  };
}

export function alignmentPoints(result: AlignResult): number {
  if (!result.withinTarget) return 0;
  const zoneHalfWidth = result.targetWidth / 2;
  const remainingPrecision = Math.max(0, 1 - result.errorPercent / (zoneHalfWidth * 100));
  return Math.round(1_000 + remainingPrecision * 1_000);
}

export function alignmentPrecisionPercent(result: AlignResult): number {
  return Math.max(0, Math.min(100, (1 - result.errorPercent / (result.targetWidth / 2)) * 100));
}
