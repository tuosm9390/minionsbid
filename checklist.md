# 비공개 입찰 구현 체크리스트

## 비공개 입찰 진행 시간 20초 적용

- [x] 비공개 입찰 전용 20초 타이밍 상수 추가
- [x] 서버 시작 로직과 클라이언트 낙관 타이머에 전용 상수 적용
- [x] 비공개 보드 타이머 표시 duration 전용 상수 적용
- [x] startAuction 회귀 테스트 갱신 및 실행
- [x] 경매 E2E 실행 및 현재 UI 문구 assertion 보정

## 입찰가격 공개 중 입찰 대상 compact 표시

- [x] 기존 공개 단계 부가 정보 숨김 처리 복원
- [x] 공개 단계 입찰 대상 정보를 2열 compact 카드로 변경
- [x] 티어와 포지션 텍스트 한 줄 표시 보장
- [x] SealedBidBoard 회귀 테스트 갱신 및 실행

## 0.9 스케일 적용 후 하단 여백 제거

- [x] scale wrapper와 main 높이 제한 확인
- [x] wrapper 높이를 viewport 기준으로 보정
- [x] main의 95vh 최대 높이 제한 제거
- [x] RoomClient 회귀 테스트 실행

## 경매방 전체 레이아웃 0.9 스케일 축소

- [x] RoomClient 레이아웃 root 구조 확인
- [x] 경매방 헤더와 본문을 0.9 scale wrapper로 감싸기
- [x] wrapper 보정으로 축소 후 빈 여백 최소화
- [x] RoomClient 회귀 테스트 추가 및 실행

## 입찰가격 공개 중 입찰 대상 부가 정보 숨김

- [x] 비공개 입찰 공개 단계의 입찰 대상 정보 렌더 조건 확인
- [x] `LOCKED`와 `REVEALING` 단계에서 희망 팀과 한마디 숨김
- [x] SealedBidBoard 회귀 테스트 추가 및 실행

## 재경매 시작 버튼 전체 반짝임 보정

- [x] 흐르는 overlay 효과 제거
- [x] 버튼 전체 sparkle 효과 추가
- [x] hover 중에도 sparkle 클래스 유지 검증
- [x] DraftPanel 테스트 실행

## 재경매 시작 버튼 반복 shine 보정

- [x] 기존 버튼 shine 클래스 동작 확인
- [x] 단발 shine을 반복 shimmer로 변경
- [x] DraftPanel 회귀 테스트 갱신 및 실행

## 재경매 시작 버튼 위치와 강조

- [x] 재경매 안내 화면 구조 확인
- [x] 재경매 시작 버튼을 선수 목록 하단으로 이동하고 크기 확대
- [x] 버튼 주목용 shine 효과 추가
- [x] DraftPanel 회귀 테스트 추가 및 실행

## 재입찰 낙찰 후 최소 금액 초기화

- [x] 재입찰 낙찰 확정 경로에서 sealed bid 잔여 상태 확인
- [x] 낙찰 또는 유찰 확정 시 재입찰 최소 금액과 대상 팀 초기화
- [x] 서버 액션 회귀 테스트 추가 및 실행

## Auction Box 페이즈 전환 애니메이션

- [x] AuctionBoard 씬 전환 방향을 좌에서 우로 통일
- [x] SealedBidBoard 내부 phase 영역에 동일한 진입 애니메이션 적용
- [x] 관련 테스트 실행

## 비공개 입찰 가격 공개 전환 애니메이션 제외

- [x] 비공개 입찰 같은 라운드 phase 변경 시 컨테이너 remount 방지
- [x] 입찰 가격 공개 전환 회귀 테스트 추가
- [x] 관련 테스트 실행

## 동점 재입찰 UI 제한

- [x] 동점 공개 결과 감지 조건 확인
- [x] 주최자 확정 버튼 문구를 재입찰 상황에서 `재입찰 준비`로 변경
- [x] 재입찰 비대상 팀장에게 입찰 컨트롤 대신 추첨 대기형 UI 표시
- [x] 관련 컴포넌트 테스트 추가 및 실행
- [x] 재입찰 준비 클릭 후 즉시 ACTIVE가 아닌 시작 대기 상태로 저장
- [x] 경매 시작 시 재입찰 최소 금액과 대상 팀 유지
- [x] 재입찰 서버 전이 테스트 추가 및 실행

## Firebase 운영 검증 강화

