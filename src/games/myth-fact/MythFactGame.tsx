import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CircleHelp, Flame, Heart, Lightbulb, RotateCcw, ShieldAlert,
  Sparkles, Timer, Trophy, Users, X, Zap
} from "lucide-react";
import { ChallengerName, useChallengerIdentity } from "../../ui/arena-data";
import { playSound } from "../../ui/sound";
import "./myth-fact.css";

type Mode = "classic" | "speed" | "survival" | "confidence" | "team" | "event";
type Config = {
  enabled: boolean; availableModes: Mode[]; questionCount: number; teamQuestionCount: number;
  questionSeconds: number; teamSeconds: number; totalSeconds: number; confidenceEnabled: boolean;
  confidenceCorrect: number[]; confidenceWrong: number[]; hints: boolean; solo: boolean; teams: boolean;
  teamMin: number; teamMax: number; leaderboardVisible: boolean; maxAttempts: number; difficulty: number; categories: string[];
};
type ChallengeInfo = { id: string; title: string; version: number; registrationOpen: boolean; participation: "solo" | "team" | "both"; questionCount: number; revealAfterClose: boolean };
type Meta = { config: Config; configId: number; categories: string[]; questionCount: number; challenges: ChallengeInfo[] };
type Review = {
  ordinal: number; statement: string; fact: boolean; explanation: string; source: string; answer: boolean | null;
  confidence: number | null; correct: boolean; points: number | null; bonus: number | null; responseMs: number | null;
  hinted: boolean; pair: number | null; final: boolean;
};
type QuestionView = { ordinal: number; statement: string; category: string; difficulty: number; image: string; deadline: number; pair: number | null; final: boolean; hinted: boolean; hint: string | null; hintAvailable: boolean };
type ResultView = { accuracy: number; averageMs: number; totalResponseMs: number; elapsedMs: number; rank: number | null; previousBest: number | null; personalBest: boolean; record: boolean; badge: string };
type AttemptView = {
  id: string; mode: Mode; status: "countdown" | "question" | "reveal" | "completed" | "abandoned";
  serverNow: number; startAt: number; totalDeadline: number | null; score: number; correct: number; incorrect: number;
  streak: number; longestStreak: number; streakTitle: string | null; lives: number; hintUsed: boolean; config: Config;
  boardKey: string; participation: "solo" | "team"; team: { name: string; captain: string; members: string[] } | null;
  questionCount: number; cursor: number; challengeVersion: number | null; configId: number;
  question: QuestionView | null; reveal: Review | null; last: Review | null; review: Review[];
  explanationsWithheld: boolean; result: ResultView | null;
};

