# 요구사항 ↔ 검증 매핑

`docs/PLAN.md` §7 매핑표의 각 항목이 실제로 어느 테스트에 의해 지켜지는지 적는다.
새 요구사항을 추가하면 이 표에도 줄을 추가한다. **줄을 지우려면 대응하는 테스트를 먼저
지워야 한다** — 표만 지우면 검증이 사라진 사실이 조용히 묻힌다.

## 실행 명령

```bash
npx tsc --noEmit      # 타입 오류 0건
npm run lint          # 린트 오류 0건
npm test              # Vitest (단위 + 통합, standalone mongod)
npm run e2e           # Playwright (GitHub OAuth 스텁 서버를 함께 띄운다)
npm run build         # 프로덕션 빌드
npm run metrics       # M1 / M2 / M3 출력
npm run purge         # 보관 기한 지난 문서 정리
```

## P0 요구사항

| 요구 항목 | 출처 | 검증 위치 |
|---|---|---|
| 할일 CRUD — 제목 필수 | PRD P0 | `tests/api-todos.test.ts` "제목 없이 요청하면 400 이고 DB 에 문서가 생기지 않는다", "제목이 공백뿐이어도 400" · `e2e/board.spec.ts` "제목 없이 생성하면 폼 검증 오류가 뜨고 네트워크 요청이 발생하지 않는다" |
| 할일 수정 — 인라인 | PRD P0 | `e2e/board.spec.ts` "카드 제목을 인라인으로 수정한다", "빈 제목으로 수정하면 원래 제목이 유지된다" · `tests/repo-todo.test.ts` `updateTodo` describe |
| 할일 삭제 — 소프트 삭제, 진행률 즉시 제외 | PRD P0 | `tests/repo-todo.test.ts` "조회에서 사라지지만 문서는 deletedAt 이 채워진 채 남는다" · `tests/progress.test.ts` "할일 3건 중 1건 done, 1건 소프트 삭제면 50" |
| 할일 삭제 — 30일 보관 | PRD P0 | `tests/retention.test.ts` "deletedAt 이 29일 전인 문서는 살아남는다" / "31일 전인 문서는 하드 삭제된다" / "null 인 문서는 아무리 오래돼도 삭제되지 않는다" / "경계값 하루 차이를 정확히 가른다" |
| 조회 — 일일 뷰 (오늘 기준) | PRD P0 | `tests/views.test.ts` `isInDayView` describe (10건) · `tests/repo-todo.test.ts` "오늘 마감 / 지연 미완료 / 진행 중만 모은다" · `tests/api-todos.test.ts` "view=day 가 …" |
| 조회 — 주간 뷰 (주 단위 필터) | PRD P0 | `tests/repo-todo.test.ts` `listForWeek` describe · `e2e/week.spec.ts` "다음 주 버튼이 URL 을 바꾸고 해당 주 소속 할일만 보여 준다" |
| 상태 3종 고정 / 방향 제약 없음 | PRD P0 | `tests/models.test.ts` "status 에 허용되지 않은 값을 넣으면 검증에서 걸린다" · `tests/repo-todo.test.ts` "상태 전환에 방향 제약이 없다" |
| done 전환 시 완료 시각 기록 | PRD P0 | `tests/repo-todo.test.ts` "done 으로 옮기면 completedAt 이 채워진다" / "done 에서 doing 으로 나오면 null 로 초기화" · `e2e/board.spec.ts` "done 으로 옮긴 카드에 완료 시각이 표시된다" |
| DnD 열 간 이동 = 상태 변경 | PRD P0 | `e2e/board.spec.ts` "카드를 todo 에서 doing 으로 끌면 즉시 doing 열에 나타난다" · `tests/client-optimistic.test.ts` `resolveDrop` describe |
| DnD 열 내 이동 = 순서 변경 | PRD P0 | `tests/position.test.ts` (14건) · `e2e/board.spec.ts` "같은 열 안에서 순서를 바꾸면 새로고침 후에도 유지된다" |
| 낙관적 갱신 + 실패 롤백 | PRD P0 | `e2e/board.spec.ts` "move 가 500 을 반환하면 카드가 원래 열과 자리로 되돌아가고 오류가 보인다" · `e2e/journey.spec.ts` "오프라인에서 카드를 옮기면 원위치로 롤백된다" |
| 3계층 구조 / nullable 연결 | PRD P0 | `tests/models.test.ts` "status 기본값은 todo, 나머지 nullable 필드는 null 로 저장된다" · `tests/repo-todo.test.ts` "미분류로 되돌릴 수 있다" |
| 상위 삭제 시 하위 미분류 전환 (연쇄 삭제 금지) | PRD P0 | `tests/repo-weeklyplan.test.ts` "하위 할일이 미분류로 전환되고 살아 있다" · `tests/repo-goal.test.ts` "하위 주간 계획이 미분류로 전환되고 살아 있다" / "손자 할일까지 내려가 지우지 않는다" · `e2e/week.spec.ts` "주간 계획을 삭제하면 하위 할일이 미분류로 살아남고 배지가 증가한다" · `e2e/goals.spec.ts` "목표를 삭제해도 하위 주간 계획은 미분류 목록에 살아남는다" |
| 삭제 순서 (하위 FK → 상위 deletedAt) | PLAN §3.1 | `tests/repo-weeklyplan.test.ts` "하위 FK 를 먼저 끊고 상위 deletedAt 을 나중에 쓴다" |
| 재지정 시 양쪽 진행률 재계산 | PRD P0 | `tests/repo-weeklyplan.test.ts` "할일을 A 에서 B 로 재지정하면 양쪽 진행률이 모두 새 값이 된다" · `e2e/week.spec.ts` "할일을 다른 주간 계획으로 재지정하면 양쪽 진행률이 모두 갱신된다" |
| 주간 진행률 산식 | PRD P0 / PLAN §4.1.1 | `tests/progress.test.ts` `weeklyProgress` describe (10건) |
| 연결 할일 0건이면 0% | PRD P0 | `tests/progress.test.ts` "연결 할일이 0건이면 0 을 반환한다 (NaN 아님)" · `e2e/week.spec.ts` "연결 할일이 0건인 계획은 0% 로 표시된다" |
| 1년 목표 = 하위 주간 평균 | PRD P0 / PLAN §4.1.2 | `tests/progress.test.ts` `goalProgress` describe (9건) · `tests/repo-goal.test.ts` `getGoalWithProgress` describe · `e2e/goals.spec.ts` (10건) |
| **미완료 다음 주 이월** | PRD P1 → PLAN A11 로 P0 승격 | `tests/carryover.test.ts` (15건) · `tests/repo-weeklyplan.test.ts` `carryOverBatch` describe · `e2e/carryover.spec.ts` (8건) |
| **미분류 해소 경로** | PLAN §4.6 | `tests/repo-todo.test.ts` `listInbox` describe · `e2e/week.spec.ts` "인박스에서 계획에 연결하면…" / "인박스 칩을 계획으로 끌어다 놓아도 연결된다" / "전용 인박스 화면에서도 연결할 수 있다" |
| **성공 지표 산출** | PLAN §1.5 | `tests/retention.test.ts` `성공 지표 M1 / M2 / M3` describe (6건) · `tests/api-plans-goals.test.ts` `GET /api/stats` describe |

