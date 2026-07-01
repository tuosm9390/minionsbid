# 희망 팀 충돌 경고와 팀 배정 구현 계획서

작성일: 2026-06-30.
기획 기준 문서: `plans/desired-team-conflict-assignment-brief.md`.

## 목표

경매 중에는 팀장에게 희망 팀 충돌 경고를 보여주고, 경매 종료 후에는 주최자가 경매 팀 로스터를 실제 팀 번호에 배정할 수 있는 화면을 제공한다.

구현은 입찰 차단 없이 경고만 표시하고, 최종 팀 배정은 일정 생성 전에 반드시 확정되는 흐름으로 만든다.

## 성공 기준

- 경매 중 현재 입찰 대상 선수와 팀장 로스터의 희망 팀 교집합이 없으면 해당 팀장에게 강한 충돌 경고가 표시된다.
- 후보가 줄어들지만 비어 있지 않으면 주의 상태와 남은 후보가 표시된다.
- 희망 팀이 없거나 `상관없음`인 선수는 제한 조건으로 계산하지 않는다.
- 경매 종료 후 주최자는 각 경매 팀의 실제 팀 후보와 배정 상태를 볼 수 있다.
- 자동 배정은 즉시 확정하지 않고 제안 상태로 유지된다.
- `상관없음` 중심 팀의 자동 배정 제안은 제한이 있는 팀의 모든 배정이 종료된 이후 갱신된다.
- 후보가 없는 로스터도 주최자가 예외 배정할 수 있고, 상황별 1차 표시 문구와 기록이 남는다.
- 확정된 팀 배정 결과가 없으면 일정 생성 또는 일정 연결 단계로 넘어가지 못한다.

## 범위

### 포함

- 희망 팀 문자열 정규화와 후보 계산 순수 유틸.
- 경매 중 팀장 전용 충돌 경고 UI.
- 경매 종료 후 주최자 전용 팀 배정 화면.
- 자동 배정 제안, 예외 배정, 최종 확정 상태 계산.
- 확정 결과 저장을 위한 서버 액션 또는 기존 room/archive 저장 경계 확장.
- 단위 테스트, 컴포넌트 테스트, 경매 E2E 대표 시나리오.

### 제외

- 희망 팀 입력을 팀명 기반으로 확장하는 작업.
- 입찰 자체를 막는 정책.
- 기존 경매 낙찰 로직 변경.
- 기존 schedule 전체 구조 개편.

## 데이터 모델 계획

### 입력 데이터

기존 `players.desired_team` 문자열을 원본으로 유지한다.

추가 저장 필드는 1차 구현에서 최소화한다. 계산은 공통 파서가 `desired_team`을 정규화한 파생값으로 수행한다.

### 파생 타입 초안

```ts
type DesiredTeamParseResult = {
  raw: string;
  teamIds: number[];
  unrestricted: boolean;
  invalidTokens: string[];
};

type RosterAssignmentCandidate = {
  auctionTeamId: string;
  candidateTeamIds: number[];
  restricted: boolean;
  invalidReasons: AssignmentExceptionReason[];
};

type AssignmentSelection = {
  auctionTeamId: string;
  assignedTeamId: number | null;
  status: "MANUAL" | "SUGGESTED" | "EXCEPTION" | "UNASSIGNED";
  exceptionReason?: AssignmentExceptionReason;
};

type AssignmentExceptionReason =
  | "NO_COMMON_CANDIDATE"
  | "CANDIDATES_EXHAUSTED"
  | "INVALID_DESIRED_TEAM"
  | "FORCED_BY_ORGANIZER";
```

### 저장 위치 후보

| 후보                                             | 설명                                           | 판단                                                |
| ------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------- |
| `rooms/{roomId}.team_assignment`                 | 방 상태에 최종 배정 결과를 저장한다.           | 구현이 단순하지만 room hot state가 커질 수 있다.    |
| `rooms/{roomId}/team_assignments/{assignmentId}` | 별도 문서로 배정 draft와 확정 결과를 저장한다. | 종료 후 흐름과 audit에 적합하다.                    |
| `auction_archives/{archiveId}.team_assignment`   | archive 생성 시점에만 확정 결과를 저장한다.    | 일정 생성 전 강제 조건과 실시간 draft에는 부족하다. |

권장안은 `rooms/{roomId}/team_assignments/final` 문서를 두고, archive 생성 시 해당 결과를 복사하는 방식이다.

## 구현 단계

### 1단계. 순수 계산 유틸과 테스트

대상 파일 후보.

- `src/features/auction/utils/desiredTeamAssignment.ts`.
- `__tests__/desiredTeamAssignment.test.ts`.

작업.

1. `desired_team` 문자열 파서를 만든다.
2. `상관없음`, `무관`, 빈 문자열을 제한 없음으로 처리한다.
3. 숫자 팀만 허용하고 팀 범위 밖 값은 `INVALID_DESIRED_TEAM`으로 표시한다.
4. 로스터 전체 후보는 제한 있는 선수들의 희망 팀 교집합으로 계산한다.
5. 현재 로스터 후보와 입찰 대상 선수 후보를 비교해 `NONE`, `NARROWED`, `CONFLICT` 상태를 만든다.
6. 선택된 실제 팀을 다른 후보에서 제거하는 전파 함수를 만든다.
7. 제한 있는 팀의 모든 배정 완료 이후에만 `상관없음` 중심 팀 자동 배정 제안을 갱신한다.

