import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import Database from "better-sqlite3";

let child: ChildProcess;
let base = "";
let directory = "";
let db: Database.Database;
let playerCookie = "";
let adminCookie = "";
const participantId = randomUUID();

type View = {
  id: string; mode: string; status: "countdown" | "question" | "reveal" | "completed" | "abandoned";
  score: number; streak: number; correct: number; incorrect: number; lives: number; cursor: number;
  questionCount: number; hintUsed: boolean; explanationsWithheld: boolean; challengeVersion: number | null;
  participation: string; team: { name: string } | null; boardKey: string; serverNow: number; startAt: number;
  question: { ordinal: number; statement: string; category: string; hint: string | null; hintAvailable: boolean } | null;
  reveal: { fact: boolean; answer: boolean | null; correct: boolean; points: number | null; explanation: string; source: string } | null;
  result: { rank: number | null; accuracy: number } | null;
  review: unknown[];
  config: { confidenceCorrect: number[] };
};

async function request(path: string, method = "GET", body?: unknown, as: "player" | "admin" | "none" = "none") {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  const cookie = as === "player" ? playerCookie : as === "admin" ? adminCookie : "";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8_000)
  });
  const set = response.headers.get("set-cookie");
  if (set) {
    const value = set.split(";")[0];
    if (as === "admin") adminCookie = value;
    if (as === "player") playerCookie = value;
  }
  return response;
}

async function boot() {
  child = spawn(process.execPath, ["--import=tsx", "server/src/index.ts"], {
    env: { ...process.env, NODE_ENV: "test", PORT: "0", DATABASE_PATH: join(directory, "myth.sqlite"), SESSION_SECRET: "myth-integration-only-" + "y".repeat(32) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("API startup timed out")), 20_000);
    let output = "";
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.stdout?.on("data", (chunk) => {
      const port = String(chunk).match(/listening on port (\d+)/)?.[1];
      if (port) { base = `http://127.0.0.1:${port}`; clearTimeout(timer); resolve(); }
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`API exited ${code}: ${output}`)); });
  });
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill(); });
}

const body = (mode: string, extra: Record<string, unknown> = {}) => ({
  participantId, nickname: "Ada", mode, difficulty: 4,
  categories: ["Everyday Technology", "Cybersecurity", "Online Privacy", "Artificial Intelligence", "Smartphones & Internet", "Social Media", "Digital Forensics & IT"],
  ...extra
});

async function begin(mode = "classic", extra: Record<string, unknown> = {}) {
  const response = await request("/api/myth/start", "POST", body(mode, extra), "player");
  expect(response.status).toBe(201);
  return await response.json() as View;
}

function present(id: string) {
  db.prepare("UPDATE mf_attempts SET started_at = ? WHERE id = ?").run(Date.now() - 1_000, id);
  return request(`/api/myth/attempts/${id}`, "GET", undefined, "player");
}

async function settle(id: string) {
  const response = await present(id);
  expect(response.status).toBe(200);
  return await response.json() as View;
}

function factOf(id: string, ordinal: number) {
  const row = db.prepare("SELECT content FROM mf_attempt_questions WHERE attempt_id = ? AND ordinal = ?").get(id, ordinal) as { content: string };
  return (JSON.parse(row.content) as { fact: boolean }).fact;
}

async function answer(view: View, correct: boolean, confidence: number | null = null) {
  const expected = factOf(view.id, view.question!.ordinal);
  const response = await request(`/api/myth/attempts/${view.id}/answer`, "POST", {
    ordinal: view.question!.ordinal, answer: correct ? expected : !expected, confidence
  }, "player");
  expect(response.status).toBe(200);
  return await response.json() as View;
}

async function next(view: View) {
  const response = await request(`/api/myth/attempts/${view.id}/next`, "POST", undefined, "player");
  expect(response.status).toBe(200);
  return await response.json() as View;
}

async function reset() {
  const response = await request("/api/myth/reset", "POST", undefined, "player");
  expect(response.status).toBe(204);
}

async function complete(view: View) {
  for (let guard = 0; guard < 80 && view.status !== "completed"; guard++) {
    view = view.status === "question" ? await answer(view, true) : view.status === "reveal" ? await next(view) : await settle(view.id);
  }
  expect(view.status).toBe("completed");
  return view;
}

