from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://postgres:postgres@localhost:5432/toeicvoca')
Session = sessionmaker(bind=engine)
db = Session()

user_id = 4
difficulty_level = '600'

print("=== 600점대 Perfect 단어 상세 분석 ===")

# 1. 600점대 전체 단어 수
total_query = text('SELECT COUNT(*) FROM vocab WHERE difficulty_level = :difficulty_level')
total_result = db.execute(total_query, {'difficulty_level': difficulty_level}).scalar()
print(f"600점대 전체 단어 수: {total_result}")

# 2. 600점대 최신 결과별 단어 수
latest_results_query = text('''
SELECT result, COUNT(*) as count
FROM (
    SELECT vocab_id, result
    FROM study_logs sl
    WHERE sl.user_id = :user_id 
      AND sl.difficulty_level = :difficulty_level
      AND sl.studied_at = (
          SELECT MAX(studied_at)
          FROM study_logs
          WHERE user_id = :user_id 
            AND vocab_id = sl.vocab_id
            AND difficulty_level = :difficulty_level
      )
) AS latest
GROUP BY result
ORDER BY result
''')

latest_results = db.execute(latest_results_query, {
    'user_id': user_id,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\n최신 결과별 단어 수:")
for result, count in latest_results:
    print(f"  {result}: {count}개")

# 3. Perfect 아닌 단어 목록
not_perfect_query = text('''
SELECT v.id, v.word, v.day, sl.result
FROM vocab v
JOIN (
    SELECT vocab_id, result
    FROM study_logs sl
    WHERE sl.user_id = :user_id 
      AND sl.difficulty_level = :difficulty_level
      AND sl.studied_at = (
          SELECT MAX(studied_at)
          FROM study_logs
          WHERE user_id = :user_id 
            AND vocab_id = sl.vocab_id
            AND difficulty_level = :difficulty_level
      )
) AS latest ON v.id = latest.vocab_id
WHERE v.difficulty_level = :difficulty_level
  AND latest.result != 'perfect'
ORDER BY v.day, v.word
''')

not_perfect_results = db.execute(not_perfect_query, {
    'user_id': user_id,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\nPerfect 아닌 단어 목록 ({len(not_perfect_results)}개):")
for record in not_perfect_results:
    print(f"  ID: {record[0]}, Day: {record[2]}, Word: {record[1]}, Result: {record[3]}")

# 4. Perfect 단어 목록 (처음 10개만)
perfect_query = text('''
SELECT v.id, v.word, v.day, sl.result
FROM vocab v
JOIN (
    SELECT vocab_id, result
    FROM study_logs sl
    WHERE sl.user_id = :user_id 
      AND sl.difficulty_level = :difficulty_level
      AND sl.studied_at = (
          SELECT MAX(studied_at)
          FROM study_logs
          WHERE user_id = :user_id 
            AND vocab_id = sl.vocab_id
            AND difficulty_level = :difficulty_level
      )
) AS latest ON v.id = latest.vocab_id
WHERE v.difficulty_level = :difficulty_level
  AND latest.result = 'perfect'
ORDER BY v.day, v.word
LIMIT 10
''')

perfect_results = db.execute(perfect_query, {
    'user_id': user_id,
    'difficulty_level': difficulty_level
}).fetchall()

print(f"\nPerfect 단어 목록 (처음 10개):")
for record in perfect_results:
    print(f"  ID: {record[0]}, Day: {record[2]}, Word: {record[1]}, Result: {record[3]}")

db.close()
