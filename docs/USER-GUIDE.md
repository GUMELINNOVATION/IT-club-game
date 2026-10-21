# EMUCON IT Challenge Arena — Player Guide

Welcome to the EMUCON IT Challenge Arena. Pick a challenge, read its quick guide before you start, and play at your own pace. You do not need to create an account or provide contact information.

## Before you play

- A call sign is optional. If you choose one, it is saved in this browser for convenience and appears publicly beside your best score.
- Use a mouse, touch screen, or the keyboard controls shown in the game.
- Sound is muted by default. Follow the on-screen instructions; you can play without sound.
- A game may offer a **Back to Challenges** button. Leaving a live round ends that local run.
- Completed scores are submitted to the live Hall of Fame. Scores are calculated in the browser and are not replayed or independently verified, so they should not be used to award prizes without additional event controls.

## Zero Point

Zero Point has eight increasingly difficult levels. The target time is shown before each level starts.

1. Read the target time.
2. Wait through the three-second countdown and the **GO** signal.
3. Stop the timer as close to the target as possible. Press the on-screen **STOP** button, **Space**, or **Enter**.
4. Review your actual time, error, and points before continuing.
5. Complete all eight levels to see your summary.

Levels 2–8 periodically hide and reveal the elapsed timer. The clock returns for brief glimpses—including near the target—rather than remaining hidden for the rest of the round. The final level picks a random target from 18 to 25 seconds.

Scoring is deterministic:

`round score = round(10,000 / (1 + error in milliseconds / 25))`

The error is the absolute difference between your actual elapsed time and the target. A perfect stop earns 10,000 points.

## Target Rush

Choose a round length: 15, 30, 45, 60, 90, or 120 seconds. The default is 60 seconds.

1. Read the target key and scoring guide before starting.
2. Press **Start Target Rush** and wait through the three-second countdown.
3. Tap or click targets in the playfield. Keyboard-accessible numbered target buttons also appear below the arena.
4. Normal targets are cyan (+100), bonus targets are purple (+250), combo targets are green (+100 plus streak points), and golden targets are gold (+500).
5. Avoid red X-marked decoys (−150). Empty clicks cost 25 points.
6. Every five successful hits raises difficulty. Targets get smaller and faster and remain active for less time.
7. At the end, review your score, accuracy, average reaction time, longest combo, and scoring breakdown.

The score is clamped at zero. Accuracy is successful hits divided by all successful hits, decoy hits, and missed clicks. Expired targets are counted separately and break the current combo.

## Perfect Align

Perfect Align has five progressively narrower alignment levels, with three attempts per alignment.

1. Read the quick guide and choose whether to enable **Dual Alignment**.
2. After the countdown, watch the marker and stop it while it is inside the gold target boundaries. Press **STOP MARKER**, **Space**, or **Enter**.
3. Levels 1–3 use stationary target zones. Levels 4–5 introduce variable marker speed and a moving zone.
4. With Dual Alignment enabled, Levels 3–5 require two consecutive successful stops.
5. Review the measured marker position, zone center, precision, and points after each attempt. Misses are never counted as successful alignments.

The run summary lists every attempt. Completed scores are submitted to the Hall of Fame. The game score is calculated in the browser and is not server-replayed or independently verified.

## Brain Firewall

Brain Firewall offers six topics: Security, Privacy, AI & Data, Digital Basics, Tech Myths, and Logic. Choose any combination and a 10- or 20-question run.

1. Select the topics and run length before starting.
2. Choose one of four answers before the question timer runs out; number keys **1–4** are also available.
3. Correct answers earn points based on difficulty and response speed, with an additional streak bonus. Incorrect answers and timeouts earn no points.
4. Read the explanation and source shown after each question, then continue to the next one.
5. Review the final score, accuracy, streak, and answer explanations at the end.

The local question bank contains 150 reviewed questions with topic, difficulty, timer, explanation, and source metadata. This is a learning game, not professional security advice; do not enter real personal information.

## Neon Snake

Neon Snake is a keyboard-only survival challenge. It is intentionally harder than classic Snake: the grid accelerates, obstacles accumulate, and penalties reduce your score.

1. Press **Enter the Grid**, wait through the countdown, then steer with the **arrow keys**. Press **P** or **Esc** to pause, and **Space** to boost.
2. Collect green **+100** data to grow. Collect food quickly (within 60 moves) to build a combo up to **×5**.
3. Avoid red **−150** corruption: it resets your combo and removes two tail segments. Scores never fall below zero.
4. Gold **+350** data appears periodically and expires after 55 moves. A shield **S** absorbs one sentinel or pulse-gate hit, but costs **−100** when used.
5. Avoid walls, your own body, moving sentinels, and live red gates. Gates flash amber before becoming lethal.
6. Every four food pickups raises speed, up to level 8, and can add a firewall block. Survive for three minutes or set your best score before crashing.
7. When the run ends, review points earned, points lost, best combo, and data collected. Press **Play Again** for a fresh grid.

Completed Neon Snake scores are submitted to the live Hall of Fame. Keyboard controls are required; reaction and timing differences between devices mean scores are not independently verified competition results.

## Cyber Lab and privacy

Cyber Lab uses fictional examples for awareness activities. Never enter a real password, account recovery answer, or other secret into a demonstration. The platform does not need your email, telephone number, student ID, or account registration to play.

## Staff access

The staff sign-in control is intentionally not displayed in the public participant interface. Staff can open the `/staff` route directly. Access still requires an administrator account; direct navigation is not authentication.

## Accessibility and fair play

Use the keyboard controls or numbered target controls when available. Pointer/touch reflex times may differ from keyboard input, so browser-calculated scores are not independently verified competition rankings. Ask event volunteers for an accessible alternative if a reaction-based challenge is not suitable.
