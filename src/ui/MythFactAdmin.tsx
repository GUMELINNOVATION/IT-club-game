import { useEffect, useState } from "react";
import { Archive, Download, FileUp, ListChecks, Plus, RefreshCw, Save, Settings2, ShieldAlert, Ticket, Trash2, Trophy } from "lucide-react";

type Mode = "classic" | "speed" | "survival" | "confidence" | "team" | "event";
type Config = {
  enabled: boolean; availableModes: Mode[]; questionCount: number; teamQuestionCount: number;
  questionSeconds: number; teamSeconds: number; totalSeconds: number; progressive: boolean;
  basePoints: number; speedBonus: number; streakBonus: number; streakCap: number; confidenceEnabled: boolean;
  confidenceCorrect: number[]; confidenceWrong: number[]; doubleBonus: number; finalBonus: number;
  hints: boolean; solo: boolean; teams: boolean; teamMin: number; teamMax: number;
  leaderboardVisible: boolean; maxAttempts: number; difficulty: number; categories: string[];
};
type QuestionRow = {
  id: string; statement: string; fact: boolean; explanation: string; category: string; difficulty: number;
  hint: string; source: string; reviewStatus: string; active: boolean; image: string;
  createdAt: string; reviewedAt: string | null; version: number;
};
type ChallengeRow = {
  id: string; title: string; version: number; participation: string; registration_open: number;
  published: number; reveal_after_close: number; question_refs: { id: string; version: number }[]; config: Config;
};
type Entry = { id: string; rank: number; challenger: string; score: number; accuracy: number; correct: number; incorrect: number; longestStreak: number; mode: string; participation: string; boardKey: string; completedAt: number };
type Boards = { boards: { key: string; mode: string; participation: string; version: number | null; configId: number }[]; entries: Entry[]; visible: boolean };

const categories = ["Everyday Technology", "Cybersecurity", "Online Privacy", "Artificial Intelligence", "Smartphones & Internet", "Social Media", "Digital Forensics & IT"];
const modes: Mode[] = ["classic", "speed", "survival", "confidence", "team", "event"];

async function call<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "Request failed.");
  return body as T;
}
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Request failed.";
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const emptyQuestion = (): Omit<QuestionRow, "id" | "version" | "createdAt" | "reviewedAt"> => ({
  statement: "", fact: false, explanation: "", category: categories[0], difficulty: 2, hint: "", source: "",
  reviewStatus: "draft", active: true, image: ""
});

export default function MythFactAdmin({ role }: { role: string }) {
  const canEdit = role === "super_admin" || role === "event_manager";
  const canCodes = canEdit || role === "volunteer";
  const [tab, setTab] = useState<"results" | "questions" | "rules" | "events">("questions");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  return <section className="myth-admin">
    <div className="myth-admin-head"><div><span className="eyebrow"><span className="eyebrow-line" /> MYTH OR FACT · CONTENT & EVENTS</span><h2>DIGITAL <span>TRUTH CONTROL.</span></h2></div><span className="myth-admin-role">{role.replace("_", " ").toUpperCase()}</span></div>
    <div className="myth-admin-tabs" role="tablist" aria-label="Myth or Fact administration">
      {([["questions", "STATEMENTS", ListChecks], ["rules", "GAME RULES", Settings2], ["events", "EVENTS", Ticket], ["results", "RESULTS", Trophy]] as const).map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => { setTab(id); setError(""); setNotice(""); }}><Icon size={14} /> {label}</button>)}
    </div>
    {error && <div className="myth-admin-error" role="alert"><ShieldAlert size={15} /> {error}</div>}
    {notice && <div className="myth-admin-notice" role="status">{notice}</div>}
    {tab === "questions" && <Questions canEdit={canEdit} setError={setError} setNotice={setNotice} />}
    {tab === "rules" && <Rules canEdit={canEdit} setError={setError} setNotice={setNotice} />}
    {tab === "events" && <Events canEdit={canEdit} canCodes={canCodes} setError={setError} setNotice={setNotice} />}
    {tab === "results" && <Results setError={setError} />}
  </section>;
}

