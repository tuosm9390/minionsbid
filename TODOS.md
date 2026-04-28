# TODOS — Minions Bid

이 문서는 즉시 착수 가능한 작업 항목과 해결해야 할 기술 부채를 추적합니다.

---

## ✅ 완료된 주요 작업 (Recently Finished)

- [x] **SoldOverlay 최종 폴리싱**: 폭죽 파티클 및 텍스트 애니메이션 고도화.
- [x] **Accessibility**: `CenterTimer`, `BidStatus` ARIA Live Region 적용.
- [x] **Security**: 서버 사이드 입찰/낙찰 무결성 검증 완료.
- [x] **Optimization**: `findLast` 적용 및 타입 안전성 확보.
- [x] **일정 관리 권한 가드**: `scheduleActions.ts`의 생성/저장/결과 등록/삭제/종료 액션에 공통 관리자 검증 추가.
- [x] **일정 관리 Transaction 전환**: 날짜 저장, 결과 등록, 일정 종료를 Firestore transaction 기반으로 전환.
- [x] **일정 로스터 참조 축소**: 스케줄 문서에 `rosterSourceType` / `rosterSourceId` 저장 및 직접 조회 fallback 추가.
- [x] **일정 관리 UI 정리**: `text-fluid-*` 토큰 정리, 완료 일정 read-only 배너 강화, 관리자 코드 확인 버튼 흐름 적용.
- [x] **일정 관리 테스트 묶음 추가**: `scheduleActions`, `ScheduleMatchDayEditor`, `LeagueScheduleManager`, Playwright E2E까지 대표 회귀 경로 추가.
- [x] **Firebase Security Rules 강화**: `rooms` 전체 list 차단, room 단건 조회와 하위 실시간 구독 컬렉션 read만 허용하도록 rules 재설계 및 배포 완료.

---

## 🏗️ 향후 개선 사항 (Backlog)

### [ ] 일정 관리 아키텍처 미결정 2건 정리
- **What**: 공개 읽기 전용 / 관리자 편집 경로 분리 여부와 `match_days.matches[]` 유지 vs 경기별 문서 분리 여부를 비교 설계 후 결정한다.
- **Why**: 현재 구현은 최소 변경 안정화 버전이고, 다인 운영과 장기 확장 관점에서는 저장 단위와 권한 모델을 더 선명하게 정리할 필요가 있다.
- **Pros**: 이후 테스트와 기능 확장이 더 단순해지고, outside voice에서 지적된 구조 리스크를 줄일 수 있다.
- **Cons**: 이번 스프린트 범위를 넘길 수 있고 데이터 모델 변경 비용이 생길 수 있다.
- **Context**: 현재는 단일 공개 경로 + 관리자 코드 보호, `match_days` 문서 배열 + transaction/revision 보강으로 운영 중이다. 운영 인원과 실제 충돌 가능성을 확인한 뒤 다음 단계 구조를 정해야 한다.
- **Current decision (2026-04-27)**: `doc/results/260427_LeagueScheduleArchitectureDecision.md` 기준으로 현재는 단일 공개 경로 + 서버 관리자 가드, `match_days` 문서 유지 + transaction/revision 보강을 채택했다.
- **Revisit triggers**:
  - 운영 관리자가 2명 이상으로 늘어남
  - `/league-schedule` 링크가 외부에 널리 공유됨
  - 같은 날짜의 서로 다른 경기 행 동시 수정이 잦아짐
- **Depends on / blocked by**: 실제 운영 모델 확인 필요.

