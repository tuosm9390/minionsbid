Date: 2026-03-23 15:30:00
Author: Antigravity

# 픽셀 테마 리디자인 및 UX 개선 계획서

본 계획서는 리그 오브 레전드 경매 툴의 '픽셀/게임' 정체성을 강화하면서도, 가독성 저하와 정적인 사용자 경험을 해결하기 위한 단계별 리디자인 전략을 담고 있습니다.

---

## 1. 디자인 컨텍스트 (Design Context)

- **타겟 유저**: 리그 오브 레전드 이스포츠 팬, 커뮤니티 경매 주최자 및 참여자.
- **디자인 톤 (Cyber-Pixel)**: 고전적인 8비트 픽셀 아트의 정겨움과 현대적인 사이버펑크의 선명한 대비(High Contrast)를 결합한 스타일.
- **핵심 목표**: 
  - **가독성 확보**: 8px~10px의 지나치게 작은 텍스트를 `ui-ux-pro-max` 기준(최소 12px)으로 상향 조정.
  - **생동감 부여**: 경매 상황(입찰, 낙찰, 긴박한 시간)에 따른 역동적인 시각적 피드백 제공.
  - **일관성 강화**: 산재된 버튼 및 카드 스타일을 통합 디자인 시스템으로 정제.

---

## 1-1. 정보 구조 (Information Architecture)

### 화면 상태 흐름 (Screen-State Flow)
```
[로딩 스켈레톤]
      ↓
[대기 화면: AuctionWaitingState]
  - 팀장 미접속 → 팀별 연결 상태 카드 그리드
  - 전원 접속 → "경매 준비 완료" + 방장 추첨 대기
      ↓ (방장: drawNextPlayer)
[추첨 애니메이션: LotteryAnimation]   ← 계획서 미포함 (3절에서 추가)
      ↓ (onFinished)
[경매 진행 화면: Active Auction]
  - CenterTimer (진행 중)
  - PlayerInAuction (경매 대상 선수)
  - BidStatus (현재 최고 입찰)
  - BiddingControl (입찰 컨트롤)
      ↓ (타이머 만료)
[낙찰 결과: AuctionResultModal 또는 보드 복귀]
      ↓ (미완료 선수 존재 시 루프)
[재경매/종료]
```

### 경매 방 데스크탑 레이아웃 (lg: grid-cols-12)
```
┌──────────────────────────────────────────────────────────┐
│  RoomHeader (방 이름, HowToUse, TERMINATE)               │
├────────────┬──────────────────────────┬───────────────────┤
│ TeamList   │  [방 이름 배너]           │                   │
│ (col-3)    │  ┌────────────────────┐  │  ChatPanel        │
│            │  │   AuctionBoard     │  │  (col-3)          │
│ - 내 팀    │  │ (Waiting/Lottery/  │  │                   │
│   (강조)   │  │  Active 상태)       │  │  - 시스템 로그    │
│ - 다른 팀  │  └────────────────────┘  │  - 유저 채팅      │
│ - 포인트   │  ┌────────────────────┐  │  - 입력창         │
│   게이지   │  │  BiddingControl    │  │                   │
│            │  │  (내 팀 전용)       │  │                   │
│ UnsoldPanel│  └────────────────────┘  │                   │
│ (유찰 목록)│                           │                   │
└────────────┴──────────────────────────┴───────────────────┘
```

### 모바일 우선순위 (375px, 단일 컬럼)
```
order-1: AuctionBoard + BiddingControl   ← 가장 중요, 최상단
order-2: ChatPanel                        ← 실시간 소통
order-3: TeamList (기본 접힘 아코디언)    ← 참고 정보, 탭 시 펼쳐짐
```

**[결정됨] 모바일 TeamList: 접을 수 있는 아코디언 패턴 적용**
- 기본값: 접힘 상태 (`[▼ 팀 현황 보기]` 버튼 노출)
- 탭 시: 전체 TeamList + UnsoldPanel 펼쳐짐
- 버튼 최소 높이: 48px (터치 타겟 확보)
- 버튼 스타일: `pixel-button` 계열, bg-black text-white, 전체 너비
- 펼침/접힘 아이콘: `▼` / `▲` 픽셀 화살표 또는 Galmuri 문자 활용

