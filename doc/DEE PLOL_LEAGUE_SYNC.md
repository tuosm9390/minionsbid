# Deeplol 개인 경기 기반 리그 전적 동기화

## 확정된 범위

이 설계는 **SLL 데이터와 SLL 전용 엔드포인트를 사용하지 않는다.** Deeplol 모임 API로 구성원 PUUID를 확보한 뒤, 각 PUUID의 개인 경기 목록과 경기 상세 API만 사용한다.

```text
/tournament/server_info?server_id=351
  → 구성원 PUUID·Riot ID 카탈로그

/match/matches?puu_id=...&platform_id=KR&...
  → 구성원별 경기 ID 후보

/match/match-cached?match_id=...&platform_id=KR
  → 경기 토너먼트명·시각·10명 참가자·개인 전적
```

## Firestore 스키마

### `league_schedules/{scheduleId}` 확장 필드

```text
deeplol_tournament_name: string | null
deeplol_member_puu_ids: string[]
deeplol_platform_id: string | null
deeplol_page_size: number
```

기존 `starts_at`, `ends_at`을 리그 기간으로 사용한다. `ends_at`은 동기화 시 해당 날짜 23:59:59까지 포함한다.

### `league_schedules/{scheduleId}/deeplol_participants/{encodedPuuId}`

```text
puu_id: string
riot_name: string | null
riot_tag: string | null
team_id: string | null
team_name: string | null
position: string | null
status: "ACTIVE"
updated_at: Timestamp
```

리그 생성 시점의 `deeplol_member_puu_ids`는 경기 후보 수집 대상이다. `deeplol_participants`는 실제 리그 통계에 반영할 허용 목록으로 사용한다. 운영 환경에서는 두 목록을 동일하게 관리하는 것을 권장한다.

### `league_schedules/{scheduleId}/deeplol_matches/{matchId}`

```text
external_match_id: string
tournament_name: string | null
platform_id: string
created_at_external: string | null
duration_seconds: number | null
queue_id: string | null
participants: DeeplolMatchParticipant[]
import_status: "IMPORTED" | "SKIPPED_TOURNAMENT" | "SKIPPED_OUT_OF_RANGE" | "PENDING_REVIEW"
imported_at: Timestamp
updated_at: Timestamp
```

외부 `match_id`를 문서 ID로 사용해 동일 경기의 반복 처리를 막는다.

### `league_schedules/{scheduleId}/deeplol_team_stats/{encodedTeamKey}`

팀별 `team_id`, `team_name`, `roster_size`, `matches`, `wins`, `losses`, `kills`, `deaths`, `assists`, `kda`, `win_rate`를 저장한다. 실제 리그 경기는 5명씩 두 팀으로 구성되므로, 등록된 팀 로스터는 5명 또는 6명이어야 하고 경기 편입 시에는 각 팀에서 정확히 5명의 PUUID가 매칭되어야 한다.

기존의 개인별 통계 컬렉션은 새 집계 경로에서 사용하지 않는다. 팀 전적은 증분 가산하지 않고 현재 `IMPORTED` 원본 경기 전체에서 재계산한다.

### `league_schedules/{scheduleId}/deeplol_sync_runs/{runId}`

동기화 상태, 발견 경기 수, 신규 경기 수, 중복 경기 수, 제외 경기 수, 재시도 요청 수, 실패한 match ID, 오류 목록을 저장한다. `_active` 문서는 리그별 실행 잠금으로 사용하며 `lease_until_ms`가 지나면 안전하게 만료된 실행으로 간주한다.

## 리그 생성 설정

기존 `createLeagueSchedule()` payload에 다음 필드를 사용한다.

```json
{
  "name": "2026-S2 리그전",
  "startsAt": "2026-08-15T00:00:00+09:00",
  "endsAt": "2026-09-15T00:00:00+09:00",
  "deeplolTournamentName": "2026-S2 리그전",
  "deeplolMemberPuuIds": ["member-puu-id-1", "member-puu-id-2"],
  "deeplolPlatformId": "KR",
  "deeplolPageSize": 20
}
```

## 동기화 흐름

