-- ============================================
-- 이메일 필드 즉시 확인 및 추가 SQL
-- ============================================
-- 실행 방법: psql -U postgres -d toeicvoca -c "COPY (내용) TO STDOUT"

-- 1. 현재 users 테이블 구조 확인
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- 2. email 필드가 있는지 확인
SELECT COUNT(*) as email_column_exists
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'email';

-- 3. 현재 데이터 확인
SELECT id, username, email, created_at 
FROM users 
WHERE id = 4;

-- 4. email 필드 추가 (없는 경우만)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE;
        UPDATE users SET email = username || '@example.com' WHERE email IS NULL;
        RAISE NOTICE 'Email field added successfully';
    ELSE
        RAISE NOTICE 'Email field already exists';
    END IF;
END;
$$;

-- 5. 결과 확인
SELECT id, username, email, created_at 
FROM users 
WHERE id = 4;
