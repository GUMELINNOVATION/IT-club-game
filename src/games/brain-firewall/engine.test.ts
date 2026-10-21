import { describe, expect, it } from "vitest";
import { createQuiz, scoreAnswer } from "./engine";
import { QUESTION_BANK, QUIZ_CATEGORIES } from "./questions";

describe("Brain Firewall quiz engine", () => {
  it("provides reviewed questions with complete quiz metadata", () => {
    expect(QUESTION_BANK).toHaveLength(150);
    expect(new Set(QUESTION_BANK.map((question) => question.id)).size).toBe(QUESTION_BANK.length);
    expect(QUESTION_BANK.every((question) => question.status === "reviewed" && question.source && question.timeLimitSeconds > 0)).toBe(true);
    expect(QUIZ_CATEGORIES.every((category) => QUESTION_BANK.some((question) => question.category === category))).toBe(true);
  });

  it("selects only questions from the chosen categories and caps at the available pool", () => {
    const selected = createQuiz(QUESTION_BANK, ["Privacy"], 100, () => 0.4);
    expect(selected).toHaveLength(25);
    expect(selected.every((question) => question.category === "Privacy")).toBe(true);
  });

  it("awards difficulty, speed, and streak points only for correct answers", () => {
    const easy = QUESTION_BANK.find((question) => question.difficulty === "Easy")!;
    const scored = scoreAnswer(easy, easy.answerIndex, 0, 3);
    expect(scored.earnedPoints).toBe(180);
    expect(scoreAnswer(easy, (easy.answerIndex + 1) % 4, 500, 3).earnedPoints).toBe(0);
    expect(scoreAnswer(easy, null, 20_000, 0).correct).toBe(false);
  });

  it("rejects invalid category, question count, random, and answer inputs", () => {
    expect(() => createQuiz(QUESTION_BANK, [], 10)).toThrow(RangeError);
    expect(() => createQuiz(QUESTION_BANK, ["Privacy"], 0)).toThrow(RangeError);
    expect(() => createQuiz(QUESTION_BANK, ["Privacy"], 3, () => 1)).toThrow(RangeError);
    expect(() => scoreAnswer(QUESTION_BANK[0], 5, 0, 0)).toThrow(RangeError);
  });
});
