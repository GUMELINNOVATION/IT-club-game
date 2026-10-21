import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crosshair, RotateCcw, Target, Trophy } from "lucide-react";
import { ChallengerName, ScoreStatus, useGameSession } from "../../ui/arena-data";
import {
  advanceTarget,
  createInitialStats,
  createTarget,
  getDifficultyLevel,
  getSpawnIntervalMs,
  isTargetHit,
  recordExpiredTarget,
  recordMissedClick,
  recordTargetHit,
  summarizeStats,
  TARGET_RUSH_DIFFICULTY_INTERVAL,
  TARGET_RUSH_DURATIONS,
  TARGET_RUSH_MAX_ACTIVE_TARGETS,
  type TargetRushBounds,
  type TargetRushStats,
  type TargetRushSummary,
  type TargetRushTarget,
  type TargetRushTargetType
} from "./engine";

type Phase = "intro" | "countdown" | "running" | "complete";
type HitEffect = { id: number; x: number; y: number; text: string; color: string; expiresAt: number };
type RushSession = {
  startedAt: number;
  endsAt: number;
  durationMs: number;
  lastFrameAt: number;
  lastSpawnAt: number;
  nextTargetId: number;
  targets: TargetRushTarget[];
  stats: TargetRushStats;
};

type Props = { onBack: () => void };

const colors: Record<TargetRushTargetType, string> = {
  normal: "#64e4f2",
  bonus: "#a990ff",
  combo: "#82e5ae",
  decoy: "#ff788c",
  golden: "#f3ce77"
};

const labels: Record<TargetRushTargetType, string> = {
  normal: "TARGET",
  bonus: "BONUS",
  combo: "COMBO",
  decoy: "DECOY",
  golden: "GOLD"
};

function targetPoints(type: TargetRushTargetType): number {
  if (type === "bonus") return 250;
  if (type === "golden") return 500;
  if (type === "decoy") return -150;
  return 100;
}

