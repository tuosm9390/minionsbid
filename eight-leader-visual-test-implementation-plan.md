# 8팀장 직접 확인 테스트 구현 계획

## 1. 목표 산출물

이번 구현의 산출물은 8팀장 권한 문제를 직접 볼 수 있는 테스트 러너다.

- `playwright/auction-eight-leaders-visual.spec.ts`.
- `npm run test:e2e:auction:8leaders`.
- `npm run test:e2e:auction:8leaders:headed`.
- README 또는 전용 문서의 실행 절차.

선택 산출물은 다음이다.

- `npm run test:e2e:auction:8leaders:debug`.
- 실패 시 팀장별 진단 JSON 또는 console table 출력.

## 2. 테스트 데이터 구성

fixture 기반 `createRoom()` 경로를 사용한다.

방 생성 payload 기준.

- 방 이름: `8팀장 권한 확인 {timestamp}`.
- `totalTeams`: 8.
- `basePoint`: 1000.
- `membersPerTeam`: 3 또는 4.
- `captainMode`: 현재 기본 운영 흐름과 맞춘다. 우선 `COACH_ONLY` 또는 UI 기본값을 따른다.
- `auctionMode`: `OPEN_ASCENDING`.
- `captains`: 8명. 팀명은 `Team 1`부터 `Team 8`처럼 식별하기 쉽게 만든다.
- `players`: 최소 8명 이상. 첫 라운드 권한 확인만 목적이면 1명으로도 가능하지만, 실제 경매 흐름 확인을 위해 8명 이상을 권장한다.

구현 선택지는 두 가지다.

1. UI로 방을 생성한다.
2. 테스트 안에서 `createRoom()`을 직접 호출하는 fixture API route를 추가한다.

초기 구현은 UI 생성보다 fixture API route 또는 기존 server action 경유를 선호한다. 이유는 테스트 목적이 방 생성 UI가 아니라 팀장 권한 확인이기 때문이다. 단, 실제 링크 발급 UI 회귀까지 확인하고 싶다면 후속으로 UI 생성 variant를 추가한다.

## 3. 브라우저 세션 구성

Playwright `browser.newContext()`를 역할별로 분리한다.

- organizer context 1개.
- leader context 8개.
- 선택적으로 viewer context 1개.

각 context 설정.

- `reducedMotion: 'reduce'`.
- organizer viewport: `1440x960`.
- leader viewport: `720x900` 또는 `900x720`.
- 모든 leader context는 별도 storage 상태를 사용한다.

팀장 페이지는 배열로 관리한다.

```ts
type LeaderClient = {
  teamName: string
  teamId: string
  link: string
  context: BrowserContext
  page: Page
}
```

## 4. 테스트 흐름

1. 8팀 방을 생성한다.
2. organizer link와 8개 leader link를 확보한다.
3. organizer page와 모든 leader page를 연다.
4. 모든 화면에서 방 제목이 보일 때까지 기다린다.
5. organizer 화면에서 모든 팀장이 연결된 상태인지 확인한다.
6. 첫 선수를 추첨하고 경매 시작 상태로 만든다.
7. 모든 leader page에서 다음을 검사한다.
   - 방 제목 표시.
   - 해당 팀명 표시.
   - role이 leader로 보이는지.
   - `input[type="number"]` 표시.
   - `입찰하기` 버튼 enabled.
   - 버튼 label이 `경매 대기중...`, 권한 오류, 팀 가득 참 등의 상태가 아닌지.
8. headed/debug 모드에서는 여기서 멈춰 사용자가 직접 화면을 본다.
9. pause 없이 실행하는 경우에는 경매 시작 직후의 8개 팀장 입찰 가능 상태까지만 자동 검증한다.
10. 실패하면 팀장별 진단 정보를 출력한다.

## 5. 직접 확인 pause 설계

테스트가 자동으로 끝나지 않도록 환경 변수로 pause를 제어한다.

예시.

```powershell
$env:E2E_VISUAL_PAUSE="1"
npm run test:e2e:auction:8leaders:headed
```

테스트 내부 동작.

