## 참고문서

* PRD: docs/PRD.md
* 구현 계획: docs/PLAN.md
* 요구사항 ↔ 검증 매핑: docs/VERIFICATION.md
* 남은 P1 백로그: docs/BACKLOG.md
* 로그인 설정 절차: docs/LOGIN-SETUP.md
* 로그인 요구사항: docs/LOGIN.md

작업 전 반드시 위 문서를 읽고 시작할 것.
**설계 결정을 건드리기 전에는 docs/VERIFICATION.md 의 "설계 결정이 지켜지는지 확인하는
테스트" 표를 먼저 볼 것.** 그 표의 테스트가 깨지면 결정이 무너진 것이지 테스트가 낡은 게 아니다.

---

## 명령어

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 (기본 3000 포트) |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 결과 실행 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (단위 + 통합). `mongodb-memory-server` 로 실제 mongod 를 띄운다 |
| `npm run e2e` | Playwright E2E. `todo-e2e` 데이터베이스를 쓴다 |
| `npm run purge` | 소프트 삭제 30일 경과 문서 하드 삭제 |
| `npm run metrics` | 성공 지표 M1/M2/M3 출력. 사용자가 여럿이면 `-- <username>` 필요 |
| `npm run migrate:user -- <username>` | 로그인 도입 전 데이터를 그 사용자에게 귀속 (`--dry-run` 지원) |

## 데이터베이스

`MONGODB_URI` 가 설정돼 있으면 그것을 쓰고, 없으면 `mongodb-memory-server` 가
`127.0.0.1:27017` 에 실제 mongod 를 띄운다. 데이터는 `.mongo-data/` 에 영속 저장되므로
재시작해도 남는다. **MongoDB 를 따로 설치할 필요가 없다.**

이미 그 포트가 열려 있으면 새로 띄우지 않고 그 인스턴스에 붙는다 (dev 서버와 스크립트
동시 실행 시 dbPath 잠금 충돌 방지). 포트는 `MONGO_LOCAL_PORT` 로 바꿀 수 있다.

> 테스트는 27017 을 직접 잡지 않는다. dev 서버가 떠 있으면 EADDRINUSE 로 깨지기 때문에,
> 빈 포트를 확보해 `MONGO_LOCAL_PORT` 로 주입한다 (`tests/db.test.ts`).

standalone 모드다. `docs/PLAN.md` §3.1 에 따라 이 앱은 **트랜잭션을 쓰지 않는다.**
다중 문서 갱신은 단일 문서 원자성, 실패해도 양성인 순서, 멱등 `bulkWrite` 로 처리한다.

## 디렉터리 구조

```
app/          Next.js App Router. UI 라우트와 app/api/**/route.ts (API Routes)
components/   프레젠테이션 컴포넌트
hooks/        TanStack Query 뮤테이션 훅
lib/          도메인 규칙 (순수 함수) + 리포지토리 + DB 연결
models/       Mongoose 스키마 3종과 공용 타입
tests/        Vitest 단위/통합 테스트
e2e/          Playwright E2E
scripts/      purge / metrics 실행 스크립트
docs/         PRD, PLAN, BACKLOG
```

## 컨벤션

**날짜** — `new Date()` 를 컴포넌트와 라우트 핸들러에서 직접 호출하지 않는다.
모든 날짜 연산은 `lib/date.ts` 를 거친다. 저장되는 날짜 필드(`dueDate`, `weekStart`,
`startDate`, `endDate`)는 반드시 `toKstDateOnly()` 를 통과시킨다. MongoDB 는 BSON Date 를
UTC 로 저장하므로 정규화 없이 넣으면 KST 기준 하루가 밀린다 (PLAN R9).

**주 범위 조회** — 항상 반열린 구간 `$gte: start, $lt: end` 를 쓴다.
`$lte: 일요일 23:59:59.999` 는 밀리초 경계 버그를 만든다.

**소프트 삭제** — 모든 조회에 `deletedAt: null` 필터를 적용한다. 공용 `activeFilter()`
헬퍼를 쓰고 직접 조건을 쓰지 않는다 (PLAN R3). 상위 삭제 시 **하위 FK 를 먼저 null 로
바꾸고 그 다음** 상위 `deletedAt` 을 쓴다. 순서가 반대면 중간 실패 시 고아가 생긴다.

**진행률** — 저장하지 않고 조회 시 계산한다 (A4). "재계산"은 곧 쿼리 캐시 무효화다.

