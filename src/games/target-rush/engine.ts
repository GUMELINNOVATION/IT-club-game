export type TargetRushTargetType = "normal" | "bonus" | "combo" | "decoy" | "golden";

export type TargetRushBounds = {
  width: number;
  height: number;
};

export type TargetRushTarget = {
  id: number;
  type: TargetRushTargetType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spawnedAt: number;
  expiresAt: number;
};

export type TargetRushStats = {
  score: number;
  successfulHits: number;
  missedClicks: number;
  expiredTargets: number;
  bonusTargetsHit: number;
  decoyHits: number;
  currentCombo: number;
  longestCombo: number;
  reactionTotalMs: number;
  reactionSamples: number;
  difficultyReached: number;
  hitPoints: number;
  bonusPoints: number;
  comboBonus: number;
  penalties: number;
};

export type TargetRushSummary = TargetRushStats & {
  accuracyPercent: number;
  averageReactionMs: number;
};

export const TARGET_RUSH_RULESET = "target-rush-v1";
export const TARGET_RUSH_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
export const TARGET_RUSH_DIFFICULTY_INTERVAL = 5;
export const TARGET_RUSH_MAX_ACTIVE_TARGETS = 3;
export const TARGET_RUSH_SCORING = {
  normal: 100,
  bonus: 250,
  combo: 100,
  golden: 500,
  decoyPenalty: 150,
  missedClickPenalty: 25,
  comboPerStreak: 25
} as const;

const difficultySettings = [
  { radius: 27, speed: 38, lifetimeMs: 2_200 },
  { radius: 24, speed: 54, lifetimeMs: 1_900 },
  { radius: 21, speed: 72, lifetimeMs: 1_600 },
  { radius: 18, speed: 94, lifetimeMs: 1_350 },
  { radius: 16, speed: 118, lifetimeMs: 1_150 }
] as const;

export function getDifficultyLevel(successfulHits: number): number {
  if (!Number.isInteger(successfulHits) || successfulHits < 0) {
    throw new RangeError("Successful hit count must be a non-negative integer.");
  }
  return Math.min(5, Math.floor(successfulHits / TARGET_RUSH_DIFFICULTY_INTERVAL) + 1);
}

export function getTargetSettings(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > difficultySettings.length) {
    throw new RangeError("Difficulty level must be an integer from 1 to 5.");
  }
  return difficultySettings[level - 1];
}

export function createInitialStats(): TargetRushStats {
  return {
    score: 0,
    successfulHits: 0,
    missedClicks: 0,
    expiredTargets: 0,
    bonusTargetsHit: 0,
    decoyHits: 0,
    currentCombo: 0,
    longestCombo: 0,
    reactionTotalMs: 0,
    reactionSamples: 0,
    difficultyReached: 1,
    hitPoints: 0,
    bonusPoints: 0,
    comboBonus: 0,
    penalties: 0
  };
}

export function createTarget(
  id: number,
  now: number,
  bounds: TargetRushBounds,
  level: number,
  random: () => number = Math.random
): TargetRushTarget {
  if (!Number.isFinite(now) || now < 0) throw new RangeError("Spawn time must be a non-negative number.");
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError("Target area must have positive finite dimensions.");
  }

  const settings = getTargetSettings(level);
  const sample = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random source must return a value from 0 (inclusive) to 1 (exclusive).");
    }
    return value;
  };
  const typeRoll = sample();
  const type: TargetRushTargetType =
    typeRoll < 0.04 ? "golden" :
    typeRoll < 0.16 ? "bonus" :
    typeRoll < 0.30 ? "combo" :
    typeRoll < 0.40 ? "decoy" : "normal";
  const radius = settings.radius;
  const speed = settings.speed;
  const angle = sample() * Math.PI * 2;
  const direction = sample() < 0.5 ? -1 : 1;
  const minX = Math.min(radius + 4, bounds.width / 2);
  const minY = Math.min(radius + 4, bounds.height / 2);

  return {
    id,
    type,
    x: minX + sample() * Math.max(0, bounds.width - 2 * minX),
    y: minY + sample() * Math.max(0, bounds.height - 2 * minY),
    vx: Math.cos(angle) * speed * direction,
    vy: Math.sin(angle) * speed * direction,
    radius,
    spawnedAt: now,
    expiresAt: now + settings.lifetimeMs
  };
}

