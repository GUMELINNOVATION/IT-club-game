import { describe, expect, it } from "vitest";
import { createQuiz, createTopicQuiz, scoreAnswer, shuffleAnswers } from "./engine";
import { QUESTION_BANK, QUIZ_CATEGORIES } from "./questions";

describe("Brain Firewall quiz engine", () => {
  it("provides reviewed questions with complete quiz metadata", () => {
    expect(QUESTION_BANK).toHaveLength(210);
    expect(new Set(QUESTION_BANK.map((question) => question.id)).size).toBe(QUESTION_BANK.length);
    expect(QUESTION_BANK.every((question) => question.status === "reviewed" && question.source && question.timeLimitSeconds > 0)).toBe(true);
    expect(QUIZ_CATEGORIES.every((category) => QUESTION_BANK.some((question) => question.category === category))).toBe(true);
  });

  it("supports a full twenty-question run for every category with unique, well-formed questions", () => {
    expect(new Set(QUESTION_BANK.map((question) => question.question)).size).toBe(QUESTION_BANK.length);
    for (const category of QUIZ_CATEGORIES) {
      const selected = createTopicQuiz(QUESTION_BANK, category, 20, () => .37);
      expect(selected).toHaveLength(20);
      expect(new Set(selected.map((question) => question.id)).size).toBe(20);
      expect(selected.every((question) => question.category === category)).toBe(true);
      for (const question of selected) {
        expect(new Set(question.options).size).toBe(4);
        expect(question.options[question.answerIndex]).toBeTruthy();
        expect(question.explanation.length).toBeGreaterThan(20);
      }
    }
  });

  it("balances Random Mix across all nine topics without duplicate questions or mutating the bank", () => {
    const before = QUESTION_BANK.map((question) => question.id);
    for (const count of [10, 20]) {
      const selected = createTopicQuiz(QUESTION_BANK, "random", count, () => .23);
      expect(selected).toHaveLength(count);
      expect(new Set(selected.map((question) => question.id)).size).toBe(count);
      const counts = QUIZ_CATEGORIES.map((category) => selected.filter((question) => question.category === category).length);
      expect(Math.min(...counts)).toBeGreaterThan(0);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    expect(QUESTION_BANK.map((question) => question.id)).toEqual(before);
    expect(createTopicQuiz(QUESTION_BANK, "Frontend", 10, () => .1).map((question) => question.id))
      .not.toEqual(createTopicQuiz(QUESTION_BANK, "Frontend", 10, () => .8).map((question) => question.id));
  });

  it("shuffles answer positions while preserving the correct answer and source question", () => {
    for (const question of QUESTION_BANK) {
      const original = [...question.options];
      const shuffled = shuffleAnswers(question, () => 0);
      expect(shuffled.options[shuffled.answerIndex]).toBe(question.options[question.answerIndex]);
      expect([...shuffled.options].sort()).toEqual([...original].sort());
      expect(question.options).toEqual(original);
      expect(shuffled.answerIndex).not.toBe(question.answerIndex);
      expect(scoreAnswer(shuffled, shuffled.answerIndex, 500, 0).correct).toBe(true);
    }
    expect(() => shuffleAnswers(QUESTION_BANK[0], () => 1)).toThrow(RangeError);
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
    expect(() => createTopicQuiz(QUESTION_BANK, "random", 0)).toThrow(RangeError);
    expect(() => createTopicQuiz(QUESTION_BANK, "random", 10, () => Number.NaN)).toThrow(RangeError);
  });
});
