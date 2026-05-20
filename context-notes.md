# 비공개 입찰 구현 컨텍스트 노트

## 단일 PC 다중 탭 타이머 표시 보정

- 재현 조건은 하나의 PC에서 주최자와 모든 팀장 브라우저를 동시에 띄운 테스트다. 서로 다른 PC에서 각자 접속했을 때는 문제가 없었으므로 서버 정본 `timer_ends_at` 자체보다 클라이언트 이벤트 처리 지연과 표시 보정 경로를 우선 의심한다.
- 실제 낙찰/종료 시점은 정상이고 표시 숫자만 10초 또는 5초보다 길게 보이는 현상이므로, `recoverExpiredAuction` 예약과 서버 액션의 종료 판정은 건드리지 않는다.
- 최소 수정 범위는 `useAuctionRealtime.ts`의 `timerDurationMs` 변환이다. RTDB live 또는 Firestore fallback 이벤트를 늦게 처리한 탭이 `Date.now() + timerDurationMs`로 서버 `timerEndsAt`보다 미래 값을 만들지 못하게 제한한다.
- 구현은 `resolveTimerEndsAtFromDuration()` 헬퍼로 제한했다. `timerDurationMs` 보정은 유지하되 이벤트에 서버 `timerEndsAt`이 있으면 그보다 늦은 표시용 종료 시각을 만들지 않는다.
- 회귀 테스트는 RTDB live 이벤트와 Firestore fallback 이벤트가 지연 처리되어도 서버 `timerEndsAt`을 넘지 않는 케이스를 추가했다. `npx vitest run __tests__/useAuctionRealtime.test.tsx` 통과를 확인했다.

## 입찰 타이머 8초 연장 기준 전환

- 사용자 요청은 경매 시작 시간은 10초로 유지하고, 입찰 시 타이머 갱신 가능 시간과 갱신 시간을 기존 5초 기준에서 8초 기준으로 바꾸는 것이다.
- 실제 경매의 연장 기준은 `src/features/auction/constants/auctionTimings.ts`의 `EXTEND_THRESHOLD_MS`, `EXTEND_DURATION_MS`를 서버 액션, direct bid, 낙관 UI, E2E fixture가 공유한다.
- direct bid는 Firestore Rules의 `isValidDirectBidTimerUpdate()`가 최종 검증하므로, 상수 변경과 함께 rules의 남은 시간 기준과 새 종료 시각 허용 범위도 8초 기준으로 맞춰야 한다.
- 재경매 시작 시간 `RE_AUCTION_DURATION_MS`는 별도 정책이므로 이번 요청에서는 5초 유지한다.
- 서버 액션 fallback과 E2E fixture도 direct bid와 동일하게 남은 시간 `<= 8초`일 때 연장하도록 맞췄다. 이전에는 일부 경로가 `< 5초`였으나 이번 변경에서는 경계값 동작을 통일한다.
- 타이머 랩은 운영 경매와 같은 입찰 연장 실험 도구이므로 `src/features/timer-lab/actions.ts`와 화면 문구도 8초 기준으로 갱신했다.
- 검증은 `npx vitest run __tests__/auctionActions.test.ts __tests__/useBiddingControl.test.tsx __tests__/useAuctionRealtime.test.tsx`, `npm run smoke:room-rules`, `npm run build`를 실행해 통과했다.

- 공개 입찰 기능은 기존 계약을 유지한다. `active_bid`, `BID_PLACED`, `placeBidDirect`, 공개 입찰 `placeBid`, 공개 입찰 `awardPlayer` 기본 동작은 수정하지 않고, `auction_mode === "SEALED_BID"`일 때만 별도 경로를 탄다.
- 비공개 입찰 제출 금액과 제출 여부는 타이머 중 주최자와 다른 팀장에게 노출하지 않는다. 클라이언트 전체 구독 컬렉션에 제출 문서를 그대로 추가하지 않고 서버 액션에서 집계한다.
- 점수공개 시점에는 공개 결과만 확정한다. 선수 SOLD 처리와 팀 포인트 차감은 카드 애니메이션 완료 후 호출되는 별도 확정 액션에서 수행한다.
- 최고가 동점이면 같은 선수에 대해 동점 팀만 재입찰한다. 재입찰 최소 금액은 직전 최고 동점 금액이며 재입찰 횟수 제한은 두지 않는다.
- `startAuction()`은 `auction_mode === "SEALED_BID"`일 때 `startSealedBidRound()`로 분기한다. 공개 입찰의 기존 시작/입찰/낙찰 함수 본문은 공개 방식에서 그대로 유지한다.
- 비공개 제출은 RTDB 이벤트를 발행하지 않는다. 이벤트는 시작, 잠금, 점수공개, 확정, 재입찰 시작 단계에만 발행한다.
- `useAuctionControl()`의 공개 입찰 자동 낙찰 타이머는 비공개 입찰 방에서 실행되지 않도록 차단했다. 비공개 방의 만료는 `lockSealedBidRound()`와 `recoverExpiredAuction()`의 mode 분기가 담당한다.
- 검증 중 `npm run test` 전체 실행은 기존 공개 입찰 컨트롤 기대값 1건과 LotteryAnimation 텍스트 매칭 3건에서 실패했다. 이번 변경 파일이 아닌 `useBiddingControl.ts`와 `LotteryAnimation.tsx` 동작/테스트의 기존 불일치로 보이며, 관련 변경 범위의 `auctionRealtimeUtils`, `auctionActions`, `useAuctionControl` 테스트는 통과했다.
- 비공개 입찰 제출 문서는 Firestore rules에서 클라이언트 직접 read/write를 모두 차단한다. 제출과 집계는 Admin SDK Server Action만 담당한다.
- 방 생성 직후 주최자 입장에서는 RTDB presence write와 서버 draw 검증 사이의 전파 지연이 발생할 수 있다. 클라이언트 store에는 자기 presence를 snapshot과 병합하고, 서버 draw 검증은 짧은 재시도로 RTDB 전파 지연을 흡수한다.

