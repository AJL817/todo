# 프로젝트 계획 — 목표 연동 칸반 투두

> **상태: approved (실행 승인됨) — 2026-09-01 Ralph 세션에서 사용자 승인**
> 이 문서는 `docs/PRD.md` 기반의 실행 계획입니다.
> 작성일: 2026-09-01 · 최종 수정: 2026-09-01 (PM 리뷰 반영: 이월 P0 승격, 미분류 인박스 추가, 주간 뷰 기준 확정, 성공 지표 신설)

---

## 0. 결정 사항

### 0.1 확정된 결정

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| A1 | 기술 스택 | Next.js 15 (App Router) + TypeScript + **MongoDB** + **Next.js API Routes** | 사용자 지정 |
| A2 | 주 시작 요일 | 월요일 (ISO-8601) | 한국 주간 계획 관행 |
| A3 | 타임존 | `Asia/Seoul` 고정 | PRD §Who "1인 사용 기준" |
| A4 | 진행률 저장 방식 | 저장하지 않고 **조회 시 계산** | PRD의 "즉시 재계산" 요구를 만족하면서 데이터 드리프트 원천 차단 |
| A5 | 1년 목표 진행률 | **경과 주 기준, 주 단위 단순 평균** (§4.1.2) | §0.2 |
| A6 | `completedAt` | done → 다른 상태로 나가면 `null`로 초기화 | "완료 시각"의 의미 일관성 유지 |
| A7 | 배포 | 로컬 실행(`next start`)만. 호스팅 미포함 | PRD에 배포 요구 없음 |
| **A8** | **이월 모델** | **문서 1개를 새 주로 이동하되, 떠난 주의 분모에는 이력으로 남김** (§4.5) | 미완료를 밀어내면 지난 주가 100%가 되는 문제를 차단 |
| **A9** | **주간 뷰의 기준** | **주간 계획 소속(`weeklyPlanId`) 기준. 마감일 기준 아님** | 마감일 기준으로 잡으면 계획에 연결됐지만 마감일이 없는 할일이 주간 뷰에서 사라짐 |
| **A10** | **마감일과 주간 계획 기간 불일치** | **차단하지 않고 허용, UI에 경고 배지만 표시** | 이월된 할일과 장기 과제가 정상적으로 불일치를 만듦 |
| **A11** | **이월 범위** | **P0.** PRD는 P1로 뒀으나 User Flow의 정규 흐름에 포함돼 있음 | §0.3 |

### 0.2 A5 결정 근거 — 왜 "경과 주 기준"이고, 왜 여전히 "단순 평균"인가

PRD 문구는 "하위 주간 계획 진행률의 **평균값**"입니다. 이를 문자 그대로 전체 주간 계획에 적용하면 문제가 생깁니다.

> 1년 목표에 52주 계획을 미리 만들어 두고 1주차를 100% 끝내면 → `100/52 ≈ 1.9%`

반대로 "할일이 있는 계획만 평균"으로 바꾸면 정반대로 왜곡됩니다.

> 52주 중 1주차만 채우고 끝내면 → `100%` (1년 목표가 다 됐다고 표시)

**채택안**: 평균 산식은 PRD 그대로 두고, **분모에 들어갈 자격**만 정의합니다.

```
집계 대상 = deletedAt === null
            AND ( weekStart <= 이번 주 월요일   // 이미 도래한 주
                  OR doneCount > 0 )            // 미리 끝낸 주는 즉시 인정
```

이 정의를 고른 이유:

1. **PRD 문구를 바꾸지 않습니다.** 여전히 "하위 주간 계획 진행률의 평균"이고, 분모 자격 조건만 추가된 형태입니다.
2. **미래를 미리 계획했다고 오늘의 성과가 깎이지 않습니다.** 아직 오지 않은 주는 실패가 아니므로 0%로 세지 않습니다.
3. **경과했는데 비어 있는 주는 0%로 정직하게 반영됩니다.** 계획만 세우고 실행하지 않은 주를 분모에서 빼주지 않기 때문에, 100% 왜곡도 생기지 않습니다.
4. **연말에 PRD 원식과 정확히 일치합니다.** 시간이 지나면 모든 주가 "경과"가 되므로 분모가 전체 주간 계획으로 수렴합니다.
5. 구현 비용은 필터 술어 하나이고 순수 함수로 테스트 가능합니다.

**할일 건수 가중 평균은 채택하지 않습니다.** 검토했으나 부작용이 더 큽니다.

> 가중 평균을 쓰면, 할일을 잘게 쪼갠 주가 목표 진행률을 지배합니다. 20건짜리 주 하나가 나머지 51주를 덮어버리는 구조가 되어, 사용자가 "카드를 몇 개로 쪼갰는가"라는 무의미한 변수에 연간 진행률이 좌우됩니다.

주간 계획은 성과의 단위가 아니라 **시간의 단위**입니다. 각 주는 1년에서 동등한 지분을 갖는 것이 맞고, 그 주 안에서 몇 건으로 쪼갰는지는 목표 기여도와 무관하다고 봅니다.

다만 이 결정에는 남은 약점이 있습니다. **할일 1건짜리 주간 계획을 만들어 그것만 끝내면 그 주가 100%로 잡힙니다.** 이는 산식으로 막을 수 없는 종류의 문제(사용자가 스스로를 속이는 경우)라 판단해, 차단 대신 **관측**으로 대응합니다. §1.5 M2 지표와 R14를 참조하십시오.

**투명성 보완**: 숫자만 보면 분모를 알 수 없으므로, UI에 항상 `62% (경과 8주 기준)`처럼 분모를 함께 노출합니다.

### 0.3 A11 결정 근거 — 이월을 왜 P0로 올리는가

PRD는 이월을 P1로 두었지만, 같은 PRD §3 User Flow의 주간 단계에는 "미완료 할일 다음 주로 이월 처리"가 정규 흐름으로 들어가 있습니다. 이 상태로 P0만 구현하면 다음이 발생합니다.

- 지난 주의 미완료 할일이 지난 주 계획에 영구히 붙어 있게 됩니다. 그 주 진행률은 영원히 100%에 도달하지 못하고, 목표 진행률의 평균값을 계속 끌어내립니다.
- 사용자가 이를 우회하는 방법은 "지난 주 할일을 지우고 이번 주에 다시 만드는 것"뿐인데, 이는 소프트 삭제로 분모에서 빠지므로 **지난 주가 100%로 올라갑니다.** 즉 이월 기능이 없으면 사용자가 자연스럽게 데이터를 왜곡하는 경로로 유도됩니다.

따라서 이월은 편의 기능이 아니라 진행률 산식의 정합성을 지키는 P0 기능입니다. 대신 다른 P1 항목은 그대로 백로그에 둡니다.

---

## 1. 요구사항 요약

`docs/PRD.md`의 P0 범위 전부와, P1 중 이월(A11)을 구현합니다. 나머지 P1은 백로그로 남깁니다.

**3계층 구조**: 1년 목표 → 주간 계획 → 할일. 상위 연결은 모두 **선택(nullable)**이며, 상위 삭제 시 하위는 연쇄 삭제되지 않고 **미분류로 전환**됩니다.

**핵심 상호작용**: todo/doing/done 3열 칸반. 드래그 앤 드롭으로 열 간 이동(상태 변경)과 열 내 이동(순서 변경). 드롭 즉시 낙관적 갱신, 서버 실패 시 원위치 롤백.

**핵심 산출**: 주간 진행률은 자동 계산(수동 입력 없음), 1년 목표 진행률은 경과 주 기준 평균(§4.1.2).