**이월 vs 재지정** — 겉보기에 같지만 진행률 의미가 정반대다. 이월은 `carriedFrom` 에
떠나온 주를 누적해 그 주의 분모를 유지한다. 일반 재지정(`updateTodo`)은 `carriedFrom` 을
절대 건드리지 않는다 (PLAN §4.5, R12).

**스키마** — 모든 Mongoose 스키마는 `{ strict: 'throw', timestamps: true }`.
API 경계에서는 Zod 로 한 번 더 검증한다.

**직렬화** — 라우트 핸들러 응답은 반드시 `lib/serialize.ts` 를 경유한다.
`_id: ObjectId` → `id: string`, `Date` → ISO 문자열.

## 인증과 소유권

**모든 데이터는 사용자별로 격리된다.** 로그인 없이는 어떤 API 도 열리지 않는다.

### 세션

GitHub OAuth 2.0 authorization code 흐름을 직접 구현했다 (NextAuth 미사용).
명세가 지정한 경로가 `/auth/github`, `/auth/github/callback` 이라 NextAuth 규약과 다르고,
흐름 자체가 HTTP 세 번이라 직접 쓰는 편이 짧다.

세션은 **서버에 저장한다** (`sessions` 컬렉션). 쿠키에는 32바이트 난수 토큰만 담고
DB 에는 그 SHA-256 해시만 둔다.

> stateless JWT 를 쓰지 않은 이유: `docs/LOGIN.md` 가 "로그아웃 시 세션 완전 삭제" 를
> 요구한다. JWT 는 쿠키를 지워도 토큰이 만료까지 유효하므로 그 조건을 만족할 수 없다.

### 소유권 필터 — 새 쿼리를 쓸 때 반드시 볼 것

`activeFilter(ownerId, extra)` 가 **소유자를 필수 인자로** 받는다. 모델을 직접 조회하지
말고 항상 이 함수를 거친다.

```ts
// 좋음
Todo.find(activeFilter(ownerId, { status: 'doing' }))

// 나쁨 — 남의 데이터가 섞인다
Todo.find({ deletedAt: null, status: 'doing' })
```

소유자를 인자로 강제한 이유는 **누락을 타입 검사가 잡게 하려는 것**이다. 실제로 이 방식으로
바꾸자 컴파일러가 33곳을 짚어 줬다. AsyncLocalStorage 같은 암묵적 전달은 한 군데만
빠뜨려도 사용자 간 데이터 유출이 되는데, 그건 사람이 잡을 수 있는 종류의 실수가 아니다.

예외는 `lib/retention.ts` 의 보관 정리 하나다. 전역 유지보수라 소유자와 무관하다.

### 라우트

보호된 API 는 첫 줄에서 `requireUser(request)` 를 부르고, 그 `user.id` 를 리포지토리에
넘긴다. 세션이 없거나 만료·위조됐으면 `UnauthorizedError` 가 나고 `handleError` 가 401 로
바꾼다. `/api/health` 만 인증 없이 열려 있다.

`middleware.ts` 는 화면 접근을 로그인으로 안내할 뿐 **보안 경계가 아니다.** Edge 런타임이라
MongoDB 를 조회할 수 없어 쿠키 유무만 본다. 실제 검증은 언제나 라우트 핸들러가 한다.

### Edge 런타임 주의

`middleware.ts` 는 Edge 에서 돈다. `node:crypto` 나 mongoose 를 끌고 오는 모듈을
임포트하면 빌드가 깨진다. 쿠키 이름 같은 상수는 `lib/auth/constants.ts` 에 두고
거기서 가져온다.

### 호스트가 갈리면 로그인이 안 된다

`request.url` 을 그대로 쓰면 안 된다. 개발 서버는 `127.0.0.1` 로 접속해도 `request.url` 이
`localhost` 로 나오는데, 쿠키는 호스트가 다르면 공유되지 않는다. 그러면 state 쿠키를 심은
호스트와 콜백이 도착한 호스트가 갈려 CSRF 검사가 **항상** 실패한다.
`appOrigin(request)` 가 `Host` / `x-forwarded-host` 를 보고 실제 주소를 만든다.

### 로그인 화면에서는 API 를 두드리지 않는다

`Sidebar` 는 `/login` 과 `/auth/*` 에서 렌더되지 않고 쿼리도 끄고 있다. 그러지 않으면
401 이 나고, 클라이언트의 "401 이면 /login 으로" 처리가 **진행 중인 OAuth 콜백 내비게이션을
취소한다** (ERR_ABORTED). 실제로 그 이유로 로그인이 끝나지 않는 버그가 있었다.
같은 이유로 `lib/client/api.ts` 의 401 리다이렉트는 `/login` · `/auth` 경로에서 건너뛴다.

