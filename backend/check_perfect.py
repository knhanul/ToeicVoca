from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
Session = sessionmaker(bind=engine)
db = Session()

user_id = 4
difficulty_level = '800'
cycle_no = 12

perfect_query = text('''
SELECT DISTINCT vocab_id 
FROM study_logs sl
WHERE sl.user_id = :user_id 
  AND sl.cycle_no < :cycle_no 
  AND sl.difficulty_level = :difficulty_level 
  AND sl.result = :result
  AND sl.studied_at = (
      SELECT MAX(studied_at)
      FROM study_logs
      WHERE user_id = :user_id 
        AND vocab_id = sl.vocab_id
        AND cycle_no < :cycle_no 
        AND difficulty_level = :difficulty_level
  )
''')

result = db.execute(perfect_query, {
    'user_id': user_id, 
    'cycle_no': cycle_no, 
    'difficulty_level': difficulty_level,
    'result': 'perfect'
}).fetchall()

print('800점대 12회차 이전 perfect 단어 수:', len(result))
if result:
    print('Perfect 단어 ID:', [row[0] for row in result[:10]])

total_query = text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :difficulty_level')
total_result = db.execute(total_query, {'difficulty_level': difficulty_level}).scalar()
print('800점대 전체 단어 수:', total_result)

db.close()