## 팀장 탭 엑셀 업로드

- 사용자 요청은 방 생성 모달의 `팀장 등록` 탭에서도 엑셀 업로드 버튼을 표시하는 것이다. 현재 엑셀 업로드 파서는 `useCreateRoom.handleExcelUpload()` 하나이며 선수 목록을 덮어쓰는 용도로만 구현되어 있다.
- 1차 구현은 버튼 노출과 동일 파서 호출 연결로 제한한다. 팀장 데이터 자동 매핑은 제공 엑셀 구조를 확인한 뒤 별도 판단이 필요하다.
- 제공 파일 `철인3종 명단.xlsx`는 `Sheet1` 하나, 범위 `A1:O145`, 실제 닉네임이 있는 데이터 48행으로 확인했다. 헤더는 타임스탬프, 본인 이름, 롤닉네임#태그, 소환사의 협곡, 희망 라인 주/부라인, 무작위 총력전, 전략적 팀 전투, 팀장에게 하고 싶은 말 순서다.
- 기존 파서는 `롤닉네임#태그`는 닉네임으로 인식하지만, `소환사의 협곡` 티어명, 직접 입력된 주/부라인, `팀장에게 하고 싶은 말` 설명 컬럼은 인식하지 못했다. 이번 변경으로 해당 헤더를 선수 업로드에 반영하도록 보정했다.
- 팀장 등록 단계는 액션 버튼들이 헤더 row의 직접 자식으로 배치되어 팀원 등록 단계의 버튼 그룹 간격과 달랐다. 두 단계 모두 액션 버튼을 내부 `flex items-center gap-2` 그룹으로 묶어 동일한 간격을 쓰도록 맞춘다.
- 엑셀 파일의 실제 팀장 표시는 `롤닉네임#태그` 또는 `본인 이름`이 아니라 `팀장에게 하고 싶은 말` 컬럼 10행의 `팀장` 값으로 확인된다. 사용자 요청의 이름 칸 `팀장` 포함도 지원하되, 제공 파일을 살리기 위해 팀장 표시 컬럼도 팀장 행 판정에 포함한다.
- 비공개 입찰 이벤트용 추가 정보는 기존 `tier`를 소환사의 협곡 메인 티어로 유지하고, `무작위 총력전` 포함 헤더는 `aram_tier`, `전략적 팀 전투` 헤더는 `tft_tier`로 저장한다. 공개 입찰 UI에는 노출하지 않고 비공개 입찰 추첨 결과에서만 표시한다.
- 비공개 입찰 진행 중의 입찰 대상 정보 카드는 `SealedBidBoard`가 담당한다. 저장한 추가 티어 정보는 추첨 완료 후 이 카드에도 함께 보여야 한다.
- 비공개 입찰 시스템 채팅은 메시지 문자열의 선행 이모지를 `ChatPanel.getSystemMessageVisual()`에서 아이콘으로 치환한다. 시작/재입찰/마감은 `🔒`, 점수공개는 `🃏` 선행 문자열을 기준으로 별도 SVG 아이콘을 적용한다.
- 엑셀의 `팀장에게 하고 싶은 말` 헤더는 `useCreateRoom`에서 선수 `description`으로 저장된다. 비공개 입찰 진행 중에는 `SealedBidBoard`의 입찰 대상 카드가 이 값을 `한마디`로 표시한다.
- 엑셀 업로드에서 `닉네임` 열이 없고 `이름` 포함 헤더만 있는 파일은 해당 이름 열을 선수명 fallback으로 사용한다. 팀장 행 판정은 `이름` 포함 헤더 열의 값에 `팀장`이 포함되는 경우로 제한한다.
- 엑셀의 `소환사의 협곡` 헤더는 팀원 `tier`와 팀장 `leader_tier`의 원천 데이터로 사용한다. 티어 값은 정규화하지 않고 엑셀 셀 값을 그대로 저장한다.
- 엑셀의 `무작위 총력전`, `전략적 팀 전투` 헤더 값은 팀원 `aram_tier`, `tft_tier`로 저장하고 공개 입찰 선수 정보 카드와 비공개 입찰 대상 카드에 표시한다.
- 추첨 시작 전 참여 인원 검증은 RTDB `presence/{roomId}`를 Admin SDK로 읽는다. `room:{roomId}:ORGANIZER:none` 세션 키가 존재해도 값의 `role` 필드가 없으면 기존 로직은 주최자 0명으로 계산했기 때문에, 정식 `role` 값이 없을 때만 세션 키의 역할 부분을 보조 판정한다.
- 추첨 애니메이션의 티어 이미지는 `getTierImage()` 공통 유틸을 사용한다. 엑셀 원본값에 `플레티넘` 오타가 들어올 수 있으므로 이미지 매핑에서는 `플래티넘`과 동일하게 `Rank=Platinum.png`를 사용한다.
- 추첨 시작 전 검증에서 주최자 presence는 차단 조건으로 사용하지 않는다. 주최자 접속 여부는 Firebase Auth와 RTDB presence 동기화에 영향을 받기 쉬우므로, 추첨 차단은 최소 2명의 팀장 presence만 확인한다.
- 주최자 권한 검증은 `presence`가 아니라 서버가 읽는 `room_auth_{roomId}_ORGANIZER` 쿠키와 `room_auth_secrets/{roomId}.organizer_token` 비교로 처리한다. 이 헬퍼는 추첨, 경매 시작, 추첨 닫기, 일시정지/재개, 공개 낙찰 확정, 비공개 입찰 잠금/점수 공개/확정, 드래프트, 재경매, 결과 저장, 방 삭제에 적용한다.
- 비공개 입찰 대상 정보 카드는 각 티어/소개 정보를 한 줄 row로 표시한다. 소환사의 협곡과 전략적 팀 전투는 정확히 매칭되는 티어만 이미지로 표시하고, `마스터 이상`, `실버 이하`, 임의 텍스트 값은 텍스트로 유지한다. 무작위 총력전 값은 항상 텍스트로 표시한다.
- 비공개 입찰 대상 정보 카드의 각 row는 박스 내부에서 타이틀을 상단에, 값과 티어 이미지를 하단에 배치한다.
- 비공개 입찰 대상 정보 카드의 티어 3종은 데스크톱에서 한 줄 3열로 표시하고, 한마디는 그 하단에 별도 박스로 표시한다.
- 비공개 입찰 대상 정보 카드의 무작위 총력전 값은 말줄임을 쓰지 않고 줄바꿈을 허용한다. 텍스트 길이가 길수록 폰트 크기를 낮춰 박스 안에 최대한 표시한다.
- 비공개 입찰 제출 완료 후 점수 카드는 `LOCKED` 상태에서는 모든 팀 카드가 동일한 뒷면만 보여야 한다. 팀명, 점수, 포기 여부, 최고가 여부는 `REVEALING` 애니메이션으로 앞면이 열린 뒤에만 노출한다.
- 팀장 닉네임의 `#` 뒤 문자열은 라이엇 태그로 보고 표시명에서는 제거한다. 과거 저장 데이터 표시를 위해 공통 표시 유틸에서 제거하고, 새 엑셀 업로드로 팀장 기본값을 만들 때도 같은 표시명을 사용한다.
- 점수 공개 애니메이션 중에는 서버가 계산한 `is_highest`, `is_tied` 값을 UI 강조에 사용하지 않는다. 모든 카드가 공개된 뒤에만 최고점 카드와 재입찰 대상 카드를 강조하고, 그 전에는 팀명과 제출 점수만 기본 톤으로 표시한다.
- 점수 공개 카드 앞면은 `pixel-box` 유틸을 쓰지 않는다. `pixel-box`가 흰 배경과 검은 테두리를 직접 지정하므로, 최고점 카드는 앞면에서 명시 border/background/shadow 클래스로 구성한다. 최고점 강조는 과한 빨간 그림자 대신 기존 카드들과 같은 검은 픽셀 그림자를 유지하고, 은은한 노란 배경과 노란 테두리로만 구분한다.
- 최고점 점수 텍스트는 순수 검정보다 살짝 금색이 섞인 `#2f2600`을 사용한다. 배경과 테두리 강조를 해치지 않으면서 노란 계열 카드와 자연스럽게 연결하기 위한 선택이다.
- 재입찰 라운드는 별도 화면 상태가 아니라 `eligibleTeamIds`가 있는 새 비공개 입찰 라운드로 표현된다. 카드 목록은 `eligibleTeamIds`가 있을 때 해당 팀만 표시하고, 일반 라운드처럼 전체 팀 또는 비참여 팀의 빈/불가 카드를 섞지 않는다.
- 모달 외부 클릭 닫힘은 `click` 이벤트 기준으로 처리하지 않는다. 모달 내부에서 누른 뒤 외부에서 mouseup 되면 오버레이 click으로 닫힐 수 있으므로, 오버레이에서 mousedown이 시작되고 mouseup도 오버레이에서 끝난 경우에만 닫는다.
- 팀 로스터 확장은 중앙 경매 보드와 오른쪽 채팅/컨트롤 영역을 밀지 않는다. `RoomClient`의 12컬럼 grid 비율은 유지하고, 주최자/팀장 화면의 좌측 roster 카드만 기존 오른쪽 경계를 고정한 채 왼쪽으로 넓힌다. 넓은 화면에서만 `TeamList` 내부를 2열로 표시한다.
- 넓은 팀 로스터 모드에서는 8팀이 최대한 한 스크롤에 보이도록 카드 padding, 카드 간격, 헤더 여백, 게이지 높이, 선수 row 높이, badge 크기를 한 단계 줄인다. 정보 항목은 숨기지 않고 기존 말줄임 동작은 유지한다.
- 추가 조정으로 넓은 팀 로스터 모드의 `xl` 전용 카드 padding, 선수 row 높이, badge, 보조 폰트를 한 단계 더 줄였다. 관전자와 좁은 화면의 기본 로스터 크기는 변경하지 않는다.
- 팀 로스터 compact 모드에서는 팀원 이름의 `font-black`을 제거하고, 팀명/포인트/badge/티어/완료 리본 텍스트를 추가로 줄여 2x4 목록의 세로 밀도를 높인다.
- 팀 로스터 compact 모드의 전체 텍스트를 다시 한 단계 낮췄다. 팀명/포인트는 9px, 보조 버튼과 팀원명은 8px, 티어/배지/빈 자리/완료 리본은 7px 기준으로 맞춰 2x4 표시 밀도를 더 높인다.
- 방 종료 모달은 닫힌 상태에서 `useOverlayDismiss`를 건너뛰고 열린 상태에서만 호출해 React Hook 순서 오류가 발생했다. `useState` 다음에 항상 `handleClose`와 `useOverlayDismiss`를 구성한 뒤 `isOpen` 조기 반환을 실행하도록 수정한다.

