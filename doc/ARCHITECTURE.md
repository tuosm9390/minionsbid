# 아키텍처 가이드 — Minions Bid

작성일: 2026-03-24
대상: Firebase 기반 실시간 경매 툴

---

## 1. 개요
Minions Bid는 초저지연 실시간 동기화가 핵심인 경매 애플리케이션입니다. **Firebase Realtime Database**를 주 엔진으로 사용하며, 복잡한 비즈니스 로직은 **Next.js Server Actions**를 통해 원자적으로 처리됩니다.

---

## 2. 데이터 아키텍처

### 데이터베이스 레이어
- **Firestore**: 방 설정, 선수 정보, 팀 구성 등 구조화되고 영구적인 데이터 저장.
- **Realtime Database (RTDB)**: 경매 타이머, 현재 입찰가, 실시간 채팅 등 100ms 미만의 지연시간이 필요한 동적 상태 관리.

### 데이터 흐름
1. **Mutation**: 클라이언트가 입찰(Bid) 또는 상태 변경 요청 → Next.js Server Action 호출.
2. **Validation**: 서버 사이드에서 권한, 포인트 잔액, 타이머 유효성 검증.
3. **Write**: 서버가 Firebase Admin SDK를 통해 Firestore/RTDB 업데이트.
4. **Broadcast**: Firebase RTDB가 연결된 모든 클라이언트에게 변경된 상태를 즉시 푸시.
5. **UI Update**: `useAuctionRealtime` 훅이 새로운 상태를 감지하고 Zustand 스토어 업데이트 → UI 리렌더링.

---

## 3. 프론트엔드 아키텍처

### 씬 시스템 (Scene System)
`AuctionBoard`는 복잡한 조건부 렌더링을 피하기 위해 **씬(Scene)** 개념을 사용합니다.
- `AuctionWaitingState`: 참여자 대기 및 연결 상태 확인.
- `LotteryAnimation`: 다음 경매 선수 추첨 (슬롯머신 애니메이션).
- `ActiveAuction`: 실시간 타이머 및 입찰 컨트롤 활성화.
- `AuctionResultModal`: 낙찰 결과 발표 및 팀 배정 확인.

### 컴포넌트 레이어링
1. **Core (lib)**: Firebase SDK 초기화, 유틸리티 함수.
2. **Hooks (features/auction/hooks)**: 실시간 구독(`useAuctionRealtime`), 비즈니스 로직 캡슐화(`useAuctionBoard`).
3. **Store (features/auction/store)**: 전역 경매 상태 관리 (Zustand).
4. **UI Elements**: 아토믹 단위의 픽셀 컴포넌트 (Button, Box, Badge).

---

## 4. 실시간 동기화 전략

### 입찰 (Bidding)
- 낙관적 업데이트(Optimistic UI) 대신 **서버 신뢰(Server Authority)** 방식을 사용합니다. 
- 입찰 버튼 클릭 시 즉시 로딩 상태로 전환하며, Firebase로부터 실제 데이터가 푸시되었을 때만 '선두' 상태를 표시합니다. 이는 0.1초 차이의 경합 상황에서 사용자에게 혼란을 주지 않기 위함입니다.

### 타이머 (Timer)
- 서버의 `timerEnds_at` 타임스탬프를 기준으로 각 클라이언트가 로컬에서 카운트다운을 수행합니다.
- 타이머 만료 시 주최자(Organizer) 클라이언트가 `awardPlayer` 액션을 트리거하여 서버에서 원자적으로 낙찰 처리를 수행합니다.

---

## 5. 보안 모델
- **Next.js Server Actions**: 클라이언트의 직접적인 DB 쓰기를 차단하고 모든 쓰기 요청은 서버를 경유합니다.
- **Firebase Security Rules**: 읽기 권한은 열려있으나(Realtime용), 쓰기는 Admin SDK(서버)로만 가능하도록 제한합니다.
- **React Portal**: 모달 시스템을 DOM 최상단에 배치하여 CSS 격리 및 보안성을 확보합니다.