**범위 외**: 협업/멀티유저, 인증, 알림, 모바일 네이티브 앱.

### 1.5 성공 지표

이 앱이 제 역할을 하는지 판단할 기준이 없으면 P0와 P1의 경계도 검증할 수 없습니다. 1인용 로컬 앱이므로 행동 분석 인프라는 두지 않고, **DB 질의만으로 산출 가능한 지표 3개**로 한정합니다. 산출은 `GET /api/stats`와 `npm run metrics` 두 경로로 제공합니다.

| ID | 지표 | 정의 | 목표 | 무엇을 감시하는가 |
|---|---|---|---|---|
| **M1** | 주간 계획 연결률 | 활성 할일 중 `weeklyPlanId !== null` 비율 | **≥ 70%** | 미분류 적체. 이 값이 낮으면 "할일과 목표를 잇는다"는 제품 목적 자체가 작동하지 않는 것 |
| **M2** | 주간 실행률 | 경과 주간 계획 중 진행률이 1% 이상인 주의 비율 | **≥ 60%** | 계획만 세우고 방치한 주. §0.2가 남긴 약점(1건짜리 주로 진행률 부풀리기)의 대리 관측 지표이기도 함 |
| **M3** | 이월 적체율 | 활성 할일 중 `carriedFrom.length >= 2`인 비율 | **≤ 15%** | 이월이 "다음 주로 미루기" 습관으로 굳는 상태 |

측정 시점은 Phase 8의 수동 확인 절차와, 이후 주 1회 `npm run metrics` 실행입니다. 세 지표 모두 목표값을 상당 기간 밑돌면 P1 우선순위를 재조정합니다. 예를 들어 M1이 낮으면 태그, 우선순위보다 **할일 생성 시 주간 계획 기본값 자동 제안**이 먼저입니다.

> 재방문율, DnD 사용 비율 같은 행동 지표는 이벤트 로깅이 필요해 이번 범위에서 제외합니다. 1인 사용 기준에서는 표본이 너무 작아 의미 있는 신호가 나오기도 어렵습니다.

---

## 2. 기술 스택

| 계층 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 15 App Router + TypeScript (`strict`) | 사용자 지정 |
| API | **Next.js API Routes** (`app/api/**/route.ts`) | 사용자 지정. 서버 액션 미사용 |
| DB | **MongoDB** | 사용자 지정 |
| ODM | **Mongoose 8** | 스키마 검증 + TS 타입 + `ref`/`populate`. 스키마리스 드리프트 방지(R10) |
| 요청 검증 | Zod | API 경계에서 입력 검증, 라우트 핸들러와 클라이언트가 타입 공유 |
| 서버 통신 | TanStack Query v5 + `fetch` | 낙관적 업데이트와 롤백(`onMutate`/`onError`)이 PRD 요구와 1:1 대응 |
| DnD | `@dnd-kit/core` + `@dnd-kit/sortable` | 열 간 이동과 열 내 정렬을 한 라이브러리로 처리, 키보드 접근성 내장(P1 대비) |
| 스타일 | Tailwind CSS | — |
| 테스트 | Vitest + `mongodb-memory-server` (단위/통합), Playwright (E2E) | 통합 테스트를 실제 MongoDB 인스턴스에서 케이스별 격리 실행 |

**Mongoose를 고른 이유**: Prisma도 MongoDB 커넥터를 제공하지만, 이 앱은 `goalId`와 `weeklyPlanId`가 nullable이고 "상위 삭제 시 null 전환"이 핵심 규칙입니다. Mongoose의 명시적 `ref`와 수동 `updateMany`가 이 규칙을 코드에 그대로 드러내는 반면, Prisma는 MongoDB에서 `onDelete: SetNull`을 지원하지 않아 어차피 수동 처리가 필요합니다. 추상화 이득이 없습니다.

---

## 3. 도메인 모델

### 3.0 컬렉션 설계

**할일을 주간 계획에 임베드하지 않고 별도 컬렉션 + 참조로 둡니다.** 근거:

- 할일은 주간 계획에 **연결되지 않은 상태(`weeklyPlanId: null`)로 존재**해야 합니다 (PRD §P0 "미연결 상태 허용"). 임베드 모델에는 이 항목이 놓일 자리가 없습니다.
- 일일 뷰는 주간 계획 경계를 가로질러 조회합니다 (§4.4). 임베드하면 전체 스캔이 필요합니다.
- 재지정과 이월이 빈번합니다. 임베드 모델에서는 문서 간 이동(삭제 후 삽입)이 됩니다.

세 컬렉션: `goals`, `weeklyplans`, `todos`.

### 3.1 다중 문서 원자성 — 트랜잭션이 필요한가

MongoDB 트랜잭션은 **replica set에서만** 동작합니다. standalone `mongod`에서는 실패합니다. 이 앱의 다중 쓰기 연산을 검토한 결과 **트랜잭션 없이 전부 안전하게 설계할 수 있습니다**.

| 연산 | 쓰기 범위 | 트랜잭션 필요? |
|---|---|---|
| `moveTodo` (상태 + position + completedAt) | **단일 문서** | **불필요.** MongoDB는 단일 문서 갱신이 원자적. `updateOne` 한 번으로 처리 |
| 소프트 삭제(목표/주간 계획) + 하위 FK null 전환 | 2개 컬렉션 | **불필요.** 하위 FK를 **먼저** null로 만들고 상위 `deletedAt`을 **나중에** 씀. 중간 실패 시 하위는 이미 미분류 상태로 살아 있음. 이는 PRD가 요구하는 최종 상태와 동일하므로 실패 모드가 양성 |
| position 리밸런스 | 1개 컬렉션 N개 문서 | **불필요.** `bulkWrite` 사용. 리밸런스는 멱등이고, 부분 적용되어도 순서 역전만 일시 발생하며 재실행으로 복구 |
| **일괄 이월** | **1개 컬렉션 N개 문서** | **불필요.** 할일별 갱신이 서로 독립이고 멱등(§4.5). 부분 적용되면 일부만 이월된 상태로 남고, 재실행으로 나머지가 처리됨 |

**결론**: replica set을 필수 전제로 두지 않습니다. Atlas를 쓰면 자동으로 replica set이므로 나중에 필요하면 트랜잭션을 쓸 수 있지만, 로컬 standalone `mongod`에서도 모든 기능이 동작해야 합니다. Phase 1 통합 테스트에서 standalone 모드로 검증합니다.

### 3.2 스키마

`models/Goal.ts`, `models/WeeklyPlan.ts`, `models/Todo.ts`:

```ts
// Goal
{
  _id: ObjectId,
  title: String,              // required
  year: Number,               // required
  startDate: Date,            // KST 자정 정규화 (§4.2)
  endDate: Date,              // KST 자정 정규화
  description: String | null,
  createdAt: Date, updatedAt: Date,   // timestamps: true
  deletedAt: Date | null,     // default null
}
// index: { deletedAt: 1, year: 1 }

// WeeklyPlan
{
  _id: ObjectId,
  title: String,              // required
  weekStart: Date,            // 항상 월요일 KST 자정. required
  goalId: ObjectId | null,    // ref 'Goal', default null = 미분류
  createdAt: Date, updatedAt: Date,
  deletedAt: Date | null,
}
// index: { deletedAt: 1, weekStart: 1 }, { goalId: 1 }

// Todo
{
  _id: ObjectId,
  title: String,              // required
  dueDate: Date | null,       // KST 자정 정규화
  status: 'todo' | 'doing' | 'done',   // enum, default 'todo'
  position: Number,           // Double. 열 내 정렬 키
  weeklyPlanId: ObjectId | null,  // ref 'WeeklyPlan', default null = 미분류
  carriedFrom: [ObjectId],    // ref 'WeeklyPlan'. 이월돼 떠나온 주들. default [] (A8)
  completedAt: Date | null,
  createdAt: Date, updatedAt: Date,
  deletedAt: Date | null,
}
// index: { deletedAt: 1, status: 1, position: 1 }, { weeklyPlanId: 1 },
//        { dueDate: 1 }, { carriedFrom: 1 }
```