- [x] Firebase 선택 보완 항목을 보고서 형식으로 `doc/results`에 저장
- [x] `/api/room-auth/firebase-token` 운영 smoke 스크립트 테스트를 RED로 추가
- [x] custom token smoke 스크립트와 npm script 추가
- [x] smoke 출력에서 custom token 값을 redaction 처리
- [x] presence 인증 실패 상태와 주최자 UI 분리 테스트를 RED로 추가
- [x] presence 인증 실패 상태 기록과 `PRESENCE 인증 오류` 표시 구현
- [x] 관련 lint, 타입 검사, 수동 QA evidence 수집

## Firebase 실시간 설계 보고서 코드베이스 대조 분석

- [x] 외부 deep research 보고서 핵심 주장 확인
- [x] 현재 Firestore/RTDB 경계와 presence/custom token 구현 확인
- [x] 보완점, 설계 리스크, 우수 구현 항목 분류
- [x] 코드베이스 기준 분석 보고서 작성
- [x] 문서 검토와 변경 상태 확인

## lint 문제 해결과 evidence 정책 정리

- [x] 초기 lint RED와 `.omo` 추적 정책 RED evidence 캡처
- [x] ESLint 설정과 `.omo` ignore 정책 테스트 추가
- [x] lint 오류를 최소 변경으로 수정
- [x] `.omo` evidence 추적 대상 정리
- [x] lint, 테스트, 빌드, CLI stdout QA evidence 수집
- [x] 최종 품질 게이트 점검

## init-deep와 DESCRIPTION 갱신

- [x] 기존 AGENTS.md 계층과 CLAUDE.md 확인
- [x] 프로젝트 구조, 핵심 entrypoint, 문서, 테스트/CI 구조 분석
- [x] 하위 AGENTS.md 추가 위치 결정
- [x] 루트 AGENTS.md를 현재 코드베이스 기준 knowledge base로 갱신
- [x] `src/app`과 `src/components` 하위 AGENTS.md 추가
- [x] DESCRIPTION.md를 현재 아키텍처와 기능 기준으로 갱신
- [x] 문서 diff와 기본 검증 확인

## direct bid 운영 latency 관측

- [x] direct bid eventId/marker 실패 테스트 추가
- [x] latency marker merge 실패 테스트 추가
- [x] direct bid eventId 반환과 client marker 기록 구현
- [x] 운영 정책 문서 갱신
- [x] 관련 테스트와 manual QA evidence 수집

## 경매 OS와 브라우저 호환성 검증

- [x] 현재 Playwright와 CI 구조 확인
- [x] OS/browser 호환성 설정 실패 테스트 추가
- [x] 대표 경매 smoke spec과 npm script 추가
- [x] Playwright browser/mobile 프로젝트 추가
- [x] GitHub Actions OS/browser 매트릭스 추가
- [x] 로컬 compatibility smoke 실행
- [x] 관련 단위 테스트와 빌드 검증

## direct bid 정본 수렴과 rules 강화

- [x] direct bid room snapshot-only 수렴 경로 구현
- [x] event 없는 snapshot이 `auctionEventRevision`을 올리지 않는 회귀 테스트 추가
- [x] direct bid 팀 슬롯 정본 필드 추가와 write 경로 보강
- [x] direct bid Firestore rules에 팀 슬롯과 bid history 검증 추가
- [x] legacy room/team backfill 스크립트 추가
- [x] 관련 단위 테스트, rules smoke, 빌드 검증

## 단일 PC 다중 탭 타이머 표시 보정

- [x] 문제 전제와 최소 수정 범위 정리
- [x] `timerDurationMs` 보정값이 서버 `timerEndsAt`보다 늦어지지 않도록 제한
- [x] RTDB live 이벤트와 Firestore fallback 이벤트에 동일 정책 적용
- [x] 지연 이벤트 회귀 테스트 보강
- [x] 관련 테스트 실행

## 입찰 타이머 8초 연장 기준 전환

- [x] 5초 기준 사용처와 Firestore Rules 확인
- [x] 경매 연장 threshold/duration 상수 8초로 변경
- [x] direct bid Firestore Rules 허용 범위 8초 기준으로 변경
- [x] 타이머 랩 표시와 서버 기준 8초로 변경
- [x] 실시간 계약 문서와 관련 테스트 기대값 갱신
- [x] 관련 테스트와 rules smoke 실행

## 추가 점검

- [x] 비공개 입찰 제출 Firestore rules 직접 접근 차단
- [x] 방 생성 직후 주최자 presence 전파 지연 완화
- [x] rules/presence 관련 테스트 실행
- [x] 빌드 검증

