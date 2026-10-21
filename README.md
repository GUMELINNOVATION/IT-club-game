# EMUCON IT Challenge Arena

The EMUCON IT Challenge Arena is an event-focused arcade and cybersecurity-awareness platform for EMUCON 2026, reflecting the EMU Information Technologies Club and Eastern Mediterranean University branding. Zero Point, Target Rush, Perfect Align, Brain Firewall, Neon Snake, and Myth or Fact are playable, with persistent SQLite scores, live game rankings, and staff activity metrics.

## Architecture

- **Web:** React, TypeScript, Vite, Tailwind CSS, and Lucide icons.
- **API:** Node.js, Express, Zod input validation, Helmet security headers, and rate limiting.
- **Persistence:** SQLite via `better-sqlite3`; administrator accounts, audit events, server-side sessions, anonymous participant profiles, game sessions, and completed scores persist locally.
- **Authentication:** Passwords are hashed with Node.js `scrypt`; session cookies are HTTP-only and SameSite strict. There are no default administrator credentials.

The development web server proxies `/api` requests to the API on port 3001. The default database is stored at `data/emucon.sqlite`.

## Requirements

- Node.js 22 or later
- npm

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a local environment file from `.env.example` and set a private session secret of at least 32 characters. Keep `.env` out of version control.

   ```powershell
   Copy-Item .env.example .env
   ```

3. Create the first administrator. Supply a unique username and a password of at least 12 characters through environment variables; never put real credentials in source control.

   ```powershell
   $env:ADMIN_USERNAME = "event-admin"
   $securePassword = Read-Host "Choose an administrator password" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
   npm run admin:create
   Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
   ```

4. Start the web app and API:

   ```powershell
   npm run dev
   ```

   Open the Vite address printed in the terminal. Authorized staff can go directly to `/staff` to sign in; this route is not linked in the public participant interface.

For a local API-only health check, the API requires `SESSION_SECRET` and runs on port 3001 by default. `DATABASE_PATH` can point to a different SQLite file.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite web app and Express API |
| `npm run build` | Type-check and build the web app and API |
| `npm test` | Run automated tests |
| `npm run admin:create` | Create a super-admin account from environment variables |

## Current phase and limitations

The arena includes the responsive shell, navigation, event information, live public leaderboards, six playable challenges, API health checks, SQLite persistence, admin login/logout, staff sessions, and audit records. Zero Point uses monotonic high-resolution timing, eight difficulty levels, the documented deterministic scoring formula, round results, and automated engine tests. Target Rush has an animated canvas arena, 15–120 second rounds, progressively smaller/faster/shorter-lived targets, five learnable target types, deterministic scoring, metrics, touch/pointer and keyboard-accessible controls, and automated game-engine tests. Perfect Align has five precision levels, variable marker speed and moving target zones at advanced levels, optional dual alignment, explicit hit boundaries, attempts, scoring, and a run report. Brain Firewall has nine selectable topics plus Random Mix, 210 questions with explanations and reference metadata, timed 10- or 20-question runs, keyboard controls, streak scoring, and answer review. Frontend and Backend questions cover practical development scenarios; General Knowledge includes everyday reasoning and science. Neon Snake is a keyboard survival challenge with arrow-key steering, a two-turn input buffer, eight speed levels, combo scoring, corruption penalties, timed gold pickups, shields, moving sentinels, lethal pulse gates, a three-minute survival limit, and pause/resume support. Myth or Fact is a server-authoritative myth-busting quiz with 200 reviewed statements, six modes, difficulty and category selection, confidence staking, streaks, hints, single-device teams, fixed-set events with one-time entry codes, per-board leaderboards, and staff tools for statements, rules versions, events, and results.

All six games save completed runs to SQLite and the Hall of Fame. Brain Firewall supports at least 20 unique questions per topic, shuffles question order and answer positions, and balances Random Mix across all nine topics without repeating questions within a run. Admin question management for Brain Firewall and head-to-head play remain future work; Myth or Fact has its own staff statement editor. Participant accounts and kiosk workflows remain future work. Myth or Fact answers and scores are validated by the API, never trusted from the browser. The other five games calculate scores in the browser and accept them for server-issued game sessions after integer/range validation; those scores are not server-replayed or tamper-proof competition scores.

### Live rankings and staff metrics

- Starting a challenge creates a game session for an anonymous browser profile. An optional call sign is displayed publicly with completed scores; use a nickname. Clearing browser storage creates a new participant identity.
- Completed runs save automatically, with saving, saved, and error states plus a retry control. Identical retries are idempotent; a completed score cannot be overwritten.
- Each game tab ranks the best completed run per browser participant, descending by score with earlier completion breaking ties. Up to 50 challengers appear per game. Home-page records and front runners use the same database.
- Server-sent events update rankings and staff metrics when runs start, complete, or are abandoned. Automatic stream reconnection and a 15-second polling fallback recover interrupted connections.
- **Participants** counts unique browser profiles that started a game. **Games played** counts completed runs. **Active sessions** counts unfinished runs with a heartbeat in the last 90 seconds. Gameplay sends heartbeats every 25 seconds; abandoned connections age out automatically.
- Staff metrics require administrator authentication. **Database connected** reflects a successful database-backed overview request. Failed requests show disconnected status and identify stale counts. Data persists across server restarts in `data/emucon.sqlite` by default.
- The five browser-scored games compare raw scores across run lengths and game options. Myth or Fact separates boards by mode, participation, and rules version, and keeps one best run per participant or team per board.