- `E2E_VISUAL_PAUSE=1`이면 모든 leader의 입찰 버튼 enabled 검증 후 `await page.pause()`를 호출한다.
- pause 대상은 organizer page로 둔다.
- 사용자는 Playwright Inspector에서 테스트를 멈춘 상태로 9개 창을 직접 본다.

자동 검증 모드에서는 pause를 호출하지 않는다.

## 6. 진단 정보

실패 시 최소한 아래 정보를 수집한다.

- `teamName`.
- `teamId`.
- page URL.
- 입찰 버튼 count.
- 입찰 버튼 text.
- 입찰 버튼 enabled 여부.
- number input count와 value.
- `경매 대기중...` 표시 여부.
- `모든 팀장님들의 접속을 기다리는 중...` 표시 여부.
- `최고 입찰 유지 중` 표시 여부.
- role header text.
- visible warning text.

가능하면 `test.info().attach()`로 JSON을 첨부하고, 콘솔에도 요약 테이블을 출력한다.

## 7. 실행 스크립트

`package.json`에 추가할 스크립트.

```json
{
  "test:e2e:auction:8leaders": "playwright test playwright/auction-eight-leaders-visual.spec.ts --project=chromium --workers=1",
  "test:e2e:auction:8leaders:headed": "playwright test playwright/auction-eight-leaders-visual.spec.ts --project=chromium --workers=1 --headed",
  "test:e2e:auction:8leaders:debug": "playwright test playwright/auction-eight-leaders-visual.spec.ts --project=chromium --debug"
}
```

직접 눈으로 확인할 때는 `headed` 또는 `debug`를 사용한다.

자동 회귀 확인은 headed 없이 실행한다.

## 8. 검증 명령

구현 후 최소 검증.

```powershell
npm run test:e2e:auction:8leaders
```

직접 확인 검증.

```powershell
$env:E2E_VISUAL_PAUSE="1"
npm run test:e2e:auction:8leaders:headed
```

기존 경매 회귀.

```powershell
npm run test:e2e:multi-pc
npm run test:e2e:auction
```

위 세 명령이 통과하면 기존 2팀 smoke, 전체 경매 fixture, 8팀장 visual 테스트의 최소 검증이 닫힌다.

## 9. 구현 순서

1. `auction-eight-leaders-visual.spec.ts`에 8팀 fixture 생성 helper를 작성한다.
2. 8개 leader context 생성과 링크 입장 helper를 작성한다.
3. 모든 팀장 입찰 가능 상태를 검사하는 `collectLeaderBidDiagnostics()` helper를 작성한다.
4. 실패 시 진단 JSON attach를 추가한다.
5. `E2E_VISUAL_PAUSE` 기반 `page.pause()` 지점을 추가한다.
6. `package.json` 스크립트를 추가한다.
7. README 또는 별도 문서에 실행 방법을 추가한다.
8. `npm run test:e2e:auction:8leaders`로 자동 검증한다.
9. headed 모드로 수동 확인 절차를 1회 검증한다.
10. 기존 `test:e2e:multi-pc`와 `test:e2e:auction`을 실행해 회귀를 확인한다.

## 10. 커밋 기준

하나의 논리 변경으로 커밋한다.

커밋 메시지 후보.

```text
8팀장 경매 권한 visual 테스트 추가
```

Firebase Emulator 도입은 별도 커밋과 별도 계획으로 분리한다.

## 11. 후속 확장

8팀장 visual 테스트가 통과한 뒤에도 문제가 운영 Firebase에서만 재현되면 Firebase Emulator 기반 E2E를 추가한다.

8명 전체가 실제 입찰 submit까지 완료하는 검증은 별도 안정화 후속으로 분리한다. visual 테스트는 "경매 시작 직후 특정 팀장에게 입찰 UI 권한이 빠지는지"를 빠르게 잡는 목적에 집중한다.

후속 Emulator 계획의 핵심 작업.

- `firebase.json`에 emulator 포트와 rules 경로 정리.
- 클라이언트 SDK emulator 연결 플래그 추가.
- Admin SDK용 `FIRESTORE_EMULATOR_HOST`, `FIREBASE_DATABASE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` 실행 스크립트 추가.
- emulator seed/reset 스크립트 추가.
- 8팀장 visual 테스트를 fixture mode와 emulator mode 양쪽에서 실행 가능하게 분리.