- [x] 경매 방식 타입과 room 생성 필드 추가
- [x] 비공개 입찰 실시간 계약 문서 보강
- [x] 비공개 입찰 전용 서버 액션 추가
- [x] 타이머 만료 시 비공개 라운드 잠금 처리 추가
- [x] store와 realtime 이벤트 적용 확장
- [x] 방 생성 UI에 경매 방식 선택 추가
- [x] 비공개 입찰 보드와 팀장 컨트롤 추가
- [x] 주최자 점수공개/확정 흐름 추가
- [x] 비공개 실시간 이벤트 단위 테스트 추가
- [ ] 전체 단위 테스트 회귀 확인

## 팀장 탭 엑셀 업로드

- [x] 방 생성 팀장 등록 단계에 엑셀 업로드 버튼 표시
- [x] 기존 선수 등록 엑셀 파싱 흐름을 재사용해 팀장 단계 업로드 동작 연결
- [x] 제공된 엑셀 파일의 시트와 컬럼 구조 분석
- [x] 관련 테스트와 빌드 검증
- [x] 팀장/팀원 입력 탭의 업로드 버튼 그룹 간격 통일
- [x] 엑셀 업로드 시 팀장 표시 행을 팀장 데이터로 분리
- [x] 팀장 분리 동작 테스트와 빌드 검증
- [x] 선수 데이터에 무작위 총력전/전략적 팀 전투 정보 추가
- [x] 엑셀 업로드에서 무작위 총력전 포함 헤더와 전략적 팀 전투 헤더 파싱
- [x] 비공개 입찰 추첨 결과에 추가 게임 정보 표시
- [x] 관련 테스트와 빌드 검증
- [x] 비공개 입찰 대상 정보 카드에 저장된 티어 정보 표시
- [x] 비공개 입찰 시작/점수공개 채팅 아이콘 SVG 교체
- [x] 비공개 입찰 대상 정보 카드에 선수 한마디 표시
- [x] 엑셀 업로드 시 이름 열의 팀장 표시 행 인식 보강
- [x] 엑셀 소환사의 협곡 티어를 팀장/팀원 저장 정보에 반영
- [x] 엑셀 티어 원본값 저장과 공개 입찰 선수 카드 ARAM/TFT 표시
- [x] 주최자 presence 키는 있으나 role 값 누락 시 추첨 검증에서 주최자 0명으로 계산되는 문제 보강
- [x] 추첨 애니메이션에서 `플레티넘` 티어가 플래티넘 이미지로 표시되도록 보정
- [x] 선수 추첨 전 검증에서 주최자 presence 조건 제거
- [x] 주최자 전용 서버 액션에 쿠키 기반 주최자 인증 헬퍼 적용
- [x] 비공개 입찰 대상 정보 카드 한 줄 레이아웃과 정확 매칭 티어 이미지 표시 적용
- [x] 비공개 입찰 대상 정보 카드 row 내부 상단 타이틀/하단 데이터 정렬 적용
- [x] 비공개 입찰 대상 정보 카드 티어 3열 배치와 한마디 하단 배치 적용
- [x] 비공개 입찰 대상 정보 카드 무작위 총력전 텍스트 말줄임 제거와 길이별 폰트 크기 적용
- [x] 비공개 입찰 제출 완료 후 점수 카드 시인성 개선
- [x] 팀장명 표시와 엑셀 업로드 기본값에서 닉네임 태그 제거
- [x] 점수 공개 애니메이션 완료 후에만 최고점/재입찰 강조 표시
- [x] 재입찰 라운드 카드 목록을 참여 팀장만 표시하도록 제한
- [x] 모달 외부 클릭 닫힘을 mousedown/up 모두 외부일 때만 동작하도록 수정
- [x] 주최자/팀장 화면 팀 로스터 박스 왼쪽 확장과 2열 표시 적용
- [x] 넓은 팀 로스터 모드에서 카드/폰트 compact 스타일 적용
- [x] 넓은 팀 로스터 모드 전체 폰트 크기 추가 축소
- [x] 방 종료 모달 overlay dismiss 훅 호출 순서 수정

## 홈 업데이트 공지 갱신

- [x] 최신 공지 데이터 위치 확인
- [x] 최근 프로젝트 변경 내용과 문서 상태 확인
- [x] 현재 프로젝트 상황 대비 업데이트 요약 정리
- [x] 업데이트 피드 항목 추가
- [x] 빌드 검증

## project-describer DESCRIPTION 갱신

- [x] 기존 `DESCRIPTION.md`와 README 확인
- [x] 패키지 의존성과 소스 구조 확인
- [x] 핵심 경매, 인증, 일정, 명예의 전당 코드 확인
- [x] 현재 코드베이스 기준 설명서 재작성
- [x] 문서 diff와 워킹트리 확인
- [x] 문서 변경 커밋