1. 현재 리그에 등록된 PUUID별로 `/match/matches`를 호출한다.
2. `match_id_list[].match_id`를 합치고 중복 제거한다.
3. 경기 생성 시각이 리그 기간 밖이면 상세 조회 대상에서 제외하거나 결과를 `SKIPPED_OUT_OF_RANGE`로 기록한다.
4. 각 `match_id`에 대해 `/match/match-cached`를 호출한다.
5. 상세의 `match_basic_dict.tournament_name`을 설정값과 비교한다. 공백·유니코드 정규화만 적용하고 부분 문자열 매칭은 사용하지 않는다.
6. 경기 참가자의 PUUID가 현재 리그 허용 목록과 겹치는지 확인한다.
7. 토너먼트명·기간·참가자 조건을 만족하고 아직 등록되지 않은 경기만 `IMPORTED`로 저장한다.
8. 등록된 전체 원본 경기에서 선수 전적을 재집계한다.

일반 랭크·칼바람도 개인 경기 목록에 포함될 수 있으므로, **날짜만으로 리그 경기를 판정하지 않는다.** 실제 리그 경기에서 `tournament_name`이 비어 있다면 Match ID를 관리자 보조 등록 대상으로 보내야 한다.

## API 엔드포인트

### 참가자 등록

`POST /api/league-schedules/{scheduleId}/deeplol/participants`

```json
{
  "adminCode": "...",
  "members": [
    {
      "puuId": "member-puu-id",
      "riotName": "player",
      "riotTag": "KR1",
      "teamId": "team-1",
      "teamName": "Minions A",
      "position": "Jungle"
    }
  ]
}
```

### 참가자 조회

`GET /api/league-schedules/{scheduleId}/deeplol/participants`

### 개인 경기 기반 동기화

`POST /api/league-schedules/{scheduleId}/deeplol/sync`

```json
{
  "adminCode": "...",
  "tournamentName": "2026-S2 리그전",
  "memberPuuIds": ["member-puu-id-1", "member-puu-id-2"],
  "platformId": "KR",
  "pageSize": 20,
  "timezone": "Asia/Seoul"
}
```

### 집계 전적 조회

`GET /api/league-schedules/{scheduleId}/deeplol/sync`

## 오류 처리와 재시도

Deeplol 요청은 타임아웃, 네트워크 예외, HTTP 408·425·429·5xx에 대해 최대 3회까지 지수 백오프로 재시도한다. 기본 대기 시간은 250ms에서 시작하고 시도마다 증가하며 작은 무작위 지연을 더해 동시 재요청을 분산한다. 4xx 일반 오류는 재시도하지 않는다.

경기 단위 처리에 실패하면 해당 `match_id`를 `failedMatchIds`와 동기화 실행 문서에 기록하고 전체 실행을 중단하지 않는다. 실패한 경기는 `IMPORTED` 원본으로 저장되지 않으므로 다음 동기화에서 다시 시도할 수 있다. 이미 `IMPORTED`인 경기는 원본을 다시 더하지 않고 건너뛴다.

같은 리그에 대한 동시 동기화는 `deeplol_sync_runs/_active` 잠금으로 차단한다. 실행이 비정상 종료되어도 임대 시간이 지나면 다음 실행이 잠금을 회수할 수 있다. Firestore 원본 경기와 이전 집계 결과는 삭제하지 않으므로 네트워크 장애 중에도 기존 데이터가 유실되지 않는다.

## 팀 단위 처리 규칙

Deeplol 참가자 등록 문서의 `puu_id → team_id/team_name` 매핑을 사용한다. 경기 상세의 10명 참가자가 정확히 두 개의 등록 팀으로 나뉘고 각 팀에서 5명씩 매칭될 때만 `IMPORTED`로 저장한다. 팀이 하나라도 누락되거나 5명 미만·초과로 매칭되면 `PENDING_REVIEW`로 저장하고 전적에 반영하지 않는다.

## 운영상 한계

Deeplol 개인 경기 목록 API는 구성원별 최근 경기 ID를 제공하지만, 그 경기 자체가 현재 리그 경기라는 사실을 목록 단계에서 보장하지 않는다. 따라서 경기 상세의 `tournament_name`이 실제로 채워지는지 검증해야 한다. 빈 값인 경우에는 자동 판정이 불가능하므로 관리자가 `match_id`를 입력하는 보조 경로를 유지한다.

현재 코드에서는 SLL `team_id`, SLL 토너먼트 조회, `sll_match_data`를 사용하지 않는다. 수집 비용은 리그 참가자 수와 페이지 수에 비례하므로, 리그 기간보다 오래된 페이지는 중단하고 이미 확인한 최신 `match_id`를 캐시하는 것이 좋다.

