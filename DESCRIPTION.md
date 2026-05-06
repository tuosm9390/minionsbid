# Minions Bid

## 프로젝트 개요

Minions Bid는 리그 오브 레전드 커뮤니티 운영을 위한 도구로, 하나의 제품 안에 다음 세 가지 흐름을 통합한 프로젝트입니다.

1. 실시간 선수 경매방 생성 및 라이브 입찰
2. 리그 일정 생성 및 경기 결과 관리
3. 시즌 종료 후 우승팀 명예의 전당 아카이빙

이 프로젝트는 Next.js App Router 기반으로 구축되어 있으며, 백엔드 플랫폼으로 Firebase를 사용합니다. 경매 기능은 주최자, 팀장, 관전자 사이의 저지연 실시간 동기화에 초점을 맞추고 있고, 일정 관리와 아카이브 기능은 단발성 드래프트 도구를 시즌 운영 시스템으로 확장하는 역할을 합니다. 최근에는 설치 가능한 PWA 셸을 추가해 모바일 홈 화면 진입과 기본 오프라인 캐시까지 고려한 구조로 확장되었습니다.

UI 역시 일반적인 대시보드 스타일을 그대로 따르지 않습니다. 두꺼운 테두리, CRT 오버레이, 픽셀 아이콘, 모달 중심 인터랙션을 조합한 레트로 아케이드 감성의 "Cyber-Pixel" 비주얼 시스템을 채택하고 있습니다.

## 제품 범위

### 1. 경매 워크플로우

- 팀 수, 팀당 인원, 총 포인트를 기준으로 경매방 생성
- 팀장과 선수 정보를 수동 입력 또는 Excel 업로드로 등록
- 주최자, 팀장, 관전자 전용 입장 링크 생성
- 추첨, 타이머, 입찰, 낙찰, 재경매를 포함한 실시간 경매 진행
- 완료된 경매 결과를 `auction_archives`에 영구 저장

### 2. 리그 일정 워크플로우

- 기존 경매 또는 리그 이름과 연결된 일정 생성
- 날짜별 매치 타임라인 구성
- 팀 간 대진과 경기 시간을 배정
- 경기별 승자와 메모 기록
- 경기 단계와 상태 기준으로 전적/점수/경기 목록 필터링
- 최종 우승팀을 선택해 일정 종료 처리

### 3. 명예의 전당 워크플로우

- 등록된 우승 기록 조회
- 경매 아카이브를 기반으로 우승팀 수동 등록
- 연결된 리그 일정 종료 시 우승팀 자동 등록

## 아키텍처

### 애플리케이션 구조

- 프레임워크: Next.js 16 App Router
- 렌더링 방식: 서버에서 진입 라우트를 렌더링하고, 기능 중심 UI는 클라이언트 컴포넌트로 구성
- 상태 관리: 클라이언트 경매 상태는 Zustand, 백엔드 동기화는 Firebase 구독 기반으로 처리
- PWA 구성: Web App Manifest, 서비스 워커 등록 컴포넌트, 정적 자산 캐시를 포함한 설치형 웹앱 셸

### 백엔드 모델

이 코드베이스는 중요한 쓰기 작업 전반에서 서버 권한 중심(server-authoritative) 모델을 따릅니다.

- 읽기 및 동기화:
  - Firestore `onSnapshot` 구독으로 방, 팀, 선수, 입찰, 메시지 상태를 클라이언트 스토어에 실시간 반영
  - Firebase Realtime Database는 presence와 경량 broadcast signal 용도로 사용
- 변경 작업:
  - Next.js Server Actions가 Firebase Admin SDK 코드를 호출
  - 실제 상태 변경 전 권한과 데이터 유효성을 서버에서 검증

즉, 이 프로젝트는 클라이언트가 모든 상태를 직접 주도하는 구조가 아닙니다. 클라이언트는 실시간 상태를 렌더링하지만, 방 생성, 입찰, 낙찰 처리, 경기 결과 등록, 아카이브 저장처럼 중요한 전환은 서버가 통제합니다.

## 핵심 데이터 흐름

