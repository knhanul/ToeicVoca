from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
Session = sessionmaker(bind=engine)
db = Session()

user_id = 4
difficulty_level = '600'

try:
    print("=== 600점대 현재 상태 확인 ===")

    # 1. 600점대 전체 단어 수 확인
    total_query = text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :difficulty_level')
    total_result = db.execute(total_query, {'difficulty_level': difficulty_level}).scalar()
    print(f"600점대 전체 단어 수: {total_result}")

    # 2. 600점대 현재 활성 회차 확인
    cycle_query = text('''
    SELECT cycle_no, status, started_at, completed_at
    FROM level_cycles
    WHERE user_id = :user_id 
      AND difficulty_level = :difficulty_level
      AND status IN ('active', 'completed_pending_confirm')
    ORDER BY cycle_no DESC
    LIMIT 1
    ''')

    cycle_result = db.execute(cycle_query, {
        'user_id': user_id,
        'difficulty_level': difficulty_level
    }).fetchone()

    if cycle_result:
        print(f"\n현재 활성 회차: {cycle_result[0]}, 상태: {cycle_result[1]}")
        cycle_no = cycle_result[0]
    else:
        print("\n활성 회차 없음")
        cycle_no = None

    # 3. 600점대 perfect 단어 수 확인
    perfect_query = text('''
    SELECT COUNT(*) 
    FROM (SELECT study_logs.vocab_id AS vocab_id, study_logs.result AS result
    FROM study_logs JOIN (SELECT study_logs.vocab_id AS vocab_id, max(study_logs.studied_at) AS max_ts
    FROM study_logs
    WHERE study_logs.user_id = :user_id AND study_logs.difficulty_level = :difficulty_level GROUP BY study_logs.vocab_id) AS anon_2 ON study_logs.vocab_id = anon_2.vocab_id AND study_logs.studied_at = anon_2.max_ts) AS anon_1
    WHERE anon_1.result = :result
    ''')

    perfect_result = db.execute(perfect_query, {
        'user_id': user_id,
        'difficulty_level': difficulty_level,
        'result': 'perfect'
    }).scalar()

    print(f"600점대 perfect 단어 수: {perfect_result}")

    # 4. 600점대 전 회차 perfect 단어 수 확인 (학습 제외 대상)
    if cycle_no and cycle_no > 1:
        previous_perfect_query = text('''
        SELECT COUNT(DISTINCT vocab_id)
        FROM study_logs sl
        WHERE sl.user_id = :user_id 
          AND sl.cycle_no < :cycle_no 
          AND sl.difficulty_level = :difficulty_level 
          AND sl.result = 'perfect'
          AND sl.cycle_no = (
              SELECT MAX(cycle_no)
              FROM study_logs
              WHERE user_id = :user_id 
                AND vocab_id = sl.vocab_id
                AND cycle_no < :cycle_no 
                AND difficulty_level = :difficulty_level
                AND result = 'perfect'
          )
        ''')
        
        previous_perfect_result = db.execute(previous_perfect_query, {
            'user_id': user_id,
            'cycle_no': cycle_no,
            'difficulty_level': difficulty_level
        }).scalar()
        
        print(f"전 회차 perfect 단어 수 (제외 대상): {previous_perfect_result}")
        print(f"학습 대상 단어 수: {total_result - previous_perfect_result}")
    else:
        print("전 회차 perfect 단어 없음 (첫 회차 또는 회차 정보 없음)")

    # 5. 현재 열린(open) Day 확인
    if cycle_no:
        open_day_query = text('''
        SELECT day, status
        FROM level_day_progress
        WHERE user_id = :user_id 
          AND difficulty_level = :difficulty_level 
          AND cycle_no = :cycle_no
          AND status = 'open'
        ORDER BY day
        LIMIT 1
        ''')
        
        open_day_result = db.execute(open_day_query, {
            'user_id': user_id,
            'difficulty_level': difficulty_level,
            'cycle_no': cycle_no
        }).fetchone()
        
        if open_day_result:
            print(f"\n현재 열린 Day: {open_day_result[0]}, 상태: {open_day_result[1]}")
        else:
            print("\n열린 Day 없음")
            
        # 완료된 Day 수 확인
        completed_days_query = text('''
        SELECT COUNT(*)
        FROM level_day_progress
        WHERE user_id = :user_id 
          AND difficulty_level = :difficulty_level 
          AND cycle_no = :cycle_no
          AND status = 'completed'
        ''')
        
        completed_days_result = db.execute(completed_days_query, {
            'user_id': user_id,
            'difficulty_level': difficulty_level,
            'cycle_no': cycle_no
        }).scalar()
        
        print(f"완료된 Day 수: {completed_days_result}")

    print("\n=== 분석 완료 ===")

except Exception as e:
    print(f"오류 발생: {e}")
finally:
    db.close()
    print("데이터베이스 연결 종료")
