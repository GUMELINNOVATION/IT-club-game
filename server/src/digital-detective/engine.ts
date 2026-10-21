import { createHash } from "node:crypto";
import { fields, type CaseContent } from "./cases.js";
import type { Config } from "./model.js";
export class DetectiveError extends Error { constructor(public status: number, message: string) { super(message); } }
export function shuffle<T>(items: T[], seed: string): T[] { return items.map((item, i) => ({ item, key: createHash("sha256").update(`${seed}:${i}`).digest("hex") })).sort((a, b) => a.key.localeCompare(b.key)).map(e => e.item); }
export type Report = { answers: Record<string, string>; citations: Record<string, string[]>; reasoning: Record<string, string>; timeline: string[] };
export function scoreReport(content: CaseContent, report: Report, elapsed: number, duration: number, hints: number, config: Config) {
  const correct = Object.fromEntries(fields.map(f => [f, report.answers[f] === content.solution.answers[f]]));
  const supported = (f: string) => { const ids = new Set(report.citations[f] ?? []), hits = content.solution.evidence[f].filter(id => ids.has(id)).length; return correct[f] && (report.reasoning[f]?.trim().length ?? 0) >= 20 && hits > ids.size - hits; };
  const categories: Record<string, number> = { incident: supported("incident") ? 150 : 0, entry: supported("entry") ? 150 : 0, asset: supported("asset") ? 150 : 0, timeline: 0, evidence: 0, containment: supported("containment") ? 100 : 0, completeness: 0 };
  let pairs = 0, ordered = 0;
  const target = content.solution.timeline;
  for (let i = 0; i < target.length; i++) for (let j = i + 1; j < target.length; j++) { pairs++; const a = report.timeline.indexOf(target[i]), b = report.timeline.indexOf(target[j]); if (a >= 0 && b > a) ordered++; }
  categories.timeline = Math.round(200 * ordered / pairs);
  for (const f of fields) {
    const selected = new Set(report.citations[f] ?? []), accepted = content.solution.evidence[f];
    const hits = accepted.filter(id => selected.has(id)).length, wrong = [...selected].filter(id => !accepted.includes(id)).length;
    const reasoned = (report.reasoning[f]?.trim().length ?? 0) >= 20;
    categories.evidence += correct[f] && reasoned ? Math.round(40 * Math.max(0, hits - wrong) / accepted.length) : 0;
    categories.completeness += reasoned && selected.size > 0 && report.answers[f] ? 5 : 0;
  }
  categories.completeness += supported("root") ? 25 : 0;
  const base = Object.values(categories).reduce((a, b) => a + b, 0), accuracy = base / 10;
  const speed = accuracy >= 70 ? Math.round(config.speedBonus * Math.max(0, 1 - elapsed / duration)) : 0, penalty = hints * config.hintPenalty;
  return { score: Math.max(0, base + speed - penalty), base, accuracy, speed, penalty, categories, correct, elapsed };
}
