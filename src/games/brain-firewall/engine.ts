import type { Question, QuizCategory } from "./questions";

export type QuizTopic = QuizCategory | "random";

export function createTopicQuiz(questionBank: Question[], topic: QuizTopic, count: number, random: () => number = Math.random): Question[] {
  if (topic !== "random") return createQuiz(questionBank, [topic], count, random);
  const categories = [...new Set(questionBank.map((question) => question.category))];
  const shuffled = createQuiz(questionBank, categories, questionBank.length, random);
  // Distribute the mixed run across topics rather than letting the largest pool dominate.
  const buckets = new Map<QuizCategory, Question[]>();
  for (const question of shuffled) {
    const bucket = buckets.get(question.category) ?? [];
    bucket.push(question);
    buckets.set(question.category, bucket);
  }
  const mixed: Question[] = [];
  while (mixed.length < shuffled.length) {
    for (const bucket of buckets.values()) {
      const question = bucket.pop();
      if (question) mixed.push(question);
    }
  }
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Question count must be a positive integer.");
  return mixed.slice(0, count);
}

export function shuffleAnswers(question: Question, random: () => number = Math.random): Question {
  const choices = question.options.map((option, index) => ({ option, correct: index === question.answerIndex }));
  for (let index = choices.length - 1; index > 0; index--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("Invalid random source.");
    const swapIndex = Math.floor(sample * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return { ...question, options: choices.map(({ option }) => option) as Question["options"], answerIndex: choices.findIndex(({ correct }) => correct) };
}

export type QuizAnswer = {
  questionId: string;
  selectedIndex: number | null;
  correct: boolean;
  earnedPoints: number;
  responseMs: number;
};

export function createQuiz(
  questionBank: Question[],
  categories: QuizCategory[],
  requestedCount: number,
  random: () => number = Math.random
): Question[] {
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new RangeError("Question count must be a positive integer.");
  }
  if (!categories.length) throw new RangeError("Choose at least one quiz category.");
  const pool = questionBank.filter((question) => categories.includes(question.category));
  if (!pool.length) throw new RangeError("No questions are available for the selected categories.");
  for (let index = pool.length - 1; index > 0; index--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("Random source must return a value from 0 (inclusive) to 1 (exclusive).");
    }
    const swapIndex = Math.floor(sample * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(requestedCount, pool.length));
}

export function scoreAnswer(
  question: Question,
  selectedIndex: number | null,
  responseMs: number,
  currentStreak: number
): QuizAnswer {
  if (!Number.isFinite(responseMs) || responseMs < 0) {
    throw new RangeError("Response time must be a non-negative finite number.");
  }
  if (!Number.isInteger(currentStreak) || currentStreak < 0) {
    throw new RangeError("Current streak must be a non-negative integer.");
  }
  if (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length)) {
    throw new RangeError("Selected answer is outside the available options.");
  }
  const correct = selectedIndex === question.answerIndex;
  if (!correct) return { questionId: question.id, selectedIndex, correct, earnedPoints: 0, responseMs };
  const base = question.difficulty === "Easy" ? 100 : question.difficulty === "Medium" ? 150 : 200;
  const speedBonus = Math.round(Math.max(0, 1 - responseMs / (question.timeLimitSeconds * 1_000)) * 50);
  const streakBonus = Math.min(currentStreak, 10) * 10;
  return {
    questionId: question.id,
    selectedIndex,
    correct,
    earnedPoints: base + speedBonus + streakBonus,
    responseMs
  };
}