## 팀 로스터 compact 재조정

- [x] 기존 넓은 로스터 구현과 디자인 전제 확인
- [x] 주최자/팀장 `xl` 로스터 내부 카드, row, 폰트 밀도 추가 축소
- [x] hover 시 작은 배지 겹침 가능성 제거
- [x] 빌드 또는 관련 검증 실행
- [x] 변경 커밋

## 팀명 편집 input 폭 보정

- [x] 팀명 편집 row의 flex 구조와 버튼 overflow 원인 확인
- [x] input이 저장/취소 버튼을 화면 밖으로 밀지 않도록 폭 제약 적용
- [x] 빌드 또는 관련 검증 실행
- [x] 변경 커밋

## 팀 로스터 compact 가독성 조정

- [x] 기존 compact 폰트와 row 높이 확인
- [x] 팀명/포인트/선수명 중심으로 폰트 계층 재조정
- [x] row 높이를 최대 28px 범위에서 유지
- [x] 빌드 검증
- [x] 변경 커밋

## 대기 선수 목록 패널

- [x] 오른쪽 컬럼과 대기 선수 데이터 흐름 확인
- [x] 대기 선수 목록 컴포넌트 추가
- [x] 유찰 목록과 채팅 사이에 패널 배치
- [x] 빌드 검증
- [x] 변경 커밋 또는 미커밋 사유 기록

## 대기 선수 목록 compact grid

- [x] 기존 대기 패널 표시 정보와 미커밋 파일 확인
- [x] 닉네임만 표시하도록 대기 아이템 단순화
- [x] 한 줄에 3~4개까지 보이는 compact grid 적용
- [x] 빌드 검증
- [x] 변경 커밋

## 대기명단 우측 확장 패널

- [x] 기존 오른쪽 컬럼과 미커밋 변경 확인
- [x] 대기명단을 오른쪽 컬럼 내부 흐름에서 제거
- [x] 레이아웃 우측 바깥 세로 패널로 대기명단 배치
- [x] 대기 아이템을 닉네임 / 티어 / 포지션 한 줄 표시로 변경
- [x] 빌드 검증
- [x] 커밋 여부 결정

## 현재 상태 코드 리뷰

- [x] 리뷰 범위와 성공 기준 정리
- [x] 프로젝트 구조와 주요 문서 확인
- [x] 패키지 스크립트와 검증 명령 확인
- [x] 정적 검사와 단위 테스트 실행
- [x] 보안, 권한, 실시간 경매 경계 검토
- [x] 발견 사항을 심각도 순으로 정리

## 최소 보안선 구현 계획

- [x] 기존 분석 보고서에서 최소 유지 범위 추출
- [x] 구현 대상 서버 액션과 rules 경계 정리
- [x] 단계별 구현 계획 작성
- [x] 최소 검증 명령과 완료 기준 작성

## 최소 보안선 구현

- [x] 역할 token을 room context와 Firebase custom token 발급 요청에 전달
- [x] 팀장 링크에 leader token 포함
- [x] `requireRoomLeader` 서버 헬퍼 추가
- [x] custom token 발급 전 역할 token 검증
- [x] 공개 입찰 fallback leader token 검증
- [x] 비공개 입찰 제출 leader token 검증
- [x] 공지 organizer token 검증
- [x] direct bid 후속 broadcast canonical room state 재검산
- [x] 핵심 단위 테스트와 빌드 검증
- [x] Firestore rules smoke 검증

## 기존 테스트 실패 2건 정리

- [x] `useAuctionControl` 실패 원인과 추첨 종료 계약 확인
- [x] `LotteryAnimation` 실패 원인과 실제 표시 문구 확인
- [x] 테스트 기대값 최소 수정
- [x] 대상 테스트 실행
- [x] 전체 `npm run test` 실행
- [x] 변경 커밋

## 명예의 전당과 일정 관리 코드 리뷰

- [x] 관련 문서, 라우트, 서버 액션, 컴포넌트 확인
- [x] 명예의 전당 등록, 조회, 삭제 흐름 검토
- [x] 일정 생성, 저장, 결과 등록, 종료, 삭제 흐름 검토
- [x] 권한, 트랜잭션, 데이터 정합성, 테스트 커버리지 리스크 정리
- [x] 관련 테스트와 빌드 또는 타입 검증 실행

## 명예의 전당과 일정 관리 안정화 전제