function drawArena(context: CanvasRenderingContext2D, bounds: TargetRushBounds, targets: TargetRushTarget[], now: number): void {
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = "rgba(6, 12, 24, .92)";
  context.fillRect(0, 0, bounds.width, bounds.height);

  context.save();
  context.strokeStyle = "rgba(112, 143, 196, .07)";
  context.lineWidth = 1;
  for (let x = 0; x < bounds.width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, bounds.height);
    context.stroke();
  }
  for (let y = 0; y < bounds.height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(bounds.width, y);
    context.stroke();
  }

  for (const target of targets) {
    const color = colors[target.type];
    const pulse = 1 + Math.sin((now - target.spawnedAt) / 120) * 0.045;
    const radius = target.radius * pulse;
    context.save();
    context.shadowColor = color;
    context.shadowBlur = target.type === "golden" ? 24 : 15;
    context.fillStyle = `${color}22`;
    context.strokeStyle = color;
    context.lineWidth = target.type === "decoy" ? 2 : 1.6;
    context.beginPath();
    context.arc(target.x, target.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.globalAlpha = 0.72;
    context.beginPath();
    context.arc(target.x, target.y, radius * 0.66, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = color;
    context.beginPath();
    context.arc(target.x, target.y, Math.max(2.5, radius * 0.12), 0, Math.PI * 2);
    context.fill();
    if (target.type === "decoy") {
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(target.x - 5, target.y - 5);
      context.lineTo(target.x + 5, target.y + 5);
      context.moveTo(target.x + 5, target.y - 5);
      context.lineTo(target.x - 5, target.y + 5);
      context.stroke();
    }
    context.shadowBlur = 10;
    context.fillStyle = color;
    context.font = "600 8px 'DM Mono', monospace";
    context.textAlign = "center";
    context.fillText(labels[target.type], target.x, target.y + radius + 13);
    context.restore();
  }
  context.restore();
}

export default function TargetRushGame({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [countdown, setCountdown] = useState(3);
  const [remainingMs, setRemainingMs] = useState(durationSeconds * 1_000);
  const [stats, setStats] = useState<TargetRushStats>(createInitialStats);
  const [activeTargets, setActiveTargets] = useState<TargetRushTarget[]>([]);
  const [summary, setSummary] = useState<TargetRushSummary | null>(null);
  const tracking = useGameSession("target-rush", phase, summary?.score ?? 0);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<RushSession | null>(null);
  const countdownDeadlineRef = useRef<number | null>(null);
  const effectIdRef = useRef(0);
  const hitTargetRef = useRef<(id: number) => void>(() => {});
  const clickArenaRef = useRef<(x: number, y: number) => void>(() => {});

  const difficulty = getDifficultyLevel(stats.successfulHits);
  const hitsUntilNext = stats.successfulHits >= 20
    ? 0
    : TARGET_RUSH_DIFFICULTY_INTERVAL - (stats.successfulHits % TARGET_RUSH_DIFFICULTY_INTERVAL);

  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setInterval(() => {
      const deadline = countdownDeadlineRef.current;
      if (deadline === null) return;
      const left = deadline - performance.now();
      if (left <= 0) {
        const now = performance.now();
        sessionRef.current = {
          startedAt: now,
          endsAt: now + durationSeconds * 1_000,
          durationMs: durationSeconds * 1_000,
          lastFrameAt: now,
          lastSpawnAt: now - 1_000,
          nextTargetId: 1,
          targets: [],
          stats: createInitialStats()
        };
        setStats(createInitialStats());
        setRemainingMs(durationSeconds * 1_000);
        setPhase("running");
      } else {
        setCountdown(Math.ceil(left / 1_000));
      }
    }, 35);
    return () => window.clearInterval(timer);
  }, [phase, durationSeconds]);

  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const session = sessionRef.current;
    if (!canvas || !context || !session) return;

    let animationId = 0;
    let lastUiUpdate = 0;
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const frame = (now: number) => {
      const current = sessionRef.current;
      if (!current) return;
      const bounds = { width, height };
      const elapsedSeconds = Math.min((now - current.lastFrameAt) / 1_000, 0.05);
      current.lastFrameAt = now;
      current.targets = current.targets
        .filter((target) => {
          if (now < target.expiresAt) return true;
          current.stats = recordExpiredTarget(current.stats);
          return false;
        })
        .map((target) => advanceTarget(target, elapsedSeconds, bounds));

      const level = getDifficultyLevel(current.stats.successfulHits);
      const activeLimit = level >= 3 ? TARGET_RUSH_MAX_ACTIVE_TARGETS : 2;
      if (
        now < current.endsAt &&
        current.targets.length < activeLimit &&
        now - current.lastSpawnAt >= getSpawnIntervalMs(level)
      ) {
        current.targets.push(createTarget(current.nextTargetId++, now, bounds, level));
        current.lastSpawnAt = now;
      }

      drawArena(context, bounds, current.targets, now);
      if (now >= current.endsAt) {
        setHitEffects((items) => items.filter((item) => item.expiresAt > now));
        current.targets = [];
        drawArena(context, bounds, [], now);
        setActiveTargets([]);
        setStats(current.stats);
        setRemainingMs(0);
        setSummary(summarizeStats(current.stats));
        setPhase("complete");
        return;
      }
      if (now - lastUiUpdate >= 120) {
        lastUiUpdate = now;
        setActiveTargets([...current.targets]);
        setStats({ ...current.stats });
        setRemainingMs(current.endsAt - now);
        setHitEffects((items) => items.filter((item) => item.expiresAt > now));
      }
      animationId = requestAnimationFrame(frame);
    };

    animationId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, [phase]);

  const registerHit = (targetId: number) => {
    const current = sessionRef.current;
    if (phase !== "running" || !current) return;
    const now = performance.now();
    if (now >= current.endsAt) {
      current.targets = [];
      setActiveTargets([]);
      setStats(current.stats);
      setRemainingMs(0);
      setSummary(summarizeStats(current.stats));
      setPhase("complete");
      return;
    }
    const targetIndex = current.targets.findIndex((target) => target.id === targetId);
    if (targetIndex < 0) return;
    const [target] = current.targets.splice(targetIndex, 1);
    const level = getDifficultyLevel(current.stats.successfulHits);
    current.stats = recordTargetHit(current.stats, target, Math.max(0, now - target.spawnedAt), level);
    setStats({ ...current.stats });
    setActiveTargets([...current.targets]);
    const effect: HitEffect = {
      id: effectIdRef.current++,
      x: target.x,
      y: target.y,
      text: target.type === "decoy" ? `${targetPoints(target.type)}` : `+${targetPoints(target.type)}`,
      color: colors[target.type],
      expiresAt: now + 700
    };
    setHitEffects((items) => [...items.slice(-7), effect]);
  };
  hitTargetRef.current = registerHit;

  const clickArena = (x: number, y: number) => {
    const current = sessionRef.current;
    if (phase !== "running" || !current) return;
    const target = [...current.targets].reverse().find((candidate) => isTargetHit(candidate, x, y));
    if (target) {
      hitTargetRef.current(target.id);
      return;
    }
    current.stats = recordMissedClick(current.stats);
    setStats({ ...current.stats });
  };
  clickArenaRef.current = clickArena;

  const startGame = () => {
    setStats(createInitialStats());
    setSummary(null);
    setActiveTargets([]);
    setHitEffects([]);
    setCountdown(3);
    setRemainingMs(durationSeconds * 1_000);
    sessionRef.current = null;
    countdownDeadlineRef.current = performance.now() + 3_000;
    setPhase("countdown");
  };

  const backToIntro = () => {
    sessionRef.current = null;
    setPhase("intro");
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    clickArenaRef.current(event.clientX - rect.left, event.clientY - rect.top);
  };

  return (
    <div className="page-content interior-page target-rush-page">
      <button className="back-link" onClick={phase === "intro" ? onBack : backToIntro}><ArrowLeft size={15} /> BACK TO CHALLENGES</button>
      <ScoreStatus {...tracking} />

      {phase === "intro" && (
        <section className="rush-intro">
          <div className="rush-intro-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 02 · REFLEX</span>
            <h1>TARGET <span>RUSH.</span></h1>
            <p>Targets move. The clock ticks. Trust your reflexes, watch for decoys, and keep your combo alive.</p>
            <div className="rush-types">
              <span className="type-key type-normal"><i /> NORMAL <b>+100</b></span>
              <span className="type-key type-bonus"><i /> BONUS <b>+250</b></span>
              <span className="type-key type-combo"><i /> COMBO <b>STREAK</b></span>
              <span className="type-key type-golden"><i /> GOLDEN <b>+500</b></span>
              <span className="type-key type-decoy"><i /> DECOY <b>−150</b></span>
            </div>
            <details open className="game-user-guide rush-user-guide">
              <summary>QUICK PLAYER GUIDE · READ BEFORE STARTING</summary>
              <ol>
                <li>Choose a round length, then press Start. The arena opens after a three-second countdown.</li>
                <li>Tap or click a target, or use its numbered keyboard-accessible control below the arena.</li>
                <li>Hit normal, bonus, combo, and golden targets for points. Red X-marked decoys cost points; empty clicks also have a small penalty.</li>
                <li>Every five successful hits raises difficulty. Keep an eye on time, accuracy, and your combo.</li>
              </ol>
              <p>Points: normal/combo +100, bonus +250, golden +500. Decoy −150, missed click −25. Completed scores enter the live rankings.</p>
            </details>
            <label className="duration-label" htmlFor="rush-duration">ROUND LENGTH</label>
            <select id="rush-duration" className="duration-select" value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value))}>
              {TARGET_RUSH_DURATIONS.map((seconds) => <option value={seconds} key={seconds}>{seconds} SECONDS{seconds === 60 ? " · DEFAULT" : ""}</option>)}
            </select>
            <ChallengerName value={tracking.challenger} onChange={tracking.setChallenger} />
            <button className="primary-button rush-start-button" onClick={startGame}>START TARGET RUSH <ArrowRight size={16} /></button>
            <p className="local-score-note">Completed scores appear in the live Hall of Fame.</p>
          </div>
          <div className="rush-intro-art" aria-hidden="true"><div className="reticle reticle-large" /><div className="reticle reticle-small" /><div className="reticle-center"><Crosshair size={43} /></div><span className="reticle-label">SCANNING FOR TARGETS</span><span className="reticle-coord">35°08' N · 33°56' E</span></div>
        </section>
      )}

      {phase === "countdown" && (
        <section className="rush-countdown">
          <span className="eyebrow"><span className="eyebrow-line" /> TARGET RUSH · {durationSeconds} SECOND RUN</span>
          <div className="rush-countdown-number">{countdown}</div>
          <p>Get ready. Tap or click targets. Avoid the red decoys.</p>
        </section>
      )}

      {phase === "running" && (
        <section className="rush-live">
          <div className="rush-live-header">
            <div className="rush-live-score"><span>SCORE</span><strong>{stats.score.toLocaleString()}</strong></div>
            <div className="rush-live-stats"><span><b>{stats.successfulHits}</b> HITS</span><span><b>{stats.currentCombo}</b> COMBO</span><span><b>{summarizeStats(stats).accuracyPercent.toFixed(0)}%</b> ACCURACY</span></div>
            <div className={`rush-timer ${remainingMs <= 10_000 ? "timer-warning" : ""}`}><span>TIME</span><strong>{Math.ceil(remainingMs / 1_000)}<small>s</small></strong></div>
          </div>
          <div className="rush-difficulty"><div><span>DIFFICULTY {difficulty} / 5</span><span>{hitsUntilNext ? `${hitsUntilNext} HITS TO LEVEL UP` : "MAX DIFFICULTY"}</span></div><div className="difficulty-track"><i style={{ width: `${((stats.successfulHits % TARGET_RUSH_DIFFICULTY_INTERVAL) / TARGET_RUSH_DIFFICULTY_INTERVAL) * 100}%` }} /></div></div>
          <div className="rush-canvas-wrap">
            <canvas ref={canvasRef} className="rush-canvas" onPointerDown={handlePointerDown} aria-hidden="true" />
            {hitEffects.map((effect) => <span key={effect.id} className="rush-score-pop" style={{ left: effect.x, top: effect.y, color: effect.color }}>{effect.text}</span>)}
            <span className="rush-canvas-hint"><Target size={13} /> TAP · CLICK · OR USE THE KEYBOARD TARGET CONTROLS BELOW</span>
          </div>
          <div className="rush-accessible-controls" aria-label="Keyboard target controls">
            <span>KEYBOARD TARGET CONTROLS</span>
            {activeTargets.length
              ? activeTargets.map((target, index) => (
                <button key={target.id} className={`accessible-target ${target.type}`} onClick={() => hitTargetRef.current(target.id)}>
                  {index + 1}. {labels[target.type]} — {target.type === "decoy" ? "AVOID" : `${targetPoints(target.type)} POINTS`}
                </button>
              ))
              : <small>Targets appear here while the round is running.</small>}
          </div>
          <div className="rush-live-footer"><span>EXPIRED TARGETS <b>{stats.expiredTargets}</b></span><span>MISSED CLICKS <b>{stats.missedClicks}</b></span><span>DECOY HITS <b>{stats.decoyHits}</b></span></div>
        </section>
      )}

      {phase === "complete" && summary && (
        <section className="rush-results">
          <span className="eyebrow"><span className="eyebrow-line" /> RUN COMPLETE · {durationSeconds} SECONDS</span>
          <div className="rush-result-icon"><Trophy size={24} /></div>
          <h1>RUSH <span>COMPLETE.</span></h1>
          <div className="rush-final-score"><span>FINAL SCORE</span><strong>{summary.score.toLocaleString()}</strong></div>
          <div className="rush-summary-grid">
            <div><span>SUCCESSFUL HITS</span><strong>{summary.successfulHits}</strong></div>
            <div><span>ACCURACY</span><strong>{summary.accuracyPercent.toFixed(1)}<small>%</small></strong></div>
            <div><span>AVERAGE REACTION</span><strong>{summary.averageReactionMs.toFixed(0)}<small>ms</small></strong></div>
            <div><span>LONGEST COMBO</span><strong>{summary.longestCombo}</strong></div>
            <div><span>DIFFICULTY REACHED</span><strong>{summary.difficultyReached}<small> / 5</small></strong></div>
            <div><span>BONUS TARGETS</span><strong>{summary.bonusTargetsHit}</strong></div>
          </div>
          <div className="rush-score-breakdown">
            <span>SCORING BREAKDOWN</span>
            <div><small>Hit points</small><b>{summary.hitPoints.toLocaleString()}</b></div>
            <div><small>Bonus points</small><b>+{summary.bonusPoints.toLocaleString()}</b></div>
            <div><small>Combo bonus</small><b>+{summary.comboBonus.toLocaleString()}</b></div>
            <div><small>Penalties</small><b>−{summary.penalties.toLocaleString()}</b></div>
          </div>
          <div className="complete-actions"><button className="primary-button" onClick={startGame}><RotateCcw size={15} /> PLAY AGAIN</button><button className="outline-button" onClick={onBack}>BACK TO CHALLENGES</button></div>
          <p className="local-score-note">Your best completed run represents you in the Hall of Fame.</p>
        </section>
      )}
    </div>
  );
}