## Firestore 배치 동기화

전체 활성 리그를 먼저 조회만 하려면 다음 명령을 사용한다. 기본 모드는 `dry-run`이며 Firestore의 경기 원본이나 통계를 변경하지 않는다.

```bash
pnpm sync:deeplol -- --limit 10
```

실제 Deeplol 조회와 Firestore 저장을 수행하려면 서버 전용 Firebase 환경변수가 설정된 환경에서 `--write`를 명시한다.

```bash
pnpm sync:deeplol -- --write
```

특정 일정만 처리하려면 `--schedule-id`를 사용한다.

```bash
pnpm sync:deeplol -- --write --schedule-id <scheduleId>
```

배치는 `league_schedules`에서 완료되지 않은 일정 중 `deeplol_tournament_name`이 설정된 일정만 대상으로 한다. 일정 문서에 저장된 `deeplol_member_puu_ids`가 있으면 우선 사용하고, 없으면 해당 일정의 `deeplol_participants` 하위 컬렉션에서 `ACTIVE` PUUID를 읽는다. 이후 기존 서버 동기화 모듈을 호출하므로 토너먼트명 정확 일치, 리그 기간, 팀별 PUUID 매핑, 경기 중복 방지, 네트워크 재시도, 리그별 동시 실행 잠금이 동일하게 적용된다.

배치 종료 시 표준 출력에 JSON 요약을 남긴다. 실패한 일정이 있으면 exit code 2, 환경·초기화 등 치명적 오류는 exit code 1을 반환한다. Firebase Admin 자격 증명과 `FIRESTORE_DATABASE_ID`는 로그에 출력하지 않으며 `.env.local` 또는 배포 환경의 서버 전용 변수로만 제공해야 한다.

## Discord 실패 알림

배치가 실제 실행 모드에서 하나 이상의 일정 처리에 실패하거나 치명적 오류로 중단되면 `DISCORD_DEEPLOL_WEBHOOK_URL` 환경변수에 지정된 Discord Webhook으로 오류 Embed를 전송한다. 웹훅 URL은 `.env.local` 또는 배포 환경의 서버 전용 환경변수에 설정하고 소스 코드·Firestore·로그에 저장하지 않는다.

```bash
DISCORD_DEEPLOL_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>
```

알림에는 실행 모드, 대상 일정 수, 성공·실패 수, 실패한 일정 ID와 오류 요약이 포함된다. Discord 전송 자체가 실패하더라도 원래 배치의 exit code와 Firestore 동기화 상태는 변경하지 않는다. Dry-run에서는 실제 데이터 변경이 없으므로 Discord 알림을 보내지 않는다.

## 프로덕션 주기 실행

이 프로젝트에는 두 가지 운영 구성을 추가했다. 관리 부담을 줄이려면 GitHub Actions를 권장한다. 별도 서버 없이 저장소의 workflow가 UTC 기준 매 30분마다 실행되고, `concurrency` 잠금으로 이전 실행이 끝나기 전에 다음 실행이 중복되지 않는다. 서버를 이미 운영 중이고 로그·네트워크·실행 환경을 직접 관리해야 한다면 Cron 래퍼를 사용할 수 있다.

### GitHub Actions

`.github/workflows/deeplol-sync.yml`이 저장소에 포함되어 있다. GitHub 저장소의 **Settings → Secrets and variables → Actions**에 다음 시크릿을 등록한다.

| Secret | 용도 |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin 서비스 계정 이메일 |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin 서비스 계정 private key. 줄바꿈을 포함한 원문을 저장 |
| `FIREBASE_DATABASE_URL` | 필요한 경우 Firebase Database URL |
| `FIRESTORE_DATABASE_ID` | 기본 데이터베이스가 아닌 경우에만 지정 |
| `DISCORD_DEEPLOL_WEBHOOK_URL` | 배치 실패 Discord Webhook URL |

`workflow_dispatch`를 이용해 수동 실행할 때는 특정 `scheduleId`와 일정 처리 상한을 입력할 수 있다. workflow 로그에는 결과 JSON이 남고, 실패 여부와 무관하게 요약 로그 artifact가 14일간 보관된다. `FIREBASE_PRIVATE_KEY`는 저장소 변수나 YAML에 직접 작성하지 않는다.