- [x] 기존 리뷰 기록과 문서 위치 확인
- [x] 안정화 범위와 비목표 정리
- [x] 개선 대상별 전제와 성공 기준 작성
- [x] 최소 테스트 범위와 검증 명령 작성
- [x] 변경 문서 검토 및 커밋

## 명예의 전당과 일정 관리 안정화 구현 계획

- [x] 안정화 전제와 현재 문서 상태 확인
- [x] 구현 범위와 성공 기준 세분화
- [x] 서버 액션, UI, fixture, 테스트 작업 순서 작성
- [x] 커밋 분리 기준과 검증 명령 작성
- [x] 변경 문서 검토 및 커밋

## 명예의 전당과 일정 관리 안정화 구현

- [x] 명예의 전당 등록 테스트를 archive 재조회와 중복 방지 기준으로 보강
- [x] 명예의 전당 수동 등록을 서버 archive 재조회와 deterministic id 저장으로 변경
- [x] 일정 저장 date range, roster team, 중복 배정 검증 테스트 추가
- [x] 일정 저장 서버 액션과 E2E fixture 검증 보강
- [x] 일정 전환 시 선택 날짜 reset UI 테스트 추가
- [x] 일정 전환 날짜 상태 보정
- [x] 대상 Vitest, 빌드, Playwright 일정 E2E 검증
- [x] 논리 단위별 커밋

## 명예의 전당과 일정 관리 안정화 후속 분석

- [x] 현재 구현과 이전 전제 확인
- [x] 해결된 리스크와 잔여 리스크 분석
- [x] 최소 필수 개선 전제 문서 작성
- [x] 작업 기록 갱신 및 커밋

## 명예의 전당 legacy 중복 방지 구현 계획

- [x] 후속 분석 문서와 현재 상태 확인
- [x] 구현 범위와 비대상 범위 정리
- [x] 테스트 더블 보강과 테스트 케이스 계획 작성
- [x] 검증 명령과 커밋 기준 작성
- [x] 문서 검토 및 커밋

## 명예의 전당 legacy 중복 방지 구현

- [x] legacy random id 중복 등록 실패 테스트 추가
- [x] hall of fame 테스트 더블에 where/limit query 지원 추가
- [x] `archive_id` 기반 legacy 중복 검사 헬퍼 추가
- [x] 대상 Vitest와 통합 Vitest 실행
- [x] 빌드 검증
- [x] 변경 커밋

## 다수 PC 재현 테스트 환경 구성

- [x] 기존 경매 E2E fixture와 실행 구조 확인
- [x] 다중 브라우저 컨텍스트 기반 대표 시나리오 추가
- [x] 로컬 실행 스크립트 추가
- [x] 수동 LAN 접속 방법 문서화
- [x] 대상 Playwright 검증

## 경매 E2E 실패 3건 정리

- [x] 실패 error context와 fixture 코드 확인
- [x] active auction fixture 타이머를 테스트 기대와 맞춤
- [x] fixture 공지 전송 인증 흐름 복구
- [x] 실패한 Playwright 테스트 재검증

## 8팀장 직접 확인 테스트 계획

- [x] 현재 room fixture, role token, Playwright 구조 확인
- [x] 작업 전제 문서 작성
- [x] 구현 계획서 작성
- [x] 작업 기록 갱신 및 커밋

## 8팀장 직접 확인 테스트 구현

- [x] 8팀 fixture 생성 API route 추가
- [x] 8팀장 visual Playwright spec 추가
- [x] headed/debug 실행 스크립트 추가
- [x] 직접 확인 방법 문서화
- [x] 대상 Playwright와 경매 회귀 검증

## 8팀장 visual 테스트 체감 개선

- [x] 현재 headed 실행 문제 원인 분석
- [x] production server 기반 visual runner 추가
- [x] 8팀장 테스트 시작 순서와 타이머 조정
- [x] 문서와 실행 스크립트 갱신
- [x] 대상 테스트 재검증

## Firebase 통합 환경 테스트 전제조건

- [x] 현재 Firebase client/Admin/emulator 설정 확인
- [x] 통합 테스트 범위와 비범위 정의
- [x] Firebase Emulator 기반 실행 전제 작성
- [x] 운영 Firebase 대상 실행 전제 작성
- [x] 작업 기록 갱신 및 커밋

## Firebase 통합 환경 테스트 구현 계획

- [x] 전제조건 문서와 현재 코드 경계 재확인
- [x] 구현 단계와 파일별 변경 범위 작성
- [x] 검증 명령과 성공 기준 작성
- [x] 작업 기록 갱신 및 커밋

