import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Clock3, RotateCcw, Sparkles, Timer, Trophy } from "lucide-react";
import { ScoreStatus, useGameSession } from "../../ui/arena-data";
import { LocalizedContent } from "../../ui/i18n";
import {
  createRoundResult,
  createRoundTargets,
  formatMilliseconds,
  isTimerVisible,
  type ZeroPointRound,
  type ZeroPointRoundResult
} from "./engine";

type Phase = "intro" | "countdown" | "go" | "running" | "round-result" | "complete";

type Props = {
  onBack: () => void;
};

function randomRoundValue(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] / 0x1_0000_0000;
}

export default function ZeroPointGame({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [rounds, setRounds] = useState<ZeroPointRound[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [results, setResults] = useState<ZeroPointRoundResult[]>([]);
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const countdownDeadlineRef = useRef<number | null>(null);
  const stopRoundRef = useRef<() => void>(() => {});

  const currentRound = rounds[roundIndex];
  const isVisible = currentRound ? isTimerVisible(currentRound, elapsedMs) : true;
  const totalScore = results.reduce((sum, result) => sum + result.score, 0);
  const tracking = useGameSession("zero-point", phase, totalScore);
  const { challenger: callSign, setChallenger: setCallSign } = tracking;
  const totalError = results.reduce((sum, result) => sum + result.errorMs, 0);
  const bestRoundError = results.length > 0 ? Math.min(...results.map((result) => result.errorMs)) : 0;

  useEffect(() => {
    if (phase !== "countdown") return;

    const updateCountdown = () => {
      const deadline = countdownDeadlineRef.current;
      if (deadline === null) return;
      const remainingMs = deadline - performance.now();

      if (remainingMs <= 0) {
        startTimeRef.current = performance.now();
        setElapsedMs(0);
        setPhase("go");
        return;
      }

      setCountdown(Math.ceil(remainingMs / 1_000));
    };

    const timer = window.setInterval(updateCountdown, 30);
    updateCountdown();
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "go") return;
    const timer = window.setTimeout(() => setPhase("running"), 450);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;

    const updateElapsedTime = () => {
      const startedAt = startTimeRef.current;
      if (startedAt !== null) setElapsedMs(performance.now() - startedAt);
    };

    const timer = window.setInterval(updateElapsedTime, 30);
    return () => window.clearInterval(timer);
  }, [phase]);

  const beginRound = (index: number) => {
    setRoundIndex(index);
    setElapsedMs(0);
    setCountdown(3);
    startTimeRef.current = null;
    countdownDeadlineRef.current = performance.now() + 3_000;
    setPhase("countdown");
  };

  const startChallenge = () => {
    const configuredRounds = createRoundTargets(randomRoundValue);
    setRounds(configuredRounds);
    setResults([]);
    beginRound(0);
  };

  const stopRound = () => {
    const startedAt = startTimeRef.current;
    if (phase !== "running" || !currentRound || startedAt === null) return;

    const actualElapsedMs = performance.now() - startedAt;
    const result = createRoundResult(currentRound, actualElapsedMs);
    const nextResults = [...results, result];
    startTimeRef.current = null;
    setElapsedMs(actualElapsedMs);
    setResults(nextResults);
    setPhase(roundIndex === rounds.length - 1 ? "complete" : "round-result");
  };

  stopRoundRef.current = stopRound;

  useEffect(() => {
    if (phase !== "running") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.code !== "Space" && event.key !== "Enter") || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )) return;
      event.preventDefault();
      stopRoundRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase]);

  const continueChallenge = () => beginRound(roundIndex + 1);

  const restartChallenge = () => {
    setRounds([]);
    setResults([]);
    setRoundIndex(0);
    setElapsedMs(0);
    startTimeRef.current = null;
    setPhase("intro");
  };

  return (
    <LocalizedContent><div className="page-content interior-page zero-point-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO CHALLENGES</button>
      <ScoreStatus {...tracking} />

      {phase === "intro" && (
        <section className="zero-intro">
          <div className="zero-intro-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 01 · PRECISION</span>
            <h1>ZERO <span>POINT.</span></h1>
            <p>Eight levels. New random target times on every run. Stop the clock as close to each target as you can.</p>
            <div className="zero-rule-list">
              <div><Timer size={16} /><span><strong>REAL TIMING</strong><small>Measured with your device's high-resolution monotonic clock.</small></span></div>
              <div><Clock3 size={16} /><span><strong>EIGHT RANDOMIZED LEVELS</strong><small>Every target is random to the millisecond. Advanced clock glimpses change on each run.</small></span></div>
              <div><Trophy size={16} /><span><strong>PRECISION SCORE</strong><small>Each round uses the same published, deterministic formula.</small></span></div>
            </div>
            <details open className="game-user-guide">
              <summary>QUICK PLAYER GUIDE · READ BEFORE STARTING</summary>
              <ol>
                <li>Read the target time before the three-second countdown starts.</li>
                <li>Tap STOP, press Space, or press Enter when you think the target time has elapsed.</li>
                <li>On advanced levels the clock briefly disappears, then returns at randomized time windows. Use each glimpse to recalibrate.</li>
                <li>Review your timing error and score after every level. All eight target numbers are randomly generated for each new run.</li>
              </ol>
              <p>Scoring: <code>round(10,000 ÷ (1 + error ms ÷ 25))</code>. Completed runs are saved to the Hall of Fame.</p>
            </details>
            <label className="call-sign-label" htmlFor="zero-call-sign">CALL SIGN <span>OPTIONAL · PUBLIC ON THE HALL OF FAME</span></label>
            <input id="zero-call-sign" className="call-sign-input" value={callSign} onChange={(event) => setCallSign(event.target.value.slice(0, 24))} maxLength={24} placeholder="Play anonymously or choose a nickname" />
            <button className="primary-button zero-start-button" onClick={startChallenge}>START CHALLENGE <ArrowRight size={16} /></button>
            <p className="local-score-note">Your completed score and call sign will appear in the live rankings.</p>
          </div>
          <div className="zero-visual" aria-hidden="true"><div className="zero-ring ring-a" /><div className="zero-ring ring-b" /><div className="zero-ring ring-c" /><div className="zero-center"><span>±</span><small>00.000</small></div><span className="zero-visual-label">PRECISION IS EVERYTHING</span></div>
        </section>
      )}

      {(phase === "countdown" || phase === "go" || phase === "running") && currentRound && (
        <section className={`zero-play-panel ${currentRound.distraction ? "chaos-active" : ""}`}>
          <div className="zero-play-heading">
            <div><span className="eyebrow"><span className="eyebrow-line" /> LEVEL {currentRound.level} OF {rounds.length}</span><h1>{currentRound.name.toUpperCase()}<span>.</span></h1></div>
            <div className="round-progress" aria-label={`Round ${roundIndex + 1} of ${rounds.length}`}>{rounds.map((round, index) => <i key={round.level} className={index < roundIndex ? "done" : index === roundIndex ? "current" : ""} />)}</div>
          </div>
          <div className="target-instructions"><span>TARGET TIME</span><strong>{formatMilliseconds(currentRound.targetMs)} <small>SEC</small></strong><p>{currentRound.distraction ? "Ignore the visual noise. Your target and controls remain clear." : "Let the countdown begin, then stop as close to the target as you can."}</p></div>
          <div className={`clock-face ${isVisible ? "clock-visible" : "clock-hidden"}`} aria-live="off">
            {phase === "countdown" ? <><span className="clock-caption">GET READY</span><strong>{countdown}</strong></> : phase === "go" ? <><span className="clock-caption">YOUR TIME STARTS NOW</span><strong className="clock-go">GO!</strong></> : isVisible ? <><span className="clock-caption">ELAPSED TIME</span><strong>{formatMilliseconds(elapsedMs)}</strong></> : <><span className="clock-caption">CLOCK HIDDEN</span><strong className="clock-dashes">— — —</strong><small>Trust your timing.</small></>}
          </div>
          {phase !== "running" ? <div className="stop-hint">{phase === "go" ? "START TIMING NOW · STOP WHEN YOU'RE READY" : "THE CLOCK STARTS AFTER THE COUNTDOWN"}</div> : <button className="stop-button" onClick={stopRound}><span>STOP</span><small>SPACE · ENTER</small></button>}
          <div className="live-round-note"><span>LEVEL {roundIndex + 1} / {rounds.length}</span><span>SESSION SCORE {results.reduce((sum, result) => sum + result.score, 0).toLocaleString()}</span></div>
        </section>
      )}

      {phase === "round-result" && results.at(-1) && (
        <RoundResult result={results.at(-1)!} roundIndex={roundIndex} totalRounds={rounds.length} onContinue={continueChallenge} />
      )}

      {phase === "complete" && (
        <section className="zero-complete">
          <span className="eyebrow"><span className="eyebrow-line" /> CHALLENGE COMPLETE</span>
          <div className="complete-trophy"><Trophy size={28} /></div>
          <h1>TIME <span>WELL SPENT.</span></h1>
          <p className="complete-call-sign">{callSign.trim() || "CHALLENGER"}, your eight-level run is complete.</p>
          <div className="final-score-card"><span>TOTAL PRECISION SCORE</span><strong>{totalScore.toLocaleString()}</strong><small>OUT OF {rounds.length * 10_000} POSSIBLE POINTS</small></div>
          <div className="summary-stats"><div><span>TOTAL TIMING ERROR</span><strong>{totalError.toFixed(1)} <small>ms</small></strong></div><div><span>BEST ROUND ERROR</span><strong>{bestRoundError.toFixed(1)} <small>ms</small></strong></div></div>
          <div className="results-table">
            <div className="results-table-head"><span>LEVEL</span><span>TARGET</span><span>YOUR TIME</span><span>ERROR</span><span>POINTS</span></div>
            {results.map((result) => <div className="results-table-row" key={result.level}><span>{result.name}</span><span>{formatMilliseconds(result.targetMs)}s</span><span>{formatMilliseconds(result.actualElapsedMs)}s</span><span>{result.errorMs.toFixed(1)}ms</span><strong>{result.score.toLocaleString()}</strong></div>)}
          </div>
          <div className="complete-actions"><button className="primary-button" onClick={restartChallenge}><RotateCcw size={15} /> PLAY AGAIN</button><button className="outline-button" onClick={onBack}>BACK TO CHALLENGES</button></div>
          <p className="local-score-note">Your best completed run represents you in the Hall of Fame.</p>
        </section>
      )}
    </div></LocalizedContent>
  );
}

