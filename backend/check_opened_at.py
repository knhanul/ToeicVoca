from sqlalchemy import create_engine, text
from datetime import datetime

engine = create_engine('postgresql://postgres:postgres@localhost:5432/hackersvoca')
with engine.connect() as conn:
    # 현재 상태 확인
    result = conn.execute(text('SELECT day, opened_at FROM level_day_progress WHERE user_id = 3 AND difficulty_level = "600" AND cycle_no = 1 AND day = 28'))
    row = result.fetchone()
    print(f'Day 28 opened_at: {row[1] if row else "Not found"}')
    
    # opened_at이 null이면 업데이트
    if row and row[1] is None:
        conn.execute(text('UPDATE level_day_progress SET opened_at = :now WHERE user_id = 3 AND difficulty_level = "600" AND cycle_no = 1 AND day = 28'), {'now': datetime.utcnow()})
        conn.commit()
        print('Updated opened_at for Day 28')
        
        # 다시 확인
        result = conn.execute(text('SELECT opened_at FROM level_day_progress WHERE user_id = 3 AND difficulty_level = "600" AND cycle_no = 1 AND day = 28'))
        print(f'New opened_at: {result.scalar()}')
    else:
        print('opened_at already exists or Day 28 not found')