**설계 결정**

- 모든 스키마에 `{ strict: 'throw', timestamps: true }`. 스키마에 없는 필드를 쓰려 하면 예외 발생 (R10)
- `status`는 Mongoose `enum`과 TS 유니온 타입(`type TodoStatus = 'todo' | 'doing' | 'done'`) 양쪽에서 강제
- `position`은 `Number`(BSON Double). 정수 인덱스는 카드 1개 삽입에 열 전체 UPDATE 필요
- `carriedFrom`은 배열이고 **순서가 이월 순서**입니다. `length`가 곧 이월 횟수이므로 M3 지표를 별도 필드 없이 산출할 수 있습니다
- **API 응답 DTO 계층 필수**: `_id: ObjectId` → `id: string`, `Date` → ISO 문자열로 직렬화. `lib/serialize.ts`에 단일 변환 함수를 두고 라우트 핸들러가 반드시 경유

---

## 4. 핵심 규칙 명세

구현 전 이 다섯을 순수 함수로 먼저 확정합니다. 전부 DB 없이 단위 테스트 가능해야 합니다.

### 4.1 진행률 (`lib/progress.ts`)

#### 4.1.1 주간 진행률 — 이월 이력을 반영한 확장식

PRD 원식은 "(연결된 done 할일 수) / (전체 연결 할일 수)"입니다. 이월(A8)이 들어오면 이 식만으로는 부족합니다. **이월된 할일이 떠난 주의 분모에서도 빠지면, 미완료를 밀어내는 것만으로 지난 주가 100%가 되기 때문입니다.**

```
weeklyProgress(plan, todos) =
  active   = todos.filter(t => t.deletedAt === null)
  현재소속  = active.filter(t => t.weeklyPlanId === plan._id)
  떠난것    = active.filter(t => t.carriedFrom.includes(plan._id)
                             && t.weeklyPlanId !== plan._id)

  분모 = 현재소속.length + 떠난것.length
  분자 = 현재소속.filter(t => t.status === 'done').length

  분모 === 0 ? 0 : round(분자 / 분모 * 100)
```

- 이월돼 나간 할일은 **분모에만** 들어갑니다. 그 주 안에 끝내지 못했다는 사실은 나중에 다른 주에서 완료해도 바뀌지 않습니다
- 소프트 삭제된 할일은 분자와 분모 **양쪽에서 즉시 제외** (PRD §P0). 이월과 달리 삭제는 "그 할일이 없던 일이 됐다"는 뜻이므로 이력을 남기지 않습니다
- 이월된 할일이 **이번 주 계획**의 분모에도 들어가므로, 한 할일이 두 주의 분모에 동시에 잡힙니다. 이는 의도된 동작입니다
- 반올림: 소수점 0자리, `Math.round`

#### 4.1.2 1년 목표 진행률 — 경과 주 기준 평균 (A5)

```
isCounted(plan, currentWeekStart) =
  plan.deletedAt === null
  && ( plan.weekStart <= currentWeekStart || doneCount(plan.todos) > 0 )

goalProgress(plans, today) =
  targets = plans.filter(p => isCounted(p, weekStartOf(today)))
  targets.length === 0
    ? { percent: 0, countedWeeks: 0 }
    : { percent: round(mean(targets.map(p => weeklyProgress(p, p.todos)))),
        countedWeeks: targets.length }
```

- 반환값에 `countedWeeks`를 포함해 UI가 분모를 표시할 수 있게 합니다 (§0.2 투명성 보완)
- `today`를 **인자로 받습니다.** 함수 내부에서 현재 시각을 읽지 않아야 시간 경계 테스트가 가능합니다
- 각 주의 가중치는 동일합니다. 할일 건수로 가중하지 않는 근거는 §0.2

#### 4.1.3 재계산 트리거

A4에 따라 저장값이 없으므로 "재계산"은 곧 **관련 쿼리 캐시 무효화**입니다. 트리거: 할일 생성, 삭제, 상태 변경, 주간 계획 재지정, **이월**.

재지정과 이월 시에는 이전 주간 계획과 새 주간 계획 **양쪽** 캐시를 무효화합니다 (PRD §P0 "양쪽 진행률 재계산").

### 4.2 날짜 (`lib/date.ts`)

모든 날짜 연산의 유일한 출입구입니다. 컴포넌트와 라우트 핸들러에서 `new Date()` 직접 호출을 금지합니다.

MongoDB는 BSON Date를 **UTC 인스턴트**로 저장합니다. `dueDate`, `weekStart`, `startDate`, `endDate`는 "시각"이 아니라 "날짜"이므로, **KST 자정에 해당하는 UTC 인스턴트로 정규화**해 저장합니다 (예: `2026-09-01` → `2026-08-31T15:00:00Z`). 정규화 없이 저장하면 주 경계 조회에서 항목이 누락됩니다 (R9).

- `todayKst(): Date` — KST 기준 오늘 00:00의 UTC 인스턴트
- `toKstDateOnly(input): Date` — 임의 입력을 KST 자정 인스턴트로 정규화 (저장 직전 필수 통과)
- `weekStartOf(date): Date` — 해당 날짜가 속한 주의 월요일 KST 00:00
- `weekRangeOf(date): { start, end }` — 월요일 00:00부터 다음 월요일 00:00까지 (반열린 구간 `[start, end)`)
- `addWeeks(weekStart, n): Date`
- `isDueOutsideWeek(dueDate, weekStart): boolean` — 마감일이 소속 주간 계획의 주 범위를 벗어나는지 판정 (A10 경고 배지용)

> 주간 조회는 `$gte: start, $lt: end` 반열린 구간을 씁니다. `$lte: 일요일 23:59:59.999`는 밀리초 경계 버그를 만듭니다.

### 4.3 정렬 키 (`lib/position.ts`)

- 열 맨 뒤 추가: `maxPosition + 1024` (빈 열이면 `1024`)
- 맨 앞 추가: `minPosition / 2`
- a와 b 사이 삽입: `(a + b) / 2`
- **리밸런스**: 계산된 간격이 `1e-6` 미만이면 해당 열 전체를 `1024, 2048, 3072...`로 재배치하는 `bulkWrite` 실행 (§3.1에 따라 트랜잭션 불필요)

### 4.4 뷰 필터 (`lib/views.ts`)

#### 4.4.1 주간 뷰 — 주간 계획 소속 기준 (A9)

주간 뷰는 **마감일이 아니라 소속으로** 할일을 모읍니다.

```
listForWeek(weekStart) =
  plans = weeklyplans.find({ deletedAt: null, weekStart })
  todos = todos.find({ deletedAt: null,
                       weeklyPlanId: { $in: plans.map(p => p._id) } })
```

마감일 기준으로 잡으면 "주간 계획에 연결됐지만 마감일이 없는 할일"이 주간 뷰에서 통째로 사라집니다. 마감일은 선택 필드이므로 이 경우가 흔합니다. 반대로 소속 기준으로 잡으면 마감일이 그 주 범위 밖인 할일이 섞여 들어오는데, 이는 A10에 따라 배제하지 않고 경고 배지로 표시합니다.

