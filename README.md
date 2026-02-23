#### 환경 변수 설정
```bash
# 환경 변수 파일 복사 (프로젝트 루트에서)
env.example 복사하여 backend 바로 안에 .env 생성
```

### 사전 요구사항

- Python 3.9+ (3.11추천)
- Node.js 18+
- npm 또는 yarn

### 백엔드 설정 및 실행

```bash
# 백엔드 디렉토리로 이동
cd backend

# Python 가상환경 생성
uv venv

# 의존성 설치
uv pip install -r requirements.txt

# app 디렉토리로 이동 후 서버 실행
cd app && uv run main.py
```
백엔드 서버가 http://localhost:8000 에서 실행
서버 API 확인:
Swagger UI: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc

### 프론트엔드 설정 및 실행

```bash
# 프론트엔드 디렉토리로 이동
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```
프론트엔드 서버가 http://localhost:3000 에서 실행
.