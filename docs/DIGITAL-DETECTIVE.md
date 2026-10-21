# Digital Detective — implementation and event operations

## What is integrated

Digital Detective is available in **Challenges**, on the home game grid, and directly at `/digital-detective`. It uses the arena shell, typography, colors, icons, nickname control, anonymous participant identity, SQLite sessions, staff roles, audit log, activity counts and live-ranking notifications.

Participation is **solo** or **a local team sharing one laptop**. No matchmaking, collaboration rooms, invitations, teammate accounts, chat or player synchronization is used. Event laptops connect independently to the same arena backend.

The five complete dossiers are:

1. **The Midnight Breach / Meridian Robotics:** captured-session reuse, document access and a corroborated external transfer.
2. **The Fake Invoice / Harbor Design:** invoice phishing, password-only sign-in, forwarding-rule creation and delivered finance messages.
3. **The Missing Database / Cedar Research:** exposed service-secret reference, unapproved runner job, bulk query and external export; authorized analyst work is separate.
4. **The Insider / Lumen Analytics:** badge events, active session ownership and matching USB/file fingerprints distinguish device assignment from attribution.
5. **Operation Blackout / Aurora Campus Services:** leaked deployment-token reference, unauthorized configuration changes, correlated failures and a misleading network alert.

Each has a briefing, actors, objectives, a six-event puzzle, original evidence, unrelated or misleading leads, three hints, a private citation rubric and an educational debrief. All addresses and infrastructure are simulated; external addresses use documentation IP ranges and `.example` domains. No real credentials are supplied.

### Investigation tools

**How to Play · Free Guide** is available before and during an investigation. It covers every tool, evidence vocabulary, an unrelated worked example, scoring/saving rules and one-device teamwork. It costs no points and does not pause an active countdown.

**Hints** opens a case-specific help desk. Opening or rereading it is free. The explicit **Reveal Next Hint** button displays the point deduction before revealing a progressively stronger lead. Unlocked hints persist across refresh and the organizer can disable new hints. Original unedited dossiers are upgraded to a new case version for the improved hints; existing version-pinned attempts and competitions retain their previous content.

- Shuffled dossier; search across all evidence fields; category and bookmark/suspicion filters; timestamp sorting.
- Full record details and side-by-side comparison.
- Bookmarks and suspicious markers.
- Board evidence cards, actor profiles, shared notes/hypotheses and removable directional connections.
- Distinct source-evidence, hypothesis, unverified and player-supported styles. “Player-supported” is a player interpretation, not an official correctness indicator.
- Timeline drag-and-drop and accessible Move Up/Move Down controls.
- Structured report claims, precise citations and written reasoning.
- Debounced server autosave, explicit Save Now, revision conflict detection and a scoped local recovery draft.
- Server deadline, hint penalties, timeout finalization, official result breakdown and debrief.

## Volunteer workflow

1. Start the existing arena normally and open `/digital-detective` on each event laptop.
2. Select Solo or Team. Enter a nickname; for a team enter its name, captain and additional members. The default roster is **2–6 including the captain**. Add and remove members on the same screen.
3. Choose a practice case/difficulty or an open competition. A competition controls the case version, difficulty and seed.
4. Read the briefing. **The official clock starts only with Begin Investigation.**
5. Encourage discussion and evidence correlation. Check the workspace save status before refreshing or temporarily stepping away.
6. Submit one report. At expiry, the last server-saved draft becomes final; unsaved local edits cannot extend the official deadline.
7. Verify the result screen confirms central saving.
8. Select **Finish & Next Visitor**. It retires attempt ownership, clears temporary server workspace and browser identity/drafts, destroys the browser's arena session (including staff authentication), and returns to a clean welcome screen.
9. Check the nickname field is blank before the next visitor begins.

Leaving through arena navigation also offers a reset. If the reset cannot reach the backend, the UI asks staff to reconnect and finish the handover. Official submissions, roster snapshots, reports and leaderboard scores are retained.

Do not hand over a laptop with an investigation still open. Refresh is a recovery feature, not a handover/reset operation. Closing a tab alone does not revoke the browser session.

## Administrator workflow

Sign in through the existing `/staff` page. Digital Detective appears within that dashboard.

| Role | Access |
| --- | --- |
| `super_admin`, `event_manager` | Settings, cases/private solutions, competitions, attempts, analytics, audited adjustments |
| `volunteer` | Analytics and attempt/roster/submission inspection |
| `display_operator` | Aggregate analytics only; no private solutions or roster/report access |

### Settings

Configure solo/team availability, roster limits, hints, hint penalty, speed ceiling, attempt limit and public leaderboard visibility. Configure each difficulty's seconds and record budget:

| Difficulty | Default records | Default duration |
| --- | ---: | ---: |
| Beginner | 12 | 12 minutes |
| Intermediate | 24 | 10 minutes |
| Advanced | 48 | 8 minutes |
| Expert | 72 | 10 minutes |