## 홈 업데이트 공지 갱신

- 홈 화면 공지성 업데이트는 `src/content/updateFeed.ts`의 `updateFeedItems`를 기준으로 노출된다. 현재 가장 최신 항목은 2026-04-24 명예의 전당 개편 안내다.
- 2026-04-24 이후 실제 프로젝트 상태는 `progress.md`, `doc/ARCHITECTURE.md`, `doc/AUCTION_REALTIME_CONTRACT.md`, 최근 커밋 로그 기준으로 크게 일정 관리 안정화, 방 인증 토큰 분리와 rules 검증, 비공개 입찰 추가, 타이머 정책 8초 전환, 경매방 UI 안정화가 진행된 상태다.
- 공지 문구는 홈 ticker에 노출되는 짧은 문장이어야 하므로 구현 세부사항보다 사용자와 운영자가 체감할 변경을 우선한다. 단, 보안과 실시간 정합성처럼 운영 안정성에 직접 영향을 주는 변경은 별도 항목으로 남긴다.

## project-describer DESCRIPTION 갱신

- `project-describer` 스킬 입력이 추가로 제공되었으므로 기존 `DESCRIPTION.md`를 그대로 두지 않고 현재 코드베이스 기준으로 갱신한다.
- 기존 설명서에는 방 생성 시 팀 문서에 토큰을 포함한다는 식의 오래된 설명이 남아 있다. 현재는 신규 방의 organizer/viewer/team leader 토큰을 `room_auth_secrets/{roomId}`와 `team_tokens/{teamId}`에 저장하고, public room/team 문서는 legacy fallback만 남긴 구조다.
- 설명서에는 공개 입찰 hot path와 비공개 입찰 경로를 분리해 기록한다. 공개 입찰은 `placeBidDirect()`가 Firestore client transaction을 먼저 사용하고 실패 시 Server Action fallback을 탄다. 비공개 입찰은 제출, 잠금, 공개, 확정 모두 서버 액션 중심이다.
- 문서 목적은 포트폴리오/외부 참조용 상세 설명이므로, 단순 파일 나열보다 Firestore 정본, RTDB fanout, Server Action 경계, 일정 transaction, 명예의 전당 아카이브 연결 같은 설계 이유를 중심으로 작성한다.

