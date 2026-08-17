# Deeplol 수동 매핑 검토 메모

## Production 확인

- URL: https://minionsbid.vercel.app/league-schedule
- 실제 구성원 불러오기 결과: 103명
- 자동 선택된 매핑: 7명
- 나머지는 `팀을 선택하세요` 상태로 표시됨
- 조회 응답의 구성원은 `riot_name`, `riot_tag`, `puu_id`를 포함함

## 현재 UI/로직

- 구성원마다 체크박스와 팀 select를 제공함.
- 자동 매칭은 `team.players[].name`과 Deeplol `member.riotName`만 NFC·공백·소문자 정규화 후 완전 비교함.
- Riot ID가 `이름#태그`로 로스터에 저장되고 Deeplol은 `riot_name`과 `riot_tag`를 분리해 반환하면 현재 비교가 실패할 수 있음.
- 저장은 선택된 구성원과 팀을 서버 액션으로 전달함.

## 개선 우선순위

1. Riot ID를 이름·태그로 분해해 `riot_name + riot_tag` 완전 일치 우선 매칭.
2. 이름만 일치할 때는 자동 선택하지 않고 `확인 필요` 후보로 표시.
3. 미매칭·자동매칭·기존 저장·중복 후보를 탭/필터로 분리.
4. 구성원 검색, 팀별 일괄 선택, 미매칭만 보기 추가.
5. 팀별 5~6명 정원·중복 PUUID·한 PUUID의 복수 팀 배정을 저장 전 검증.
6. 변경 예정 매핑 요약과 저장 후 결과를 표시.