## Firebase 통합 환경 테스트 구현

- [x] Firebase Emulator 포트와 실행 스크립트 구성
- [x] client SDK와 Admin SDK emulator 연결 분기 추가
- [x] Firebase 통합 테스트용 방 생성, command, state, cleanup route 추가
- [x] 주최자 1명과 팀장 8명 통합 Playwright spec 추가
- [x] README에 emulator 실행 방법 문서화
- [x] 빌드 검증
- [ ] Firebase Emulator 통합 E2E 검증. 현재 로컬 Java PATH 누락으로 차단됨
- [x] 기존 8팀장 fixture E2E 회귀 검증
- [x] 다중 PC fixture smoke 회귀 검증
- [x] 변경 커밋

## Firebase 통합 E2E 첫 실행 실패 정리

- [x] 실패 로그와 emulator 로그 확인
- [x] Java 설치 위치와 현재 PATH 상태 확인
- [x] runner에서 Java 경로 보강
- [x] room 화면 로딩 실패 원인 재현
- [x] Firebase Emulator CSP 허용 범위 수정
- [x] 관련 검증 실행
- [x] 변경 커밋

## Firebase 통합 E2E headed 입찰 안정화

- [x] headed 실패 지점과 입찰 컨트롤 로직 확인
- [x] 버튼 라벨 의존 제거
- [x] Firestore 정본 최고가 기준으로 다음 입찰 금액 입력
- [x] headed emulator 테스트 재검증
- [x] headless emulator 테스트 재검증
- [x] 변경 커밋

## 미니언즈 철인 3종 경기 아카이브 생성

- [x] 기존 `auction_archives` 입력 스키마 확인
- [x] 이미지 전사 데이터를 JSON 초안으로 정리
- [x] dry-run으로 문서 요약 검증
- [x] `auction_archives` 실제 저장
- [x] 저장 결과 보고

## 문서화된 운영 결정 반영

- [x] `/league-schedule` 단일 라우트 유지와 `match_days.matches[]` 유지 결정을 문서에 반영
- [x] room read rule 현상 유지와 token 분리, write 보호 중심 결정을 문서에 반영
- [x] organizer와 모든 팀장 동시 연결 시에만 경매를 진행하고 watchdog는 자동 진행하지 않는 결정을 문서에 반영
- [x] direct bid `eventId` marker 연쇄를 p95 관측 우선순위로 문서에 반영

## 방 생성 후 Firebase presence auth 500 점검

- [x] `/api/room-auth/firebase-token` 500 발생 경로 확인
- [x] Firebase Admin token 발급 실패 시 비밀값 없는 진단 로그와 안정적인 응답 추가
- [x] 관련 route handler 테스트 추가 또는 기존 테스트 보강
- [x] 관련 검증 명령 실행
- [x] 변경 커밋

## 운영 room auth import-stage 500 후속 점검

- [x] 운영 API가 invalid payload에도 500 HTML을 반환하는지 확인
- [x] Firebase Admin top-level 초기화 실패가 route import를 깨는 경로 확인
- [x] Admin 초기화 실패를 지연된 서비스 오류로 변경
- [x] Admin 초기화 실패 회귀 테스트 추가
- [x] 관련 검증 명령 실행
- [x] 변경 커밋

## 운영 firebase-token 라우트 import 크래시(ERR_REQUIRE_ESM) 수정

- [x] `vercel logs`로 운영 실제 크래시 스택트레이스 확보
- [x] 다른 API 라우트는 정상 응답하는지 대조 확인
- [x] 원인을 `firebase-admin -> jwks-rsa -> jose(ESM)` 번들링 충돌로 특정
- [x] `next.config.ts`에 `serverExternalPackages` 추가
- [x] 로컬 `npm run build` + `next start`로 400/403 정상 응답 재현 확인
- [x] 관련 vitest 회귀 통과 확인
- [x] 1차 배포(`serverExternalPackages`) 후 운영 재현 — 동일 에러로 미해결 확인
- [x] 진짜 원인을 `jwks-rsa@4.0.1`의 `jose@6`(ESM-only) 의존성 선언 버그로 특정
- [x] `package.json`에 `jose` 5.10.0 override 추가 후 `npm install`
- [x] 재빌드 후 GET 405 / POST 400 / POST 403 정상 응답 재확인
- [x] 전체 `npm test` 231개 통과 확인
- [x] 변경 커밋 및 배포, 운영 재검증

## Presence와 custom token 설계 점검 문서화

