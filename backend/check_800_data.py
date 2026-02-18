from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
Session = sessionmaker(bind=engine)
db = Session()

user_id = 4
difficulty_level = '800'
cycle_no = 12

print("=== 800점대 1~11회차 데이터 상세 분석 ===")

# 1. 800점대 전체 단어 수 확인
total_query = text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :difficulty_level')
total_result = db.execute(total_query, {'difficulty_level': difficulty_level}).scalar()
print(f"800점대 전체 단어 수: {total_result}")

# 2. 1~11회차 전체 학습 기록 확인
all_logs_query = text('''
SELECT vocab_id, cycle_no, result, studied_at
FROM study_logs
WHERE user_id = :user_id 
  AND cycle_no < :cycle_no 
  AND difficulty_level = :difficulty_level
ORDER BY vocab_id, cycle_no DESC
''')

all_logs = db.execute(all_logs_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n1~11회차 전체 학습 기록 수: {len(all_logs)}")
for record in all_logs[:20]:  # 처음 20개만 표시
    print(f"  vocab_id: {record[0]}, cycle_no: {record[1]}, result: {record[2]}")

# 3. 1~11회차 perfect 기록만 확인
perfect_logs_query = text('''
SELECT vocab_id, cycle_no, result, studied_at
FROM study_logs
WHERE user_id = :user_id 
  AND cycle_no < :cycle_no 
  AND difficulty_level = :difficulty_level
  AND result = 'perfect'
ORDER BY vocab_id, cycle_no DESC
''')

perfect_logs = db.execute(perfect_logs_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n1~11회차 perfect 기록 수: {len(perfect_logs)}")
for record in perfect_logs[:20]:  # 처음 20개만 표시
    print(f"  vocab_id: {record[0]}, cycle_no: {record[1]}, result: {record[2]}")

# 4. 각 단어별 최신 perfect 기록 확인
latest_perfect_query = text('''
SELECT vocab_id, MAX(cycle_no) as latest_cycle, result
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
for record in latest_perfect[:20]:  # 처음 20개만 표시
    print(f"  vocab_id: {record[0]}, latest_cycle: {record[1]}, result: {record[2]}")

# 5. 현재 Raw SQL 결과 확인
current_raw_query = text('''
SELECT DISTINCT vocab_id 
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

current_result = db.execute(current_raw_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n현재 Raw SQL 결과 수: {len(current_result)}")
for record in current_result[:20]:  # 처음 20개만 표시
    print(f"  vocab_id: {record[0]}")

# 6. 12회차 학습 기록 확인
cycle12_query = text('''
SELECT vocab_id, cycle_no, result, studied_at
FROM study_logs
WHERE user_id = :user_id 
  AND cycle_no = :cycle_no 
  AND difficulty_level = :difficulty_level
ORDER BY vocab_id
''')

cycle12_logs = db.execute(cycle12_query, {
    'user_id': user_id,
    'cycle_no': cycle_no,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n12회차 학습 기록 수: {len(cycle12_logs)}")
for record in cycle12_logs[:20]:  # 처음 20개만 표시
    print(f"  vocab_id: {record[0]}, cycle_no: {record[1]}, result: {record[2]}")

db.close()
