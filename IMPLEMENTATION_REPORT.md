# TECHNOVA HUB — Learning & Gamification Completion Report

## Delivered in this update

### 1. Server-verified learning checkpoints
- Added five curated questions for each of the 19 lessons (95 checkpoint questions). Final path exams draw from across the path lessons rather than over-weighting the first lesson.
- Correct answers and explanations stay on the server; client payloads cannot submit answer keys.
- Attempts and scores are persisted in Neon (`learning_checkpoint_attempts`).
- Passing threshold is 80%; every attempt is stored, including failed attempts.
- A passed checkpoint is recorded in `learning_progress` and its XP reward is idempotent.

### 2. Practical assessments and lesson unlocking
- Added a practical task for every authored lesson, with lesson-specific rubrics and fallback rubrics for future lessons.
- Learners must pass the checkpoint before submitting a practical task.
- Practical evidence, reflection, score and feedback are stored in Neon (`learning_practical_submissions`).
- The server accepts a practical result at 80% or above, subject to minimum evidence/reflection lengths.
- The next lesson is unlocked only after the previous lesson has a server-stored checkpoint pass and practical pass. Passed checkpoints/practicals cannot be resubmitted to farm daily mission rewards.
- Removed the previous direct lesson-completion shortcut; reading a lesson no longer marks it complete.
- Practical rubrics currently check the presence of required evidence/terms. Submitted source code is not run in a sandbox; full executable code assessment would require a separately isolated execution service.

### 3. Final assessment and PDF certificates
- Added a final path assessment, available only after all path lessons have passed both assessment stages.
- Final pass mark is 80%; attempts are retained in Neon.
- Certificates are issued only after all lesson evidence and a passed final assessment.
- Unique IDs use the `TNH-YYYY-XXXXXXXX` format; database uniqueness prevents collisions/duplicates.
- Added a branded A4 landscape PDF certificate with learner name, learning path, level, issue date, certificate ID and QR verification link.
- Added authenticated download/list routes and public verification JSON/page.
- Certificate wording is “Certificate of Completion”; no external accreditation is implied.

### 4. Daily missions, XP and achievements
- Added three daily missions: daily challenge (+10 XP), lesson checkpoint (+15 XP), practical task (+20 XP).
- Eligibility is verified against timestamped database records using `Africa/Dar_es_Salaam` local dates.
- A participant can claim each mission once per local day; unique constraints and an XP reward ledger make retries idempotent.
- Profile XP and levels include saved reward ledger entries and refresh immediately after mission claims. Seven-consecutive-day streak achievements are synchronized from challenge dates.
- Added first checkpoint, first practical and first certificate achievements; XP Club includes mission/learning rewards.

### 5. Groq question generation quality gates
- Validates five questions across at least three distinct categories, four unique choices and a valid correct option.
- Compares prompt/scenario/options using normalized word and bigram overlap across up to 600 recent stored questions and between candidates.
- Stores SHA-256 content fingerprints with a unique partial index for exact normalized duplicate rejection.
- Runs a separate Groq reviewer that must independently approve all five questions for factual support, unambiguous answers, valid correct options and duplicate risk.
- Reviewer response must contain exactly one verdict for each candidate ID 1–5.
- Fails closed: if Groq or quality checks fail, new questions are not published. A date-specific generation lock supports idempotency and recovery.
- Similarity and AI review reduce, but cannot guarantee zero semantic repeats or zero factual errors; admin review remains advisable.

## Database changes

All new SQL is additive (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, new tables and indexes). There are no `DROP TABLE`, `DROP COLUMN` or data-reset statements in this update. Key additions:
- `learning_checkpoint_attempts`
- `learning_practical_submissions`
- `learning_final_attempts`
- `xp_rewards`
- additional learning progress, mission reward, certificate and question review fields/indexes

No connection to the user's Neon database was made in this workspace, so no migration or seed operation has been run against live user data. Run `npm run db:migrate` only after taking a Neon backup; then run `npm run db:seed` as appropriate.

## Browser persistence

No persistent user data is written to `localStorage`, `sessionStorage` or IndexedDB. Durable records are stored in Neon. React state is used only for temporary form and presentation state. Authentication remains in an HTTP-only session cookie.

## Verification performed
- TypeScript/TSX syntax transpilation: 70 source files, 0 syntax diagnostics.
- QR algorithm test: generated QR for a certificate verification URL and decoded it successfully with OpenCV.
- PDF generation test: generated a one-page A4 landscape PDF; `pdfinfo` confirmed valid PDF 1.4 structure and one page. Rendered and visually inspected the sample certificate.
- Storage API scan: no browser persistence API usage in application code. The only `localStorage` match is a seed-question distractor describing an incorrect database practice.
- Full `npm run typecheck` and `npm run build` could not be completed because project dependencies were not installed in this workspace (npm dependency installation previously timed out). Therefore no claim of a successful production build is made.
- No live Neon migration, live Groq request, browser end-to-end QA or deployed cron execution was possible without the user's deployment secrets and database access.

## Deployment checklist
1. Keep `.env` out of version control and update any secrets previously shared in uploaded archives.
2. Configure `DATABASE_URL`, `SESSION_SECRET`, `RECOVERY_PEPPER`, admin credentials, `GROQ_API_KEY`, `GROQ_MODEL` and `CRON_SECRET` in the hosting provider.
3. Back up Neon and run `npm run db:migrate`.
4. Run `npm run db:seed` if the starter question bank is required.
5. Deploy and confirm `/api/cron/daily-challenge` is called daily at 21:05 UTC (00:05 Tanzania time) by a scheduler that supports the configured route.
6. Test signup/login, one checkpoint, one practical task, lesson unlock, final exam, certificate download and public verification with a test account.
