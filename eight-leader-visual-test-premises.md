# 8팀장 직접 확인 테스트 전제

## 목표

주최자 1명과 팀장 8명이 하나의 경매방에 접속했을 때, 모든 팀장에게 올바른 팀 권한과 입찰 권한이 부여되는지 눈으로 확인할 수 있는 테스트 환경을 만든다.

이 테스트는 예전에 발생한 "특정 팀장에게 입찰 권한이 부여되지 않음" 문제를 재현 가능하게 만드는 것이 목적이다. 단순 통과/실패 자동 검증만이 아니라, 사용자가 실제 브라우저 화면을 보고 각 팀장 상태를 확인할 수 있어야 한다.

## 현재 코드 기준 사실

- `createRoom()`은 `E2E_AUCTION_FIXTURE=1` 환경에서 `createE2EAuctionFixtureRoom()`으로 분기한다.
- `createE2EAuctionFixtureRoom()`은 전달된 `captains` 배열 길이만큼 팀과 leader token을 생성한다.
- 각 팀장 링크는 `/room/{roomId}?role=LEADER&teamId={teamId}&token={leaderToken}` 또는 `authToken` 기반으로 입장한다.
- `RoomClient`는 URL에서 받은 role, teamId, roomAuthToken을 `useRoomAuth()`와 `setRoomContext()`로 store에 저장한다.
- 팀장 입찰 UI는 `storeTeamId`, `roomAuthToken`, 현재 선수, 팀 포인트, 팀 정원 상태를 바탕으로 렌더링된다.
- 기존 `playwright/auction-multi-pc.spec.ts`는 다중 컨텍스트를 검증하지만 2팀 fixture reset 기반이다.
- 기존 production/full-flow 테스트는 실제 방 생성 UI와 링크 추출 흐름을 사용하지만 팀장 2명 기준이다.

## 검증해야 할 핵심 가설

1. 8개 팀장 링크가 모두 서로 다른 `teamId`와 leader token을 가진다.
2. 각 브라우저 컨텍스트가 쿠키, localStorage, Firebase auth 상태를 서로 공유하지 않는다.
3. 각 팀장 화면의 store 상태가 URL의 `teamId`와 일치한다.
4. 경매 시작 후 모든 팀장 화면에 입찰 input과 `입찰하기` 버튼이 표시된다.
5. 한 팀장이 최고 입찰자가 된 뒤에는 해당 팀장만 `최고 입찰 유지 중` 상태가 되고, 나머지 팀장은 다음 최소 입찰액으로 다시 입찰 가능해야 한다.
6. 특정 팀장만 입찰 불가 상태가 되면 teamId, token, 화면 role, 팀 정원, 현재 최고 입찰 여부, presence 상태를 함께 기록해야 원인을 좁힐 수 있다.

## 범위

이번 계획의 구현 범위는 다음으로 제한한다.

- 8팀장 전용 Playwright visual/debug 테스트 추가.
- 사용자가 브라우저를 직접 볼 수 있도록 headed/debug 실행 스크립트 추가.
- 각 팀장별 권한 상태를 자동 수집해 콘솔 또는 테스트 첨부 자료로 남기는 진단 로직 추가.
- 필요하면 `page.pause()` 또는 환경 변수로 멈춤 지점을 제어한다.
- README 또는 별도 문서에 직접 확인 절차를 추가한다.

## 비범위

이번 계획에서는 다음을 하지 않는다.

- Firestore/RTDB 실시간 데이터 계약 변경.
- `auction_revision`, event envelope, signal path 변경.
- 권한 우회를 위해 Firebase rules, token 검증, CORS, 서버 액션 검증 완화.
- UI 디자인 변경.
- Firebase Emulator 전체 도입. Emulator 기반 E2E는 후속 단계로 분리한다.

## 테스트 방식 결정

1차 구현은 기존 E2E fixture 기반으로 진행한다.

이유는 다음과 같다.

- 8팀 방과 8팀장 링크 생성은 이미 `createE2EAuctionFixtureRoom()`으로 가능하다.
- 운영 Firebase 데이터를 건드리지 않고 반복 테스트할 수 있다.
- 권한 문제의 핵심인 role, teamId, token, isolated browser context 흐름을 빠르게 검증할 수 있다.
- 사용자가 직접 화면을 보는 목적은 Playwright headed/debug 모드로 충족된다.

Firebase Emulator는 2차 확장으로 둔다.

Emulator가 필요한 시점은 다음이다.

- 실제 Firestore rules와 Admin SDK, Client SDK, RTDB presence를 모두 로컬 Firebase 서비스로 검증해야 할 때.
- 운영 Firebase가 아닌 로컬 데이터로 실제 createRoom, room_auth_secrets, team_tokens 문서까지 확인해야 할 때.
- fixture가 아니라 실제 Firebase read/write 경계에서만 재현되는 문제가 확인될 때.

## 성공 기준

- `주최자 + 8팀장` 테스트를 headed 모드로 실행할 수 있다.
- 주최자 화면과 8개 팀장 화면이 모두 열리고, 사용자가 경매 시작 직후 멈춘 상태를 직접 확인할 수 있다.
- 8개 팀장 모두에서 입찰 버튼 enabled 상태와 number input 표시 여부를 자동 검증한다.
- 실패 시 어떤 팀장이 실패했는지, 해당 팀장의 URL teamId, 화면 팀명, 버튼 label, disabled 여부, input 값, 관련 경고 문구를 보고한다.
- 일반 headless 실행도 가능해야 하며, CI나 반복 검증에서는 pause 없이 자동으로 끝나야 한다.

## 운영상 주의

- 한 PC에서 9개 브라우저 컨텍스트를 동시에 띄우므로 headed 실행은 CPU와 메모리 사용량이 높다.
- Playwright `--debug`는 테스트를 멈춰놓기 위한 모드이므로 자동 회귀 검증에는 쓰지 않는다.
- 수동 확인 중 테스트가 timer 때문에 지나가지 않도록 pause 지점은 경매 시작 직후 또는 fixture command로 충분히 긴 타이머를 설정한 직후로 둔다.
- 팀장 8명 전체를 육안으로 비교하려면 창 배열이 중요하다. 처음에는 Chromium 컨텍스트 9개보다 1개 organizer + 8개 leader page를 같은 browser instance 안에서 열고, 필요하면 viewport를 작게 고정한다.
