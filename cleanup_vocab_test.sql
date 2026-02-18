-- Vocab 테이블 정리 쿼리
-- 각 Day별 5개 단어만 남기고, Day도 5개만 남기기

-- 1. Day 1-5만 남기고 나머지 Day 삭제
DELETE FROM vocab 
WHERE day > 5;

-- 2. 각 Day별로 5개 단어만 남기기 (Day별로 id 기준으로 가장 작은 5개)
WITH ranked_vocab AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY day ORDER BY id ASC) as rn
    FROM vocab
    WHERE day BETWEEN 1 AND 5
)
DELETE FROM vocab
WHERE id IN (
    SELECT id FROM ranked_vocab WHERE rn > 5
);

-- 3. 결과 확인
SELECT 
    day,
    COUNT(*) as word_count,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM vocab 
GROUP BY day 
ORDER BY day;

-- 4. 전체 단어 수 확인
SELECT 
    COUNT(*) as total_words,
    COUNT(DISTINCT day) as unique_days
FROM vocab;

-- 5. 각 난이도별 단어 수 확인
SELECT 
    difficulty_level,
    COUNT(*) as word_count
FROM vocab 
GROUP BY difficulty_level
ORDER BY difficulty_level;
