"use client";

import { Plus, Save, Shield, Swords, X } from "lucide-react";
import type {
  LeagueMatchWinner,
  LeagueRosterTeam,
} from "@/features/schedules/types";

export interface MatchEditorRow {
  id?: string;
  startsAt: string;
  homeTeamName: string;
  awayTeamName: string;
  winner: LeagueMatchWinner;
  note: string;
  isCompleted: boolean;
}

function getWinnerLabel(row: MatchEditorRow) {
  if (row.winner === "HOME") return `${row.homeTeamName || "홈팀"} 승`;
  if (row.winner === "AWAY") return `${row.awayTeamName || "원정팀"} 승`;
  return "결과 대기";
}

export function ScheduleMatchDayEditor({
  selectedDateLabel,
  rows,
  rosterTeams,
  adminCode,
  timelineError,
  isSavingTimeline,
  isSubmittingResultId,
  onAdminCodeChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onSaveDay,
  onSaveResult,
}: {
  selectedDateLabel: string;
  rows: MatchEditorRow[];
  rosterTeams: LeagueRosterTeam[];
  adminCode: string;
  timelineError: string;
  isSavingTimeline: boolean;
  isSubmittingResultId: string | null;
  onAdminCodeChange: (value: string) => void;
  onRowChange: (index: number, patch: Partial<MatchEditorRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onSaveDay: () => void;
  onSaveResult: (row: MatchEditorRow) => void;
}) {
  const completedCount = rows.filter((row) => row.isCompleted).length;
  const pendingCount = rows.length - completedCount;
  const teamMap = new Map(
    rosterTeams.map((team) => [team.name, team] as const),
  );

  function getSelectableTeams(
    rowIndex: number,
    primaryTeamName: string,
    excludedTeamName: string,
  ) {
    const primaryTeam = teamMap.get(primaryTeamName);
    const candidates = primaryTeam
      ? rosterTeams.filter((team) => team.auctionKey === primaryTeam.auctionKey)
      : rosterTeams;
    const occupiedTeamNames = new Set(
      rows.flatMap((row, index) => {
        if (index === rowIndex) return [];
        return [row.homeTeamName.trim(), row.awayTeamName.trim()].filter(
          Boolean,
        );
      }),
    );

    return candidates.filter(
      (team) =>
        team.name !== excludedTeamName && !occupiedTeamNames.has(team.name),
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border-4 border-black p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] space-y-3">
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-minion-blue" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-minion-blue">
              Result Lock
            </p>
            <p className="text-sm font-black">결과 수정 관리자 코드</p>
          </div>
        </div>
        <input
          type="password"
          value={adminCode}
          onChange={(event) => onAdminCodeChange(event.target.value)}
          placeholder="이미 저장된 결과 수정 시에만 필요"
          className="w-full border-2 border-black px-4 py-3 bg-white text-sm font-bold"
        />
      </div>

      <div className="border-4 border-black bg-[linear-gradient(180deg,#fffef8_0%,#fff7cf_100%)] shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="border-b-4 border-black bg-black px-4 py-4 text-white sm:px-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px_auto] xl:items-start">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-minion-yellow">
                  Selected Day
                </p>
                <h3 className="text-lg sm:text-xl lg:text-2xl font-black mt-1 break-keep whitespace-normal">
                  {selectedDateLabel}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
                <span className="border-2 border-white bg-minion-yellow px-3 py-1 text-[11px] font-black text-black">
                  TOTAL {rows.length}
                </span>
                <span className="border-2 border-white bg-[#143e7a] px-3 py-1 text-[11px] font-black">
                  PENDING {pendingCount}
                </span>
                <span className="border-2 border-white bg-green-600 px-3 py-1 text-[11px] font-black">
                  SAVED {completedCount}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 w-full self-stretch sm:grid-cols-[minmax(0,1fr)_auto] xl:contents">
              <div className="border-2 border-white/80 bg-white/8 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-minion-yellow mb-1">
                  Workflow
                </p>
                <p className="text-sm font-bold leading-relaxed text-white break-keep whitespace-normal">
                  날짜 경기 저장 후 각 경기 결과를 등록하세요. 저장된 결과
                  수정에는 관리자 코드가 필요합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onAddRow}
                className="border-2 border-black bg-minion-yellow px-4 py-3 text-xs font-black inline-flex items-center justify-center gap-2 text-black min-h-[56px] w-full sm:w-auto sm:self-stretch xl:self-stretch xl:px-5 whitespace-nowrap"
              >
                <Plus size={14} />
                경기 추가
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 border-4 border-black bg-white px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-minion-blue">
                Day Summary
              </p>
              <p className="text-sm font-bold text-gray-700 mt-1 leading-relaxed break-keep whitespace-normal">
                팀 선택 후 날짜 경기를 먼저 저장하면 아래 로스터 패널과 결과
                등록 액션이 연결됩니다.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 text-[11px] font-black sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center xl:justify-end">
              <span className="border-2 border-black bg-[#fff4a8] px-3 py-1 whitespace-nowrap">
                MATCH ORDER AUTO
              </span>
              <span className="border-2 border-black bg-[#eef4ff] px-3 py-1 text-minion-blue whitespace-nowrap">
                RESULT LOCK ACTIVE
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {rows.map((row, index) =>
              (() => {
                const homeOptions = getSelectableTeams(
                  index,
                  row.awayTeamName,
                  row.awayTeamName,
                );
                const awayOptions = getSelectableTeams(
                  index,
                  row.homeTeamName,
                  row.homeTeamName,
                );
                const homeAuction = row.homeTeamName
                  ? (teamMap.get(row.homeTeamName)?.auctionName ?? null)
                  : null;
                const awayAuction = row.awayTeamName
                  ? (teamMap.get(row.awayTeamName)?.auctionName ?? null)
                  : null;

                return (
                  <div
                    key={row.id ?? `new-${index}`}
                    className="border-4 border-black bg-white shadow-[6px_6px_0px_rgba(0,0,0,1)] overflow-hidden"
                  >
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="p-4 lg:p-5 space-y-4 bg-[#fffdf8]">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="border-2 border-black bg-minion-yellow px-2 py-1 text-[10px] font-black shrink-0">
                              MATCH {index + 1}
                            </span>
                            <span className="text-xs font-bold text-gray-500 leading-none">
                              시간 순서대로 저장됩니다.
                            </span>
                          </div>
                          <span
                            className={`border-2 border-black px-2 py-1 text-[10px] font-black self-start ${
                              row.isCompleted
                                ? "bg-green-500 text-white"
                                : "bg-white text-gray-700"
                            }`}
                          >
                            {row.isCompleted ? "RESULT SAVED" : "EDITING"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[132px_minmax(0,1fr)] gap-4">
                          <label className="space-y-1 min-w-0">
                            <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                              경기 시간
                            </span>
                            <input
                              type="time"
                              value={row.startsAt}
                              onChange={(event) =>
                                onRowChange(index, {
                                  startsAt: event.target.value,
                                })
                              }
                              className="w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0"
                            />
                          </label>

                          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-3 lg:items-start">
                            <label className="space-y-1 min-w-0">
                              <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                                홈팀
                              </span>
                              <select
                                value={row.homeTeamName}
                                onChange={(event) => {
                                  const nextHomeTeamName = event.target.value;
                                  const nextHomeTeam =
                                    teamMap.get(nextHomeTeamName);
                                  const currentAwayTeam = teamMap.get(
                                    row.awayTeamName,
                                  );
                                  const shouldClearAway =
                                    nextHomeTeam &&
                                    currentAwayTeam &&
                                    nextHomeTeam.auctionKey !==
                                      currentAwayTeam.auctionKey;

                                  onRowChange(index, {
                                    homeTeamName: nextHomeTeamName,
                                    awayTeamName: shouldClearAway
                                      ? ""
                                      : row.awayTeamName,
                                  });
                                }}
                                className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0"
                              >
                                <option value="">홈팀 선택</option>
                                {homeOptions.map((team) => (
                                  <option
                                    key={`home-${index}-${team.name}`}
                                    value={team.name}
                                  >
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              {/* {homeAuction && (
                            <p className="text-[11px] font-bold text-gray-500">
                              같은 경매 상대만 선택 가능: {homeAuction}
                            </p>
                          )} */}
                            </label>

                            <div className="min-h-[50px] border-2 border-black bg-black flex items-center justify-center text-minion-yellow text-xs font-black mt-0 lg:mt-[20px]">
                              VS
                            </div>

                            <label className="space-y-1 min-w-0">
                              <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                                원정팀
                              </span>
                              <select
                                value={row.awayTeamName}
                                onChange={(event) => {
                                  const nextAwayTeamName = event.target.value;
                                  const nextAwayTeam =
                                    teamMap.get(nextAwayTeamName);
                                  const currentHomeTeam = teamMap.get(
                                    row.homeTeamName,
                                  );
                                  const shouldClearHome =
                                    nextAwayTeam &&
                                    currentHomeTeam &&
                                    nextAwayTeam.auctionKey !==
                                      currentHomeTeam.auctionKey;

                                  onRowChange(index, {
                                    awayTeamName: nextAwayTeamName,
                                    homeTeamName: shouldClearHome
                                      ? ""
                                      : row.homeTeamName,
                                  });
                                }}
                                className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0"
                              >
                                <option value="">원정팀 선택</option>
                                {awayOptions.map((team) => (
                                  <option
                                    key={`away-${index}-${team.name}`}
                                    value={team.name}
                                  >
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              {/* {awayAuction && (
                                <p className="text-[11px] font-bold text-gray-500">
                                  같은 경매 상대만 선택 가능: {awayAuction}
                                </p>
                              )} */}
                            </label>
                          </div>
                        </div>

                        <div className="border-2 border-black bg-white px-4 py-3">
                          <div className="flex items-start gap-2 text-sm font-black min-w-0">
                            <Swords
                              size={16}
                              className="text-minion-blue shrink-0 mt-0.5"
                            />
                            <span className="leading-relaxed break-words">
                              {row.homeTeamName || "홈팀"} vs{" "}
                              {row.awayTeamName || "원정팀"} ·{" "}
                              {getWinnerLabel(row)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_200px] gap-3">
                          <label className="space-y-1 min-w-0">
                            <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                              결과 메모
                            </span>
                            <textarea
                              value={row.note}
                              onChange={(event) =>
                                onRowChange(index, { note: event.target.value })
                              }
                              placeholder="결과 메모 또는 비고"
                              rows={3}
                              className="w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold resize-none min-w-0"
                            />
                          </label>
                          <label className="space-y-1 min-w-0">
                            <span className="block text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                              경기 결과
                            </span>
                            <select
                              value={row.winner}
                              onChange={(event) =>
                                onRowChange(index, {
                                  winner: event.target
                                    .value as LeagueMatchWinner,
                                })
                              }
                              className="w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0"
                            >
                              <option value="PENDING">결과 대기</option>
                              <option value="HOME">
                                {row.homeTeamName || "홈팀"} 승
                              </option>
                              <option value="AWAY">
                                {row.awayTeamName || "원정팀"} 승
                              </option>
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className="border-t-4 xl:border-t-0 xl:border-l-4 border-black bg-[linear-gradient(180deg,#eef4ff_0%,#ffffff_100%)] p-4 lg:p-5 flex flex-col gap-3">
                        <div className="border-2 border-black bg-white px-3 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-minion-blue">
                            Match Action
                          </p>
                          <p className="text-sm font-bold text-gray-700 mt-2 leading-relaxed">
                            결과 등록은 날짜 경기 저장 이후에 활성화됩니다.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onSaveResult(row)}
                          disabled={!row.id || isSubmittingResultId === row.id}
                          className="border-2 border-black bg-black text-minion-yellow px-4 py-3 text-xs font-black disabled:opacity-50 min-h-[52px]"
                        >
                          {isSubmittingResultId === row.id
                            ? "결과 저장 중..."
                            : row.isCompleted
                              ? "결과 수정/재저장"
                              : "결과 등록"}
                        </button>

                        <button
                          type="button"
                          onClick={() => onRemoveRow(index)}
                          className="border-2 border-black bg-white hover:bg-minion-red hover:text-white transition-colors px-4 py-3 text-xs font-black inline-flex items-center justify-center gap-2"
                          aria-label="경기 삭제"
                        >
                          <X size={16} />
                          경기 삭제
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })(),
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-t-4 border-black pt-5">
            <p className="text-xs font-bold text-gray-600">
              날짜 경기부터 저장한 뒤 각 경기 결과를 등록하세요. 저장된 결과는
              관리자 코드 없이 덮어쓸 수 없습니다.
            </p>
            <button
              type="button"
              onClick={onSaveDay}
              disabled={isSavingTimeline}
              className="pixel-button bg-minion-blue text-white px-6 py-3 text-sm font-heading inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {isSavingTimeline ? "날짜 저장 중..." : "날짜 경기 저장"}
            </button>
          </div>

          {timelineError && (
            <div className="border-4 border-black bg-red-100 px-4 py-3 text-sm font-black text-red-700">
              {timelineError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
