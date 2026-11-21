CREATE TABLE IF NOT EXISTS participants (
  id BIGSERIAL PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL UNIQUE,
  display_name VARCHAR(40),
  anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  recovery_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  question_code VARCHAR(40) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL,
  difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  question_type VARCHAR(24) NOT NULL DEFAULT 'scenario',
  prompt TEXT NOT NULL,
  scenario TEXT,
  options JSONB NOT NULL,
  correct_option VARCHAR(8) NOT NULL,
  explanation TEXT NOT NULL,
  learning_objective TEXT,
  source_name TEXT,
  source_url TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS questions_status_category_idx ON questions(status, category);
CREATE TABLE IF NOT EXISTS daily_challenges (
  id BIGSERIAL PRIMARY KEY,
  challenge_date DATE NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','published','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS daily_challenge_questions (
  challenge_id BIGINT NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id),
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  points SMALLINT NOT NULL DEFAULT 2 CHECK (points = 2),
  PRIMARY KEY(challenge_id, position),
  UNIQUE(challenge_id, question_id)
);
CREATE TABLE IF NOT EXISTS challenge_attempts (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  challenge_id BIGINT NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id),
  selected_option VARCHAR(8) NOT NULL,
  is_correct BOOLEAN NOT NULL,
  points SMALLINT NOT NULL DEFAULT 0 CHECK (points IN (0,2)),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id, challenge_id, question_id)
);
CREATE INDEX IF NOT EXISTS attempts_challenge_points_idx ON challenge_attempts(challenge_id, participant_id);
CREATE TABLE IF NOT EXISTS achievements (id BIGSERIAL PRIMARY KEY, achievement_key VARCHAR(60) NOT NULL UNIQUE, title VARCHAR(120) NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participant_achievements (participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, achievement_id BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE, earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(participant_id, achievement_id));
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additive TECHNOVA HUB account and learning persistence (safe for existing rows)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS username VARCHAR(32);
ALTER TABLE participants ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS participants_username_unique_idx ON participants(LOWER(username)) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS learning_progress (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  path_slug VARCHAR(80) NOT NULL,
  lesson_slug VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','checkpoint_passed','completed')),
  read_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id,path_slug,lesson_slug)
);
CREATE TABLE IF NOT EXISTS learning_notes (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL DEFAULT 'My notes',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id,title)
);
CREATE TABLE IF NOT EXISTS learner_projects (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stack VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'In progress' CHECK(status IN ('Idea','In progress','Completed','On hold')),
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS daily_mission_claims (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  mission_date DATE NOT NULL,
  mission_key VARCHAR(60) NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id,mission_date,mission_key)
);
CREATE TABLE IF NOT EXISTS certificates (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  path_slug VARCHAR(80) NOT NULL,
  certificate_code VARCHAR(40) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id,path_slug)
);
CREATE TABLE IF NOT EXISTS question_generation_runs (
  id BIGSERIAL PRIMARY KEY,
  challenge_date DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK(status IN ('started','published','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS learning_progress_participant_idx ON learning_progress(participant_id);
CREATE INDEX IF NOT EXISTS learner_projects_participant_idx ON learner_projects(participant_id);

-- Learning assessments, practical proof, idempotent rewards and verifiable certificates.
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS checkpoint_passed_at TIMESTAMPTZ;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS practical_passed_at TIMESTAMPTZ;
ALTER TABLE daily_mission_claims ADD COLUMN IF NOT EXISTS reward_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS learner_name VARCHAR(120);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS path_title VARCHAR(160);
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS path_level VARCHAR(40);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS content_fingerprint VARCHAR(64);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_reviewed_at TIMESTAMPTZ;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS quality_review_model VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS questions_content_fingerprint_unique_idx ON questions(content_fingerprint) WHERE content_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_checkpoint_attempts (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  path_slug VARCHAR(80) NOT NULL,
  lesson_slug VARCHAR(100) NOT NULL,
  answers JSONB NOT NULL,
  score_percent SMALLINT NOT NULL CHECK(score_percent BETWEEN 0 AND 100),
  passed BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learning_checkpoint_attempts_user_lesson_idx ON learning_checkpoint_attempts(participant_id,path_slug,lesson_slug,attempted_at DESC);

CREATE TABLE IF NOT EXISTS learning_practical_submissions (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  path_slug VARCHAR(80) NOT NULL,
  lesson_slug VARCHAR(100) NOT NULL,
  evidence TEXT NOT NULL,
  reflection TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  score_percent SMALLINT NOT NULL CHECK(score_percent BETWEEN 0 AND 100),
  feedback TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learning_practical_submissions_user_lesson_idx ON learning_practical_submissions(participant_id,path_slug,lesson_slug,submitted_at DESC);

CREATE TABLE IF NOT EXISTS xp_rewards (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_key VARCHAR(160) NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id,source_type,source_key)
);
CREATE INDEX IF NOT EXISTS xp_rewards_participant_created_idx ON xp_rewards(participant_id,created_at DESC);

CREATE INDEX IF NOT EXISTS daily_mission_claims_date_idx ON daily_mission_claims(participant_id,mission_date);
CREATE INDEX IF NOT EXISTS certificates_participant_idx ON certificates(participant_id,issued_at DESC);

CREATE TABLE IF NOT EXISTS learning_final_attempts (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  path_slug VARCHAR(80) NOT NULL,
  answers JSONB NOT NULL,
  score_percent SMALLINT NOT NULL CHECK(score_percent BETWEEN 0 AND 100),
  passed BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS learning_final_attempts_user_path_idx ON learning_final_attempts(participant_id,path_slug,attempted_at DESC);
