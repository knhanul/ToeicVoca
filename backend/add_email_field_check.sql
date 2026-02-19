-- ============================================
-- 이메일 필드 확인 및 추가 SQL
-- ============================================
-- 실행 방법: psql -U postgres -d toeicvoca -f add_email_field_check.sql

-- 1. 현재 users 테이블 구조 확인
\d users

-- 2. email 필드가 있는지 확인
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'email';

-- 3. email 필드가 없으면 추가
DO $$
BEGIN
    -- email 필드 추가
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
    
    -- 기존 사용자들에게 기본 이메일 설정
    UPDATE users 
    SET email = username || '@example.com' 
    WHERE email IS NULL AND username IS NOT NULL;
    
    -- 인덱스 추가
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    
    -- 결과 확인
    RAISE NOTICE 'Email field added successfully';
END;
$$;

-- 4. 결과 확인
SELECT 
    id, 
    username, 
    email, 
    created_at 
FROM users 
ORDER BY id 
LIMIT 5;

-- 5. email 필드가 있는지 최종 확인
SELECT 
    COUNT(*) as total_users,
    COUNT(email) as users_with_email,
    COUNT(*) - COUNT(email) as users_without_email
FROM users;
