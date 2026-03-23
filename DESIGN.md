# Design System — MinionsBid

## Product Context
- **What this is:** 리그 오브 레전드 커뮤니티를 위한 실시간 멀티플레이어 선수 경매 도구. 여러 팀이 동시에 접속해 경매 이벤트를 진행한다.
- **Who it's for:** 리그 오브 레전드 이스포츠 팬, 커뮤니티 경매 주최자(방장), 팀장, 관전자.
- **Space/industry:** 게임 커뮤니티 도구 / 실시간 경매 SaaS
- **Project type:** 실시간 웹 앱 (경매 보드 + 팀 관리 + 라이브 채팅)

---

## Aesthetic Direction
- **Direction:** Cyber-Pixel — 고전적인 8비트 픽셀 아트의 정겨움과 현대 사이버펑크의 선명한 고대비(High-Contrast)를 결합.
- **Decoration level:** Intentional — 픽셀 그리드 배경, CRT 노이즈 오버레이, 4px 실선 테두리, `pixel-shadow` 등 의도적인 텍스처 사용.
- **Mood:** 화면 전체가 게임 아케이드 스크린처럼 느껴져야 한다. 참여자 모두가 집중하는 "라이브 무대" 감각. 개인용 도구가 아닌 집단이 함께 보는 이벤트 화면.
- **Anti-patterns:** 보라/바이올렛 그라디언트, 균일한 border-radius 버블, 일반적인 SaaS 카드 그리드, "Clean, modern UI" 류의 중립적 표현 금지.

---

## Typography

### Font Stack
| 역할 | 폰트 | 변수 | 비고 |
|------|------|------|------|
| **Display / Heading** | Press Start 2P | `--font-heading: var(--font-press-start)` | 레이블, 배지, 버튼 텍스트, 헤더 — 올캡스 사용 |
| **Pixel / UI Accent** | Galmuri11 | `--font-pixel: 'Galmuri11'` | 픽셀 버튼, 숫자, 인게임 느낌이 필요한 UI 요소 |
| **Body / High-readability** | Pretendard | `--font-body: 'Pretendard'` | 설명 텍스트, 채팅, 폼 입력값 — 기본 body 폰트 |

```css
@import url('https://cdn.jsdelivr.net/npm/galmuri@latest/dist/galmuri.css');
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
/* Press Start 2P: Next.js localFont로 로드 (layout.tsx) */
```

### 타이포그래피 시맨틱 스케일 (확정)
| 역할 | 클래스 | 실제 크기 범위 | 예시 |
|------|--------|---------------|------|
| 화면 제목 | `text-fluid-xl font-heading` | 28px ~ 40px | 방 이름, 모달 제목 |
| 섹션 제목 | `text-fluid-lg font-heading` | 20px ~ 28px | 선수 이름, 팀 이름 |
| 강조 숫자 | `text-fluid-lg font-black tabular-nums` | 20px ~ 28px | 입찰가, 포인트 |
| 본문 | `text-fluid-sm font-body` | 13.6px ~ 16px | 설명 텍스트 |
| 레이블 / 배지 | `text-fluid-xs font-heading uppercase` | 11.2px ~ 13.6px | 헤더 레이블, 상태 배지 |
| **최소 허용** | `text-fluid-xs` | **≥ 11.2px** | **`text-[Npx]` 하드코딩 절대 금지** |

### Fluid Typography Clamp 공식
```css
.text-fluid-xs  { font-size: clamp(0.70rem, 0.60rem + 0.50vw, 0.85rem); }
.text-fluid-sm  { font-size: clamp(0.85rem, 0.75rem + 0.50vw, 1.00rem); }
.text-fluid-base{ font-size: clamp(1.00rem, 0.90rem + 0.50vw, 1.25rem); }
.text-fluid-lg  { font-size: clamp(1.25rem, 1.10rem + 0.75vw, 1.75rem); }
.text-fluid-xl  { font-size: clamp(1.75rem, 1.50rem + 1.25vw, 2.50rem); }
```

---

## Color

### Approach: Expressive with Restraint
3개 브랜드 컬러(yellow/blue/red) + 틴티드 중립 팔레트. 색상은 의미를 전달하는 수단이며, 배경에 무분별하게 쓰지 않는다.

