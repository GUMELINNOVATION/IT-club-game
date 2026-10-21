import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { createArena } from "../arena.js";
import { allQuestions, currentConfiguration, modes, type Config, type Mode, type Question } from "./model.js";
import { GameError, scoreResponse, selectQuestions, streakTitle } from "./engine.js";

export const startSchema = z.object({
  participantId: z.uuid(), nickname: z.string().trim().min(1).max(24), mode: z.enum(modes),
  difficulty: z.number().int().min(1).max(4), categories: z.array(z.string()).min(1).max(7),
  team: z.object({ name: z.string().trim().min(2).max(40), captain: z.string().trim().min(1).max(24), members: z.array(z.string().trim().min(1).max(24)).max(11) }).optional(),
  challengeId: z.string().max(80).optional(), entryCode: z.string().trim().max(80).optional()
}).strict();
export type StartInput = z.infer<typeof startSchema>;
type Attempt = {
  id: string; owner: string; identity: string; participant_id: string; team_id: string | null; roster: string | null;
  mode: Mode; config_id: number; config: string; board_key: string; challenge_id: string | null; challenge_version: number | null;
  status: "countdown" | "question" | "reveal" | "completed" | "abandoned";
  cursor: number; started_at: number; deadline: number | null; finished_at: number | null; score: number;
  correct: number; incorrect: number; streak: number; best_streak: number; lives: number; hint_used: number; total_response_ms: number; record: number;
};
type AttemptQuestion = {
  ordinal: number; question_id: string; version: number; content: string; shown_at: number | null; deadline: number | null;
  answered_at: number | null; answer: number | null; confidence: number | null; correct: number | null;
  points: number | null; bonus: number | null; response_ms: number | null; hinted: number; pair_id: number | null; final: number;
};
export type Challenge = { id: string; title: string; version: number; question_refs: string; config: string; participation: "solo" | "team" | "both"; registration_open: number; published: number; reveal_after_close: number };
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createMythService(db: Database.Database, publish: () => void, clock = Date.now) {
  const arena = createArena(db);
  const attempt = (id: string) => {
    const row = db.prepare("SELECT * FROM mf_attempts WHERE id = ?").get(id) as Attempt | undefined;
    if (!row) throw new GameError(404, "Attempt not found.");
    return row;
  };
  const own = (id: string, owner: string) => { const row = attempt(id); if (row.owner !== owner) throw new GameError(403, "This attempt belongs to a different session."); return row; };
  const questions = (id: string) => db.prepare("SELECT * FROM mf_attempt_questions WHERE attempt_id = ? ORDER BY ordinal").all(id) as AttemptQuestion[];
  const current = (row: Attempt) => db.prepare("SELECT * FROM mf_attempt_questions WHERE attempt_id = ? AND ordinal = ?").get(row.id, row.cursor) as AttemptQuestion;
  const mayReveal = (row: Attempt) => {
    if (!row.challenge_id) return true;
    const challenge = db.prepare("SELECT * FROM mf_challenges WHERE id = ?").get(row.challenge_id) as Challenge;
    return !challenge.reveal_after_close || !challenge.registration_open;
  };
  const leaderboard = (filters: { mode?: string; participation?: string; boardKey?: string; challengeId?: string } = {}) => {
    const config = currentConfiguration(db).config;
    if (!config.leaderboardVisible) return { boards: [], entries: [], visible: false, updatedAt: new Date(clock()).toISOString() };
    const clauses = ["a.status = 'completed'", "COALESCE(json_extract(a.config, '$.leaderboardVisible'), 0) = 1"];
    const values: string[] = [];
    for (const [column, value] of [["a.mode", filters.mode], ["a.board_key", filters.boardKey], ["a.challenge_id", filters.challengeId]] as const) {
      if (value) { clauses.push(`${column} = ?`); values.push(value); }
    }
    if (filters.participation === "team") clauses.push("a.team_id IS NOT NULL");
    if (filters.participation === "solo") clauses.push("a.team_id IS NULL");
    const rows = db.prepare(`SELECT a.*, g.challenger FROM mf_attempts a JOIN game_sessions g ON g.id = a.id WHERE ${clauses.join(" AND ")}
      ORDER BY CASE WHEN a.mode = 'survival' THEN a.correct ELSE a.score END DESC, a.score DESC, a.total_response_ms ASC, a.finished_at ASC, a.id ASC`).all(...values) as (Attempt & { challenger: string })[];
    const boards = new Map<string, { key: string; mode: Mode; participation: string; challengeId: string | null; version: number | null; configId: number }>();
    const seen = new Set<string>();
    const ranks = new Map<string, number>();
    const entries = [];
    for (const row of rows) {
      boards.set(row.board_key, { key: row.board_key, mode: row.mode, participation: row.team_id ? "team" : "solo", challengeId: row.challenge_id, version: row.challenge_version, configId: row.config_id });
      const identity = `${row.board_key}:${row.identity}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const rank = (ranks.get(row.board_key) ?? 0) + 1;
      ranks.set(row.board_key, rank);
      if (rank > 50) continue;
      entries.push({ id: row.id, rank, challenger: row.challenger, score: row.score, accuracy: Math.round(1000 * row.correct / Math.max(1, row.correct + row.incorrect)) / 10,
        correct: row.correct, incorrect: row.incorrect, longestStreak: row.best_streak, completionMs: row.total_response_ms,
        elapsedMs: (row.finished_at ?? row.started_at) - row.started_at, averageMs: Math.round(row.total_response_ms / Math.max(1, row.correct + row.incorrect)),
        completedAt: row.finished_at, mode: row.mode, participation: row.team_id ? "team" : "solo", boardKey: row.board_key, challengeVersion: row.challenge_version, configId: row.config_id });
    }
    return { boards: [...boards.values()], entries, visible: true, updatedAt: new Date(clock()).toISOString() };
  };
  const finish = (row: Attempt) => {
    if (row.status === "completed" || row.status === "abandoned") return;
    const previous = db.prepare("SELECT MAX(score) AS score FROM mf_attempts WHERE board_key = ? AND status = 'completed'").get(row.board_key) as { score: number | null };
    const record = previous.score === null || row.score > previous.score;
    db.prepare("UPDATE mf_attempts SET status = 'completed', finished_at = ?, record = ? WHERE id = ?").run(clock(), Number(record), row.id);
    db.prepare("UPDATE game_sessions SET score = ?, completed_at = ?, last_seen_at = ? WHERE id = ? AND completed_at IS NULL").run(row.score, clock(), clock(), row.id);
    publish();
  };
  const showQuestion = (row: Attempt) => {
    const q = current(row);
    if (!q) { finish(row); return; }
    const config: Config = JSON.parse(row.config);
    const duration = (row.team_id ? config.teamSeconds : config.questionSeconds) * 1000;
    db.prepare("UPDATE mf_attempt_questions SET shown_at = ?, deadline = ? WHERE attempt_id = ? AND ordinal = ? AND shown_at IS NULL")
      .run(clock(), Math.min(clock() + duration, row.deadline ?? Infinity), row.id, row.cursor);
    db.prepare("UPDATE mf_attempts SET status = 'question' WHERE id = ?").run(row.id);
  };
  const submit = (row: Attempt, answer: boolean | null, confidence: number | null, timedOut = false) => {
    const q = current(row);
    if (!q || q.answered_at !== null) return;
    const config: Config = JSON.parse(row.config);
    const content: Question = JSON.parse(q.content);
    const correct = !timedOut && answer !== null && answer === content.fact;
    const responseMs = Math.max(0, Math.min(clock() - q.shown_at!, q.deadline! - q.shown_at!));
    let pairCorrect = false;
    if (q.pair_id !== null) {
      const earlier = questions(row.id).find((candidate) => candidate.pair_id === q.pair_id && candidate.ordinal < q.ordinal);
      pairCorrect = Boolean(earlier?.correct && !earlier.hinted && !q.hinted && correct);
    }
    const scored = scoreResponse({ correct, confidence, streak: row.streak, responseMs,
      timeLimitMs: Math.max(1, q.deadline! - q.shown_at!), hinted: Boolean(q.hinted), final: Boolean(q.final), pairCorrect, mode: row.mode, config });
    // Timeout is not a confidence assertion and never incurs a confidence penalty.
    const points = timedOut ? 0 : scored.points;
    db.prepare(`UPDATE mf_attempt_questions SET answered_at = ?, answer = ?, confidence = ?, correct = ?, points = ?, bonus = ?, response_ms = ? WHERE attempt_id = ? AND ordinal = ? AND answered_at IS NULL`)
      .run(clock(), answer === null ? null : Number(answer), confidence, Number(correct), points, scored.bonus, responseMs, row.id, row.cursor);
    const streak = correct ? row.streak + 1 : 0;
    db.prepare(`UPDATE mf_attempts SET score = ?, correct = correct + ?, incorrect = incorrect + ?, streak = ?, best_streak = ?, lives = ?, total_response_ms = total_response_ms + ?, status = 'reveal' WHERE id = ?`)
      .run(Math.max(0, row.score + points), Number(correct), Number(!correct), streak, Math.max(row.best_streak, streak), row.mode === "survival" && !correct ? row.lives - 1 : row.lives, responseMs, row.id);
    row = attempt(row.id);
    if (row.mode === "speed") {
      if (row.deadline !== null && clock() >= row.deadline) finish(row);
      else {
        db.prepare("UPDATE mf_attempts SET cursor = cursor + 1 WHERE id = ?").run(row.id);
        showQuestion(attempt(row.id));
      }
    } else if (row.mode === "survival" && row.lives <= 0) finish(row);
  };
  const settle = (id: string) => {
    let row = attempt(id);
    if (row.status === "completed" || row.status === "abandoned") return row;
    if (row.status === "countdown" && clock() >= row.started_at) {
      if (row.mode === "speed") db.prepare("UPDATE mf_attempts SET deadline = ? WHERE id = ?").run(row.started_at + JSON.parse(row.config).totalSeconds * 1000, id);
      showQuestion(attempt(id));
    }
    row = attempt(id);
    if (row.status === "question") {
      const q = current(row);
      if (q?.deadline !== null && clock() >= q.deadline!) submit(row, null, null, true);
    }
    row = attempt(id);
    if (row.mode === "speed" && row.deadline !== null && clock() >= row.deadline && row.status !== "completed") finish(row);
    db.prepare("UPDATE game_sessions SET last_seen_at = ? WHERE id = ? AND completed_at IS NULL").run(clock(), id);
    return attempt(id);
  };
  const view = (id: string, owner: string) => {
    own(id, owner);
    const row = settle(id), config: Config = JSON.parse(row.config), list = questions(id), q = current(row);
    const revealAllowed = mayReveal(row);
    const review = (item: AttemptQuestion) => {
      const content: Question = JSON.parse(item.content);
      return { ordinal: item.ordinal, statement: content.statement, fact: content.fact, explanation: content.explanation, source: content.source,
        answer: item.answer === null ? null : Boolean(item.answer), confidence: item.confidence, correct: Boolean(item.correct),
        points: item.points, bonus: item.bonus, responseMs: item.response_ms, hinted: Boolean(item.hinted), pair: item.pair_id, final: Boolean(item.final) };
    };
    const board = row.status === "completed" ? leaderboard({ boardKey: row.board_key }) : null;
    const answered = list.filter((item) => item.answered_at !== null);
    const last = revealAllowed && answered.length ? review(answered[answered.length - 1]) : null;
    const previousBest = db.prepare("SELECT MAX(score) AS score FROM mf_attempts WHERE identity = ? AND board_key = ? AND status = 'completed' AND id <> ?").get(row.identity, row.board_key, id) as { score: number | null };
    const content: Question | null = q ? JSON.parse(q.content) : null;
    return {
      id, mode: row.mode, status: row.status, serverNow: clock(), startAt: row.started_at, totalDeadline: row.deadline,
      score: row.score, correct: row.correct, incorrect: row.incorrect, streak: row.streak, longestStreak: row.best_streak,
      streakTitle: streakTitle(row.streak), lives: row.lives, hintUsed: Boolean(row.hint_used), config, boardKey: row.board_key,
      participation: row.team_id ? "team" : "solo", team: row.roster ? JSON.parse(row.roster) : null,
      questionCount: list.length, cursor: row.cursor, challengeVersion: row.challenge_version, configId: row.config_id,
      question: content && row.status === "question" ? { ordinal: q.ordinal, statement: content.statement, category: content.category, difficulty: content.difficulty,
        image: content.image, deadline: q.deadline, pair: q.pair_id, final: Boolean(q.final), hinted: Boolean(q.hinted), hint: q.hinted ? content.hint : null,
        hintAvailable: config.hints && !row.hint_used && Boolean(content.hint) } : null,
      reveal: row.status === "reveal" && revealAllowed && q?.answered_at !== null ? review(q) : null,
      last,
      review: row.status === "completed" && revealAllowed ? answered.map(review) : [],
      explanationsWithheld: !revealAllowed,
      result: row.status === "completed" ? {
        accuracy: Math.round(1000 * row.correct / Math.max(1, row.correct + row.incorrect)) / 10,
        averageMs: Math.round(row.total_response_ms / Math.max(1, row.correct + row.incorrect)), totalResponseMs: row.total_response_ms,
        elapsedMs: row.finished_at! - row.started_at, rank: board?.entries.find((entry) => entry.id === id)?.rank ?? null,
        previousBest: previousBest.score, personalBest: previousBest.score === null || row.score > previousBest.score,
        record: Boolean(row.record), badge: streakTitle(row.best_streak) ?? "Digital Explorer"
      } : null
    };
  };

  return {
    leaderboard,
    start(input: StartInput, owner: string) {
      return db.transaction(() => {
        const active = db.prepare("SELECT id FROM mf_attempts WHERE owner = ? AND status NOT IN ('completed', 'abandoned') ORDER BY started_at DESC LIMIT 1").get(owner) as { id: string } | undefined;
        if (active) return view(active.id, owner);
        const global = currentConfiguration(db);
        let config = { ...global.config, categories: [...global.config.categories] };
        if (!config.enabled || !config.availableModes.includes(input.mode)) throw new GameError(403, "This mode is currently unavailable.");
        let challenge: Challenge | null = null;
        if (input.mode === "event") {
          challenge = db.prepare("SELECT * FROM mf_challenges WHERE id = ?").get(input.challengeId ?? "") as Challenge | null;
          if (!challenge?.published || !challenge.registration_open) throw new GameError(403, "This competition is not open for registration.");
          config = JSON.parse(challenge.config);
        } else {
          config.difficulty = Math.min(input.difficulty, config.difficulty);
          config.categories = config.categories.filter((category) => input.categories.includes(category));
          if (!config.categories.length) throw new GameError(400, "Select an available category.");
        }
        if (input.mode === "team" && !input.team) throw new GameError(400, "Team Discussion requires team registration.");
        if (input.mode === "confidence" && !config.confidenceEnabled) throw new GameError(403, "Confidence scoring has been disabled by staff.");
        if (input.team ? !config.teams : !config.solo) throw new GameError(403, "This participation type is unavailable.");
        if (challenge && challenge.participation !== "both" && challenge.participation !== (input.team ? "team" : "solo")) throw new GameError(400, "Choose the required participation type for this event.");
        let teamId: string | null = null;
        let identity = input.participantId;
        if (input.team) {
          const names = [input.team.captain, ...input.team.members];
          if (names.length < config.teamMin || names.length > config.teamMax || new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new GameError(400, `Use ${config.teamMin}–${config.teamMax} different team member display names, including the captain.`);
          const fingerprint = hash([input.team.name.toLowerCase(), ...names.map((name) => name.toLowerCase()).sort()].join("\n"));
          const existing = db.prepare("SELECT id FROM teams WHERE fingerprint = ?").get(fingerprint) as { id: string } | undefined;
          teamId = existing?.id ?? randomUUID();
          if (!existing) db.prepare("INSERT INTO teams VALUES (?, ?, ?, ?, ?, ?)").run(teamId, fingerprint, input.team.name, input.team.captain, JSON.stringify(input.team.members), clock());
          identity = `team:${teamId}`;
        }
        if (config.maxAttempts) {
          const count = db.prepare("SELECT COUNT(*) AS n FROM mf_attempts WHERE identity = ? AND mode = ? AND COALESCE(challenge_id, '') = ? AND config_id = ?").get(identity, input.mode, challenge?.id ?? "", global.id) as { n: number };
          if (count.n >= config.maxAttempts) throw new GameError(403, "The attempt limit for these rules has been reached.");
        }
        let selected: Question[];
        if (challenge) {
          const code = db.prepare("SELECT id FROM mf_entry_codes WHERE challenge_id = ? AND code_hash = ? AND used_by IS NULL").get(challenge.id, hash(input.entryCode ?? ""));
          if (!code) throw new GameError(403, "A valid unused event entry code is required. Ask a volunteer.");
          const refs: { id: string; version: number }[] = JSON.parse(challenge.question_refs);
          selected = refs.map((ref) => {
            const q = db.prepare("SELECT content FROM mf_question_versions WHERE question_id = ? AND version = ?").get(ref.id, ref.version) as { content: string };
            return JSON.parse(q.content);
          });
        } else {
          const recent = db.prepare("SELECT id FROM mf_attempts WHERE identity = ? ORDER BY started_at DESC, rowid DESC LIMIT 3").all(identity) as { id: string }[];
          const excluded = new Set<string>();
          // Every statement assigned in the previous three sessions is excluded, including runs abandoned
          // before the first statement appeared, so an interrupted session cannot leak its set into a retry.
          for (const previous of recent) {
            for (const q of questions(previous.id)) excluded.add(q.question_id);
          }
          const pool = allQuestions(db);
          const available = pool.filter((q) => q.active && q.reviewStatus === "reviewed" && !excluded.has(q.id) && q.difficulty <= config.difficulty && config.categories.includes(q.category)).length;
          const count = input.mode === "speed" || input.mode === "survival" ? Math.min(80, available) : input.mode === "team" ? config.teamQuestionCount : config.questionCount;
          if (count < 10) throw new GameError(409, "Fewer than ten eligible statements remain after the three-session cooldown. Broaden categories or difficulty, or ask staff to add content. The cooldown was not relaxed.");
          selected = selectQuestions(pool, excluded, count, config);
        }
        const id = arena.start(input.participantId, "myth-fact", input.team?.name ?? input.nickname);
        if (challenge) db.prepare("UPDATE mf_entry_codes SET used_by = ? WHERE challenge_id = ? AND code_hash = ? AND used_by IS NULL").run(id, challenge.id, hash(input.entryCode ?? ""));
        const boardKey = `mf:${input.mode}:${input.team ? "team" : "solo"}:${challenge ? `${challenge.id}:v${challenge.version}` : `c${global.id}`}:${hash(JSON.stringify(config)).slice(0, 20)}`;
        db.prepare(`INSERT INTO mf_attempts(id, owner, identity, participant_id, team_id, roster, mode, config_id, config, board_key, challenge_id, challenge_version, status, started_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'countdown', ?)`).run(id, owner, identity, input.participantId, teamId, input.team ? JSON.stringify(input.team) : null,
          input.mode, global.id, JSON.stringify(config), boardKey, challenge?.id ?? null, challenge?.version ?? null, clock() + 3000);
        selected.forEach((q, ordinal) => {
          const pair = input.mode !== "speed" && input.mode !== "survival" && ((ordinal === 4 || ordinal === 5) || (ordinal === 9 || ordinal === 10))
            && ordinal < selected.length - 1 && selected[ordinal % 5 === 4 ? ordinal + 1 : ordinal - 1]?.category === q.category ? Math.floor((ordinal - 4) / 5) : null;
          db.prepare("INSERT INTO mf_attempt_questions(attempt_id, ordinal, question_id, version, content, pair_id, final) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(id, ordinal, q.id, q.version, JSON.stringify(q), pair, Number(ordinal === selected.length - 1 && input.mode !== "speed" && input.mode !== "survival"));
        });
        publish();
        return view(id, owner);
      })();
    },
    state(id: string, owner: string) { return db.transaction(() => view(id, owner))(); },
    answer(id: string, owner: string, ordinal: number, answer: boolean | null, confidence: number | null) {
      return db.transaction(() => {
        own(id, owner);
        let row = settle(id);
        const existing = questions(id).find((q) => q.ordinal === ordinal);
        if (existing?.answered_at !== null && existing?.answered_at !== undefined) return view(id, owner); // Idempotent retries cannot advance twice.
        if (row.status !== "question" || ordinal !== row.cursor) throw new GameError(409, "This statement is not currently accepting an answer.");
        const config: Config = JSON.parse(row.config);
        if (row.mode === "confidence" && confidence === null && answer !== null) throw new GameError(400, "Choose your confidence first.");
        if (row.mode !== "confidence" && confidence !== null) throw new GameError(400, "Confidence staking is only available in Confidence Battle.");
        if (!config.confidenceEnabled && confidence !== null) throw new GameError(400, "Confidence scoring is disabled.");
        submit(row, answer, confidence);
        row = attempt(id);
        return view(row.id, owner);
      })();
    },
    next(id: string, owner: string) {
      return db.transaction(() => {
        own(id, owner);
        const row = settle(id);
        if (row.status !== "reveal") throw new GameError(409, "Finish the current statement first.");
        if (row.cursor + 1 >= questions(id).length) finish(row);
        else { db.prepare("UPDATE mf_attempts SET cursor = cursor + 1 WHERE id = ?").run(id); showQuestion(attempt(id)); }
        return view(id, owner);
      })();
    },
    hint(id: string, owner: string) {
      return db.transaction(() => {
        own(id, owner);
        const row = settle(id), config: Config = JSON.parse(row.config), q = current(row);
        if (row.status !== "question" || !config.hints || row.hint_used || !JSON.parse(q.content).hint) throw new GameError(409, "No hint is available.");
        db.prepare("UPDATE mf_attempts SET hint_used = 1 WHERE id = ?").run(id);
        db.prepare("UPDATE mf_attempt_questions SET hinted = 1 WHERE attempt_id = ? AND ordinal = ?").run(id, row.cursor);
        return view(id, owner);
      })();
    },
    abandon(id: string, owner: string) {
      const row = own(id, owner);
      if (row.status !== "completed") {
        db.prepare("UPDATE mf_attempts SET status = 'abandoned', finished_at = ? WHERE id = ?").run(clock(), id);
        arena.abandon(id); publish();
      }
    },
    pending(owner: string) {
      const row = db.prepare("SELECT id FROM mf_attempts WHERE owner = ? AND status NOT IN ('completed','abandoned') ORDER BY started_at DESC LIMIT 1").get(owner) as { id: string } | undefined;
      return row ? view(row.id, owner) : null;
    }
  };
}
