import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Award,
  ChevronRight,
  CircleHelp,
  Command,
  Gamepad2,
  LockKeyhole,
  Menu,
  Orbit,
  Scale,
  Shield,
  Sparkles,
  Waypoints,
  Target,
  Timer,
  Trophy,
  X
} from "lucide-react";
import ZeroPointGame from "../games/zero-point/ZeroPointGame";
import TargetRushGame from "../games/target-rush/TargetRushGame";
import PerfectAlignGame from "../games/perfect-align/PerfectAlignGame";
import BrainFirewallGame from "../games/brain-firewall/BrainFirewallGame";
import SnakeGame from "../games/snake/SnakeGame";
import MythFactGame from "../games/myth-fact/MythFactGame";
import { useLiveData, type Overview, type Rankings } from "./arena-data";
import { setSoundMuted, soundIsMuted } from "./sound";
import MythFactAdmin from "./MythFactAdmin";
import { api as detectiveApi, clearDetectiveStorage } from "../games/digital-detective/api";
const DigitalDetectiveGame = lazy(() => import("../games/digital-detective/DigitalDetectiveGame"));
const DetectiveAdmin = lazy(() => import("../games/digital-detective/DetectiveAdmin"));
const DetectiveLeaderboard = lazy(() => import("../games/digital-detective/DetectiveLeaderboard"));
import CyberLab from "./CyberLab";

type Page = "home" | "games" | "zero-point" | "target-rush" | "perfect-align" | "brain-firewall" | "snake" | "myth-fact" | "digital-detective" | "leaderboard" | "cyber-lab" | "admin";
type AdminUser = { id: number; username: string; role: string };

const games = [
  {
    number: "01",
    id: "zero-point",
    title: "Zero Point",
    category: "PRECISION",
    description: "A new random target every round. Stop the clock at the right moment. Every millisecond matters.",
    difficulty: "FOCUS REQUIRED",
    duration: "4–6 MIN",
    icon: Timer,
    color: "cyan",
    record: "—"
  },
  {
    number: "02",
    id: "target-rush",
    title: "Target Rush",
    category: "REFLEX",
    description: "Lock on, take aim, and hit as many moving targets as you can.",
    difficulty: "QUICK REFLEXES",
    duration: "1 MIN",
    icon: Target,
    color: "purple",
    record: "—"
  },
  {
    number: "03",
    id: "perfect-align",
    title: "Perfect Align",
    category: "ACCURACY",
    description: "One moving marker. One tiny window. Can you make the connection?",
    difficulty: "EXPERT",
    duration: "2–4 MIN",
    icon: Orbit,
    color: "gold",
    record: "—"
  },
  {
    number: "04",
    id: "brain-firewall",
    title: "Brain Firewall",
    category: "KNOWLEDGE",
    description: "Pick Random Mix, Frontend, Backend, Security, or more. Test real-world skills and general knowledge.",
    difficulty: "ALL LEVELS",
    duration: "3–5 MIN",
    icon: Shield,
    color: "green",
    record: "—"
  },
  {
    number: "05",
    id: "snake",
    title: "Neon Snake",
    category: "SURVIVAL",
    description: "Dodge sentinels and pulse gates. Chase + points, avoid − penalties, and survive the grid.",
    difficulty: "HARDCORE · KEYBOARD",
    duration: "UP TO 3 MIN",
    icon: Waypoints,
    color: "mint",
    record: "—"
  },
  {
    number: "06",
    id: "myth-fact",
    title: "Myth or Fact",
    category: "DIGITAL TRUTH",
    description: "Separate digital truth from fiction. Six modes, confidence stakes, streaks, and a final challenge.",
    difficulty: "ALL LEVELS",
    duration: "3–6 MIN",
    icon: Scale,
    color: "cyan",
    record: "—"
  }
];

games.push({ number: "07", id: "digital-detective", title: "Digital Detective", category: "FORENSICS", description: "Follow the evidence. Reconstruct a cyber incident solo or as a team around one laptop.", difficulty: "FOUR LEVELS · SOLO / TEAM", duration: "8–12 MIN", icon: Shield, color: "cyan", record: "—" });