### OKLCH 팔레트
| 토큰 | OKLCH 값 | Tailwind 클래스 | 용도 |
|------|---------|----------------|------|
| `--color-minion-yellow` | `oklch(88.3% 0.17 90)` | `bg-minion-yellow` / `text-minion-yellow` | Primary — CTA 버튼, 하이라이트, 선두 입찰 강조 |
| `--color-minion-yellow-hover` | `oklch(82% 0.18 90)` | `hover:bg-minion-yellow-hover` | Yellow 호버 상태 |
| `--color-minion-blue` | `oklch(50% 0.14 250)` | `bg-minion-blue` | Secondary — 채팅 헤더, 정보 배지 |
| `--color-minion-blue-hover` | `oklch(42% 0.15 250)` | — | Blue 호버 상태 |
| `--color-minion-red` | `oklch(62% 0.22 25)` | `bg-minion-red` | Danger — 오류, 긴박, OUTBID 상태, TERMINATE 버튼 |
| `--color-minion-red-hover` | `oklch(54% 0.23 25)` | — | Red 호버 상태 |
| `--color-minion-grey` | `oklch(55% 0.02 250)` | — | 비활성 텍스트 (흰 배경 사용 시 대비 확인 필요) |
| `--color-minion-skin` | `oklch(82% 0.12 60)` | — | 미니언 캐릭터 스킨 색상 |

### 배경 / 중립 팔레트
| 역할 | CSS 변수 | OKLCH 값 |
|------|---------|---------|
| 앱 배경 | `--background` | `oklch(92% 0.01 250)` — 틴티드 라이트 그레이 |
| 텍스트 | `--foreground` | `oklch(15% 0.02 250)` — 틴티드 딥 블랙 |
| 카드 / 패널 | `--card` | `oklch(100% 0 0)` — 순백 |
| 테두리 | `--border` | `oklch(0% 0 0)` — 순흑 (픽셀 아트 특성) |
| 입력 배경 | `--input` | `oklch(98% 0.01 250)` |

### 씬(Scene)별 배경 전환 (AuctionBoard)
| 씬 | 배경 클래스 | 전환 |
|----|------------|------|
| 대기(Waiting) | `bg-gray-50` | 기다리는 느낌의 밝은 중립 |
| 추첨(Lottery) | `bg-black` | LotteryAnimation 풀스크린 오버레이가 덮음 |
| 경매 중(Active) | `bg-white` | 집중을 위한 깔끔한 배경 |
| 긴박(≤5s) | `bg-white + border-minion-red + bg-minion-red/5 tint` | 위험 신호 |
| 전환 | `transition-colors duration-500` | — |

### TeamList 포인트 게이지 컬러 단계
| 잔액 비율 | 게이지 색상 | 의미 |
|---------|-----------|------|
| 60% 이상 | `bg-minion-blue` | 여유 있음 |
| 30~59% | `bg-minion-yellow` | 주의 |
| 30% 미만 | `bg-minion-red animate-pulse` | 긴박 |
| 0% | `bg-gray-300 grayscale` | 입찰 불가 |
| 기준 | **1000P** 기준 (100% = 1000P) | — |

### 다크 모드
현재 미지원. Cyber-Pixel 팔레트는 라이트 모드(흰 배경 + 검정 테두리) 기준으로 설계됨. 추후 별도 스프린트.

---

## Spacing

- **Base unit:** 4px (Tailwind 기본)
- **Density:** Compact — 경매 화면은 정보 밀도가 높음. 여백 낭비 금지.
- **스케일:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **패널 내부 패딩:** `p-4` (16px) 표준. 작은 배지/레이블은 `px-3 py-1.5` 또는 `px-4 py-2`.

---

## Layout

### Approach: Grid-Disciplined (데스크탑) + Column-Priority (모바일)

### 브레이크포인트
| 브레이크포인트 | 범위 | 전략 |
|--------------|------|------|
| mobile | 375px ~ 767px | 단일 컬럼, 우선순위 순서 지정 |
| tablet | 768px ~ 1023px | 2컬럼: `grid-cols-[1fr_300px]` |
| desktop (lg) | 1024px+ | 3컬럼: `grid-cols-12` (3/6/3 비율) |

### 데스크탑 레이아웃 (lg: grid-cols-12)
```
┌──────────────────────────────────────────────────────────┐
│  RoomHeader (방 이름, HowToUse, TERMINATE)               │
├────────────┬──────────────────────────┬───────────────────┤
│ TeamList   │  [방 이름 배너]           │ UnsoldPanel       │
│ (col-3)    │  ┌────────────────────┐  │ ChatPanel         │
│            │  │   AuctionBoard     │  │ (col-3)           │
│            │  │ (Waiting/Lottery/  │  │                   │
│            │  │  Active 씬 시스템)  │  │                   │
│            │  └────────────────────┘  │                   │
│            │  ┌────────────────────┐  │                   │
│            │  │  BiddingControl    │  │                   │
│            │  │  (LEADER 전용)     │  │                   │
│            │  └────────────────────┘  │                   │
└────────────┴──────────────────────────┴───────────────────┘
```

