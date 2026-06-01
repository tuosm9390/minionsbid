# 경매 OS 호환성 검증 계획

## 목표

현재 경매 시스템이 OS 차이로 대표 공개 입찰 흐름을 깨지 않는지 반복 검증할 수 있게 만든다.

## 범위

- 로컬 검증은 현재 OS에서 Chromium 대표 smoke를 실행한다.
- 실제 OS 동일성은 GitHub Actions의 `ubuntu-latest`, `windows-latest`, `macos-latest` 러너에서 Chromium smoke로 확인한다.
- 브라우저 엔진 차이는 Ubuntu 러너에서 Chromium, Firefox, WebKit smoke로 분리 확인한다.
- 모바일은 실제 기기 검증이 아니라 Playwright의 `mobile-chrome`, `mobile-safari` 프로젝트 설정까지만 둔다.

## 대표 시나리오

1. fixture `active-auction` 방을 생성한다.
2. Blue와 Red 팀장 링크를 독립 browser context로 연다.
3. 두 팀장 모두 초기 입찰값 `10`과 `입찰하기` 버튼을 확인한다.
4. Blue가 `10`으로 입찰한다.
5. Blue는 `최고 입찰 유지 중`을 보고, Red의 다음 입찰값은 `20`으로 수렴한다.
6. fixture state의 canonical `liveBid`와 bid history가 Blue `10` 한 건으로 저장됐는지 확인한다.

## 변경 작업

- `playwright/auction-os-compatibility.spec.ts` 대표 smoke 추가.
- `playwright.config.ts`에 Chromium, Firefox, WebKit, mobile Chrome, mobile Safari 프로젝트 추가.
- `package.json`에 `test:e2e:auction:compat` 추가.
- `.github/workflows/auction-realtime-ci.yml`에 OS 매트릭스와 브라우저 매트릭스 추가.
- `__tests__/auctionOsCompatibilityConfig.test.ts`로 설정 회귀 방지.
- README, `checklist.md`, `context-notes.md`에 범위와 한계 기록.

## 검증

- `npx vitest run __tests__/auctionOsCompatibilityConfig.test.ts -t os-compat-config`.
- `npm run test:e2e:auction:compat`.
- `npm run test`.
- `npm run build`.

## 알려진 한계

- 이 로컬 세션은 Windows만 실제 실행한다.
- Ubuntu와 macOS 실제 동일성은 워크플로가 원격 러너에서 실행된 뒤 확정된다.
- 로컬 Firefox는 `browserContext.newPage()`에서 timeout이 발생해 앱 경매 로직에 도달하지 못했다. 브라우저 엔진 검증은 CI 브라우저 매트릭스에서 확인한다.