### 화면 계층: 각 상태별 시선 우선순위
| 상태 | 1순위 (시선) | 2순위 | 3순위 |
|------|-------------|-------|-------|
| 대기 | 팀별 접속 상태 카드 | 방장 대기 메시지 | — |
| 추첨 | LotteryAnimation 슬롯머신 | — | — |
| 경매 중 | CenterTimer (긴박감) | PlayerInAuction | BidStatus |
| 긴박 (≤5초) | CenterTimer (빨간/진동) | 입찰 버튼 | 현재 입찰가 |

---

## 1-2. 인터랙션 상태 명세 (Interaction State Coverage)

> 각 상태에서 유저가 **보는 것**을 정의한다. 백엔드 동작이 아닌 시각 명세.

| 컴포넌트 | LOADING | EMPTY | ERROR | SUCCESS / ACTIVE | 비고 |
|---------|---------|-------|-------|-----------------|------|
| **RoomClient** | `LOADING INSTANCE...` 전체 화면 pulse (현행 유지, 픽셀 폰트로 교체 권장) | `ERROR: ROOM NOT FOUND` pixel-box + RETURN TO MENU 버튼 | — | 정상 렌더 | — |
| **AuctionWaitingState** | — | *(해당 없음)* | — | ✅→`pixel-box` 그린 배지 / 💤→`pixel-box` 그레이 배지 (이모지 픽셀 스타일로 교체) | emoji aria-label 필요 |
| **BidStatus** | — | **[결정됨]** `pixel-box bg-gray-50 opacity-80` + ⏳ 아이콘 + "입찰 대기 중... 선수가 경매에 올라왔습니다." (font-heading, text-gray-500) | — | `bg-minion-yellow/20` + 👑 배지 (선두), `bg-white` (피추월) | `aria-live="polite"` 필요 |
| **BiddingControl** | `isBidding=true` → 버튼 disabled + "입찰 중..." 텍스트 + pixel-box 내 pulse | — | `bidError` → 버튼 하단 빨간 픽셀 박스 + 에러 메시지 (`text-minion-red font-heading`) | `isLeading=true` → 버튼 골드 광택(Shine) 애니 | 44px 터치 타겟 |
| **TeamList** | — | `--- 파티 데이터가 없습니다 ---` (현행 → 픽셀 스타일 적용) | — | 팀 카드 + 포인트 게이지 | 내 팀 최상단 고정 |
| **UnsoldPanel** | — | `유찰된 플레이어가 없습니다` (현행 유지, 긍정적 상태이므로 gray OK) | — | 유찰 선수 목록 | — |
| **CenterTimer** | — | — | — | 일반: 검정/노랑 / 긴박(≤5s): 빨강/진동/pulse | `aria-live="assertive"` 긴박 구간 |
| **ChatPanel** | — | "아직 메시지가 없습니다. 채팅을 시작해보세요!" (픽셀 스타일) | — | 시스템/유저 메시지 분리 (3절 ChatPanel 명세 참조) | — |
| **CreateRoomModal (각 스텝)** | `isLoading/isUploading=true` → 다음 버튼 disabled + "처리 중..." | — | 유효성 실패 → 입력 하단 빨간 픽셀 테두리 + 에러 텍스트 | 스텝 완료 → 체크 표시 + 다음 스텝 자동 포커스 | 픽셀 진행률 표시기 |
| **PlayerInAuction** | Framer Motion stagger reveal (현행 구현됨) | — | — | 선수 카드 완전 표시 | — |
| **LotteryAnimation** | 슬롯 스핀 진행 중 (`isSpinning=true`) | — | — | `hasFinished=true` → 파티클 + 결과 강조 (3절 명세 참조) | — |

---

## 1-3. 사용자 여정 & 감정 아크 (User Journey & Emotional Arc)

### 여정 스토리보드 (팀장 기준)

