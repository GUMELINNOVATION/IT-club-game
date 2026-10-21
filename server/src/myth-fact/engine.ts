import { randomInt } from "node:crypto";
import type { Config, Mode, Question } from "./model.js";

export class GameError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function shuffle<T>(items: readonly T[], random: () => number = () => randomInt(0, 0x1000000) / 0x1000000): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid random source.");
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function selectQuestions(pool: Question[], excluded: Set<string>, count: number, config: Config, random?: () => number): Question[] {
  const eligible = shuffle(pool.filter((q) => q.active && q.reviewStatus === "reviewed" && !excluded.has(q.id)
    && q.difficulty <= config.difficulty && config.categories.includes(q.category)), random);
  if (eligible.length < count) throw new GameError(409, `Only ${eligible.length} eligible statements remain after the three-session cooldown. Choose more categories or a higher difficulty, or ask staff to add statements. No questions were repeated.`);
  const selected: Question[] = [];
  const categoryCounts = new Map<string, number>();
  let myths = 0, facts = 0;
  // Balance categories and answers while keeping a random order within each difficulty band.
  for (let i = 0; i < count; i++) {
    const target = config.progressive ? 1 + Math.floor(i / Math.max(1, count - 1) * (config.difficulty - 1)) : config.difficulty;
    const last = i === count - 1;
    const highest = Math.max(...eligible.map((q) => q.difficulty));
    const candidates = eligible.map((question, index) => ({ question, index, cost:
      (last ? Math.abs(question.difficulty - highest) : config.progressive ? Math.abs(question.difficulty - target) : 0) * 6
      + (categoryCounts.get(question.category) ?? 0) * 3 + (question.fact ? facts > myths ? 2 : 0 : myths > facts ? 2 : 0)
    })).sort((a, b) => a.cost - b.cost);
    const chosen = candidates[0];
    selected.push(chosen.question);
    eligible.splice(chosen.index, 1);
    categoryCounts.set(chosen.question.category, (categoryCounts.get(chosen.question.category) ?? 0) + 1);
    if (chosen.question.fact) facts++; else myths++;
  }
  // Occasional Double Trouble pairs use two distinct, related-category statements.
  for (const end of [5, 10]) {
    if (end >= selected.length - 1) continue;
    const category = selected[end - 1].category;
    const match = selected.findIndex((q, index) => index > end && index < selected.length - 1 && q.category === category);
    if (match !== -1) [selected[end], selected[match]] = [selected[match], selected[end]];
  }
  return selected;
}

export function scoreResponse(input: {
  correct: boolean; confidence: number | null; streak: number; responseMs: number;
  timeLimitMs: number; hinted: boolean; final: boolean; pairCorrect: boolean; mode: Mode; config: Config;
}) {
  const { config, correct, confidence, mode } = input;
  const useConfidence = mode === "confidence" && config.confidenceEnabled && confidence !== null;
  if (!correct) return { points: useConfidence ? -config.confidenceWrong[confidence] : 0, bonus: 0 };
  const base = useConfidence ? config.confidenceCorrect[confidence] : config.basePoints;
  const bonus = input.hinted ? 0 :
    Math.round(config.speedBonus * Math.max(0, 1 - input.responseMs / input.timeLimitMs))
    + Math.min(input.streak, config.streakCap) * config.streakBonus
    + (input.final && mode !== "speed" && mode !== "survival" ? config.finalBonus : 0)
    + (input.pairCorrect ? config.doubleBonus : 0);
  return { points: base + bonus, bonus };
}

export function streakTitle(streak: number): string | null {
  return streak >= 10 ? "Digital Genius" : streak >= 8 ? "Myth Destroyer" : streak >= 5 ? "Fact Finder" : streak >= 3 ? "Truth Seeker" : null;
}
