# 경매 시스템 부하테스트 (k6)

Next.js 기반 경매 시스템의 HTTP 레이어를 대상으로 하는 k6 부하테스트 스크립트 모음.

Firebase RTDB WebSocket은 k6에서 직접 테스트할 수 없으므로, E2E Fixture API와 Next.js API Routes에 집중한다.

---

## 디렉토리 구조

```
load-tests/
├── README.md                       # 이 파일
├── config.js                       # 공통 설정 (BASE_URL, 타임아웃, 임계값)
├── helpers/
│   └── auction-api.js              # E2E Fixture API 헬퍼 함수
└── scenarios/
    ├── 01-normal-auction.js        # 정상 경매 흐름 (10 VU, 4분)
    ├── 02-concurrent-bids.js       # 동시 입찰 스파이크 (10 VU, 2.5분)
    ├── 03-mixed-load.js            # 채팅 + 입찰 혼합 부하 (15 VU, 4분)
    └── 04-watchdog.js              # Watchdog 엔드포인트 부하 (2분)
```

---

## k6 설치

### macOS (Homebrew)
```bash
brew install k6
```

### Windows (Chocolatey)
```powershell
choco install k6
```

### Windows (직접 다운로드)
1. https://github.com/grafana/k6/releases 에서 최신 Windows 바이너리 다운로드
2. `k6.exe`를 PATH에 추가

### Linux
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

설치 확인:
```bash
k6 version
```

---

## 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `BASE_URL` | `http://localhost:3000` | 테스트 대상 서버 URL |
| `CRON_SECRET` | `dev-secret` | Watchdog 인증 Bearer 토큰 |
| `E2E_AUCTION_FIXTURE` | (없음) | Next.js 서버에서 `1`로 설정해야 fixture API 활성화 |

### 로컬 개발 서버 실행 시 필수 설정

`.env.local` 또는 서버 환경에 다음을 추가해야 한다.

```env
E2E_AUCTION_FIXTURE=1
```

Vercel Preview 배포 사용 시:
```bash
export BASE_URL=https://your-preview.vercel.app
export CRON_SECRET=your-actual-cron-secret
```

---

## 시나리오별 실행 방법

### 공통 사전 조건

```bash
# 로컬 개발 서버 시작 (별도 터미널)
E2E_AUCTION_FIXTURE=1 npm run dev
```

---

### 01. 정상 경매 흐름 (`01-normal-auction.js`)

10명의 VU가 순차적으로 입찰하는 기본 흐름을 검증한다.

```bash
k6 run load-tests/scenarios/01-normal-auction.js

# Vercel Preview 대상
BASE_URL=https://your-preview.vercel.app \
  k6 run load-tests/scenarios/01-normal-auction.js
```

**측정 항목.**
- 입찰 성공/실패 횟수 (`bid_success_count`, `bid_fail_count`)
- 경매 라운드 응답 시간 (`auction_round_duration_ms`)
- 전체 HTTP 응답 시간 및 실패율

**성공 기준.**
- 95%ile 응답 2초 이하
- HTTP 실패율 5% 이하
- 입찰 성공 1회 이상

---

### 02. 동시 입찰 스파이크 (`02-concurrent-bids.js`)

경매 시작 직후 10명이 동시에 입찰하여 Firestore 트랜잭션 경합을 재현한다.

```bash
k6 run load-tests/scenarios/02-concurrent-bids.js
```

**측정 항목.**
- 동시 입찰 충돌률 (`bid_conflict_rate`)
- 재시도 횟수 (`bid_retry_count`)
- 동시 입찰 응답 시간 (`concurrent_bid_latency_ms`)

**성공 기준.**
- 95%ile 응답 3초 이하 (경합 재시도 포함)
- HTTP 실패율 60% 이하 (경합 실패는 정상 동작)
- 동시 입찰 성공 1회 이상

> 참고: 이 시나리오에서 HTTP 실패율이 높은 것은 정상이다. fixture API가 경합 패배 시 400을 반환하기 때문.

---

### 03. 채팅 + 입찰 혼합 부하 (`03-mixed-load.js`)

VU의 70%는 입찰, 30%는 상태 폴링(관찰자)으로 혼합 부하를 생성한다.

```bash
k6 run load-tests/scenarios/03-mixed-load.js
```

**측정 항목.**
- 입찰 응답 시간 (`bid_under_mixed_load_ms`)
- 상태 조회 응답 시간 (`state_under_mixed_load_ms`)
- 룸 페이지 로드 시간 (`room_page_load_ms`)
- 입찰 성공률 (`mixed_bid_success_rate`)

**성공 기준.**
- 입찰 95%ile 2초 이하
- 상태 조회 95%ile 1초 이하
- 룸 페이지 로드 95%ile 3초 이하

---

### 04. Watchdog 부하 테스트 (`04-watchdog.js`)

`/api/auction-watchdog` 엔드포인트를 고빈도로 호출하고 인증 검증도 함께 수행한다.

```bash
k6 run load-tests/scenarios/04-watchdog.js

# 운영 환경 시크릿 사용
CRON_SECRET=your-cron-secret \
BASE_URL=https://your-preview.vercel.app \
  k6 run load-tests/scenarios/04-watchdog.js
```

**측정 항목.**
- Watchdog 응답 시간 (`watchdog_latency_ms`)
- 성공/실패 횟수 (`watchdog_success_count`, `watchdog_fail_count`)
- 미인증 요청 차단률 (`watchdog_unauthorized_rate`)
- 복구된 룸 수 (`watchdog_recovered_rooms`)

**성공 기준.**
- 95%ile 응답 5초 이하 (Firestore 쿼리 포함)
- 인증 없는 요청은 항상 401 반환
- 인증된 요청 실패 5회 미만

---

## 결과 리포트 출력

k6는 기본적으로 콘솔에 요약을 출력한다. HTML 리포트가 필요하면:

```bash
# k6 Cloud 사용 (무료 티어 있음)
k6 cloud load-tests/scenarios/01-normal-auction.js

# JSON 결과 파일로 저장
k6 run --out json=results/01-normal-$(date +%Y%m%d).json \
  load-tests/scenarios/01-normal-auction.js
```

---

## 주요 타이밍 상수 참고

`src/features/auction/constants/auctionTimings.ts` 기준.

| 상수 | 값 | 설명 |
|------|----|------|
| `AUCTION_DURATION_MS` | 10,000ms | 기본 경매 시간 |
| `RE_AUCTION_DURATION_MS` | 10,000ms | 재경매 시간 |
| `EXTEND_THRESHOLD_MS` | 8,000ms | 잔여 시간이 이 값 이하일 때 연장 트리거 |
| `EXTEND_DURATION_MS` | 8,000ms | 연장 시간 |
| `BID_INCREMENT` | 10P | 최소 입찰 단위 |