| 단계 | 유저 행동 | 감정 | 설계가 지원해야 할 것 |
|------|----------|------|----------------------|
| 1. 접속 | 링크로 방 입장 | 긴장, 기대 | 즉각적인 픽셀 테마 몰입, LOADING 화면이 게임 로딩 느낌 |
| 2. 대기 | 다른 팀장들 접속 확인 | 설렘, 약간의 초조 | 연결된 팀: 밝은 색상 강조 / 미연결: 흐릿한 grayed 처리 |
| 3. 추첨 | LotteryAnimation 슬롯 스핀 | **최고조** — 내 팀 소환이 될지 모르는 긴박감 | 슬롯 스핀 효과 + 사운드적 느낌의 시각 피드백 + 파티클 |
| 4. 경매 중 | 입찰가 입력 후 "BID" 클릭 | 집중, 경쟁 | CenterTimer 긴박감, BidStatus 실시간 갱신, 선두 시 골드 강조 |
| 5. 선두 | 내 팀이 가장 높은 입찰 | 승리감, 방어 의지 | BiddingControl 골드 Shine 애니 + "👑 선두" 배지 강조 |
| 6. 추월당함 | 다른 팀이 더 높게 입찰 | 긴박, 재도전 의지 | "입찰 밀림" 배지 + 입찰 컨트롤 시각적 강조 (빨간 테두리?) |
| 7. 낙찰 | 타이머 0 → 결과 확정 | 안도 또는 아쉬움 | AuctionResultModal — 승리팀 축하 / 패배팀 위로 (명세 필요) |
| 8. 다음 선수 | 반복 또는 종료 | 전략적 사고 | 포인트 게이지 업데이트, 남은 선수 수 표시 |

### LotteryAnimation 명세 (계획서 누락 항목 추가)

현재 구현 확인: 슬롯머신 스핀 (4.5초) → `hasFinished=true` → 파티클 방출 → `onFinished()` 콜백.

**[결정됨] 슬롯 완료 후 경매 시작: 방장 수동 트리거**

| 요소 | 명세 |
|------|------|
| 스핀 배경 | 풀스크린 오버레이, `bg-black/90`, 중앙 슬롯 |
| 스핀 중 | 슬롯 아이템: 선수 티어 이미지 + 이름 (ITEM_HEIGHT=160px 현행 유지) |
| 결과 확정 | 타겟 선수 카드 중앙 고정 + `pixel-box` 강조 테두리 (minion-yellow) |
| 파티클 | 12개 파티클, 픽셀 사각형 모양, minion-yellow/red 혼합 |
| 텍스트 | "경매 시작!" font-heading, text-fluid-xl, 텍스트 pulse 애니 |
| 결과 대기 | 완료 후 무한 대기. ORGANIZER에게만 `pixel-button bg-minion-yellow` "START AUCTION" 버튼 표시. 팀장/뷰어는 "방장의 시작을 기다리는 중..." 메시지 표시 |
| 접근성 | `aria-label="추첨 진행 중, 다음 경매 선수 결정 중"` |

### AuctionResultModal 명세 (계획서 누락 항목 추가)

현재 272라인 구현 존재. 계획서에 미언급.
- **낙찰 팀 표시**: 팀 이름 + 낙찰가 + 선수명 → `bg-minion-yellow` 강조 헤더
- **전체 입찰 내역**: 참여한 팀별 최고 입찰가 리스트
- **닫기**: 방장만 "다음 선수 추첨" 버튼 표시, 팀장은 "확인" 버튼만

---

## 2. 디자인 시스템 정립 (Phase 1)

### 2-1. 컬러 팔레트 (OKLCH 기반)
- **Primary (Minion Blue)**: `oklch(55% 0.15 250)` - 깊이 있는 블루를 메인으로 사용.
- **Accent (Minion Yellow)**: `oklch(85% 0.20 85)` - 주목도가 높은 선명한 옐로우.
- **Danger (Bid Red)**: `oklch(60% 0.25 25)` - 긴박한 상황이나 오류 메시지용.
- **Neutrals**: 단순 Gray 대신 Brand Hue가 가미된 `oklch(20% 0.02 250)` 계열의 틴티드 블랙 사용.

