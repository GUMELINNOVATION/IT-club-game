import { describe, expect, it } from "vitest";
import {
  advanceTarget,
  calculateScore,
  createInitialStats,
  createTarget,
  getDifficultyLevel,
  getSpawnIntervalMs,
  getTargetSettings,
  isTargetHit,
  recordExpiredTarget,
  recordMissedClick,
  recordTargetHit,
  summarizeStats,
  TARGET_RUSH_DURATIONS,
  TARGET_RUSH_SCORING
} from "./engine";

describe("Target Rush difficulty and spawning", () => {
  it("supports the published round durations", () => {
    expect(TARGET_RUSH_DURATIONS).toEqual([15, 30, 45, 60, 90, 120]);
  });

  it("advances one level for every five successful hits, up to level five", () => {
    expect([0, 4, 5, 9, 10, 15, 20, 100].map(getDifficultyLevel)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(() => getDifficultyLevel(-1)).toThrow(RangeError);
  });

  it("reduces target size and lifetime while increasing speed as difficulty rises", () => {
    const first = getTargetSettings(1);
    const last = getTargetSettings(5);
    expect(last.radius).toBeLessThan(first.radius);
    expect(last.speed).toBeGreaterThan(first.speed);
    expect(last.lifetimeMs).toBeLessThan(first.lifetimeMs);
    expect(getSpawnIntervalMs(5)).toBeLessThan(getSpawnIntervalMs(1));
  });

  it("spawns targets within the playable area and gives them a bounded lifetime", () => {
    const target = createTarget(1, 1_000, { width: 500, height: 300 }, 1, () => 0.5);
    expect(target.x).toBeGreaterThanOrEqual(target.radius + 4);
    expect(target.x).toBeLessThanOrEqual(500 - target.radius - 4);
    expect(target.y).toBeGreaterThanOrEqual(target.radius + 4);
    expect(target.y).toBeLessThanOrEqual(300 - target.radius - 4);
    expect(target.expiresAt - target.spawnedAt).toBe(getTargetSettings(1).lifetimeMs);
  });

  it("rejects invalid game bounds", () => {
    expect(() => createTarget(1, 0, { width: 0, height: 100 }, 1, () => 0.5)).toThrow(RangeError);
    expect(() => createTarget(1, 0, { width: 100, height: 100 }, 1, () => Number.NaN)).toThrow(RangeError);
  });

  it("moves targets and bounces them back within the track", () => {
    const target = createTarget(1, 0, { width: 200, height: 120 }, 1, () => 0.5);
    const moved = advanceTarget({ ...target, x: 175, vx: 100, y: 60, vy: 0 }, 0.2, { width: 200, height: 120 });
    expect(moved.x).toBeLessThanOrEqual(200 - moved.radius);
    expect(moved.vx).toBeLessThan(0);
  });

  it("uses circular hit detection", () => {
    const target = createTarget(1, 0, { width: 400, height: 240 }, 1, () => 0.5);
    expect(isTargetHit(target, target.x + target.radius, target.y)).toBe(true);
    expect(isTargetHit(target, target.x + target.radius + 1, target.y)).toBe(false);
  });
});

describe("Target Rush deterministic scoring", () => {
  it("awards base points, target bonus, and a growing combo bonus", () => {
    const normal = createTarget(1, 0, { width: 400, height: 240 }, 1, () => 0.5);
    const bonus = { ...normal, id: 2, type: "bonus" as const };
    let stats = recordTargetHit(createInitialStats(), normal, 250, 1);
    expect(stats.score).toBe(100);
    stats = recordTargetHit(stats, bonus, 200, 1);
    expect(stats.score).toBe(375);
    expect(stats.successfulHits).toBe(2);
    expect(stats.bonusTargetsHit).toBe(1);
    expect(stats.longestCombo).toBe(2);
  });

  it("applies decoy and missed-click penalties, resets combo, and clamps score at zero", () => {
    const target = createTarget(1, 0, { width: 400, height: 240 }, 1, () => 0.5);
    const decoy = { ...target, type: "decoy" as const };
    let stats = recordTargetHit(createInitialStats(), decoy, 300, 1);
    expect(stats.score).toBe(0);
    expect(stats.decoyHits).toBe(1);
    expect(stats.currentCombo).toBe(0);
    stats = recordMissedClick(stats);
    expect(stats.score).toBe(0);
    expect(stats.missedClicks).toBe(1);
    expect(calculateScore({ ...stats, hitPoints: 0, bonusPoints: 0, comboBonus: 0 })).toBe(0);
  });

  it("tracks accuracy, reaction time, expiration, combo breaks, and best difficulty", () => {
    const target = createTarget(1, 0, { width: 400, height: 240 }, 1, () => 0.5);
    let stats = recordTargetHit(createInitialStats(), target, 200, 2);
    stats = recordMissedClick(stats);
    const withCombo = { ...stats, currentCombo: 1 };
    stats = recordExpiredTarget(withCombo);
    const summary = summarizeStats(stats);
    expect(summary.accuracyPercent).toBe(50);
    expect(summary.averageReactionMs).toBe(200);
    expect(summary.expiredTargets).toBe(1);
    expect(summary.difficultyReached).toBe(2);
    expect(summary.currentCombo).toBe(0);
    expect(TARGET_RUSH_SCORING.missedClickPenalty).toBe(25);
  });

  it("rejects invalid reaction times", () => {
    const target = createTarget(1, 0, { width: 400, height: 240 }, 1, () => 0.5);
    expect(() => recordTargetHit(createInitialStats(), target, -1, 1)).toThrow(RangeError);
  });
});
