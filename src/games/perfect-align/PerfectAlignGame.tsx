import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crosshair, RotateCcw, Target, Trophy } from "lucide-react";
import { ChallengerName, ScoreStatus, useGameSession } from "../../ui/arena-data";
import {
  ALIGN_LEVELS,
  alignmentPoints,
  alignmentPrecisionPercent,
  createAlignStage,
  evaluateAlignment,
  markerPositionAt,
  targetCenterAt,
  type AlignResult,
  type AlignStage
} from "./engine";

type Phase = "intro" | "countdown" | "running" | "attempt-result" | "complete";
type Props = { onBack: () => void };

export default function PerfectAlignGame({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [dualAlignment, setDualAlignment] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [levelIndex, setLevelIndex] = useState(0);
  const [stageNumber, setStageNumber] = useState(1);
  const [attempt, setAttempt] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stage, setStage] = useState<AlignStage | null>(null);
  const [lastResult, setLastResult] = useState<AlignResult | null>(null);
  const [results, setResults] = useState<AlignResult[]>([]);
  const startRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const evaluateRef = useRef<() => void>(() => {});

  const totalStages = dualAlignment && levelIndex >= 2 ? 2 : 1;
  const position = stage ? markerPositionAt(stage, elapsedMs) : 0;
  const zoneCenter = stage ? targetCenterAt(stage, elapsedMs) : 0.5;
  const totalPoints = results.reduce((sum, result) => sum + alignmentPoints(result), 0);
  const tracking = useGameSession("perfect-align", phase, totalPoints);
  const successfulStages = results.filter((result) => result.withinTarget).length;
  const perfectStages = results.filter((result) => result.withinTarget && alignmentPrecisionPercent(result) >= 90).length;
  const totalAttempts = results.length;
  const clearedLevels = ALIGN_LEVELS.filter((level, index) => {
    const requiredStages = dualAlignment && index >= 2 ? 2 : 1;
    const successfulLevelStages = new Set(results
      .filter((result) => result.level === level.level && result.withinTarget)
      .map((result) => result.stage));
    return successfulLevelStages.size === requiredStages;
  }).length;

  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        startRef.current = performance.now();
        setElapsedMs(0);
        setPhase("running");
      } else {
        setCountdown(Math.ceil(remaining / 1_000));
      }
    }, 30);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    const update = () => {
      if (startRef.current !== null) setElapsedMs(performance.now() - startRef.current);
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const beginStage = (nextLevel: number, nextStage: number, nextAttempt: number, randomStage = true) => {
    const count = dualAlignment && nextLevel >= 2 ? 2 : 1;
    const nextConfig = randomStage ? createAlignStage(nextLevel, nextStage, count) : stage;
    if (nextConfig) setStage(nextConfig);
    setLevelIndex(nextLevel);
    setStageNumber(nextStage);
    setAttempt(nextAttempt);
    setLastResult(null);
    setCountdown(3);
    setElapsedMs(0);
    startRef.current = null;
    deadlineRef.current = performance.now() + 3_000;
    setPhase("countdown");
  };

  const startChallenge = () => {
    setResults([]);
    setLevelIndex(0);
    setStageNumber(1);
    setAttempt(1);
    setStage(null);
    beginStage(0, 1, 1);
  };

  const stopMarker = () => {
    if (phase !== "running" || !stage || startRef.current === null) return;
    const finalElapsed = performance.now() - startRef.current;
    const result = evaluateAlignment(stage, finalElapsed, attempt);
    const nextResults = [...results, result];
    setResults(nextResults);
    setElapsedMs(finalElapsed);
    setLastResult(result);
    startRef.current = null;
    setPhase("attempt-result");
  };
  evaluateRef.current = stopMarker;

  useEffect(() => {
    if (phase !== "running") return;
    const keyDown = (event: KeyboardEvent) => {
      if ((event.code !== "Space" && event.key !== "Enter") || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
      event.preventDefault();
      evaluateRef.current();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [phase]);

  const continueAfterResult = () => {
    if (!lastResult) return;
    if (lastResult.withinTarget) {
      if (stageNumber < totalStages) {
        beginStage(levelIndex, stageNumber + 1, 1);
      } else if (levelIndex < ALIGN_LEVELS.length - 1) {
        beginStage(levelIndex + 1, 1, 1);
      } else {
        setPhase("complete");
      }
      return;
    }
    if (attempt < ALIGN_LEVELS[levelIndex].attemptsAllowed) {
      beginStage(levelIndex, stageNumber, attempt + 1, false);
      return;
    }
    if (levelIndex < ALIGN_LEVELS.length - 1) {
      beginStage(levelIndex + 1, 1, 1);
    } else {
      setPhase("complete");
    }
  };

  const retryCurrent = () => {
    setResults([]);
    setLastResult(null);
    beginStage(0, 1, 1);
  };

  return (
    <div className="page-content interior-page perfect-align-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO CHALLENGES</button>
      <ScoreStatus {...tracking} />
      {phase === "intro" && (
        <section className="align-intro">
          <div className="align-intro-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 03 · ACCURACY</span>
            <h1>PERFECT <span>ALIGN.</span></h1>
            <p>A moving marker. A narrow target zone. Stop when they overlap—then see exactly how close your timing came.</p>
            <div className="align-level-list">{ALIGN_LEVELS.map((item) => <div key={item.level}><span>0{item.level}</span><strong>{item.name}</strong><i style={{ width: `${Math.max(8, item.targetWidth * 100)}%` }} /><small>{(item.targetWidth * 100).toFixed(0)}% ZONE</small></div>)}</div>
            <details open className="game-user-guide align-guide">
              <summary>QUICK PLAYER GUIDE · READ BEFORE STARTING</summary>
              <ol>
                <li>Watch the marker travel along the track and stop it while it is inside the gold zone.</li>
                <li>The actual marker and zone positions are evaluated at your stop input; the zone does not move afterward.</li>
                <li>You have three attempts per alignment. The zone becomes narrower at each level.</li>
                <li>On the advanced levels, the marker speed varies predictably and the zone moves slowly.</li>
                <li>Dual Alignment asks for two successful stops in a row from Level 3 onward.</li>
              </ol>
              <p>Press STOP, Space, or Enter. A level only counts when the marker is within the displayed zone boundaries.</p>
            </details>
            <label className="dual-toggle"><input type="checkbox" checked={dualAlignment} onChange={(event) => setDualAlignment(event.target.checked)} /><span><strong>DUAL ALIGNMENT</strong><small>Two consecutive alignments from Level 3 onward</small></span></label>
            <ChallengerName value={tracking.challenger} onChange={tracking.setChallenger} />
            <button className="primary-button" onClick={startChallenge}>START ALIGNMENT <ArrowRight size={16} /></button>
            <p className="local-score-note">Completed scores appear in the live Hall of Fame.</p>
          </div>
          <div className="align-art" aria-hidden="true"><div className="align-art-ring" /><div className="align-art-track"><i /></div><Crosshair size={35} /></div>
        </section>
      )}

      {(phase === "countdown" || phase === "running") && stage && (
        <section className="align-play">
          <div className="align-play-head">
            <div><span className="eyebrow"><span className="eyebrow-line" /> LEVEL {levelIndex + 1} OF {ALIGN_LEVELS.length} · {stage.level.name.toUpperCase()}</span><h1>FIND THE <span>WINDOW.</span></h1></div>
            <div className="align-stage-label">{totalStages > 1 ? `ALIGNMENT ${stageNumber} / ${totalStages}` : "SINGLE ALIGNMENT"}<small>ATTEMPT {attempt} / {stage.level.attemptsAllowed}</small></div>
          </div>
          <div className="align-target-summary"><span>TARGET WIDTH <strong>{(stage.level.targetWidth * 100).toFixed(0)}%</strong></span><span>MARKER SPEED <strong>{stage.level.variableSpeed ? "VARIABLE" : `${(stage.level.speed * 100).toFixed(0)}% / SEC`}</strong></span><span>LEVELS CLEARED <strong>{clearedLevels} / 5</strong></span></div>
          <div className={`align-track-wrap ${phase === "countdown" ? "align-countdown-active" : ""}`} aria-label="Moving marker and target track">
            <div className="align-track">
              <span className="track-mark mark-start">0</span><span className="track-mark mark-mid">50</span><span className="track-mark mark-end">100</span>
              <div className="align-zone" style={{ left: `${(zoneCenter - stage.level.targetWidth / 2) * 100}%`, width: `${stage.level.targetWidth * 100}%` }} />
              <div className="align-marker" style={{ left: `${position * 100}%` }}><i /><span>MARKER</span></div>
              {phase === "countdown" && <div className="align-countdown">{countdown}</div>}
            </div>
          </div>
          <div className="align-live-readout"><span>POSITION <strong>{(position * 100).toFixed(1)}%</strong></span><span>ZONE CENTER <strong>{(zoneCenter * 100).toFixed(1)}%</strong></span><span>TIME <strong>{(elapsedMs / 1_000).toFixed(2)}s</strong></span></div>
          {phase === "running" ? <button className="align-stop-button" onClick={stopMarker}><span>STOP MARKER</span><small>SPACE · ENTER</small></button> : <div className="align-wait-label">GET READY · THE MARKER STARTS AFTER THE COUNTDOWN</div>}
          <p className="local-score-note">No time limit. Watch the track, take your time, and stop when you're ready.</p>
        </section>
      )}

      {phase === "attempt-result" && lastResult && (
        <section className={`align-result ${lastResult.withinTarget ? "align-hit" : "align-miss"}`}>
          <span className="eyebrow"><span className="eyebrow-line" /> LEVEL {lastResult.level} · ALIGNMENT {lastResult.stage} · ATTEMPT {lastResult.attempt}</span>
          <div className="align-result-icon">{lastResult.withinTarget ? <Target size={24} /> : <Crosshair size={24} />}</div>
          <h1>{lastResult.withinTarget ? "LOCKED IN." : "JUST OUTSIDE."}</h1>
          <p>{lastResult.withinTarget ? "The marker landed within the published target boundaries." : "The marker missed the published target boundaries. No forced wins—take another attempt."}</p>
          <div className="align-result-stats"><div><span>MARKER POSITION</span><strong>{(lastResult.markerPosition * 100).toFixed(2)}%</strong></div><div><span>TARGET CENTER</span><strong>{(lastResult.targetCenter * 100).toFixed(2)}%</strong></div><div><span>DISTANCE</span><strong>{lastResult.errorPercent.toFixed(2)}<small>%</small></strong></div><div><span>PRECISION</span><strong>{alignmentPrecisionPercent(lastResult).toFixed(0)}<small>%</small></strong></div><div><span>POINTS</span><strong>{alignmentPoints(lastResult).toLocaleString()}</strong></div></div>
          <div className="complete-actions"><button className="primary-button" onClick={continueAfterResult}>{lastResult.withinTarget ? "CONTINUE" : attempt < stage!.level.attemptsAllowed ? "TRY AGAIN" : levelIndex < ALIGN_LEVELS.length - 1 ? "NEXT LEVEL" : "VIEW RESULTS"} <ArrowRight size={15} /></button><button className="outline-button" onClick={() => setPhase("complete")}>END CHALLENGE</button></div>
        </section>
      )}

      {phase === "complete" && (
        <section className="align-result align-final">
          <span className="eyebrow"><span className="eyebrow-line" /> RUN SUMMARY</span><div className="align-result-icon"><Trophy size={24} /></div>
          <h1>ALIGNMENT <span>REPORT.</span></h1>
          <p>{clearedLevels} of 5 levels cleared across {totalAttempts} total attempt{totalAttempts === 1 ? "" : "s"}.</p>
          <div className="align-result-stats"><div><span>SUCCESSFUL ALIGNMENTS</span><strong>{successfulStages}</strong></div><div><span>PERFECT PRECISION (90%+)</span><strong>{perfectStages}</strong></div><div><span>TOTAL POINTS</span><strong>{totalPoints.toLocaleString()}</strong></div><div><span>BEST ERROR</span><strong>{results.length ? Math.min(...results.map((result) => result.errorPercent)).toFixed(2) : "—"}<small>%</small></strong></div></div>
          <div className="align-history">{results.map((result, index) => <div key={`${result.level}-${result.stage}-${result.attempt}-${index}`}><span>L{result.level} · A{result.stage} · TRY {result.attempt}</span><strong className={result.withinTarget ? "history-hit" : "history-miss"}>{result.withinTarget ? "HIT" : "MISS"}</strong><small>{result.errorPercent.toFixed(2)}% OFF CENTER</small><b>{alignmentPoints(result)} PTS</b></div>)}</div>
          <div className="complete-actions"><button className="primary-button" onClick={retryCurrent}><RotateCcw size={15} /> PLAY AGAIN</button><button className="outline-button" onClick={onBack}>BACK TO CHALLENGES</button></div>
          <p className="local-score-note">The score is submitted to the Hall of Fame. Gameplay is browser-scored and not server-replayed or verified for prizes.</p>
        </section>
      )}
    </div>
  );
}
