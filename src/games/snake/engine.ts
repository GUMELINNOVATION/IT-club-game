export type Cell = { x: number; y: number };
export type Direction = "up" | "down" | "left" | "right";
export type Pickup = Cell & { kind: "food" | "bonus" | "poison" | "shield"; expiresAt?: number };
export type SnakeState = {
  body: Cell[];
  direction: Direction;
  turns: Direction[];
  pickups: Pickup[];
  walls: Cell[];
  tick: number;
  elapsedMs: number;
  score: number;
  earned: number;
  penalties: number;
  foods: number;
  combo: number;
  bestCombo: number;
  lastFoodTick: number;
  shield: boolean;
  level: number;
  over: boolean;
  reason: string;
  notice: string;
  delta: number;
};

export const BOARD = { width: 24, height: 20 };
export const RUN_LIMIT_MS = 180_000;
export const MAX_LEVEL = 12;
export const difficultyLevel = (foods: number, elapsedMs: number) => Math.min(MAX_LEVEL, 1 + Math.floor(foods / 3) + Math.floor(elapsedMs / 20_000));
const vectors: Record<Direction, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const opposites: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function gateCells(): Cell[] {
  return [{ x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 }, { x: 14, y: 14 }, { x: 15, y: 14 }, { x: 16, y: 14 },
    { x: 5, y: 13 }, { x: 5, y: 14 }, { x: 18, y: 5 }, { x: 18, y: 6 }];
}
export function gatePhase(tick: number, level = 1): "safe" | "warning" | "active" {
  const phase = tick % 48;
  const liveAt = Math.max(18, 28 - Math.floor((level - 1) / 2) * 2);
  return phase >= liveAt ? "active" : phase >= liveAt - 6 ? "warning" : "safe";
}
export function dronesAt(tick: number): Cell[] {
  const distance = (tick: number) => {
    const step = Math.floor(tick / 2) % 40;
    return 2 + (step <= 20 ? step : 40 - step);
  };
  return [{ x: distance(tick), y: 2 }, { x: BOARD.width - 1 - distance(tick), y: BOARD.height - 3 }];
}
export function stepDuration(level: number, boost = false): number {
  return Math.round(Math.max(58, 155 - (level - 1) * 9) * (boost ? 0.65 : 1));
}

function vacantCell(state: SnakeState, random: () => number, minimumDistance = 0): Cell | undefined {
  const blocked = [...state.body, ...state.walls, ...state.pickups, ...gateCells()];
  const candidates: Cell[] = [];
  for (let y = 1; y < BOARD.height - 1; y++) {
    if (y === 2 || y === BOARD.height - 3) continue;
    for (let x = 1; x < BOARD.width - 1; x++) {
      const cell = { x, y };
      if (Math.abs(cell.x - state.body[0].x) + Math.abs(cell.y - state.body[0].y) >= minimumDistance &&
        !blocked.some((other) => sameCell(cell, other))) candidates.push(cell);
    }
  }
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
}

function addPickup(state: SnakeState, kind: Pickup["kind"], random: () => number, minimumDistance = 0) {
  const cell = vacantCell(state, random, minimumDistance);
  if (cell) state.pickups.push({ ...cell, kind, ...(kind === "bonus" ? { expiresAt: state.tick + 55 } : {}) });
}

