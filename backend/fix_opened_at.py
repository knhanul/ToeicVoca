from sqlalchemy import create_engine, text
from datetime import datetime

engine = create_engine('postgresql://postgres:postgres@localhost:5432/hackersvoca')
with engine.connect() as conn:
    result = conn.execute(text('SELECT opened_at FROM level_day_progress WHERE user_id = 3 AND difficulty_level = "600" AND cycle_no = 1 AND day = 28'))
    print('Current opened_at:', result.scalar())
    if result.scalar() is None:
        conn.execute(text('UPDATE level_day_progress SET opened_at = :now WHERE user_id = 3 AND difficulty_level = "600" AND cycle_no = 1 AND day = 28'), {'now': datetime.utcnow()})
        conn.commit()
        print('Updated opened_at for Day 28')
    else:
        print('opened_at already exists')
