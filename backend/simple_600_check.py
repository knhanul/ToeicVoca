from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def simple_check():
    engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        user_id = 4
        difficulty_level = '600'
        
        print("=== 600점대 간단한 상태 확인 ===")
        
        # 1. 전체 단어 수
        total = db.execute(text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :dl'), 
                          {'dl': difficulty_level}).scalar()
        print(f"전체 단어 수: {total}")
        
        # 2. 현재 회차
        cycle = db.execute(text('SELECT cycle_no, status FROM level_cycles WHERE user_id = :uid AND difficulty_level = :dl ORDER BY cycle_no DESC LIMIT 1'), 
                          {'uid': user_id, 'dl': difficulty_level}).fetchone()
        if cycle:
            print(f"현재 회차: {cycle[0]}, 상태: {cycle[1]}")
        else:
            print("활성 회차 없음")
            return
        
        # 3. Perfect 단어 수
        perfect = db.execute(text('SELECT COUNT(*) FROM study_logs WHERE user_id = :uid AND difficulty_level = :dl AND result = :r'), 
                             {'uid': user_id, 'dl': difficulty_level, 'r': 'perfect'}).scalar()
        print(f"Perfect 기록 수: {perfect}")
        
        # 4. 열린 Day
        open_day = db.execute(text('SELECT day FROM level_day_progress WHERE user_id = :uid AND difficulty_level = :dl AND cycle_no = :cn AND status = :s LIMIT 1'), 
                              {'uid': user_id, 'dl': difficulty_level, 'cn': cycle[0], 's': 'open'}).fetchone()
        if open_day:
            print(f"열린 Day: {open_day[0]}")
        else:
            print("열린 Day 없음")
        
        print("=== 확인 완료 ===")
        
    except Exception as e:
        print(f"오류: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    simple_check()
