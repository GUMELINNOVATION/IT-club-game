import { useState } from "react";
import { LocalizedContent, useLanguage } from "./i18n";
import { ArrowLeft, ArrowRight, Check, ExternalLink, LockKeyhole, RotateCcw, Shield, ShieldCheck, X } from "lucide-react";
import "./cyber-lab.css";

type ExperimentId = "social-engineering" | "qr-trust" | "phishing" | "wifi" | "footprint";
type ActivityQuestion = {
  prompt: string;
  context?: string;
  choices: [string, string, string, string];
  answerIndex: number;
  explanation: string;
};
type Experiment = {
  id: ExperimentId;
  number: string;
  title: string;
  description: string;
  accent: string;
  questions: ActivityQuestion[];
};

const experiments: Experiment[] = [
  {
    id: "social-engineering",
    number: "01",
    title: "Social Engineering Detective",
    description: "Discover how everyday details can reveal clues — using a completely fictional profile.",
    accent: "cyan",
    questions: [
      {
        prompt: "A stranger wants to write a convincing message to this fictional student. Which public detail would help them personalize it most?",
        context: "MIRA · Fictional profile\nPhoto: event volunteer badge visible\nBio: studying IT · loves puzzles\nRecent post: “First shift at the welcome desk today!”",
        choices: ["The public welcome-desk shift and IT club context", "The color of the profile background", "The number of likes on a landscape photo", "A generic quote with no personal details"],
        answerIndex: 0,
        explanation: "Public roles and recent activities can give an impostor believable context for a tailored message. Verify unexpected requests even when they mention familiar details."
      },
      {
        prompt: "Which combination of harmless-looking posts may reveal when someone is away from home?",
        context: "Mira posted a countdown to a weekend trip, then shared a live airport check-in.",
        choices: ["The trip countdown and live location check-in", "Two posts about favorite books", "A photo of a meal with no location", "A general comment about the weather"],
        answerIndex: 0,
        explanation: "Separate posts can be combined to infer plans and current location. Consider delaying travel posts and limiting their audience."
      },
      {
        prompt: "A message mentions Mira’s volunteer shift and asks her to confirm an account code. What is the safest response?",
        choices: ["Do not share the code; verify the request with the organization directly", "Send the code because the shift detail sounds familiar", "Post the code in the volunteer group chat", "Reply with more personal details to check who they are"],
        answerIndex: 0,
        explanation: "A familiar detail is not proof of identity. One-time codes should remain secret; verify through a known contact route."
      }
    ]
  },
  {
    id: "qr-trust",
    number: "02",
    title: "QR Code Trust Test",
    description: "Learn to inspect hidden destinations and spot suspicious links before you tap.",
    accent: "purple",
    questions: [
      {
        prompt: "A QR poster says “EMUCON schedule.” Which printed destination most closely matches that purpose?",
        context: "DESTINATION A\nhttps://emucon.example/schedule\n\nDESTINATION B\nhttps://emucon-checkin.example.net/account/verify",
        choices: ["Destination A: the event domain and schedule path match", "Destination B: it uses the word “checkin”", "Both are equally trustworthy because they use HTTPS", "Neither; the URL cannot tell you anything"],
        answerIndex: 0,
        explanation: "Check the actual registered domain and whether the path fits the task. HTTPS protects a connection but does not make a deceptive site trustworthy. These example domains are fictional."
      },
      {
        prompt: "Your camera previews a QR destination you did not expect. What should you do before opening it?",
        choices: ["Read the full destination and confirm it with the venue or an official source", "Open it immediately because the code is printed on a poster", "Enter account details to see whether it works", "Forward the QR image to strangers for a vote"],
        answerIndex: 0,
        explanation: "A QR code can conceal a link. Preview the destination, check for misspellings or unrelated domains, and confirm unexpected codes independently."
      },
      {
        prompt: "A QR link opens a page asking you to sign in to view a public event timetable. What is the safest next step?",
        choices: ["Close it and reach the timetable using the official event site or staff directions", "Reuse your email password to continue", "Approve any sign-in prompt that appears", "Assume the lock icon proves the page is official"],
        answerIndex: 0,
        explanation: "A public schedule should not unexpectedly require account credentials. Navigate through a known official route instead."
      }
    ]
  },
  {
    id: "phishing",
    number: "03",
    title: "Spot the Phishing Attempt",
    description: "Put your instincts to the test with simulated messages and websites.",
    accent: "gold",
    questions: [
      {
        prompt: "Classify this fictional message.",
        context: "From: EMUCON Help Desk <helpdesk@emucon.example.invalid>\nSubject: FINAL WARNING — prize expires in 10 minutes\n“Open this attachment and enter your account password to claim your prize.”",
        choices: ["Suspicious: urgency, an unexpected attachment, and a password request", "Safe: it mentions the event", "Safe: the sender used a help-desk display name", "Unclear, so enter a fake password to test it"],
        answerIndex: 0,
        explanation: "Urgency, unexpected attachments, and credential requests are warning signs. Do not open the attachment or enter credentials; confirm with event staff through a known channel."
      },
      {
        prompt: "A classmate sends a link asking you to vote in a contest, but says their account was “locked” and needs your code.",
        choices: ["Pause and contact the classmate another way; never share a sign-in code", "Send the code because the message came from a friend", "Click and sign in with your usual password", "Forward it to a group to see who responds"],
        answerIndex: 0,
        explanation: "A real account can be compromised. Verify surprising requests through another channel and never disclose one-time authentication codes."
      },
      {
        prompt: "An email from a familiar organization has an unexpected payment request. What should you check first?",
        choices: ["Verify using a known phone number or official portal, not the email’s link", "Reply with your card details to confirm", "Trust the logo and pay immediately", "Use the sender’s reply-to address without checking it"],
        answerIndex: 0,
        explanation: "Display names and logos can be copied. Independently contact the organization using contact details you already trust."
      }
    ]
  },
  {
    id: "wifi",
    number: "04",
    title: "Public Wi-Fi Awareness",
    description: "Can you tell which network is trustworthy? Hint: names can be misleading.",
    accent: "green",
    questions: [
      {
        prompt: "At a fictional venue, which network should you choose?",
        context: "NETWORKS SHOWN ON DEVICE\nEMUCON-GUEST — listed on the venue’s official sign\nEMUCON_FREE_FAST — appeared unexpectedly\nAirport_WiFi — unrelated network nearby",
        choices: ["EMUCON-GUEST, after confirming the name with venue staff", "EMUCON_FREE_FAST because it promises better speed", "Any network with the strongest signal", "All of them; network names prove who operates them"],
        answerIndex: 0,
        explanation: "Network names can be imitated. Confirm the exact name with staff or official signage; signal strength does not authenticate a network."
      },
      {
        prompt: "You are connected to public Wi-Fi and need to check a sensitive account. What is a safer choice?",
        choices: ["Use your mobile connection or wait for a trusted network", "Ignore browser security warnings", "Install a certificate offered by a pop-up", "Share your password with the hotspot owner"],
        answerIndex: 0,
        explanation: "For sensitive tasks, use a network you trust and keep device protections enabled. Never bypass certificate warnings or install unknown profiles."
      },
      {
        prompt: "A public hotspot opens a page asking you to install an unknown app to continue. What should you do?",
        choices: ["Cancel and ask venue staff or use another connection", "Install it because captive portals are always safe", "Disable device protections and retry", "Enter your email password into the page"],
        answerIndex: 0,
        explanation: "An unexpected app or profile install is not a normal requirement to join Wi-Fi. Do not install it; confirm with staff."
      }
    ]
  },
  {
    id: "footprint",
    number: "05",
    title: "Digital Footprint Challenge",
    description: "Explore the privacy clues hidden in a fictional social profile.",
    accent: "cyan",
    questions: [
      {
        prompt: "Which fictional profile detail reveals the most about someone’s routine?",
        context: "JAY · Fictional profile\nBio: design student\nPost: “Every weekday I leave my blue bicycle at the north library entrance at 8:15.”",
        choices: ["The repeated schedule and specific location in the post", "The general study subject in the bio", "A drawing with no people or place shown", "The choice of a blue profile theme"],
        answerIndex: 0,
        explanation: "A repeated time and precise location can expose a routine. Avoid publishing predictable schedules or identifying location details."
      },
      {
        prompt: "Which photo should Jay review most carefully before posting publicly?",
        context: "Photo A: a fictional award certificate with a full name and student number visible.\nPhoto B: a drawing on a plain background.",
        choices: ["Photo A: it exposes identifying information", "Photo B: every drawing reveals an account password", "Both are safe because images cannot contain text", "Neither; public photos never persist"],
        answerIndex: 0,
        explanation: "Documents and badges can reveal names, IDs, or other private information. Crop or obscure details before sharing, and consider whether public sharing is needed."
      },
      {
        prompt: "Jay wants to reduce what strangers can learn from the profile. Which change helps most?",
        choices: ["Remove precise routine/location details and limit the audience", "Add more check-ins so the profile looks complete", "Use the same public profile for every account", "Post a live photo of each place visited"],
        answerIndex: 0,
        explanation: "Share less precise personal information, review audience settings, and remember that viewers may copy content."
      }
    ]
  }
];

