/**
 * Edge 런타임에서도 읽을 수 있는 상수만 둔다.
 * middleware 는 Edge 에서 돌기 때문에 node:crypto 나 mongoose 를 끌고 오는 모듈을
 * 임포트할 수 없다. 쿠키 이름 하나 때문에 세션 모듈 전체를 딸려 보내면 빌드가 깨진다.
 */
export const SESSION_COOKIE = 'todo_session'
export const OAUTH_STATE_COOKIE = 'todo_oauth_state'
