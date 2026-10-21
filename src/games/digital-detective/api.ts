export const fields = ["incident", "entry", "asset", "root", "containment"] as const;
export const labels: Record<string, string> = { incident: "Incident type", entry: "Entry point", asset: "Compromised account / asset", root: "Root cause", containment: "Containment recommendation" };
export const difficulties = ["beginner", "intermediate", "advanced", "expert"] as const;
export type Config = { solo: boolean; teams: boolean; teamMin: number; teamMax: number; hints: boolean; hintPenalty: number; speedBonus: number; maxAttempts: number; leaderboardVisible: boolean; profiles: Record<string, { seconds: number; records: number }> };
export type Evidence = { id: string; category: string; title: string; timestamp: string; details: Record<string, string> };
export type Report = { answers: Record<string, string>; citations: Record<string, string[]>; reasoning: Record<string, string>; timeline: string[] };
export type Progress = { notes: string; bookmarks: string[]; suspicious: string[]; board: string[]; connections: { from: string; to: string; kind: "hypothesis" | "supported" | "unverified" }[]; hypotheses: { id: string; text: string; kind: "hypothesis" | "supported" | "unverified" }[]; report: Report };
export type CaseContent = { title: string; organization: string; briefing: string; actors: string[]; objectives: string[]; evidence: Evidence[]; timeline: { id: string; label: string }[]; options: Record<string, string[]> };
export type Attempt = { id: string; status: string; mode: string; caseId: string; version: number; difficulty: string; competitionId: string | null; boardKey: string; roster: { name: string; captain: string; members: string[] } | null; serverNow: number; startedAt: number | null; deadline: number | null; config: Config; case: CaseContent; progress: Progress; revision: number; hints: string[]; hintCount: number; result: { score: number; base: number; accuracy: number; speed: number; penalty: number; categories: Record<string, number>; correct: Record<string, boolean>; elapsed: number; timedOut: boolean; adjustment?: string } | null; solution: { answers: Record<string, string>; timeline: string[]; evidence: Record<string, string[]>; explanation: string } | null; revealPending: boolean };
export type Competition = { id: string; title: string; status: string; caseId: string; version: number; difficulty: string; seed: string; startAt: number; endAt: number; participation: string; revealAfterClose: boolean };
export type Catalog = { config: Config; cases: { id: string; version: number; title: string; organization: string; briefing: string }[]; competitions: Competition[] };
export type Boards = { visible: boolean; boards: { key: string; title: string; version: number; difficulty: string; mode: string; competitionId: string | null }[]; entries: { id: string; rank: number; challenger: string; score: number; accuracy: number; elapsed: number; completedAt: number; boardKey: string }[] };
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/detective${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch { throw new Error("Cannot reach the arena API. Check the connection and make sure npm run dev:server is running, then retry."); }
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    const fallback = r.status === 404
      ? "The running API does not have Digital Detective installed. Restart the arena API with npm run dev:server, then retry."
      : r.status === 429 ? "Too many requests. Wait a minute before retrying."
      : "The investigation API is temporarily unavailable. Check that the arena server is running, then retry.";
    throw new Error(data.error ?? fallback);
  }
  if (r.status !== 204 && !r.headers.get("content-type")?.includes("application/json")) throw new Error("The arena returned a web page instead of investigation data. Restart the arena API and check the /api proxy, then retry.");
  return r.status === 204 ? undefined as T : r.json();
}
export function identity() { let id = localStorage.getItem("arena-participant"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("arena-participant", id); } return id; }
export function clearDetectiveStorage() { for (const key of Object.keys(localStorage)) if (key.startsWith("detective-") || key === "arena-participant" || key === "arena-challenger") localStorage.removeItem(key); }
export const duration = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;
