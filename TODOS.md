# TODOS — Minions Bid

이 문서는 즉시 착수 가능한 작업 항목과 해결해야 할 기술 부채를 추적합니다.

---

## ✅ 완료된 주요 작업 (Recently Finished)

- [x] **Optimization**: `placeBid` 클라이언트 직접 트랜잭션 마이그레이션 및 Firestore 보안 규칙 강화를 통해 입찰 전파 레이턴시를 대폭 단축(~500ms → ~140ms).
- [x] **Security**: `rooms` / `teams` 공개 문서에서 토큰을 분리하고(rooms token segregation), Firestore read rules를 재설계하여 보안 강화 및 토큰 노출 완벽 차단.
- [x] **Documentation**: 경매 실시간 동기화 상태와 규칙(Firestore 정본, RTDB 역할 등)을 정리한 `AUCTION_REALTIME_CONTRACT.md` 문서화 완료.
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

### [ ] Firebase client identity 모델 고도화

- **What**: Firebase Auth 또는 custom token 기반 식별을 도입해 room read 범위를 역할별로 더 세밀하게 제한할지 검토한다.
- **Why**: 현재는 `roomId`를 아는 클라이언트의 room 단건 read와 하위 구독 read를 허용한다. 토큰 노출은 막았지만, 장기적으로는 식별 기반 rules가 더 안전하다.
- **Pros**: room read 범위를 더 줄일 수 있고, 역할별 접근 제어가 rules 수준에서 더 명확해진다.
- **Cons**: 계정/세션/토큰 발급 흐름이 복잡해지고 기존 링크 입장 모델과의 조율이 필요하다.
- **Context**: 2026-04-27 기준 private auth 문서 분리, legacy cleanup, named database `minionsbid` rules 배포, live smoke 검증은 끝났다. 다음 단계는 “누가 읽는가”를 rules가 더 정확히 알게 하는 것이다.

### [ ] final-second 경매 E2E flaky 추가 완화

- **What**: `playwright/auction-realtime.spec.ts`의 마지막 1초 입찰/낙찰 시나리오를 더 안정적으로 만들기 위한 fixture 또는 테스트 헬퍼를 추가 검토한다.
- **Why**: 현재 `master` 기준 CI는 통과하지만, `auction-realtime-ci` PR 환경에서는 runner 속도 차이 때문에 final-second 시나리오가 간헐적으로 흔들렸다.
- **Pros**: PR CI false negative를 줄이고, 실시간 경매 핵심 회귀 테스트의 신뢰도를 더 높일 수 있다.
- **Cons**: 테스트 전용 fixture/clock 제어가 늘어나면 구현이 조금 더 복잡해질 수 있다.
- **Context**: 2026-04-29 기준 마지막 1초 시나리오는 입찰자 화면 기준 타이머와 버튼 활성 상태를 확인하도록 안정화했고, `master` merge CI는 성공했다. 다만 runner 성능 의존성이 남아 있을 수 있으므로 장기적으로는 mock clock, 명시적 fixture phase, 또는 timer freeze 훅 같은 더 강한 제어 수단을 검토할 가치가 있다.

### [ ] 경매 realtime 운영 latency 관측 체계

- **What**: 입찰 이벤트의 `eventId` 기준 end-to-end latency를 운영 환경에서 수집하고, `p95 <= 500ms`를 지속적으로 관측하는 체계를 도입한다.
- **Why**: 개발/fixture 환경 통과만으로는 실제 사용자 체감 성능을 보장할 수 없다. 느려졌을 때 “느린 것 같다”가 아니라 어느 구간이 병목인지 바로 알아야 한다.
- **Pros**: 경매 품질 저하를 조기에 감지할 수 있고, 지역/시간대/트래픽별 latency 분포를 숫자로 볼 수 있다.
- **Cons**: 외부 수집 시스템 또는 서버 로그 집계 비용이 생기고, 운영 복잡도가 늘어난다.
- **Context**: 이번 변경에서는 room canonical state, RTDB fanout, `eventId` 기반 로컬/서버 marker, 대표 시나리오 테스트까지만 포함한다. 장기적으로는 `client click -> server receive -> Firestore commit -> RTDB fanout -> client apply` 전 구간을 운영에서 추적해야 한다.
- **Depends on / blocked by**: canonical `eventId` 전파 규칙 확정, 운영 로그 수집 경로 선택.

### [ ] 서버 측 auction expiry watchdog 재검토

- **What**: `/api/auction-watchdog` route를 계속 유지할지, 아니면 organizer 상시 참여 운영에서는 수동/선택 기능으로만 둘지 재검토한다.
- **Why**: 현재 제품 운영 가정은 organizer 상시 참여이며, 팀장 연결 끊김은 presence guard가 즉시 경매를 멈춘다. 따라서 watchdog은 핵심 실시간 경로가 아니라 선택적 backup이다.
- **Pros**: 실시간 핵심 경로와 운영 backup을 분리해 우선순위를 더 명확히 할 수 있다.
- **Cons**: organizer 비의존 만료 처리까지 강하게 원하면 별도 스케줄러 또는 worker가 다시 필요해질 수 있다.
- **Context**: 현재 `/api/auction-watchdog` route는 남아 있지만, 기본 배포 cron 연결은 제거했다. organizer/presence 기반 일시정지와 recover 경로가 1차 ownership을 가진다.
- **Depends on / blocked by**: 실제 운영에서 organizer 부재 없는지 확인, 수동 backup이 필요한지 운영 정책 확정.