const navItems: { label: string; page: Page; icon: typeof Gamepad2 }[] = [
  { label: "Arena", page: "home", icon: Command },
  { label: "Challenges", page: "games", icon: Gamepad2 },
  { label: "Hall of Fame", page: "leaderboard", icon: Trophy },
  { label: "Cyber Lab", page: "cyber-lab", icon: Shield }
];

function App() {
  const [page, setPage] = useState<Page>(() => window.location.pathname === "/staff" ? "admin" : window.location.pathname === "/digital-detective" ? "digital-detective" : "home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [muted, setMuted] = useState(() => soundIsMuted());
  const [health, setHealth] = useState<"checking" | "online" | "offline">("checking");
  const [detectiveHasSession, setDetectiveHasSession] = useState(false);
  const [pendingDetectivePage, setPendingDetectivePage] = useState<Page | null>(null);
  const [detectiveResetBusy, setDetectiveResetBusy] = useState(false);
  const [detectiveResetError, setDetectiveResetError] = useState("");

  useEffect(() => {
    let active = true;
    const checkHealth = () => fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(8_000) })
      .then((response) => {
        if (!response.ok) throw new Error("API is not available");
        if (active) setHealth("online");
      })
      .catch(() => { if (active) setHealth("offline"); });
    void checkHealth();
    const healthTimer = window.setInterval(checkHealth, 15_000);
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((result: { authenticated: boolean; user?: AdminUser }) => {
        if (result.authenticated && result.user) {
          setAdmin(result.user);
          if (window.location.pathname === "/staff") setPage("admin");
        } else if (window.location.pathname === "/staff") {
          setPage("admin");
          setLoginOpen(true);
        }
      })
      .catch(() => {
        if (window.location.pathname === "/staff") {
          setPage("admin");
          setLoginOpen(true);
        }
      });
    return () => { active = false; clearInterval(healthTimer); };
  }, []);

  const navigate = (next: Page) => {
    if (page === "digital-detective" && next !== "digital-detective" && detectiveHasSession) {
      setPendingDetectivePage(next); setDetectiveResetError(""); return;
    }
    setPage(next);
    const nextPath = next === "admin" ? "/staff" : next === "digital-detective" ? "/digital-detective" : "/";
    if (window.location.pathname !== nextPath) window.history.pushState(null, "", nextPath);
    setMenuOpen(false);
    setLoginOpen(false);
  };
  const finishDetectiveNavigation = async () => {
    if (!pendingDetectivePage) return;
    setDetectiveResetBusy(true); setDetectiveResetError("");
    try {
      await detectiveApi("/reset", "POST"); clearDetectiveStorage(); setAdmin(null); setDetectiveHasSession(false);
      const next = pendingDetectivePage;
      setPendingDetectivePage(null); setPage(next);
      window.history.pushState(null, "", next === "admin" ? "/staff" : "/");
      setMenuOpen(false); setLoginOpen(next === "admin");
    } catch (e) { setDetectiveResetError(`${(e as Error).message} Your investigation is still open. Retry before handing over this device.`); }
    finally { setDetectiveResetBusy(false); }
  };

  return (
    <div className="app-shell">
      <div className="star-field" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label="EMUCON Arena home">
          <span className="brand-logos" aria-label="EMU Information Technologies Club and Eastern Mediterranean University">
            <img src="/brand/it-club-logo.svg" alt="EMU Information Technologies Club" />
            <img src="/brand/emu-logo.png" alt="Eastern Mediterranean University" />
          </span>
          <span className="brand-copy"><strong>EMUCON<span>26</span></strong><small>EMU IT CLUB · CHALLENGE ARENA</small></span>
        </button>

        <nav className={`desktop-nav ${menuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
          {navItems.map(({ label, page: target, icon: Icon }) => (
            <button key={target} className={`nav-link ${page === target ? "active" : ""}`} onClick={() => navigate(target)}>
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>

        <div className="top-actions">
          <span className="live-status"><i className={health === "online" ? "status-dot" : "status-dot muted-dot"} />{health === "online" ? "SYSTEM ONLINE" : health === "offline" ? "OFFLINE MODE" : "CONNECTING"}</span>
          <button className="icon-button sound-button" onClick={() => { const next = !muted; setMuted(next); setSoundMuted(next); }} aria-label={muted ? "Enable sound" : "Mute sound"} title={muted ? "Sound off" : "Sound on"}>
            <AudioLines size={17} className={muted ? "sound-muted" : ""} />
          </button>
          {admin && <button className="admin-button" onClick={() => navigate("admin")}><LockKeyhole size={14} />Admin</button>}
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Close menu" : "Open menu"}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main>
        <Suspense fallback={<div className="page-content interior-page" role="status">Opening investigation tools…</div>}>
        {page === "home" && <HomePage onNavigate={navigate} />}
        {page === "games" && <GamesPage onNavigate={navigate} />}
        {page === "zero-point" && <ZeroPointGame onBack={() => navigate("games")} />}
        {page === "target-rush" && <TargetRushGame onBack={() => navigate("games")} />}
        {page === "perfect-align" && <PerfectAlignGame onBack={() => navigate("games")} />}
        {page === "brain-firewall" && <BrainFirewallGame onBack={() => navigate("games")} />}
        {page === "snake" && <SnakeGame onBack={() => navigate("games")} />}
        {page === "myth-fact" && <MythFactGame onBack={() => navigate("games")} />}
        {page === "digital-detective" && <DigitalDetectiveGame onBack={() => navigate("games")} onSessionChange={setDetectiveHasSession} />}
        {page === "leaderboard" && <LeaderboardPage />}
        {page === "cyber-lab" && <CyberLab />}
        {page === "admin" && <AdminPage admin={admin} onLogout={() => {
          fetch("/api/admin/logout", { method: "POST" }).then(() => { setAdmin(null); navigate("home"); });
        }} />}
        </Suspense>
      </main>

      <footer className="site-footer">
        <span>MISSION IT <span className="footer-dot">·</span> HACK YOUR LIMITS</span>
        <span>EMUCON 2026 <span className="footer-dot">·</span> EASTERN MEDITERRANEAN UNIVERSITY</span>
        <button onClick={() => document.documentElement.requestFullscreen?.()} className="presentation-button"><Sparkles size={13} /> PRESENTATION MODE</button>
      </footer>

      {loginOpen && <AdminLogin onClose={() => { setLoginOpen(false); if (!admin && window.location.pathname === "/staff") navigate("home"); }} onSuccess={(user) => { setAdmin(user); navigate("admin"); }} />}
      {pendingDetectivePage && <div className="modal-backdrop"><section className="login-modal dd-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="detective-exit-title" onKeyDown={e => { if (e.key === "Escape" && !detectiveResetBusy) setPendingDetectivePage(null); }}><span className="eyebrow">INVESTIGATION SESSION</span><h2 id="detective-exit-title">Finish & leave?</h2><p>Clear this device's investigation notes, nickname and signed-in session before leaving. Official scores and submitted reports remain saved.</p>{detectiveResetError && <p className="login-error" role="alert">{detectiveResetError}</p>}<div className="dd-tools"><button autoFocus className="outline-button" disabled={detectiveResetBusy} onClick={() => setPendingDetectivePage(null)}>CONTINUE INVESTIGATING</button><button className="primary-button" disabled={detectiveResetBusy} onClick={() => void finishDetectiveNavigation()}>{detectiveResetBusy ? "FINISHING…" : "FINISH & LEAVE"}</button></div></section></div>}
      <span className="sound-state" aria-live="polite">{muted ? "Sound muted" : "Sound enabled"}</span>
    </div>
  );
}

function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { data: records, error } = useLiveData<Record<string, Rankings>>("/api/leaderboards");
  const leaders = games.flatMap((game) => {
    const first = records?.[game.id]?.entries[0];
    return first ? [{ ...first, game: game.title }] : [];
  });
  return (
    <div className="page-content home-page">
      <div className="event-strip"><span className="event-dot" /> EASTERN MEDITERRANEAN UNIVERSITY <span className="strip-divider">/</span> SATURDAY, 24 OCTOBER 2026 <span className="strip-divider">/</span> YASIN DÜŞÜNER STADIUM</div>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT MISSION STARTS HERE</div>
          <h1>PLAY THE<br /><span>UNKNOWN.</span></h1>
          <p className="hero-description">{games.length} challenges. One arena. Test your reflexes, sharpen your instincts, and find out if you've got what it takes.</p>
          <div className="hero-buttons">
            <button className="primary-button" onClick={() => onNavigate("games")}>ENTER THE ARENA <ArrowUpRight size={17} /></button>
            <button className="text-button" onClick={() => onNavigate("leaderboard")}><Trophy size={15} /> VIEW HALL OF FAME</button>
          </div>
          <div className="event-meta">
            <div><span className="meta-label">IT STAND</span><strong>15:00 — 19:00</strong></div>
            <div className="meta-separator" />
            <div><span className="meta-label">THEME</span><strong>MISSION IT</strong></div>
            <div className="meta-separator" />
            <div><span className="meta-label">ENTRY</span><strong>OPEN TO ALL</strong></div>
          </div>
        </div>
        <div className="hero-art" aria-label="Abstract neon orbital illustration">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
          <div className="planet-core"><span className="planet-glow" /><Orbit size={54} strokeWidth={0.8} /></div>
          <div className="orbit-node node-one" /><div className="orbit-node node-two" />
          <div className="art-label label-top"><span>EMISSION</span><b>ACTIVE</b></div>
          <div className="art-label label-bottom"><span>SECTOR</span><b>EMU · 26</b></div>
          <span className="art-cross cross-one">+</span><span className="art-cross cross-two">+</span>
        </div>
        <div className="hero-index"><span>01</span><i /> {String(games.length).padStart(2, "0")}</div>
      </section>

      <section className="challenge-section">
        <div className="section-heading">
          <div><span className="eyebrow"><span className="eyebrow-line" /> CHOOSE YOUR CHALLENGE</span><h2>{games.length} ways to <span>make your mark.</span></h2></div>
          <button className="section-link" onClick={() => onNavigate("games")}>ALL CHALLENGES <ArrowUpRight size={15} /></button>
        </div>
        <div className="game-grid">
          {games.map(({ id, number, title, category, description, difficulty, duration, icon: Icon, color }) => (
            <article className={`game-card ${color}`} key={title} role="button" tabIndex={0} aria-label={`Play ${title}`}
              onClick={() => onNavigate(id as Page)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate(id as Page); } }}>
              <div className="card-top"><span className="card-number">{number} <span>/ {String(games.length).padStart(2, "0")}</span></span><Icon className="game-icon" size={21} strokeWidth={1.6} /></div>
              <span className="game-category">{category}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="card-data"><span>{difficulty}</span><span>{duration}</span></div>
              <div className="card-bottom"><span>{id === "digital-detective" ? "RECORDS" : "TOP SCORE"} <b>{id === "digital-detective" ? "CASE BOARDS" : records?.[id]?.entries[0]?.score.toLocaleString() ?? (error ? "OFFLINE" : records ? "—" : "…")}</b></span><span className="card-play">PLAY <ChevronRight size={15} /></span></div>
            </article>
          ))}
        </div>
      </section>
      <section className="lower-grid">
        <button className="cyber-lab-card" onClick={() => onNavigate("cyber-lab")}>
          <span className="cyber-icon"><Shield size={20} /></span><span className="eyebrow">LEARN BY DOING</span>
          <h3>Curious about<br />your digital footprint?</h3><span className="cyber-link">STEP INTO THE CYBER LAB <ArrowUpRight size={15} /></span>
        </button>
        <div className="leaderboard-preview">
          <div className="preview-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> THE FRONT RUNNERS</span><h3>Hall of Fame</h3></div><Trophy size={20} /></div>
          {leaders.length ? <div className="preview-leaders">{leaders.map((leader) => <div key={leader.game}><span><strong>{leader.challenger}</strong><small>{leader.game}</small></span><b>{leader.score.toLocaleString()}</b></div>)}</div> : <div className="empty-score"><span className="score-orbit"><Orbit size={22} /></span><div><strong>{error ? "RANKINGS UNAVAILABLE" : !records ? "LOADING RANKINGS…" : "YOUR NAME COULD BE HERE"}</strong><small>{error ? "Reconnecting to the arena…" : "The arena awaits its first challenger."}</small></div></div>}
          <button className="preview-link" onClick={() => onNavigate("leaderboard")}>VIEW LEADERBOARD <ArrowUpRight size={14} /></button>
        </div>
      </section>
      <div className="mission-banner"><Sparkles size={14} /><span>MISSION IT</span><i /> HACK YOUR LIMITS <i /><span>24.10.26</span></div>
    </div>
  );
}

function GamesPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return <div className="page-content interior-page"><PageHeading label="SELECT YOUR MISSION" title={<>THE <span>ARENA.</span></>} description={`${games.length} playable challenges. Choose your mission, read its quick guide, and take on the arena.`} />
    <div className="game-grid expanded-games">{games.map(({ id, number, title, category, description, difficulty, duration, icon: Icon, color }) => <article className={`game-card ${color}`} key={title} role="button" tabIndex={0} aria-label={`Play ${title}`}
      onClick={() => onNavigate(id as Page)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate(id as Page); } }}>
      <div className="card-top"><span className="card-number">{number} <span>/ {String(games.length).padStart(2, "0")}</span></span><Icon className="game-icon" size={21} /></div><span className="game-category">{category}</span><h3>{title}</h3><p>{description}</p>
      <div className="card-data"><span>{difficulty}</span><span>{duration}</span></div><div className="card-bottom play-row"><span>{id === "snake" ? "ARROW KEYS · + / − PICKUPS" : `${category} CHALLENGE`}</span><span className="card-play">PLAY <ChevronRight size={15} /></span></div>
    </article>)}</div>
  </div>;
}

function LeaderboardPage() {
  const [selected, setSelected] = useState(games[0].id);
  const { data, error, live } = useLiveData<Rankings>(`/api/leaderboard/${selected}`);
  return <div className="page-content interior-page"><PageHeading label="THE BEST OF THE BEST" title={<>HALL OF <span>FAME.</span></>} description="Every legend starts with a first attempt. Myth or Fact boards are split by mode and rule version so only comparable runs compete." />
    <div className="leaderboard-panel">
      <div className="leaderboard-tabs" role="tablist" aria-label="Game rankings">{games.map((game) => <button role="tab" aria-selected={selected === game.id} aria-controls="game-rankings" id={`tab-${game.id}`} className={selected === game.id ? "selected" : ""} key={game.id} onClick={() => setSelected(game.id)}>{game.title.toUpperCase()}</button>)}</div>
      {selected === "myth-fact" ? <MythFactLeaderboard /> : selected === "digital-detective" ? <div id="game-rankings" role="tabpanel" aria-labelledby="tab-digital-detective"><DetectiveLeaderboard /></div> : <div id="game-rankings" role="tabpanel" aria-labelledby={`tab-${selected}`} aria-busy={!data && !error}>
        <div className="leaderboard-head"><span>RANK</span><span>CHALLENGER</span><span>SCORE</span><span>DATE</span></div>
        {error && <div className="ranking-error" role="status">Connection interrupted. {data ? "Showing the last received rankings." : "Reconnecting to the arena…"}</div>}
        {data?.entries.length ? <div className="leaderboard-rows">{data.entries.map((entry) => <div className={`leaderboard-row ${entry.rank <= 3 ? "podium-row" : ""}`} key={entry.id}><span className="rank-number">{entry.rank <= 3 && <Trophy size={14} />} {String(entry.rank).padStart(2, "0")}</span><strong>{entry.challenger}</strong><b>{entry.score.toLocaleString()}</b><time dateTime={new Date(entry.completedAt).toISOString()} title={new Date(entry.completedAt).toLocaleString()}>{new Date(entry.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></div>)}</div> : <div className="leaderboard-empty"><Trophy size={28} /><strong>{!data ? error ? "RANKINGS UNAVAILABLE" : "LOADING RANKINGS…" : "THE PODIUM IS EMPTY"}</strong><p>{!data ? "Connecting to live event scores." : "Be the first to put your name on the board."}</p><span>THE NEXT RECORD COULD BE YOURS</span></div>}
      </div>}
      <div className="leaderboard-foot"><span>LIVE EVENT RANKINGS · BEST RUN PER CHALLENGER</span><span>{live ? "UPDATED IN REAL TIME" : error ? "RECONNECTING" : "AUTO REFRESH · 15 SEC"} <i className={`status-dot ${live ? "" : "muted-dot"}`} /></span></div>
    </div>
  </div>;
}

type MythBoard = { key: string; mode: string; participation: string; challengeId: string | null; version: number | null; configId: number };
type MythBoardEntry = { id: string; rank: number; challenger: string; score: number; accuracy: number; correct: number; incorrect: number; longestStreak: number; averageMs: number; completedAt: number; mode: string; participation: string; boardKey: string; challengeVersion: number | null; configId: number };
type MythBoards = { boards: MythBoard[]; entries: MythBoardEntry[]; visible: boolean; updatedAt: string };

function MythFactLeaderboard() {
  const { data, error, live } = useLiveData<MythBoards>("/api/myth/leaderboard");
  const [board, setBoard] = useState("");
  const boards = data?.boards ?? [];
  const current = boards.some((item) => item.key === board) ? board : boards[0]?.key ?? "";
  const rows = (data?.entries ?? []).filter((entry) => entry.boardKey === current);
  return <div id="game-rankings" role="tabpanel" aria-labelledby="tab-myth-fact" aria-busy={!data && !error}>
    {error && <div className="ranking-error" role="status">Connection interrupted. {data ? "Showing the last received rankings." : "Reconnecting to the arena…"}</div>}
    {!data ? <div className="leaderboard-empty"><Trophy size={28} /><strong>{error ? "RANKINGS UNAVAILABLE" : "LOADING RANKINGS…"}</strong><p>Connecting to the Digital Truth boards.</p><span>EVERY MODE HAS ITS OWN ARENA</span></div>
      : !data.visible ? <div className="leaderboard-empty"><Trophy size={28} /><strong>LEADERBOARDS ARE HIDDEN</strong><p>Staff have temporarily hidden public rankings for this game.</p><span>ASK AN EVENT VOLUNTEER FOR RESULTS</span></div>
      : !boards.length ? <div className="leaderboard-empty"><Trophy size={28} /><strong>NO COMPLETED RUNS YET</strong><p>Be the first to finish a Myth or Fact run.</p><span>THE NEXT RECORD COULD BE YOURS</span></div>
      : <>
        <div className="myth-board-tabs" role="group" aria-label="Myth or Fact leaderboards">{boards.map((item) => <button key={item.key} className={item.key === current ? "myth-chip myth-chip-on" : "myth-chip"} aria-pressed={item.key === current} onClick={() => setBoard(item.key)}>{item.mode.toUpperCase()} · {item.participation.toUpperCase()}{item.version ? ` · EVENT v${item.version}` : ` · RULES #${item.configId}`}</button>)}</div>
        <div className="myth-admin-table-wrap"><table className="myth-admin-table myth-board-table">
          <thead><tr><th>RANK</th><th>CHALLENGER</th><th>SCORE</th><th>ACCURACY</th><th>STREAK</th><th>DATE</th></tr></thead>
          <tbody>{rows.map((entry) => <tr key={entry.id} className={entry.rank <= 3 ? "podium-row" : ""}><td className="rank-number">{entry.rank <= 3 && <Trophy size={13} />} {String(entry.rank).padStart(2, "0")}</td><td><strong>{entry.challenger}</strong></td><td>{entry.score.toLocaleString()}</td><td>{entry.accuracy}%</td><td>{entry.longestStreak}</td><td><time dateTime={new Date(entry.completedAt).toISOString()} title={new Date(entry.completedAt).toLocaleString()}>{new Date(entry.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></td></tr>)}</tbody>
        </table></div>
        <div className="leaderboard-foot"><span>{rows.length} SHOWN · BEST RUN PER PARTICIPANT OR TEAM FOR THESE RULES</span><span>{live ? "UPDATED IN REAL TIME" : "AUTO REFRESH · 15 SEC"} <i className={`status-dot ${live ? "" : "muted-dot"}`} /></span></div>
      </>}
  </div>;
}

function AdminPage({ admin, onLogout }: { admin: AdminUser | null; onLogout: () => void }) {
  if (!admin) return <div className="page-content interior-page"><PageHeading label="RESTRICTED AREA" title={<>STAFF <span>ACCESS.</span></>} description="This area is restricted to authorized event staff." /></div>;
  return <><ConnectedAdminPage admin={admin} onLogout={onLogout} /><div className="page-content"><DetectiveAdmin role={admin.role} /></div></>;
}

function ConnectedAdminPage({ admin, onLogout }: { admin: AdminUser; onLogout: () => void }) {
  const { data, error, live } = useLiveData<Overview>("/api/admin/overview");
  const count = (value: number | undefined) => value === undefined ? error ? "UNAVAILABLE" : "…" : value.toLocaleString();
  return <div className="page-content interior-page"><div className="admin-welcome"><PageHeading label={`SIGNED IN AS ${admin.username.toUpperCase()} · ${admin.role.replace("_", " ").toUpperCase()}`} title={<>MISSION <span>CONTROL.</span></>} description="Live event activity, persistent scores, database connectivity, and Myth or Fact content." /><button className="outline-button" onClick={onLogout}>SIGN OUT</button></div><div className="admin-stats"><StatCard label="PARTICIPANTS" value={count(data?.participants)} icon={Award} /><StatCard label="GAMES PLAYED" value={count(data?.gamesPlayed)} icon={Gamepad2} /><StatCard label="ACTIVE SESSIONS" value={count(data?.activeSessions)} icon={Sparkles} /><StatCard label="DATABASE" value={error ? "DISCONNECTED" : data?.database === "connected" ? "CONNECTED" : "CHECKING…"} icon={Shield} /></div><div className="admin-notice" role="status"><CircleHelp size={18} /><div><strong>{error ? "CONNECTION INTERRUPTED · RETRYING" : live ? "LIVE EVENT MONITORING" : "AUTOMATIC REFRESH ACTIVE"}</strong><p>{error ? "The database could not be reached. Any displayed counts are from the last successful update." : "Participants are unique browser profiles that started a game. Games played counts completed runs. Active sessions are unfinished runs seen within the last 90 seconds."}{data && <> Last successful update: {new Date(data.updatedAt).toLocaleTimeString()}.</>}</p></div></div><MythFactAdmin role={admin.role} /></div>;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Award }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><Icon size={18} /></div>;
}

function PageHeading({ label, title, description }: { label: string; title: React.ReactNode; description: string }) {
  return <div className="page-heading"><span className="eyebrow"><span className="eyebrow-line" /> {label}</span><h1>{title}</h1><p>{description}</p></div>;
}

function AdminLogin({ onClose, onSuccess }: { onClose: () => void; onSuccess: (user: AdminUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      onSuccess(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="modal-close" onClick={onClose} aria-label="Close login"><X size={18} /></button><div className="login-icon"><LockKeyhole size={20} /></div><span className="eyebrow">RESTRICTED AREA</span><h2 id="login-title">STAFF <span>ACCESS.</span></h2><p>Enter your administrator credentials to continue.</p><form onSubmit={submit}><label htmlFor="admin-username">USERNAME</label><input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={64} /><label htmlFor="admin-password">PASSWORD</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} />{error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={submitting}>{submitting ? "AUTHENTICATING…" : "SIGN IN"} <ArrowUpRight size={16} /></button></form><small>ADMIN ACCESS IS AUDITED · CONTACT YOUR EVENT ORGANIZER IF YOU NEED AN ACCOUNT</small></section></div>;
}

export default App;