Record budgets accept 10–100; duration accepts 60–3,600 seconds. Original v1 cases can omit two optional background records for 10/11-record profiles without removing the incident chain or clock/witness evidence. Higher budgets add correlated operational batches with login, file, traffic, change-approval, detector and completion records. Advanced/expert records include local-clock evidence requiring UTC normalization. Every original incident remains intact.

Custom case versions retain all authored evidence even when it exceeds the configured budget. Choose a matching budget for custom content; the engine does not silently discard authored clues. Initial cases can be authored into more complex new versions through the case editor.

`maxAttempts = 0` means unlimited. Attempt limits use the existing anonymous participant identity for solo players and a normalized roster/team fingerprint for teams, scoped to competition or practice case/version/difficulty. They count abandoned registrations too. This is event bookkeeping, not a verified-person identity system.

Changes apply to **new attempts**. Opened competitions retain their pinned configuration.

### Case management

The case editor is a validated JSON authoring interface with file import and a readable evidence preview.

1. Select a complete seeded case as a schema template.
2. Choose **Duplicate / New** to assign a new ID, or retain the ID to create a new version.
3. Edit title, organization, briefing, actors, objectives, evidence, timeline labels, answer options, solution, accepted citations and hints.
4. Upload a full case JSON file or an evidence JSON array if useful (450 KB file limit).
5. Preview the briefing and evidence.
6. Save as `draft`, then `published` when ready. Set `archived` to remove it from practice selection.

The server checks unique evidence/event IDs, valid answer options, complete timeline permutations and nonempty valid citation rubrics. Logical correctness of newly authored stories still requires human review.

Each save creates an immutable `dd_versions` row. Active and historical attempts continue using their original version. Case solutions are available only through manager-authorized staff endpoints and the authorized post-submission debrief.

### Competitions

Use **Competitions → New Competition**. The JSON editor supplies a complete template. Configure:

- Title and a stable competition ID.
- `caseId` and exact `version`.
- `difficulty` and shared `seed`.
- `startAt` and `endAt` as UTC epoch milliseconds (`Date.now()` produces this format).
- `participation`: `solo`, `team` or `both`.
- `revealAfterClose`: normally `true` for events.
- `status`: `draft`, then `open`, then `closed`.

Opening pins the current gameplay configuration. Every entrant receives the same variant, evidence and timeline display order. Opened rules cannot be edited; only closing is allowed. Create a new competition for a new round. The official deadline is the earlier of the difficulty duration and competition end time.

Closing stops registration; started attempts retain their original deadline. Debriefs become available on a subsequent result load after closing or scheduled end. To end a round at a particular instant, set its scheduled `endAt` before opening.

### Reviewing disputes

**Attempts** shows recent registrations, rosters, submitted reports, hint counts and verified scoring. Managers can enter an adjusted final score (0–1,200) and a reason of at least ten characters. Every adjustment records previous/new scores, administrator, attempt and reason in the existing audit log. Official leaderboard scores update centrally.

**Analytics** shows started/completed investigations, distinct solo identities and teams, mean score/time, case accuracy, missed conclusions, hint use and champions scoped to comparable boards. Use Refresh to update the staff panel.

## Published scoring rules

| Category | Maximum |
| --- | ---: |
| Incident | 150 |
| Entry point | 150 |
| Account/asset | 150 |
| Timeline | 200 |
| Evidence-supported conclusions | 200 |
| Containment | 100 |
| Completeness | 50 |

Conclusion-category points require a correct answer, at least 20 trimmed characters of reasoning, and **more accepted than irrelevant citations** for that finding. Written reasoning is retained for staff review; automatic grading does not claim to understand prose quality.

- Timeline: `round(200 × correctly ordered event pairs / all pairs)`.
- Evidence: up to 40 per report field, including root cause: `round(40 × max(0, relevant − irrelevant) / accepted rubric records)`, only with correct claim and qualifying reasoning. Duplicate citation IDs are counted once.
- Completeness: five points per answered, reasoned, cited field; 25 for a correct supported root cause.
- Accuracy: `base / 10` percent, before hints and speed.
- Speed: only at ≥70% accuracy; `round(configured ceiling × remaining fraction of official time)`, ceiling ≤200.
- Final: `max(0, base + speed − hintsUsed × configured hint penalty)`.

Scores and elapsed time come from the server. The legacy browser-score API cannot start, complete, heartbeat or abandon a Digital Detective attempt. Identical submission retries are idempotent; changed reports cannot overwrite a verified report.

## Leaderboards and variants

Open **Hall of Fame → Digital Detective**, then select a board. Boards separate participation mode, case/version, difficulty, competition and pinned rules. There is deliberately no cross-case “highest score” record. The home card labels these as **Case Boards**.

