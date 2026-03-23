Date: 2026-03-23 15:30:00
Author: Antigravity

# 🛠️ 모달 화면 전체 표시 수정 보고서

## 1. 문제 분석
- **현상**: `HowToUseModal`, `AuctionResultModal` 등 주요 모달이 화면 전체가 아닌 중앙 섹션 내부에 갇혀서 표시됨.
- **원인**: 모달의 부모 요소(Center Section 등)에 CSS 애니메이션(`animate-slide-up` 등)이나 `transform` 속성이 적용되어 있어, `fixed` 포지션의 기준점(Containing Block)이 브라우저 뷰포트가 아닌 해당 부모 요소로 설정됨.

## 2. 해결 방법
- **React Portal 도입**: 모달의 마운트 위치를 DOM 트리 상의 부모 요소 내부가 아닌 `document.body` 바로 아래로 이동시킴으로써 부모 요소의 CSS 제약으로부터 완전히 분리함.
- **하이드레이션 오류 방지**: `useEffect`와 `mounted` 상태를 사용하여 클라이언트 사이드에서만 Portal이 렌더링되도록 처리함.

## 3. 수정 대상 파일
- `src/features/auction/components/HowToUseModal.tsx`
- `src/features/auction/components/AuctionResultModal.tsx`
- `src/features/auction/components/LeaveRoomModal.tsx`
- `src/features/auction/components/EndRoomModal.tsx`
- `src/features/auction/components/LinksModal.tsx`

## 4. 검증 결과
- 모든 모달이 이제 부모 컨테이너의 크기나 애니메이션 여부와 상관없이 브라우저 화면 전체를 기준으로 중앙에 정렬되어 표시됨.
- `z-index` 충돌 문제 해결 및 배경 블러(`backdrop-blur`) 효과가 화면 전체에 정상 적용됨.