## 설계 결정이 지켜지는지 확인하는 테스트

계획 단계에서 내린 판단은 코드가 바뀌면 조용히 무너진다. 아래 테스트들이 그 방패다.

| 결정 | 왜 위험한가 | 지키는 테스트 |
|---|---|---|
| **A5** 경과 주 기준 평균 | 전체 평균이면 미래 주를 미리 만든 사용자의 진행률이 1.9% 로 깎이고, 비어 있는 주를 빼면 100% 로 부풀려진다 | `tests/progress.test.ts` "미래 주 51개 + 경과 주 1개(100%) → 100%, 분모 1", "경과했지만 할일 0건인 주는 분모에 포함되어 0% 로 반영된다", "today 를 연말로 옮기면 PRD 원식과 값이 일치한다" · `e2e/goals.spec.ts` "미래 주간 계획을 50개 추가해도 표시 진행률이 변하지 않는다" |
| **A5** 가중 평균 미채택 | 할일을 잘게 쪼갠 주가 연간 진행률을 지배하게 된다 | `tests/progress.test.ts` "할일 1건짜리 주(100%)와 20건짜리 주(10%)의 목표 진행률은 55", "가중 평균이었다면 나왔을 값(14%)과 명확히 다르다" |
| **A8 / R12** 이월 이력 보존 | 미완료를 다음 주로 밀어내는 것만으로 지난 주가 100% 가 된다 | `tests/progress.test.ts` "이월해도 떠나온 주의 진행률이 33 그대로다", "이월된 할일을 새 주에서 완료해도 떠나온 주의 분자에는 절대 들어가지 않는다" · `e2e/carryover.spec.ts` "이월 직후 이전 주 진행률이 이월 전과 동일하다" |
| **A6** completedAt 초기화 | done 에서 나온 항목에 완료 시각이 남으면 "완료 시각" 의 의미가 무너진다 | `tests/repo-todo.test.ts` "done 에서 doing 으로 나오면 completedAt 이 null 로 초기화된다" · `e2e/board.spec.ts` "done 에서 나오면 완료 시각 표시가 사라진다" |
| **A9** 주간 뷰 = 소속 기준 | 마감일 기준으로 잡으면 마감일 없는 할일이 주간 뷰에서 통째로 사라진다 | `tests/repo-todo.test.ts` "마감일이 없어도 계획에 연결됐으면 포함된다" · `e2e/week.spec.ts` "마감일 없이 계획에만 연결된 할일이 주간 뷰에 보인다" |
| **A10** 마감일 이탈 허용 | 이월된 항목과 장기 과제가 정상적으로 불일치를 만든다. 걸러내면 사라진다 | `tests/date.test.ts` `isDueOutsideWeek` describe · `e2e/week.spec.ts` "마감일이 주 범위 밖인 소속 할일은 경고 배지와 함께 보이고 숨겨지지 않는다" |
| **R1** 연속 이동 응답 역전 | 응답 순서가 뒤바뀌면 마지막 조작이 아닌 값이 최종 상태가 된다 | `tests/client-optimistic.test.ts` `runSerial` describe (5건) · `e2e/board.spec.ts` "한 카드를 300ms 간격으로 3회 연속 옮겨도 최종 위치가 마지막 조작과 일치한다" |
| **R3** `deletedAt: null` 누락 | 삭제 항목이 진행률에 조용히 섞인다 | 리포지토리 3종 각각의 "삭제된 항목이 조회에 나타나지 않는다" 케이스 |
| **R4** 정렬 키 정밀도 소진 | 순서가 붕괴된다 | `tests/position.test.ts` "같은 지점에 반복 삽입하면 결국 리밸런스가 트리거된다", "연속 2회 실행해도 결과가 동일하다" · `tests/repo-todo.test.ts` "간격이 소진되면 리밸런스가 실제로 실행되고 순서가 보존된다" |
| **R8** standalone 트랜잭션 미지원 | replica set 을 전제하면 로컬에서 안 돈다 | `tests/repo-todo.test.ts` "테스트가 replica set 이 아닌 standalone 에서 돈다" (통합 테스트 전체가 이 환경에서 실행됨) |
| **R9** BSON Date UTC vs KST | 날짜가 하루 밀려 조회에서 누락된다 | `tests/date.test.ts` (19건) · `tests/repo-todo.test.ts` "KST 23:00 에 만든 오늘 마감 항목이 같은 날 뷰에 나타난다" |
| **R10** 스키마 드리프트 | 스키마리스 DB 에서 문서 형태가 조용히 갈라진다 | `tests/models.test.ts` `strict: 'throw'` describe · `tests/api-todos.test.ts` "스키마 외 필드를 포함하면 400" |
| **R11** HMR 커넥션 고갈 | dev 서버가 리로드마다 커넥션을 새로 만든다 | `tests/db.test.ts` "같은 프로세스에서 10회 연속 호출해도 실제 커넥션은 1개만 열린다" |
| **R15** 유령 분모 | 하드 삭제된 항목이 분모에 남는다 | `tests/retention.test.ts` `유령 분모 방지` describe (2건) |
| TTL 인덱스 미사용 | 삭제 시점을 앱이 통제하지 못하면 테스트가 비결정적이 된다 | `tests/retention.test.ts` "TTL 인덱스를 쓰지 않는다" |


