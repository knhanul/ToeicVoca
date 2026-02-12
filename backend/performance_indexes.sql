-- Recommended indexes for performance
-- Run these in PostgreSQL directly

-- 1. StudyLogs composite index (most important)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_logs_user_level_cycle_vocab 
ON study_logs (user_id, difficulty_level, cycle_no, vocab_id) 
WHERE vocab_id IS NOT NULL;

-- 2. StudyLogs timestamp index for recent study
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_study_logs_studied_at_desc 
ON study_logs (studied_at DESC);

-- 3. Vocab composite index for day queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocab_difficulty_day 
ON vocab (difficulty_level, day) 
WHERE day IS NOT NULL;

-- 4. LevelDayProgress composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_level_day_progress_user_level_cycle_status 
ON level_day_progress (user_id, difficulty_level, cycle_no, status);

-- 5. UserProgress composite index for remind queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_progress_user_cycle_wrong_review 
ON user_progress (user_id, cycle_no, wrong_count DESC, next_review_date ASC);

-- 6. UserProgress review date index (for today's cards)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_progress_review_date_mastered 
ON user_progress (next_review_date, is_mastered, user_id, cycle_no);

-- 7. VocabExamples index for random selection
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocab_examples_vocab_id 
ON vocab_examples (vocab_id);

-- 8. LevelCycles composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_level_cycles_user_level_status 
ON level_cycles (user_id, difficulty_level, status, cycle_no DESC);
