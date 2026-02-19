-- ============================================
-- 이메일 데이터 확인 및 수정 SQL
-- ============================================
-- 실행 방법: psql -U postgres -d toeicvoca -f fix_email_data.sql

-- 1. 현재 users 테이블 데이터 확인
SELECT id, username, email, created_at 
FROM users 
WHERE id = 4;

-- 2. 모든 사용자의 이메일 상태 확인
SELECT 
    id, 
    username, 
    email, 
    CASE 
        WHEN email IS NULL THEN 'NULL'
        WHEN email = '' THEN 'EMPTY'
        ELSE 'HAS_VALUE'
    END as email_status
FROM users;

-- 3. 이메일이 NULL인 사용자에게 기본 이메일 설정
UPDATE users 
SET email = username || '@example.com' 
WHERE email IS NULL AND username IS NOT NULL;

-- 4. 이메일이 빈 문자열인 사용자에게 기본 이메일 설정
UPDATE users 
SET email = username || '@example.com' 
WHERE email = '' AND username IS NOT NULL;

-- 5. 결과 확인
SELECT id, username, email, created_at 
FROM users 
WHERE id = 4;

-- 6. 전체 사용자 이메일 상태 최종 확인
SELECT 
    COUNT(*) as total_users,
    COUNT(email) as users_with_email,
    COUNT(*) - COUNT(email) as users_without_email
FROM users;
