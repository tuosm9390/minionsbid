# AGENTS.md - Scripts

## 범위

`scripts` 아래의 운영, 감사, 마이그레이션, 스모크 테스트 스크립트에 적용된다.

## 작업 원칙

- 운영 데이터에 영향을 줄 수 있는 스크립트는 기본적으로 dry-run 경로를 먼저 제공하거나 유지한다.
- Firebase Admin 자격 증명과 프로젝트 ID를 하드코딩하지 않는다.
- `.env` 또는 서버 전용 환경 변수에서만 시크릿을 읽는다.
- 로그에는 secret, token, private key, raw credential을 출력하지 않는다.
- destructive action은 명확한 확인 플래그나 별도 명령으로 분리한다.

## 검증

- 방 인증 시크릿 감사: `npm run audit:room-auth-secrets`
- RTDB 규칙 스모크: `npm run smoke:room-rules`
- 마이그레이션 드라이런: `npm run migrate:room-auth-secrets:dry-run`
- 실제 마이그레이션 전에는 대상 project, room 수, 변경 예정 요약을 확인한다.

## 구현 규칙

- 스크립트는 실패 시 non-zero exit code를 반환한다.
- 사용자에게 보여줄 오류와 내부 디버그 정보를 구분한다.
- Node/TypeScript 스크립트에서도 `any`와 suppress comment를 사용하지 않는다.