### 방 생성

방 생성 흐름은 [`src/components/CreateRoomModal.tsx`](D:/development/league-auction/src/components/CreateRoomModal.tsx)와 [`src/features/auction/hooks/useCreateRoom.ts`](D:/development/league-auction/src/features/auction/hooks/useCreateRoom.ts)가 담당합니다.

주요 동작은 다음과 같습니다.

- 여러 단계의 모달에서 기본 설정, 팀장 정보, 선수 풀 정보를 순차적으로 수집
- `xlsx`를 사용해 브라우저에서 Excel 업로드 파싱
- 로컬 스토리지와 Firestore를 함께 조회해 기존 활성 방 여부 확인
- 일정 연결을 위해 스케줄 옵션을 함께 로드
- 최종 방 생성은 [`src/features/auction/api/roomActions.ts`](D:/development/league-auction/src/features/auction/api/roomActions.ts)의 서버 액션으로 위임

생성 시 서버는 다음 데이터를 기록합니다.

- `rooms/{roomId}` 문서
- 팀장별 토큰을 포함하는 `teams` 서브컬렉션
- `WAITING` 상태로 초기화된 `players` 서브컬렉션
- 이후 링크 인증에 사용할 organizer/viewer 토큰

### 링크 기반 역할 인증

이 제품은 일반적인 계정 시스템을 제공하지 않습니다. 대신 역할별 토큰을 통해 방 접근 권한을 부여합니다.

[`src/app/api/room-auth/route.ts`](D:/development/league-auction/src/app/api/room-auth/route.ts)는 다음을 수행합니다.

- `roomId`, `role`, `token`, 선택적 `teamId`를 입력으로 받음
- organizer/viewer 토큰을 room 문서 기준으로 검증
- leader 토큰을 선택된 team 문서 기준으로 검증
- `/room/{roomId}` 범위의 `httpOnly` 쿠키를 기록
- 정규화된 role 컨텍스트와 함께 실제 방 페이지로 리다이렉트

이 방식은 커뮤니티 운영 도구에 맞게 접근 절차를 단순화하면서도, 서버 검증을 유지하는 구조입니다.

### 경매 동기화

실시간 경매 화면의 중심은 [`src/app/room/[id]/RoomClient.tsx`](D:/development/league-auction/src/app/room/[id]/RoomClient.tsx)입니다.

여기서 사용하는 실시간 상태는 다음 파일들에서 공급됩니다.

- [`src/features/auction/hooks/useAuctionRealtime.ts`](D:/development/league-auction/src/features/auction/hooks/useAuctionRealtime.ts)
- [`src/features/auction/hooks/usePresence.ts`](D:/development/league-auction/src/features/auction/hooks/usePresence.ts)
- [`src/features/auction/store/useAuctionStore.ts`](D:/development/league-auction/src/features/auction/store/useAuctionStore.ts)

구조적으로는 다음과 같습니다.

- Firestore snapshot이 Zustand 스토어를 초기화하고 지속적으로 갱신
- RTDB presence로 현재 접속 중인 팀장과 주최자를 추적
- RTDB signal path는 추첨 애니메이션 종료 같은 단발성 이벤트 전달에 사용
- UI는 이 상태를 기반으로 다음과 같은 파생 조건을 계산
  - 모든 팀장 접속 여부
  - 현재 경매 중인 선수
  - 현재 최고 입찰가
  - 타이머 만료 여부
  - 팀 정원 충족 여부

### 경매 변경 파이프라인

핵심 경매 로직은 [`src/features/auction/api/auctionFlowActions.ts`](D:/development/league-auction/src/features/auction/api/auctionFlowActions.ts)에 구현되어 있습니다.

주요 작업은 다음과 같습니다.