## 로그인 요구사항 (docs/LOGIN.md)

`docs/LOGIN.md` 의 완료 조건 7개가 각각 어디서 지켜지는지.

| 완료 조건 | 검증 위치 |
|---|---|
| GitHub OAuth App 설정 가이드 또는 .env.example 제공 | `docs/LOGIN-SETUP.md` (App 생성 절차 + 콜백 URL + 문제 해결) · `.env.example` (CLIENT_ID/SECRET, AUTH_CALLBACK_URL, SESSION_TTL_DAYS) |
| `/auth/github`, `/auth/github/callback` 라우트 동작 | `tests/auth-routes.test.ts` "GitHub authorize 로 302 보내고 state 쿠키를 심는다", "code 를 교환하고 사용자를 저장한 뒤 세션 쿠키를 굽는다" · `e2e/auth.spec.ts` "GitHub 로그인 버튼을 누르면 콜백을 거쳐 로그인 상태가 된다" |
| 로그인 후 GitHub username, avatar_url 을 DB 에 저장 | `tests/auth-routes.test.ts` 콜백 테스트의 `User.findOne` 단언 · `tests/auth-session.test.ts` `upsertGithubUser` describe · `e2e/auth.spec.ts` 사이드바의 username/avatar 노출 확인 |
| 로그인하지 않은 사용자는 접근 불가 (401 또는 리다이렉트) | `tests/api-auth-isolation.test.ts` `미인증 요청은 401` describe (보호 API 15개 일괄) · `tests/auth-routes.test.ts` middleware describe · `e2e/auth.spec.ts` "로그인하지 않으면 보호 화면에서 로그인 페이지로 보내진다", "세션 없이 API 를 호출하면 401 이다" |
| 로그인한 사용자는 본인의 할 일만 조회/수정/삭제 | `tests/api-auth-isolation.test.ts` `사용자 간 데이터 격리` describe (목록·PATCH·DELETE·move·이월·목표 각각) · `e2e/auth.spec.ts` "다른 사용자로 로그인하면 앞 사용자의 할일이 보이지 않는다" |
| 로그아웃 시 세션 완전 삭제 | `tests/auth-session.test.ts` "destroySession 이 문서를 실제로 지운다" · `tests/auth-routes.test.ts` "세션 문서를 지우고 쿠키를 만료시킨다" · `e2e/auth.spec.ts` "로그아웃 후에는 같은 세션 쿠키로도 API 가 401 이다" |
| 만료 세션이 쌓이지 않음 | `tests/retention.test.ts` `만료 세션 정리` describe (2건). 보관 정리가 하루 한 번 함께 걷어 간다 |
| 기존 스키마에 user_id 추가 및 마이그레이션 | `models/{Todo,WeeklyPlan,Goal}.ts` 의 `userId` (required, index) · `tests/migrate-user.test.ts` (8건: 귀속, 필드 없음/null 양쪽, 기존 소유자 보존, 멱등성, dry-run, 없는 사용자, 마이그레이션 후 조회) |

