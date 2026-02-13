# 알리바바 클라우드 배포 가이드

## 1. ECS 인스턴스 생성
1. 알리바바 클라우드 콘솔 → ECS → 인스턴스 생성
2. 사양 추천:
   - OS: Ubuntu 20.04 LTS
   - CPU: 2코어 이상
   - RAM: 4GB 이상
   - 스토리지: 40GB SSD

## 2. 도메인 및 방화벽 설정
### DNS 설정
- 이미 `knbada.duckdns.org` 보유

### 보안 그룹 설정
다음 포트 열기:
- 80 (HTTP)
- 443 (HTTPS)
- 22 (SSH)

## 3. 서버 초기 설정
```bash
# SSH 접속
ssh root@your_server_ip

# 시스템 업데이트
apt update && apt upgrade -y

# 필수 패키지 설치
apt install -y python3 python3-pip python3-venv nginx postgresql postgresql-contrib git

# 프로젝트 디렉토리 생성
mkdir -p /var/www/hackersvoca
cd /var/www/hackersvoca
```

## 4. PostgreSQL 설정
```bash
# PostgreSQL 접속
sudo -u postgres psql

# 데이터베이스 및 사용자 생성
CREATE DATABASE HackersVoca;
CREATE USER voca_admin WITH PASSWORD 'posid00';
GRANT ALL PRIVILEGES ON DATABASE HackersVoca TO voca_admin;
\q

# 외부 접속 허용 설정
sudo nano /etc/postgresql/12/main/postgresql.conf
# listen_addresses = '*' 로 수정

sudo nano /etc/postgresql/12/main/pg_hba.conf
# 다음 라인 추가:
# host all all 0.0.0.0/0 md5

# PostgreSQL 재시작
sudo systemctl restart postgresql
```

## 5. 프로젝트 배포
```bash
# Git 클론
git clone <your-repo-url> .

# 백엔드 설정
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 환경 변수 설정
cp .env.example .env
nano .env
# 다음 내용으로 수정:
DB_HOST=localhost
DB_PORT=5432
DB_USER=voca_admin
DB_PASSWORD=posid00
DB_NAME=HackersVoca

# 데이터베이스 초기화
python init_db.py
python migrate_vocab_csv.py

# 백엔드 서비스 파일 생성
sudo nano /etc/systemd/system/hackersvoca-backend.service
```

## 6. 백엔드 서비스 설정
```ini
[Unit]
Description=HackersVoca Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/hackersvoca/backend
Environment=PATH=/var/www/hackersvoca/backend/venv/bin
ExecStart=/var/www/hackersvoca/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 4000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# 서비스 시작
sudo systemctl daemon-reload
sudo systemctl enable hackersvoca-backend
sudo systemctl start hackersvoca-backend
```

## 7. 프론트엔드 빌드
```bash
# 프론트엔드 빌드
cd /var/www/hackersvoca/frontend
npm install
npm run build

# 빌드 결과를 Nginx 디렉토리로 복사
sudo cp -r dist/* /var/www/hackersvoca/
```

## 8. Nginx 설정
```bash
# Nginx 설정 파일 생성
sudo nano /etc/nginx/sites-available/hackersvoca
```

```nginx
server {
    listen 80;
    server_name knbada.duckdns.org;

    # 프론트엔드 정적 파일
    location /hackersvoca/ {
        alias /var/www/hackersvoca/;
        try_files $uri $uri/ /hackersvoca/index.html;
        
        # 정적 파일 캐싱
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API 프록시
    location /hackersvoca/api/ {
        proxy_pass http://localhost:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 지원 (필요시)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# 사이트 활성화
sudo ln -s /etc/nginx/sites-available/hackersvoca /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 9. SSL 인증서 설치 (Let's Encrypt)
```bash
# Certbot 설치
sudo apt install certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d knbada.duckdns.org

# 자동 갱신 설정
sudo crontab -e
# 다음 라인 추가:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 10. 배포 스크립트
```bash
# deploy.sh 파일 생성
nano /var/www/hackersvoca/deploy.sh
```

```bash
#!/bin/bash
set -e

echo "배포 시작..."

# 백엔드 재시작
cd /var/www/hackersvoca/backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart hackersvoca-backend

# 프론트엔드 빌드
cd /var/www/hackersvoca/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/hackersvoca/

# Nginx 재시작
sudo nginx -t && sudo systemctl reload nginx

echo "배포 완료!"
```

```bash
# 실행 권한 부여
chmod +x /var/www/hackersvoca/deploy.sh
```

## 11. 모니터링 설정
```bash
# 로그 모니터링
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u hackersvoca-backend -f

# 서비스 상태 확인
sudo systemctl status hackersvoca-backend
sudo systemctl status nginx
```

## 12. 접속 확인
- 메인: https://knbada.duckdns.org/hackersvoca/
- API 문서: https://knbada.duckdns.org/hackersvoca/api/docs

## 13. 문제 해결
### 포트 충돌 시
```bash
# 포트 사용 확인
sudo netstat -tlnp | grep :4000

# 프로세스 종료
sudo kill -9 <PID>
```

### 데이터베이스 연결 오류 시
```bash
# PostgreSQL 상태 확인
sudo systemctl status postgresql

# 연결 테스트
psql -h localhost -U voca_admin -d HackersVoca
```

### 권한 문제 시
```bash
# 파일 권한 설정
sudo chown -R www-data:www-data /var/www/hackersvoca
sudo chmod -R 755 /var/www/hackersvoca
```

## 14. 백업 설정
```bash
# 데이터베이스 백업 스크립트
nano /var/www/hackersvoca/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/hackersvoca"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 데이터베이스 백업
pg_dump -h localhost -U voca_admin HackersVoca > $BACKUP_DIR/db_backup_$DATE.sql

# 7일 이전 백업 삭제
find $BACKUP_DIR -name "db_backup_*.sql" -mtime +7 -delete

echo "백업 완료: $BACKUP_DIR/db_backup_$DATE.sql"
```

```bash
# 크론에 등록 (매일 새벽 3시)
sudo crontab -e
# 다음 라인 추가:
# 0 3 * * * /var/www/hackersvoca/backup.sh
```
