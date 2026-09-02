/**
 * 로그인 허용 명단 (ALLOWED_GITHUB_USERS).
 *
 * 배포본은 링크만 알면 누구나 열 수 있다. 데이터는 소유자별로 격리되지만,
 * 명단이 없으면 모르는 사람도 자기 GitHub 계정으로 가입해 이 데이터베이스에
 * 문서를 쌓을 수 있다. 그걸 막는 문지기다.
 *
 * 비워 두면 아무도 막지 않는다. 로컬 개발과 테스트가 설정 없이 그대로 돌아야 하고,
 * "명단이 없다" 를 "아무도 못 들어온다" 로 해석하면 설정을 깜빡한 순간
 * 본인조차 로그인하지 못하기 때문이다.
 */

/** 허용 명단. 비어 있으면 제한이 없다는 뜻이다. */
export function allowedUsers(): string[] {
  return (process.env.ALLOWED_GITHUB_USERS ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '')
}

/** GitHub username 은 대소문자를 구분하지 않으므로 비교도 그렇게 한다. */
export function isAllowedUser(username: string): boolean {
  const allowed = allowedUsers()
  if (allowed.length === 0) return true
  return allowed.includes(username.trim().toLowerCase())
}