### 모바일 레이아웃 (375px, 단일 컬럼)
```
order-1: AuctionBoard + BiddingControl   ← 가장 중요, 최상단
order-2: ChatPanel (max-h-240px 고정)    ← 실시간 소통
order-3: TeamList (기본 접힘 아코디언)   ← 참고 정보
```

### 모바일 TeamList 아코디언
- 기본값: 접힘 (`[▼ 팀 현황 보기]` 버튼 노출)
- 탭 시: 전체 TeamList + UnsoldPanel 펼쳐짐
- 토글 버튼: `pixel-button bg-black text-white w-full min-h-[48px]`

### Max content width
- `max-w-7xl mx-auto` (1280px)

### Border Radius
- **전역: `--radius: 0rem`** — 픽셀 아트 특성상 모든 모서리는 직각
- `rounded-*` 클래스 사용 금지 (의도적인 예외만 허용, 주석 필요)

---

## Component Tokens

### `pixel-box`
```css
background-color: white;
border: 4px solid black;
box-shadow: var(--pixel-shadow);  /* 6px 6px 0px 0px rgba(0,0,0,1) */
transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
```

### `pixel-button`
```css
border: 4px solid black;
font-family: var(--font-pixel);
font-weight: bold;
text-transform: uppercase;
transition: all 0.1s steps(2);  /* 스텝 트랜지션 — 픽셀 감각 */
box-shadow: var(--pixel-shadow-sm);  /* 4px 4px 0px 0px rgba(0,0,0,1) */

:hover  → transform: translate(-1px, -1px); box-shadow: 6px 6px ...
:active → box-shadow: 2px 2px ...; transform: translate(2px, 2px)
:disabled → opacity: 0.5; cursor: not-allowed; filter: grayscale(1)
```

### `custom-scrollbar`
픽셀 아트 스크롤바. 16px 너비, 4px solid black 테두리. 스크롤 있는 모든 컨테이너에 적용.

### `crt-overlay`
배경에 래디얼 그라디언트 dot-grid + 수평 라인 패턴 (`background-image`). 아케이드 CRT 모니터 질감.

### `pixel-noise`
`absolute inset-0 z-0` 노이즈 레이어. 경매방 배경 텍스처.

---

## Motion

- **Approach:** Intentional — 씬 전환(Scene system)에는 의미 있는 애니메이션, 장식적 효과는 절제.
- **핵심 시스템:** `AnimatePresence mode="wait"` + 씬별 고유 `variants`
- **`prefers-reduced-motion`:** 감지 시 모든 애니메이션 비활성화 (globals.css + `useReducedMotion()`)

### Easing
| 용도 | 값 |
|------|---|
| Enter (부드러운 착지) | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Pop (탄력 등장) | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Exit | `ease-in` 또는 `easeIn` |
| 픽셀 버튼 | `steps(2)` — 2프레임 점프 (아날로그 아닌 디지털 느낌) |

### Duration
| 레벨 | 범위 | 예시 |
|------|------|------|
| micro | 50~100ms | 버튼 hover/active |
| short | 150~250ms | Exit 애니메이션 |
| medium | 250~500ms | Enter 씬 전환 |
| long | 500~700ms | SoldOverlay, 최초 로딩 |

### 씬(Scene) Variants — AuctionBoard
```typescript
const sceneVariants = {
  waiting:  { initial: { y: 20, opacity: 0 },     animate: { y: 0, opacity: 1,  transition: { duration: 0.4, ease: [0.16,1,0.3,1] } },   exit: { y: -20, opacity: 0, transition: { duration: 0.25 } } },
  lottery:  { initial: { scale: 0.85, opacity: 0 }, animate: { scale: 1, opacity: 1, transition: { duration: 0.5, ease: [0.34,1.56,0.64,1] } }, exit: { scale: 1.1, opacity: 0, transition: { duration: 0.3 } } },
  bidding:  { initial: { y: -30, opacity: 0 },    animate: { y: 0, opacity: 1,  transition: { duration: 0.5, ease: [0.16,1,0.3,1] } },   exit: { x: 100, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } } },
  draft:    { initial: { x: -20, opacity: 0 },    animate: { x: 0, opacity: 1,  transition: { duration: 0.4 } },                          exit: { opacity: 0, transition: { duration: 0.2 } } },
  finished: { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1, transition: { duration: 0.6, ease: [0.34,1.56,0.64,1] } }, exit: {} },
}
```