function RoundResult({ result, roundIndex, totalRounds, onContinue }: {
  result: ZeroPointRoundResult;
  roundIndex: number;
  totalRounds: number;
  onContinue: () => void;
}) {
  const isNearPerfect = result.errorMs <= 25;
  return (
    <LocalizedContent><section className={`round-result ${isNearPerfect ? "near-perfect" : ""}`}>
      <span className="eyebrow"><span className="eyebrow-line" /> ROUND {roundIndex + 1} COMPLETE · LEVEL {result.level}</span>
      <div className="result-icon">{isNearPerfect ? <Sparkles size={22} /> : <Timer size={22} />}</div>
      <h1>{isNearPerfect ? "INCREDIBLE." : "TIME CHECK."}</h1>
      <div className="round-score">{result.score.toLocaleString()} <span>PTS</span></div>
      <div className="result-metrics">
        <div><span>TARGET</span><strong>{formatMilliseconds(result.targetMs)} <small>sec</small></strong></div>
        <div><span>YOUR TIME</span><strong>{formatMilliseconds(result.actualElapsedMs)} <small>sec</small></strong></div>
        <div><span>ERROR</span><strong>{result.errorMs.toFixed(1)} <small>ms</small></strong></div>
      </div>
      <p className="score-explanation">Round score = round(10,000 ÷ (1 + error in milliseconds ÷ 25)). A perfect stop earns 10,000 points.</p>
      <button className="primary-button" onClick={onContinue}>NEXT ROUND <ArrowRight size={15} /><small>{roundIndex + 2} / {totalRounds}</small></button>
    </section></LocalizedContent>
  );
}