- [x] 현재 프로젝트의 presence/custom token 의존성 정리
- [x] Firebase, Supabase, Ably, Pusher 공식 문서 기반 사례 조사
- [x] 대안별 장단점과 권고안 문서 작성
- [x] 작업 기록 갱신

## Presence와 custom token 확정 결정 반영

- [x] 결정값 `1-A, 2-A, 3-C, 4-A, 5-A` 문서 반영
- [x] 3-C의 시작 전 필수/진행 중 grace time 및 주최자 선택 정책 명시
- [x] 작업 기록 갱신

## Presence token 없는 선행 요청 제거

- [x] `firebase-token` 400 후 200 반복 원인 확인
- [x] token 준비 전 ORGANIZER presence auth 요청 차단 테스트 추가
- [x] VIEWER presence 구독이 token API 없이 동작하는 테스트 추가
- [x] `usePresence`에서 self presence write 역할만 Firebase Auth 요청하도록 수정
- [x] 관련 테스트와 build 검증

## 추첨 후 경매 시작 전 접속 종료 알림 보강

- [x] 추첨 화면과 경매 시작 전 presence 표시 조건 확인
- [x] 경매 진행 중 pause 알림과 시작 전 대기 알림 문구 분리
- [x] 관련 컴포넌트 회귀 테스트 추가 또는 보강
- [x] 대상 테스트와 빌드 검증

## 비공개입찰 presence pause currentPlayerId 전달 보정

- [x] RoomClient가 presence guard에 전달하는 currentPlayerId 경로 확인
- [x] room 정본 currentPlayerId를 우선 전달하도록 수정
- [x] 비공개입찰 상태에서 null 전달 회귀 테스트 추가
- [x] 대상 테스트와 빌드 검증
- [x] 리그일정관리 기본 날짜를 오늘 날짜로 고정한다.
- [x] 날짜별 경기 저장과 결과 등록 후 선택 날짜가 유지되는지 테스트로 확인한다.
- [x] 전체 일정 생성 시 시작일과 종료일이 서버 경계에서도 자정 0시로 저장되도록 고정한다.
- [x] 관련 Vitest를 실행하고 결과를 기록한다.

## 동시 입장 presence/custom token 검증

- [x] ulw-loop 목표 생성 및 기존 관련 테스트 표면 확인.
- [x] 동시 입장 success criteria를 실제 증거 경로로 구체화.
- [x] 기존 8팀장 Emulator E2E를 동시 입장 권한 검증 기준으로 보강.
- [x] 관련 TypeScript 확인과 Emulator E2E 실행.
- [x] ulw-loop evidence와 최종 품질 결과 기록.

## 전체 npm test 회귀 실패 확인

- [x] `LeagueScheduleManager` 전체 테스트 실패 재현 증거 확인.
- [x] 병렬 전체 실행에서 날짜 변경 상태 반영 전 저장으로 넘어가는 테스트 race 안정화.
- [x] 대상 테스트와 전체 테스트 재실행.
- [x] ulw-loop G002 evidence 기록.

## 리그전 일정 최신순 정렬

- [x] 일정관리 catalog 조회 정렬 위치 확인.
- [x] `starts_at` 최신순 정렬 계약을 테스트로 고정.
- [x] 관련 일정 서버 액션 테스트 실행.

## 엑셀 업로드 시트 선택

- [x] ulw-loop 목표와 성공 기준을 현재 업로드 흐름에 맞게 구체화한다.
- [x] 파일 선택 후 시트 목록을 보여주는 실패 테스트를 먼저 추가한다.
- [x] 선택한 시트만 파싱되도록 업로드 상태와 UI를 수정한다.
- [x] 빈 시트 선택과 기존 팀장 마커 파싱 회귀를 테스트로 확인한다.
- [x] 관련 Vitest, lint, 브라우저 QA를 실행하고 evidence를 기록한다.

## 추첨 후 티어와 희망 팀 표시

- [x] 추첨과 입찰 대상 표시 컴포넌트, 선수 데이터 저장 경로를 확인한다.
- [x] 티어 이미지와 희망 팀 표시 실패 테스트를 먼저 추가한다.
- [x] 엑셀 `희망 팀` 컬럼을 선수 데이터에 저장하고 realtime과 추첨 이벤트에 전달한다.
- [x] 입찰 대상 UI에 티어 정보와 희망 팀 정보를 표시한다.
- [x] 관련 Vitest, lint, 타입 검사를 실행한다.

## 비공개 입찰 대상 카드 보정