### 진행 중인 씬 타임라인
```
대기 ──[slide-up]──→ 추첨 ──[pop]──→ 경매중 ──[drop+stagger]──→
타이머 종료 → SOLD! ──[flash+scale]──→ [2초 자동 닫힘] ──[fade]──→ 다음 선수
```

### Entry Animations (CSS)
- `animate-slide-up`: `translateY(20px→0)` + `opacity(0→1)`, 0.5s
- `animate-slide-in-left/right`: `translateX(±20px→0)` + `opacity(0→1)`, 0.5s
- `delay-100/200/300/400/500`: 스태거 딜레이 유틸리티

### 특수 애니메이션
| 이름 | 용도 | 특징 |
|------|------|------|
| `animate-timer-tick` | CenterTimer 매 초 틱 | `translate3d`, GPU 합성, 0.15s |
| `animate-urgent-shake` | CenterTimer ≤5s 긴박 | scale(1.04) + translate, 단발 발화 0.3s |
| `animate-shimmer` | BiddingControl 선두 버튼 | `shimmer 2s infinite` |
| `animate-minion-bounce` | 로딩, 장식용 | bounce + squash, 1s infinite |
| `animate-glitch` | 오류/특수 상황 | translate ±2px, 1s infinite |
| `animate-shake` | 오류 상태 | cubic-bezier, 0.4s infinite |

---

## Accessibility

### 터치 타겟 최소 크기 (44px 원칙)
| 요소 | 요구사항 |
|------|---------|
| BID 버튼 | `min-h-[48px]` |
| +/- 입찰 조정 버튼 | `min-h-[44px] min-w-[44px]` |
| TeamList 아코디언 토글 | `min-h-[48px]` |
| 모달 닫기(X) 버튼 | `min-h-[44px] min-w-[44px]` |
| RoomHeader 버튼 | `min-h-[44px]` |
| 채팅 입력 전송 버튼 | `min-h-[44px]` |

### ARIA 요구사항
| 컴포넌트 | ARIA |
|---------|------|
| `CenterTimer` | `role="timer"`, `aria-live="assertive"` (≤5s), `aria-label="남은 시간: N초"` |
| `BidStatus` | `aria-live="polite"`, `aria-label="현재 최고 입찰: N포인트, 팀명"` |
| `AuctionWaitingState` 팀 카드 | `aria-label="팀명: 연결됨/대기중"` |
| `LotteryAnimation` | `aria-label="추첨 진행 중"` → 완료: `aria-label="추첨 완료: 선수명"` |
| `NoticeBanner` | `role="alert"`, `aria-live="assertive"` |
| 모달 전체 | `role="dialog"`, `aria-modal="true"`, 포커스 트랩, 닫힘 시 트리거로 포커스 복귀 |
| 폼 입력 | `aria-required`, `aria-invalid`, `aria-describedby` |
| 의미 있는 아이콘 | `aria-label` 필수 |
| 장식용 아이콘/이모지 | `aria-hidden="true"` |

### 색상 대비 (WCAG AA)
- 일반 텍스트: 4.5:1 이상
- 큰 텍스트 (18px+): 3:1 이상
- **주의:** `text-minion-grey` (`oklch(55% 0.02 250)`) 흰 배경 사용 시 대비 확인 필요

---

## Component Specs

### BidStatus
- Empty: `pixel-box bg-gray-50 opacity-80` + ⏳ + "입찰 대기 중... 선수가 경매에 올라왔습니다." (`font-heading text-gray-500`)
- 선두: `bg-minion-yellow/20` + 👑 배지
- OUTBID: `pixel-box border-2 border-minion-red bg-minion-red/10 text-minion-red text-fluid-xs font-heading` "OUTBID"

### ChatPanel 메시지 분리
- **시스템:** `border-l-4 border-minion-blue bg-minion-blue/10 px-3 py-1.5` + `▶ [SYSTEM]` 배지 + `text-minion-blue text-fluid-xs font-heading`
- **유저:** `pixel-box bg-white border-2 px-3 py-2` (말풍선) + `[닉네임]:` `font-heading text-fluid-xs` + 본문 `font-body text-fluid-sm`
- **입력:** `pixel-box border-2 border-black` + 전송 `pixel-button bg-minion-yellow min-h-[44px]`
- Empty: "아직 메시지가 없습니다. 채팅을 시작해보세요!" (픽셀 스타일)

### AuctionWaitingState 팀 카드
- 연결됨: `pixel-box border-2 border-black bg-green-50` + `text-fluid-xs font-heading text-green-700` "ONLINE" + 초록 pulse dot
- 미연결: `pixel-box border-2 border-black bg-gray-100 grayscale opacity-50` + "OFFLINE"