주간 뷰 화면에는 **해당 주 계획들의 할일**과 **미분류 할일 섹션**이 함께 보입니다. 미분류를 같은 화면에 두는 이유는 §4.6입니다.

#### 4.4.2 일일 뷰 — 마감일과 상태 기준

> PRD의 "일일 뷰(오늘 기준)"는 정의가 없어 아래로 확정합니다. **검토 요망 (§11 Q1).**

포함 조건 (OR), 소프트 삭제 항목은 항상 제외:

1. `dueDate === 오늘`
2. `dueDate < 오늘` **AND** `status !== 'done'` — 지연 항목
3. `status === 'doing'` — 진행 중이면 마감일과 무관하게 항상 노출

제외: 마감일이 미래인 항목, 마감일이 없고 `status === 'todo'`인 항목(주간 뷰에서만 노출)

### 4.5 이월 (`lib/carryover.ts`) — A8

```
carryOver(todo, fromPlan, toPlan) =
  전제: todo.status !== 'done'
        && todo.weeklyPlanId === fromPlan._id
        && !todo.carriedFrom.includes(fromPlan._id)   // 멱등성 보장

  갱신: weeklyPlanId = toPlan._id
        carriedFrom  = [...carriedFrom, fromPlan._id]
        position     = 대상 주 해당 열의 맨 뒤
        dueDate      = 변경하지 않음
```

- **완료된 할일은 이월 대상이 아닙니다.** `done` 항목은 이미 그 주의 성과이므로 그대로 둡니다
- **마감일은 손대지 않습니다.** 마감일은 사용자가 정한 약속이고, 이월은 실행 주를 옮기는 행위입니다. 결과적으로 마감일이 지난 항목이 다음 주에 놓이는데, 이는 A10에 따라 경고 배지로 보이며 그대로가 정확한 상태 표현입니다
- **멱등**: 이미 `fromPlan`이 `carriedFrom`에 있으면 건너뜁니다. 일괄 이월이 중간에 실패해 재실행돼도 `carriedFrom`이 중복으로 늘지 않습니다
- **대상 주 계획이 없으면** 먼저 생성합니다. 제목은 원본 주간 계획 제목을 승계하고, `goalId`도 함께 승계합니다. 목표 연결이 끊긴 채 이월되면 진행률 반영에서 누락되기 때문입니다
- **미분류 할일은 이월 대상이 아닙니다.** 소속이 없으므로 옮길 주도 없습니다

일괄 이월은 위 함수를 `bulkWrite`로 묶은 것이며, 되돌리기는 제공하지 않습니다. 대신 **실행 전 대상 목록을 보여주고 확인을 받습니다.**

### 4.6 미분류 처리

미분류(`weeklyPlanId === null`) 할일은 어떤 주간 진행률에도, 따라서 어떤 목표 진행률에도 반영되지 않습니다. 그런데 이 앱은 미분류를 여러 경로로 **자동 생성**합니다.

- 할일 생성 시 주간 계획을 고르지 않으면 미분류 (PRD §3)
- 주간 계획을 삭제하면 하위 할일 전체가 미분류로 전환 (PRD §P0)
- 목표를 삭제하면 하위 주간 계획이 미분류로 전환 (PRD §P0)

방치하면 쓸수록 목표와 단절된 할일이 쌓이고, "일일 할일과 상위 목표의 단절 해소"라는 제품 목적 자체가 무력화됩니다. 따라서 미분류는 **조회 가능한 상태가 아니라 해소해야 할 큐**로 다룹니다.

- 전용 **인박스 뷰**(`/inbox`)를 P0 산출물에 포함합니다 (Phase 4)
- 주간 뷰 하단에도 미분류 섹션을 상시 노출하고, 드래그로 이번 주 계획에 붙일 수 있게 합니다
- 글로벌 내비게이션에 **미분류 건수 배지**를 표시합니다
- 미분류 비율을 M1 지표로 추적합니다 (§1.5)

---

## 5. API 설계

모든 라우트는 Zod 스키마로 입력을 검증하고, `lib/serialize.ts`를 거쳐 응답합니다. 검증 실패는 `400`, 미존재는 `404`, 그 외 예외는 `500`.

| 메서드 | 경로 | 용도 |
|---|---|---|
| `GET` | `/api/todos?view=day&date=YYYY-MM-DD` | 일일 뷰 (§4.4.2) |
| `GET` | `/api/todos?view=week&weekStart=YYYY-MM-DD` | 주간 뷰. 소속 기준 (§4.4.1) |
| `GET` | `/api/todos?view=inbox` | 미분류 목록 (§4.6) |
| `POST` | `/api/todos` | 생성 (제목 필수) |
| `PATCH` | `/api/todos/[id]` | 인라인 수정 (제목, 마감일, 주간 계획 재지정) |
| `DELETE` | `/api/todos/[id]` | 소프트 삭제 |
| `POST` | `/api/todos/[id]/move` | `{ toStatus, beforeId, afterId }` → 상태 + position + completedAt 원자적 갱신 |
| `GET` | `/api/weekly-plans/[id]/carryover-preview` | 이월 대상 목록 미리보기 (§4.5) |
| `POST` | `/api/weekly-plans/[id]/carryover` | `{ todoIds }` → 다음 주로 일괄 이월 |
| `GET`/`POST` | `/api/weekly-plans` | 목록(주 필터, 진행률 포함) / 생성 |
| `PATCH`/`DELETE` | `/api/weekly-plans/[id]` | 수정 / 소프트 삭제(하위 FK null 포함) |
| `GET`/`POST` | `/api/goals` | 목록(진행률 포함) / 생성 |
| `GET` | `/api/goals/[id]` | 상세 + 하위 주간 계획 진행률 + `countedWeeks` |
| `PATCH`/`DELETE` | `/api/goals/[id]` | 수정 / 소프트 삭제(하위 FK null 포함) |
| `GET` | `/api/stats` | M1, M2, M3 지표 산출 (§1.5) |

`move`를 별도 엔드포인트로 분리한 이유: 일반 `PATCH`와 달리 position 계산, 리밸런스, `completedAt` 전이라는 고유 로직을 가지며, 낙관적 업데이트의 롤백 단위이기도 합니다.

`carryover`를 `PATCH`가 아닌 별도 엔드포인트로 둔 이유: `weeklyPlanId` 변경과 `carriedFrom` 누적이 항상 함께 일어나야 하는데, 일반 재지정(`PATCH`)은 `carriedFrom`을 건드리면 안 되기 때문입니다. 두 연산은 겉보기에 같지만 진행률 의미가 정반대입니다.

---

## 6. 구현 단계

각 Phase는 **이전 Phase의 수락 기준이 통과해야** 시작합니다.

### Phase 0 — 프로젝트 셋업 (S)

**산출물**: `package.json`, `tsconfig.json`, `lib/db.ts`, `models/*.ts`, `vitest.config.ts`, `playwright.config.ts`, `app/layout.tsx`, `docs/CLAUDE.md`, `.env.example`

1. `create-next-app` (TypeScript, Tailwind, App Router)
2. `tsconfig.json`에 `strict: true`, `noUncheckedIndexedAccess: true`
3. Mongoose 연결 (`lib/db.ts`) — **`globalThis` 캐싱 필수**. Next.js dev의 HMR이 매 리로드마다 새 커넥션을 만들어 커넥션 풀을 고갈시킵니다
4. §3.2 Mongoose 모델 3개 정의 + 인덱스 선언
5. Vitest + `mongodb-memory-server` 설정, Playwright 설정, 각 스모크 테스트 1개
6. `docs/CLAUDE.md`에 디렉터리 구조, 명령어, 컨벤션 기록 (현재 0바이트)

