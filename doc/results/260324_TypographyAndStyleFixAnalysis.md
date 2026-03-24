Date: 2026-03-24 10:00:00
Author: Antigravity

# 260324 타이포그래피 및 스타일 교정 분석 보고서

## 1. 개요
프로젝트의 'Cyber-Pixel' 디자인 시스템 일관성을 확보하기 위해, 하드코딩된 텍스트 크기(`text-[Npx]`) 및 표준 Tailwind 텍스트 클래스를 유동적 타이포그래피 토큰(`text-fluid-*`)으로 교체하는 작업을 분석한다.

## 2. 현재 상태 분석
### 2.1. 하드코딩된 텍스트 크기 (`text-[Npx]`)
- **LotteryAnimation.tsx**: L263, L266에 `text-[12px]` 잔존.
- **문서화된 위반 사항**: `CLAUDE.md`, `DESIGN.md`에 `BidStatus.tsx`, `BiddingControl.tsx` 등의 위반 사례가 명시되어 있으나, 최근 작업으로 일부는 이미 `text-fluid-xs`로 교체된 상태임.

### 2.2. 표준 Tailwind 클래스 혼용
- 현재 `text-fluid-*`와 `text-sm`, `text-lg`, `text-2xl` 등이 혼용되고 있음.
- `DESIGN.md`의 원칙("반드시 text-fluid-* 사용")에 따라 모든 표준 클래스를 유동적 토큰으로 전환해야 함.

### 2.3. 기타 디자인 위반 사항
- **라운드 처리**: `RoomClient.tsx` 등에서 `rounded-full`과 같은 클래스가 사용되고 있음. 프로젝트 원칙은 `--radius: 0rem` (직각)이므로, 의도적인 예외를 제외하고는 제거가 필요함.

## 3. 수정 대상 및 범위
1.  **LotteryAnimation.tsx**: 하드코딩된 `text-[12px]` 수정.
2.  **BidStatus.tsx**: `text-sm` → `text-fluid-xs` 또는 `text-fluid-sm`으로 교체.
3.  **BiddingControl.tsx**: `text-sm`, `text-xl`, `text-fluid-base` 등의 정합성 검토 및 교체.
4.  **TeamList.tsx**: 내부 텍스트 및 숫자 크기 표준화.
5.  **RoomClient.tsx**: 로딩/에러 화면의 `text-3xl`, `text-2xl`을 `text-fluid-xl`, `text-fluid-lg`로 교체.

## 4. 위험 요소 및 대책
- **레이아웃 깨짐**: 텍스트 크기가 유동적으로 변함에 따라 컨테이너 높이나 너비가 변할 수 있음. `min-h` 및 `truncate` 속성을 적절히 활용하여 대응함.
- **가독성**: `text-fluid-xs`가 너무 작게 느껴질 경우 `text-fluid-sm`으로 상향 조정함.