- `drawNextPlayer`: `WAITING` 상태 선수 한 명을 무작위로 `IN_AUCTION`으로 전환
- `startAuction`: 서버 기준 타이머 시작
- `pauseAuction` / `resumeAuction`: 팀장 연결 끊김에 따른 경매 중단 및 재개 처리
- `placeBid`: 정수 금액, 10포인트 단위, 최대 금액, 팀 잔액, 중복 선두 입찰, 팀 정원, 타이머 연장 조건 검증
- `awardPlayer`: Firestore transaction 안에서 낙찰 상태 확정
- `draftPlayer`: 유찰 또는 대기 선수를 0포인트로 수동 영입
- `restartAuctionWithUnsold`: 모든 `UNSOLD` 선수를 다시 `WAITING`으로 전환

여기서 중요한 설계 선택은 "빠른 착시"보다 "정합성"을 우선했다는 점입니다. 입찰 상태는 클라이언트에서 바로 확정하지 않고, 서버에서 검증과 저장을 마친 뒤 Firebase 구독을 통해 전체 참가자에게 동일하게 반영됩니다.

### 아카이브 저장

경매가 완료되면 [`saveAuctionArchive`](D:/development/league-auction/src/features/auction/api/roomActions.ts)가 결과 스냅샷을 `auction_archives`에 저장합니다.

이 아카이브에는 다음 정보가 포함됩니다.

- 방 메타데이터
- 연결된 일정 메타데이터
- 최종 팀 스냅샷
- 선수별 낙찰가와 포지션 정보

이후 이 데이터는 리그 일정 생성과 명예의 전당 등록의 입력 소스로 재사용됩니다.

## 리그 일정 시스템

리그 일정 기능은 단순 보조 페이지가 아니라 독립된 도메인으로 구현되어 있습니다.

주요 파일은 다음과 같습니다.

- [`src/components/LeagueScheduleManager.tsx`](D:/development/league-auction/src/components/LeagueScheduleManager.tsx)
- [`src/features/schedules/api/scheduleActions.ts`](D:/development/league-auction/src/features/schedules/api/scheduleActions.ts)
- [`src/components/ScheduleCalendar.tsx`](D:/development/league-auction/src/components/ScheduleCalendar.tsx)
- [`src/components/ScheduleMatchDayEditor.tsx`](D:/development/league-auction/src/components/ScheduleMatchDayEditor.tsx)
- [`src/components/ScheduleRosterPanel.tsx`](D:/development/league-auction/src/components/ScheduleRosterPanel.tsx)
- [`src/components/LeagueRecordSummaryPanel.tsx`](D:/development/league-auction/src/components/LeagueRecordSummaryPanel.tsx)
- [`src/features/schedules/utils/leagueRecords.ts`](D:/development/league-auction/src/features/schedules/utils/leagueRecords.ts)

핵심 책임은 다음과 같습니다.

- `league_schedules`에 일정 레코드 생성
- 날짜 키 기반의 `match_days` 서브컬렉션 관리
- 방 또는 경매 아카이브 데이터를 일정용 로스터 팀 구조로 변환
- 미완료 경기 기준으로 "다음 경기" 계산
- 경기 결과 검증 및 저장
- 일정 종료와 함께 우승팀을 명예의 전당에 반영
- 단계별 참가 팀만 추려서 순위표를 다시 계산하고, 상태 필터 기준으로 경기 수/완료 수/점수 합계를 재집계

이 기능에서 특히 중요한 부분은 로스터 복원입니다. 일정 레이어는 다음 데이터 원본을 이용해 팀 정보를 재구성할 수 있습니다.

- 현재 저장된 `rooms`
- 과거 `auction_archives`
- 중복 사용을 막기 위한 hall-of-fame 제외 목록

덕분에 원래의 실시간 경매방이 사라진 이후에도 일정 관리 기능은 계속 유효하게 동작할 수 있습니다.

## 명예의 전당 시스템

명예의 전당 기능은 [`src/features/hall-of-fame/api/hallOfFameActions.ts`](D:/development/league-auction/src/features/hall-of-fame/api/hallOfFameActions.ts)에 구현되어 있고, App Router 진입 페이지는 [`src/app/hall-of-fame/page.tsx`](D:/development/league-auction/src/app/hall-of-fame/page.tsx)입니다.

지원하는 기능은 다음과 같습니다.