## 팀 로스터 compact 재조정

- 대상은 `TeamList`의 `useWideRosterGrid` 분기다. 주최자/팀장 화면의 `xl` 이상 2열 로스터에서만 더 조밀하게 만들고, 관전자와 좁은 화면의 기본 로스터는 변경하지 않는다.
- 이번 조정은 정보 항목을 숨기지 않고 카드 간격, 카드 padding, 선수 row 높이, 헤더 여백, compact 폰트 크기만 낮추는 방식으로 제한한다.
- 작은 가격/팀장 배지는 `group-hover:scale-110`로 커질 때 좁은 row 안에서 겹침 가능성이 있으므로 compact 모드에서는 scale 확대 대신 색상 변화 정도로 유지한다.

## 팀명 편집 input 폭 보정

- `TeamList` 편집 상태는 input, 저장, 취소 버튼이 같은 flex row를 공유한다. compact 로스터에서는 input의 가변 폭이 버튼의 고정 폭보다 먼저 공간을 차지할 수 있으므로 input 래퍼에 `min-w-0`과 `max-w` 제약을 두고 버튼 묶음은 `shrink-0`으로 유지한다.

## 팀 로스터 compact 가독성 조정

- 로스터 전체 표시 요구사항을 유지하기 위해 카드 간격과 padding은 그대로 두고, 글자 가독성에 직접 영향을 주는 팀명/포인트/선수명 크기와 선수명 line-height만 조정한다.
- 선수명은 7px에서 8px로만 올리고 `leading-tight font-semibold`로 바꾼다. 팀명과 포인트는 9px 기준으로 올리되, 티어/가격/팀장 배지/완료 리본은 7px로 유지한다.
- 선수 row와 빈 슬롯 높이는 26px에서 28px로만 올려 텍스트가 눌려 보이지 않게 하되 2열 로스터의 전체 표시 밀도는 크게 되돌리지 않는다.

