# TECHNOVA HUB

A Next.js 15 + TypeScript learning platform backed by Neon PostgreSQL.

## Setup

1. Install Node.js 20.9 or newer.
2. Run `npm ci` (the project includes `package-lock.json`).
3. Copy `.env.example` to `.env` and configure `DATABASE_URL`, `SESSION_SECRET`, `RECOVERY_PEPPER`, administrator credentials, `GROQ_API_KEY`, `GROQ_MODEL`, and `CRON_SECRET`.
4. Back up the Neon database, then run `npm run db:migrate`. The schema changes in this update are additive; they do not drop existing tables or records.
5. Run `npm run db:seed` to add the starter question bank. Existing question codes are not overwritten.
6. Run `npm run dev`.

Do not commit `.env`. Keep Groq, Neon, session, recovery and cron secrets server-side. Prefer a bcrypt `ADMIN_PASSWORD_HASH` over a plaintext `ADMIN_PASSWORD`.

## Evidence-based Learning Academy

Learning progress and proof are verified and stored on the server:

- Lessons unlock in sequence. The first lesson is open; the next lesson requires both a passed checkpoint and a passed practical task for the previous lesson.
- Each of the 19 current lessons has five curated questions (95 checkpoint questions total). The answer key stays on the server; attempts and results are written to `learning_checkpoint_attempts`. A score of 80% is required. Final exams sample questions across the lessons in the path.
- Passing a checkpoint unlocks the practical task. The learner submits evidence and a reflection. The server checks the submission against the lesson's authored rubric; at least 80% of rubric requirements, 100 characters of evidence and 40 characters of reflection are required.
- Important limitation: practical submissions are assessed against a server-side evidence rubric. Submitted code is checked for required constructs but is **not executed** in an isolated code sandbox. Do not submit secrets, passwords or private data.
- All lessons must be completed before the final path assessment unlocks. The final assessment also requires 80%.
- Passing checkpoints, practical tasks and final assessments awards XP through an idempotent `xp_rewards` ledger. Duplicate requests cannot award the same lesson reward twice.
- A certificate is issued only when all lessons have server-verified checkpoint and practical passes and the final assessment has been passed. The PDF contains the learner, path, level, issue date, unique certificate ID and a QR verification link. Learners can view/download their certificates at `/certificates`; public verification is available at `/verify/<certificate-code>`.
- Certificates are TECHNOVA HUB Certificates of Completion. They do not claim external accreditation or professional licensing.

## Daily missions and gamification

Three daily missions are stored and checked against Neon records using the Tanzania-local date:

- Complete today's five-question challenge: 10 XP.
- Pass a learning checkpoint: 15 XP.
- Pass a practical task: 20 XP.

A mission can be claimed once per participant per Tanzania-local day. Claims and XP ledger entries are committed together with unique constraints to prevent duplicate rewards. The profile derives XP and levels from saved challenge points plus reward ledger entries. Achievements are synchronized from verified database activity.

## Manual challenge scheduling from the admin dashboard

1. Open `/admin` and sign in.
2. Open the **Questions** tab. Use only rows with status `approved`. The **Question ID** column shows the numeric IDs required by the scheduler; the `question_code` is a separate human-readable identifier and must not be entered in the ID field.
3. Open the **Schedule** tab, choose the challenge date in `Africa/Dar_es_Salaam`, and enter exactly five different numeric IDs separated by commas (for example `12, 13, 14, 15, 16`).
4. Select **Schedule challenge**. The date and five question links are saved in Neon. Learners will see that challenge when its Tanzania-local date becomes today. A date can only have one challenge. Questions used on an earlier challenge date cannot be reused.

This manual workflow uses existing approved questions; it does not ask Groq to generate questions. The automated Groq workflow is separate and runs from `/api/cron/daily-challenge` using the schedule in `vercel.json`.

## Daily AI challenge generation

`/api/cron/daily-challenge` requires `Authorization: Bearer $CRON_SECRET`. `vercel.json` schedules the endpoint at `21:05 UTC`, which is `00:05` the next day in `Africa/Dar_es_Salaam`. For a different host, configure its scheduler to call this endpoint daily and provide `CRON_SECRET` and Groq environment variables.

Question generation uses several checks before publication:

1. Strict JSON/schema validation, exactly five questions across at least three categories, distinct A–D options and one marked answer.
2. Local lexical and bigram overlap checks against up to 600 recent questions and between new candidates.
3. SHA-256 content fingerprints with a unique database index to reject exact normalized duplicates.
4. A separate Groq reviewer checks factual support, answer validity, ambiguity and likely paraphrase duplicates against a recent question sample. The reviewer must return one positive verdict per question; uncertain or rejected sets fail closed and are not published.
5. A per-date database lock prevents normal retries from producing a second daily challenge. A prepared challenge can be safely recovered and published.

These safeguards substantially reduce duplicates and quality errors but cannot mathematically guarantee that an AI question is factually perfect or semantically unique. Admin review is still recommended. If Groq is unavailable or a validation fails, the generation request returns an error and does not publish unreviewed questions.

## Persistence and browser storage

Neon PostgreSQL is the source of truth for participant accounts, learning progress, checkpoint/practical/final attempts, personal notes, learner projects, mission claims, rewards, achievements, challenge answers and certificates. The application does not use `localStorage`, `sessionStorage` or IndexedDB to persist user data. React component state is temporary UI state only. Authentication uses a secure HTTP-only session cookie; durable learning data remains on the server.

## Routes worth knowing

- `/learn` — learning paths and lessons.
- `/profile` — XP, levels, achievements and daily missions.
- `/certificates` — certificates earned by the signed-in learner.
- `/verify/<certificate-code>` — public certificate verification.
- `/admin` — administrator dashboard.

## Deployment notes

Set the environment variables in the hosting provider, apply database migrations, seed the starter content where appropriate, and configure the daily scheduler. Ensure the deployment plan supports scheduled HTTP functions. Use a shared rate-limit store or platform WAF for production scale; the existing application rate limiting is process-local best-effort.