### 2-2. 타이포그래피 (`typeset` 적용)
- **Display (Heading)**: `DungGeunMo` (기존 유지) 또는 더 세련된 `Galmuri` 시리즈 활용.
- **Body (Text)**: 픽셀 폰트의 가독성 문제를 보완하기 위해 본문에는 `Pretendard`와 같은 고가독성 샌즈 폰트를 픽셀 스타일과 조화롭게 배치.
- **Scale**: `clamp(0.75rem, 1vw + 0.5rem, 1.25rem)` 공식을 적용한 유동적 폰트 스케일링.

---

## 3. 주요 컴포넌트 리디자인 세부 계획

### Phase 2: 경매 핵심 보드 (AuctionBoard & Board Components)
- **[AuctionWaitingState]**: 현재 ✅, 💤, ⏳ 이모지가 픽셀 테마를 깨뜨림. 교체 명세:
  - 연결됨: `pixel-box border-2 border-black bg-green-50` + `text-[12px] font-heading text-green-700` "ONLINE" 뱃지 + 초록 pulse dot
  - 미연결: `pixel-box border-2 border-black bg-gray-100 grayscale opacity-50` + "OFFLINE" 뱃지
  - 모든 상태 카드: `min-w-[120px]` 터치 타겟, `aria-label` 필수 (`"팀명: 연결됨/대기중"`)
- **[BidStatus]**: "입찰 밀림" 배지 (`bg-gray-200 text-gray-500`) 교체:
  - → `pixel-box border-2 border-minion-red bg-minion-red/10 text-minion-red text-fluid-xs font-heading` "OUTBID" 텍스트
  - 단순 gray는 Cyber-Pixel 아이덴티티와 불일치. 빨간 픽셀 박스로 긴박감 부여.
- **[AuctionBoard]**: 배경에 미세한 픽셀 그리드 패턴을 적용하고, 상태 변화(Idle -> Auction -> Result) 시 부드러운 배경 색상 전이(Transition) 효과 추가.
- **[CenterTimer]**: 단순히 숫자가 줄어드는 것이 아니라, 남은 시간이 5초 이하일 때 타이머가 진동(Shake)하거나 색상이 점진적으로 붉어지는 효과 구현.
- **[PlayerInAuction]**: 선수 카드 등장 시 `frontend-design`의 'Staggered Reveal' 애니메이션 적용. 선수 포지션별 전용 아이콘과 컬러를 더 강조하여 시인성 개선.

### Phase 3: 인터랙티브 컨트롤 (BiddingControl & Chat)
- **[BiddingControl]**:
  - 입찰 버튼을 더 크고 직관적으로 변경 (Touch Target `min-h-[48px]` 확보).
  - 입찰 성공 시 버튼이 '👑 선두' 상태로 변할 때 골드 광택(Shine) 애니메이션 추가:
    - `before:` pseudo-element: `bg-gradient-to-r from-transparent via-white/40 to-transparent`
    - `animate-shine`: `transform: translateX(-100%) → translateX(100%)`, `duration-700 ease-in-out`
  - 8px 수준의 작은 텍스트 레이블 → `text-fluid-xs` 교체 (Pass 5 목록 참조).
- **[ChatPanel]**:
  - **[결정됨] 메시지 시각 분리 — 게임 이벤트 로그 스타일:**
    - 시스템 메시지: `border-l-4 border-minion-blue bg-minion-blue/10 px-3 py-1.5` + `▶ [SYSTEM]` 뱃지 + `text-minion-blue text-fluid-xs font-heading`
    - 유저 채팅: `pixel-box bg-white border-2 px-3 py-2` (말풍선) + `[닉네임]:` `font-heading text-fluid-xs` + 본문 `font-body text-fluid-sm`
    - 입력창: `pixel-box border-2 border-black` + 전송 버튼 `pixel-button bg-minion-yellow min-h-[44px]`
  - 커스텀 픽셀 스크롤바: `custom-scrollbar` 클래스 적용 (이미 `globals.css`에 정의됨).