### Cron

전용 Linux 서버에 프로젝트를 배포한 뒤 다음 파일을 실행 가능하게 둔다.

```bash
chmod +x deploy/cron/deeplol-sync.sh
```

`/opt/minionsbid/.env.production.local`에 서버 전용 환경변수를 저장하고 권한을 제한한다.

```bash
chmod 600 /opt/minionsbid/.env.production.local
```

그 다음 `crontab -e`에 다음 항목을 추가한다. Cron은 서버의 로컬 시간대를 사용하므로 운영 서버의 timezone을 먼저 확인해야 한다.

```cron
*/30 * * * * /opt/minionsbid/deploy/cron/deeplol-sync.sh >> /opt/minionsbid/logs/deeplol/cron.log 2>&1
```

래퍼는 `flock`으로 중복 실행을 방지하고, 실행별 로그를 `logs/deeplol/`에 저장한다. 실패 시 배치 스크립트가 `DISCORD_DEEPLOL_WEBHOOK_URL`로 알림을 전송한다. 로그에는 Firebase 자격 증명이나 웹훅 URL을 출력하지 않는다. 로그 보관 기간은 운영 서버의 `logrotate`로 별도 관리한다.

### 권장 선택

GitHub Actions는 별도 서버가 필요 없고 저장소 변경 이력·실행 결과·수동 재실행을 한곳에서 관리할 수 있으므로 기본 선택으로 권장한다. Cron은 고정 IP, 사설 네트워크 접근, 장기 로그 보관처럼 서버 운영이 이미 필요한 경우에 선택한다. 두 방식을 동시에 활성화하면 서로 다른 잠금 범위를 사용할 수 있으므로 하나만 운영해야 한다.

## Discord 경기 요약 메시지

실제 write 배치가 완료되면 성공 여부와 관계없이 Discord Embed를 전송한다. 메시지에는 일정별로 다음 경기 요약이 포함된다.

```text
발견 12 / 신규 3 / 중복 8 / 제외 1 / 재시도 2
Alpha 2승 1패 (66.7%, KDA 1.82)
Beta 1승 2패 (33.3%, KDA 1.41)
```

`발견`은 구성원 경기 목록에서 찾은 고유 경기 수, `신규`는 처음 `IMPORTED`된 경기 수, `중복`은 이미 저장된 원본 경기 수, `제외`는 토너먼트명·기간·팀 매핑 검증에서 제외된 경기 수, `재시도`는 일시적 네트워크 오류 뒤 재요청한 횟수다. 팀 행에는 팀명, 승패, 승률, KDA가 표시된다. Discord Embed의 필드·문자열 길이 제한을 초과하지 않도록 일정은 최대 8개, 팀은 일정당 최대 6개까지 메시지에 표시하며 원본 전체 결과는 Firestore의 sync run과 team stats에 보존한다.

## Vercel Cron API

Vercel Cron용 엔드포인트는 `GET /api/cron/deeplol-sync`이며 `Authorization: Bearer <CRON_SECRET>` 헤더가 없거나 일치하지 않으면 401을 반환한다. `vercel.json`은 UTC 기준 매 30분마다 이 Route를 호출하도록 설정되어 있다.

Vercel Production 환경변수에는 기존 Firebase·Discord 변수와 함께 다음 값을 추가해야 한다.

```text
CRON_SECRET=<긴 랜덤 문자열>
DEEPLOL_CRON_MAX_SCHEDULES=10
```

`DEEPLOL_CRON_MAX_SCHEDULES`는 한 번의 Cron 요청에서 처리할 최대 리그 일정 수이며 기본값은 10, 최대값은 50이다. Route는 `COMPLETED`가 아니고 `deeplol_tournament_name`이 설정된 일정만 처리한다. 일정이 없으면 Discord 알림을 보내지 않아 빈 실행 알림이 반복되지 않는다.

배포 후 Vercel의 **Deployments → Functions** 로그에서 `/api/cron/deeplol-sync` 응답을 확인한다. 정상 응답은 `200`, 일부 일정 실패는 `500`이며, Cron 호출 인증 실패는 `401`이다. 실제 동기화 결과와 팀별 통계는 기존 Firestore sync run·match·team stats 컬렉션에 저장되고, 처리된 일정이 있으면 Discord 요약 Embed가 전송된다.
