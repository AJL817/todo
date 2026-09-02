현재 할일 앱에 Github 0Auth 로그인을 추가해 줘.
##완료 조건 (Acceptance Criteria)
- [] Github 0Auth App 설정 가이드 또는 .env.example 제공
- [] /auth/github, /auth/github/callback 라우트 동작
- [] 로그인 후 Github username, avatar_url을 DB에 저장
- [] 로그인하지 않은 사용자는 할 일 목록에 접근 불가 (401 또는 리다이렉트)
- [] 로그인한 사용자는 본인의 할 일만 조회/수정/삭제 가능
- [] 로그아웃 시 세션 완전 삭제
- [] 기존 할 일 데이터 스키마에 user_id 컬럼 추가 및 마이그레이션

## 하지 말아야 할 것
-기존 할 일 CRUD 로직 변경 금지
-하드 코딩된 CLIENT_SECRET 금지
-미완성 상태로 "완료"라고 보고하지 말 것