검증.

- `npx vitest run __tests__/desiredTeamAssignment.test.ts`.
- 후보 교집합 없음, 후보 축소, `상관없음`, 범위 밖 숫자, 자동 배정 제안 지연, 예외 배정 사유를 테스트한다.

### 2단계. 경매 중 팀장 충돌 경고 UI

대상 파일 후보.

- `src/features/auction/components/DesiredTeamConflictWarning.tsx`.
- `src/features/auction/components/board/PlayerInAuction.tsx`.
- `src/features/auction/components/board/SealedBidBoard.tsx`.
- `src/features/auction/components/AuctionBoard.tsx`.
- `src/features/auction/store/auctionSelectors.ts`.

작업.

1. 현재 팀장 `teamId`, 현재 입찰 대상 선수, 해당 팀 로스터를 연결하는 selector를 만든다.
2. 공개 입찰 `PlayerInAuction` 주변에 경고 컴포넌트를 표시한다.
3. 비공개 입찰 `SealedBidBoard` 대상 정보 영역에도 같은 경고를 표시한다.
4. 충돌 없음은 기본적으로 표시하지 않고, 주의와 강한 충돌만 표시한다.
5. 경고는 팀장 본인 화면에만 표시한다. 주최자 전체 요약은 후속 범위로 둔다.

UI 문구.

```text
현재 로스터의 희망 팀과 입찰 대상 선수의 희망 팀이 겹치지 않습니다.
이 선수를 낙찰받으면 경매 종료 후 이 로스터는 희망 팀 조건을 만족하는 최종 팀 배정을 받지 못할 수 있습니다.
```

검증.

- `npx vitest run __tests__/PlayerInAuction.test.tsx __tests__/SealedBidBoard.test.tsx`.
- 필요하면 `__tests__/DesiredTeamConflictWarning.test.tsx`를 추가한다.
- 경고가 팀장 화면에만 보이고, 주최자나 관전자에는 보이지 않는지 컴포넌트 테스트로 확인한다.

### 3단계. 종료 후 팀 배정 화면

대상 파일 후보.

- `src/features/auction/components/TeamAssignmentPanel.tsx`.
- `src/features/auction/hooks/useTeamAssignment.ts`.
- `src/app/room/[id]/RoomClient.tsx`.

작업.

1. 모든 경매 팀 로스터가 확정된 상태를 감지한다.
2. 주최자에게만 팀 배정 패널 진입 버튼 또는 섹션을 표시한다.
3. 각 경매 팀별 후보 실제 팀 목록, 선택 상태, 자동 배정 제안 상태, 예외 배정 상태를 표시한다.
4. 주최자가 실제 팀을 선택하면 다른 미배정 팀 후보에서 제거한다.
5. 제한 있는 팀 배정이 모두 끝나기 전에는 `상관없음` 중심 팀 자동 배정 제안을 보류한다.
6. 제한 있는 팀 배정이 끝난 뒤 후보가 하나만 남은 `상관없음` 중심 팀을 제안 상태로 표시한다.
7. 후보가 0개인 팀도 예외 배정 선택을 허용한다.
8. 최종 확정 버튼은 모든 경매 팀에 실제 팀이 하나씩 지정됐을 때만 활성화한다.

검증.

- `npx vitest run __tests__/TeamAssignmentPanel.test.tsx`.
- 8팀 예시에서 C팀 `1팀` 선택 후 D팀 `2팀` 제안 상태를 확인한다.
- D팀 `1팀` 선택 후 C팀 후보가 `5팀`, `6팀`으로 줄고 자동 제안되지 않는지 확인한다.
- 후보 0개 로스터가 예외 배정 가능 상태로 표시되는지 확인한다.

### 4단계. 저장 경계와 일정 생성 전 차단

대상 파일 후보.

- `src/features/auction/api/teamAssignmentActions.ts`.
- `src/features/auction/api/auctionActions.ts` 또는 archive 생성 경계.
- `src/features/schedules/api/scheduleActions.ts`.
- 관련 Firestore rules와 문서.

작업.

1. 주최자 토큰으로만 최종 팀 배정 저장을 허용한다.
2. 저장 시 한 실제 팀이 두 경매 팀에 중복 배정되지 않도록 서버에서 검증한다.
3. 예외 배정은 `exceptionReason`, 원래 후보, 실제 확정 팀, 표시 문구를 함께 저장한다.
4. 일정 생성 또는 경매 연결 일정 생성 시 확정된 팀 배정 결과가 없으면 진행을 막는다.
5. archive 또는 일정 roster snapshot에는 최종 실제 팀 배정 결과를 포함한다.

검증.

