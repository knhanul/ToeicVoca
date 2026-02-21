#!/bin/bash

echo "--- 🚀 ToeicVoca 프로젝트 배포 시작 ---"

# 1. 최신 소스 가져오기
echo "📥 Git Pull 진행 중..."
git pull origin main

# 2. 백엔드 패키지 업데이트
echo "🐍 파이썬 패키지 업데이트 중..."
/var/www/ToeicVoca/.venv/bin/pip install -r requirements.txt
/var/www/ToeicVoca/.venv/bin/pip install gunicorn  # gunicorn 보장

# 3. 프론트엔드 빌드
echo "📦 프론트엔드 빌드 시작 (Vite)..."
cd frontend
npm install
npm run build
cd ..

# 4. 서비스 재시작
echo "🔄 서비스 재시작 중..."
sudo systemctl daemon-reload
sudo systemctl restart toeicvoca-backend.service
sudo systemctl restart nginx

echo "✅ 모든 배포 작업이 완료되었습니다!"
sudo systemctl status toeicvoca-backend.service --no-pager -l

