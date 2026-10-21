import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./i18n";

export type Ranking = { id: string; rank: number; challenger: string; score: number; completedAt: number };
export type Rankings = { game: string; entries: Ranking[]; updatedAt: string };
export type Overview = { participants: number; gamesPlayed: number; activeSessions: number; database: string; updatedAt: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Unable to reach the arena database. Please retry.");
  return response.status === 204 ? undefined as T : response.json();
}

export function useLiveData<T>(url: string) {
  const [result, setResult] = useState<{ url: string; data: T } | null>(null);
  const [error, setError] = useState(false);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let disposed = false;
    let loading = false;
    let queued = false;
    setError(false);
    setConnected(false);
    const refresh = async () => {
      if (loading) { queued = true; return; }
      loading = true;
      try {
        const data = await request<T>(url);
        if (!disposed) { setResult({ url, data }); setError(false); }
      } catch { if (!disposed) setError(true); }
      finally { loading = false; if (queued && !disposed) { queued = false; void refresh(); } }
    };
    void refresh();
    const events = new EventSource("/api/events");
    events.onopen = () => { if (!disposed) { setConnected(true); void refresh(); } };
    events.onerror = () => { if (!disposed) setConnected(false); };
    events.addEventListener("change", refresh);
    // Polling also catches expired sessions and provides a fallback when streaming is unavailable.
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; events.close(); clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [url]);
  return { data: result?.url === url ? result.data : null, error, live: connected && !error };
}

function stored(key: string, fallback: () => string) {
  try {
    const value = localStorage.getItem(key) ?? fallback();
    localStorage.setItem(key, value);
    return value;
  } catch { return fallback(); }
}

export function useChallengerIdentity() {
  const [challenger, setName] = useState(() => stored("arena-challenger", () => ""));
  const [participantId, setParticipantId] = useState(() => stored("arena-participant", () => crypto.randomUUID()));
  return {
    challenger, participantId,
    setChallenger(value: string) { setName(value); try { localStorage.setItem("arena-challenger", value); } catch { /* Storage can be disabled. */ } },
    newParticipant() {
      const next = crypto.randomUUID();
      setParticipantId(next);
      try { localStorage.setItem("arena-participant", next); } catch { /* Storage can be disabled. */ }
      return next;
    }
  };
}

export function useGameSession(game: string, phase: string, score: number) {
  const [challenger, setName] = useState(() => stored("arena-challenger", () => ""));
  const [participantId] = useState(() => stored("arena-participant", () => crypto.randomUUID()));
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const session = useRef<Promise<string> | null>(null);
  const sessionId = useRef<string | null>(null);
  const completed = useRef(false);
  const previousPhase = useRef(phase);
  const generation = useRef(0);
  const saving = useRef(false);
  const name = useRef(challenger);
  name.current = challenger;

  const start = () => {
    if (!session.current) {
      const run = generation.current;
      const pending: Promise<string> = request<{ id: string }>("/api/play", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, game, challenger: name.current.trim() })
      }).then(({ id }) => {
        if (run === generation.current) sessionId.current = id;
        else void fetch(`/api/play/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
        return id;
      }).catch((error: unknown) => {
        if (session.current === pending) session.current = null;
        throw error;
      });
      session.current = pending;
    }
    return session.current;
  };
  const save = async () => {
    if (saving.current) return;
    const run = generation.current;
    saving.current = true;
    setFailed(false);
    setStatus("SAVING YOUR SCORE…");
    try {
      const id = await start();
      await request(`/api/play/${id}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score })
      });
      if (run === generation.current) setStatus("SCORE SAVED · SEE YOU IN THE HALL OF FAME");
    } catch {
      if (run === generation.current) {
        setFailed(true);
        setStatus("Score not saved. Check your connection and retry before leaving.");
      }
    } finally {
      if (run === generation.current) saving.current = false;
    }
  };

  useEffect(() => {
    if (phase === "intro" || (previousPhase.current === "complete" && phase !== "complete")) {
      generation.current++;
      saving.current = false;
      if (sessionId.current && !completed.current) {
        void fetch(`/api/play/${sessionId.current}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
      session.current = null;
      sessionId.current = null;
      completed.current = false;
      setStatus("");
      setFailed(false);
    }
    previousPhase.current = phase;
    if (phase !== "intro" && !completed.current) {
      const run = generation.current;
      void start().catch(() => {
        if (run === generation.current && !completed.current) setStatus("Live scoring is unavailable. Your result can be retried when the run ends.");
      });
    }
    if (phase === "complete" && !completed.current) {
      completed.current = true;
      void save();
    }
  }, [phase]); // A session spans all rounds; only phase transitions start or finish it.

  useEffect(() => {
    const abandon = () => {
      if (sessionId.current && !completed.current) {
        void fetch(`/api/play/${sessionId.current}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };
    const timer = window.setInterval(() => {
      if (sessionId.current && !completed.current) {
        void request(`/api/play/${sessionId.current}/heartbeat`, { method: "POST" }).catch(() => {});
      }
    }, 25_000);
    window.addEventListener("pagehide", abandon);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", abandon); abandon(); generation.current++; };
  }, []);

  return {
    challenger,
    setChallenger(value: string) { setName(value); try { localStorage.setItem("arena-challenger", value); } catch { /* Storage can be disabled. */ } },
    status, failed, retry: save
  };
}

export function ChallengerName({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  return <label className="challenger-name">{t("CALL SIGN")} <small>{t("PUBLIC ON THE HALL OF FAME · OPTIONAL")}</small><input className="call-sign-input" value={value} onChange={(event) => onChange(event.target.value)} maxLength={24} placeholder={t("Anonymous Challenger")} /></label>;
}

export function ScoreStatus({ status, failed, retry }: { status: string; failed: boolean; retry: () => void }) {
  const { t } = useLanguage();
  if (!status) return null;
  return <div className={`score-save-status ${failed ? "save-failed" : ""}`} role="status">{t(status)}{failed && <button className="outline-button" onClick={retry}>{t("RETRY SAVE")}</button>}</div>;
}
