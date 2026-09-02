# GitHub 로그인 설정

앱을 처음 켜기 전에 GitHub OAuth App 을 하나 만들어야 합니다. 5분이면 됩니다.

## 1. GitHub OAuth App 만들기

1. GitHub 에서 **Settings → Developer settings → OAuth Apps → New OAuth App** 으로 갑니다.
   (바로 가기: <https://github.com/settings/developers>)
2. 아래처럼 채웁니다.

   | 항목 | 값 |
   |---|---|
   | Application name | 아무거나 (예: `목표 연동 칸반 투두`) |
   | Homepage URL | `http://localhost:3000` |
   | **Authorization callback URL** | `http://localhost:3000/auth/github/callback` |

   > **콜백 URL 이 정확해야 합니다.** 글자 하나라도 다르면 GitHub 이 로그인을 거부합니다.
   > 끝에 슬래시를 붙이지 마세요.

3. **Register application** 을 누릅니다.
4. 다음 화면에서 **Client ID** 를 복사해 둡니다.
5. **Generate a new client secret** 을 눌러 시크릿을 만들고 복사합니다.
   이 값은 이때 한 번만 보입니다. 창을 닫으면 다시 볼 수 없습니다.

## 2. 환경변수 넣기

프로젝트 루트에 `.env.local` 을 만들고 두 줄을 채웁니다.

```bash
GITHUB_CLIENT_ID=여기에_Client_ID
GITHUB_CLIENT_SECRET=여기에_Client_Secret
```

`.env.local` 은 `.gitignore` 에 있어 커밋되지 않습니다. **시크릿을 소스나 `.env.example`
에 적지 마세요.** 값이 없으면 앱이 로그인 시작 단계에서 무엇이 없는지 알려 주고 멈춥니다.

전체 항목은 `.env.example` 을 참고하세요.

## 3. 실행

```bash
npm install
npm run dev
```

<http://localhost:3000> 을 열면 로그인 화면으로 갑니다. **GitHub 로 로그인** 을 누르면
GitHub 승인 화면을 거쳐 돌아옵니다.

MongoDB 는 따로 설치하지 않아도 됩니다. 앱이 알아서 로컬에 띄우고 `.mongo-data/` 에
저장합니다 (자세한 내용은 `docs/CLAUDE.md`).

## 4. (기존 사용자만) 데이터 옮기기

로그인 기능이 생기기 **전에** 만들어 둔 할일·주간 계획·목표가 있다면, 그 문서들에는
소유자가 없어서 로그인해도 보이지 않습니다. 한 번 로그인한 뒤 아래를 실행하세요.

```bash
# 먼저 무엇이 옮겨질지 확인
npm run migrate:user -- <내-github-사용자명> --dry-run

# 실제로 옮기기
npm run migrate:user -- <내-github-사용자명>
```

여러 번 실행해도 안전합니다. 이미 소유자가 있는 문서는 건드리지 않습니다.

## 다른 주소에서 띄울 때

포트를 바꾸거나 배포한다면 **GitHub OAuth App 의 콜백 URL 도 함께 바꿔야 합니다.**
그리고 `.env.local` 에 콜백 주소를 명시하는 편이 안전합니다.

```bash
AUTH_CALLBACK_URL=https://내-도메인/auth/github/callback
```

명시하지 않으면 요청이 도착한 호스트를 보고 만듭니다. 프록시 뒤에 있다면
`x-forwarded-host` / `x-forwarded-proto` 를 그대로 전달하도록 프록시를 설정하세요.

## 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| 로그인 후 "로그인 요청을 확인하지 못했습니다" | 로그인을 시작한 주소와 콜백이 도착한 주소가 다릅니다. `localhost` 로 시작했으면 콜백도 `localhost` 여야 합니다 (`127.0.0.1` 과 `localhost` 는 쿠키상 다른 호스트입니다) |
| GitHub 이 `redirect_uri_mismatch` 를 보여 줌 | OAuth App 에 등록한 콜백 URL 과 앱이 보낸 값이 다릅니다. 3번 항목의 `AUTH_CALLBACK_URL` 로 못 박으세요 |
| `환경변수 GITHUB_CLIENT_ID 가 필요합니다` | `.env.local` 이 없거나 값이 비어 있습니다. 파일을 만든 뒤 dev 서버를 다시 시작하세요 |
| 로그인은 되는데 할일이 하나도 없음 | 로그인 도입 전 데이터라면 4번의 마이그레이션이 필요합니다 |

## 보안 관련 메모

- 세션은 **서버에 저장**합니다. 쿠키에는 난수 토큰만 담고 데이터베이스에는 그 SHA-256
  해시만 둡니다. 데이터베이스가 유출돼도 그 값으로 세션을 만들 수 없습니다.
- 로그아웃은 **세션 문서를 실제로 삭제**합니다. 쿠키만 지우는 방식(JWT)과 달리, 로그아웃한
  세션은 그 즉시 무효가 됩니다.
- 세션 쿠키는 `HttpOnly`, `SameSite=Lax` 이고 프로덕션에서는 `Secure` 가 붙습니다.
- OAuth `state` 를 만들어 콜백에서 대조합니다. 남이 유도한 로그인으로 세션이 굳는 것을
  막습니다.
