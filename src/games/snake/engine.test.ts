import { describe, expect, it } from "vitest";
import { advanceSnake, BOARD, createSnake, dronesAt, gateCells, gatePhase, queueTurn, RUN_LIMIT_MS, sameCell, stepDuration, type SnakeState } from "./engine";

function run(overrides: Partial<SnakeState> = {}): SnakeState {
  return {
    ...createSnake(() => .5),
    body: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }],
    walls: [], pickups: [{ x: 20, y: 10, kind: "food" }], ...overrides
  };
}

describe("Neon Snake movement and collision rules", () => {
  it("uses a two-turn buffer without allowing a reversal or extra queued inputs", () => {
    const initial = run();
    expect(queueTurn(initial, "left")).toBe(initial);
    const first = queueTurn(initial, "up");
    expect(queueTurn(first, "down")).toBe(first);
    const second = queueTurn(first, "left");
    expect(queueTurn(second, "down")).toBe(second);
    const next = advanceSnake(second);
    expect(next.body[0]).toEqual({ x: 10, y: 9 });
    expect(advanceSnake(next).body[0]).toEqual({ x: 9, y: 9 });
  });

  it("allows entering the vacating tail but not a growing tail", () => {
    const loop = run({ body: [{ x: 2, y: 10 }, { x: 2, y: 11 }, { x: 3, y: 11 }, { x: 3, y: 10 }] });
    expect(advanceSnake(loop).over).toBe(false);
    expect(advanceSnake({ ...loop, pickups: [{ x: 3, y: 10, kind: "food" }] }).over).toBe(true);
  });

  it("ends runs on boundaries, firewalls, and non-tail body collisions", () => {
    expect(advanceSnake(run({ body: [{ x: BOARD.width - 1, y: 10 }] })).reason).toBe("Boundary collision");
    expect(advanceSnake(run({ walls: [{ x: 11, y: 10 }] })).reason).toBe("Firewall collision");
    expect(advanceSnake(run({ body: [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 11, y: 11 }, { x: 11, y: 10 }, { x: 12, y: 10 }] })).reason)
      .toBe("You crossed your own trail");
  });

  it("distinguishes warning gates from live gates and consumes shields once", () => {
    const nearGate = run({ tick: 21, body: [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }] });
    expect(gatePhase(22)).toBe("warning");
    expect(advanceSnake(nearGate).over).toBe(false);
    const active = { ...nearGate, tick: 27 };
    expect(advanceSnake(active).reason).toBe("A live pulse gate caught you");
    const protectedRun = advanceSnake({ ...active, shield: true, score: 300 });
    expect(protectedRun).toMatchObject({ over: false, shield: false, score: 200, penalties: 100 });
    expect(advanceSnake(protectedRun).over).toBe(true);
  });

  it("collides with patrolling sentinels and keeps their positions in bounds", () => {
    const state = run({ body: [{ x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 3 }] });
    expect(advanceSnake(state).reason).toBe("Sentinel collision");
    expect(advanceSnake({ ...state, shield: true }).over).toBe(false);
    for (let tick = 0; tick < 200; tick++) {
      expect(dronesAt(tick).every((cell) => cell.x >= 0 && cell.x < BOARD.width && cell.y >= 0 && cell.y < BOARD.height)).toBe(true);
    }
  });

  it("does not protect against walls or body collisions with a shield", () => {
    expect(advanceSnake(run({ shield: true, walls: [{ x: 11, y: 10 }] })).over).toBe(true);
  });
});

