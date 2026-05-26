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

## 3-1. 아이콘 리프레시 작업 계획

1. 기존 이미지 자산은 유지하고 `lucide-react`, `PixelIcon`, 이모지성 UI만 변경 대상으로 제한한다.
2. 2D 아이콘은 proIcons/OpenIconLibrary에서 확인한 Tabler/Phosphor/Iconoir 계열처럼 단색 SVG와 굵은 stroke에 맞는 방향으로 로컬 컴포넌트화한다.
3. `PixelIcon`의 크기, 색상, 접근성, 애니메이션 API는 유지하고 아이콘 타입만 로컬 SVG 타입으로 확장한다.
4. 강조가 필요한 트로피, 메달, 크라운, 주사위/큐브, 방패 계열은 3dicons.co CC0 PNG를 별도 경로에 추가해 포인트 요소로만 사용한다.
5. 중앙 `PIXEL_ICONS` 매핑을 먼저 교체하고, 직접 `lucide-react`를 쓰는 반복 액션 아이콘을 같은 로컬 세트로 치환한다.
6. 화면에 박힌 이모지성 장식은 의미에 따라 2D SVG 또는 3D 포인트 아이콘으로 교체한다.
7. 출처 문서를 추가하고, focused test와 `npm run build`로 검증한다.

## 3-2. 추첨 선택 포인터 수정 계획

1. `LotteryAnimation`의 컨베이어 중앙 가이드를 반원형 표시에서 선택 슬롯을 가리키는 삼각형 포인터로 변경한다.
2. 선택 기준점은 컨테이너 중앙이 아니라 애니메이션 종료 시 타깃 카드의 실제 중앙과 같은 계산식에 맞춘다.
3. 기존 추첨 데이터 계약, 애니메이션 흐름, 결과 카드 표시 로직은 변경하지 않는다.
4. 관련 테스트와 빌드로 UI 변경이 타입/렌더링을 깨지 않는지 확인한다.

---

## 3-3. 팀 로스터 compact 가독성 조정 계획

1. 주최자/팀장 `xl` compact 로스터만 대상으로 삼고 관전자/좁은 화면 스타일은 유지한다.
2. 전체 팀 표시 요구사항을 유지하기 위해 카드 gap/padding은 유지하고 선수 row 높이는 최대 28px까지만 허용한다.
3. 읽기 빈도가 높은 팀명, 포인트, 선수명만 우선 키우고 티어/가격/팀장 배지는 7px 기준을 유지한다.
4. 선수명은 `leading-none`을 피하고 굵기를 낮춰 작은 글자 뭉침을 줄인다.
5. `npm run build`로 Tailwind 클래스와 타입 검증을 완료한다.

---

## 3-4. 대기 선수 목록 패널 구현 계획

1. 기존 `waitingPlayers` 계산값을 재사용하고 Firestore/RTDB 데이터 계약은 변경하지 않는다.
2. 유찰 목록과 채팅 사이에 `Waiting Roster` 패널을 추가한다.
3. 새 패널은 내부 스크롤을 갖는 `flex-none` 박스로 두고, 채팅 패널은 남은 높이를 유지한다.
4. 선수명, 티어, 주/부 포지션만 표시해 오른쪽 컬럼 밀도를 유지한다.
5. `npm run build`로 타입과 렌더링 구성을 검증한다.

---

## 3-5. 미니언즈 철인 3종 경기 아카이브 생성 계획

1. 이미지에서 전사한 팀/리더/선수 목록을 기존 `seed_archive_from_json.js` 입력 JSON으로 정리한다.
2. 경매명은 `room_name`, 시즌명은 `schedule_name`과 `linked_league_name`에 저장해 기존 화면과 일정 로스터 조회가 같은 문서를 읽게 한다.
3. 선수 가격, 티어, 포지션은 이미지에 없으므로 빈 값 또는 `null`로 둔다.
4. dry-run으로 archive id, 팀 수, 선수 수를 확인한 뒤 같은 스크립트로 `auction_archives`에 저장한다.

---

## 4. 운영 이후 로드맵

### 가용성 및 관측성
- [ ] 성능 모니터링: 실사용 환경 Firebase/Firestore 부하 점검
- [ ] 에러 추적: Sentry 또는 동등한 예외 수집 도입

### 추가 기능
- [ ] Sound System: 8-bit 효과음 엔진 탑재
- [ ] Dark Mode: Cyber-Pixel 테마 다크 모드 스킨 개발