export function advanceTarget(
  target: TargetRushTarget,
  elapsedSeconds: number,
  bounds: TargetRushBounds
): TargetRushTarget {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("Elapsed time must be a non-negative finite number.");
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError("Target area must have positive dimensions.");
  }

  const minX = Math.min(target.radius, bounds.width / 2);
  const maxX = Math.max(minX, bounds.width - target.radius);
  const minY = Math.min(target.radius, bounds.height / 2);
  const maxY = Math.max(minY, bounds.height - target.radius);
  let x = target.x + target.vx * elapsedSeconds;
  let y = target.y + target.vy * elapsedSeconds;
  let vx = target.vx;
  let vy = target.vy;

  if (x < minX) {
    x = minX + (minX - x);
    vx = Math.abs(vx);
  } else if (x > maxX) {
    x = maxX - (x - maxX);
    vx = -Math.abs(vx);
  }
  if (y < minY) {
    y = minY + (minY - y);
    vy = Math.abs(vy);
  } else if (y > maxY) {
    y = maxY - (y - maxY);
    vy = -Math.abs(vy);
  }

  return { ...target, x, y, vx, vy };
}

export function isTargetHit(target: TargetRushTarget, x: number, y: number): boolean {
  return Math.hypot(target.x - x, target.y - y) <= target.radius;
}

export function recordMissedClick(stats: TargetRushStats): TargetRushStats {
  const next = {
    ...stats,
    missedClicks: stats.missedClicks + 1,
    currentCombo: 0,
    penalties: stats.penalties + TARGET_RUSH_SCORING.missedClickPenalty
  };
  return { ...next, score: calculateScore(next) };
}

export function recordExpiredTarget(stats: TargetRushStats): TargetRushStats {
  return { ...stats, expiredTargets: stats.expiredTargets + 1, currentCombo: 0 };
}

export function recordTargetHit(
  stats: TargetRushStats,
  target: TargetRushTarget,
  reactionMs: number,
  level: number
): TargetRushStats {
  if (!Number.isFinite(reactionMs) || reactionMs < 0) {
    throw new RangeError("Reaction time must be a non-negative finite number.");
  }
  const difficultyReached = Math.max(stats.difficultyReached, level);
  const next = { ...stats, difficultyReached, reactionTotalMs: stats.reactionTotalMs + reactionMs, reactionSamples: stats.reactionSamples + 1 };

  if (target.type === "decoy") {
    next.decoyHits += 1;
    next.currentCombo = 0;
    next.penalties += TARGET_RUSH_SCORING.decoyPenalty;
    next.score = calculateScore(next);
    return next;
  }

  const basePoints = target.type === "golden"
    ? TARGET_RUSH_SCORING.golden
    : target.type === "bonus"
      ? TARGET_RUSH_SCORING.bonus
      : TARGET_RUSH_SCORING.normal;
  next.successfulHits += 1;
  next.currentCombo += 1;
  next.longestCombo = Math.max(next.longestCombo, next.currentCombo);
  next.hitPoints += TARGET_RUSH_SCORING.normal;
  next.bonusPoints += basePoints - TARGET_RUSH_SCORING.normal;
  next.comboBonus += Math.max(0, next.currentCombo - 1) * TARGET_RUSH_SCORING.comboPerStreak;
  if (target.type === "bonus" || target.type === "golden") next.bonusTargetsHit += 1;
  next.score = calculateScore(next);
  return next;
}

export function calculateScore(stats: TargetRushStats): number {
  return Math.max(0, stats.hitPoints + stats.bonusPoints + stats.comboBonus - stats.penalties);
}

export function summarizeStats(stats: TargetRushStats): TargetRushSummary {
  const attempts = stats.successfulHits + stats.decoyHits + stats.missedClicks;
  return {
    ...stats,
    accuracyPercent: attempts === 0 ? 0 : (stats.successfulHits / attempts) * 100,
    averageReactionMs: stats.reactionSamples === 0 ? 0 : stats.reactionTotalMs / stats.reactionSamples
  };
}

export function getSpawnIntervalMs(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new RangeError("Difficulty level must be an integer from 1 to 5.");
  }
  return 900 - (level - 1) * 80;
}
