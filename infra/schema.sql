BEGIN;

-- Drop order (child -> parent)
DROP TABLE IF EXISTS vocab_examples CASCADE;
DROP TABLE IF EXISTS level_day_progress CASCADE;
DROP TABLE IF EXISTS level_cycles CASCADE;
DROP TABLE IF EXISTS user_progress CASCADE;
DROP TABLE IF EXISTS study_logs CASCADE;
DROP TABLE IF EXISTS vocab CASCADE;
DROP TABLE IF EXISTS words CASCADE;

-- users까지 지우려면 아래 주석 해제
-- DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    current_level VARCHAR(20)  NULL,
    remind_window_days INTEGER NOT NULL DEFAULT 5,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);

CREATE TABLE IF NOT EXISTS vocab (
    id               BIGSERIAL PRIMARY KEY,

    difficulty_level TEXT         NULL,
    day              INTEGER      NULL,
    topic            TEXT         NULL,

    word             VARCHAR(200) NOT NULL,
    meaning          TEXT         NOT NULL,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_vocab_difficulty_day ON vocab(difficulty_level, day);
CREATE INDEX IF NOT EXISTS ix_vocab_topic          ON vocab(topic);
CREATE INDEX IF NOT EXISTS ix_vocab_word           ON vocab(word);

CREATE TABLE IF NOT EXISTS vocab_examples (
    id          BIGSERIAL PRIMARY KEY,
    vocab_id    BIGINT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,
    example_en  TEXT NULL,
    example_kr  TEXT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_vocab_examples_vocab_id ON vocab_examples(vocab_id);

CREATE TABLE IF NOT EXISTS study_logs (
    id          BIGSERIAL PRIMARY KEY,

    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_id    BIGINT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,

    difficulty_level TEXT NULL,
    cycle_no    INTEGER NOT NULL DEFAULT 1,
    result      VARCHAR(20) NOT NULL,
    studied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_study_logs_user_id    ON study_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_study_logs_vocab_id   ON study_logs (vocab_id);
CREATE INDEX IF NOT EXISTS ix_study_logs_level_cycle ON study_logs (user_id, difficulty_level, cycle_no);
CREATE INDEX IF NOT EXISTS ix_study_logs_user_time  ON study_logs (user_id, studied_at DESC);

CREATE TABLE IF NOT EXISTS user_progress (
    id               BIGSERIAL PRIMARY KEY,

    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_id         BIGINT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,

    cycle_no          INTEGER NOT NULL DEFAULT 1,
    leitner_level    SMALLINT NOT NULL DEFAULT 1,
    next_review_date DATE     NULL,

    is_mastered      BOOLEAN  NOT NULL DEFAULT FALSE,

    last_reviewed_at TIMESTAMPTZ NULL,
    correct_streak   INTEGER NOT NULL DEFAULT 0,
    wrong_count      INTEGER NOT NULL DEFAULT 0,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_vocab_cycle UNIQUE (user_id, vocab_id, cycle_no),
    CONSTRAINT ck_leitner_level CHECK (leitner_level >= 1 AND leitner_level <= 10)
);

CREATE INDEX IF NOT EXISTS ix_user_progress_due
    ON user_progress (user_id, next_review_date);

CREATE INDEX IF NOT EXISTS ix_user_progress_level
    ON user_progress (user_id, leitner_level);

CREATE TABLE IF NOT EXISTS level_cycles (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty_level VARCHAR(20) NOT NULL,
    cycle_no         INTEGER NOT NULL DEFAULT 1,
    status           VARCHAR(40) NOT NULL DEFAULT 'active',
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ NULL,
    CONSTRAINT uq_level_cycles UNIQUE (user_id, difficulty_level, cycle_no)
);

CREATE INDEX IF NOT EXISTS ix_level_cycles_user_level_status
    ON level_cycles (user_id, difficulty_level, status);

CREATE TABLE IF NOT EXISTS level_day_progress (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty_level VARCHAR(20) NOT NULL,
    cycle_no         INTEGER NOT NULL DEFAULT 1,
    day              INTEGER NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'locked',
    opened_at        TIMESTAMPTZ NULL,
    completed_at     TIMESTAMPTZ NULL,
    CONSTRAINT uq_level_day_progress UNIQUE (user_id, difficulty_level, cycle_no, day)
);

CREATE INDEX IF NOT EXISTS ix_level_day_progress_lookup
    ON level_day_progress (user_id, difficulty_level, cycle_no, status, day);

COMMIT;