- 명예의 전당 엔트리 목록 조회
- 아직 등록되지 않은 아카이브 목록 조회
- 관리자 코드 기반 수동 등록 및 삭제
- 리그 일정 종료 시 우승팀 자동 삽입

이 구조 덕분에 경매와 일정 도메인이 단순한 이벤트 처리에서 끝나지 않고, 장기적으로 축적되는 커뮤니티 기록으로 이어집니다.

## 프로젝트 구조

```text
src/
  app/
    api/room-auth/            토큰 검증 및 쿠키 부트스트랩
    hall-of-fame/             명예의 전당 페이지와 클라이언트 셸
    league-schedule/          리그 일정 라우트
    manifest.ts               PWA manifest 정의
    room/[id]/                실시간 경매방 라우트
    page.tsx                  홈 / 런처 화면
  components/
    create-room/              다단계 방 생성 플로우
    ui/                       공용 프리미티브 컴포넌트
    LeagueScheduleManager.tsx 일정 관리 셸
    LeagueRecordSummaryPanel.tsx 전적 요약, 필터, 경기 목록 UI
    PwaRegistration.tsx       프로덕션 서비스 워커 등록
  content/
    updateFeed.ts             홈 화면 티커 / 업데이트 피드
  features/
    auction/
      api/                    방, 채팅, 경매 흐름용 서버 액션
      components/             경매 전용 UI
      hooks/                  Firebase 동기화 및 방 제어 훅
      store/                  Zustand 경매 상태
      utils/                  방 생성 및 표시용 유틸리티
    hall-of-fame/
      api/                    아카이브 및 우승팀 등록 로직
      components/             명예의 전당 카드 및 모달 UI
    schedules/
      api/                    일정 CRUD 및 타임라인 로직
      types.ts                공용 일정 도메인 타입
      utils/                  경기 규칙, 전적 계산, 다음 경기 도출
  lib/
    firebase.ts               클라이언트 Firebase 초기화
    firebaseAdmin.ts          Admin SDK 초기화와 lazy Firestore proxy
public/
  sw.js                       PWA 서비스 워커
```

## 기술 스택

### 프론트엔드

- Next.js 16.1.6
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Framer Motion
- Lucide React
- Zustand

### 백엔드 및 데이터

- Firebase Firestore
- Firebase Realtime Database
- Firebase Admin SDK

### 툴링 및 테스트

- ESLint 9
- Vitest
- Testing Library
- Playwright
- `xlsx` 기반 스프레드시트 업로드 파싱

## 주요 구현 결정

### 1. 중요한 전환은 서버 액션, 지연 시간이 치명적인 입찰은 클라이언트 직접 트랜잭션

방 생성, 낙찰, 일정 관리 등 중요한 변경 작업은 서버 액션에 집중시켜 브라우저 신뢰도를 낮추고 도메인 규칙을 보호합니다. 
반면, 경매의 핵심이자 속도가 생명인 **입찰(placeBid)** 작업은 예외적으로 Firestore 클라이언트 SDK 직접 트랜잭션과 엄격한 Firestore 보안 규칙을 결합해 네트워크 홉(Hop)을 최소화하여 레이턴시를 획기적으로 단축했습니다.

### 2. 하나의 데이터베이스가 아니라 Firestore와 RTDB를 역할 분리해 사용

이 프로젝트는 Firebase의 두 저장소를 용도에 맞게 분리해서 사용합니다.

- Firestore: 구조화되고 조회 가능한 영속 도메인 상태
- RTDB: 연결 상태 추적과 경량 signal broadcast

이 분리는 단순한 이론이 아니라 실제 코드 구조에 그대로 드러나는 실용적 선택입니다.

### 3. 전체 계정 시스템 대신 토큰 기반 방 접근

커뮤니티 이벤트성 도구라는 특성상, 링크 기반 역할 입장은 완전한 인증 시스템보다 훨씬 단순합니다. 동시에 구현은 서버 검증과 `httpOnly` 쿠키를 유지해 최소한의 보안 통제를 확보합니다.

### 4. 경매 완료 이후를 고려한 아카이브 중심 확장

