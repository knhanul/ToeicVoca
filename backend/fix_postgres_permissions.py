from sqlalchemy import text
from app.db import engine

def fix_postgres_permissions():
    """PostgreSQL 사용자에게 필요한 권한 부여"""
    with engine.connect() as conn:
        try:
            # 현재 사용자 확인
            result = conn.execute(text("SELECT current_user;"))
            current_user = result.fetchone()[0]
            print(f"현재 사용자: {current_user}")
            
            # users 테이블 권한 부여
            conn.execute(text("""
                GRANT SELECT, INSERT, UPDATE, DELETE ON users TO voca_admin;
                GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO voca_admin;
            """))
            
            # 모든 테이블에 권한 부여
            tables = ['users', 'vocab', 'vocab_examples', 'study_logs', 'user_progress', 'level_cycles', 'level_day_progress']
            
            for table in tables:
                try:
                    conn.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO voca_admin;"))
                    print(f"✅ {table} 테이블 권한 부여 완료")
                except Exception as e:
                    print(f"⚠️  {table} 테이블 권한 부여 실패: {e}")
            
            # 시퀀스 권한 부여
            sequences = ['users_id_seq', 'vocab_id_seq', 'vocab_examples_id_seq', 'study_logs_id_seq', 
                        'user_progress_id_seq', 'level_cycles_id_seq', 'level_day_progress_id_seq']
            
            for seq in sequences:
                try:
                    conn.execute(text(f"GRANT USAGE, SELECT ON SEQUENCE {seq} TO voca_admin;"))
                    print(f"✅ {seq} 시퀀스 권한 부여 완료")
                except Exception as e:
                    print(f"⚠️  {seq} 시퀀스 권한 부여 실패: {e}")
            
            conn.commit()
            print("PostgreSQL 권한 설정 완료!")
            
        except Exception as e:
            print(f"권한 설정 실패: {e}")
            conn.rollback()

def check_permissions():
    """권한 확인"""
    with engine.connect() as conn:
        try:
            # users 테이블 접근 테스트
            result = conn.execute(text("SELECT COUNT(*) FROM users;"))
            count = result.fetchone()[0]
            print(f"users 테이블 접근 성공: {count}개 레코드")
            
            # 테이블 목록 확인
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """))
            tables = result.fetchall()
            print(f"사용 가능한 테이블: {[t[0] for t in tables]}")
            
        except Exception as e:
            print(f"권한 확인 실패: {e}")

if __name__ == "__main__":
    print("PostgreSQL 권한 문제 해결 시작...")
    fix_postgres_permissions()
    print("\n권한 확인:")
    check_permissions()
