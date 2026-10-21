import { describe, expect, it } from "vitest";
import {
  calculateErrorMs,
  calculateRoundScore,
  createRoundResult,
  createRoundTargets,
  EVENT_HORIZON_RANGE,
  isTimerVisible,
  TIME_MASTER_RANGE,
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
    expect(createRoundResult(round, 5_025)).toEqual({
      level: 1,
      name: "Rookie",
      targetMs: 5_000,
      actualElapsedMs: 5_025,
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
  it("provides eight challenge levels and two bounded random targets", () => {
    const rounds = createRoundTargets(() => 0.5);
    expect(rounds).toHaveLength(ZERO_POINT_ROUNDS);
    expect(rounds.map(({ targetMs }) => targetMs).slice(0, 4)).toEqual([5_000, 7_500, 10_000, 12_345]);
    expect(rounds[4].targetMs).toBe(11_000);
    expect(rounds[4].targetMs).toBeGreaterThanOrEqual(TIME_MASTER_RANGE.minMs);
    expect(rounds[4].targetMs).toBeLessThanOrEqual(TIME_MASTER_RANGE.maxMs);
    expect(rounds[5].targetMs).toBe(15_250);
    expect(rounds[6].targetMs).toBe(18_000);
    expect(rounds[7].targetMs).toBe(21_500);
    expect(rounds[7].targetMs).toBeGreaterThanOrEqual(EVENT_HORIZON_RANGE.minMs);
    expect(rounds[7].targetMs).toBeLessThanOrEqual(EVENT_HORIZON_RANGE.maxMs);
  });

  it("reveals hidden-level clocks intermittently rather than leaving them permanently hidden", () => {
    const rounds = createRoundTargets(() => 0);
    expect(isTimerVisible(rounds[0], 10_000)).toBe(true);
    expect(isTimerVisible(rounds[1], 2_000)).toBe(true);
    expect(isTimerVisible(rounds[1], 3_000)).toBe(false);
    expect(isTimerVisible(rounds[1], 4_200)).toBe(true);
    expect(isTimerVisible(rounds[1], 5_000)).toBe(false);
    expect(isTimerVisible(rounds[1], 7_000)).toBe(true);
    expect(isTimerVisible(rounds[4], 0)).toBe(true);
    expect(isTimerVisible(rounds[4], 1_000)).toBe(false);
    expect(isTimerVisible(rounds[4], rounds[4].targetMs - 400)).toBe(true);
    expect(isTimerVisible(rounds[7], 1_000)).toBe(false);
    expect(isTimerVisible(rounds[7], rounds[7].targetMs - 400)).toBe(true);
    expect(rounds.slice(1, 4).every((round) => round.timerWindows && round.timerWindows.length >= 3)).toBe(true);
    expect(rounds.slice(4).every((round) => round.timerWindows && round.timerWindows.length >= 5)).toBe(true);
    expect(() => isTimerVisible(rounds[0], -1)).toThrow(RangeError);
  });

  it("rejects an invalid random source", () => {
    expect(() => createRoundTargets(() => 1)).toThrow(RangeError);
  });
});