### [ ] rooms token segregation
- **What**: `rooms` / `teams` 공개 문서에서 `organizer_token`, `viewer_token`, `leader_token`을 분리하고 비공개 auth 문서로 이동한다.
- **Why**: 현재 구조에서는 공개 read를 열면 토큰이 누출되고, read를 막으면 실시간 구독이 깨진다.
- **Pros**: Firestore rules를 실제로 강화할 수 있고, 역할 링크 토큰 노출 리스크를 줄일 수 있다.
- **Cons**: 데이터 모델, `/api/room-auth`, 방 생성 흐름, 링크 생성 로직을 함께 수정해야 한다.
- **Context**: `useAuctionRealtime`는 클라이언트에서 `rooms`, `teams`, `players`, `messages`, `bids`를 직접 구독한다. 따라서 토큰 분리 없이 rules만 조이면 기능 또는 보안 둘 중 하나가 깨진다.
- **Status update (2026-04-27)**: 신규 방 생성은 `room_auth_secrets/{roomId}`와 `team_tokens/{teamId}`를 사용하도록 반영했고, `room-auth`/`room-links`는 private 문서를 우선 사용한다. legacy public token 필드 cleanup도 완료했다.
- **Depends on / blocked by**: 후속 Firestore 공개 read rules 재설계.

### [ ] Firebase client identity 모델 고도화
- **What**: Firebase Auth 또는 custom token 기반 식별을 도입해 room read 범위를 역할별로 더 세밀하게 제한할지 검토한다.
- **Why**: 현재는 `roomId`를 아는 클라이언트의 room 단건 read와 하위 구독 read를 허용한다. 토큰 노출은 막았지만, 장기적으로는 식별 기반 rules가 더 안전하다.
- **Pros**: room read 범위를 더 줄일 수 있고, 역할별 접근 제어가 rules 수준에서 더 명확해진다.
- **Cons**: 계정/세션/토큰 발급 흐름이 복잡해지고 기존 링크 입장 모델과의 조율이 필요하다.
- **Context**: 2026-04-27 기준 private auth 문서 분리, legacy cleanup, named database `minionsbid` rules 배포, live smoke 검증은 끝났다. 다음 단계는 “누가 읽는가”를 rules가 더 정확히 알게 하는 것이다.

### [ ] 경매 실시간 contract 문서화
- **What**: 경매 실시간 상태 동기화 규칙을 별도 문서로 정리한다. Firestore 정본, RTDB auction envelope, `eventId` / `revision` / `serverCreatedAt`, 클라이언트 optimistic local-only 원칙, organizer-only 만료 트리거를 명시한다.
- **Why**: 이번 경매 안정화의 핵심은 “빠르게 보이는 것”이 아니라 “모든 클라이언트가 같은 진실을 빠르게 본다”는 contract에 있다. 이 규칙이 문서화되지 않으면 다음 수정에서 다시 클라이언트 RTDB write나 중복 파생 계산이 들어올 가능성이 높다.
- **Pros**: 실시간 동기화 변경 시 판단 기준이 생기고, split-brain 회귀를 예방할 수 있다. 테스트 작성 기준도 함께 선명해진다.
- **Cons**: envelope 구조나 상태 전이 규칙이 바뀔 때 문서도 같이 관리해야 한다.
- **Context**: 현재 방향은 Firestore를 canonical state로 유지하고, RTDB는 서버가 발행하는 저지연 auction event bus로 사용한다. 클라이언트는 local optimistic UI만 수행하고, 서버 ack와 Firestore snapshot으로 수렴한다. `highestBid`, `leadingTeam`, `minBid` 같은 파생 상태도 단일 규칙으로 계산되어야 한다.
- **Status update (2026-04-29)**: 기본 계약 문서를 [`doc/AUCTION_REALTIME_CONTRACT.md`](D:\development\league-auction\doc\AUCTION_REALTIME_CONTRACT.md:1)에 추가했다. 이후 envelope 타입이나 recovery 정책이 바뀌면 이 문서를 함께 갱신해야 한다.
- **Depends on / blocked by**: auction envelope 설계 확정, 공통 selector/helper 정리, organizer-only recover path 반영 후 문서화하는 것이 가장 정확하다.

### [ ] 사운드 효과 (Sound System)
- **What**: 입찰, 낙찰, 경매 시작 시 8-bit 스타일 효과음 추가.
- **Why**: 경매의 몰입감과 피드백 강화.

### [ ] 다크 모드 (Dark Mode)
- **What**: Cyber-Pixel 디자인 시스템의 다크 모드 변형 개발.
- **Why**: 저조도 환경 사용자 편의성 제공.