## 대기 선수 목록 패널

- 클라이언트가 확인하려는 남은 선수 목록은 `Player.status === "WAITING"`인 선수들이다. `RoomClient`가 이미 `bucketAuctionPlayers(players, currentPlayerId)`에서 `waitingPlayers`를 계산하므로 새 구독이나 서버 API를 추가하지 않는다.
- 오른쪽 컬럼에는 기존 유찰 목록과 채팅 사이에 대기 목록 패널을 배치한다. 유찰/대기 목록은 각각 내부 스크롤 패널로 유지하고 채팅은 남은 공간을 차지하게 한다.
- `TeamList.tsx`에 기존 미커밋 변경이 있으므로, 이번 구현은 별도 `WaitingPanel` 파일과 `RoomClient` 배치 수정으로 분리해 기존 변경을 덮어쓰지 않는다.

## 대기 선수 목록 compact grid

- 대기 목록은 남은 선수 확인이 목적이므로 티어와 포지션을 제거하고 닉네임만 표시한다. 오른쪽 컬럼 폭에서 많은 항목을 훑어볼 수 있도록 카드형 row 대신 작은 grid chip을 사용한다.
- grid는 기본 3열, 초광폭에서는 4열까지 늘려 한 줄에 3~4명을 볼 수 있게 한다. 각 chip은 `truncate`로 긴 닉네임이 컬럼을 밀지 않게 한다.

## 대기명단 우측 확장 패널

- 기존 12컬럼 레이아웃과 오른쪽 유찰/로그 컬럼은 유지한다. 대기명단은 오른쪽 컬럼 내부 흐름에서 빼고 `xl` 이상에서 `main`의 오른쪽 바깥에 absolute 패널로 이어 붙인다.
- 대기명단 패널은 `waitingPlayers`를 그대로 사용하고 데이터 계약은 변경하지 않는다. 패널 내부 목록은 한 줄에 한 선수씩 `닉네임 / 티어 / 포지션`으로 표시한다.
- 현재 `RoomClient`, `WaitingPanel`, `TeamList`에 기존 미커밋 변경이 있으므로, 사용자 변경을 보존하고 이번 변경은 필요한 부분에 덧붙인다. 커밋은 기존 미커밋 변경과 분리 가능할 때만 진행한다.
- 이번 변경은 기존 미커밋 변경과 같은 파일에 섞여 있으므로 커밋하지 않고 워킹트리에 둔다.

## 현재 상태 코드 리뷰

- 2026-05-18: 사용자는 현재 프로젝트 상태 파악과 코드 리뷰를 요청했다.
- 2026-05-18: 작업 트리에는 추적되지 않은 `event-miss-analysis.md`, `security-report.md`가 있으며 사용자 산출물로 간주하고 건드리지 않는다.
- 2026-05-18: `/api/room-auth/firebase-token`은 문서와 달리 room cookie 또는 역할 토큰 검증 없이 요청 본문만으로 Firebase custom token을 발급한다.
- 2026-05-18: `placeBid`, `submitSealedBid`, `broadcastBidEvent`, `sendNotice` 서버 액션에는 호출자 권한 검증이 없거나 부족하다.
- 2026-05-18: `npm run lint`는 38 errors, 24 warnings로 실패했고, `npm run test`는 2개 테스트 실패 상태다.

## 최소 보안선 구현 계획

- 2026-05-19: 사용자 요청에 따라 소규모 링크 공유 운영 모델을 유지하는 최소 권장 범위와 구현 계획을 `minimal-security-implementation-plan.md`로 분리해 작성했다.
- 2026-05-19: 최종 권장 범위는 custom token 발급 전 역할 token 대조, 공개 입찰 fallback leader token 대조, 비공개 입찰 제출 leader token 대조, 공지 organizer token 대조, `broadcastBidEvent` canonical room state 재검산이다.
- 2026-05-19: Firestore rules는 완화하지 않는 쪽을 계획의 기본값으로 둔다. direct bid rules는 보안이라기보다 경매 정합성 검증이므로 유지 대상이다.

## 최소 보안선 구현

- 2026-05-19: `roomAuthToken`을 store에 추가하고, 방 입장 URL의 `token` 또는 `authToken`을 room context와 Firebase custom token 요청에 전달하도록 수정했다.
- 2026-05-19: 팀장 링크 생성 경로에 leader token을 포함했다. 주최자 링크 모달의 `/api/room-links`는 organizer token 검증 후 private team token을 반환한다.
- 2026-05-19: `requireRoomLeader`와 `requireRoomViewer` 서버 헬퍼를 추가했다. 신규 private token 문서를 우선하고 legacy public token fallback을 유지한다.
- 2026-05-19: `placeBid`, `submitSealedBid`, `sendNotice`, `broadcastBidEvent`에 최소 권한 검증을 추가했다.
- 2026-05-19: `broadcastBidEvent`는 클라이언트가 보낸 revision과 timer 값을 그대로 쓰지 않고, room canonical `active_bid`, `auction_revision`, team name을 재조회해 일치할 때만 발행한다.
- 2026-05-19: 검증 결과 `npm run build`, `npx tsc --noEmit`, 핵심 Vitest 7개 파일, `npm run smoke:room-rules`는 통과했다. `npm run test` 전체는 기존 `useAuctionControl`, `LotteryAnimation` 2건 실패가 남아 있다.

