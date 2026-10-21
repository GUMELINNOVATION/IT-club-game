import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { createArena } from "../arena.js";
import { caseSchema, difficulties, fields, type CaseContent } from "./cases.js";
import { configuration, type Config } from "./model.js";
import { DetectiveError, scoreReport, shuffle, type Report } from "./engine.js";

const text = z.string().trim().min(1).max(24);
export const startSchema = z.object({ participantId: z.uuid(), nickname: text, mode: z.enum(["solo", "team"]), caseId: z.string().max(80), difficulty: z.enum(difficulties), competitionId: z.string().max(80).optional(), team: z.object({ name: z.string().trim().min(2).max(40), captain: text, members: z.array(text).max(11) }).optional() }).strict();
const strings = z.array(z.string().max(80)).max(100);
export const reportSchema = z.object({ answers: z.record(z.string().max(30), z.string().max(300)), citations: z.record(z.string().max(30), strings), reasoning: z.record(z.string().max(30), z.string().max(3000)), timeline: strings }).strict();
export const progressSchema = z.object({ notes: z.string().max(10000), bookmarks: strings, suspicious: strings, board: strings, connections: z.array(z.object({ from: z.string().max(80), to: z.string().max(80), kind: z.enum(["hypothesis", "supported", "unverified"]) })).max(100), hypotheses: z.array(z.object({ id: z.string().max(80), text: z.string().max(1000), kind: z.enum(["hypothesis", "supported", "unverified"]) })).max(30), report: reportSchema }).strict();
export type Progress = z.infer<typeof progressSchema>;
type Attempt = { id: string; owner: string; case_id: string; version: number; difficulty: typeof difficulties[number]; seed: string; config: string; config_id: number; competition_id: string | null; mode: string; team_id: string | null; roster: string | null; board_key: string; status: string; started_at: number | null; deadline: number | null; finished_at: number | null; progress: string; revision: number; hints: number; submission: string | null; result: string | null; accuracy: number | null; elapsed: number | null };
export type Competition = { title: string; status: string; caseId: string; version: number; difficulty: typeof difficulties[number]; seed: string; startAt: number; endAt: number; participation: string; revealAfterClose: boolean };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function createDetective(db: Database.Database, publish: () => void, now = Date.now) {
  const arena = createArena(db);
  const get = (id: string) => { const row = db.prepare("SELECT * FROM dd_attempts WHERE id = ?").get(id) as Attempt | undefined; if (!row) throw new DetectiveError(404, "Investigation not found."); return row; };
  const own = (id: string, owner: string) => { const row = get(id); if (row.owner !== owner) throw new DetectiveError(403, "This investigation belongs to another browser session."); return row; };
  const version = (id: string, v: number) => { const row = db.prepare("SELECT content FROM dd_versions WHERE case_id = ? AND version = ?").get(id, v) as { content: string } | undefined; if (!row) throw new DetectiveError(404, "Case version not found."); return JSON.parse(row.content) as CaseContent; };
  const competition = (id: string) => { const row = db.prepare("SELECT content FROM competitions WHERE id = ? AND game = 'digital-detective'").get(id) as { content: string } | undefined; if (!row) throw new DetectiveError(404, "Competition not found."); return JSON.parse(row.content) as Competition; };
  const materialize = (a: Attempt): CaseContent => {
    let c = version(a.case_id, a.version); const config: Config = JSON.parse(a.config);
    const builtIn = /^case-00[1-5]$/.test(a.case_id);
    const variant = builtIn ? parseInt(digest(a.seed).slice(0, 2), 16) % 4 : 0;
    const actorNames = [["Maya Chen", "Omar Aziz", "Leo Martin", "Nadia Patel", "Iris Bell"], ["Sara Malik", "Yusuf Khan", "Elena Costa", "Amira Noor", "Noah Reed"], ["Lina Park", "Adam Musa", "Theo Lane", "Hana Ali", "Luca Shaw"], ["Ava Stone", "Sami Idris", "Mila Fox", "Zara Hale", "Finn Cole"]];
    const originalActors = actorNames[0]; const targetActors = actorNames[variant];
    let serialized = JSON.stringify(c);
    originalActors.forEach((name, i) => { serialized = serialized.split(name).join(targetActors[i]); });
    originalActors.forEach((name, i) => { serialized = serialized.replace(new RegExp(`\\b${name.split(" ")[0]}\\b`, "g"), targetActors[i].split(" ")[0]); });
    serialized = serialized.replace(/\bEvan\b/g, ["Evan", "Dylan", "Rowan", "Kai"][variant]);
    const accountAliases: Record<string, string[]> = { "m.chen": ["m.chen", "s.malik", "l.park", "a.stone"], "o.aziz": ["o.aziz", "y.khan", "a.musa", "s.idris"], "svc-report": ["svc-report", "svc-insights", "svc-metrics", "svc-summary"], "e.ross": ["e.ross", "d.west", "r.gray", "k.blake"], "svc-deploy": ["svc-deploy", "svc-release", "svc-rollout", "svc-delivery"] };
    for (const [name, aliases] of Object.entries(accountAliases)) serialized = serialized.split(name).join(aliases[variant]);
    c = JSON.parse(serialized);
    const count = config.profiles[a.difficulty].records;
    if (count < c.evidence.length && ["case-001", "case-002", "case-003", "case-004", "case-005"].includes(a.case_id) && a.version === 1) {
      // The two optional background records can be omitted for short beginner
      // profiles; original incident records and clock/witness evidence stay intact.
      c.evidence = c.evidence.filter(e => !(count <= 11 && e.id === "E7") && !(count <= 10 && e.id === "E8"));
    }
    // Coherent seed variant: shift every event together, rotate documentation-range
    // addresses together, and substitute incident session references consistently.
    const shift = builtIn ? (parseInt(digest(a.seed).slice(0, 4), 16) % 5) * 86400000 : 0;
    const replace = (s: string) => builtIn ? s.replace(/203\.0\.113\.(\d+)/g, (_, n: string) => `203.0.113.${1 + (Number(n) + parseInt(digest(a.seed).slice(4, 6), 16)) % 253}`) : s;
    c.evidence = c.evidence.map(e => ({ ...e, timestamp: new Date(Date.parse(e.timestamp) + shift).toISOString(), details: Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, replace(v)])) }));
    // Additional evidence is related operational context, including explicit approvals
    // and normalized local timestamps, so it is distinguishable through reasoning.
    for (let i = c.evidence.length; i < count; i++) {
      const batch = Math.floor((i - 12) / 6), step = (i - 12) % 6, ref = `R-${310 + batch}`, ticket = `CHG-${210 + batch}`, object = `metrics-${batch}.csv`, account = `report.operator${batch + 1}`;
      const context: [CaseContent["evidence"][number]["category"], string, string][] = [
        ["System", `External-source login ${ref}`, `Account ${account}; session ${ref}; source 192.0.2.${30 + batch}; successful login; method device certificate. Match the authorization ticket before attributing this login to the incident.`],
        ["File", `Data read ${ref}`, `Account ${account}; session ${ref}; object ${object}; 120 aggregate rows; 12 KiB; read successful; simulated hash aggregate-${batch}. Deleted-file index lists metrics-old-${batch}.tmp.`],
        ["Network", `Outbound transfer ${ref}`, `Session ${ref}; object ${object}; source 10.0.9.${30 + batch}; destination 198.51.100.${100 + batch}:443; HTTPS; upload 12 KiB; delivery accepted.`],
        ["Email", `Change approval ${ticket}`, `From change-control@fictional.example; to ${account}@fictional.example; subject ${ticket}; approved recurring aggregate report; authorized session ${ref}, object ${object} and destination 198.51.100.${100 + batch}. No attachments. Approval predates the batch.`],
        ["Alert", `Export detector ${ref}`, `Medium severity; source report-monitor; affected analytics replica; unusual external export; linked session ${ref}; untriaged. Determine whether the matching change approval explains it.`],
        ["System", `Clock and completion ${ref}`, `Session ${ref}; process report-publisher; clean exit; device clock UTC+02:00, central collector timestamp is UTC. Approval ${ticket} covered this batch. No access to incident archive or production configuration.`]
      ];
      const [category, title, record] = context[step];
      const minutes = step === 3 ? -10 : step * 3;
      c.evidence.push({ id: `C${i}`, category, title, timestamp: new Date(Date.UTC(2026, 9, 20, 5 + batch, minutes) + shift).toISOString(), details: { record, classification: "Simulated operational record", ...(a.difficulty === "advanced" || a.difficulty === "expert" ? { deviceLocalTime: new Date(Date.UTC(2026,9,20,7 + batch,minutes) + shift).toISOString().replace("Z", "+02:00"), warning: "Device-local time is not UTC; use the collector timestamp for ordering." } : {}) } });
    }
    const eid = (id: string) => `ev-${digest(`${a.seed}:${a.case_id}:${id}`).slice(0, 12)}`;
    const tid = (id: string) => `event-${digest(`${a.seed}:${a.case_id}:${id}`).slice(0, 12)}`;
    c.evidence = shuffle(c.evidence.map(e => ({ ...e, id: eid(e.id) })), a.seed);
    c.timeline = shuffle(c.timeline.map(t => ({ ...t, id: tid(t.id) })), `${a.seed}:timeline`);
    c.solution.timeline = c.solution.timeline.map(tid);
    c.solution.evidence = Object.fromEntries(Object.entries(c.solution.evidence).map(([k, ids]) => [k, ids.map(eid)]));
    c.hints = c.hints.map(h => h.replace("E1–E6 contain the incident chain; E12 explains timestamp normalization.", "Follow the original incident records and consult the clock synchronization record. Background approvals explain routine activity."));
    for (const f of fields) c.options[f] = shuffle(c.options[f], `${a.seed}:${f}`);
    return c;
  };
  const empty = (c: CaseContent): Progress => ({ notes: "", bookmarks: [], suspicious: [], board: [], connections: [], hypotheses: c.actors.map((actor,i) => ({ id: `actor-${i}`, text: `Actor profile: ${actor}`, kind: "unverified" })), report: { answers: {}, citations: {}, reasoning: {}, timeline: c.timeline.map(t => t.id) } });
  const validateProgress = (p: Progress, c: CaseContent) => {
    const ids = new Set(c.evidence.map(e => e.id)), nodes = new Set([...ids, ...p.hypotheses.map(h => h.id)]);
    if (new Set(p.hypotheses.map(h => h.id)).size !== p.hypotheses.length || p.hypotheses.some(h => ids.has(h.id))) throw new DetectiveError(400, "Invalid board note identifiers.");
    if ([...p.bookmarks, ...p.suspicious, ...p.board, ...Object.values(p.report.citations).flat()].some(id => !ids.has(id)) || p.connections.some(e => !nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to)) throw new DetectiveError(400, "Unknown evidence or board item.");
    if (p.report.timeline.length !== c.timeline.length || new Set(p.report.timeline).size !== c.timeline.length || p.report.timeline.some(id => !c.timeline.some(t => t.id === id))) throw new DetectiveError(400, "Timeline must contain each event once.");
    for (const f of Object.keys(p.report.answers)) if (!fields.includes(f as typeof fields[number]) || (p.report.answers[f] && !c.options[f as typeof fields[number]].includes(p.report.answers[f]))) throw new DetectiveError(400, "Unknown report conclusion.");
  };
  const finish = (a: Attempt, report: Report, timeout = false) => {
    const c = materialize(a), config: Config = JSON.parse(a.config);
    const elapsed = timeout ? a.deadline! - a.started_at! : Math.min(now(), a.deadline!) - a.started_at!;
    const result = { ...scoreReport(c, report, elapsed, a.deadline! - a.started_at!, a.hints, config), timedOut: timeout };
    db.transaction(() => {
      db.prepare("UPDATE dd_attempts SET status='completed', finished_at=?, submission=?, result=?, accuracy=?, elapsed=? WHERE id=? AND status='active'").run(timeout ? a.deadline : now(), JSON.stringify(report), JSON.stringify(result), result.accuracy, elapsed, a.id);
      db.prepare("UPDATE game_sessions SET score=?, completed_at=?, last_seen_at=? WHERE id=? AND completed_at IS NULL").run(result.score, now(), now(), a.id);
    })();
    publish();
  };
  const settle = (a: Attempt) => { if (a.status === "active" && now() >= a.deadline!) { finish(a, (JSON.parse(a.progress) as Progress).report, true); return get(a.id); } return a; };
  const settleExpired = () => { for (const a of db.prepare("SELECT * FROM dd_attempts WHERE status='active' AND deadline<=?").all(now()) as Attempt[]) settle(a); };
  const view = (id: string, owner: string) => {
    const a = settle(own(id, owner)), c = materialize(a), config: Config = JSON.parse(a.config);
    const { solution, hints, ...publicCase } = c;
    const comp = a.competition_id ? competition(a.competition_id) : null;
    const canReveal = !comp || !comp.revealAfterClose || comp.status === "closed" || now() >= comp.endAt;
    if (a.status === "active") arena.heartbeat(a.id);
    return { id: a.id, status: a.status, mode: a.mode, caseId: a.case_id, version: a.version, difficulty: a.difficulty, competitionId: a.competition_id, boardKey: a.board_key, roster: a.roster ? JSON.parse(a.roster) : null, serverNow: now(), startedAt: a.started_at, deadline: a.deadline, config, case: { ...publicCase, evidence: a.status === "briefing" ? [] : publicCase.evidence }, progress: JSON.parse(a.progress), revision: a.revision, hints: hints.slice(0, a.hints), hintCount: hints.length, result: a.result ? JSON.parse(a.result) : null, solution: a.status === "completed" && canReveal ? solution : null, revealPending: a.status === "completed" && !canReveal };
  };
  const catalog = () => ({ config: configuration(db).content, cases: (db.prepare("SELECT c.id, c.current_version AS version, v.content FROM dd_cases c JOIN dd_versions v ON v.case_id=c.id AND v.version=c.current_version WHERE c.status='published'").all() as { id: string; version: number; content: string }[]).map(r => { const c: CaseContent = JSON.parse(r.content); return { id: r.id, version: r.version, title: c.title, organization: c.organization, briefing: c.briefing }; }), competitions: (db.prepare("SELECT id, content FROM competitions WHERE game='digital-detective' AND status='open'").all() as { id: string; content: string }[]).map(r => ({ id: r.id, ...JSON.parse(r.content) })).filter(c => now() >= c.startAt && now() < c.endAt) });
  const start = (input: z.infer<typeof startSchema>, owner: string) => db.transaction(() => {
    const active = db.prepare("SELECT id FROM dd_attempts WHERE owner=? AND status IN ('briefing','active')").get(owner) as { id: string } | undefined;
    if (active) throw new DetectiveError(409, "Finish or exit your current investigation first.");
    const cfg = configuration(db); let config = cfg.content;
    let caseId = input.caseId, difficulty = input.difficulty, seed: string = randomUUID(), v: number;
    if (input.competitionId) {
      const comp = competition(input.competitionId);
      if (comp.status !== "open" || now() < comp.startAt || now() >= comp.endAt || (comp.participation !== "both" && comp.participation !== input.mode)) throw new DetectiveError(409, "Competition registration is closed for this mode.");
      // Competition config is pinned when it is first opened.
      const saved = db.prepare("SELECT content FROM competitions WHERE id=?").get(input.competitionId) as { content: string };
      config = (JSON.parse(saved.content).config ?? config) as Config;
      caseId = comp.caseId; difficulty = comp.difficulty; seed = comp.seed; v = comp.version;
    } else {
      const c = db.prepare("SELECT current_version FROM dd_cases WHERE id=? AND status='published'").get(caseId) as { current_version: number } | undefined;
      if (!c) throw new DetectiveError(404, "Case is unavailable."); v = c.current_version;
    }
    version(caseId, v);
    if ((input.mode === "solo" && !config.solo) || (input.mode === "team" && !config.teams)) throw new DetectiveError(403, "Participation mode disabled.");
    let teamId: string | null = null;
    if (input.mode === "team") {
      const t = input.team;
      if (!t || t.members.length + 1 < config.teamMin || t.members.length + 1 > config.teamMax) throw new DetectiveError(400, `Team size must be ${config.teamMin}–${config.teamMax}, including captain.`);
      if (new Set([t.captain, ...t.members].map(n => n.toLowerCase())).size !== t.members.length + 1) throw new DetectiveError(400, "Use distinct member names.");
      const fingerprint = digest(JSON.stringify([t.name.toLowerCase(), ...[t.captain, ...t.members].map(n => n.toLowerCase()).sort()]));
      const existing = db.prepare("SELECT id FROM teams WHERE fingerprint=?").get(fingerprint) as { id: string } | undefined;
      teamId = existing?.id ?? randomUUID();
      if (!existing) db.prepare("INSERT INTO teams VALUES (?, ?, ?, ?, ?, ?)").run(teamId, fingerprint, t.name, t.captain, JSON.stringify(t.members), now());
    }
    const identity = teamId ?? input.participantId;
    const scope = input.competitionId ?? `${caseId}:${v}:${difficulty}`;
    const count = db.prepare("SELECT COUNT(*) AS n FROM dd_attempts a JOIN game_sessions g ON g.id=a.id WHERE COALESCE(a.team_id,g.participant_id)=? AND COALESCE(a.competition_id,a.case_id||':'||a.version||':'||a.difficulty)=?").get(identity, scope) as { n: number };
    if (config.maxAttempts && count.n >= config.maxAttempts) throw new DetectiveError(409, "Attempt limit reached.");
    const boardKey = digest(JSON.stringify([input.mode, caseId, v, difficulty, input.competitionId ?? "practice", input.competitionId ? seed : "equivalent-variants", config]));
    const id = arena.start(input.participantId, "digital-detective", input.mode === "team" ? input.team!.name : input.nickname);
    db.prepare(`INSERT INTO dd_attempts(id,owner,case_id,version,difficulty,seed,config,config_id,competition_id,mode,team_id,roster,board_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, owner, caseId, v, difficulty, seed, JSON.stringify(config), cfg.id, input.competitionId ?? null, input.mode, teamId, input.mode === "team" ? JSON.stringify(input.team) : null, boardKey);
    const p = empty(materialize(get(id))); db.prepare("UPDATE dd_attempts SET progress=? WHERE id=?").run(JSON.stringify(p), id);
    publish(); return view(id, owner);
  })();
  const save = (id: string, owner: string, progress: Progress, revision: number) => {
    const a = settle(own(id, owner)); if (a.status !== "active") throw new DetectiveError(409, "Investigation is no longer active.");
    validateProgress(progress, materialize(a));
    const r = db.prepare("UPDATE dd_attempts SET progress=?, revision=revision+1 WHERE id=? AND revision=? AND status='active'").run(JSON.stringify(progress), id, revision);
    if (!r.changes) throw new DetectiveError(409, "A newer workspace is saved. Reload to recover it.");
    return { revision: revision + 1, serverNow: now() };
  };
  const leaderboard = (boardKey?: string) => {
    settleExpired();
    if (!configuration(db).content.leaderboardVisible) return { boards: [], entries: [], visible: false };
    const rows = db.prepare(`SELECT a.*, g.challenger, g.score, g.participant_id FROM dd_attempts a JOIN game_sessions g ON g.id=a.id WHERE a.status='completed' AND json_extract(a.config,'$.leaderboardVisible')=1 ORDER BY g.score DESC, a.accuracy DESC, a.elapsed ASC, a.finished_at ASC, a.id ASC`).all() as (Attempt & { challenger: string; score: number; participant_id: string })[];
    const boards = new Map<string, object>(), seen = new Set<string>(), ranks = new Map<string, number>();
    const entries = [];
    for (const a of rows) {
      const c = version(a.case_id, a.version);
      boards.set(a.board_key, { key: a.board_key, title: c.title, version: a.version, difficulty: a.difficulty, mode: a.mode, competitionId: a.competition_id });
      if (boardKey && boardKey !== a.board_key) continue;
      const who = `${a.board_key}:${a.team_id ?? a.participant_id}`; if (seen.has(who)) continue; seen.add(who);
      const rank = (ranks.get(a.board_key) ?? 0) + 1; ranks.set(a.board_key, rank);
      if (rank <= 50) entries.push({ id: a.id, challenger: a.challenger, score: a.score, accuracy: a.accuracy, elapsed: a.elapsed, completedAt: a.finished_at, rank, boardKey: a.board_key });
    }
    return { boards: [...boards.values()], entries: boardKey ? entries : [], visible: true };
  };
  return { catalog, start, view, leaderboard, version, competition,
    recover(owner: string) { const a = db.prepare("SELECT id FROM dd_attempts WHERE owner=? AND status!='abandoned' ORDER BY rowid DESC LIMIT 1").get(owner) as { id: string } | undefined; return a ? view(a.id, owner) : null; },
    begin(id: string, owner: string) { const a = own(id, owner); if (a.status === "briefing") { let deadline = now() + (JSON.parse(a.config) as Config).profiles[a.difficulty].seconds * 1000; if (a.competition_id) { const comp = competition(a.competition_id); if (comp.status !== "open" || now() >= comp.endAt) throw new DetectiveError(409, "Competition closed."); deadline = Math.min(deadline, comp.endAt); } db.prepare("UPDATE dd_attempts SET status='active', started_at=?, deadline=? WHERE id=?").run(now(), deadline, id); } return view(id, owner); },
    save,
    hint(id: string, owner: string) { const a = settle(own(id, owner)); if (a.status !== "active" || !(JSON.parse(a.config) as Config).hints) throw new DetectiveError(409, "Hints unavailable."); const c = materialize(a); if (a.hints < c.hints.length) db.prepare("UPDATE dd_attempts SET hints=hints+1 WHERE id=?").run(id); return view(id, owner); },
    submit(id: string, owner: string, report: Report) { const a = settle(own(id, owner)); if (a.status === "completed") { if (a.submission !== JSON.stringify(report) && !(a.result && JSON.parse(a.result).timedOut)) throw new DetectiveError(409, "A different report has already been verified."); return view(id, owner); } if (a.status !== "active") throw new DetectiveError(409, "Begin the investigation first."); const p: Progress = JSON.parse(a.progress); validateProgress({ ...p, report }, materialize(a)); finish(a, report); return view(id, owner); },
    reset(owner: string) { db.prepare("UPDATE game_sessions SET last_seen_at=0 WHERE id IN (SELECT id FROM dd_attempts WHERE owner=? AND status IN ('briefing','active'))").run(owner); db.prepare("UPDATE dd_attempts SET status=CASE WHEN status IN ('briefing','active') THEN 'abandoned' ELSE status END, progress='{}', owner=? WHERE owner=?").run(`retired:${randomUUID()}`, owner); publish(); },
    adminCases() { return (db.prepare("SELECT c.*, v.content FROM dd_cases c JOIN dd_versions v ON v.case_id=c.id AND v.version=c.current_version").all() as { id: string; current_version: number; status: string; content: string }[]).map(c => ({ ...c, content: JSON.parse(c.content) })); },
    saveCase(id: string, content: CaseContent, status: string) { caseSchema.parse(content); const existing = db.prepare("SELECT current_version FROM dd_cases WHERE id=?").get(id) as { current_version: number } | undefined; const v = (existing?.current_version ?? 0) + 1; db.transaction(() => { db.prepare("INSERT INTO dd_cases VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET current_version=excluded.current_version,status=excluded.status").run(id, v, status); db.prepare("INSERT INTO dd_versions VALUES (?,?,?,?)").run(id, v, JSON.stringify(content), now()); })(); publish(); return { id, version: v }; },
    attempts() { settleExpired(); return db.prepare("SELECT a.id,a.case_id,a.version,a.difficulty,a.mode,a.status,a.roster,a.result,a.submission,a.hints,a.started_at,a.finished_at,a.competition_id,g.challenger FROM dd_attempts a JOIN game_sessions g ON g.id=a.id ORDER BY a.rowid DESC LIMIT 250").all(); },
    analytics() {
      settleExpired();
      const rows = db.prepare("SELECT a.*,g.challenger,g.participant_id FROM dd_attempts a JOIN game_sessions g ON g.id=a.id").all() as (Attempt & { challenger: string; participant_id: string })[];
      const completed = rows.filter(a => a.result);
      const mean = (values: number[]) => values.length ? Math.round(values.reduce((a,b) => a+b,0) / values.length) : 0;
      const boards = leaderboard().boards as { key: string; title: string; mode: string; difficulty: string }[];
      return {
        started: rows.filter(a => a.started_at !== null).length, completed: completed.length,
        solo: new Set(rows.filter(a => a.mode === "solo").map(a => a.participant_id)).size,
        teams: new Set(rows.filter(a => a.mode === "team").map(a => a.team_id)).size,
        averageScore: mean(completed.map(a => JSON.parse(a.result!).score)), averageMs: mean(completed.map(a => a.elapsed!)),
        cases: [...new Set(rows.map(a => a.case_id))].map(id => ({ id, accuracy: mean(completed.filter(a => a.case_id === id).map(a => a.accuracy!)) })),
        missed: Object.fromEntries(fields.map(f => [f, completed.filter(a => !JSON.parse(a.result!).correct[f]).length])),
        hints: Array.from({ length: 6 }, (_,i) => ({ hint: i + 1, uses: rows.filter(a => a.hints > i).length })),
        champions: { boards: boards.map(b => ({ ...b, champion: leaderboard(b.key).entries[0] ?? null })) }
      };
    },
    adjust(id: string, score: number, reason: string, admin: number) { const a = get(id); if (a.status !== "completed") throw new DetectiveError(409, "Only completed attempts can be adjusted."); const result = JSON.parse(a.result!); db.transaction(() => { db.prepare("INSERT INTO audit_log(admin_user_id,action,details) VALUES (?,'detective.score.adjust',?)").run(admin, JSON.stringify({ id, previous: result.score, score, reason })); result.score = score; result.adjustment = reason; db.prepare("UPDATE dd_attempts SET result=? WHERE id=?").run(JSON.stringify(result), id); db.prepare("UPDATE game_sessions SET score=? WHERE id=?").run(score,id); })(); publish(); }
  };
}
