import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, RotateCcw, ShieldAlert, Timer, Trophy, X } from "lucide-react";
import { ChallengerName, ScoreStatus, useGameSession } from "../../ui/arena-data";
import { createQuiz, scoreAnswer, type QuizAnswer } from "./engine";
import { QUESTION_BANK, QUIZ_CATEGORIES, type Question, type QuizCategory } from "./questions";

type Phase = "intro" | "playing" | "feedback" | "complete";
type Props = { onBack: () => void };

function shuffleAnswers(question: Question, random: () => number = Math.random): Question {
  const choices = question.options.map((option, index) => ({ option, correct: index === question.answerIndex }));
  for (let index = choices.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  return { ...question, options: choices.map(({ option }) => option) as Question["options"], answerIndex: choices.findIndex(({ correct }) => correct) };
}

export default function BrainFirewallGame({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [selectedCategories, setSelectedCategories] = useState<QuizCategory[]>([...QUIZ_CATEGORIES]);
  const [questionCount, setQuestionCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const tracking = useGameSession("brain-firewall", phase, score);
  const [errorMessage, setErrorMessage] = useState("");
  const questionStartedAt = useRef<number | null>(null);
  const answered = useRef(false);
  const answerRef = useRef<(answerIndex: number | null) => void>(() => {});
  const currentQuestion = questions[questionIndex];
  const currentAnswer = answers[answers.length - 1];
  const correctCount = answers.filter((answer) => answer.correct).length;
  const accuracy = answers.length ? Math.round((correctCount / answers.length) * 100) : 0;

  const answerQuestion = (answerIndex: number | null) => {
    if (phase !== "playing" || !currentQuestion || answered.current) return;
    answered.current = true;
    const elapsed = Math.max(0, performance.now() - (questionStartedAt.current ?? performance.now()));
    const result = scoreAnswer(currentQuestion, answerIndex, elapsed, streak);
    const nextStreak = result.correct ? streak + 1 : 0;
    setAnswers((previous) => [...previous, result]);
    setScore((previous) => previous + result.earnedPoints);
    setStreak(nextStreak);
    setBestStreak((previous) => Math.max(previous, nextStreak));
    setSelectedIndex(answerIndex);
    setPhase("feedback");
  };
  answerRef.current = answerQuestion;

  useEffect(() => {
    if (phase !== "playing" || !currentQuestion) return;
    questionStartedAt.current = performance.now();
    answered.current = false;
    setTimeRemainingMs(currentQuestion.timeLimitSeconds * 1_000);
    const interval = window.setInterval(() => {
      const started = questionStartedAt.current;
      if (started === null) return;
      const remaining = Math.max(0, currentQuestion.timeLimitSeconds * 1_000 - (performance.now() - started));
      setTimeRemainingMs(remaining);
      if (remaining === 0) answerRef.current(null);
    }, 50);
    return () => window.clearInterval(interval);
  }, [phase, currentQuestion]);

  useEffect(() => {
    if (phase !== "playing") return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || !["1", "2", "3", "4"].includes(event.key)) return;
      event.preventDefault();
      answerRef.current(Number(event.key) - 1);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [phase]);

  const startQuiz = () => {
    try {
      const selected = createQuiz(QUESTION_BANK, selectedCategories, questionCount).map((question) => shuffleAnswers(question));
      setQuestions(selected);
      setAnswers([]);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setQuestionIndex(0);
      setSelectedIndex(null);
      setErrorMessage("");
      setPhase("playing");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start the quiz.");
    }
  };

  const advance = () => {
    if (questionIndex + 1 < questions.length) {
      setSelectedIndex(null);
      setQuestionIndex((index) => index + 1);
      setPhase("playing");
    } else {
      setPhase("complete");
    }
  };

  const toggleCategory = (category: QuizCategory) => {
    setSelectedCategories((previous) => previous.includes(category)
      ? previous.filter((item) => item !== category)
      : [...previous, category]);
  };

  return (
    <div className="page-content interior-page brain-firewall-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> BACK TO CHALLENGES</button>
      <ScoreStatus {...tracking} />
      {phase === "intro" && (
        <section className="firewall-intro">
          <div className="eyebrow"><span className="eyebrow-line" /> CHALLENGE 04 · KNOWLEDGE</div>
          <h1>BRAIN <span>FIREWALL.</span></h1>
          <p>Challenge what you know about technology, privacy, security, AI, and the digital world. Learn from every answer.</p>
          <details open className="game-user-guide firewall-guide">
            <summary>QUICK PLAYER GUIDE · READ BEFORE STARTING</summary>
            <ol>
              <li>Choose one or more topics and a 10- or 20-question run.</li>
              <li>Select an answer before the question timer expires. Keys 1–4 also work.</li>
              <li>Correct answers earn points for difficulty, speed, and your current streak.</li>
              <li>Read the explanation and source after each question; timeout counts as unanswered.</li>
            </ol>
            <p>Questions are for awareness and learning, not professional security advice. Do not enter real personal information in this game.</p>
          </details>
          <div className="firewall-setup">
            <div className="firewall-setup-title"><span>SELECT TOPICS</span><small>{QUESTION_BANK.length} REVIEWED QUESTIONS · {QUIZ_CATEGORIES.length} TOPICS</small></div>
            <div className="category-picker">{QUIZ_CATEGORIES.map((category) => <label key={category} className={selectedCategories.includes(category) ? "category-selected" : ""}><input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} /><span>{category}</span></label>)}</div>
            <div className="question-count-picker"><span>RUN LENGTH</span><button className={questionCount === 10 ? "count-selected" : ""} onClick={() => setQuestionCount(10)}>10 QUESTIONS</button><button className={questionCount === 20 ? "count-selected" : ""} onClick={() => setQuestionCount(20)}>20 QUESTIONS</button></div>
          </div>
          {errorMessage && <p className="firewall-error" role="alert">{errorMessage}</p>}
          <ChallengerName value={tracking.challenger} onChange={tracking.setChallenger} />
          <button className="primary-button" onClick={startQuiz}>START QUIZ <ArrowRight size={16} /></button>
          <p className="local-score-note">Completed scores appear in the live Hall of Fame.</p>
        </section>
      )}

      {(phase === "playing" || phase === "feedback") && currentQuestion && (
        <section className="firewall-play">
          <div className="firewall-play-top"><div><span className="eyebrow"><span className="eyebrow-line" /> {currentQuestion.category.toUpperCase()} · {currentQuestion.difficulty.toUpperCase()}</span><h1>QUESTION <span>{String(questionIndex + 1).padStart(2, "0")}</span><small> / {String(questions.length).padStart(2, "0")}</small></h1></div><div className="firewall-live-score"><span>SCORE</span><strong>{score.toLocaleString()}</strong><small>STREAK ×{streak}</small></div></div>
          <div className="firewall-progress"><i style={{ width: `${(questionIndex / questions.length) * 100}%` }} /></div>
          <div className={`firewall-timer ${timeRemainingMs < 5_000 ? "timer-warning" : ""}`}><Timer size={14} /><span>{Math.ceil(timeRemainingMs / 1_000)} SEC</span><i style={{ width: `${(timeRemainingMs / (currentQuestion.timeLimitSeconds * 1_000)) * 100}%` }} /></div>
          <article className="firewall-question-card">
            <span className="question-label">SELECT THE BEST ANSWER</span>
            <h2>{currentQuestion.question}</h2>
            <div className="firewall-options">{currentQuestion.options.map((option, index) => {
              const correctChoice = phase === "feedback" && index === currentQuestion.answerIndex;
              const wrongChoice = phase === "feedback" && index === selectedIndex && !currentAnswer?.correct;
              return <button key={`${currentQuestion.id}-${index}`} className={`firewall-option ${correctChoice ? "option-correct" : ""} ${wrongChoice ? "option-wrong" : ""}`} onClick={() => answerQuestion(index)} disabled={phase === "feedback"}><span className="option-key">{index + 1}</span><span>{option}</span>{correctChoice && <Check size={16} />}{wrongChoice && <X size={16} />}</button>;
            })}</div>
          </article>
          {phase === "feedback" && (
            <div className={`firewall-feedback ${currentAnswer?.correct ? "feedback-correct" : "feedback-wrong"}`} aria-live="polite">
              <div className="feedback-heading">{currentAnswer?.correct ? <><Check size={16} /> CORRECT · +{currentAnswer.earnedPoints} POINTS</> : <><ShieldAlert size={16} /> {selectedIndex === null ? "TIME'S UP · NO POINTS" : "NOT QUITE · NO POINTS"}</>}</div>
              <p>{currentQuestion.explanation}</p><small>SOURCE: {currentQuestion.source}</small>
              <button className="primary-button" onClick={advance}>{questionIndex + 1 < questions.length ? "NEXT QUESTION" : "VIEW RESULTS"} <ArrowRight size={15} /></button>
            </div>
          )}
        </section>
      )}

      {phase === "complete" && (
        <section className="firewall-results">
          <span className="eyebrow"><span className="eyebrow-line" /> RUN SUMMARY · {questions.length} QUESTIONS</span>
          <div className="firewall-result-icon"><Trophy size={24} /></div><h1>KNOWLEDGE <span>CHECK.</span></h1>
          <div className="firewall-result-stats"><div><span>TOTAL SCORE</span><strong>{score.toLocaleString()}</strong></div><div><span>CORRECT</span><strong>{correctCount} / {questions.length}</strong></div><div><span>ACCURACY</span><strong>{accuracy}<small>%</small></strong></div><div><span>BEST STREAK</span><strong>{bestStreak}</strong></div></div>
          <div className="firewall-review"><h2><CircleHelp size={15} /> ANSWER REVIEW</h2>{questions.map((question, index) => {
            const answer = answers[index];
            return <article key={question.id} className="firewall-review-item"><div><span>Q{String(index + 1).padStart(2, "0")} · {question.category.toUpperCase()}</span><b className={answer?.correct ? "history-hit" : "history-miss"}>{answer?.correct ? "CORRECT" : answer?.selectedIndex === null ? "TIMEOUT" : "MISSED"}</b></div><p>{question.question}</p><small>{question.explanation}</small></article>;
          })}</div>
          <div className="complete-actions"><button className="primary-button" onClick={() => setPhase("intro")}><RotateCcw size={15} /> PLAY AGAIN</button><button className="outline-button" onClick={onBack}>BACK TO CHALLENGES</button></div>
          <p className="local-score-note">Your best completed run appears in the Hall of Fame. Answers and score are browser-generated, not independently verified.</p>
        </section>
      )}
    </div>
  );
}