### Phase 4: 정보 시각화 및 가이드 (TeamList & Modals)
- **[TeamList]**: 팀별 포인트 잔액을 단순히 숫자로 보여주지 않고, 픽셀 스타일의 게이지 바(Gauge Bar)로 시각화하여 남은 자산 수준을 직관적으로 파악 가능하게 함.
- **[CreateRoomModal]**: 다단계 폼 진행 시 상단에 픽셀 미니언 캐릭터 진행률 표시기 추가.
  - **[결정됨] 미니언 캐릭터 방식**: Galmuri 폰트 이모지/문자로 미니언 표현, CSS `transform: translateX()` 로 현재 단계 위치로 이동 (애니메이션)
  - 완료 단계: `pixel-box bg-minion-yellow` + `✔` 아이콘
  - 현재 단계: `pixel-box border-4 border-black` 강조 (검정 테두리)
  - 미도달 단계: `pixel-box bg-gray-100 opacity-50`
  - 미니언 위치: 현재 단계 배지 위에 `absolute` 포지셔닝, `transition-transform duration-300 steps(4)`
  - 트랙: 단계 배지들을 잇는 `h-1 bg-black` 수평선 (완료 구간은 `bg-minion-yellow`)

---

## 4. 구현 및 검증 로드맵 (Roadmap)

1. **Task 1: 전역 스타일 및 디자인 토큰 설정** (`globals.css`, `tailwind.config.ts` 업데이트)
2. **Task 2: 공용 픽셀 UI 컴포넌트 라이브러리 구축** (Button, Input, Badge, Card)
3. **Task 3: AuctionBoard 및 내부 보드 컴포넌트 리디자인**
4. **Task 4: BiddingControl 및 ChatPanel 인터랙션 강화**
5. **Task 5: 전체 페이지 레이아웃 및 반응형 최적화**
6. **Task 6: 최종 폴리싱 (`polish`) 및 Delight 애니메이션 삽입**

---

## 3-1. 반응형 레이아웃 명세 (Responsive Layout)

### 브레이크포인트 정의
| 브레이크포인트 | 범위 | 레이아웃 전략 |
|--------------|------|-------------|
| `mobile` | 375px ~ 767px | 단일 컬럼, 순서: Board → Chat → TeamList(아코디언) |
| `tablet` | 768px ~ 1023px | 2컬럼: `grid-cols-[1fr_300px]` Board+Control / Chat, TeamList 하단 |
| `desktop` (lg) | 1024px+ | 3컬럼: `grid-cols-12` (3/6/3 비율) |

### 모바일 레이아웃 세부 명세 (375px)
- **AuctionBoard**: 전체 너비, 최소 높이 `min-h-[300px]`
- **BiddingControl**: 전체 너비, 버튼 높이 최소 `48px` (터치 타겟)
- **ChatPanel**: **[결정됨]** `max-h-[240px]` 고정 높이 + 내부 스크롤 (`custom-scrollbar`). 전체 너비, 항상 표시.
- **TeamList**: `order-3`, 기본 접힘 아코디언 (Pass 1 결정됨)
- **CenterTimer**: 폰트 크기 `text-fluid-xl` 유지 (숫자 크기 축소 금지)

### 터치 타겟 최소 크기 체크리스트 (44px 원칙)
| 요소 | 현재 | 요구사항 |
|------|------|---------|
| BID 버튼 | 명세 필요 | `min-h-[48px]` |
| +/- 입찰 조정 버튼 | 명세 필요 | `min-h-[44px] min-w-[44px]` |
| TeamList 아코디언 토글 | 신규 | `min-h-[48px]` |
| 모달 닫기(X) 버튼 | 명세 필요 | `min-h-[44px] min-w-[44px]` |
| RoomHeader 버튼들 | 명세 필요 | `min-h-[44px]` |