describe("Myth or Fact server-owned game", () => {
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "opencode", "myth-"));
    await boot();
    db = new Database(join(directory, "myth.sqlite"));
    const salt = randomBytes(16);
    const key = scryptSync("myth-integration-password", salt, 64);
    db.prepare("INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)")
      .run("myth-admin", `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`, "super_admin");
    const login = await request("/api/admin/login", "POST", { username: "myth-admin", password: "myth-integration-password" }, "admin");
    expect(login.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    db?.close();
    await stop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("serves metadata and a 200-statement reviewed bank without exposing answers", async () => {
    const meta = await (await request("/api/myth/meta")).json();
    expect(meta).toMatchObject({ questionCount: 200, categories: expect.any(Array) });
    expect(meta.categories).toHaveLength(7);
    expect(meta.config.availableModes).toHaveLength(6);
    expect(await (await request("/api/myth/pending", "GET", undefined, "player")).json()).toEqual({ attempt: null });

    const view = await begin();
    expect(view.status).toBe("countdown");
    expect(view.question).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"explanation":');
    expect(JSON.stringify(view)).not.toContain('"fact":');

    const ready = await settle(view.id);
    expect(ready.status).toBe("question");
    expect(ready.question?.statement.length).toBeGreaterThan(12);
    expect(ready.question).not.toHaveProperty("fact");
    expect(ready.question).not.toHaveProperty("explanation");
    expect(ready.questionCount).toBe(15);
  });

  it("rejects tampered confident staking outside Confidence Battle and double-advance retries", async () => {
    const view = await settle((await begin()).id);
    const wrong = await answer(view, false, null);
    expect(wrong.status).toBe("reveal");
    expect(wrong.reveal).toMatchObject({ correct: false, answer: !factOf(view.id, view.question!.ordinal) });
    expect(wrong.reveal!.explanation.length).toBeGreaterThan(20);
    expect(wrong.reveal!.source).toMatch(/^https:/);
    expect(wrong.score).toBe(0);

    const duplicate = await request(`/api/myth/attempts/${view.id}/answer`, "POST", {
      ordinal: view.question!.ordinal, answer: true, confidence: null
    }, "player");
    expect(duplicate.status).toBe(200);
    const duplicateView = await duplicate.json() as View;
    expect(duplicateView.score).toBe(0);
    expect(duplicateView.cursor).toBe(wrong.cursor);

    const advanced = await next(wrong);
    expect(advanced.cursor).toBe(1);
    const rejected = await request(`/api/myth/attempts/${view.id}/answer`, "POST", {
      ordinal: advanced.question!.ordinal, answer: true, confidence: 2
    }, "player");
    expect(rejected.status).toBe(400);
  });

  it("provides one hint, completes a scored classic run, and blocks browser-submitted scores", async () => {
    const started = await settle((await begin()).id);
    const hinted = await (await request(`/api/myth/attempts/${started.id}/hint`, "POST", undefined, "player")).json() as View;
    expect(hinted.hintUsed).toBe(true);
    expect(hinted.question?.hint).toBeTruthy();
    expect(hinted.question?.hintAvailable).toBe(false);

    const answered = await answer(hinted, true);
    expect(answered.status).toBe("reveal");
    expect(answered.reveal?.correct).toBe(true);
    expect(answered.reveal?.points).toBe(100); // Base points only: hints remove speed and streak bonuses.

    const finished = await complete(answered);
    expect(finished.result).toMatchObject({ rank: 1 });
    expect(finished.review).toHaveLength(15);
    expect(finished.score).toBeGreaterThan(1_000);

    const boards = await (await request("/api/myth/leaderboard")).json();
    expect(boards.visible).toBe(true);
    expect(boards.boards.some((board: { mode: string; participation: string }) => board.mode === "classic" && board.participation === "solo")).toBe(true);
    expect(boards.entries[0]).toMatchObject({ id: finished.id, rank: 1, challenger: "Ada" });

    const preview = await (await request("/api/leaderboard/myth-fact")).json();
    expect(preview.entries[0]).toMatchObject({ id: finished.id, score: finished.score });
    const bypass = await request(`/api/play/${finished.id}/complete`, "POST", { score: 999_999 }, "player");
    expect(bypass.status).toBe(400);
  });

  it("keeps casual statements out of the previous three sessions, including abandoned runs", async () => {
    const firstIds = (db.prepare("SELECT question_id FROM mf_attempt_questions WHERE attempt_id = (SELECT id FROM mf_attempts ORDER BY started_at DESC, rowid DESC LIMIT 1)").all() as { question_id: string }[]).map((row) => row.question_id);
    expect(firstIds.length).toBe(15);
    await reset();

    const seen = new Set(firstIds);
    for (let index = 0; index < 2; index++) {
      const abandoned = await begin();
      const assigned = db.prepare("SELECT question_id FROM mf_attempt_questions WHERE attempt_id = ?").all(abandoned.id) as { question_id: string }[];
      expect(assigned).toHaveLength(15);
      for (const row of assigned) seen.add(row.question_id);
      await reset();
    }

    const fourth = await begin();
    const ids = (db.prepare("SELECT question_id FROM mf_attempt_questions WHERE attempt_id = ?").all(fourth.id) as { question_id: string }[]).map((row) => row.question_id);
    expect(ids).toHaveLength(15);
    expect(ids.filter((id) => seen.has(id))).toEqual([]);
    await reset();
  });

  it("registers teams, applies confidence stakes, and ends Survival at zero lives", async () => {
    const team = await begin("team", { team: { name: "Truth Seekers", captain: "Ada", members: ["Grace", "Linus"] } });
    expect(team).toMatchObject({ mode: "team", participation: "team" });
    expect(team.team?.name).toBe("Truth Seekers");
    await reset();

    const confidence = await settle((await begin("confidence")).id);
    const staked = await answer(confidence, true, 2);
    expect(staked.reveal?.points).toBeGreaterThanOrEqual(confidence.config.confidenceCorrect[2]);
    const penalised = await answer(await next(staked), false, 2);
    expect(penalised.reveal?.points).toBe(-75);
    await reset();

    let survival = await settle((await begin("survival")).id);
    expect(survival.lives).toBe(3);
    for (let lives = 2; lives >= 0; lives--) {
      survival = await answer(survival, false);
      expect(survival.lives).toBe(lives);
      if (survival.status !== "completed") survival = await next(survival);
    }
    expect(survival.status).toBe("completed");
    expect(survival.result).not.toBeNull();
    await reset();
  });

  it("manages versioned statements, fixed event sets, one-time codes, and withheld explanations", async () => {
    const rules = await (await request("/api/myth/admin/config", "GET", undefined, "admin")).json();
    const draft = {
      statement: "A password manager can generate a unique password for every account it protects.",
      fact: true, explanation: "Unique generated passwords limit credential reuse, so one breach does not unlock every account.",
      category: "Cybersecurity", difficulty: 2, hint: "Think about reuse.", source: "https://pages.nist.gov/800-63-4/",
      reviewStatus: "draft", active: true, image: ""
    };
    const created = await request("/api/myth/admin/questions", "POST", draft, "admin");
    expect(created.status).toBe(201);
    const question = await created.json() as { id: string; version: number };
    expect(question.version).toBe(1);
    expect((await request("/api/myth/admin/questions", "POST", draft, "admin")).status).toBe(409);

    const reviewed = await request(`/api/myth/admin/questions/${question.id}`, "PUT", { ...draft, reviewStatus: "reviewed" }, "admin");
    expect(reviewed.status).toBe(200);
    expect((await reviewed.json() as { version: number }).version).toBe(2);

    const changed = await request("/api/myth/admin/config", "PUT", rules.config, "admin");
    expect(changed.status).toBe(200);

    const challenge = await request("/api/myth/admin/challenges", "POST", {
      title: "Integration Truth Cup", participation: "solo", revealAfterClose: true, questionIds: [], config: { ...rules.config, availableModes: ["event"] }
    }, "admin");
    expect(challenge.status).toBe(201);
    const challengeId = (await challenge.json() as { id: string }).id;
    expect((await request(`/api/myth/admin/challenges/${challengeId}/status`, "POST", { published: true, registrationOpen: false }, "admin")).status).toBe(200);
    expect((await request(`/api/myth/admin/challenges/${challengeId}/status`, "POST", { published: true, registrationOpen: true }, "admin")).status).toBe(200);

    const issued = await (await request(`/api/myth/admin/challenges/${challengeId}/codes`, "POST", { count: 2, label: "Integration" }, "admin")).json() as { codes: string[] };
    expect(issued.codes).toHaveLength(2);
    const [firstCode, secondCode] = issued.codes;

    const event = await begin("event", { challengeId, entryCode: firstCode });
    expect(event).toMatchObject({ mode: "event", challengeVersion: 1, questionCount: 15 });
    let current = await settle(event.id);
    current = await answer(current, true);
    expect(current.status).toBe("reveal");
    expect(current.reveal).toBeNull(); // Fixed set hides explanations while registration is open.
    expect(current.explanationsWithheld).toBe(true);

    await reset();
    const replay = await request("/api/myth/start", "POST", body("event", { challengeId, entryCode: firstCode }), "player");
    expect(replay.status).toBe(403); // Codes are single-use.

    const second = await begin("event", { challengeId, entryCode: secondCode });
    expect(second.id).not.toBe(event.id);
    expect((await request(`/api/myth/admin/challenges/${challengeId}/status`, "POST", { published: true, registrationOpen: false }, "admin")).status).toBe(200);

    const resumed = await settle(second.id);
    expect(resumed.status).toBe("question");
    const revealed = await answer(resumed, true);
    expect(revealed.status).toBe("reveal");
    expect(revealed.reveal).not.toBeNull();
    expect(revealed.explanationsWithheld).toBe(false);

    const finished = await complete(revealed);
    expect(finished.review).toHaveLength(15);
    expect(finished.result).not.toBeNull();

    const eventBoards = await (await request("/api/myth/leaderboard?mode=event&participation=solo")).json();
    expect(eventBoards.boards).toHaveLength(1);
    expect(eventBoards.boards[0]).toMatchObject({ challengeId, version: 1 });
    expect(eventBoards.entries.some((entry: { id: string }) => entry.id === finished.id)).toBe(true);

    const results = await (await request("/api/myth/admin/results", "GET", undefined, "admin")).json();
    expect(results.boards.length).toBeGreaterThanOrEqual(2);
  });
  it("blocks cross-site mutations while allowing the local development proxy", async () => {
    const crossSite = await fetch(`${base}/api/myth/reset`, { method: "POST", headers: { Origin: "https://evil.example", Cookie: playerCookie } });
    expect(crossSite.status).toBe(403);
    const loopback = await fetch(`${base}/api/myth/reset`, { method: "POST", headers: { Origin: "http://localhost:5173", Cookie: playerCookie } });
    expect(loopback.status).toBe(204);
  });
});
