import { describe, expect, it } from "vitest";
import { seedCases, caseSchema, fields } from "./cases.js";
import { scoreReport, shuffle, type Report } from "./engine.js";
import { defaultConfig } from "./model.js";

describe("Digital Detective case integrity and scoring", () => {
  for (const { id, content } of seedCases()) {
    it(`${id} has a supported, internally ordered complete solution`, () => {
      expect(caseSchema.safeParse(content).success).toBe(true);
      expect(content.evidence.length).toBe(12);
      const incidentRecords = content.evidence.slice(0,6);
      expect(incidentRecords.map(e => Date.parse(e.timestamp))).toEqual(incidentRecords.map(e => Date.parse(e.timestamp)).sort((a,b) => a-b));
      const report: Report = { answers: content.solution.answers, citations: content.solution.evidence, reasoning: Object.fromEntries(fields.map(f => [f, "These linked original records establish this finding."])), timeline: content.solution.timeline };
      const result = scoreReport(content, report, 0, 720000, 0, defaultConfig);
      expect(result).toMatchObject({ base: 1000, score: 1200, accuracy: 100, speed: 200, penalty: 0 });
      expect(result.categories).toEqual({ incident:150, entry:150, asset:150, timeline:200, evidence:200, containment:100, completeness:50 });
      expect(scoreReport(content, report, 360000,720000,2,defaultConfig)).toMatchObject({ score:1050, speed:100, penalty:50 });
      expect(scoreReport(content, report,720000,720000,0,defaultConfig).speed).toBe(0);
    });
  }
  it("gates speed on accuracy and does not reward citation spraying or short reasoning", () => {
    const c = seedCases()[0].content;
    const empty: Report = { answers:{}, citations:{}, reasoning:{}, timeline:[...c.solution.timeline].reverse() };
    expect(scoreReport(c,empty,0,1000,0,defaultConfig)).toMatchObject({ score:0,speed:0,accuracy:0 });
    const report: Report = { answers:c.solution.answers, citations:Object.fromEntries(fields.map(f => [f,c.evidence.map(e => e.id)])), reasoning:Object.fromEntries(fields.map(f => [f,"Enough reasoning to explain the connection."])), timeline:c.solution.timeline };
    expect(scoreReport(c,report,0,1000,0,defaultConfig).categories.evidence).toBe(0);
    expect(scoreReport(c,report,0,1000,0,defaultConfig).speed).toBe(0);
    report.citations = c.solution.evidence; report.reasoning = {};
    expect(scoreReport(c,report,0,1000,0,defaultConfig).categories.evidence).toBe(0);
    expect(scoreReport(c,report,0,1000,0,defaultConfig).categories.incident).toBe(0);
  });
  it("awards partial relative-order timeline credit and deterministic seeded order", () => {
    const c = seedCases()[0].content, timeline = [...c.solution.timeline];
    [timeline[0],timeline[1]] = [timeline[1],timeline[0]];
    expect(scoreReport(c,{ answers:{},citations:{},reasoning:{},timeline },1000,1000,0,defaultConfig).categories.timeline).toBe(187);
    expect(shuffle(timeline,"a")).toEqual(shuffle(timeline,"a"));
    expect(shuffle(timeline,"a")).not.toEqual(shuffle(timeline,"b"));
  });
  it("rejects incomplete or unreferenced private solution rubrics", () => {
    const c = seedCases()[0].content;
    c.solution.timeline[0] = "unknown";
    expect(caseSchema.safeParse(c).success).toBe(false);
    const other = seedCases()[0].content; other.solution.evidence.incident = ["unknown"];
    expect(caseSchema.safeParse(other).success).toBe(false);
  });
});
