import { beforeEach, afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { createDetective, type Progress } from "./service.js";
import { initializeDetective, defaultConfig } from "./model.js";
import { difficulties, fields, seedCases } from "./cases.js";
let db: Database.Database, clock: number, service: ReturnType<typeof createDetective>;
const owner = "owner-a", other = "owner-b";
const input = () => ({ participantId: randomUUID(), nickname: "Ada", mode: "solo" as const, caseId: "case-001", difficulty: "beginner" as const });
beforeEach(() => { db = new Database(":memory:"); db.pragma("foreign_keys=ON"); db.exec(`CREATE TABLE participants(id TEXT PRIMARY KEY,created_at INTEGER); CREATE TABLE game_sessions(id TEXT PRIMARY KEY,participant_id TEXT REFERENCES participants(id),game TEXT,challenger TEXT,started_at INTEGER,last_seen_at INTEGER,completed_at INTEGER,score INTEGER); CREATE TABLE teams(id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE,name TEXT,captain TEXT,members TEXT,created_at INTEGER); CREATE TABLE audit_log(id INTEGER PRIMARY KEY,admin_user_id INTEGER,action TEXT,details TEXT);`); initializeDetective(db); clock = Date.UTC(2026,9,20); service = createDetective(db,() => {},() => clock); });
afterEach(() => db.close());
describe("owned investigation lifecycle", () => {
  it("versions improved seed hints once while preserving pinned original dossiers and authored changes", () => {
    const legacy = seedCases(true)[0], authored = seedCases(true)[1]; authored.content.briefing += " Staff-authored amendment.";
    db.prepare("UPDATE dd_versions SET content=? WHERE case_id=? AND version=1").run(JSON.stringify(legacy.content),legacy.id);
    db.prepare("UPDATE dd_versions SET content=? WHERE case_id=? AND version=1").run(JSON.stringify(authored.content),authored.id);
    initializeDetective(db);
    expect(service.version(legacy.id,1).hints).toEqual(legacy.content.hints);
    expect(service.version(legacy.id,2).hints[0]).toContain("benefits message");
    expect((db.prepare("SELECT current_version FROM dd_cases WHERE id=?").get(authored.id) as { current_version:number }).current_version).toBe(1);
    initializeDetective(db);
    expect((db.prepare("SELECT COUNT(*) AS n FROM dd_versions WHERE case_id=?").get(legacy.id) as { n:number }).n).toBe(2);
  });
  it("preserves custom scenario actors and absolute dates instead of applying built-in substitutions", () => {
    const custom = seedCases()[0].content; custom.title = "Custom audit scenario";
    service.saveCase("custom-audit",custom,"published");
    const a = service.begin(service.start({ ...input(),caseId:"custom-audit" },owner).id,owner);
    expect(a.case.actors).toEqual(custom.actors);
    for (const record of custom.evidence) expect(Date.parse(a.case.evidence.find(e => e.title === record.title)!.timestamp)).toBe(Date.parse(record.timestamp));
    expect(a.case.options.asset).toContain("m.chen");
  });
  it("keeps all five cases solvable at every difficulty with consistent randomized identifiers and local clocks", () => {
    for (const original of seedCases()) for (const difficulty of difficulties) {
      const who = `${original.id}:${difficulty}`;
      const a = service.begin(service.start({ ...input(),caseId:original.id,difficulty },who).id,who);
      const seed = (db.prepare("SELECT seed FROM dd_attempts WHERE id=?").get(a.id) as { seed:string }).seed;
      const identifier = (id: string, prefix: string) => `${prefix}-${createHash("sha256").update(`${seed}:${original.id}:${id}`).digest("hex").slice(0,12)}`;
      const report = { answers:Object.fromEntries(fields.map(f => [f,a.case.options[f].find(o => !original.content.options[f].slice(1).includes(o))!])),citations:Object.fromEntries(fields.map(f => [f,original.content.solution.evidence[f].map(id => identifier(id,"ev"))])),reasoning:Object.fromEntries(fields.map(f => [f,"The linked original audit records support this conclusion."])),timeline:original.content.solution.timeline.map(id => identifier(id,"event")) };
      const result = service.submit(a.id,who,report);
      expect(result.result).toMatchObject({ base:1000,accuracy:100,score:1200 });
      expect(a.case.evidence).toHaveLength(defaultConfig.profiles[difficulty].records);
      for (const record of a.case.evidence) if (record.details.deviceLocalTime) expect(Date.parse(record.details.deviceLocalTime)).toBe(Date.parse(record.timestamp));
    }
  });
  it("starts in briefing without countdown or answers, begins once, and uses server time across refresh", () => {
    const a = service.start(input(),owner);
    expect(a).toMatchObject({ status:"briefing",deadline:null,solution:null }); expect(a.case.evidence).toEqual([]);
    clock += 100000; const active = service.begin(a.id,owner);
    expect(active.deadline).toBe(clock+720000); expect(active.case.evidence).toHaveLength(12);
    expect(JSON.stringify(active)).not.toContain('"explanation"');
    expect(active.case.timeline.map(t => t.id).every(id => !/^T\d/.test(id))).toBe(true);
    clock += 10000; expect(service.begin(a.id,owner).deadline).toBe(active.deadline);
    expect(service.recover(owner)?.id).toBe(a.id);
    expect(() => service.view(a.id,other)).toThrow("another browser");
    expect(() => service.start(input(),owner)).toThrow("current investigation");
  });
  it("persists notes, flags, board connections and timeline with optimistic revision protection", () => {
    const a = service.begin(service.start(input(),owner).id,owner), ids = a.case.evidence.map(e => e.id);
    const p: Progress = { ...a.progress, notes:"Correlate the session and transfer.",bookmarks:[ids[0]],suspicious:[ids[1]],board:ids.slice(0,2),hypotheses:[{ id:"note-1",text:"Possible stolen session",kind:"hypothesis" }],connections:[{ from:ids[0],to:ids[1],kind:"unverified" }],report:{ ...a.progress.report,timeline:[...a.progress.report.timeline].reverse() } };
    expect(service.save(a.id,owner,p,0)).toMatchObject({ revision:1 });
    expect(service.view(a.id,owner).progress).toEqual(p);
    expect(() => service.save(a.id,owner,p,0)).toThrow("newer workspace");
    expect(() => service.save(a.id,other,p,1)).toThrow("another browser");
    expect(() => service.save(a.id,owner,{ ...p,bookmarks:["not-evidence"] },1)).toThrow("Unknown evidence");
  });
  it("times out at the server deadline and scores the last saved draft with no speed", () => {
    const a = service.begin(service.start(input(),owner).id,owner);
    clock = a.deadline! + 5000;
    const result = service.view(a.id,owner);
    expect(result.status).toBe("completed"); expect(result.result).toMatchObject({ timedOut:true,speed:0,elapsed:720000 });
    const saved = db.prepare("SELECT completed_at,score FROM game_sessions WHERE id=?").get(a.id) as { completed_at:number;score:number };
    expect(saved.completed_at).toBeTruthy(); expect(saved.score).toBe(result.result.score);
    expect(() => service.save(a.id,owner,a.progress,0)).toThrow("no longer active");
  });
  it("uses one team roster and one session, validates limits and preserves official result on kiosk reset", () => {
    expect(() => service.start({ ...input(),mode:"team",team:{ name:"Cyber Warriors",captain:"Ada",members:[] } },owner)).toThrow("Team size");
    const a = service.begin(service.start({ ...input(),mode:"team",team:{ name:"Cyber Warriors",captain:"Ada",members:["Grace","Lin"] } },owner).id,owner);
    expect(a.roster.members).toEqual(["Grace","Lin"]); expect(a.mode).toBe("team");
    const result = service.submit(a.id,owner,a.progress.report);
    service.reset(owner);
    expect(service.recover(owner)).toBeNull(); expect(() => service.view(a.id,owner)).toThrow("another browser");
    expect((db.prepare("SELECT score FROM game_sessions WHERE id=?").get(a.id) as { score:number }).score).toBe(result.result.score);
    expect((db.prepare("SELECT progress FROM dd_attempts WHERE id=?").get(a.id) as { progress:string }).progress).toBe("{}");
  });
  it("limits attempts and applies updated settings only to new attempts", () => {
    const i = input(), config = { ...defaultConfig, maxAttempts:1, hints:false };
    db.prepare("INSERT INTO dd_config(content,created_at) VALUES (?,?)").run(JSON.stringify(config),clock);
    const a = service.begin(service.start(i,owner).id,owner);
    expect(() => service.hint(a.id,owner)).toThrow("unavailable");
    service.submit(a.id,owner,a.progress.report); service.reset(owner);
    expect(() => service.start(i,owner)).toThrow("Attempt limit");
  });
  it("caps hints and rejects changed duplicate reports while accepting identical retries", () => {
    const a = service.begin(service.start(input(),owner).id,owner);
    for (let i=0;i<5;i++) service.hint(a.id,owner);
    const result = service.submit(a.id,owner,a.progress.report);
    expect(result.hints).toHaveLength(3); expect(result.result.penalty).toBe(75);
    expect(service.submit(a.id,owner,a.progress.report).result).toEqual(result.result);
    expect(() => service.submit(a.id,owner,{ ...a.progress.report,reasoning:{ incident:"Changed later" } })).toThrow("different report");
  });
  it("pins case versions and separates independent laptop, difficulty and mode boards", () => {
    const a = service.begin(service.start(input(),owner).id,owner);
    const edited = seedCases()[0].content; edited.title = "Revised case";
    service.saveCase("case-001",edited,"published");
    expect(service.view(a.id,owner).case.title).toBe("The Midnight Breach");
    const b = service.begin(service.start({ ...input(),difficulty:"expert" },other).id,other);
    expect(b.version).toBe(2); expect(b.case.evidence).toHaveLength(72);
    expect(a.boardKey).not.toBe(b.boardKey);
    service.submit(a.id,owner,a.progress.report); service.submit(b.id,other,b.progress.report);
    expect(service.leaderboard().boards).toHaveLength(2);
    expect(service.leaderboard(a.boardKey).entries).toHaveLength(1);
  });
  it("pins fair competition seeds, hides solutions until close and restricts admission", () => {
    const comp = { title:"IT stand",status:"open",caseId:"case-002",version:1,difficulty:"intermediate",seed:"fair-round",startAt:clock-1000,endAt:clock+900000,participation:"both",revealAfterClose:true,config:defaultConfig };
    db.prepare("INSERT INTO competitions VALUES ('event-1','digital-detective','IT stand','open',?,?)").run(JSON.stringify(comp),clock);
    const a = service.begin(service.start({ ...input(),competitionId:"event-1" },owner).id,owner), b = service.begin(service.start({ ...input(),competitionId:"event-1" },other).id,other);
    expect(a.case).toEqual(b.case); expect(a.boardKey).toBe(b.boardKey); expect(a.difficulty).toBe("intermediate");
    const result = service.submit(a.id,owner,a.progress.report); expect(result.solution).toBeNull(); expect(result.revealPending).toBe(true);
    comp.status = "closed"; db.prepare("UPDATE competitions SET status='closed',content=? WHERE id='event-1'").run(JSON.stringify(comp));
    expect(service.view(a.id,owner).solution).not.toBeNull();
    expect(() => service.start({ ...input(),competitionId:"event-1" },"owner-c")).toThrow("closed");
  });
  it("records every score adjustment in the existing audit table", () => {
    const a = service.begin(service.start(input(),owner).id,owner); service.submit(a.id,owner,a.progress.report);
    service.adjust(a.id,900,"Reviewed disputed evidence selection",1);
    expect(service.view(a.id,owner).result.score).toBe(900);
    expect(db.prepare("SELECT action FROM audit_log").all()).toEqual([{ action:"detective.score.adjust" }]);
    expect(service.leaderboard(a.boardKey).entries[0].score).toBe(900);
    expect(fields).toHaveLength(5);
  });
});