export function createSnake(random: () => number = Math.random): SnakeState {
  const state: SnakeState = {
    body: [{ x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
    direction: "right", turns: [], pickups: [],
    walls: [{ x: 4, y: 6 }, { x: 4, y: 7 }, { x: 19, y: 12 }, { x: 19, y: 13 }],
    tick: 0, elapsedMs: 0, score: 0, earned: 0, penalties: 0, foods: 0, combo: 0,
    bestCombo: 0, lastFoodTick: -100, shield: false, level: 1, over: false,
    reason: "", notice: "Hunt the + pickups. Watch the pulse gates.", delta: 0
  };
  addPickup(state, "food", random);
  addPickup(state, "poison", random);
  addPickup(state, "poison", random);
  return state;
}

export function queueTurn(state: SnakeState, direction: Direction): SnakeState {
  const previous = state.turns.at(-1) ?? state.direction;
  if (state.over || state.turns.length >= 2 || direction === previous || direction === opposites[previous]) return state;
  return { ...state, turns: [...state.turns, direction] };
}

export function advanceSnake(current: SnakeState, boost = false, random: () => number = Math.random): SnakeState {
  if (current.over) return current;
  const state: SnakeState = {
    ...current, body: [...current.body], walls: [...current.walls],
    pickups: current.pickups.filter((pickup) => !pickup.expiresAt || pickup.expiresAt > current.tick + 1),
    turns: current.turns.slice(1), direction: current.turns[0] ?? current.direction,
    tick: current.tick + 1, elapsedMs: current.elapsedMs + stepDuration(current.level, boost)
  };
  if (state.elapsedMs >= RUN_LIMIT_MS) {
    return { ...state, over: true, reason: "Three minutes survived. Arena conquered!", notice: "SURVIVAL COMPLETE", delta: 0 };
  }
  const end = (reason: string) => ({ ...state, over: true, reason, notice: reason, delta: 0 });
  const vector = vectors[state.direction];
  const head = { x: state.body[0].x + vector.x, y: state.body[0].y + vector.y };
  if (head.x < 0 || head.x >= BOARD.width || head.y < 0 || head.y >= BOARD.height) return end("Boundary collision");
  const pickup = state.pickups.find((item) => sameCell(head, item));
  const growing = pickup?.kind === "food" || pickup?.kind === "bonus";
  const bodyToCheck = growing ? state.body : state.body.slice(0, -1);
  if (bodyToCheck.some((cell) => sameCell(cell, head))) return end("You crossed your own trail");
  if (state.walls.some((cell) => sameCell(cell, head))) return end("Firewall collision");

  const applyScore = (amount: number, notice: string) => {
    const nextScore = Math.max(0, state.score + amount);
    state.delta = nextScore - state.score;
    if (amount > 0) state.earned += amount;
    else state.penalties += -state.delta;
    state.score = nextScore;
    state.notice = notice;
  };
  if (boost) applyScore(-5, "BOOST · −5 / STEP");
   const hitGate = gatePhase(state.tick, state.level) === "active" && gateCells().some((cell) => sameCell(cell, head));
  const hitDrone = dronesAt(state.tick).some((cell) => sameCell(cell, head));
  if (hitGate || hitDrone) {
    if (!state.shield) return end(hitGate ? "A live pulse gate caught you" : "Sentinel collision");
    state.shield = false;
    applyScore(-100, "SHIELD SPENT · −100");
  }
  state.body.unshift(head);
  if (!growing) state.body.pop();
  if (pickup) {
    state.pickups = state.pickups.filter((item) => item !== pickup);
    if (pickup.kind === "food" || pickup.kind === "bonus") {
      state.combo = state.tick - state.lastFoodTick <= 60 ? Math.min(5, state.combo + 1) : 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.lastFoodTick = state.tick;
      const points = (pickup.kind === "bonus" ? 350 : 100) * state.combo;
      applyScore(points, `${pickup.kind === "bonus" ? "GOLD DATA" : "DATA"} +${points} · COMBO ×${state.combo}`);
      state.foods++;
      if (pickup.kind === "food") addPickup(state, "food", random);
      if (state.foods % 5 === 0 && !state.pickups.some((item) => item.kind === "bonus")) addPickup(state, "bonus", random);
      if (state.foods % 6 === 0 && !state.shield && !state.pickups.some((item) => item.kind === "shield")) addPickup(state, "shield", random);
    } else if (pickup.kind === "poison") {
      applyScore(-150, "CORRUPTED DATA · −150 · TAIL −2");
      state.combo = 0;
      state.body = state.body.slice(0, Math.max(3, state.body.length - 2));
      addPickup(state, "poison", random);
    } else {
      state.shield = true;
      state.notice = "SHIELD ONLINE · ONE GATE OR SENTINEL HIT";
      state.delta = 0;
    }
  }
  if (state.tick - state.lastFoodTick > 60) state.combo = 0;
  const nextLevel = difficultyLevel(state.foods, state.elapsedMs);
  if (nextLevel > state.level) {
    state.level = nextLevel;
    // Reserve patrol lanes and give at least five moves' distance from newly spawned hazards.
    for (let index = 0; index < (nextLevel >= 6 ? 2 : 1) && state.walls.length < 24; index++) {
      const cell = vacantCell(state, random, 5);
      if (cell) state.walls.push(cell);
    }
    const corruptionTarget = Math.min(5, 2 + Math.floor((nextLevel - 1) / 3));
    const missing = corruptionTarget - state.pickups.filter((item) => item.kind === "poison").length;
    for (let index = 0; index < missing; index++) addPickup(state, "poison", random, 5);
    state.notice = `LEVEL ${state.level} · GRID PRESSURE RISING`;
  }
  if (!state.pickups.some((item) => item.kind === "food")) return end("All data collected. Arena cleared!");
  return state;
}