### 접근성 (A11y) 요구사항 명세
| 컴포넌트 | ARIA 요구사항 |
|---------|-------------|
| `CenterTimer` | `role="timer"`, `aria-live="assertive"` (긴박 ≤5s 구간), `aria-label="남은 시간: N초"` |
| `BidStatus` | `aria-live="polite"`, `aria-label="현재 최고 입찰: N포인트, 팀명"` |
| `AuctionWaitingState` 팀 카드 | `aria-label="팀명: 연결됨/대기중"` |
| `LotteryAnimation` | `aria-label="추첨 진행 중"`, 완료 시 `aria-label="추첨 완료: 선수명"` |
| 모달 전체 | `role="dialog"`, `aria-modal="true"`, 열림 시 포커스 트랩, 닫힘 시 트리거 버튼으로 포커스 복귀 |
| 폼 입력 | `aria-required`, `aria-invalid`, `aria-describedby` (에러 메시지 연결) |
| 픽셀 배지/아이콘 | 의미 있는 아이콘 → `aria-label` 필수, 장식용 → `aria-hidden="true"` |

### 색상 대비 요구사항 (WCAG AA)
- 일반 텍스트: 4.5:1 이상
- 큰 텍스트 (18px+): 3:1 이상
- **주의**: `text-minion-grey` (`oklch(55% 0.02 250)`) 흰 배경 사용 시 대비 확인 필요

---

## 3-2. 미결 디자인 결정사항 표

| 결정 필요 항목 | 미결 시 발생하는 문제 |
|--------------|-------------------|
| ChatPanel 시스템/유저 메시지 시각 분리 | **[결정됨]** 게임 이벤트 로그 스타일 적용 (아래 명세 참조) |
| AuctionBoard 상태별 배경 전환 색상 | 임의 색상 적용, Cyber-Pixel 정체성과 불일치 |

### [즉시 확정] 계획 내 누락 컴포넌트 명세

**[NoticeBanner]** — 방장 공지 브로드캐스트 (이미 구현됨, 계획서 미포함)
- 현재 구현: `bg-black border-b-4 border-minion-yellow` + 황금 dot-grid 배경 + 바운스 픽셀 도트 → **유지**
- `text-[10px]` 뱃지 → `text-fluid-xs` 교체 필요 (Pass 5 위반 목록에 추가)
- 동작: 채팅 패널 위 고정 배너, `hover`시 텍스트 전체 표시 (현행 유지)
- 접근성: `role="alert"`, `aria-live="assertive"` 추가 필요

**[DraftPanel]** — 현재 구현 2라인 수정만 있고 기능 변경 없음 → 본 계획 범위 외

### [확정] TeamList 포인트 게이지 바 명세
코드에서 `(pointBalance / 1000) * 100` 공식 확인 → 시작 포인트 = 1000P 기준:
- 게이지 최대값: **1000P** 기준
- 색상 단계:
  - 60% 이상: `bg-minion-blue` (여유 있음)
  - 30~59%: `bg-minion-yellow` (주의)
  - 30% 미만: `bg-minion-red animate-pulse` (긴박)
  - 0%: `bg-gray-300 grayscale` (입찰 불가 상태)
- 게이지 바: `pixel-box h-3 border-2` + 내부 컬러 바, 트랜지션 `duration-300`

### [확정] AuctionBoard 상태별 배경 전환 색상
- **대기(Waiting)**: `bg-gray-50` (밝은 중립) — 기다리는 느낌
- **추첨(Lottery)**: `bg-black` 풀스크린 오버레이 (LotteryAnimation이 덮음)
- **경매 중(Active)**: `bg-white` — 집중을 위한 깔끔한 배경
- **긴박(≤5s)**: 테두리 `border-minion-red` 추가 + 미세한 `bg-minion-red/5` tint
- 전환: `transition-colors duration-500`

---

## 4-1. 디자인 시스템 정합성 체크리스트

### DESIGN.md 부재 경고
DESIGN.md가 없음. 현재 디자인 결정들이 이 계획서와 `globals.css`에 산재. 본 계획 완료 후 DESIGN.md 작성 권장 (향후 개발 일관성 확보).