function Questions({ canEdit, setError, setNotice }: { canEdit: boolean; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ search: "", category: "", difficulty: "", reviewStatus: "", active: "", sort: "statement" });
  const [editing, setEditing] = useState<Omit<QuestionRow, "id" | "version" | "createdAt" | "reviewedAt"> & { id?: string } | null>(null);
  const [importFormat, setImportFormat] = useState<"json" | "csv">("csv");
  const [importText, setImportText] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const load = async (next = filters) => {
    try {
      const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value !== "") as [string, string][]);
      const result = await call<{ questions: QuestionRow[]; total: number }>(`/api/myth/admin/questions?${query}`);
      setRows(result.questions); setTotal(result.total); setError("");
    } catch (cause) { setError(message(cause)); }
  };
  useEffect(() => { void load(); }, []); // Initial listing.

  const edit = (row: QuestionRow) => { const { id, version: _version, createdAt: _createdAt, reviewedAt: _reviewedAt, ...rest } = row; setEditing({ ...rest, id }); };
  const save = async () => {
    if (!editing) return;
    try {
      const body = { ...editing };
      if (body.id) await call(`/api/myth/admin/questions/${body.id}`, json("PUT", body));
      else await call("/api/myth/admin/questions", json("POST", body));
      setNotice(body.id ? "A new version was saved. Existing runs keep their original version." : "Statement created.");
      setEditing(null); await load();
    } catch (cause) { setError(message(cause)); }
  };
  const archive = async (id: string) => {
    if (!window.confirm("Archive this statement? It will stop appearing in new runs but remain in history.")) return;
    try { await call(`/api/myth/admin/questions/${id}`, { method: "DELETE" }); setNotice("Statement archived."); await load(); }
    catch (cause) { setError(message(cause)); }
  };
  const runImport = async () => {
    try {
      const result = await call<{ count: number; saved: boolean }>("/api/myth/admin/import", json("POST", { format: importFormat, content: importText, dryRun }));
      setNotice(`${result.count} statement${result.count === 1 ? "" : "s"} ${result.saved ? "imported" : "validated. Nothing was saved because this was a dry run"}.`);
      if (result.saved) await load();
    } catch (cause) { setError(message(cause)); }
  };

  return <div className="myth-admin-panel">
    <div className="myth-admin-toolbar">
      <form className="myth-admin-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <input className="myth-input" placeholder="Search statements…" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <select className="myth-input" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
        <select className="myth-input" value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="">All levels</option>{[1, 2, 3, 4].map((level) => <option key={level} value={level}>Level {level}</option>)}</select>
        <select className="myth-input" value={filters.reviewStatus} onChange={(event) => setFilters({ ...filters, reviewStatus: event.target.value })}><option value="">Any review</option><option value="draft">Draft</option><option value="reviewed">Reviewed</option></select>
        <select className="myth-input" value={filters.active} onChange={(event) => setFilters({ ...filters, active: event.target.value })}><option value="">Any status</option><option value="true">Active</option><option value="false">Archived</option></select>
        <button className="outline-button" type="submit"><RefreshCw size={13} /> FILTER</button>
      </form>
      <div className="myth-admin-actions">
        {canEdit && <button className="primary-button" onClick={() => setEditing(emptyQuestion())}><Plus size={14} /> NEW STATEMENT</button>}
        <a className="outline-button" href="/api/myth/admin/export?format=csv"><Download size={13} /> CSV</a>
        <a className="outline-button" href="/api/myth/admin/export"><Download size={13} /> JSON</a>
      </div>
    </div>
    <p className="myth-admin-hint">{rows.length} shown · {total} total statements. Reviewed and active statements are eligible for casual runs; event sets pin exact versions.</p>

    {canEdit && editing && <div className="myth-editor">
      <h3>{editing.id ? "EDIT STATEMENT · SAVES AS A NEW VERSION" : "NEW STATEMENT"}</h3>
      <label>STATEMENT<textarea className="myth-input" rows={2} value={editing.statement} onChange={(event) => setEditing({ ...editing, statement: event.target.value })} maxLength={700} /></label>
      <div className="myth-editor-row">
        <label>ANSWER<select className="myth-input" value={String(editing.fact)} onChange={(event) => setEditing({ ...editing, fact: event.target.value === "true" })}><option value="false">MYTH</option><option value="true">FACT</option></select></label>
        <label>CATEGORY<select className="myth-input" value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label>LEVEL<select className="myth-input" value={editing.difficulty} onChange={(event) => setEditing({ ...editing, difficulty: Number(event.target.value) })}>{[1, 2, 3, 4].map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        <label>REVIEW<select className="myth-input" value={editing.reviewStatus} onChange={(event) => setEditing({ ...editing, reviewStatus: event.target.value })}><option value="draft">DRAFT</option><option value="reviewed">REVIEWED</option></select></label>
      </div>
      <label>EXPLANATION<textarea className="myth-input" rows={3} value={editing.explanation} onChange={(event) => setEditing({ ...editing, explanation: event.target.value })} maxLength={2500} /></label>
      <label>HINT · OPTIONAL<textarea className="myth-input" rows={2} value={editing.hint} onChange={(event) => setEditing({ ...editing, hint: event.target.value })} maxLength={700} /></label>
      <label>SOURCE / REFERENCE<input className="myth-input" value={editing.source} onChange={(event) => setEditing({ ...editing, source: event.target.value })} maxLength={2000} /></label>
      <label>IMAGE · OPTIONAL PNG/JPG/WEBP, MAX 300 KB<input className="myth-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 300 * 1024) { setError("Image must be 300 KB or smaller."); return; }
        const reader = new FileReader();
        reader.onload = () => setEditing({ ...editing, image: String(reader.result) });
        reader.readAsDataURL(file);
      }} />{editing.image && <button className="myth-link-button" onClick={() => setEditing({ ...editing, image: "" })}>REMOVE IMAGE</button>}</label>
      <label className="myth-check"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> ACTIVE · ELIGIBLE FOR NEW RUNS</label>
      <div className="myth-admin-actions"><button className="primary-button" onClick={save}><Save size={14} /> SAVE STATEMENT</button><button className="outline-button" onClick={() => setEditing(null)}>CANCEL</button></div>
    </div>}

    <div className="myth-admin-table-wrap">
      <table className="myth-admin-table">
        <thead><tr><th>STATEMENT</th><th>CATEGORY</th><th>LEVEL</th><th>REVIEW</th><th>ACTIVE</th><th>ACTIONS</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className={row.active ? "" : "myth-row-muted"}>
          <td><strong>{row.statement.slice(0, 120)}{row.statement.length > 120 ? "…" : ""}</strong><small>{row.fact ? "FACT" : "MYTH"} · v{row.version} · {row.id}</small></td>
          <td>{row.category}</td><td>{row.difficulty}</td><td>{row.reviewStatus.toUpperCase()}</td><td>{row.active ? "YES" : "NO"}</td>
          <td className="myth-admin-row-actions">{canEdit ? <><button onClick={() => edit(row)}>EDIT</button><button onClick={() => archive(row.id)} aria-label={`Archive ${row.statement.slice(0, 40)}`}><Archive size={13} /></button></> : <span>READ ONLY</span>}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="myth-admin-empty">No statements match those filters.</p>}
    </div>

    {canEdit && <div className="myth-import">
      <h3><FileUp size={15} /> IMPORT STATEMENTS</h3>
      <p>CSV columns: {["statement", "fact", "explanation", "category", "difficulty", "hint", "source", "reviewStatus", "active"].join(", ")}. JSON accepts an array in the same shape. Duplicate wording is rejected.</p>
      <div className="myth-editor-row"><label>FORMAT<select className="myth-input" value={importFormat} onChange={(event) => setImportFormat(event.target.value as "json" | "csv")}><option value="csv">CSV</option><option value="json">JSON</option></select></label><label>FILE<input className="myth-input" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then(setImportText); }} /></label></div>
      <textarea className="myth-input" rows={4} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste CSV or JSON here…" />
      <label className="myth-check"><input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} /> DRY RUN · VALIDATE WITHOUT SAVING</label>
      <div className="myth-admin-actions"><button className="outline-button" disabled={!importText.trim()} onClick={runImport}><FileUp size={14} /> {dryRun ? "VALIDATE" : "IMPORT"}</button><button className="myth-link-button" onClick={() => setImportText("")}>CLEAR</button></div>
    </div>}
  </div>;
}

