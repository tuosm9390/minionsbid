# 🎮 Minions Bid (실시간 리그 경매 플랫폼)

## 프로젝트 개요 (Overview)
**Minions Bid**는 리그 오브 레전드 커뮤니티 토너먼트와 팀 드래프트를 위해 설계된 고성능 실시간 멀티플레이어 경매 시스템입니다. 주최자와 팀장(Captain)들이 거의 제로에 가까운 지연율(Near-zero latency)로 선수 경매를 진행할 수 있게 하여, 공정하고 몰입감 있는 드래프트 경험을 보장합니다. 전통적인 8비트 레트로 아트와 현대적인 사이버펑크 요소를 혼합한 독특한 **Cyber-Pixel** 미학(Aesthetic)이 특징입니다.

## 핵심 파이프라인 (Core Pipeline)
이 프로젝트는 데이터 지속성(Persistence)과 성능의 균형을 맞추기 위해 **하이브리드 Firebase 접근 방식을 사용한 서버 권한(Server-Authority) 실시간 아키텍처**를 따릅니다.

1. **방 생성 및 초기 설정 (Room Creation & Setup)**
   주최자가 방을 생성하고 Excel(`.xlsx`) 파일을 통해 선수 명단을 업로드합니다. 이 정적 데이터와 기본 구조는 **Cloud Firestore**에 영구 저장됩니다.
2. **상태 머신 기반 씬 제어 (Scene-Based State Machine)**
   경매 진행률은 개별적인 "Scene"(대기 → 추첨 → 진행 중 → 결과) 단위로 엄격히 관리되어 복잡한 조건부 렌더링 버그를 방지합니다.
3. **실시간 동기화 (Real-time Synchronization)**
   - **Firestore (`onSnapshot`)**: 선수 상태, 팀 잔여 포인트, 채팅 메시지와 같이 영속성이 필요한 구조 데이터를 동기화합니다.
   - **Firebase Realtime Database (RTDB)**: 추첨 애니메이션 시작 신호, 즉각적인 입찰 알림 등 100ms 이하의 빠른 피드백이 필요한 초저지연 시그널을 처리합니다.
4. **원자적 상태 변이 (Atomic Mutations)**
   입찰(Bidding) 및 낙찰(Awarding)과 같은 모든 상태 변경은 Firebase Admin SDK를 사용하는 **Next.js Server Actions**를 통해 처리되어 데이터의 원자성을 보장하고 클라이언트 단에서의 조작을 원천 차단합니다.

## 프로젝트 구조 (Project Structure)
```text
league-auction/
├── src/app/              # Next.js App Router 페이지 및 API 라우트
├── src/features/auction/ # 경매 비즈니스 로직을 포함한 도메인 주도 모듈
│   ├── api/              # 데이터베이스 뮤테이션을 위한 Server Actions
│   ├── components/       # Scene별 전용 UI 컴포넌트 (`AuctionBoard`, `BiddingControl` 등)
│   ├── hooks/            # 실시간 동기화(`useAuctionRealtime`) 및 UI 로직을 위한 Custom Hooks
│   └── store/            # Zustand를 활용한 클라이언트 전역 상태 관리
├── src/lib/              # 공유 인프라 (Firebase 초기화, 공통 유틸리티)
└── doc/                  # 아키텍처, 로직, 디자인 컨벤션을 다루는 기술 문서
```

## 상세 기능 구현 (Technical Implementation)

- **서버 권한 기반 입찰 동기화 (Real-time Bidding & Consistency)**
  고속 입찰 경쟁 시 발생하는 경쟁 상태(Race Condition)를 방지하기 위해 엄격한 **Server Authority** 모델을 사용합니다. 클라이언트에서 발생한 입찰을 즉시 긍정적 렌더링(Optimistic UI) 처리하지 않고, 서버 측이 입찰을 확정하고 Firebase를 통해 값을 내려줄 때만 UI에 "선두(Leading)" 상태를 반영하여 모든 참여자가 정확히 동일한 화면을 보도록 보장합니다.
- **슬롯 애니메이션 및 동기화 (Lottery & Animation System)**
  선수 추첨 과정은 **Framer Motion**으로 구축된 커스텀 슬롯 머신 애니메이션을 사용합니다. RTDB의 신호를 통해 애니메이션 종료와 동시에 모든 클라이언트의 경매 타이머가 1ms의 오차 없이 동시에 시작되도록 정밀 시점을 제어합니다.
- **반응형 Cyber-Pixel UI 시스템**
  `DESIGN.md`에 정의된 자체 디자인 시스템을 기반으로 반응형 UI를 구축했습니다:
  - **유동적 타이포그래피 (Fluid Typography)**: CSS `clamp()`와 커스텀 Tailwind 토큰을 통해 디바이스 화면비에 제한 없는 자연스러운 배율 스케일링을 지원합니다.
  - **픽셀 퍼펙트 컴포넌트 설계**: 두께감 있는 테두리(`border-4`)와 OKLCH 고대비 색상을 사용하여 특유의 레트로/사이버펑크 UI 요소를 구현했습니다.
  - **Portal 기반 모달**: 모든 상호작용 오버레이는 React Portals를 사용하여 복잡한 레이아웃에서 발생하는 Z-index 및 Stacking Context 문제를 회피했습니다.

## 사용 기술 및 라이브러리 (Tech Stack)

- **Frontend Core**: Next.js 15 (App Router), TypeScript (Strict Mode)
- **Database (Hybrid)**: Firebase Firestore (영구 데이터) + Firebase Realtime Database (초저지연 상태)
- **State Management**: Zustand
- **Styling**: Tailwind CSS v4, Framer Motion
- **Tooling**: Vitest, Playwright, ExcelJS

## 주요 구현 특징 (Key Highlights)

1. **Low-Latency Experience**: 0.1초의 차이가 결과를 가르는 실시간 상호작용 시스템에 최적화된 아키텍처를 구성했습니다.
2. **Scalable Data Management**: 최적화된 데이터 구독 모델과 엑셀 기반 일괄 데이터 처리를 통해 대규모 선수 명단을 원활히 관리합니다.
3. **Aesthetic Distinction**: 일률적인 대시보드 뷰와 차별화되는 몰입감 높은 8-bit 스타일의 시각적 정체성을 확립했습니다.
4. **Zero-Trust Security**: Server Action 레이어의 엄격한 유효성 검사와 Firebase Security Rules를 결합하여 완벽한 데이터 무결성을 보장합니다.