### 타이포그래피 시맨틱 스케일 (확정)
| 역할 | 클래스 | 예시 |
|------|--------|------|
| 화면 제목 | `text-fluid-xl font-heading` | 방 이름, 모달 제목 |
| 섹션 제목 | `text-fluid-lg font-heading` | 선수 이름, 팀 이름 |
| 강조 숫자 | `text-fluid-lg font-black tabular-nums` | 입찰가, 포인트 |
| 본문 | `text-fluid-sm font-body` | 설명 텍스트 |
| 레이블/배지 | `text-fluid-xs font-heading uppercase` | 헤더 레이블, 상태 배지 |
| **최소 허용** | `text-fluid-xs` (≈ 11.2px~13.6px) | **`text-[Npx]` 하드코딩 금지** |

### 하드코딩 텍스트 크기 위반 목록 (구현 시 반드시 수정)
> 계획의 "최소 12px" 원칙을 위반하는 현재 코드 잔존 항목:

| 파일 | 위반 클래스 | 교체 대상 |
|------|------------|---------|
| `BidStatus.tsx` L33 | `text-[10px]` | `text-fluid-xs` |
| `BidStatus.tsx` L42 | `text-[9px]` | `text-fluid-xs` |
| `BiddingControl.tsx` L61, L64 | `text-[10px]` | `text-fluid-xs` |
| `BiddingControl.tsx` L72 | `text-[9px]` | `text-fluid-xs` |
| `TeamList.tsx` L44 | `text-[9px]` | `text-fluid-xs` |
| `RoomClient.tsx` L232 | `text-[10px]` | `text-fluid-xs` |

---

## 5. NOT in scope (명시적 제외 항목)

| 항목 | 제외 이유 |
|------|---------|
| 사운드 효과 (입찰음, 낙찰음) | 브라우저 정책/UX 복잡도 증가, 별도 스프린트 |
| 다크 모드 | 현재 Cyber-Pixel 팔레트는 라이트 모드 기준으로 설계됨 |
| DraftPanel 리디자인 | 2라인 수정만 있고 기능 변경 없음 |
| i18n / 다국어 지원 | 한국어 단일 서비스 |
| 애니메이션 감소 모드 (`prefers-reduced-motion`) | 중요하지만 이번 스프린트 범위 외 — 추후 TODOS.md에 추가 권장 |

---

## 6. What Already Exists (재사용 가능한 기존 패턴)

| 패턴/토큰 | 위치 | 재사용 방법 |
|---------|------|-----------|
| `pixel-box`, `pixel-button` | `globals.css` | 모든 신규 컴포넌트에 기본 적용 |
| `pixel-shadow`, `pixel-shadow-sm` | `globals.css` | 카드/패널 그림자 |
| `text-fluid-xs/sm/base/lg/xl` | `globals.css` | 모든 텍스트 크기 (하드코딩 대체) |
| `custom-scrollbar` | `globals.css` | 스크롤 있는 컨테이너 전체 |
| `animate-slide-up`, `animate-slide-in-left/right` | `globals.css` | 엔트리 애니메이션 |
| `delay-100/200/300/400` | `globals.css` | 스태거 효과 |
| Framer Motion `staggerChildren` | `PlayerInAuction.tsx` | TeamList 카드에 동일 패턴 적용 가능 |
| OKLCH 색상 토큰 | `globals.css` | 직접 색상값 대신 토큰 사용 |
| `shake`, `minion-bounce`, `glitch` keyframes | `globals.css` | CenterTimer 등 이미 구현됨 |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | **CLEAN** | 3 issues resolved, 0 critical gaps (FULL_REVIEW) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score: 5/10 → 8/10, 7 decisions made (FULL) |

**UNRESOLVED:** 0 (across all reviews)

**VERDICT:** ENG CLEARED — 구현 준비 완료. `/ship` 사용 가능.

---

## 8. 검증 계획 (Verification)

- **시각적 일관성 검사**: 모든 페이지에서 동일한 픽셀 두께와 그림자 값을 유지하는가?
- **가독성 테스트**: 최소 폰트 크기 12px 이상 유지 및 색상 대비 비율(4.5:1) 준수 확인.
- **모바일 최적화**: 375px 환경에서도 모든 입찰 컨트롤이 정상적으로 동작하고 가독성이 확보되는가?
- **성능**: 복잡한 애니메이션 추가 시에도 60fps 인터랙션을 유지하는가?
