from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
Session = sessionmaker(bind=engine)
db = Session()

user_id = 4
difficulty_level = '800'
cycle_no = 12

print("=== 800점대 1~11회차 perfect 기록 확인 ===")

# 1. 1~11회차 전체 perfect 기록 확인
all_perfect_query = text('''
SELECT DISTINCT vocab_id, cycle_no, studied_at, result
FROM study_logs
WHERE user_id = :user_id 
  AND cycle_no < :cycle_no 
  AND difficulty_level = :difficulty_level 
  AND result = 'perfect'
ORDER BY vocab_id, cycle_no DESC
''')

all_perfect = db.execute(all_perfect_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"1~11회차 전체 perfect 기록 수: {len(all_perfect)}")
for record in all_perfect[:10]:  # 처음 10개만 표시
    print(f"  vocab_id: {record[0]}, cycle_no: {record[1]}, result: {record[3]}")

# 2. 각 단어별 최신 perfect 기록 확인
latest_perfect_query = text('''
SELECT vocab_id, MAX(cycle_no) as latest_cycle, MAX(studied_at) as latest_time, result
FROM study_logs
WHERE user_id = :user_id 
  AND cycle_no < :cycle_no 
  AND difficulty_level = :difficulty_level 
  AND result = 'perfect'
GROUP BY vocab_id, result
ORDER BY vocab_id
''')

latest_perfect = db.execute(latest_perfect_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n각 단어별 최신 perfect 기록 수: {len(latest_perfect)}")
for record in latest_perfect[:10]:  # 처음 10개만 표시
    print(f"  vocab_id: {record[0]}, latest_cycle: {record[1]}, result: {record[3]}")

# 3. 현재 Raw SQL 결과 확인
current_raw_query = text('''
SELECT DISTINCT vocab_id 
FROM study_logs sl
WHERE sl.user_id = :user_id 
  AND sl.cycle_no < :cycle_no 
  AND sl.difficulty_level = :difficulty_level 
  AND sl.result = 'perfect'
  AND sl.studied_at = (
      SELECT MAX(studied_at)
      FROM study_logs
      WHERE user_id = :user_id 
        AND vocab_id = sl.vocab_id
        AND cycle_no < :cycle_no 
        AND difficulty_level = :difficulty_level
  )
''')

current_result = db.execute(current_raw_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n현재 Raw SQL 결과 수: {len(current_result)}")
for record in current_result[:10]:  # 처음 10개만 표시
    print(f"  vocab_id: {record[0]}")

# 4. 800점대 전체 단어 수 확인
total_query = text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :difficulty_level')
total_result = db.execute(total_query, {'difficulty_level': difficulty_level}).scalar()
print(f"\n800점대 전체 단어 수: {total_result}")

db.close()