function Rules({ canEdit, setError, setNotice }: { canEdit: boolean; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  useEffect(() => { call<{ id: number; config: Config }>("/api/myth/admin/config").then((result) => { setConfig(result.config); setConfigId(result.id); }).catch((cause) => setError(message(cause))); }, []);
  if (!config) return <div className="myth-admin-panel"><p className="myth-admin-hint">Loading current rules…</p></div>;
  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig({ ...config, [key]: value });
  const number = (key: keyof Config, label: string, min: number, max: number) => <label key={key}>{label}<input className="myth-input" type="number" min={min} max={max} value={Number(config[key])} onChange={(event) => update(key, Number(event.target.value) as Config[typeof key])} /></label>;
  const save = async () => {
    try {
      const result = await call<{ id: number; config: Config }>("/api/myth/admin/config", json("PUT", config));
      setConfigId(result.id); setConfig(result.config); setNotice(`Rules saved as configuration #${result.id}. New runs use it; completed runs keep their original rules.`);
    } catch (cause) { setError(message(cause)); }
  };
  return <div className="myth-admin-panel">
    <div className="myth-admin-toolbar"><p className="myth-admin-hint">Active rules: configuration #{configId}. Saving creates a new immutable version, so old rankings stay comparable.</p>{canEdit && <button className="primary-button" onClick={save}><Save size={14} /> SAVE NEW VERSION</button>}</div>
    <fieldset disabled={!canEdit} className="myth-rules">
      <div className="myth-editor-row">
        <label className="myth-check"><input type="checkbox" checked={config.enabled} onChange={(event) => update("enabled", event.target.checked)} /> GAME ENABLED</label>
        <label className="myth-check"><input type="checkbox" checked={config.progressive} onChange={(event) => update("progressive", event.target.checked)} /> PROGRESSIVE DIFFICULTY</label>
        <label className="myth-check"><input type="checkbox" checked={config.hints} onChange={(event) => update("hints", event.target.checked)} /> HINTS ENABLED</label>
        <label className="myth-check"><input type="checkbox" checked={config.confidenceEnabled} onChange={(event) => update("confidenceEnabled", event.target.checked)} /> CONFIDENCE SCORING</label>
        <label className="myth-check"><input type="checkbox" checked={config.solo} onChange={(event) => update("solo", event.target.checked)} /> SOLO PLAY</label>
        <label className="myth-check"><input type="checkbox" checked={config.teams} onChange={(event) => update("teams", event.target.checked)} /> TEAM PLAY</label>
        <label className="myth-check"><input type="checkbox" checked={config.leaderboardVisible} onChange={(event) => update("leaderboardVisible", event.target.checked)} /> PUBLIC LEADERBOARDS</label>
      </div>
      <div className="myth-editor-row">
        {number("questionCount", "CLASSIC QUESTIONS", 10, 30)}{number("teamQuestionCount", "TEAM QUESTIONS", 10, 15)}
        {number("questionSeconds", "SECONDS / SOLO", 5, 120)}{number("teamSeconds", "SECONDS / TEAM", 10, 180)}
        {number("totalSeconds", "SPEED RUSH SECONDS", 15, 180)}{number("difficulty", "MAX DIFFICULTY", 1, 4)}
      </div>
      <div className="myth-editor-row">
        {number("basePoints", "BASE POINTS", 0, 1000)}{number("speedBonus", "MAX SPEED BONUS", 0, 500)}
        {number("streakBonus", "STREAK POINTS", 0, 100)}{number("streakCap", "STREAK CAP", 1, 20)}
        {number("doubleBonus", "DOUBLE TROUBLE BONUS", 0, 1000)}{number("finalBonus", "FINAL BONUS", 0, 1000)}
        {number("maxAttempts", "ATTEMPT LIMIT · 0 = UNLIMITED", 0, 100)}{number("teamMin", "MIN TEAM", 2, 12)}{number("teamMax", "MAX TEAM", 2, 12)}
      </div>
      <div className="myth-editor-row">
        {[0, 1, 2].map((level) => <label key={level}>{["LOW", "MEDIUM", "HIGH"][level]} CORRECT POINTS<input className="myth-input" type="number" min={0} max={1000} value={config.confidenceCorrect[level]} onChange={(event) => update("confidenceCorrect", config.confidenceCorrect.map((value, index) => index === level ? Number(event.target.value) : value))} /></label>)}
        {[0, 1, 2].map((level) => <label key={`w${level}`}>{["LOW", "MEDIUM", "HIGH"][level]} WRONG PENALTY<input className="myth-input" type="number" min={0} max={500} value={config.confidenceWrong[level]} onChange={(event) => update("confidenceWrong", config.confidenceWrong.map((value, index) => index === level ? Number(event.target.value) : value))} /></label>)}
      </div>
      <div className="myth-editor-row"><span className="myth-field-label">MODES</span>{modes.map((mode) => <label key={mode} className="myth-check"><input type="checkbox" checked={config.availableModes.includes(mode)} onChange={(event) => update("availableModes", event.target.checked ? [...config.availableModes, mode] : config.availableModes.filter((item) => item !== mode))} /> {mode.toUpperCase()}</label>)}</div>
      <div className="myth-editor-row"><span className="myth-field-label">CATEGORIES</span>{categories.map((category) => <label key={category} className="myth-check"><input type="checkbox" checked={config.categories.includes(category)} onChange={(event) => update("categories", event.target.checked ? [...config.categories, category] : config.categories.filter((item) => item !== category))} /> {category}</label>)}</div>
    </fieldset>
  </div>;
}

function Events({ canEdit, canCodes, setError, setNotice }: { canEdit: boolean; canCodes: boolean; setError: (value: string) => void; setNotice: (value: string) => void }) {
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [form, setForm] = useState({ title: "", participation: "both" as "solo" | "team" | "both", revealAfterClose: true, questionIds: [] as string[] });
  const [codes, setCodes] = useState<string[]>([]);
  const [codeForm, setCodeForm] = useState({ challengeId: "", count: 20, label: "Main event" });

  const load = async () => {
    try {
      const [loadedChallenges, loadedQuestions, rules] = await Promise.all([
        call<ChallengeRow[]>("/api/myth/admin/challenges"),
        call<{ questions: QuestionRow[] }>("/api/myth/admin/questions?reviewStatus=reviewed&active=true"),
        call<{ id: number; config: Config }>("/api/myth/admin/config")
      ]);
      setChallenges(loadedChallenges); setQuestions(loadedQuestions.questions); setConfig(rules.config);
    } catch (cause) { setError(message(cause)); }
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!config) return;
    try {
      const result = await call<{ id: string }>("/api/myth/admin/challenges", json("POST", {
        title: form.title, participation: form.participation, revealAfterClose: form.revealAfterClose,
        questionIds: form.questionIds, config: { ...config, availableModes: ["event"] }
      }));
      setNotice("Event created as a draft. Publish it, then open registration when ready.");
      setForm({ title: "", participation: "both", revealAfterClose: true, questionIds: [] });
      await load();
      setCodeForm({ ...codeForm, challengeId: result.id });
    } catch (cause) { setError(message(cause)); }
  };
  const setStatus = async (challenge: ChallengeRow, published: boolean, registrationOpen: boolean) => {
    try {
      await call(`/api/myth/admin/challenges/${challenge.id}/status`, json("POST", { published, registrationOpen }));
      setNotice(registrationOpen ? "Registration opened. Use entry codes to admit participants." : "Registration closed. Answers are now visible for completed event runs unless the set was configured otherwise.");
      await load();
    } catch (cause) { setError(message(cause)); }
  };
  const issue = async () => {
    try {
      const result = await call<{ codes: string[] }>(`/api/myth/admin/challenges/${codeForm.challengeId}/codes`, json("POST", { count: codeForm.count, label: codeForm.label }));
      setCodes(result.codes); setNotice(`${result.codes.length} single-use codes generated. Copy them now; they cannot be shown again.`);
    } catch (cause) { setError(message(cause)); }
  };

  return <div className="myth-admin-panel">
    {canEdit && <div className="myth-editor">
      <h3><Plus size={15} /> CREATE FIXED-SET EVENT</h3>
      <div className="myth-editor-row">
        <label>TITLE<input className="myth-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={100} placeholder="Friday Digital Truth Challenge" /></label>
        <label>PARTICIPATION<select className="myth-input" value={form.participation} onChange={(event) => setForm({ ...form, participation: event.target.value as "solo" | "team" | "both" })}><option value="both">SOLO OR TEAM</option><option value="solo">SOLO ONLY</option><option value="team">TEAM ONLY</option></select></label>
        <label className="myth-check"><input type="checkbox" checked={form.revealAfterClose} onChange={(event) => setForm({ ...form, revealAfterClose: event.target.checked })} /> HIDE ANSWERS UNTIL REGISTRATION CLOSES</label>
      </div>
      <label>FIXED STATEMENTS · SELECT 0 TO AUTO-PICK WITH CURRENT RULES (10–30 REQUIRED)
        <select multiple className="myth-input myth-multiselect" value={form.questionIds} onChange={(event) => setForm({ ...form, questionIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>
          {questions.map((question) => <option key={question.id} value={question.id}>L{question.difficulty} · {question.category} · {question.statement.slice(0, 90)}</option>)}
        </select>
      </label>
      <p className="myth-admin-hint">The event snapshots each selected statement's current version plus all current rule settings. Old events remain playable exactly as designed.</p>
      <div className="myth-admin-actions"><button className="primary-button" onClick={create} disabled={form.title.trim().length < 3}><Plus size={14} /> CREATE DRAFT EVENT</button></div>
    </div>}

    <div className="myth-admin-table-wrap">
      <table className="myth-admin-table">
        <thead><tr><th>EVENT</th><th>SET</th><th>PARTICIPATION</th><th>STATE</th><th>ACTIONS</th></tr></thead>
        <tbody>{challenges.map((challenge) => <tr key={challenge.id}>
          <td><strong>{challenge.title}</strong><small>v{challenge.version} · {challenge.id.slice(0, 8)}</small></td>
          <td>{challenge.question_refs.length} statements</td><td>{challenge.participation.toUpperCase()}</td>
          <td>{challenge.published ? "PUBLISHED" : "DRAFT"} · {challenge.registration_open ? "OPEN" : "CLOSED"}</td>
          <td className="myth-admin-row-actions">{canEdit && <>
            {!challenge.published && <button onClick={() => setStatus(challenge, true, false)}>PUBLISH</button>}
            {challenge.published && !challenge.registration_open && <button onClick={() => setStatus(challenge, true, true)}>OPEN</button>}
            {challenge.registration_open && <button onClick={() => setStatus(challenge, true, false)}>CLOSE</button>}
          </>}{canCodes && challenge.registration_open && <button onClick={() => setCodeForm({ ...codeForm, challengeId: challenge.id })}><Ticket size={13} /> CODES</button>}</td>
        </tr>)}</tbody>
      </table>
      {!challenges.length && <p className="myth-admin-empty">No events yet. Create a draft to begin.</p>}
    </div>

    {canCodes && <div className="myth-import">
      <h3><Ticket size={15} /> ISSUE ENTRY CODES</h3>
      <div className="myth-editor-row">
        <label>EVENT<select className="myth-input" value={codeForm.challengeId} onChange={(event) => setCodeForm({ ...codeForm, challengeId: event.target.value })}><option value="">Choose an open event…</option>{challenges.filter((challenge) => challenge.registration_open).map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.title}</option>)}</select></label>
        <label>COUNT<input className="myth-input" type="number" min={1} max={100} value={codeForm.count} onChange={(event) => setCodeForm({ ...codeForm, count: Number(event.target.value) })} /></label>
        <label>LABEL<input className="myth-input" value={codeForm.label} onChange={(event) => setCodeForm({ ...codeForm, label: event.target.value })} maxLength={80} /></label>
      </div>
      <div className="myth-admin-actions"><button className="outline-button" onClick={issue} disabled={!codeForm.challengeId}><Ticket size={14} /> GENERATE CODES</button></div>
      {codes.length > 0 && <div className="myth-codes"><span>COPY THESE SINGLE-USE CODES NOW</span><textarea className="myth-input" readOnly rows={Math.min(10, codes.length)} value={codes.join("\n")} /></div>}
    </div>}
  </div>;
}

function Results({ setError }: { setError: (value: string) => void }) {
  const [data, setData] = useState<Boards | null>(null);
  const [selected, setSelected] = useState("");
  const load = async () => {
    try { setData(await call<Boards>("/api/myth/admin/results")); }
    catch (cause) { setError(message(cause)); }
  };
  useEffect(() => { void load(); }, []);
  const boards = data?.boards ?? [];
  const current = selected || boards[0]?.key || "";
  const rows = (data?.entries ?? []).filter((entry) => entry.boardKey === current);
  return <div className="myth-admin-panel">
    <div className="myth-admin-toolbar">
      <div className="myth-admin-filters"><select className="myth-input" value={current} onChange={(event) => setSelected(event.target.value)}>{boards.map((board) => <option key={board.key} value={board.key}>{board.mode.toUpperCase()} · {board.participation.toUpperCase()} · {board.version ? `EVENT v${board.version}` : `RULES #${board.configId}`}</option>)}</select><button className="outline-button" onClick={load}><RefreshCw size={13} /> REFRESH</button></div>
      <a className="outline-button" href="/api/myth/admin/rankings.csv"><Download size={13} /> EXPORT ALL CSV</a>
    </div>
    {!boards.length && <p className="myth-admin-empty">No completed runs yet.</p>}
    {rows.length > 0 && <div className="myth-admin-table-wrap"><table className="myth-admin-table">
      <thead><tr><th>RANK</th><th>CHALLENGER</th><th>SCORE</th><th>ACCURACY</th><th>STREAK</th><th>COMPLETED</th></tr></thead>
      <tbody>{rows.map((entry) => <tr key={entry.id}><td>{entry.rank}</td><td><strong>{entry.challenger}</strong><small>{entry.participation.toUpperCase()}</small></td><td>{entry.score.toLocaleString()}</td><td>{entry.accuracy}%</td><td>{entry.longestStreak}</td><td>{new Date(entry.completedAt).toLocaleString()}</td></tr>)}</tbody>
    </table></div>}
    {data && !data.visible && <p className="myth-admin-hint"><Trash2 size={13} /> Public leaderboards are currently hidden in the active rules. Staff results are still available here.</p>}
  </div>;
}