- 서버 액션 단위 테스트 또는 Firebase emulator 기반 테스트를 추가한다.
- 중복 실제 팀 배정, 누락 팀, 예외 사유 누락, 비주최자 저장 시도를 거부하는지 확인한다.
- 일정 생성 전 확정 결과가 없으면 명확한 오류가 반환되는지 확인한다.

### 5단계. 문서와 운영 계약 갱신

대상 파일 후보.

- `doc/AUCTION_REALTIME_CONTRACT.md`.
- `doc/ARCHITECTURE.md`.
- `doc/DATABASE.md`.
- `plans/desired-team-conflict-assignment-brief.md`.

작업.

1. 새 배정 문서 경로와 저장 필드를 기록한다.
2. 경매 realtime event를 추가하지 않는다면 그 이유를 명시한다.
3. 만약 확정 저장 후 화면 동기화를 RTDB 이벤트로 fanout한다면 `auction_revision` 계약 변경 여부를 검토한다.
4. 일정 생성 전 배정 확정 필수 조건을 문서화한다.

검증.

- 문서 검색으로 새 경로와 정책이 모두 기록됐는지 확인한다.

## 예외 배정 표시 정책

| 사유                              | 저장 코드              | 1차 표시 문구                                                           |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| 로스터 전체 후보 없음             | `NO_COMMON_CANDIDATE`  | `희망 팀 조건을 만족하는 배정 후보가 없습니다. 예외 배정이 필요합니다.` |
| 선택 전파 후 후보 소진            | `CANDIDATES_EXHAUSTED` | `다른 팀 배정으로 인해 이 로스터의 희망 팀 후보가 모두 소진되었습니다.` |
| 숫자 팀 입력 오류 또는 범위 밖 값 | `INVALID_DESIRED_TEAM` | `인식할 수 없는 희망 팀 값이 있어 예외 배정 검토가 필요합니다.`         |
| 운영상 강제 배정                  | `FORCED_BY_ORGANIZER`  | `희망 팀 후보와 다른 팀으로 예외 배정되었습니다.`                       |

## 테스트 계획

### 단위 테스트

- 희망 팀 파서.
- 로스터 후보 교집합.
- 경매 중 충돌 상태 계산.
- 선택 전파와 자동 배정 제안.
- 예외 배정 사유와 문구 매핑.

### 컴포넌트 테스트

- 경매 중 경고 컴포넌트.
- 공개 입찰 대상 카드 주변 경고 표시.
- 비공개 입찰 대상 카드 주변 경고 표시.
- 종료 후 팀 배정 패널의 선택, 제안, 예외 상태.

### E2E 테스트

- `playwright/auction-realtime.spec.ts` 또는 별도 fixture에 대표 흐름을 추가한다.
- 8팀 예시 데이터로 경매 종료 상태를 만들고 주최자 배정 패널을 조작한다.
- C팀 `1팀` 선택 후 D팀 `2팀` 제안 상태를 확인한다.
- 제한 있는 팀 배정 완료 전에는 `상관없음` 팀 자동 제안이 갱신되지 않는지 확인한다.
- 모든 배정 확정 전 일정 생성 진입이 막히는지 확인한다.

## 구현 순서

1. 순수 유틸과 단위 테스트를 먼저 만든다.
2. 경매 중 경고 UI를 붙이고 컴포넌트 테스트로 고정한다.
3. 종료 후 배정 패널을 순수 유틸 기반으로 만든다.
4. 저장 서버 액션과 Firestore rules를 추가한다.
5. 일정 생성 전 확정 조건을 연결한다.
6. archive와 문서를 갱신한다.
7. Playwright 대표 흐름으로 실제 화면을 검증한다.

## 리스크와 대응

| 리스크                                                               | 대응                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `desired_team` 문자열 입력이 자유 형식이라 파싱 오류가 많을 수 있다. | 원본 문자열은 유지하고 invalid token을 별도 표시한다.                     |
| 경매 hot state에 배정 draft를 섞으면 realtime 계약이 커질 수 있다.   | 배정 상태는 별도 문서로 두고 경매 진행 이벤트와 분리한다.                 |
| `상관없음` 팀 자동 제안이 너무 일찍 발생할 수 있다.                  | 제한 있는 팀 완료 여부를 계산 조건으로 둔다.                              |
| 예외 배정이 남용될 수 있다.                                          | 예외 사유와 원래 후보를 최종 기록에 남긴다.                               |
| 일정 생성 경계가 여러 곳이면 누락될 수 있다.                         | schedule 생성과 auction archive 생성 경계를 모두 검색해 서버 검증을 둔다. |

## 완료 정의

- 관련 단위 테스트와 컴포넌트 테스트가 통과한다.
- `npm run lint`와 `npm run build`가 통과한다.
- 경매 realtime 변경이 포함되면 `npm run test:e2e:auction`이 통과한다.
- 브라우저에서 팀장 경고와 주최자 배정 패널을 실제로 조작해 확인한다.
- 확정 배정 없이 일정 생성이 막히고, 확정 배정 후 일정 생성이 가능함을 확인한다.