Ranking order: final score descending, accuracy descending, official elapsed time ascending, verified submission time ascending, then a stable ID tie-break. Only the best attempt per participant/team per board ranks.

Practice variants shift the entire incident day coherently, substitute fictional actors/accounts consistently, rotate documentation-range IPs, and shuffle evidence, timeline cards and answer choices. They do not independently randomize causally related records. Practice boards group these equivalent presentation variants; competition boards pin the exact seed. For prizes, use a pinned competition.

## Database changes

`game_sessions` gains the `digital-detective` game ID through an atomic SQLite CHECK-constraint migration. Existing participant/session/score data and referencing extension rows are retained; foreign-key integrity is checked before commit and enforcement is restored afterward.

Added tables:

- `dd_cases`: current version and publication/archive state.
- `dd_versions`: immutable full case versions, including server-private solution rubrics.
- `dd_config`: configuration revisions.
- `competitions`: game-associated schedule/state and pinned competition settings.
- `dd_attempts`: references `game_sessions`, `teams`, competition and exact case version; stores ownership, roster snapshot, deadline, workspace/revision, hints, report, result, accuracy and elapsed time.

The existing `participants`, `teams`, `game_sessions`, `sessions`, `admin_users` and `audit_log` are reused. No replacement authentication, participant database or parallel official score table was introduced. Initial cases/configuration are seeded idempotently on startup.

## Changed implementation files

- New backend modules/tests: `server/src/digital-detective/{cases,model,engine,service,routes}.ts`, `engine.test.ts`, `service.test.ts`.
- New UI: `src/games/digital-detective/{api.ts,DigitalDetectiveGame.tsx,DetectiveLeaderboard.tsx,DetectiveAdmin.tsx,detective.css}`.
- Integration: `server/src/{database,arena,index}.ts`, `src/ui/App.tsx`.
- Verification: `server/src/arena.test.ts`, `playwright.config.ts`, `tests/browser/digital-detective.spec.ts`.
- Tooling/docs: `package.json`, lockfile, `vite.config.ts`, `.gitignore`, README, player guide and this document.

The existing in-progress Myth/Fact and other game changes were accommodated. Digital Detective does not change their scoring/game engines.

## Verification performed

- `npm test`: **88 tests passed across 11 files**.
- `npm run test:browser`: **10 Chromium scenarios passed** against an isolated API/database and Vite instance, including guide/hint recovery, stale-backend diagnostics, retry recovery and safe exit/reset failure handling.
- `npm run build`: TypeScript and production build passed; investigation screens are lazy-loaded.
- Inspected a captured 1,366-pixel investigation screenshot for native styling/readability. Responsive browser checks covered 1,024- and 640-pixel widths with no horizontal overflow.

Coverage includes existing game engines/API flows; parent-table migration with preserved extension foreign keys; all five cases at all four difficulties; score maxima and partial-credit rules; hint limits; server expiry; version pinning; notes/flags/board/timeline recovery; solo/team registration and member controls; search/filter/sort/comparison; drag and accessible ordering; owned-attempt access; duplicate/legacy endpoint rejection; rate limits; staff roles; event pinning/closure/rankings; audited score adjustment; and device reset that also removes staff authentication.

To run locally:

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests use ports 3197/5177 and a uniquely named database under the OS temporary `opencode` directory. Create that directory first on a fresh development machine. Tests do not use the event database.

## Operational limitations

### If the investigation desk cannot load

If the arena health indicator is online but Digital Detective reports missing routes, an older API process may still own port 3001. Stop that API and start the current source with `npm run dev:server` (or use `npm run dev` for both services). Production deployments need `npm run build` followed by a restart of `npm start`.

The welcome/error screen can return to Challenges without resetting a nonexistent investigation. If an investigation is registered, leaving uses an arena-styled confirmation; failed resets keep it open for retry so a visitor's state is not silently handed to someone else.

- Official registration, submission and reset require the backend. Temporary unsaved edits can recover locally, but offline time still counts and late edits cannot replace an expired server draft.
- Browser/roster identities cannot prove a person's real-world identity or prevent deliberate new-identity registration. Staff oversight is needed for person-based attempt limits.
- Case/competition authoring uses validated JSON, rather than a rich visual editor. Evidence import accepts JSON, not CSV, PDF or arbitrary attachments.
- The board is a card-and-directional-link workspace; cards are not a free-position canvas. Notes, hypotheses and links remain shared on one screen.
- Automatic grading evaluates structured conclusions, citation precision, timeline and reasoning completeness; prose quality is reviewed by staff.
- The staff attempt view shows the most recent 250 attempts; the database retains all attempts.
- Keep seeded case IDs for their authored scenarios. For a custom scenario use a new ID to avoid applying the built-in actor-variant substitutions to an unrelated story.
- Testing was on Chromium; a full manual exhibition rehearsal, assistive-technology audit and event-network load test remain operational checks.