describe("Neon Snake pickups, difficulty, and score accounting", () => {
  it("grows on food, awards positive points, and respawns without mutating the input", () => {
    const original = run({ pickups: [{ x: 11, y: 10, kind: "food" }] });
    const snapshot = JSON.stringify(original);
    const next = advanceSnake(original, false, () => .2);
    expect(next).toMatchObject({ score: 100, delta: 100, earned: 100, foods: 1, combo: 1 });
    expect(next.body).toHaveLength(5);
    expect(next.pickups.some((pickup) => pickup.kind === "food")).toBe(true);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("multiplies gold points by a capped combo and expires old combos", () => {
    const gold = run({ combo: 5, lastFoodTick: 0, pickups: [{ x: 11, y: 10, kind: "bonus", expiresAt: 20 }, { x: 20, y: 10, kind: "food" }] });
    expect(advanceSnake(gold)).toMatchObject({ score: 1750, combo: 5, bestCombo: 5 });
    expect(advanceSnake({ ...gold, lastFoodTick: -70 })).toMatchObject({ score: 350, combo: 1 });
  });

  it("subtracts poison points, shortens the tail, and resets combos", () => {
    const poisoned = run({ score: 400, combo: 4, body: Array.from({ length: 8 }, (_, index) => ({ x: 10 - index, y: 10 })), pickups: [{ x: 11, y: 10, kind: "poison" }, { x: 20, y: 10, kind: "food" }] });
    const next = advanceSnake(poisoned);
    expect(next).toMatchObject({ score: 250, delta: -150, penalties: 150, combo: 0 });
    expect(next.body).toHaveLength(6);
    expect(next.pickups.filter((pickup) => pickup.kind === "poison")).toHaveLength(1);
  });

  it("clamps losses at zero and never shrinks below three segments", () => {
    const next = advanceSnake(run({ score: 50, pickups: [{ x: 11, y: 10, kind: "poison" }, { x: 20, y: 10, kind: "food" }] }));
    expect(next).toMatchObject({ score: 0, penalties: 50, delta: -50 });
    expect(next.body).toHaveLength(3);
  });

  it("increases speed every four pickups and caps it at level eight", () => {
    const fourth = advanceSnake(run({ foods: 3, pickups: [{ x: 11, y: 10, kind: "food" }] }), false, () => .99);
    expect(fourth.level).toBe(2);
    expect(fourth.walls).toHaveLength(1);
    const wall = fourth.walls[0];
    expect(Math.abs(wall.x - fourth.body[0].x) + Math.abs(wall.y - fourth.body[0].y)).toBeGreaterThanOrEqual(5);
    expect(stepDuration(2)).toBeLessThan(stepDuration(1));
    expect(advanceSnake(run({ foods: 100, pickups: [{ x: 11, y: 10, kind: "food" }] })).level).toBe(8);
    expect(stepDuration(8)).toBe(72);
  });

  it("spawns timed gold and shields at the documented pickup milestones", () => {
    const fifth = advanceSnake(run({ foods: 4, pickups: [{ x: 11, y: 10, kind: "food" }] }));
    expect(fifth.pickups.find((pickup) => pickup.kind === "bonus")?.expiresAt).toBe(fifth.tick + 55);
    const sixth = advanceSnake(run({ foods: 5, pickups: [{ x: 11, y: 10, kind: "food" }] }));
    expect(sixth.pickups.some((pickup) => pickup.kind === "shield")).toBe(true);
    expect(advanceSnake(run({ pickups: [{ x: 11, y: 10, kind: "shield" }, { x: 20, y: 10, kind: "food" }] })).shield).toBe(true);
  });

  it("expires bonus pickups before they can be collected", () => {
    const next = advanceSnake(run({ tick: 54, pickups: [{ x: 11, y: 10, kind: "bonus", expiresAt: 55 }, { x: 20, y: 10, kind: "food" }] }));
    expect(next.score).toBe(0);
    expect(next.pickups.some((pickup) => pickup.kind === "bonus")).toBe(false);
  });

  it("charges a boost penalty and maintains earned minus lost equals score", () => {
    const next = advanceSnake(run({ score: 200, earned: 200, pickups: [{ x: 11, y: 10, kind: "food" }] }), true);
    expect(next).toMatchObject({ score: 295, earned: 300, penalties: 5, elapsedMs: stepDuration(1, true) });
    expect(next.earned - next.penalties).toBe(next.score);
    expect(stepDuration(1, true)).toBeLessThan(stepDuration(1));
  });

  it("never spawns pickups on a snake, wall, gate, or sentinel lane", () => {
    for (const randomValue of [0, .1, .5, .999999]) {
      const state = createSnake(() => randomValue);
      state.pickups.forEach((pickup, index) => {
        expect([...state.body, ...state.walls, ...gateCells(), ...state.pickups.slice(0, index)].some((cell) => sameCell(cell, pickup))).toBe(false);
        expect([2, BOARD.height - 3]).not.toContain(pickup.y);
      });
    }
  });

  it("finishes a survival run after three minutes and freezes finished states", () => {
    const next = advanceSnake(run({ elapsedMs: RUN_LIMIT_MS - 1 }));
    expect(next.over).toBe(true);
    expect(next.reason).toContain("Arena conquered");
    expect(advanceSnake(next)).toBe(next);
  });
});