Zero Point generates random millisecond-precision targets for all eight levels on every run: Rookie (3.5–6.5s), Focus (6–9s), Blind Timing (8–12s), Chaos (10–14s), Time Master (8–14s), Overdrive (13–17s), Singularity (16–20s), and Event Horizon (18–25s). From Focus onward, the timer appears in independently randomized glimpses, including a final calibration glimpse near the target. The browser uses `crypto.getRandomValues()` for targets and visibility windows. Targets stay fixed during a round. For each round, `errorMs = abs(actualElapsedMs - targetMs)` and `roundScore = round(10000 / (1 + errorMs / 25))`. The elapsed time is measured from `performance.now()` at the start signal to `performance.now()` in the stop handler; animation or display refresh frequency is not used as the scoring clock.

Target Rush defaults to 60 seconds and also offers 15, 30, 45, 90, and 120 seconds. Difficulty advances after every five non-decoy hits (up to level 5); thresholds are currently fixed in the game engine and are not yet admin-configurable. The base scoring is 100 for normal/combo targets, 250 for bonus targets, and 500 for golden targets; each streak hit after the first adds 25 combo points. Decoy hits cost 150 points and missed clicks cost 25; the final score is clamped at zero. Accuracy is successful hits divided by successful hits, decoy hits, and missed clicks. Expired targets count separately and end the current streak. Completed scores are persisted in the shared rankings.

Neon Snake uses a 24 × 20 grid. The snake starts at four segments and moves faster every four food pickups, from level 1 (170 ms per move) to level 8 (72 ms). Green food is +100 and grows the snake; chaining food within 60 moves raises the combo to a maximum ×5. Gold data is +350 and expires after 55 moves. Corruption is −150, resets the combo, and removes two segments. Shields absorb one gate or sentinel hit at a cost of 100 points. Holding Space boosts movement by 35% at −5 points per move. Walls and self-collisions are always fatal. Pulse gates turn lethal after a warning phase, sentinels patrol fixed lanes, and a run ends at three minutes. The final score is clamped at zero and tracked as total points earned minus penalties.

### Myth or Fact

Myth or Fact uses a server-side bank of 200 reviewed statements across seven categories: Everyday Technology, Cybersecurity, Online Privacy, Artificial Intelligence, Smartphones & Internet, Social Media, and Digital Forensics & IT. Statements have four difficulty levels, explanations, sources, and optional hints. The browser never receives a statement's answer or explanation before it is scored.

Six modes are available: **Classic** (15 questions), **Speed** (short per-question timer with Speed feedback), **Survival** (three lives), **Confidence** (stake 1–3 confidence levels; correct high-confidence answers score more, while wrong high-confidence answers lose points), **Team Discussion** (2–6 players sharing one device), and **Event** (fixed statement set entered with a staff-issued code). Solo runs require at least 10 eligible statements after cooldown filtering.

Scoring is server-authoritative. Correct answers earn base points plus speed, streak, Double Trouble, Final Truth Challenge, and mode bonuses; hints remove bonuses for that statement. Every run ends with accuracy, rank, personal best, streak title, and a full answer review. Casuals exclude every statement assigned to the participant's or team's previous three sessions, including abandoned sessions; fixed event sets are exempt.

A staff-issued event code is single-use. Events pin exact statement versions and rules, can require solo or team participation, and can withhold explanations until registration closes. Published event sets are immutable; staff close registration instead. Leaderboards are separated by mode, participation, and rules version, with one best result per identity per board.

Staff manage Myth or Fact from the existing `/staff` area. Super-admins and event managers can edit statements, publish new rules versions, create and open fixed event sets, and export results; volunteers can issue entry codes. Saving rules creates a new versioned configuration, so existing boards remain tied to the rules under which they were played.

The player guide is documented in [docs/USER-GUIDE.md](./docs/USER-GUIDE.md), with a short expandable guide shown on each game's setup screen before the player can start. The supplied EMU and IT Club logo treatments appear in the arena header. Staff login is no longer exposed as a participant-facing control; authorized staff navigate directly to `/staff`.

## Security notes

- Change the sample `SESSION_SECRET` before running in any shared or production environment.
- Use HTTPS and set `NODE_ENV=production` when deploying so session cookies are marked Secure.
- Do not expose the local development server to an untrusted network.
- The first admin is created explicitly; the app never seeds a known password.
- Back up the SQLite database before event operations. A backup/restore workflow is not implemented yet.