이 시스템은 "경매가 끝나면 종료"되지 않습니다. 완료된 방 데이터를 아카이브로 정규화해 저장함으로써, 이후 일정 관리와 시즌 기록 기능으로 자연스럽게 연결됩니다.

### 5. 기능 단위 중심의 저장소 구성

저장소는 다음과 같이 도메인 중심으로 정리되어 있습니다.

- `auction`
- `schedules`
- `hall-of-fame`

덕분에 서버 액션, 훅, 컴포넌트, 타입이 각 비즈니스 흐름 가까이에 배치되어 있습니다.

### 6. 설치형 웹앱 레이어를 별도 기능으로 얹은 구조

PWA 기능은 기존 비즈니스 로직을 흔들지 않도록 얇은 셸로 추가되어 있습니다.

- [`src/app/layout.tsx`](D:/development/league-auction/src/app/layout.tsx)에서 메타데이터, manifest, apple web app 옵션, 구조화 데이터를 설정
- [`src/app/manifest.ts`](D:/development/league-auction/src/app/manifest.ts)에서 웹앱 메타데이터를 생성
- [`src/components/PwaRegistration.tsx`](D:/development/league-auction/src/components/PwaRegistration.tsx)가 프로덕션에서만 서비스 워커를 등록
- [`public/sw.js`](D:/development/league-auction/public/sw.js)가 기본 정적 자산과 네비게이션 요청을 캐시

이 방식은 경매/일정/아카이브 도메인 코드와 설치형 셸을 분리해 유지보수 부담을 줄입니다.

## 이 프로젝트가 기술적으로 흥미로운 이유

- 정적인 CRUD 대시보드가 아니라, 다수 사용자가 동시에 참여하는 상태 중심 상호작용 문제를 다룹니다.
- 역할 기반 딥링크와 범위 제한 쿠키를 사용해 접근 절차를 단순화하면서도 서버 통제를 유지합니다.
- 실시간 UX와 낙찰 처리의 정합성을 동시에 고려한 입찰 구조를 가집니다.
- 라이브 이벤트를 일정 관리와 장기 아카이브 흐름으로 확장합니다.
- 흔한 SaaS UI가 아니라 제품 정체성이 분명한 시각 언어를 유지합니다.

## 참고 파일

기술 맥락을 빠르게 파악하기 좋은 핵심 진입 파일은 다음과 같습니다.

- [`package.json`](D:/development/league-auction/package.json)
- [`README.md`](D:/development/league-auction/README.md)
- [`src/app/page.tsx`](D:/development/league-auction/src/app/page.tsx)
- [`src/app/layout.tsx`](D:/development/league-auction/src/app/layout.tsx)
- [`src/app/manifest.ts`](D:/development/league-auction/src/app/manifest.ts)
- [`src/app/room/[id]/RoomClient.tsx`](D:/development/league-auction/src/app/room/[id]/RoomClient.tsx)
- [`src/features/auction/api/auctionFlowActions.ts`](D:/development/league-auction/src/features/auction/api/auctionFlowActions.ts)
- [`src/features/auction/api/roomActions.ts`](D:/development/league-auction/src/features/auction/api/roomActions.ts)
- [`src/features/auction/hooks/useAuctionRealtime.ts`](D:/development/league-auction/src/features/auction/hooks/useAuctionRealtime.ts)
- [`src/features/auction/hooks/usePresence.ts`](D:/development/league-auction/src/features/auction/hooks/usePresence.ts)
- [`src/features/schedules/api/scheduleActions.ts`](D:/development/league-auction/src/features/schedules/api/scheduleActions.ts)
- [`src/components/LeagueRecordSummaryPanel.tsx`](D:/development/league-auction/src/components/LeagueRecordSummaryPanel.tsx)
- [`src/features/schedules/utils/leagueRecords.ts`](D:/development/league-auction/src/features/schedules/utils/leagueRecords.ts)
- [`src/features/hall-of-fame/api/hallOfFameActions.ts`](D:/development/league-auction/src/features/hall-of-fame/api/hallOfFameActions.ts)
