#!/bin/bash
set -e

# 변수 설정
BACKUP_DIR="/var/backups/hackersvoca"
PROJECT_DIR="/var/www/hackersvoca"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# 백업 디렉토리 생성
mkdir -p $BACKUP_DIR

echo "=== HackersVoca 백업 시작: $DATE ==="

# 1. 데이터베이스 백업
echo "1. 데이터베이스 백업..."
if command -v pg_dump &> /dev/null; then
    pg_dump -h localhost -U voca_admin -d HackersVoca | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz
    echo "데이터베이스 백업 완료: $BACKUP_DIR/db_backup_$DATE.sql.gz"
else
    echo "오류: pg_dump를 찾을 수 없습니다."
    exit 1
fi

# 2. 설정 파일 백업
echo "2. 설정 파일 백업..."
tar -czf $BACKUP_DIR/config_backup_$DATE.tar.gz \
    $PROJECT_DIR/backend/.env \
    /etc/nginx/sites-available/hackersvoca \
    /etc/systemd/system/hackersvoca-backend.service \
    2>/dev/null || echo "일부 설정 파일이 없어 건너뜁니다."

# 3. 오래된 백업 삭제
echo "3. 오래된 백업 정리 ($RETENTION_DAYS일 이전)..."
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "config_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

# 4. 백업 목록 표시
echo "4. 현재 백업 목록:"
ls -lh $BACKUP_DIR/

echo "=== 백업 완료 ==="
echo "백업 디렉토리: $BACKUP_DIR"
echo "보관 기간: $RETENTION_DAYS일"
