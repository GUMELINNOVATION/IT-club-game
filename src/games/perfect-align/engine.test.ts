import { describe, expect, it } from "vitest";
import {
  ALIGN_LEVELS,
  alignmentPoints,
  alignmentPrecisionPercent,
  createAlignStage,
  evaluateAlignment,
  markerPositionAt,
  targetCenterAt
} from "./engine";

describe("Perfect Align levels and deterministic motion", () => {
  it("configures five increasingly difficult target widths", () => {
    expect(ALIGN_LEVELS.map(({ targetWidth }) => targetWidth)).toEqual([0.12, 0.08, 0.05, 0.03, 0.01]);
    expect(ALIGN_LEVELS.every(({ attemptsAllowed }) => attemptsAllowed === 3)).toBe(true);
  });

  it("returns repeatable marker positions and keeps the marker on the track", () => {
    const stage = createAlignStage(3, 1, 1, () => 0.35);
    const first = markerPositionAt(stage, 2_400);
    expect(markerPositionAt(stage, 2_400)).toBe(first);
    for (let time = 0; time < 30_000; time += 125) {
      const position = markerPositionAt(stage, time);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(1);
    }
  });

  it("keeps fixed targets still and bounds advanced moving target zones", () => {
    const fixed = createAlignStage(1, 1, 1, () => 0.4);
    expect(targetCenterAt(fixed, 0)).toBe(targetCenterAt(fixed, 10_000));
    const moving = createAlignStage(4, 1, 1, () => 0.4);
    for (let time = 0; time < 60_000; time += 500) {
      const center = targetCenterAt(moving, time);
      expect(center).toBeGreaterThanOrEqual(moving.level.targetWidth / 2);
      expect(center).toBeLessThanOrEqual(1 - moving.level.targetWidth / 2);
    }
  });

  it("accepts positions exactly on the published zone boundary and rejects positions outside", () => {
    const level = ALIGN_LEVELS[0];
    const stage = createAlignStage(0, 1, 1, () => 0.5);
    const boundaryPosition = stage.targetCenter + level.targetWidth / 2;
    const boundaryElapsedMs = (boundaryPosition - stage.markerPhase) / level.speed * 1_000;
    const boundary = evaluateAlignment(stage, boundaryElapsedMs, 1);
    expect(boundary.markerPosition).toBeCloseTo(boundaryPosition, 8);
    expect(boundary.withinTarget).toBe(true);
    expect(alignmentPoints(boundary)).toBeGreaterThan(0);

    const outsidePosition = boundaryPosition + 0.001;
    const outsideElapsedMs = (outsidePosition - stage.markerPhase) / level.speed * 1_000;
    const outside = evaluateAlignment(stage, outsideElapsedMs, 1);
    expect(outside.withinTarget).toBe(false);
    expect(alignmentPoints(outside)).toBe(0);
  });

  it("does not award a win unless the marker is within published boundaries", () => {
    const stage = createAlignStage(2, 1, 1, () => 0.5);
    const result = evaluateAlignment(stage, 1_000, 1);
    if (!result.withinTarget) expect(alignmentPoints(result)).toBe(0);
    expect(alignmentPrecisionPercent(result)).toBeGreaterThanOrEqual(0);
    expect(alignmentPrecisionPercent(result)).toBeLessThanOrEqual(100);
  });

  it("rejects invalid level, stage, time, and attempt inputs", () => {
    expect(() => createAlignStage(5, 1, 1, () => 0.5)).toThrow(RangeError);
    expect(() => createAlignStage(0, 2, 1, () => 0.5)).toThrow(RangeError);
    expect(() => markerPositionAt(createAlignStage(0, 1, 1, () => 0.5), -1)).toThrow(RangeError);
    expect(() => evaluateAlignment(createAlignStage(0, 1, 1, () => 0.5), 100, 4)).toThrow(RangeError);
    expect(() => createAlignStage(0, 1, 1, () => Number.NaN)).toThrow(RangeError);
  });
});