const modeOptions: { id: Mode; label: string; tagline: string; icon: typeof Zap }[] = [
  { id: "classic", label: "Classic Truth Run", tagline: "15 statements, a steady timer, and speed plus streak points.", icon: CircleHelp },
  { id: "speed", label: "Speed Rush", tagline: "60 seconds. Clear as many statements as you can before the clock runs out.", icon: Zap },
  { id: "survival", label: "Survival", tagline: "Three lives. Every wrong answer or timeout costs one; reach zero and the run ends.", icon: Heart },
  { id: "confidence", label: "Confidence Battle", tagline: "Call it Myth or Fact, then stake Low, Medium, or High confidence.", icon: Flame },
  { id: "team", label: "Team Discussion", tagline: "Two to six players share one device and one score. Talk it through.", icon: Users },
  { id: "event", label: "Daily / Event", tagline: "Enter a scheduled staff-run set with an official entry code.", icon: Trophy }
];
const confidenceLabels = ["LOW", "MEDIUM", "HIGH"];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "The arena could not process that request. Please retry.");
  return body as T;
}
const post = <T,>(url: string, body?: unknown) => api<T>(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
const failure = (cause: unknown) => cause instanceof Error ? cause.message : "Something went wrong. Please retry.";
const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export default function MythFactGame({ onBack }: { onBack: () => void }) {
  const identity = useChallengerIdentity();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("classic");
  const [difficulty, setDifficulty] = useState(2);
  const [categories, setCategories] = useState<string[]>([]);
  const [challengeId, setChallengeId] = useState("");
  const [entryCode, setEntryCode] = useState("");
  const [eventTeam, setEventTeam] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [captain, setCaptain] = useState("");
  const [members, setMembers] = useState("");
  const [chosen, setChosen] = useState<boolean | null>(null);
  const submitting = useRef(false);
  const timedOut = useRef<number | null>(null);
  const refreshing = useRef(false);
  const lastTick = useRef(0);

  const apply = useCallback((view: AttemptView) => {
    setAttempt(view);
    setReceivedAt(Date.now());
    setClock(Date.now());
    setChosen(null);
    setError("");
    if (view.status === "question") { timedOut.current = null; lastTick.current = 0; }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api<Meta>("/api/myth/meta"), api<{ attempt: AttemptView | null }>("/api/myth/pending")])
      .then(([loaded, pending]) => {
        if (!active) return;
        setMeta(loaded);
        setCategories(loaded.config.categories);
        if (pending.attempt) apply(pending.attempt);
      })
      .catch((cause) => { if (active) setMetaError(failure(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apply]);

  const serverNow = attempt ? attempt.serverNow + (clock - receivedAt) : clock;
  const remaining = attempt?.question ? Math.max(0, attempt.question.deadline - serverNow) : 0;
  const questionTotal = attempt ? (attempt.team ? attempt.config.teamSeconds : attempt.config.questionSeconds) * 1000 : 1;
  const speedRemaining = attempt?.totalDeadline ? Math.max(0, attempt.totalDeadline - serverNow) : 0;
  const selectedChallenge = meta?.challenges.find((challenge) => challenge.id === challengeId) ?? null;
  const teamRun = mode === "team" || (mode === "event" && (selectedChallenge?.participation === "team" || (selectedChallenge?.participation === "both" && eventTeam)));

  const refresh = useCallback(async () => {
    if (!attempt || refreshing.current) return;
    refreshing.current = true;
    try { apply(await api<AttemptView>(`/api/myth/attempts/${attempt.id}`)); }
    catch (cause) { setError(failure(cause)); }
    finally { refreshing.current = false; }
  }, [attempt, apply]);

  useEffect(() => {
    if (!attempt) return;
    if (attempt.status === "countdown" && serverNow >= attempt.startAt) void refresh();
  }, [attempt, serverNow, refresh]);

  const submit = useCallback(async (answer: boolean | null, confidence: number | null) => {
    if (!attempt?.question || attempt.status !== "question" || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const view = await post<AttemptView>(`/api/myth/attempts/${attempt.id}/answer`, {
        ordinal: attempt.question.ordinal, answer, confidence
      });
      apply(view);
      if (view.reveal) {
        playSound(view.reveal.correct ? "correct" : "wrong");
        if (view.reveal.correct && view.streak >= 3) playSound("streak");
      } else if (view.last && view.mode === "speed") {
        playSound(view.last.correct ? "correct" : "wrong");
      }
      if (view.status === "completed") playSound("finish");
    } catch (cause) {
      setError(failure(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }, [attempt, apply]);

  useEffect(() => {
    if (!attempt?.question || attempt.status !== "question") return;
    if (remaining > 0) return;
    if (timedOut.current === attempt.question.ordinal) return;
    timedOut.current = attempt.question.ordinal;
    void submit(null, null);
  }, [attempt, remaining, submit]);

  useEffect(() => {
    if (!attempt?.question || attempt.status !== "question") return;
    const whole = seconds(remaining);
    if (whole <= 5 && whole > 0 && lastTick.current !== whole) {
      lastTick.current = whole;
      playSound("tick");
    }
  }, [attempt, remaining]);

  const advance = async () => {
    if (!attempt || busy) return;
    setBusy(true);
    try {
      const view = await post<AttemptView>(`/api/myth/attempts/${attempt.id}/next`);
      apply(view);
      playSound("tap");
      if (view.status === "completed") playSound("finish");
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };

  const hint = async () => {
    if (!attempt || busy) return;
    setBusy(true);
    try { apply(await post<AttemptView>(`/api/myth/attempts/${attempt.id}/hint`)); playSound("tap"); }
    catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (!attempt) return;
      if (attempt.status === "reveal") {
        if (event.key === "Enter" && target?.tagName !== "BUTTON") { event.preventDefault(); void advance(); }
        return;
      }
      if (attempt.status !== "question" || busy || !attempt.question) return;
      if (attempt.mode === "confidence") {
        if (chosen === null && (event.key === "1" || event.key === "2")) { event.preventDefault(); setChosen(event.key === "2"); }
        else if (chosen !== null && ["1", "2", "3"].includes(event.key)) { event.preventDefault(); void submit(chosen, Number(event.key) - 1); }
        return;
      }
      if (event.key === "1" || event.key === "2") { event.preventDefault(); void submit(event.key === "2", null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attempt, busy, chosen, submit]);

  const start = async () => {
    setError("");
    const roster = members.split(/[\n,]/).map((name) => name.trim()).filter(Boolean);
    if (mode === "event" && !selectedChallenge) { setError("Choose an open competition."); return; }
    if (mode === "event" && !entryCode.trim()) { setError("Enter the event entry code from your volunteer."); return; }
    if (teamRun && teamName.trim().length < 2) { setError("Enter a team name of at least two characters."); return; }
    if (teamRun && !(captain.trim() || identity.challenger.trim())) { setError("Enter the team captain's name."); return; }
    if (mode !== "event" && !categories.length) { setError("Select at least one category."); return; }
    setBusy(true);
    try {
      const view = await post<AttemptView>("/api/myth/start", {
        participantId: identity.participantId,
        nickname: identity.challenger.trim() || "Anonymous Challenger",
        mode, difficulty, categories,
        ...(mode === "event" ? { challengeId, entryCode: entryCode.trim() } : {}),
        ...(teamRun ? { team: { name: teamName.trim(), captain: (captain.trim() || identity.challenger.trim()), members: roster } } : {})
      });
      apply(view);
      playSound("start");
    } catch (cause) { setError(failure(cause)); }
    finally { setBusy(false); }
  };

  const again = () => {
    setAttempt(null);
    setChosen(null);
    setEntryCode("");
    setError("");
  };

  const newPlayer = async () => {
    try { await post("/api/myth/reset"); } catch { /* A stale session is not a blocker. */ }
    identity.newParticipant();
    identity.setChallenger("");
    setAttempt(null); setChosen(null); setEntryCode(""); setTeamName(""); setCaptain(""); setMembers("");
    setMode("classic"); setEventTeam(false); setError("");
    playSound("tap");
  };

  if (loading) return <div className="page-content interior-page myth-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO CHALLENGES</button><div className="myth-loading" role="status">LOADING THE TRUTH ENGINE…</div></div>;

  return <div className="page-content interior-page myth-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO CHALLENGES</button>
    {error && <div className="myth-error" role="alert"><ShieldAlert size={16} /> {error}</div>}

    {!attempt && <section className="myth-intro">
      <div className="myth-club-masthead">
        <img src="/brand/it-club-logo.svg" alt="EMU Information Technologies Club emblem" />
        <div>
          <strong>EMU Information Technologies Club</strong>
          <small>DIGITAL TRUTH · OFFICIAL CHALLENGE</small>
        </div>
        <img src="/brand/emu-logo.png" alt="Eastern Mediterranean University" />
      </div>
      <div className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 06 · DIGITAL TRUTH</div>
      <h1>MYTH <span>OR FACT?</span></h1>
      <p>Two choices. One truth. Decide whether each digital claim is a myth or a fact, then defend your instinct under pressure.</p>
      <details open className="game-user-guide myth-guide">
        <summary>QUICK PLAYER GUIDE · READ BEFORE STARTING</summary>
        <ol>
          <li>Pick a mode. Classic is the standard 15-statement run; Speed, Survival, Confidence, Team, and Event each change the pressure.</li>
          <li>Statements appear one at a time. Choose MYTH or FACT before the timer expires.</li>
          <li>Confidence Battle asks how sure you are. Higher confidence earns more — and costs more when wrong.</li>
          <li>Build streaks for bonus points. The last statement is the Final Truth Challenge. Some pairs are Double Trouble.</li>
          <li>One hint is available per run. Every run is answer-checked on the server; answers stay hidden until you respond.</li>
        </ol>
        <p>Questions never repeat inside a run. Casual runs also avoid statements from your previous three sessions; if too few statements remain, the arena asks you to broaden your categories instead of repeating content.</p>
      </details>

      {metaError && <div className="myth-meta-error" role="status">{metaError} <button className="outline-button" onClick={() => window.location.reload()}>RETRY</button></div>}

      <div className="myth-modes" role="radiogroup" aria-label="Game mode">
        {modeOptions.map(({ id, label, tagline, icon: Icon }) => {
          const closed = id === "event" ? !meta?.challenges.some((challenge) => challenge.registrationOpen) : !meta?.config.availableModes.includes(id);
          return <label key={id} className={`myth-mode ${mode === id ? "myth-mode-selected" : ""} ${closed ? "myth-mode-closed" : ""}`}>
            <input type="radio" name="myth-mode" value={id} checked={mode === id} disabled={closed} onChange={() => setMode(id)} />
            <Icon size={18} />
            <span><strong>{label}</strong><small>{closed ? (id === "event" ? "No competition is currently open." : "Temporarily unavailable.") : tagline}</small></span>
          </label>;
        })}
      </div>

      <div className="myth-setup">
        {mode !== "event" && <div className="myth-field">
          <label htmlFor="myth-difficulty">DIFFICULTY · {["FOUNDATION", "EVERYDAY", "ADVANCED", "EXPERT"][difficulty - 1]}</label>
          <input id="myth-difficulty" type="range" min={1} max={4} step={1} value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} />
          <small>Statements at or below this level are eligible. Higher difficulty includes harder claims.</small>
        </div>}
        {mode !== "event" && <div className="myth-field">
          <span className="myth-field-label">CATEGORIES · {categories.length} OF {meta?.config.categories.length ?? 0} SELECTED</span>
          <div className="myth-category-grid" role="group" aria-label="Categories">
            {(meta?.config.categories ?? []).map((category) => {
              const checked = categories.includes(category);
              return <button type="button" key={category} className={checked ? "myth-chip myth-chip-on" : "myth-chip"} aria-pressed={checked}
                onClick={() => setCategories((current) => checked ? current.filter((item) => item !== category) : [...current, category])}>
                {checked && <Check size={13} />}{category}
              </button>;
            })}
          </div>
        </div>}
        {mode === "event" && <div className="myth-field">
          <label htmlFor="myth-challenge">OPEN COMPETITION</label>
          <select id="myth-challenge" className="myth-input" value={challengeId} onChange={(event) => { setChallengeId(event.target.value); setEventTeam(false); }}>
            <option value="">Choose a competition…</option>
            {(meta?.challenges ?? []).filter((challenge) => challenge.registrationOpen).map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.title} · {challenge.questionCount} statements · v{challenge.version}</option>)}
          </select>
          <label htmlFor="myth-code">ENTRY CODE</label>
          <input id="myth-code" className="myth-input" value={entryCode} onChange={(event) => setEntryCode(event.target.value)} maxLength={80} placeholder="Code from your volunteer" autoComplete="off" />
          <small>Event sets use the exact statements and rules chosen by staff. Entry codes work once.</small>
        </div>}
        {mode === "event" && meta?.challenges.find((challenge) => challenge.id === challengeId)?.participation === "both" && <label className="myth-check"><input type="checkbox" checked={eventTeam} onChange={(event) => setEventTeam(event.target.checked)} /> COMPETE AS A TEAM</label>}
        {teamRun && <div className="myth-team">
          <label htmlFor="myth-team-name">TEAM NAME</label>
          <input id="myth-team-name" className="myth-input" value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={40} placeholder="Truth Seekers" />
          <label htmlFor="myth-captain">CAPTAIN</label>
          <input id="myth-captain" className="myth-input" value={captain} onChange={(event) => setCaptain(event.target.value)} maxLength={24} placeholder={identity.challenger || "Captain name"} />
          <label htmlFor="myth-members">OTHER MEMBERS · {meta ? `${meta.config.teamMin - 1}–${meta.config.teamMax - 1}` : "1–5"} NAMES</label>
          <textarea id="myth-members" className="myth-input" value={members} onChange={(event) => setMembers(event.target.value)} rows={3} placeholder="One name per line or separated by commas" />
          <small>Include the captain plus {meta ? `${meta.config.teamMin - 1}–${meta.config.teamMax - 1}` : "1–5"} different members. One score is shared by the whole team.</small>
        </div>}
        {!teamRun && <ChallengerName value={identity.challenger} onChange={identity.setChallenger} />}
      </div>

      <div className="myth-intro-actions">
        <button className="primary-button" onClick={start} disabled={busy || Boolean(metaError) || !meta}>{busy ? "PREPARING YOUR SET…" : "START THE CHALLENGE"} <ArrowRight size={16} /></button>
        <span className="myth-meta-note">{meta ? `${meta.questionCount} reviewed statements · server-checked scoring` : "Connecting to the truth engine…"}</span>
      </div>
    </section>}

    {attempt?.status === "countdown" && <section className="myth-countdown">
      <span className="eyebrow"><span className="eyebrow-line" /> {attempt.mode === "event" ? "OFFICIAL EVENT" : modeOptions.find((option) => option.id === attempt.mode)?.label.toUpperCase()}</span>
      <div className="myth-countdown-number">{Math.max(1, seconds(attempt.startAt - serverNow))}</div>
      <p>Get ready. Your first statement appears automatically.</p>
      <small>{attempt.team ? `${attempt.team.name} · ${attempt.team.members.length + 1} players` : identity.challenger || "Anonymous Challenger"} · {attempt.questionCount} statements</small>
    </section>}

    {attempt && (attempt.status === "question" || attempt.status === "reveal") && <section className="myth-play">
      <div className="myth-play-head">
        <div>
          <span className="eyebrow"><span className="eyebrow-line" /> {attempt.mode === "speed" ? "SPEED RUSH" : attempt.mode === "survival" ? `SURVIVAL · ${attempt.lives} ${attempt.lives === 1 ? "LIFE" : "LIVES"}` : attempt.mode === "team" ? "TEAM DISCUSSION" : attempt.mode === "confidence" ? "CONFIDENCE BATTLE" : attempt.mode === "event" ? `EVENT SET · v${attempt.challengeVersion}` : "CLASSIC TRUTH RUN"}</span>
          <h1>STATEMENT <span>{String(attempt.cursor + 1).padStart(2, "0")}</span><small> / {String(attempt.questionCount).padStart(2, "0")}</small></h1>
        </div>
        <div className="myth-score"><span>SCORE</span><strong>{attempt.score.toLocaleString()}</strong><small>{attempt.streak > 0 ? `${attempt.streakTitle ?? "STREAK"} ×${attempt.streak}` : "NO STREAK YET"}</small></div>
      </div>
      {attempt.question && <div className="myth-badges">
        <span className="myth-badge">{attempt.question.category.toUpperCase()}</span>
        <span className="myth-badge">LEVEL {attempt.question.difficulty}</span>
        {attempt.question.final && <span className="myth-badge myth-badge-final"><Sparkles size={12} /> FINAL TRUTH CHALLENGE</span>}
        {attempt.question.pair !== null && <span className="myth-badge myth-badge-pair"><Zap size={12} /> DOUBLE TROUBLE</span>}
        {attempt.mode === "speed" && <span className="myth-badge myth-badge-timer"><Timer size={12} /> {seconds(speedRemaining)}S LEFT</span>}
      </div>}
      <div className="myth-progress"><i style={{ width: `${(attempt.cursor / attempt.questionCount) * 100}%` }} /></div>
      {attempt.status === "question" && attempt.question && <>
        <div className={`myth-timer ${remaining < 5_000 ? "myth-timer-warning" : ""}`}><Timer size={14} /><span>{seconds(remaining)} SEC</span><i style={{ width: `${Math.min(100, (remaining / questionTotal) * 100)}%` }} /></div>
        <article className="myth-statement">
          <span className="question-label">IS THIS STATEMENT A MYTH OR A FACT?</span>
          {attempt.question.image && <img className="myth-image" src={attempt.question.image} alt="Statement evidence" />}
          <h2>{attempt.question.statement}</h2>
          {attempt.mode === "confidence" ? <>
            <div className="myth-answer-pair">
              <button className={chosen === false ? "myth-answer myth-answer-myth myth-answer-chosen" : "myth-answer myth-answer-myth"} disabled={busy} onClick={() => setChosen(false)}><X size={18} /><span>MYTH</span><small>FALSE CLAIM</small></button>
              <button className={chosen === true ? "myth-answer myth-answer-fact myth-answer-chosen" : "myth-answer myth-answer-fact"} disabled={busy} onClick={() => setChosen(true)}><Check size={18} /><span>FACT</span><small>TRUE CLAIM</small></button>
            </div>
            {chosen !== null && <div className="myth-confidence" aria-live="polite">
              <span>HOW CONFIDENT ARE YOU?</span>
              <div>{confidenceLabels.map((label, index) => <button key={label} disabled={busy} onClick={() => submit(chosen, index)}><strong>{label}</strong><small>+{attempt.config.confidenceCorrect[index]} · −{attempt.config.confidenceWrong[index]}</small></button>)}</div>
            </div>}
          </> : <div className="myth-answer-pair">
            <button className="myth-answer myth-answer-myth" disabled={busy} onClick={() => submit(false, null)}><X size={18} /><span>MYTH</span><small>FALSE CLAIM</small></button>
            <button className="myth-answer myth-answer-fact" disabled={busy} onClick={() => submit(true, null)}><Check size={18} /><span>FACT</span><small>TRUE CLAIM</small></button>
          </div>}
          <small className="myth-keys">{attempt.mode === "confidence" && chosen !== null ? "KEYS 1 / 2 / 3 · LOW / MEDIUM / HIGH CONFIDENCE" : "KEYS 1 / 2 · MYTH / FACT"}</small>
          <div className="myth-hint-row">
            {attempt.config.hints && <button className="myth-hint" onClick={hint} disabled={busy || attempt.hintUsed || !attempt.question.hintAvailable}><Lightbulb size={14} /> {attempt.hintUsed ? "HINT USED" : attempt.question.hintAvailable ? "ONE HINT · NO SPEED OR STREAK BONUS" : "NO HINT AVAILABLE"}</button>}
            <span>{attempt.config.hints ? "One hint per run." : "Hints are disabled for this run."}</span>
          </div>
          {attempt.question.hinted && attempt.question.hint && <p className="myth-hint-text"><Lightbulb size={13} /> {attempt.question.hint}</p>}
          <span className="myth-counter">{speedRemaining > 0 && attempt.mode === "speed" ? "KEEP MOVING — THE NEXT STATEMENT IS WAITING" : "YOUR ANSWER IS LOCKED ONCE YOU CHOOSE"}</span>
        </article>
      </>}
      {attempt.status === "reveal" && attempt.reveal && <article className={`myth-statement myth-reveal ${attempt.reveal.correct ? "myth-reveal-correct" : "myth-reveal-wrong"}`} aria-live="polite">
        <div className="myth-reveal-head"><span className="myth-reveal-label">{attempt.reveal.correct ? <><Check size={17} /> CORRECT</> : <><ShieldAlert size={17} /> {attempt.reveal.answer === null ? "TIME'S UP" : "NOT QUITE"}</>}</span><b>{attempt.reveal.correct ? `+${attempt.reveal.points ?? 0}` : `${attempt.reveal.points ?? 0}`} POINTS</b></div>
        <p className="myth-reveal-statement">{attempt.reveal.statement}</p>
        <div className="myth-reveal-verdict"><span>THE TRUTH</span><strong>{attempt.reveal.fact ? "FACT" : "MYTH"}</strong>{attempt.reveal.confidence !== null && <small>CONFIDENCE: {confidenceLabels[attempt.reveal.confidence]}</small>}{attempt.reveal.hinted && <small>HINT USED</small>}{attempt.reveal.pair !== null && <small>DOUBLE TROUBLE</small>}{attempt.reveal.final && <small>FINAL BONUS</small>}</div>
        <p>{attempt.reveal.explanation}</p>
        <small className="myth-source">SOURCE: {attempt.reveal.source}</small>
        <button className="primary-button" onClick={advance} disabled={busy}>{attempt.cursor + 1 >= attempt.questionCount ? "VIEW YOUR RESULTS" : "NEXT STATEMENT"} <ArrowRight size={15} /></button>
      </article>}
      {attempt.status === "reveal" && !attempt.reveal && <article className="myth-statement myth-reveal" aria-live="polite">
        <div className="myth-reveal-head"><span className="myth-reveal-label"><ShieldAlert size={17} /> RESPONSE LOCKED IN</span></div>
        <p>Your answer has been recorded. This competition hides explanations while staff are still accepting participants.</p>
        <button className="primary-button" onClick={advance} disabled={busy}>{attempt.cursor + 1 >= attempt.questionCount ? "VIEW YOUR RESULTS" : "NEXT STATEMENT"} <ArrowRight size={15} /></button>
      </article>}
      {attempt.status === "question" && attempt.mode === "speed" && attempt.last && <div className={`myth-flash ${attempt.last.correct ? "myth-flash-correct" : "myth-flash-wrong"}`}>{attempt.last.correct ? "CORRECT" : attempt.last.answer === null ? "MISSED" : "WRONG"}{attempt.last.points !== null ? ` · ${attempt.last.points > 0 ? "+" : ""}${attempt.last.points}` : ""}</div>}
    </section>}

    {attempt?.status === "completed" && attempt.result && <section className="myth-results">
      <span className="eyebrow"><span className="eyebrow-line" /> RUN COMPLETE · {modeOptions.find((option) => option.id === attempt.mode)?.label.toUpperCase()}{attempt.challengeVersion ? ` · v${attempt.challengeVersion}` : ""}</span>
      <div className="myth-result-icon"><Trophy size={25} /></div>
      <h1>TRUTH <span>UNCOVERED.</span></h1>
      <p className="myth-badge-line"><span>{attempt.result.badge}</span>{attempt.result.record && <span className="myth-record">NEW RECORD</span>}{attempt.participation === "team" && attempt.team && <span>{attempt.team.name.toUpperCase()}</span>}</p>
      <div className="myth-final-score"><span>TOTAL SCORE</span><strong>{attempt.score.toLocaleString()}</strong><small>{attempt.result.rank ? `RANK #${attempt.result.rank} ON THIS BOARD` : "RANKING PENDING"}</small></div>
      <div className="myth-result-stats">
        <div><span>ACCURACY</span><strong>{attempt.result.accuracy}<small>%</small></strong></div>
        <div><span>CORRECT</span><strong>{attempt.correct}<small> / {attempt.correct + attempt.incorrect}</small></strong></div>
        <div><span>BEST STREAK</span><strong>{attempt.longestStreak}</strong></div>
        <div><span>AVG RESPONSE</span><strong>{(attempt.result.averageMs / 1000).toFixed(2)}<small>s</small></strong></div>
      </div>
      <div className="myth-result-notes">
        <span>{attempt.result.personalBest ? "PERSONAL BEST" : `YOUR BEST ON THIS BOARD: ${attempt.result.previousBest?.toLocaleString() ?? "—"}`}</span>
        <span>RUN TIME: {seconds(attempt.result.elapsedMs)}S</span>
        <span>{attempt.review.length} STATEMENTS ANSWERED</span>
      </div>
      {attempt.explanationsWithheld && <div className="myth-withheld"><ShieldAlert size={14} /> Answers stay hidden while this competition is accepting participants. Staff can reveal them after registration closes.</div>}
      {attempt.review.length > 0 && <div className="myth-review">
        <h2><CircleHelp size={15} /> STATEMENT REVIEW</h2>
        {attempt.review.map((item) => <article key={item.ordinal} className="myth-review-item">
          <div><span>#{String(item.ordinal + 1).padStart(2, "0")} · {item.final ? "FINAL" : item.pair !== null ? "DOUBLE TROUBLE" : "STANDARD"}{item.hinted ? " · HINTED" : ""}</span><b className={item.correct ? "history-hit" : "history-miss"}>{item.correct ? "CORRECT" : item.answer === null ? "TIMEOUT" : "MISSED"}{item.points !== null && ` · ${item.points > 0 ? "+" : ""}${item.points}`}</b></div>
          <p>{item.statement}</p>
          <small><strong>{item.fact ? "FACT" : "MYTH"}.</strong> {item.explanation}</small>
        </article>)}
      </div>}
      <div className="complete-actions">
        <button className="primary-button" onClick={again}><RotateCcw size={15} /> PLAY AGAIN</button>
        <button className="outline-button" onClick={() => { void newPlayer(); }}>NEW PLAYER · KIOSK RESET</button>
      </div>
      <div className="myth-club-signoff">
        <img src="/brand/it-club-logo.svg" alt="EMU Information Technologies Club" />
        <span>EMU INFORMATION TECHNOLOGIES CLUB · DIGITAL TRUTH CHALLENGE</span>
        <img src="/brand/emu-logo.png" alt="Eastern Mediterranean University" />
      </div>
      <p className="local-score-note">Scores, timing, confidence, and answers are validated by the server. Completed scores appear on their mode-specific hall of fame.</p>
    </section>}
  </div>;
}