**수락 기준**

- [ ] `npm run build` 종료 코드 0
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npm run test` 통과 (스모크 1건)
- [ ] `npx playwright test` 통과 (스모크 1건: `/`가 200 반환)
- [ ] `lib/db.ts`를 같은 프로세스에서 10회 연속 호출해도 Mongoose 커넥션이 1개만 생성됨 (단위 테스트로 검증)
- [ ] `mongodb-memory-server`에서 3개 컬렉션 인덱스가 선언대로 생성됨 (`collection.indexes()` 검증)
- [ ] 스키마에 없는 필드 저장 시도 시 예외 발생 (`strict: 'throw'` 검증)
- [ ] `carriedFrom` 미지정 시 빈 배열로 저장됨 (default 검증)

---

### Phase 1 — 도메인 로직 + 데이터 계층 (M)

UI 없이 로직과 데이터 접근을 완성합니다. 이 Phase가 프로젝트의 정확성 기반입니다.

**산출물**: `lib/date.ts`, `lib/progress.ts`, `lib/position.ts`, `lib/views.ts`, `lib/carryover.ts`, `lib/serialize.ts`, `lib/repositories/*.ts`, 각 `*.test.ts`

1. §4.1~4.5 순수 함수를 **테스트 우선**으로 구현
2. 리포지토리 계층 작성 (라우트 핸들러가 얇아지도록 DB 접근을 분리):
   - `todoRepo`: `createTodo` / `updateTodo` / `softDeleteTodo` / `moveTodo` / `listForDay` / `listForWeek` / `listInbox`
   - `weeklyPlanRepo`: CRUD + `softDeleteWithDetach` + `carryOverBatch`
   - `goalRepo`: CRUD + `softDeleteWithDetach` + `getWithProgress`
3. 모든 조회에 `deletedAt: null` 필터 적용. 공용 `activeFilter()` 헬퍼로 통일 (R3)
4. 소프트 삭제는 §3.1 순서 규칙 준수: **하위 FK null → 상위 `deletedAt`**
5. `moveTodo`는 단일 `updateOne`으로 상태, position, `completedAt`을 한 번에 갱신
6. 저장되는 모든 날짜 필드는 `toKstDateOnly()`를 통과 (R9)

**수락 기준**

*진행률 (§4.1)*
- [ ] `weeklyProgress` 분모 0건 → `0`
- [ ] 할일 3건 중 1건 done → `33`
- [ ] 할일 3건 중 1건 done, 1건 소프트 삭제 → `50` (분모에서 즉시 제외)
- [ ] **할일 3건 중 1건 done, 나머지 2건을 다음 주로 이월 → 여전히 `33`** (이월해도 지난 주 진행률이 오르지 않음, A8 핵심)
- [ ] 이월돼 온 할일이 새 주의 분모에는 포함되고, 떠나온 주의 분자에는 절대 포함되지 않음
- [ ] `goalProgress([], today)` → `{ percent: 0, countedWeeks: 0 }`
- [ ] 경과 주 2개(100%, 0%) → `{ percent: 50, countedWeeks: 2 }`
- [ ] **미래 주 51개(전부 빈 계획) + 경과 주 1개(100%)** → `{ percent: 100, countedWeeks: 1 }` (1.9% 왜곡 없음)
- [ ] **경과했지만 할일 0건인 주**가 분모에 포함되어 0%로 반영 (100% 왜곡 없음)
- [ ] 미래 주인데 done 할일이 1건 있으면 분모에 포함 (`doneCount > 0` 조항)
- [ ] **할일 1건짜리 주(100%)와 20건짜리 주(10%)의 목표 진행률이 `55`** (가중 평균 아님, §0.2 결정 고정)
- [ ] `today`를 연말로 옮기면 모든 주가 집계되어 PRD 원식과 값이 일치

*날짜 (§4.2)*
- [ ] `weekStartOf('2026-09-01' 화) → 2026-08-31` / `('2026-08-31' 월) → 2026-08-31` / `('2026-09-06' 일) → 2026-08-31`
- [ ] 연말 경계: `weekStartOf('2027-01-01' 금) → 2026-12-28`
- [ ] `toKstDateOnly('2026-09-01')`이 `2026-08-31T15:00:00.000Z`를 반환
- [ ] KST 23:00에 생성한 마감일 `오늘`짜리 할일이 같은 날 일일 뷰에 나타남 (UTC 밀림 없음)
- [ ] 일요일 23:59와 월요일 00:00의 할일이 서로 다른 주에 배정됨 (반열린 구간 검증)
- [ ] `isDueOutsideWeek`가 주 범위 밖 마감일에 `true`, 범위 안과 마감일 없음에 `false` 반환

*정렬 (§4.3)*
- [ ] 열 맨 앞, 중간, 맨 뒤 삽입 후 `position` 오름차순이 의도한 카드 순서와 일치
- [ ] 간격이 `1e-6` 미만이 되면 리밸런스가 실행되어 모든 `position`이 1024 배수로 재배치
- [ ] 리밸런스를 같은 열에 2회 연속 실행해도 결과가 동일 (멱등성)

*뷰 (§4.4)*
- [ ] 주간 뷰가 **마감일 없이 계획에만 연결된 할일**을 포함 (A9 핵심)
- [ ] 주간 뷰가 마감일이 그 주 범위 밖인 소속 할일도 포함하고, `dueOutsideWeek: true` 플래그를 함께 반환
- [ ] 미분류 할일이 주간 뷰의 계획별 목록에는 들어가지 않고 별도 섹션으로만 반환됨

*이월 (§4.5)*
- [ ] `carryOver` 후 `weeklyPlanId`가 다음 주 계획으로 바뀌고 `carriedFrom`에 이전 주가 1회 추가됨
- [ ] **같은 이월을 2회 실행해도 `carriedFrom` 길이가 1** (멱등성)
- [ ] `done` 상태 할일은 이월 대상 목록에서 제외됨
- [ ] 이월 시 마감일이 변경되지 않음
- [ ] 대상 주 계획이 없으면 자동 생성되고, 원본의 `goalId`를 승계함
- [ ] 미분류 할일에 `carryOver` 호출 시 거부됨
- [ ] 3주 연속 이월된 할일의 `carriedFrom.length === 3`이고, 세 주 모두의 분모에 잡힘

*데이터 계층*
- [ ] `softDeleteGoal` 후 하위 주간 계획들의 `goalId === null`이고 `deletedAt === null` (연쇄 삭제 없음)
- [ ] `softDeleteWeeklyPlan` 후 하위 할일들의 `weeklyPlanId === null`이고 살아 있음
- [ ] `moveTodo(id, 'done')` 후 `completedAt !== null`
- [ ] `moveTodo(id, 'doing')`로 done에서 나오면 `completedAt === null` (A6)
- [ ] 할일을 주간 계획 A에서 B로 재지정 시 A와 B의 진행률이 모두 새 값 반환
- [ ] **일반 재지정(`updateTodo`)은 `carriedFrom`을 건드리지 않음** (이월과 구분)
- [ ] **모든 통합 테스트가 standalone `mongod`(트랜잭션 미지원)에서 통과** (§3.1 검증)
- [ ] `serialize()`를 거친 응답에 `_id`나 `ObjectId` 인스턴스가 남아 있지 않음
- [ ] 통합 테스트가 `mongodb-memory-server`에서 케이스마다 컬렉션 초기화로 격리

---

### Phase 2 — API 라우트 (S)

**산출물**: `app/api/todos/**`, `app/api/weekly-plans/**`, `app/api/goals/**`, `app/api/stats/route.ts`, `lib/schemas.ts` (Zod)

1. §5 표의 엔드포인트를 리포지토리 위에 얇게 구현
2. Zod 스키마를 `lib/schemas.ts`에 모아 클라이언트와 공유
3. 공통 에러 핸들러 (`400` / `404` / `500` + 일관된 `{ error: string }` 본문)

**수락 기준**

- [ ] `POST /api/todos`에 제목 없이 요청 → `400`, DB에 문서 미생성
- [ ] `POST /api/todos`에 스키마 외 필드 포함 → `400` (Zod strict)
- [ ] `GET /api/todos?view=week&weekStart=2026-08-31`이 해당 주 **소속** 항목만 반환 (마감일 기준 아님)
- [ ] `GET /api/todos?view=inbox`가 `weeklyPlanId === null`인 활성 항목만 반환
- [ ] `DELETE /api/todos/[id]` 후 `GET` 목록에서 사라지지만 DB 문서는 `deletedAt`이 채워진 채 존재
- [ ] 존재하지 않는 id에 `PATCH` → `404`
- [ ] 잘못된 형식의 ObjectId → `400` (`500` 아님)
- [ ] `POST /api/todos/[id]/move`가 상태, position, completedAt을 한 번에 갱신하고 갱신된 문서를 반환
- [ ] `GET .../carryover-preview`가 미완료 항목만, `POST .../carryover`가 요청한 `todoIds`만 이월
- [ ] `POST .../carryover`를 동일 본문으로 2회 호출해도 결과가 동일 (멱등성)
- [ ] `GET /api/stats`가 M1, M2, M3를 반환하고, 데이터가 없을 때 `null`이 아닌 `0`을 반환

---

### Phase 3 — 칸반 보드 + 드래그 앤 드롭 (L)

**산출물**: `app/providers.tsx`, `app/(board)/page.tsx`, `components/KanbanBoard.tsx`, `components/KanbanColumn.tsx`, `components/TodoCard.tsx`, `components/TodoForm.tsx`, `hooks/useMoveTodo.ts`

1. TanStack Query Provider 설정
2. 3열 칸반 렌더링, 각 열은 `position` 오름차순
3. `@dnd-kit`으로 열 간 이동과 열 내 정렬 연결
4. `useMoveTodo` 낙관적 업데이트:
   - `onMutate`: 쿼리 취소 → 이전 스냅샷 저장 → 캐시 즉시 갱신
   - `onError`: 스냅샷으로 롤백 + 실패 토스트 노출
   - `onSettled`: 해당 뷰와 관련 주간 계획, 목표 진행률 쿼리 무효화
   - 카드 ID 단위 mutation 직렬화 (R1)
5. 할일 생성 폼 (제목 필수, 마감일과 주간 계획 선택)
6. 카드 인라인 수정, 삭제
7. 카드에 이월 횟수 배지(`carriedFrom.length >= 1`)와 마감일 이탈 경고 배지(A10) 표시

**수락 기준**

- [ ] E2E: 카드를 todo에서 doing으로 드래그하면 놓는 즉시 doing 열에 렌더 (네트워크 응답 대기 없음)
- [ ] E2E: `/api/todos/*/move`가 500을 반환하도록 라우트를 가로채면 카드가 원래 열과 원래 위치로 복귀하고 오류 메시지 노출
- [ ] E2E: 같은 열 안에서 카드를 2칸 위로 옮기고 새로고침해도 순서 유지
- [ ] E2E: 한 카드를 300ms 간격으로 3회 연속 이동시켜도 최종 위치가 마지막 조작과 일치 (R1)
- [ ] E2E: 제목 없이 생성 시도 → 폼 검증 오류, 네트워크 요청 미발생
- [ ] E2E: done으로 옮긴 카드에 완료 시각 표시
- [ ] E2E: 마감일이 소속 주 범위 밖인 카드에 경고 배지가 보이되 카드가 숨겨지지는 않음 (A10)

---

### Phase 4 — 주간 뷰 + 미분류 인박스 (M)

**산출물**: `app/week/[weekStart]/page.tsx`, `app/inbox/page.tsx`, `components/WeeklyPlanCard.tsx`, `components/ProgressBar.tsx`, `components/WeekNavigator.tsx`, `components/InboxSection.tsx`, `components/InboxBadge.tsx`

1. 주 단위 필터 칸반 (기본값: 이번 주), 이전과 다음 주 이동
2. 주간 계획별 진행률 바 + `done수/분모` 텍스트. 분모에 이월돼 나간 건수가 포함됨을 툴팁으로 설명
3. 주간 계획 CRUD (1년 목표 연결 선택)
4. 주간 뷰 하단 미분류 섹션, 드래그로 이번 주 계획에 붙이기
5. 전용 인박스 뷰와 글로벌 내비게이션 미분류 건수 배지 (§4.6)

**수락 기준**

- [ ] 할일을 done으로 드래그하면 해당 주간 계획 진행률이 별도 새로고침 없이 갱신
- [ ] 연결 할일 0건인 주간 계획이 `0%`로 표시 (`NaN`이나 빈 값 아님)
- [ ] 할일을 다른 주간 계획으로 재지정하면 양쪽 진행률 바가 모두 갱신
- [ ] "다음 주" 클릭 시 URL이 `/week/2026-09-07`로 바뀌고 해당 주 소속 할일만 표시
- [ ] 일요일에 접속 시 그 주(직전 월요일 시작) 주간 계획이 표시 (A2)
- [ ] **마감일 없이 계획에만 연결된 할일이 주간 뷰에 보임** (A9 핵심)
- [ ] **주간 계획 삭제 후 하위 할일이 인박스에 나타나고, 배지 숫자가 그만큼 증가**
- [ ] 인박스에서 할일을 주간 계획에 연결하면 배지 숫자가 즉시 감소하고 해당 계획 진행률이 갱신
- [ ] 미분류가 0건이면 배지가 표시되지 않음

---

### Phase 5 — 1년 목표 뷰 (S)

**산출물**: `app/goals/page.tsx`, `app/goals/[id]/page.tsx`, `components/GoalCard.tsx`

1. 1년 목표 CRUD (제목, 기간, 설명)
2. 목표 상세: 하위 주간 계획 목록 + 각 진행률 + 평균 진행률 **+ 분모 라벨**

**수락 기준**

- [ ] 주간 계획 0건인 목표가 `0% (경과 0주 기준)`으로 표시
- [ ] 경과 주 100%와 0% 두 계획을 가진 목표가 `50% (경과 2주 기준)`으로 표시
- [ ] **미래 주간 계획을 50개 추가해도 표시 진행률이 변하지 않음** (A5 핵심 검증)
- [ ] 진행률 옆에 항상 `countedWeeks` 분모 라벨이 노출됨 (§0.2)
- [ ] 목표 삭제 후 하위 주간 계획이 "미분류" 목록에 살아서 표시 (PRD §P0)
- [ ] 미분류 주간 계획을 목표에 연결하면 목표 진행률이 즉시 반영

---

### Phase 6 — 이월 (M)

> A11에 따라 P0로 승격된 기능입니다. 산식 정합성이 걸려 있으므로 UI보다 규칙 준수가 우선입니다.

**산출물**: `components/CarryOverDialog.tsx`, `hooks/useCarryOver.ts`

1. 주간 뷰에 "미완료 다음 주로 이월" 버튼
2. 확인 다이얼로그: 대상 목록을 보여주고 항목별 체크 해제 가능 (§4.5)
3. 실행 후 이전 주와 다음 주 진행률 쿼리 동시 무효화
4. 이월된 카드에 이월 횟수 배지 (Phase 3에서 구현한 배지 재사용)

**수락 기준**

- [ ] E2E: 미완료 3건이 있는 주에서 이월 실행 → 3건이 다음 주 뷰에 나타남
- [ ] **E2E: 이월 직후 이전 주 진행률이 이월 전과 동일** (A8, 게이밍 차단 핵심)
- [ ] E2E: 다이얼로그에 done 항목이 나타나지 않음
- [ ] E2E: 다이얼로그에서 1건을 체크 해제하면 그 항목만 원래 주에 남음
- [ ] E2E: 이월 버튼을 연속 2회 눌러도 카드가 중복 생성되지 않고 배지 숫자가 1로 유지 (멱등성)
- [ ] E2E: 다음 주 계획이 없던 상태에서 이월하면 계획이 자동 생성되고 목표 연결이 승계됨
- [ ] E2E: 이월된 카드가 이전 주 뷰에서는 "이월됨" 표시로 남고 분모에 계속 잡힘

---

### Phase 7 — 보관 정책 + 지표 (S)

> PRD §P0 "소프트 삭제 후 30일 보관"의 실행 주체가 PRD에 없습니다. 상시 구동 서버가 없는 로컬 앱이므로 **지연 정리(lazy purge)** 로 구현합니다.

**산출물**: `lib/retention.ts`, `lib/metrics.ts`, `scripts/purge.ts`, `scripts/metrics.ts`

1. `purgeExpired()`: `deletedAt < 오늘 - 30일`인 문서를 하드 삭제 (3개 컬렉션)
2. 하루 1회만 실행되도록 마지막 실행 시각을 기록하고 앱 첫 요청 시 조건부 호출
3. 수동 실행용 `npm run purge`
4. §1.5의 M1, M2, M3를 산출하는 `lib/metrics.ts`와 `npm run metrics`

> MongoDB TTL 인덱스는 쓰지 않습니다. TTL은 `deletedAt` 기준 30일 후 삭제를 자동화해 주지만, 삭제 시점을 앱이 제어할 수 없고 테스트에서 결정론적으로 검증할 수 없습니다.

**수락 기준**

- [ ] `deletedAt`이 29일 전인 문서는 `purgeExpired()` 후에도 존재
- [ ] `deletedAt`이 31일 전인 문서는 `purgeExpired()` 후 삭제
- [ ] `deletedAt`이 `null`인 문서는 절대 삭제되지 않음
- [ ] 같은 날 두 번 호출 시 두 번째는 DB 쓰기 없이 조기 반환
- [ ] **하드 삭제된 할일이 `carriedFrom`으로 참조하던 주간 계획의 진행률 분모에서도 함께 사라짐** (유령 분모 없음)
- [ ] M1이 활성 할일 10건 중 7건 연결 상태에서 `70`을 반환
- [ ] M2가 경과 주 5개 중 3개만 진행률 1% 이상일 때 `60`을 반환
- [ ] M3가 `carriedFrom.length >= 2`인 건만 세고, 1회 이월 건은 세지 않음
- [ ] 데이터가 전혀 없을 때 세 지표 모두 `0` 반환 (`NaN` 아님)

---

### Phase 8 — 통합 검증 및 마감 (S)

1. PRD §3 User Flow 전 구간 E2E 시나리오 1개 (목표 → 주간 계획 → 할일 → DnD → 진행률 → 이월)
2. `docs/CLAUDE.md` 최종화
3. 남은 P1 백로그를 `docs/BACKLOG.md`로 분리

**수락 기준**

- [ ] 전체 여정 E2E 통과
- [ ] `npm run build && npx tsc --noEmit && npm run lint && npm run test && npx playwright test` 전부 종료 코드 0
- [ ] PRD §4 P0 항목 전체와 A11이 이 문서의 수락 기준으로 1:1 매핑됨 (§7 매핑표)
- [ ] `npm run metrics`가 §1.5 세 지표를 출력

---

## 7. 요구사항 ↔ 수락 기준 매핑

| 요구 항목 | 출처 | 검증 위치 |
|---|---|---|
| 할일 CRUD — 제목 필수 | PRD P0 | Phase 2, 3 |
| 할일 수정 — 인라인 | PRD P0 | Phase 3 |
| 할일 삭제 — 소프트 30일 / 진행률 즉시 제외 | PRD P0 | Phase 1, 2, 7 |
| 조회 — 일일 뷰 / 주간 뷰 | PRD P0 | Phase 1 (§4.4), 2, 4 |
| 상태 3종 / 방향 제약 없음 | PRD P0 | Phase 1, 3 |
| done 전환 시 완료 시각 기록 | PRD P0 | Phase 1, 3 |
| DnD 열 간 이동 = 상태 변경 | PRD P0 | Phase 3 |
| DnD 열 내 이동 = 순서 변경 | PRD P0 | Phase 1 (§4.3), 3 |
| 낙관적 갱신 + 실패 롤백 | PRD P0 | Phase 3 |
| 3계층 구조 / nullable 연결 | PRD P0 | Phase 0 (§3.2), 1 |
| 상위 삭제 시 하위 미분류 전환 | PRD P0 | Phase 1, 4, 5 |
| 재지정 시 양쪽 진행률 재계산 | PRD P0 | Phase 1, 4 |
| 주간 진행률 산식 | PRD P0 | Phase 1 (§4.1.1) |
| 연결 0건이면 0% | PRD P0 | Phase 1, 4 |
| 1년 목표 = 하위 평균 | PRD P0 | Phase 1 (§4.1.2), 5 |
| **미완료 다음 주 이월** | **PRD P1 → A11로 P0 승격** | **Phase 1 (§4.5), 2, 6** |
| **미분류 해소 경로** | **본 계획 §4.6** | **Phase 4** |
| **성공 지표 산출** | **본 계획 §1.5** | **Phase 7** |

---

## 8. 리스크와 완화

| ID | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | 낙관적 업데이트 중 연속 이동 시 응답 순서가 뒤바뀌어 카드가 튐 | 중 | `moveTodo` mutation을 카드 ID 단위로 직렬화. `onMutate` 스냅샷은 항상 직전 캐시 기준. Phase 3에 3연속 이동 E2E |
| R2 | 목표 진행률 산식이 사용 패턴에 따라 왜곡 | 높음 | **A5로 해소** (§0.2). 양방향 왜곡을 각각 막는 수락 기준 2건을 Phase 1에 배치 |
| R3 | `deletedAt: null` 필터 누락으로 삭제 항목이 진행률에 섞임 | 높음 | 공용 `activeFilter()` 헬퍼로 통일. CRUD 리포지토리마다 "삭제 항목이 조회에 안 나온다" 통합 테스트 1건씩 |
| R4 | 정렬 키 정밀도 소진 후 순서 붕괴 | 중 | §4.3 리밸런스를 Phase 1에서 구현. 강제로 간격을 좁히는 단위 테스트와 멱등성 테스트 |
| R6 | 주 경계나 연말 경계 계산 오류로 할일이 조회에서 누락 | 중 | 날짜 연산을 `lib/date.ts`에 격리, 반열린 구간 사용, 연말과 일요일, 월요일 경계 테스트 필수 |
| R7 | P1 기능이 P0 진행 중 유입되어 일정 지연 | 중 | Phase 8에서 `docs/BACKLOG.md`로 분리. 이월(A11) 외 P1은 P0 수락 기준 전부 통과 전 착수 금지 |
| R8 | MongoDB standalone에서 트랜잭션 미지원 → 다중 문서 갱신 중 실패 시 불일치 | 중 | §3.1 분석대로 트랜잭션이 필요 없도록 설계(단일 문서 갱신, 실패 모드가 양성인 순서, 멱등 bulkWrite). Phase 1 통합 테스트를 standalone 모드에서 실행해 강제 |
| R9 | BSON Date UTC 저장으로 KST 날짜가 하루 밀려 주나 일 조회에서 누락 | 높음 | 저장 전 `toKstDateOnly()` 강제 통과. KST 23시대 생성 케이스와 주 경계 케이스를 Phase 1 수락 기준에 명시 |
| R10 | 스키마리스 DB라 문서 형태가 조용히 드리프트 | 중 | Mongoose `strict: 'throw'` + API 경계 Zod 검증. Phase 0에 "스키마 외 필드 저장 시 예외" 수락 기준 |
| R11 | Next.js dev HMR이 매 리로드마다 Mongoose 커넥션을 새로 만들어 풀 고갈 | 중 | `lib/db.ts`에서 `globalThis` 캐싱. Phase 0에 "10회 호출 시 커넥션 1개" 수락 기준 |
| **R12** | **이월로 미완료를 밀어내면 지난 주가 100%가 되는 게이밍** | **높음** | **A8의 `carriedFrom` 이력으로 분모 유지(§4.1.1). Phase 1과 Phase 6에 "이월 후 이전 주 진행률 불변" 수락 기준 배치** |
| **R13** | **미분류 적체로 목표 연동이 무력화** | **높음** | **§4.6 인박스 뷰와 건수 배지를 P0 산출물로 편입. M1 지표로 상시 관측** |
| **R14** | **할일 1~2건짜리 주간 계획으로 목표 진행률 부풀리기** | **중** | **산식으로 차단 불가(§0.2). M2 지표로 관측하고, 목표 상세에 주별 할일 건수를 함께 노출해 사용자가 스스로 판단하게 함** |
| **R15** | **`carriedFrom` 참조가 남은 채 주간 계획이 하드 삭제되면 유령 분모 발생** | **중** | **Phase 7 정리 시 참조 정합성 확인. "하드 삭제 후 분모에서도 사라짐" 수락 기준 배치** |

---

## 9. 검증 절차

```bash
npx tsc --noEmit          # 타입 오류 0건
npm run lint              # 린트 오류 0건
npm run test              # Vitest 단위 + 통합 (mongodb-memory-server)
npx playwright test       # E2E
npm run build             # 프로덕션 빌드
npm run metrics           # M1, M2, M3 출력
```

**수동 확인 (Phase 8)**

1. 1년 목표 "2026년 체력 만들기" 생성
2. 하위에 이번 주 주간 계획 생성 → 목표 진행률 `0% (경과 1주 기준)` 확인
3. 할일 3건 생성, 해당 주간 계획에 연결
4. 1건을 done으로 드래그 → 주간 `33%`, 목표 `33% (경과 1주 기준)` 확인
5. **미래 주간 계획 10개 추가 → 목표 진행률이 여전히 `33% (경과 1주 기준)`** (A5 핵심)
6. 1건을 소프트 삭제 → 주간 `50%` 확인 (분모 감소)
7. **남은 미완료 1건을 다음 주로 이월 → 이번 주가 여전히 `50%`인지 확인** (A8 핵심)
8. 1건을 다른 주간 계획으로 재지정 → 양쪽 진행률 갱신 확인
9. 주간 계획 삭제 → 하위 할일이 인박스에 나타나고 배지 숫자 증가 확인
10. 인박스에서 다시 연결 → 배지 감소와 진행률 갱신 확인
11. 목표 삭제 → 주간 계획이 미분류로 남아 있는지 확인
12. 개발자 도구에서 오프라인 전환 후 드래그 → 원위치 롤백 확인
13. `npm run metrics` 실행 → M1, M2, M3가 위 조작 결과와 일치하는지 확인

---

## 10. P1 백로그 (이번 범위 밖)

이월은 A11에 따라 P0로 이동했습니다. 나머지는 그대로 이월하며 Phase 8에서 `docs/BACKLOG.md`로 분리합니다.

- 반복 할일 (일간/주간)
- 주간 회고 메모 필드
- 1년 목표 하위 주간 진행률 추이 그래프
- 할일 태그 / 우선순위 필드 및 필터
- 키보드 단축키 기반 상태 변경 (dnd-kit 키보드 센서로 일부 무료 확보)
- 소프트 삭제 항목 복구 뷰

**우선순위 재조정 규칙**: §1.5 지표 결과에 따릅니다. M1이 70% 미만이면 위 목록보다 "할일 생성 시 주간 계획 기본값 자동 제안"을 먼저 넣습니다. M3가 15%를 넘으면 "3회 이상 이월 항목 경고"를 먼저 넣습니다.

---

## 11. 남은 질문 (구현 중 조정 가능, 착수 차단 아님)

- **Q1 §4.4.2 일일 뷰 정의**: 정한 3개 조건이 의도한 "오늘 기준"과 맞는지. 특히 "마감일 없는 todo는 오늘 뷰에서 제외"
- **Q2 §0 A6 `completedAt`**: done에서 나올 때 초기화 vs 마지막 완료 시각 보존
- **Q3 §0 A7 배포**: 로컬 실행만으로 충분한지
- **Q4 MongoDB 호스팅**: 로컬 `mongod` vs Atlas 무료 티어. §3.1대로 둘 다 동작하므로 `.env`의 `MONGODB_URI`만 바꾸면 되지만, 개발 기본값을 정해야 함
- **Q5 §4.5 이월 시 마감일**: 손대지 않는 것으로 정했으나, 마감일 지난 항목이 계속 쌓이면 경고 배지가 의미를 잃을 수 있음. "이월 시 마감일도 함께 미룰지 묻기" 옵션이 필요한지
- **Q6 §1.5 지표 목표값**: 70%, 60%, 15%는 근거 있는 수치가 아니라 출발점입니다. 4주 사용 후 실제 분포를 보고 재설정해야 함

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-01 | 최초 작성 (Prisma + SQLite + 서버 액션 가정) |
| 2026-09-01 | 스택을 MongoDB + Mongoose + API Routes로 확정. §3.1 트랜잭션 분석, §5 API 설계 추가. R5(Postgres 전환) 제거, R8~R11(Mongo 고유 리스크) 추가 |
| 2026-09-01 | A5 목표 진행률을 "경과 주 기준 평균"으로 확정 (§0.2). 양방향 왜곡 방지 수락 기준 추가 |
| 2026-09-01 | **PM 리뷰 반영.** ① 이월을 P0로 승격(A11, Phase 6)하고 이월 모델을 이력 보존형으로 확정(A8, §4.5), 주간 진행률 산식을 §4.1.1로 확장. ② 미분류 해소 경로를 §4.6에 정의하고 인박스 뷰를 Phase 4에 편입. ③ 주간 뷰 기준을 소속으로 확정(A9), 마감일 불일치 처리 규정(A10). ④ 성공 지표 §1.5 신설과 Phase 7 산출 추가. ⑤ 가중 평균 미채택 근거를 §0.2에 명시. Phase를 6개에서 8개로 재구성. R12~R15 추가 |
