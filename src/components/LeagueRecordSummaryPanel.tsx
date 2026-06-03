"use client";

import { useMemo, useState } from "react";
import { BarChart3, Crown, Swords } from "@/components/ui/CyberIcons";
import type {
  LeagueRosterTeam,
  LeagueScheduleDay,
} from "@/features/schedules/types";
import {
  buildLeagueRecordRows,
  listLeagueMatches,
  summarizeLeagueMatches,
  type LeagueMatchStatusFilter,
} from "@/features/schedules/utils/leagueRecords";

const stageOrder = ["결승", "4강", "8강", "플레이오프", "조별리그"];

export function LeagueRecordSummaryPanel({
  scheduleName,
  championTeamName,
  rosterTeams,
  days,
}: {
  scheduleName: string;
  championTeamName: string | null;
  rosterTeams: LeagueRosterTeam[];
  days: LeagueScheduleDay[];
}) {
  const [selectedStageLabel, setSelectedStageLabel] = useState("ALL");
  const [selectedStatus, setSelectedStatus] =
    useState<LeagueMatchStatusFilter>("ALL");

  const stageOptions = useMemo(() => {
    const stages = new Set<string>();

    days.forEach((day) => {
      day.matches.forEach((match) => {
        const stageLabel = match.stageLabel.trim();
        if (stageLabel) stages.add(stageLabel);
      });
    });

    return Array.from(stages).sort((left, right) => {
      const leftIndex = stageOrder.indexOf(left);
      const rightIndex = stageOrder.indexOf(right);
      const normalizedLeftIndex =
        leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRightIndex =
        rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeftIndex !== normalizedRightIndex) {
        return normalizedLeftIndex - normalizedRightIndex;
      }

      return left.localeCompare(right, "ko-KR");
    });
  }, [days]);

  const filters = useMemo(
    () => ({
      stageLabel: selectedStageLabel === "ALL" ? null : selectedStageLabel,
      status: selectedStatus,
    }),
    [selectedStageLabel, selectedStatus],
  );

  const seededTeamNames = useMemo(() => {
    if (selectedStageLabel === "ALL") return undefined;

    const teamNames = new Set<string>();
    days.forEach((day) => {
      day.matches.forEach((match) => {
        if (match.stageLabel.trim() !== selectedStageLabel) return;
        if (match.homeTeamName.trim()) teamNames.add(match.homeTeamName.trim());
        if (match.awayTeamName.trim()) teamNames.add(match.awayTeamName.trim());
      });
    });

    return Array.from(teamNames);
  }, [days, selectedStageLabel]);

  const recordRows = buildLeagueRecordRows({
    rosterTeams,
    days,
    filters,
    seedTeamNames: seededTeamNames,
  });
  const matchSummary = summarizeLeagueMatches(days, filters);
  const filteredMatches = listLeagueMatches({ days, filters });
  const leader = recordRows[0] ?? null;
  const hasCompletedMatch = matchSummary.completedMatches > 0;

  return (
    <div className="bg-white border-4 border-black p-5 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <BarChart3 size={18} className="text-minion-blue" />
          <div>
            <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
              League Record
            </p>
            <h3 className="text-fluid-lg font-black mt-1">현재 리그 전적</h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="border-2 border-black bg-[#eef4ff] px-3 py-2 text-fluid-xs font-black text-minion-blue">
            팀 {recordRows.length}
          </span>
          <span className="border-2 border-black bg-[#fff4a8] px-3 py-2 text-fluid-xs font-black">
            완료 {matchSummary.completedMatches}
          </span>
          <span className="border-2 border-black bg-[#eaf7ee] px-3 py-2 text-fluid-xs font-black text-green-700">
            진행 {matchSummary.inProgressMatches}
          </span>
          <span className="border-2 border-black bg-[#fffdf8] px-3 py-2 text-fluid-xs font-black text-gray-700">
            대기 {matchSummary.pendingMatches}
          </span>
        </div>

        <p className="text-fluid-sm font-bold text-gray-600">
          {scheduleName}의 경기 중 선택한 단계와 상태를 기준으로 팀별 승패와
          세트득실을 다시 집계합니다.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,220px)_1fr]">
        <label className="space-y-2">
          <span className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-blue">
            Stage Filter
          </span>
          <select
            value={selectedStageLabel}
            onChange={(event) => setSelectedStageLabel(event.target.value)}
            className="w-full border-2 border-black bg-white px-3 py-3 text-sm font-black"
          >
            <option value="ALL">전체 단계</option>
            {stageOptions.map((stageLabel) => (
              <option key={stageLabel} value={stageLabel}>
                {stageLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-blue">
            Status Filter
          </span>
          <select
            value={selectedStatus}
            onChange={(event) =>
              setSelectedStatus(event.target.value as LeagueMatchStatusFilter)
            }
            className="w-full border-2 border-black bg-white px-3 py-3 text-sm font-black"
          >
            <option value="ALL">전체 상태</option>
            <option value="IN_PROGRESS">진행 중</option>
            <option value="COMPLETED">완료</option>
            <option value="PENDING">대기</option>
          </select>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="border-4 border-black bg-black text-white p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-yellow">
            Current Leader
          </p>
          {leader ? (
            <>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-fluid-lg font-black">{leader.teamName}</p>
                  <p className="text-fluid-sm font-bold text-white/75 mt-2">
                    {leader.wins}승 {leader.losses}패 · 세트득실{" "}
                    {leader.setDiff >= 0 ? "+" : ""}
                    {leader.setDiff}
                  </p>
                </div>
                <div className="border-2 border-white bg-minion-yellow px-3 py-1 text-fluid-xs font-black text-black">
                  #{leader.rank}
                </div>
              </div>
              <p className="text-fluid-xs font-bold text-white/70 mt-4">
                {hasCompletedMatch
                  ? "현재 필터에서 완료 처리된 경기만 순위에 반영됩니다."
                  : "현재 필터에서 완료된 경기가 없어 모든 팀 전적은 0으로 표시됩니다."}
              </p>
            </>
          ) : (
            <p className="text-fluid-sm font-bold text-white/75 mt-3">
              전적을 집계할 팀 데이터가 없습니다.
            </p>
          )}
        </div>

        <div className="border-4 border-black bg-[linear-gradient(180deg,#fffef8_0%,#fff6c9_100%)] p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3">
            <Swords size={16} className="text-minion-blue" />
            <div>
              <p className="text-fluid-xs font-black uppercase tracking-[0.16em] text-minion-blue">
                Record Rule
              </p>
              <p className="text-fluid-sm font-black mt-1">
                다승 우선, 동률 시 세트득실과 세트득점 순서로 비교
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
              전체 경기
              <p className="text-xl mt-1">{matchSummary.totalMatches}</p>
            </div>
            <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
              경기 종료
              <p className="text-xl mt-1">{matchSummary.completedMatches}</p>
            </div>
            <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
              진행 중
              <p className="text-xl mt-1">{matchSummary.inProgressMatches}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
              남은 경기
              <p className="text-xl mt-1">{matchSummary.pendingMatches}</p>
            </div>
            <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
              점수 합산
              <p className="text-xl mt-1">
                {matchSummary.totalHomeScore}:{matchSummary.totalAwayScore}
              </p>
            </div>
          </div>
          <div className="mt-3 border-2 border-black bg-white px-3 py-3">
            <p className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-blue">
              Tie Break
            </p>
            <p className="mt-1 text-fluid-xs font-bold text-gray-700">
              1. 다승 2. 세트득실 3. 세트득점 4. 팀명 순
            </p>
          </div>
        </div>
      </div>

      {recordRows.length === 0 ? (
        <div className="mt-5 border-2 border-dashed border-black p-8 text-center">
          <p className="text-fluid-sm font-black">표시할 팀 전적이 없습니다.</p>
          <p className="text-fluid-xs font-bold text-gray-500 mt-2">
            현재 필터에서 완료된 경기가 없거나 리그에 팀이 연결되지 않았습니다.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto border-4 border-black shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          <table className="min-w-full border-collapse bg-white">
            <thead>
              <tr className="bg-black text-white">
                <th className="border-b-4 border-black px-4 py-3 text-left text-xs font-black uppercase tracking-[0.14em]">
                  순위
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-left text-xs font-black uppercase tracking-[0.14em]">
                  팀
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  경기
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  승
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  패
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  세트
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  세트득실
                </th>
                <th className="border-b-4 border-black px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em]">
                  승률
                </th>
              </tr>
            </thead>
            <tbody>
              {recordRows.map((row) => {
                const isLeader = row.rank === 1;
                const isChampion = championTeamName === row.teamName;

                return (
                  <tr
                    key={row.teamName}
                    className={
                      isLeader
                        ? "bg-[#fff4a8]"
                        : isChampion
                          ? "bg-[#ecfdf3]"
                          : "bg-white"
                    }
                  >
                    <td className="border-t-2 border-black px-4 py-3 text-sm font-black">
                      {row.rank}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="text-sm font-black whitespace-normal break-words leading-tight">
                          {row.teamName}
                        </span>
                        {isLeader && (
                          <span className="border-2 border-black bg-minion-yellow px-2 py-0.5 text-fluid-xs font-black">
                            LEADER
                          </span>
                        )}
                        {isChampion && (
                          <span className="inline-flex items-center gap-1 border-2 border-black bg-green-600 px-2 py-0.5 text-fluid-xs font-black text-white">
                            <Crown size={10} />
                            CHAMPION
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black">
                      {row.played}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black text-green-700">
                      {row.wins}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black text-red-700">
                      {row.losses}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black">
                      {row.setWins}:{row.setLosses}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black">
                      {row.setDiff >= 0 ? "+" : ""}
                      {row.setDiff}
                    </td>
                    <td className="border-t-2 border-black px-4 py-3 text-center text-sm font-black">
                      {row.winRate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 border-4 border-black bg-[#fffdf8] shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        <div className="border-b-4 border-black bg-black px-4 py-3 text-white">
              <div className="flex items-center gap-3">
                <Swords size={16} className="text-minion-yellow" />
                <div>
                  <p className="text-fluid-xs font-black uppercase tracking-[0.16em] text-minion-yellow">
                    Match List
                  </p>
                  <p className="text-fluid-sm font-black mt-1">필터된 경기 목록</p>
                </div>
              </div>
            </div>

        {filteredMatches.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-fluid-sm font-black">조건에 맞는 경기가 없습니다.</p>
            <p className="text-fluid-xs font-bold text-gray-500 mt-2">
              단계 또는 상태 필터를 조정하면 목록이 갱신됩니다.
            </p>
          </div>
        ) : (
          <div className="divide-y-2 divide-black">
            {filteredMatches.map((match) => {
              const statusClassName =
                match.status === "COMPLETED"
                  ? "bg-green-600 text-white"
                  : match.status === "IN_PROGRESS"
                    ? "bg-minion-yellow text-black"
                    : "bg-white text-gray-700";
              const winnerLabel =
                match.winner === "HOME"
                  ? match.homeTeamName
                  : match.winner === "AWAY"
                    ? match.awayTeamName
                    : "결과 대기";
              const winnerBoxClassName =
                match.status === "COMPLETED"
                  ? "bg-black text-minion-yellow"
                  : match.status === "IN_PROGRESS"
                    ? "bg-[#fff4a8] text-black"
                    : "bg-[#f3f4f6] text-gray-600"
              const winnerLabelClassName =
                match.status === "COMPLETED"
                  ? "opacity-80"
                  : "text-gray-500";

              return (
                <div
                  key={`${match.dateKey}-${match.id}`}
                  className="grid grid-cols-1 gap-3 px-4 py-4 xl:grid-cols-[140px_minmax(0,1fr)_272px] xl:items-center"
                >
                  <div className="space-y-2 text-sm font-black">
                    <p>{match.dateLabel}</p>
                    <p className="text-xs text-gray-500">{match.startsAt}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {match.stageLabel && (
                        <span className="border-2 border-black bg-[#eef4ff] px-2 py-1 text-fluid-xs font-black text-minion-blue">
                          {match.stageLabel}
                        </span>
                      )}
                      <span
                        className={`border-2 border-black px-2 py-1 text-fluid-xs font-black ${statusClassName}`}
                      >
                        {match.status === "COMPLETED"
                          ? "완료"
                          : match.status === "IN_PROGRESS"
                            ? "진행 중"
                            : "대기"}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] gap-2 items-stretch">
                      <div className="min-h-[84px] border-2 border-black bg-white px-3 py-3 flex items-center justify-end text-right">
                        <p className="text-fluid-sm font-black leading-tight break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                          {match.homeTeamName}
                        </p>
                      </div>

                      <div className="min-h-[84px] border-2 border-black bg-black text-minion-yellow flex items-center justify-center text-xs font-black tracking-[0.14em]">
                        VS
                      </div>

                      <div className="min-h-[84px] border-2 border-black bg-white px-3 py-3 flex items-center justify-start text-left">
                        <p className="text-fluid-sm font-black leading-tight break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                          {match.awayTeamName}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-stretch gap-2 justify-self-start xl:justify-self-auto">
                    <div
                      className={`w-44 min-h-[84px] shrink-0 border-2 border-black px-3 py-3 text-center ${winnerBoxClassName}`}
                    >
                      <p className={`text-fluid-xs font-black uppercase tracking-[0.12em] ${winnerLabelClassName}`}>
                        Winner
                      </p>
                      <p className="mt-1 text-fluid-sm font-black leading-tight break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                        {winnerLabel}
                      </p>
                    </div>
                    <div className="w-24 min-h-[84px] shrink-0 border-2 border-black bg-white px-3 py-3 text-center text-sm font-black tabular-nums">
                      <p className="text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                        Score
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {match.homeScore}:{match.awayScore}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
