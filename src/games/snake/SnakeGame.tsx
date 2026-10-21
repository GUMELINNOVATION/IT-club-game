import { useEffect, useRef, useState } from "react";
import { LocalizedContent } from "../../ui/i18n";
import { ArrowLeft, ArrowRight, Keyboard, Pause, Play, RotateCcw, Shield, Trophy, Zap } from "lucide-react";
import { ChallengerName, ScoreStatus, useGameSession } from "../../ui/arena-data";
import { advanceSnake, BOARD, createSnake, dronesAt, gateCells, gatePhase, MAX_LEVEL, queueTurn, RUN_LIMIT_MS, stepDuration, type Direction, type SnakeState } from "./engine";
import "./snake.css";

type Phase = "intro" | "countdown" | "running" | "paused" | "complete";
const arrowDirections: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const cellSize = 30;

export default function SnakeGame({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<SnakeState>(() => createSnake());
  const [countdown, setCountdown] = useState(3);
  const [boosting, setBoosting] = useState(false);
  const stateRef = useRef(state);
  const boostRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const boardRef = useRef<HTMLDivElement>(null);
  const tracking = useGameSession("snake", phase, state.score);
  const update = (next: SnakeState) => { stateRef.current = next; setState(next); };

  const start = () => {
    update(createSnake());
    setCountdown(3);
    boostRef.current = false;
    setBoosting(false);
    setPhase("countdown");
  };
  const pause = () => {
    boostRef.current = false;
    setBoosting(false);
    setPhase("paused");
  };
  const resume = () => { setCountdown(3); setPhase("countdown"); };

  useEffect(() => {
    if (phase !== "countdown") return;
    boardRef.current?.focus();
    const deadline = performance.now() + 3_000;
    const timer = window.setInterval(() => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) setPhase("running");
      else setCountdown(Math.ceil(remaining / 1_000));
    }, 50);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const animate = (now: number) => {
      // A stalled browser pauses rather than teleporting through several unseen moves.
      if (now - previous > 500) { pause(); return; }
      accumulator += now - previous;
      previous = now;
      let next = stateRef.current;
      while (accumulator >= stepDuration(next.level, boostRef.current) && !next.over) {
        accumulator -= stepDuration(next.level, boostRef.current);
        next = advanceSnake(next, boostRef.current);
      }
      if (next !== stateRef.current) update(next);
      if (next.over) { setPhase("complete"); return; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const current = phaseRef.current;
      if (current === "intro" || current === "complete") return;
      if (arrowDirections[event.key]) {
        event.preventDefault();
        if (current === "running" && !event.repeat) update(queueTurn(stateRef.current, arrowDirections[event.key]));
      } else if (event.code === "Space" && current === "running") {
        event.preventDefault();
        boostRef.current = true;
        setBoosting(true);
      } else if ((event.key.toLowerCase() === "p" || event.key === "Escape") && !event.repeat) {
        event.preventDefault();
        if (current === "running" || current === "countdown") pause();
        else if (current === "paused") resume();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") { boostRef.current = false; setBoosting(false); }
    };
    const blur = () => {
      if (phaseRef.current === "running" || phaseRef.current === "countdown") pause();
    };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const gateStatus = gatePhase(state.tick, state.level);
  const secondsLeft = Math.ceil((RUN_LIMIT_MS - Math.min(state.elapsedMs, RUN_LIMIT_MS)) / 1000);
  return <LocalizedContent><div className="page-content interior-page snake-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={18} /> BACK TO CHALLENGES</button>
    <ScoreStatus {...tracking} />
    {phase === "intro" ? <section className="snake-intro">
      <div><span className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 05 · SURVIVAL</span>
        <h1>NEON <span>SNAKE.</span></h1>
        <p>Classic controls. Hostile territory. Outrun the sentinels, thread the pulse gates, and survive a grid that gets faster as you grow.</p>
        <div className="snake-feature-list"><span><Keyboard size={20} /> ARROW-KEY CONTROL</span><span><Zap size={20} /> {MAX_LEVEL} SPEED LEVELS</span><span><Shield size={20} /> ESCALATING GRID HAZARDS</span></div>
        <details open className="game-user-guide snake-guide"><summary>PLAYER BRIEFING · READ BEFORE STARTING</summary><ol>
          <li>Use <strong>↑ ↓ ← →</strong> to steer. You cannot reverse directly into your body. Two quick turns can be queued.</li>
          <li>Green <strong>+100</strong> data grows your snake. Chain pickups within 60 moves for up to a <strong>×5 combo</strong>.</li>
          <li>Red <strong>−150</strong> data cuts two tail segments and resets your combo. Scores never drop below zero.</li>
          <li>Every five food pickups reveals gold <strong>+350</strong> data. It expires after 55 moves. Every six may reveal a shield.</li>
          <li>Walls and your body are fatal. Red pulse gates and moving sentinels are fatal unless you have a shield; using it costs <strong>−100</strong>.</li>
          <li>Hold <strong>Space</strong> for a speed boost at <strong>−5 per move</strong>. Press <strong>P / Esc</strong> to pause. Survive three minutes or set a high score before you crash.</li>
        </ol><p>Every three food pickups and every 20 seconds add a difficulty level, up to level {MAX_LEVEL}. Level-ups add distant firewall blocks; higher levels introduce more corruption and longer live-gate windows. Gates flash amber before turning lethal. Switching tabs automatically pauses the run.</p></details>
        <ChallengerName value={tracking.challenger} onChange={tracking.setChallenger} />
        <button className="primary-button" onClick={start}>ENTER THE GRID <ArrowRight size={18} /></button>
        <p className="local-score-note">Keyboard required. Your completed score joins the Neon Snake live rankings.</p>
      </div>
      <div className="snake-intro-art" aria-hidden="true"><div className="snake-art-track"><i /><i /><i /><i /><i /><i /></div><b>+</b><span>EVOLVE. EVADE. SURVIVE.</span></div>
    </section> : <section className="snake-arena">
      <div className="snake-heading"><div><span className="eyebrow">SURVIVAL · CHALLENGE 05</span><h1>NEON <span>SNAKE.</span></h1></div>
        {phase === "running" && <button className="outline-button" onClick={pause}><Pause size={17} /> PAUSE · P</button>}
      </div>
      <div className="snake-hud"><div><span>SCORE</span><strong>{state.score.toLocaleString()}</strong></div><div><span>LEVEL</span><strong>{state.level}<small> / {MAX_LEVEL}</small></strong></div><div><span>COMBO</span><strong>×{state.combo || 1}</strong></div><div><span>TIME LEFT</span><strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div><div><span>SHIELD</span><strong className={state.shield ? "shield-online" : ""}>{state.shield ? "READY" : "—"}</strong></div></div>
      <div className={`snake-board ${boosting ? "snake-boosting" : ""}`} ref={boardRef} tabIndex={0} aria-label="Neon Snake arena. Arrow keys to steer, hold Space to boost, P to pause." aria-describedby="snake-controls">
        <svg viewBox={`0 0 ${BOARD.width * cellSize} ${BOARD.height * cellSize}`} role="img" aria-label={`Snake length ${state.body.length}. Score ${state.score}. Level ${state.level}.`}>
          <defs><pattern id="snake-grid" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse"><path d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`} fill="none" stroke="#183044" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="#080f1b" /><rect width="100%" height="100%" fill="url(#snake-grid)" />
          {state.walls.map((cell) => <g key={`wall-${cell.x}-${cell.y}`}><rect x={cell.x * cellSize + 2} y={cell.y * cellSize + 2} width="26" height="26" rx="3" fill="#34425d" stroke="#8a9cbe" /><path d={`M${cell.x * cellSize + 7} ${cell.y * cellSize + 7}l16 16m0-16l-16 16`} stroke="#8a9cbe" /></g>)}
          {gateCells().map((cell) => <rect key={`gate-${cell.x}-${cell.y}`} className={`snake-gate gate-${gateStatus}`} x={cell.x * cellSize + 2} y={cell.y * cellSize + 2} width="26" height="26" rx="3" />)}
          {dronesAt(state.tick).map((cell, index) => <g key={`drone-${index}`} className="snake-drone"><path d={`M${cell.x * cellSize + 15} ${cell.y * cellSize + 2}l13 13-13 13-13-13z`} /><text x={cell.x * cellSize + 15} y={cell.y * cellSize + 21}>×</text></g>)}
          {state.pickups.map((item) => <g key={`${item.kind}-${item.x}-${item.y}`} className={`snake-pickup pickup-${item.kind}`}><rect x={item.x * cellSize + 2} y={item.y * cellSize + 2} width="26" height="26" rx={item.kind === "poison" ? 4 : 10} /><text x={item.x * cellSize + 15} y={item.y * cellSize + 22}>{item.kind === "poison" ? "−" : item.kind === "shield" ? "S" : "+"}</text>{item.expiresAt && <rect x={item.x * cellSize + 3} y={item.y * cellSize + 27} width={24 * Math.max(0, (item.expiresAt - state.tick) / 55)} height="2" fill="#fff" />}</g>)}
          {[...state.body].reverse().map((cell, index) => {
            const isHead = index === state.body.length - 1;
            return <g key={`body-${index}`}><rect x={cell.x * cellSize + 2} y={cell.y * cellSize + 2} width="26" height="26" rx={isHead ? 8 : 5} fill={isHead ? "#d0fff0" : "#50dda0"} opacity={isHead ? 1 : .5 + (index / state.body.length) * .5} stroke={isHead && state.shield ? "#a990ff" : "#85ffd1"} strokeWidth={isHead && state.shield ? 3 : 1} />{isHead && <text x={cell.x * cellSize + 15} y={cell.y * cellSize + 21} className="snake-head-arrow">{({ up: "↑", down: "↓", left: "←", right: "→" })[state.direction]}</text>}</g>;
          })}
        </svg>
        {(phase === "countdown" || phase === "paused" || phase === "complete") && <div className="snake-overlay">
          {phase === "countdown" ? <><span>ARROW KEYS READY</span><strong className="snake-countdown">{countdown}</strong><p>The grid starts after the countdown.</p></> : phase === "paused" ? <><Pause size={36} /><h2>GRID PAUSED</h2><p>Take a breath. Your run is safe.</p><button className="primary-button" onClick={resume}><Play size={18} /> RESUME · P</button></> : <><Trophy size={32} /><h2>{state.elapsedMs >= RUN_LIMIT_MS ? "GRID CONQUERED" : "SIGNAL LOST"}</h2><p>{state.reason}</p><strong className="snake-final-score">{state.score.toLocaleString()} <small>PTS</small></strong><button className="primary-button" onClick={start}><RotateCcw size={18} /> PLAY AGAIN</button></>}
        </div>}
      </div>
      <div className="snake-feedback" role="status"><span className={state.delta < 0 ? "score-negative" : "score-positive"}>{state.notice}</span><span className={`gate-indicator gate-indicator-${gateStatus}`}>GATES {gateStatus === "active" ? "LIVE" : gateStatus === "warning" ? "CHARGING" : "SAFE"}</span></div>
      <div className="snake-legend"><span className="score-positive">+100 DATA · COMBO ×1–5</span><span className="score-negative">−150 CORRUPTION</span><span className="snake-gold">+350 GOLD DATA</span><span className="snake-purple">S SHIELD · HIT COST −100</span></div>
      <p className="snake-controls" id="snake-controls"><Keyboard size={19} /> ↑ ↓ ← → STEER <span>SPACE: BOOST −5 / MOVE</span><span>P / ESC: PAUSE</span></p>
      {phase === "complete" && <div className="snake-report"><div><span>POINTS EARNED</span><strong className="score-positive">+{state.earned.toLocaleString()}</strong></div><div><span>POINTS LOST</span><strong className="score-negative">−{state.penalties.toLocaleString()}</strong></div><div><span>BEST COMBO</span><strong>×{state.bestCombo || 1}</strong></div><div><span>DATA COLLECTED</span><strong>{state.foods}</strong></div></div>}
    </section>}
  </div></LocalizedContent>;
}
