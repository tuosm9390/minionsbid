# AGENTS.md - Minions Bid

## 범위

이 문서는 저장소 전체에 적용된다. 더 가까운 하위 `AGENTS.md`가 있으면 그 문서가 해당 디렉터리의 세부 규칙을 보강한다.

## 프로젝트 성격

Minions Bid는 리그 오브 레전드 선수 경매와 리그 운영을 위한 Next.js 애플리케이션이다. 핵심은 실시간 경매 일관성, 팀 리더 중심의 권한 모델, Cyber-Pixel 시각 언어, Firebase 기반 운영 안정성이다.

## 기술 스택

- Next.js App Router, React, TypeScript를 기준으로 작성한다.
- Firebase Firestore는 방의 정본 상태, Realtime Database는 저지연 팬아웃 버스로 취급한다.
- 스타일은 Tailwind CSS v4와 `DESIGN.md`의 Cyber-Pixel 원칙을 따른다.
- 테스트는 Vitest와 Playwright를 사용한다.

## 작업 원칙

- 기존 문서와 구현을 먼저 읽고, 추측으로 구조를 만들지 않는다.
- `any`, `@ts-ignore`, `@ts-expect-error`, 빈 `catch` 블록을 추가하지 않는다.
- 프로덕션 코드에 `console.log`를 남기지 않는다.
- 데이터 변경은 클라이언트 직접 쓰기가 아니라 서버 경계와 기존 API 경로를 우선한다.
- 보안 우회를 위해 CORS, 인증, Firebase Rules, 검증 로직을 약화하지 않는다.
- 사용자가 수정 중인 파일을 되돌리거나 덮어쓰지 않는다.

## 아키텍처 경계

- 서버 액션과 API 경계는 입력 검증, 권한 확인, 일반화된 사용자 오류 메시지를 유지한다.
- Firestore와 RTDB 사이의 역할을 섞지 않는다.
- 파생 상태는 공통 헬퍼를 통해 계산하고 화면별로 중복 구현하지 않는다.
- `auction_revision`은 timestamp가 아니라 단조 증가 room counter로 다룬다.
- Firebase Admin SDK가 필요한 작업은 서버 전용 경계에 둔다.

## 실시간 경매 데이터 동결

- 실시간 경매 데이터 계약은 현재 코드의 Firestore room hot state, RTDB signal path, event envelope, revision ordering, Firestore convergence 동작을 기준으로 고정한다.
- 입찰, 낙찰, 타이머, 추첨, 시스템 메시지, presence 흐름에서 기존 필드 이름, 경로, 이벤트 타입, revision 비교 규칙을 임의로 바꾸지 않는다.
- 필요한 변경이 있으면 먼저 `doc/AUCTION_REALTIME_CONTRACT.md`, `doc/ARCHITECTURE.md`, 관련 테스트, 마이그레이션/호환 계획을 함께 업데이트한 뒤 진행한다.
- 성능 개선이나 리팩토링은 데이터 모양을 바꾸지 않는 내부 구현 변경으로 제한한다.

## 디자인 규칙

- Cyber-Pixel 방향성을 유지한다: 두꺼운 테두리, 고대비 색, 픽셀 감성, 기술적인 긴장감.
- `DESIGN.md`의 금지 패턴을 반복하지 않는다.
- 보라색 SaaS 그라디언트, 무난한 카드 그리드, 둥근 버블형 UI를 기본값으로 사용하지 않는다.
- 반응형 타이포그래피는 가능한 `text-fluid-*` 토큰과 기존 패턴을 따른다.

## 주요 명령

- 개발 서버: `npm run dev`
- 프로덕션 빌드: `npm run build`
- 린트: `npm run lint`
- 단위 테스트: `npm run test`
- 경매 E2E: `npm run test:e2e:auction`
- 방 인증 시크릿 감사: `npm run audit:room-auth-secrets`
- RTDB 규칙 스모크: `npm run smoke:room-rules`
- 마이그레이션 드라이런: `npm run migrate:room-auth-secrets:dry-run`

## 검증 기대치

- 변경 파일에 가까운 테스트를 먼저 실행하고, 실시간 경매 변경은 Playwright 경매 E2E로 확인한다.
- 타입 또는 린트 오류를 억제하지 말고 원인을 고친다.
- 환경 또는 외부 Firebase 권한이 필요한 검증을 못 했으면 최종 보고에 명시한다.

## 참고 문서

- `README.md`: 실행, 환경 변수, 전체 기능 개요.
- `DESIGN.md`: Cyber-Pixel 디자인 소스 오브 트루스.
- `doc/ARCHITECTURE.md`: 시스템 구조와 상태 흐름.
- `doc/AUCTION_REALTIME_CONTRACT.md`: 경매 실시간 계약.
- `doc/CONVENTIONS.md`: 구현 컨벤션.
- `doc/DATABASE.md`: 데이터 모델.
- `doc/SECURITY.md`: 보안 경계.
- `doc/COMMON_MISTAKES.md`: 반복 실수와 회귀 방지 항목.
