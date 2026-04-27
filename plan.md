# 프로젝트 구현 계획서 — Minions Bid

작성일: 2026-04-27
상태: **운영 안정화 진행 중**

---

## 1. 현재 진행 상황 (Current Progress)

- [x] **Firebase 마이그레이션**: Supabase → Firebase 완전 전환.
- [x] **모달 시스템 개선**: React Portal 도입으로 모든 모달 정렬 문제 해결.
- [x] **전역 디자인 시스템**: `globals.css` 및 `tailwind.config.ts`에 Cyber-Pixel 토큰 반영.
- [x] **경매 핵심 UI/보안**: SoldOverlay 폴리싱, ARIA 개선, 서버 사이드 입찰 검증 완료.
- [x] **일정 관리 UI 정리**: `text-fluid-*` 토큰 정리, 정보 위계 개선, 완료 일정 read-only 상태 강화.
- [x] **일정 관리 권한 경계**: `scheduleActions.ts`의 생성/저장/결과 등록/삭제/종료 액션에 공통 관리자 가드 적용.
- [x] **일정 관리 동시성 보강**: 날짜 저장, 결과 등록, 일정 종료를 Firestore transaction 기반으로 전환.
- [x] **일정 로스터 조회 축소**: 스케줄 문서에 로스터 참조 저장, 직접 조회 우선 + legacy fallback 유지.

---

## 2. 현재 스프린트 초점 (League Schedule Stabilization)

### 완료
- [x] 공개 `/league-schedule` 화면의 서버 액션 권한 검증 추가
- [x] 관리자 코드 입력 흐름을 `코드 확인` 버튼 기반으로 정리
- [x] 일정 종료 후 로컬 optimistic patch 제거, 서버 재조회로 일관성 회복
- [x] 캘린더 day summary를 preview 기준 최소 데이터로 축소
- [x] `scheduleActions` 서버 액션 테스트 추가
- [x] `LeagueScheduleManager` 컴포넌트 테스트 추가
- [x] `ScheduleMatchDayEditor` 컴포넌트 테스트 추가
- [x] 대표 Playwright E2E 2개 추가

### 미결정 구조 항목
- [ ] 공개 읽기 전용 경로와 관리자 편집 경로를 분리할지 결정
- [ ] `match_days.matches[]` 유지 vs 경기별 문서 분리 여부 결정

현재 채택안은 [`doc/results/260427_LeagueScheduleArchitectureDecision.md`](doc/results/260427_LeagueScheduleArchitectureDecision.md) 기준으로 다음과 같다.
- 단일 공개 경로 유지 + 서버 공통 관리자 가드
- `match_days` 문서 유지 + transaction/revision 보강
- 재검토는 운영자 증가, 공개 링크 확산, 동시 수정 빈도 증가 시점에 수행

---

## 3. 다음 작업 순서

1. 운영 모델 확인: 일정 관리 실제 운영자 수, 공개 링크 확산 정도, 같은 날짜 동시 편집 빈도 수집
2. 위 지표가 재검토 트리거에 걸리는지 판단
3. 트리거가 걸리면 관리자 전용 편집 경로 또는 per-match 저장 구조 설계 재개
4. 트리거가 없으면 현재 안정화 버전 유지, Firebase Security Rules와 운영 관측성 작업으로 이동

---

## 4. 운영 이후 로드맵

### 가용성 및 관측성
- [ ] 성능 모니터링: 실사용 환경 Firebase/Firestore 부하 점검
- [ ] 에러 추적: Sentry 또는 동등한 예외 수집 도입

### 추가 기능
- [ ] Sound System: 8-bit 효과음 엔진 탑재
- [ ] Dark Mode: Cyber-Pixel 테마 다크 모드 스킨 개발
