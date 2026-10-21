# EMUCON IT Challenge Arena

An event-focused arcade and digital-safety learning platform for EMUCON 2026, branded for the Eastern Mediterranean University Information Technologies Club. The arena combines browser games, a live Hall of Fame, a staff dashboard, and Myth or Fact event/content management.

> **Repository:** [GUMELINNOVATION/IT-club-game](https://github.com/GUMELINNOVATION/IT-club-game)<br>
> **Player guide:** [docs/USER-GUIDE.md](docs/USER-GUIDE.md)

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configure the application](#configure-the-application)
- [Operate the arena](#operate-the-arena)
- [Game and activity guide](#game-and-activity-guide)
- [Staff access and administration](#staff-access-and-administration)
- [Scores, privacy, and security](#scores-privacy-and-security)
- [Production deployment](#production-deployment)
- [Back up and restore data](#back-up-and-restore-data)
- [Development and tests](#development-and-tests)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Features

- Seven playable challenges: Zero Point, Target Rush, Perfect Align, Brain Firewall, Neon Snake, Myth or Fact, and Digital Detective.
- Five interactive Cyber Lab activities using fictional situations only.
- Responsive arena UI with EMU and IT Club branding, sound controls, and presentation mode.
- Persistent SQLite game sessions, scores, anonymous participant profiles, and administrator sessions.
- Live Hall of Fame rankings and staff activity metrics.
- Myth or Fact game flow with server-side answer checking, six modes, versioned question content, fixed event challenges, and role-aware staff tools.
- Digital Detective: five forensics cases, solo/local-team play, evidence tools, a persistent investigation board, timeline puzzles, server scoring, separate case boards, staff case/competition management and next-visitor reset. See [the implementation and event guide](docs/DIGITAL-DETECTIVE.md).
- Password-hashed staff accounts, HTTP-only sessions, login rate limiting, audit logging, Helmet security headers, and validated API input.

## Requirements

- Windows, macOS, or Linux
- Node.js 22 or later (the scripts use Node's `--env-file-if-exists` option)
- npm
- A modern browser for playing and staff operation

The application does not require a separate database server. SQLite is created and managed by the API.

## Run locally

Open PowerShell in the repository folder.

1. Install project dependencies:

   ```powershell
   npm install
   ```

2. Create a private environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit `.env` and replace the sample `SESSION_SECRET` with a random value of at least 32 characters. Never commit `.env` or share its contents.

   A random secret can be generated in PowerShell:

   ```powershell
   $bytes = New-Object byte[] 48
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

   Copy the displayed value into `.env` as `SESSION_SECRET=...`.

4. Create the initial administrator account:

   ```powershell
   $env:ADMIN_USERNAME = "event-admin"
   $securePassword = Read-Host "Choose an administrator password" -AsSecureString
   $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
   npm run admin:create
   Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
   ```

   The username must be 3–64 characters and the password 12–256 characters. The command creates a `super_admin`; there is no seeded or default password.

5. Start both the API and Vite development server:

   ```powershell
   npm run dev
   ```

6. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API listens on port 3001 by default, and Vite proxies `/api` requests to it.

Stop the development servers with **Ctrl+C** in the terminal.

### Start only one development service

The API and web app are separate processes in development. Normally use `npm run dev` to start both. If needed, run them in separate terminals:

```powershell
# Terminal 1: API
npm run dev:server

# Terminal 2: web app
npm run dev:web
```

Starting only the web app will not make API-dependent features work. Starting only the API does not serve the Vite development interface.

## Configure the application

The development and production scripts load values from `.env` when the file exists.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port used by the Express API/server. |
| `DATABASE_PATH` | `./data/emucon.sqlite` | SQLite database file. Parent directories are created automatically. |
| `SESSION_SECRET` | No default | Required. Secret used to sign staff/browser sessions; must be at least 32 characters. |
| `NODE_ENV` | `.env.example` uses `development` | Set to `production` for a deployed server. Production enables secure session cookies and serves the built frontend from `dist`. |

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are read by `npm run admin:create` only; they are not application runtime credentials. The app does not create or reset administrator accounts at startup.

### Database and persisted data

The default database is `data/emucon.sqlite`. SQLite runs in WAL mode; while the app is running, `data/emucon.sqlite-wal` and `data/emucon.sqlite-shm` may also exist. Keep the database directory on persistent local storage and do not put it in a temporary deployment filesystem.

The database stores administrator accounts, audit events, browser sessions, anonymous participant IDs, completed game runs, Myth or Fact statements/configuration/events, and associated results. Database files are excluded from Git.

## Operate the arena

### Player flow

1. Open the arena and choose a challenge card, or use the navigation to open **Challenges**.
2. Read the game's instructions and scoring details before starting.
3. A nickname/call sign is optional. When entered, it is displayed publicly with scores and saved in that browser for reuse. Use a nickname rather than a real name.
4. Complete the run and review the result. Most games save the score to the Hall of Fame automatically; a save failure is shown with a retry option.
5. Use **Hall of Fame** to view rankings. Rankings refresh over a live event stream and automatically poll as a fallback.
6. Use **Cyber Lab** for short fictional safety exercises. Cyber Lab answers are not leaderboard submissions.

The participant identity is an anonymous browser profile, not a registered account. Clearing that browser's local storage creates a different participant identity. Do not clear browser storage during an event if the player expects the same identity to retain their best-score ranking.

### Arena status and common controls

- **System Online / Offline Mode** reflects whether the API health endpoint is responding.
- **Sound** is muted by default and can be toggled from the header.
- **Presentation Mode** asks the browser to enter fullscreen. The browser may require a user gesture or refuse the request.
- Keyboard controls vary by game and are shown in that game's guide.
- The public interface does not display a staff-login button. Authorized staff can navigate directly to `/staff`.

## Game and activity guide

For complete player instructions, see [docs/USER-GUIDE.md](docs/USER-GUIDE.md). Summary:

### Zero Point

Eight timing rounds with fresh random millisecond targets each run. Stop the timer after the countdown, using the button, **Space**, or **Enter**. Advanced rounds hide and reveal the elapsed timer at randomized intervals. A perfect stop earns 10,000 points; other scores are calculated from timing error. The score is browser-calculated.

### Target Rush

Choose a 15, 30, 45, 60, 90, or 120-second round. Click/tap moving targets or use the accessible numbered target controls. Normal and combo hits are worth 100 points, bonus hits 250, and golden hits 500. Decoys cost 150 and missed clicks cost 25. Difficulty increases every five successful hits. The score is browser-calculated.

### Perfect Align

Stop a moving marker inside the target zone across five increasingly difficult levels. There are three attempts per alignment. Optional Dual Alignment requires two consecutive successes from Level 3. Later levels introduce variable marker speed and moving target zones. The game shows the measured result and attempt history. The score is browser-calculated.

### Brain Firewall

Select one or more of nine topics—Frontend, Backend, General Knowledge, Security, Privacy, AI & Data, Digital Basics, Tech Myths, and Logic—or use Random Mix. Choose a 10- or 20-question run. Answer with the on-screen choices or keys **1–4**. Correct answers earn difficulty, speed, and streak points; answer explanations and sources are shown during review. Questions and answer choices are shuffled. The 210-question bank is bundled with the application. The score is browser-calculated.

### Neon Snake

Keyboard survival game controlled with the **arrow keys**. **Space** boosts movement, and **P** or **Esc** pauses. Collect data, build combos, and avoid corruption, walls, sentinels, pulse gates, and self-collisions. Difficulty climbs every three food pickups and every 20 seconds, through 12 speed levels (155–58 ms per move). Level-ups add distant firewalls, higher levels add corruption, and pulse gates stay live longer. A run lasts at most three minutes. The score is browser-calculated.

### Myth or Fact

Choose among Classic, Speed, Survival, Confidence, Team Discussion, and Daily/Event modes when enabled. Team Discussion supports 2–6 players sharing one device. Event runs use a staff-issued one-time code. Answers and scoring are checked by the server; results are separated by mode, participation, and rules/event version.

### Cyber Lab

Five interactive, three-scenario activities: Social Engineering Detective, QR Code Trust Test, Spot the Phishing Attempt, Public Wi-Fi Awareness, and Digital Footprint Challenge. They use fictional profiles, messages, URLs, and networks. They do not scan a real QR code, connect to Wi-Fi, or request credentials or personal information.

## Staff access and administration

### Sign in

1. Open `http://localhost:5173/staff` while the local app is running, or open `/staff` on the deployed host.
2. Sign in with the administrator username and password created for that database.
3. Sign out when finished, especially on a shared event computer.

Signing in directly at `/staff` is not a bypass; the API requires a valid administrator session for protected endpoints. Staff sessions expire after eight hours. Login attempts are rate limited.

### Mission Control dashboard

The dashboard requires an authenticated staff account and displays:

- **Participants:** distinct anonymous browser profiles that started a game.
- **Games Played:** completed runs.
- **Active Sessions:** unfinished runs with a heartbeat in the last 90 seconds.
- **Database:** whether the database-backed overview request succeeded.

Metrics update through server-sent events, with automatic polling as a fallback. These counts are operational activity indicators, not unique human attendance or verified competition results.

### Myth or Fact content and events

The **Myth or Fact · Content & Events** panel is part of Mission Control. Available actions depend on staff role:

- Super-admins and event managers can create/edit statements, configure game rules, publish event sets, and manage events.
- Volunteers can issue event entry codes.
- Other staff roles have limited or read-only access.

In the statement editor, review/search/filter statements, create or edit versioned content, mark statements as reviewed, or archive them so they are not used in new casual runs. Existing runs retain the versions they used. Only reviewed, active statements are eligible for casual runs.

Statement imports accept CSV or JSON. CSV headers are:

```text
statement,fact,explanation,category,difficulty,hint,source,reviewStatus,active
```

Use `fact` as `true` or `false`; category must be one of the supported Myth or Fact categories; difficulty is 1–4; `reviewStatus` is `draft` or `reviewed`; and `active` is `true` or `false`. JSON accepts an array of statement objects with the same fields. Imports start in **dry run** mode: validate the file first, inspect the reported count/errors, and uncheck dry run only when ready to save. Duplicate wording is rejected. The staff panel also exports statements as CSV or JSON.

Rules changes create a new configuration version so completed rankings remain associated with the rules used. Published event sets pin their statement versions/rules; close registration rather than changing a published set. Entry codes are single-use. Event explanations may be withheld until registration closes.

> **Operational practice:** Prepare and review questions, rules, and event sets before the event begins. Test event codes and player flow using a non-production database before issuing real event codes.

## Scores, privacy, and security

- Hall of Fame call signs are public. Ask players to use nicknames; call signs are limited by the API.
- The browser stores an anonymous participant identifier and the optional call sign in local storage. No participant account, email, telephone number, or student ID is required.
- Completed game records and participant IDs are stored in SQLite on the server.
- Rankings show a participant's best completed score per board, with ties ordered by earlier completion; up to 50 results are shown per standard game board.
- Myth or Fact keeps answers/explanations server-side until the answer is scored and uses server-controlled timing/scoring.
- The other five games calculate scores in the browser. The API accepts scores only for server-issued game sessions and validates score shape/range, but it does not replay the gameplay. Do not use those scores alone to award prizes or make high-stakes decisions.
- Cyber Lab uses fictional training examples. Never type a real password, one-time code, recovery answer, or other secret into an awareness exercise.
- Passwords are hashed with Node.js `scrypt`; staff session cookies are HTTP-only and SameSite strict. In production the cookie is Secure and the site must be served over HTTPS.
- Keep `.env`, credentials, database files, event codes, and backups private. Do not expose the Vite development server to an untrusted network.

## Production deployment

The repository contains a Node/Express API and a Vite frontend; it does not currently include a configured cloud-host deployment workflow. GitHub stores the source code but does not run the API. **GitHub Pages alone is not a supported full-app deployment**, because the site needs the API and a persistent SQLite database.

For a production deployment, use a Node.js host or server that provides:

1. Node.js 22 or later and the ability to run npm build/start commands.
2. A persistent writable filesystem or mounted volume for the SQLite database.
3. HTTPS, with a reverse proxy/platform forwarding requests to the app's `PORT`.
4. Environment variables stored in the host's secret manager.
5. A persistent backup process for the database.

Typical build and start commands:

```powershell
npm ci
npm run build
npm start
```

Set `NODE_ENV=production`, a private `SESSION_SECRET` of at least 32 characters, `DATABASE_PATH` to a persistent volume location, and optionally `PORT` as required by the host. In production, Express serves the built frontend from `dist` and serves `/api` from the same process. Configure the proxy to preserve the host and HTTPS forwarding headers required by secure cookies and same-origin checks.

Create the first administrator against the same production database before opening staff access. Use the host's one-off command/job mechanism to run `npm run admin:create` with `ADMIN_USERNAME` and `ADMIN_PASSWORD` supplied as protected temporary environment variables. Do not put the password in a deployment file, repository secret committed as code, or shell history. Remove the temporary environment variables after creating the account.

Before inviting players, verify:

- `https://your-host.example/api/health` returns `{"status":"ok"}`.
- The home page loads and the system status is online.
- `/staff` accepts the provisioned account and rejects invalid credentials.
- A test run appears on the Hall of Fame and data remains after an app restart.
- HTTPS is active and the database volume persists across deploys/restarts.

This is a deployment checklist, not a claim that a particular cloud host or live URL has been configured.

## Back up and restore data

The SQLite database contains scores, anonymous participant records, staff accounts/sessions, audit records, and Myth or Fact/event data. Protect backups as sensitive event data.

For a simple offline backup, stop the application cleanly first so SQLite can checkpoint its WAL, then copy the configured database file:

```powershell
Copy-Item .\data\emucon.sqlite .\data\emucon-backup-YYYYMMDD.sqlite
```

If `DATABASE_PATH` points elsewhere, copy that file instead. Store backups in a restricted location separate from the app and Git working tree. For a live event, use a tested SQLite-aware backup process rather than copying a live database file manually.

To restore an offline backup, stop the application, preserve a copy of the current database, replace the configured database file with the backup, then restart and verify `/api/health`, staff sign-in, and rankings. Never overwrite the only copy of event data.

## Development and tests

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API and Vite web app together. |
| `npm run dev:server` | Start/restart the API with file watching. |
| `npm run dev:web` | Start Vite only; requires the API separately. |
| `npm run build` | Type-check TypeScript and create production frontend/server builds. |
| `npm start` | Start the production server; build first and set production environment variables. |
| `npm test` | Run the complete Vitest suite. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run admin:create` | Create a super-admin using temporary `ADMIN_USERNAME` and `ADMIN_PASSWORD` values. |

The tests include game engines, API behavior, authentication, persistent sessions, Myth or Fact server logic, and event/content workflows. Run `npm run build` and `npm test` before publishing changes.

## Troubleshooting

### Browser says `ERR_CONNECTION_REFUSED`

- Confirm `npm run dev` is still running and has not exited with an error.
- Open the exact Vite URL printed in the terminal, normally `http://localhost:5173`.
- Check the terminal for a port-in-use error; stop or reconfigure the conflicting process, then restart the app.
- If the page opens but says **OFFLINE MODE**, check that the API started on `PORT` (default 3001), `SESSION_SECRET` is present and at least 32 characters, and `http://localhost:3001/api/health` returns `{"status":"ok"}`.

### `/staff` does not show the login form

Open `/staff` directly. If the API is online, an unauthenticated visit should show the staff sign-in form. If the API is unavailable, start or repair the API first. There is no default admin account; follow [Run locally](#run-locally) to create one.

### `SESSION_SECRET` error on startup

Set a `SESSION_SECRET` of at least 32 characters in `.env` (local) or in the deployment's secret manager (production), then restart the server.

### Scores do not appear

- Check that the system status is online and the API health endpoint responds.
- Wait for the save status or use its **Retry Save** action before leaving the results screen.
- Confirm the database path is writable and persistent.
- Myth or Fact boards are separated by mode, solo/team participation, and rules/event version; select the matching board.

### Event code is rejected

Confirm that the event is published and registration is open, that the code was issued for that event, and that it has not already been used. Entry codes are single-use.

## Known limitations

- Five of seven scored games use browser-generated results; Myth or Fact and Digital Detective validate their results server-side.
- Brain Firewall question content is bundled with the app; it has no staff question editor.
- Head-to-head play, participant accounts, platform-wide kiosk workflows, automated cloud deployment, and a built-in backup/restore command are not implemented. Digital Detective has its own session-clearing next-visitor workflow within the existing arena.
- Cyber Lab is educational content and not a tool for scanning actual links, QR codes, wireless networks, or devices.
- Competition operations should include human oversight, accessibility accommodations, and a separate prize-eligibility process.

## Project structure

```text
src/
  games/                  Browser game components and engines
  ui/                     Arena pages, staff UI, shared styles and data helpers
server/src/
  myth-fact/              Server-owned Myth or Fact game, data and routes
  database.ts             SQLite schema and initialization
  index.ts                Express application and API
docs/
  USER-GUIDE.md            Player-facing game and activity instructions
public/brand/              EMU and IT Club logo assets
```
