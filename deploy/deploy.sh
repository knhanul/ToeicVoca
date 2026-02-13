#!/bin/bash
set -e

echo "=== HackersVoca 배포 스크립트 ==="

# 변수 설정
PROJECT_DIR="/var/www/hackersvoca"
BACKUP_DIR="/var/backups/hackersvoca"
DATE=$(date +%Y%m%d_%H%M%S)

# 백업 디렉토리 생성
mkdir -p $BACKUP_DIR

echo "1. 데이터베이스 백업..."
if command -v pg_dump &> /dev/null; then
    pg_dump -h localhost -U voca_admin HackersVoca > $BACKUP_DIR/db_backup_$DATE.sql
    echo "데이터베이스 백업 완료: $BACKUP_DIR/db_backup_$DATE.sql"
else
    echo "경고: pg_dump를 찾을 수 없습니다. 데이터베이스 백업을 건너뜁니다."
fi

echo "2. 백엔드 업데이트..."
cd $PROJECT_DIR/backend
source venv/bin/activate

# 의존성 업데이트
pip install -r requirements.txt

# 데이터베이스 마이그레이션 (필요시)
if [ -f "migrate_vocab_csv.py" ]; then
    echo "어휘 데이터 마이그레이션 실행..."
    python migrate_vocab_csv.py
fi

# 백엔드 서비스 재시작
sudo systemctl restart hackersvoca-backend
echo "백엔드 서비스 재시작 완료"

echo "3. 프론트엔드 빌드..."
cd $PROJECT_DIR/frontend
npm install
npm run build

# 빌드 결과 복사
sudo cp -r dist/* $PROJECT_DIR/
echo "프론트엔드 빌드 및 복사 완료"

echo "4. Nginx 설정 검사 및 재시작..."
sudo nginx -t
if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "Nginx 재시작 완료"
else
    echo "오류: Nginx 설정에 문제가 있습니다."
    exit 1
fi

echo "5. 서비스 상태 확인..."
echo "백엔드 서비스 상태:"
sudo systemctl is-active hackersvoca-backend

echo "Nginx 서비스 상태:"
sudo systemctl is-active nginx

echo "=== 배포 완료! ==="
echo "접속 URL: https://knbada.duckdns.org/hackersvoca/"
echo "API 문서: https://knbada.duckdns.org/hackersvoca/api/docs"