## 기존 테스트 실패 2건 정리

- 2026-05-19: `useAuctionControl`의 기존 실패 테스트는 `lotteryPlayer`가 `null`인 상태에서 `IN_AUCTION` snapshot만으로 추첨 모달을 다시 열리길 기대한다. 현재 구현과 `auctionRealtime` 계약은 `LOTTERY_CLOSED`, `AUCTION_STARTED`, `AUCTION_RESUMED` 이후 stale lottery player를 null로 유지하는 쪽이므로 테스트 기대값을 그 계약에 맞춘다.
- 2026-05-19: `LotteryAnimation`은 무작위 총력전 라벨을 `무작위 총력전 : 아수라장`으로 표시한다. 테스트는 exact text로 `무작위 총력전`만 찾고 있어 현재 화면 문구와 맞지 않으므로 부분 매칭으로 바꾼다.
- 2026-05-19: 대상 검증 `npx vitest run src/features/auction/hooks/useAuctionControl.test.ts __tests__/LotteryAnimation.test.tsx`는 10개 테스트 통과, 전체 검증 `npm run test`는 27개 파일 192개 테스트 통과 상태다.

## 명예의 전당과 일정 관리 코드 리뷰

- 2026-05-19: 사용자 요청은 구현 변경이 아니라 명예의 전당과 일정 관리 기능의 정밀 코드 리뷰 및 안정성 검사다. 기능 파일 수정 없이 실제 라우트, 서버 액션, 컴포넌트, 테스트를 읽고 리스크를 심각도 순으로 보고한다.
- 2026-05-19: 작업 트리에는 기존 추적되지 않은 `event-miss-analysis.md`, `security-report.md`가 있으며 이번 리뷰와 무관한 사용자 산출물로 간주한다.
- 2026-05-19: 명예의 전당 수동 등록은 `registerHallOfFameEntry()`가 클라이언트 payload를 그대로 저장하고 `.add()`를 사용한다. 서버가 archive와 team을 재조회하지 않고 중복 방지도 transaction/document id로 보장하지 않는다.
- 2026-05-19: 일정 저장은 관리자 코드를 요구하지만 `saveLeagueScheduleDay()`가 팀 이름을 roster source와 대조하지 않고, schedule 시작/종료 날짜 범위도 서버에서 확인하지 않는다. `LeagueScheduleManager`는 일정 전환 시 기존 `selectedDateKey`를 유지할 수 있어 잘못된 날짜 저장 위험이 더 커진다.
- 2026-05-19: 검증은 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts src/features/schedules/utils/leagueRecords.test.ts src/features/schedules/utils/leagueNextMatches.test.ts src/features/schedules/utils/leagueMatchTime.test.ts src/features/schedules/utils/leagueMatchRules.test.ts __tests__/ScheduleMatchDayEditor.test.tsx`와 `npm run build`가 통과했다.

## 명예의 전당과 일정 관리 안정화 전제

- 2026-05-19: 리뷰 결과를 바탕으로 `schedule-hof-stability-premises.md`를 작성한다. 문서는 구현 계획보다 앞선 전제로서 공개 읽기 경로 유지, 서버 액션 권위성, 클라이언트 payload 불신, roster/date 검증, 결정적 명예의 전당 문서 id, 최소 테스트 범위를 정의한다.
- 2026-05-19: 이번 문서 작업은 기능 파일을 수정하지 않는다. 기존 미추적 `event-miss-analysis.md`, `security-report.md`와 수정된 `DESCRIPTION.md`는 사용자 작업으로 간주하고 건드리지 않는다.

## 명예의 전당과 일정 관리 안정화 구현 계획

- 2026-05-19: `schedule-hof-stability-premises.md`를 기준으로 `schedule-hof-stability-implementation-plan.md`를 작성한다. 구현 순서는 명예의 전당 서버 권위성, 일정 서버 검증, 일정 전환 UI 상태, fixture/E2E 유지 순으로 둔다.
- 2026-05-19: 계획서의 기본 결정은 명예의 전당 수동 등록 문서 id를 `archive:{archiveId}`로 쓰고, 기존 `.add()` 문서는 조회와 제외 목록에서 계속 인정하는 것이다. 일정 저장은 date range와 roster team 검증을 서버에서 수행한다.

## 명예의 전당과 일정 관리 안정화 구현

- 2026-05-19: `registerHallOfFameEntry()`는 클라이언트가 보낸 room id, won at, 선수 목록을 저장하지 않고 `auction_archives/{archiveId}`를 transaction 안에서 재조회해 `hall_of_fame/archive:{archiveId}`에 저장한다. 기존 `.add()` 기반 문서는 조회와 archive 제외 목록에서 계속 인정한다.
- 2026-05-19: 명예의 전당 archive 제외 목록의 200개 제한을 제거했다. 수동 등록 중복은 deterministic id 존재 여부로 막는다.
- 2026-05-19: `saveLeagueScheduleDay()`는 저장 전 schedule을 로드해 date key가 `startsAt`과 `endsAt` 범위 안인지 확인하고, roster source에서 복원된 팀만 저장하도록 검증한다. 같은 날짜 payload 안 중복 팀 배정도 거부한다.
- 2026-05-19: `e2eScheduleFixture`도 운영 경로와 같은 date range, roster team, 같은 팀/중복 배정 검증을 적용한다.
- 2026-05-19: `LeagueScheduleManager`는 timeline이 바뀌면 첫 match day 또는 schedule 시작일로 `selectedDateKey`를 재설정한다. 다른 일정에서 선택한 날짜가 새 일정 저장 payload로 새는 문제를 막는다.
- 2026-05-19: 검증 결과 대상 Vitest 8개 파일 45개 테스트, `npm run build`, `npx playwright test playwright/league-schedule.spec.ts`가 통과했다.

## 명예의 전당과 일정 관리 안정화 후속 분석

- 2026-05-19: 현재 구현 기준 주요 안정성 리스크는 대부분 닫혔다. 남은 최소 필수 개선은 기존 `.add()` 기반 hall of fame 문서가 같은 `archive_id`를 이미 가진 경우에도 직접 `registerHallOfFameEntry()` 호출로 `archive:{archiveId}` 문서가 새로 생길 수 있는 호환성 중복 경계다.
- 2026-05-19: 후속 분석은 `schedule-hof-post-stability-analysis.md`로 작성한다. 필수 후속 전제는 UI 제외 목록뿐 아니라 서버 액션 자체가 legacy 문서와 deterministic 문서 모두를 같은 archive id 기준으로 중복 거부하는 것이다.

## 명예의 전당 legacy 중복 방지 구현 계획

- 2026-05-19: 후속 분석에서 남은 최소 필수 개선을 `schedule-hof-legacy-duplicate-implementation-plan.md`로 분리한다. 구현 범위는 `registerHallOfFameEntry()`의 같은 `archive_id` legacy 문서 중복 검사와 해당 Vitest 보강으로 제한한다.
- 2026-05-19: 계획상 구현은 `hall_of_fame.where('archive_id', '==', archiveId).limit(1).get()` 기반 중복 검사와 기존 deterministic transaction 중복 검사를 함께 사용한다. 별도 unique index 컬렉션은 이번 최소 범위에서 제외한다.

## 명예의 전당 legacy 중복 방지 구현

- 2026-05-19: `registerHallOfFameEntry()`에 `hasHallOfFameEntryForArchive()`를 추가해 deterministic id 문서뿐 아니라 같은 `archive_id`를 가진 legacy random id 문서도 중복으로 거부한다.
- 2026-05-19: hall of fame 액션 테스트 더블에 `where('archive_id', '==', archiveId).limit(1).get()` 흐름을 추가하고, legacy random id 문서가 있을 때 `archive:{archiveId}` 새 문서가 생성되지 않는 테스트를 추가했다.
- 2026-05-19: 검증 결과 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts`, 통합 `npx vitest run src/features/hall-of-fame/api/__tests__/hallOfFameActions.test.ts src/features/schedules/api/__tests__/scheduleActions.test.ts __tests__/LeagueScheduleManager.test.tsx`, `npm run build`가 통과했다.