### LotteryAnimation
- 결과 대기 후: ORGANIZER에게만 `pixel-button bg-minion-yellow` "START AUCTION" 버튼
- 팀장/뷰어: "방장의 시작을 기다리는 중..." 메시지
- 파티클: 12개, 픽셀 사각형, minion-yellow/red 혼합

### SoldOverlay (신규)
- `fixed inset-0 z-50 bg-black` 전체화면
- Framer Motion: `initial { opacity:0, scale:0.5 }` → `animate { opacity:1, scale:1 }` + white flash
- 픽셀 파티클 (LotteryAnimation 패턴 재사용)
- 2초 후 `useEffect`로 자동 dismiss — Firebase 상태에 개입하지 않음

### CreateRoomModal 진행률 표시기
- Galmuri 폰트 이모지/문자로 미니언 캐릭터 표현
- 미니언: `absolute` 포지셔닝, `transition-transform duration-300 steps(4)` 이동
- 완료 단계: `pixel-box bg-minion-yellow` + `✔`
- 현재 단계: `pixel-box border-4 border-black`
- 미도달: `pixel-box bg-gray-100 opacity-50`
- 트랙: `h-1 bg-black` 수평선 (완료 구간: `bg-minion-yellow`)

---

## Typography Violations (구현 시 반드시 수정)
> `text-[Npx]` 하드코딩을 `text-fluid-xs`로 교체해야 하는 파일 목록:

| 파일 | 위반 클래스 | 교체 대상 |
|------|-----------|---------|
| `BidStatus.tsx` L33 | `text-[10px]` | `text-fluid-xs` |
| `BidStatus.tsx` L42 | `text-[9px]` | `text-fluid-xs` |
| `BiddingControl.tsx` L61, L64 | `text-[10px]` | `text-fluid-xs` |
| `BiddingControl.tsx` L72 | `text-[9px]` | `text-fluid-xs` |
| `TeamList.tsx` L44 | `text-[9px]` | `text-fluid-xs` |
| `RoomClient.tsx` L232 | `text-[10px]` | `text-fluid-xs` |
| `NoticeBanner.tsx` | `text-[10px]` 배지 | `text-fluid-xs` |

---

## Decisions Log

| 날짜 | 결정 | 근거 |
|------|------|------|
| 2026-03-23 | Cyber-Pixel 디자인 방향 확정 | 리그 오브 레전드 커뮤니티 타겟, 게임 아케이드 무대 감각 |
| 2026-03-23 | OKLCH 기반 색상 토큰 시스템 (`globals.css`) | 지각적으로 균일한 색공간, Tailwind 4 통합 |
| 2026-03-23 | 3-폰트 스택 (Press Start 2P / Galmuri11 / Pretendard) | 픽셀 헤딩 + 고가독성 본문 분리 |
| 2026-03-23 | `--radius: 0rem` (전역 직각) | 픽셀 아트 아이덴티티 유지 |
| 2026-03-23 | AnimatePresence + 씬 시스템 (office-hours: Approach B) | Exit 애니메이션 부재 해소, Framer Motion 기존 도입 활용 |
| 2026-03-23 | SoldOverlay `fixed inset-0 z-50` | 낙찰 순간 전체화면 WOW 포인트 — 경쟁 서비스와의 차별점 |
| 2026-03-23 | 모바일 TeamList: 아코디언 패턴 | 모바일 경매 화면 우선, 팀 정보는 접어서 공간 확보 |
| 2026-03-23 | ChatPanel `max-h-240px` 고정 (모바일) | 채팅이 경매 보드를 가리지 않도록 |
| 2026-03-23 | 메시지 시각 분리: 게임 이벤트 로그 스타일 | 시스템 알림과 유저 채팅 구분, 인게임 채팅 창 패턴 |
| 2026-03-23 | Tailwind 시맨틱 색상 유지 (티어 색상) | Tailwind 생태계와의 일관성 |
| 2026-03-23 | LotteryAnimation: 방장 수동 시작 | 주최자가 경매 흐름을 제어 가능 |
| 2026-03-23 | CreateRoomModal: 픽셀 미니언 진행률 표시기 | Galmuri 문자 활용, 별도 에셋 불필요 |
| 2026-03-23 | TeamList 포인트 게이지 색상 단계 (1000P 기준) | BiddingControl 기존 공식(`/1000*100`) 통일 |
| 2026-03-23 | AuctionBoard 씬별 배경 전환 색상 확정 | 씬 감정 아크와 배경 대응 |
| 2026-03-23 | DESIGN.md 최초 작성 | `/design-consultation` — 기존 계획서 및 globals.css 기반 공식화 |