### 하지 말아야 할 것 (LOGIN.md)

| 금지 사항 | 어떻게 지켰는가 |
|---|---|
| 기존 할 일 CRUD 로직 변경 금지 | 도메인 규칙(진행률 산식, 이월 의미, 소프트 삭제 순서, 정렬 키)은 손대지 않았다. 위의 "설계 결정" 표에 있는 테스트가 전부 그대로 통과한다. 바뀐 것은 조회 **범위**뿐이며, 그것은 "본인의 할 일만" 이라는 다른 완료 조건이 요구한 것이다 |
| 하드 코딩된 CLIENT_SECRET 금지 | `lib/auth/github.ts` 가 `process.env.GITHUB_CLIENT_SECRET` 만 읽고 기본값이 없다. 없으면 명확한 오류를 던진다(`tests/auth-session.test.ts`). 소스 전체 grep 으로 리터럴 부재 확인 |
| 미완성 상태로 "완료" 보고 금지 | 완료 조건마다 위 표의 테스트가 붙어 있다. 통과하지 않은 항목은 완료로 표시하지 않았다 |

### 인증 설계가 지켜지는지 확인하는 테스트

| 결정 | 왜 위험한가 | 지키는 테스트 |
|---|---|---|
| 세션 토큰은 DB 에 해시로만 저장 | DB 유출이 곧 세션 탈취가 된다 | `tests/auth-session.test.ts` "DB 에는 원문이 아니라 해시가 저장된다" |
| OAuth `state` 대조 | 남이 유도한 로그인으로 세션이 굳는다 (CSRF) | `tests/auth-routes.test.ts` "state 가 다르면 세션을 만들지 않는다", "state 쿠키가 아예 없으면 거부한다" |
| 소유자 필터를 `activeFilter` 에 강제 | 한 곳만 빠뜨려도 사용자 간 데이터 유출 | 타입 검사가 1차 방어. 실제 동작은 `tests/api-auth-isolation.test.ts` 격리 describe |
| 이월에 남의 할일 id 를 섞을 수 없음 | 소유자 확인 없이 id 목록을 믿으면 남의 문서를 옮길 수 있다 | `tests/api-auth-isolation.test.ts` "자기 할일 id 를 남의 계획 이월에 섞어 보내도 옮겨지지 않는다" |
| 쿠키 플래그 (HttpOnly / SameSite / Secure) | 스크립트가 세션을 읽거나 평문으로 새어 나간다 | `tests/auth-routes.test.ts` "state 쿠키가 HttpOnly / SameSite=Lax / Path=/ 다", "프로덕션에서는 Secure 를 붙이고 개발에서는 붙이지 않는다" |
| 지표를 사용자별로 집계 | 남의 활동이 내 지표에 섞인다 | `tests/api-auth-isolation.test.ts` "지표는 호출한 사용자 기준으로만 집계된다" |
| 로그인 화면에서 API 를 호출하지 않음 | 401 → /login 이동이 진행 중인 OAuth 콜백을 취소해 로그인이 끝나지 않는다 | `e2e/auth.spec.ts` 로그인 흐름 전체 (이 문제로 실제 실패했던 케이스) |

## 남은 수동 확인

자동화가 어렵거나 비용 대비 효용이 낮아 사람이 보는 편이 나은 것들이다.

- 다크 모드 배색 (`prefers-color-scheme: dark`)
- 좁은 화면(모바일 폭)에서의 칸반 3열 세로 배치
- 실제 사용 4주 후 §1.5 지표 목표값(70/60/15) 재조정 — PLAN §11 Q6
