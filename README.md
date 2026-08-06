# 위례아이편한지도

## 구조
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind CSS
- `backend/` — Spring Boot 4.1 (Gradle, Java 21) + Spring Web, Spring Data JPA, Validation, Lombok, H2(dev)

## 실행

### 프론트엔드
```
cd frontend
npm run dev
```
http://localhost:3000

### 백엔드
```
cd backend
./gradlew bootRun
```
http://localhost:8080 (헬스체크: `/api/health`)
