# Firestore 데이터베이스 계약

이 문서는 현재 구현에서 직접 참조하는 주요 Firestore 경로와 실제 팀 배정 필드를 요약한다.

## Auction Rooms

- `rooms/{roomId}`는 경매 room 정본 상태다.
- 경매 진행 hot state는 `current_player_id`, `timer_ends_at`, `active_bid`, `sealed_bid_*`, `auction_revision`, `last_auction_event`를 사용한다.
- 종료 후 실제 팀 배정은 같은 room 문서의 `team_assignment` 필드에 저장한다.

```ts
type TeamAssignmentDocument = {
  status: "CONFIRMED";
  confirmed_at: Timestamp;
  assignments: Array<{
    auction_team_id: string;
    assigned_team_id: number;
    status: "MANUAL" | "SUGGESTED" | "EXCEPTION";
    exception_reason:
      | "NO_COMMON_CANDIDATE"
      | "CANDIDATES_EXHAUSTED"
      | "INVALID_DESIRED_TEAM"
      | "FORCED_BY_ORGANIZER"
      | null;
    original_candidate_team_ids: number[];
    message: string | null;
  }>;
};
```

## Auction Archives

- `auction_archives/{archiveId}.result_snapshot`은 종료 시점의 경매 팀과 로스터 snapshot이다.
- `saveAuctionArchive()`는 room의 `team_assignment`를 `auction_archives/{archiveId}.team_assignment`로 복사한다.
- archive 기반 리그 일정은 이 필드가 `CONFIRMED`일 때만 생성할 수 있다.

## League Schedules

- `league_schedules/{scheduleId}`는 일정 메타데이터를 저장한다.
- `league_schedules/{scheduleId}/match_days/{dateKey}`는 날짜별 경기 배열과 revision을 저장한다.
- `createLeagueSchedule()`은 archive 연결 시 최종 실제 팀 배정 확정 여부를 서버에서 검증한다.
