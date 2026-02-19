-- ============================================
-- ToeicVoca Email 필드 추가 SQL
-- ============================================
-- 사용자 테이블에 email 필드 추가
-- 실행 방법: psql -U postgres -d toeicvoca -f add_email_field.sql

-- 1. users 테이블에 email 필드 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;

-- 2. 기존 사용자들에게 기본 이메일 설정 (username@example.com)
UPDATE users 
SET email = username || '@example.com' 
WHERE email IS NULL AND username IS NOT NULL;

-- 3. email 필드에 인덱스 추가 (성능 향상)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 4. 현재 users 테이블 구조 확인
\d users

-- 5. email 필드가 추가된 것 확인하는 쿼리
SELECT 
    id, 
    username, 
    email, 
    created_at 
FROM users 
ORDER BY id;

-- ============================================
-- 실행 후 확인 사항
-- ============================================
-- 1. 모든 사용자에게 email이 설정되었는지 확인
SELECT COUNT(*) as total_users, 
       COUNT(email) as users_with_email,
       COUNT(*) - COUNT(email) as users_without_email
FROM users;

-- 2. email 중복 확인 (UNIQUE 제약조건으로 중복 없어야 함)
SELECT email, COUNT(*) as count
FROM users 
WHERE email IS NOT NULL
GROUP BY email
HAVING COUNT(*) > 1;

-- ============================================
-- 롤백 SQL (필요시 사용)
-- ============================================
-- -- email 필드 제거 (주의: 데이터 손실됨)
-- ALTER TABLE users DROP COLUMN IF EXISTS email;
-- -- 인덱스 제거
-- DROP INDEX IF EXISTS idx_users_email;
