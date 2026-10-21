import { describe, expect, it } from "vitest";
import {
  calculateErrorMs,
  calculateRoundScore,
  createRoundResult,
  createRoundTargets,
  isTimerVisible,
  ZERO_POINT_TARGET_RANGES,
  ZERO_POINT_ROUNDS
} from "./engine";

describe("Zero Point scoring", () => {
  it("uses absolute timing error and the documented deterministic formula", () => {
    expect(calculateErrorMs(5_030, 5_000)).toBe(30);
    expect(calculateErrorMs(4_970, 5_000)).toBe(30);
    expect(calculateRoundScore(0)).toBe(10_000);
    expect(calculateRoundScore(25)).toBe(5_000);
    expect(calculateRoundScore(75)).toBe(2_500);
  });

  it("creates a result from the actual elapsed time", () => {
    const round = createRoundTargets(() => 0)[0];
    expect(createRoundResult(round, round.targetMs + 25)).toEqual({
      level: 1,
      name: "Rookie",
      targetMs: round.targetMs,
      actualElapsedMs: round.targetMs + 25,
      errorMs: 25,
      score: 5_000
    });
  });

  it("rejects invalid time values rather than returning a plausible score", () => {
    expect(() => calculateErrorMs(Number.NaN, 5_000)).toThrow(RangeError);
    expect(() => calculateErrorMs(1_000, 0)).toThrow(RangeError);
    expect(() => calculateRoundScore(-1)).toThrow(RangeError);
    expect(() => calculateRoundScore(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("Zero Point round configuration", () => {
  it("randomizes all eight targets within their level ranges, including both endpoints", () => {
    for (const sample of [0, 0.123456, 0.5, 0.999999999]) {
      const rounds = createRoundTargets(() => sample);
      expect(rounds).toHaveLength(ZERO_POINT_ROUNDS);
      rounds.forEach((round, index) => {
        const range = ZERO_POINT_TARGET_RANGES[index];
        expect(round.targetMs).toBe(range.minMs + Math.floor(sample * (range.maxMs - range.minMs + 1)));
        expect(Number.isInteger(round.targetMs)).toBe(true);
        expect(round.targetMs).toBeGreaterThanOrEqual(range.minMs);
        expect(round.targetMs).toBeLessThanOrEqual(range.maxMs);
      });
    }
    const low = createRoundTargets(() => 0.123456);
    const high = createRoundTargets(() => 0.876543);
    expect(low.every((round, index) => round.targetMs !== high[index].targetMs)).toBe(true);
    expect(low.some((round) => round.targetMs % 1000 !== 0)).toBe(true);
  });

  it("reveals hidden-level clocks intermittently rather than leaving them permanently hidden", () => {
    const rounds = createRoundTargets(() => 0);
    expect(isTimerVisible(rounds[0], 10_000)).toBe(true);
    for (const round of rounds.slice(1)) {
      expect(round.timerWindows).toHaveLength(6);
      expect(isTimerVisible(round, 0)).toBe(true);
      for (const [start, end] of round.timerWindows!) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        expect(end).toBeLessThan(round.targetMs);
        expect(isTimerVisible(round, start)).toBe(true);
      }
      expect(isTimerVisible(round, round.targetMs - 250)).toBe(true);
      expect(isTimerVisible(round, round.targetMs)).toBe(false);
      expect(isTimerVisible(round, round.targetMs * 0.59)).toBe(false);
    }
    expect(() => isTimerVisible(rounds[0], -1)).toThrow(RangeError);
  });

  it("randomizes clock windows independently from the target numbers", () => {
    // Each non-rookie level consumes one target sample and eleven window samples.
    let call = 0;
    const custom = createRoundTargets(() => {
      const current = call++;
      return current === 0 || (current - 1) % 12 === 0 ? 0.5 : 0.8;
    });
    const baseline = createRoundTargets(() => 0.5);
    custom.forEach((round, index) => {
      expect(round.targetMs).toBe(baseline[index].targetMs);
      if (index > 0) expect(round.timerWindows).not.toEqual(baseline[index].timerWindows);
    });
  });

  it("rejects an invalid random source", () => {
    for (const invalid of [1, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createRoundTargets(() => invalid)).toThrow(RangeError);
    }
  });
});