## 다수 PC 재현 테스트 환경 구성

- 2026-05-20: 목표는 한 로컬 PC에서 organizer, 두 leader, viewer를 서로 다른 브라우저 컨텍스트로 분리해 다수 PC 경매 상황을 자동 재현하는 것이다.
- 2026-05-20: 기존 `auction-realtime.spec.ts`와 fixture API가 이미 다중 컨텍스트, 독립 쿠키, 경매 fanout 검증을 지원하므로 데이터 계약이나 fixture shape는 변경하지 않는다.
- 2026-05-20: 구성 범위는 대표 다중 클라이언트 smoke spec, 실행 npm script, LAN 수동 접속 문서로 제한한다. Firebase rules나 실시간 이벤트 필드명은 변경하지 않는다.
- 2026-05-20: 검증 결과 `npm run test:e2e:multi-pc`가 통과했다. 첫 sandbox 실행은 `spawn EPERM`으로 실패했고 승인 후 sandbox 밖 실행에서 1개 테스트가 통과했다.

## 경매 E2E 실패 3건 정리

- 2026-05-20: `auction-realtime.spec.ts` 실패 3건은 `active-auction` fixture 타이머가 18초로 시작해 12초 안에 2.5초 이하가 될 수 없는 문제, `active-auction-expiring` fixture가 7초로 시작해 5초 유찰 기대와 맞지 않는 문제, `sendNotice()`가 fixture 분기 전에 Firestore organizer auth를 먼저 실행하는 문제로 분리된다.
- 2026-05-20: 수정 범위는 E2E fixture 초기 타이머와 fixture 전용 공지 전송 분기로 제한한다. 운영 타이밍 상수, RTDB event envelope, room canonical state 계약은 변경하지 않는다.
- 2026-05-20: `active-auction` fixture는 8초, `active-auction-expiring` fixture는 1.5초 남은 상태로 시작하도록 조정했다. `sendNotice()`는 fixture 환경에서 fixture 저장소로 먼저 분기하고, 운영 환경에서는 기존 organizer auth를 유지한다.
- 2026-05-20: 검증 결과 실패 3개만 재실행한 `npx playwright test playwright/auction-realtime.spec.ts --project=chromium -g "extends timer|marks the player unsold|syncs organizer notice"`가 통과했고, 전체 `npm run test:e2e:auction`도 14개 테스트 통과했다.