## 화면

| 경로 | 내용 |
|---|---|
| `/login` | 로그인. 인증 없이 열리는 유일한 화면 |
| `/` | 대시보드. 오늘 할 일(일일 뷰) + 주간·목표 요약 + 지표 |
| `/todos` | 전체 보드. 주 구분 없이 모든 활성 할일을 3열 칸반으로 |
| `/week` | 이번 주로 리다이렉트 |
| `/week/[weekStart]` | 주간 뷰. 주간 계획별 진행률, 그 주 칸반, 이월돼 나간 할일, 미분류 섹션 |
| `/goals` | 1년 목표 목록 + 미분류 주간 계획 |
| `/goals/[id]` | 목표 상세. 계획별 진행률 / 할일 건수 / 집계 대상 여부 |
| `/inbox` | 미분류 전용 뷰 |

## 보관 정리가 도는 시점

상시 구동 서버가 없으므로 스케줄러 대신 **지연 정리**를 쓴다.
`connectDb()` 가 프로세스에서 처음 연결에 성공한 직후 `runDailyMaintenance()` 를
기다리지 않고 태운다. 실제 삭제 여부는 `maintenance` 컬렉션의 마지막 실행 시각으로
다시 걸러 **KST 기준 하루 한 번만** 수행한다. 실패해도 앱 동작을 막지 않는다.

`NODE_ENV=test` 에서는 건너뛴다. 테스트가 자기 데이터를 스스로 통제해야 하기 때문이다.

이때 **만료된 세션도 함께 지운다.** 세션은 접근할 때마다 하나씩 정리되지만
다시 찾아오지 않는 세션은 그대로 남기 때문에, 아무도 부르지 않으면 영영 쌓인다.

TTL 인덱스는 쓰지 않는다. 삭제 시점을 앱이 통제할 수 없고 테스트에서 결정론적으로
검증할 수 없다.

## mongod 를 띄운 프로세스는 정상 종료시킬 것

`MONGODB_URI` 없이 실행하면 이 프로세스가 mongod 의 주인이 된다. `process.exit()` 로
급하게 끝내면 아직 기록되지 않은 쓰기가 사라진다. 실제로 그렇게 데이터를 잃은 적이 있다.
`lib/mongo-uri.ts` 가 SIGINT/SIGTERM/beforeExit 훅을 걸어 두지만, 스크립트를 새로 만들 때는
종료 전에 `await stopLocalMongo()` 를 직접 호출할 것.

## E2E 드래그를 새로 짤 때

`@dnd-kit` 은 Playwright 로 몰기 까다롭다. `e2e/helpers.ts` 의 `dragCard` / `dragTo` 를
쓰고, 새로 만들지 말 것. 다섯 가지를 이미 처리해 뒀다.

1. 드래그 리스너는 **손잡이 버튼**에만 붙어 있다. 카드 본문에서 끌면 아무 일도 없다
2. 낙관적 갱신 탓에 DOM 단언은 즉시 통과한다. 그 상태로 `reload()` 하면 진행 중인 요청이
   끊겨 "저장 안 됨" 처럼 보인다 → `withMoveSettled` / `withApiSettled` 로 응답을 기다린다.
   드래그뿐 아니라 셀렉트 변경 같은 모든 저장에 해당한다
3. `page.mouse` 는 뷰포트 좌표, `boundingBox()` 는 문서 좌표다
4. dnd-kit 은 뷰포트 가장자리에서 **자동 스크롤**한다. 드래그 도중 페이지가 움직이면
   미리 읽어 둔 좌표가 전부 어긋난다 → 조작 대상을 화면 중앙으로 올리고 시작한다
5. 충돌 판정이 보는 것은 포인터가 아니라 **끌려가는 사각형의 중심**이다. 손잡이가 카드
   위쪽에 있으므로 이동량은 카드 사각형 기준으로 계산해야 한다

그리고 `evaluateAll` · `allTextContents` 처럼 **여러 요소를 한 번에 읽는 메서드는
자동 대기를 하지 않는다.** 새로고침이나 화면 전환 직후에 쓰면
아직 비어 있는 DOM 을 읽는다. `expect.poll(() => ...evaluateAll(...))` 로 감쌀 것.

E2E 는 매 테스트 시작에 `loginAs(page)` 로 로그인한다 (모든 API 가 인증을 요구한다).
GitHub 대신 `scripts/github-oauth-stub.mjs` 가 응답하며, Playwright 가 webServer 로
함께 띄운다. 다른 사용자로 로그인하려면 `loginAs(page, 'bob', 3002)` 처럼 넘긴다.