export default function CyberLab() {
  const { language, t } = useLanguage();
  const [activeId, setActiveId] = useState<ExperimentId | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const activeExperiment = experiments.find(({ id }) => id === activeId);
  const question = activeExperiment?.questions[questionIndex];
  const isComplete = activeExperiment !== undefined && questionIndex >= activeExperiment.questions.length;
  const correctAnswers = answers.filter(Boolean).length;

  const startExperiment = (id: ExperimentId) => {
    setActiveId(id);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setAnswers([]);
  };

  const answer = (index: number) => {
    if (!question || selectedIndex !== null) return;
    setSelectedIndex(index);
    setAnswers((previous) => [...previous, index === question.answerIndex]);
  };

  const next = () => {
    setQuestionIndex((index) => index + 1);
    setSelectedIndex(null);
  };

  const backToLab = () => {
    setActiveId(null);
    setQuestionIndex(0);
    setSelectedIndex(null);
    setAnswers([]);
  };

  return (
    <LocalizedContent><div className="page-content interior-page cyber-lab-page">
      {activeExperiment && (
        <button className="back-link" onClick={backToLab}><ArrowLeft size={15} /> ALL EXPERIMENTS</button>
      )}
      <div className="cyber-lab-heading">
        <div>
          <PageEyebrow>{activeExperiment ? language === "tr" ? `DENEY ${activeExperiment.number} · KURGUSAL SENARYO` : `EXPERIMENT ${activeExperiment.number} · FICTIONAL SCENARIO` : t("SAFE BY DESIGN · NO REAL PERSONAL DATA")}</PageEyebrow>
          <h1>{activeExperiment ? <>{t(activeExperiment.title).split(" ").slice(0, -1).join(" ")} <span>{t(activeExperiment.title).split(" ").at(-1)}.</span></> : <>THE CYBER <span>LAB.</span></>}</h1>
          <p>{activeExperiment ? activeExperiment.description : "Practice spotting privacy and security risks through short fictional scenarios. No real credentials or personal details are requested."}</p>
        </div>
        <div className="cyber-lab-emblem" aria-hidden="true"><Shield size={34} /><span>LEARN · CHECK · PROTECT</span></div>
      </div>

      {!activeExperiment && (
        <>
          <div className="cyber-experiment-grid">
            {experiments.map((experiment) => (
              <article className={`cyber-experiment-card ${experiment.accent}`} key={experiment.id}>
                <div className="cyber-experiment-top"><span>{experiment.number} / 05</span><ShieldCheck size={19} /></div>
                <span className="cyber-experiment-tag">SAFE SIMULATION · 3 SCENARIOS</span>
                <h2>{experiment.title}</h2>
                <p>{experiment.description}</p>
                <button className="cyber-start-button" onClick={() => startExperiment(experiment.id)}>START EXPERIMENT <ArrowRight size={15} /></button>
              </article>
            ))}
          </div>
          <div className="safety-note"><Shield size={17} /><p><strong>YOUR PRIVACY COMES FIRST.</strong> Activities use fictional people, messages, and locations. We never ask you to enter a password, account code, student ID, or personal secret.</p></div>
        </>
      )}

      {activeExperiment && question && (
        <section className={`cyber-activity ${activeExperiment.accent}`}>
          <div className="cyber-activity-progress"><span>SCENARIO {String(questionIndex + 1).padStart(2, "0")} / {String(activeExperiment.questions.length).padStart(2, "0")}</span><div><i style={{ width: `${(questionIndex / activeExperiment.questions.length) * 100}%` }} /></div><span>{correctAnswers} CORRECT</span></div>
          <article className="cyber-question-card">
            <span className="cyber-question-label"><LockKeyhole size={13} /> FICTIONAL TRAINING SCENARIO</span>
            {question.context && <pre className="cyber-scenario-context">{question.context}</pre>}
            <h2>{question.prompt}</h2>
            <div className="cyber-answer-list">
              {question.choices.map((choice, index) => {
                const correct = selectedIndex !== null && index === question.answerIndex;
                const incorrect = selectedIndex === index && index !== question.answerIndex;
                return <button className={`cyber-answer ${correct ? "cyber-answer-correct" : ""} ${incorrect ? "cyber-answer-incorrect" : ""}`} key={choice} onClick={() => answer(index)} disabled={selectedIndex !== null}><span>{String.fromCharCode(65 + index)}</span><b>{choice}</b>{correct && <Check size={16} />}{incorrect && <X size={16} />}</button>;
              })}
            </div>
            {selectedIndex !== null && (
              <div className={`cyber-explanation ${selectedIndex === question.answerIndex ? "explanation-correct" : ""}`} aria-live="polite">
                <strong>{selectedIndex === question.answerIndex ? "GOOD CATCH." : "HERE’S WHAT TO NOTICE."}</strong>
                <p>{question.explanation}</p>
                <button className="primary-button" onClick={next}>{questionIndex + 1 < activeExperiment.questions.length ? "NEXT SCENARIO" : "SEE RESULTS"} <ArrowRight size={15} /></button>
              </div>
            )}
          </article>
          <p className="cyber-privacy-reminder">This is a fictional exercise. Do not share real credentials or private information.</p>
        </section>
      )}

      {activeExperiment && isComplete && (
        <section className="cyber-completion">
          <div className="cyber-completion-icon"><ShieldCheck size={26} /></div>
          <span className="eyebrow"><span className="eyebrow-line" /> EXPERIMENT COMPLETE · {activeExperiment.number} / 05</span>
          <h2>GOOD <span>INSTINCTS.</span></h2>
           <p>{language === "tr" ? `${activeExperiment.questions.length} güvenlik ipucundan ${correctAnswers} tanesini buldun. Temel alışkanlık: dur, ayrıntıları incele ve güvenilir bir yoldan doğrula.` : `You identified ${correctAnswers} of ${activeExperiment.questions.length} safety cues. The key habit: pause, inspect the details, and verify through a trusted route.`}</p>
          <div className="complete-actions">
            <button className="primary-button" onClick={() => startExperiment(activeExperiment.id)}><RotateCcw size={15} /> TRY AGAIN</button>
            <button className="outline-button" onClick={backToLab}>ALL EXPERIMENTS <ArrowLeft size={14} /></button>
          </div>
        </section>
      )}

      <p className="cyber-lab-reference"><ExternalLink size={12} /> Awareness activities are educational simulations, not incident-response advice.</p>
    </div></LocalizedContent>
  );
}

function PageEyebrow({ children }: { children: string }) {
  return <span className="eyebrow"><span className="eyebrow-line" /> {children}</span>;
}