## 8팀장 직접 확인 테스트 계획

- 2026-05-20: 사용자는 예전에 발생한 "주최자 + 8팀장 경매에서 특정 팀장에게 입찰 권한이 부여되지 않음" 문제를 직접 화면으로 확인할 수 있는 테스트 진행안을 요청했다.
- 2026-05-20: 현재 `createRoom()`은 E2E fixture mode에서 전달된 captains 수만큼 팀과 leader token을 생성하므로, 8팀 테스트는 기존 fixture 생성 경로를 활용하는 것이 최소 변경이다.
- 2026-05-20: 전제 문서는 `eight-leader-visual-test-premises.md`, 구현 계획서는 `eight-leader-visual-test-implementation-plan.md`로 작성했다. Firebase Emulator 도입은 실제 Firebase 경계에서만 재현되는 문제가 확인된 뒤 후속 작업으로 분리한다.

## 8팀장 직접 확인 테스트 구현

- 2026-05-20: `POST /api/e2e/auction-fixture/create` route를 추가해 E2E fixture mode에서 임의 captains payload로 방과 8개 leader link를 생성할 수 있게 했다.
- 2026-05-20: `playwright/auction-eight-leaders-visual.spec.ts`는 organizer 1개와 leader 8개를 독립 browser context로 열고, 경매 시작 직후 모든 leader의 `입찰하기` 버튼과 number input 상태를 진단한다.
- 2026-05-20: `E2E_VISUAL_PAUSE=1`이면 검증 직후 `page.pause()`로 멈춰 사용자가 9개 화면을 직접 볼 수 있게 한다. 자동 실행은 경매 시작 직후 8팀장 모두의 입찰 버튼과 number input이 활성화되는지 확인하는 범위로 제한한다.
- 2026-05-20: 검증 결과 `npm run test:e2e:auction:8leaders`, `npm run test:e2e:multi-pc`, `npm run test:e2e:auction`이 통과했다. 전체 경매 E2E 첫 실행에서는 500ms 레이턴시 테스트가 529ms로 1회 실패했으나, 단독 재실행과 전체 재실행 모두 통과했다.

## 8팀장 visual 테스트 체감 개선

- 2026-05-20: 사용자가 headed 실행에서 모든 화면에 컴파일/렌더링 알림이 표시되고 타이머가 4분대부터 시작한다고 보고했다.
- 2026-05-20: 원인은 `test:e2e:auction:8leaders:headed`가 Playwright 기본 dev server를 사용해 9개 페이지에서 Turbopack dev overlay가 보이는 점, 그리고 테스트가 수동 확인 시간을 확보하려고 `durationMs: 300_000`으로 경매를 시작한 점이다.
- 2026-05-20: 수정 방향은 기존 `test:e2e:auction`처럼 production build/start 서버에서 visual 테스트를 실행하고, 페이지가 모두 로드된 뒤 60초 타이머로 경매를 시작하는 것이다.
- 2026-05-20: `scripts/run_auction_8leaders_visual.js`를 추가해 8팀장 visual 테스트를 `next build`와 `next start` 기반으로 실행하도록 변경했다. production 서버에서는 9개 화면의 fixture polling 중 command API를 호출하면 연결이 끊길 수 있어, fixture 경매 상태는 화면을 열기 전에 60초 타이머로 준비한다.
- 2026-05-20: 검증 결과 `npm run test:e2e:auction:8leaders`와 `npm run test:e2e:multi-pc`가 통과했다. 8팀장 테스트는 production runner에서 컴파일 오버레이 없이 실행되며, 타이머는 60초로 시작한다.

## Firebase 통합 환경 테스트 전제조건

- 2026-05-20: 사용자는 fixture가 아니라 Firebase까지 포함한 통합 환경 테스트가 필요하다고 요청했다.
- 2026-05-20: 현재 `src/lib/firebase.ts`에는 client SDK emulator 연결이 없고, `src/lib/firebaseAdmin.ts`는 `E2E_SCHEDULE_FIXTURE=1`이면 Admin 초기화를 스킵한다. 따라서 통합 테스트는 fixture runner와 별도 실행 경로가 필요하다.
- 2026-05-20: `firebase-integration-test-prerequisites.md`에 Emulator Suite 기반 1차 통합 테스트 전제, 운영 Firebase 수동 검증 전제, 성공 기준, 비범위, 구현 순서를 정리했다.