- [x] 이미지로 확인된 `입찰 대상` 화면 경로를 테스트로 고정한다.
- [x] 비공개 입찰 카드에서 세부 티어 문자열도 티어 이미지와 텍스트로 표시한다.
- [x] 비공개 입찰 카드에서 희망 팀을 표시한다.
- [x] 관련 테스트, 타입체크, 린트를 다시 실행한다.

## 희망 팀 엑셀 헤더 변형 보정

- [x] 실제 엑셀에서 가능한 줄바꿈/공백 포함 희망 팀 헤더를 테스트로 고정한다.
- [x] 엑셀 헤더 탐지를 공백 제거 기준으로 보강한다.
- [x] 관련 Vitest, lint, 타입 검사를 실행한다.

## 엑셀 시트 미리보기와 사용자 지정 열 매핑

- [x] 시트 선택 후 즉시 적용하지 않고 데이터 미리보기와 매핑 UI를 표시한다.
- [x] 사용자가 헤더 행을 선택하고 연속 범위 또는 분리된 열을 사용할 열로 선택할 수 있게 한다.
- [x] 필드별 컬럼 매핑을 사용해 선수명, 티어, 포지션, 한마디, 희망 팀, ARAM, TFT 값을 반영한다.
- [x] 선택된 열이 없거나 선수명 매핑이 없을 때 명확한 오류를 표시한다.
- [x] 기존 자동 매핑, 빈 시트 경고, 팀장 행 분리 회귀를 유지한다.
- [x] 관련 Vitest, lint, 타입 검사, 브라우저 QA를 실행한다.

## 비공개 입찰 공개 전 점수 카드 스타일

- [x] `SealedBidBoard`의 공개 전 카드 렌더링 경로를 확인한다.
- [x] 공개 전 카드에서 `SEALED BID` 문구를 제거하고 중앙 `?` 표시로 단순화한다.
- [x] 공개 전 카드 테두리와 `?` 텍스트에 minion blue 기반 느린 점멸 효과를 적용한다.
- [x] 관련 컴포넌트 테스트와 lint/build 검증을 실행한다.
- [x] 공개 전 카드의 대각선 줄무늬를 제거하고 배경을 흰색으로 변경한다.
- [x] 공개 전 카드에 minion blue 색상 클래스를 직접 적용하고 점멸 대비를 보강한다.

## 비공개 입찰 점수공개 페이즈 대상 정보 compact 조정

- [x] 점수공개 페이즈에서 입찰 대상 정보와 공개 카드의 시각 우선순위를 확인한다.
- [x] `LOCKED`/`REVEALING` 상태에서 입찰 대상 정보 박스 크기를 줄인다.
- [x] compact 정보 박스 하단에 `입찰가격공개` 문구를 표시한다.
- [x] 스타일 점검 결과와 보완 필요 항목을 정리한다.
- [x] 관련 테스트, lint, build, 브라우저 렌더 검증을 실행한다.
- [x] `입찰가격공개` 문구를 입찰 대상 박스 외부 하단으로 이동한다.

## 비공개 입찰 점수 카드 박스와 바운스 효과

- [x] 현재 점수 카드 공개 영역과 카드 flip/pulse 구조를 확인한다.
- [x] `입찰가격공개` 텍스트를 키우고 점수 카드 영역 박스 제목으로 배치한다.
- [x] 점수 카드들을 해당 박스 내부에 표시한다.
- [x] 기존 점멸 효과를 유지하면서 카드에 2~3px 상하 바운스를 추가한다.
- [x] 관련 테스트, lint, build, 브라우저 렌더 검증을 실행한다.
- [x] `입찰가격공개`를 박스 상단 제목 배지처럼 보이도록 스타일을 보강한다.
- [x] 입찰 대상 정보 박스와 점수공개 박스 사이 간격과 제목 배지 아래 여백을 늘린다.
- [x] `입찰 대상` 제목도 점수공개 박스와 동일한 상단 배지 스타일로 맞춘다.

## 비공개 입찰 팀장 권한 누락 원인 분석

- [x] 팀장 링크 URL 파라미터가 `RoomClient`와 store로 전달되는 경로를 확인한다.
- [x] Firebase custom token 발급, `signInWithCustomToken`, RTDB presence write 흐름을 확인한다.
- [x] 비공개 입찰 제출이 Server Action의 `requireRoomLeader` 토큰 검증을 쓰는지 확인한다.
- [x] 특정 PC/브라우저 환경에서 실패할 수 있는 지점을 코드 기준으로 분리한다.
- [x] presence/custom token 장애가 경매 진행과 팀장 패널 렌더링을 막지 않도록 보강한다.
- [x] token 누락과 presence gate 회귀 테스트를 추가한다.
