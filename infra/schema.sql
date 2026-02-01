BEGIN;

-- Drop order (child -> parent)
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
    example_en       TEXT         NULL,
    example_kr       TEXT         NULL,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_vocab_difficulty_day ON vocab(difficulty_level, day);
CREATE INDEX IF NOT EXISTS ix_vocab_topic          ON vocab(topic);
CREATE INDEX IF NOT EXISTS ix_vocab_word           ON vocab(word);

CREATE TABLE IF NOT EXISTS study_logs (
    id          BIGSERIAL PRIMARY KEY,

    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_id    BIGINT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,

    result      VARCHAR(20) NOT NULL,
    studied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_study_logs_user_id    ON study_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_study_logs_vocab_id   ON study_logs (vocab_id);
CREATE INDEX IF NOT EXISTS ix_study_logs_user_time  ON study_logs (user_id, studied_at DESC);

CREATE TABLE IF NOT EXISTS user_progress (
    id               BIGSERIAL PRIMARY KEY,

    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocab_id         BIGINT NOT NULL REFERENCES vocab(id) ON DELETE CASCADE,

    leitner_level    SMALLINT NOT NULL DEFAULT 1,
    next_review_date DATE     NULL,

    is_mastered      BOOLEAN  NOT NULL DEFAULT FALSE,

    last_reviewed_at TIMESTAMPTZ NULL,
    correct_streak   INTEGER NOT NULL DEFAULT 0,
    wrong_count      INTEGER NOT NULL DEFAULT 0,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_vocab UNIQUE (user_id, vocab_id),
    CONSTRAINT ck_leitner_level CHECK (leitner_level >= 1 AND leitner_level <= 10)
);

CREATE INDEX IF NOT EXISTS ix_user_progress_due
    ON user_progress (user_id, next_review_date);

CREATE INDEX IF NOT EXISTS ix_user_progress_level
    ON user_progress (user_id, leitner_level);

COMMIT;
