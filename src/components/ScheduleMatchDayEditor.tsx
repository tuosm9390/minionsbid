"use client";

import { useEffect, useState } from "react";
import { Lock, LockOpen, Plus, Save, Shield, Swords, X } from "@/components/ui/CyberIcons";
import type {
  LeagueMatchWinner,
  LeagueRosterTeam,
  LeagueSetWinner,
} from "@/features/schedules/types";
import {
  deriveLeagueMatchWinner,
  getLeagueMatchFormatLabel,
  normalizeLeagueMatchFormat,
  summarizeLeagueSetLogs,
} from "@/features/schedules/utils/leagueMatchRules";

export interface MatchEditorSetLog {
  winner: LeagueSetWinner;
  note: string;
}

export interface MatchEditorRow {
  id?: string;
  startsAt: string;
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: string;
  winsToClinch: number;
  maxGames: number;
  setLogs: MatchEditorSetLog[];
  homeScore: number;
  awayScore: number;
  winner: LeagueMatchWinner;
  note: string;
  isCompleted: boolean;
}

function BufferedTextInput({
  value,
  onCommit,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

function BufferedTextarea({
  value,
  onCommit,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      placeholder={placeholder}
      rows={rows}
      className={className}
    />
  );
}

function getWinnerLabel(row: MatchEditorRow) {
  const scoreFromLogs = summarizeLeagueSetLogs(
    row.setLogs.map((setLog, index) => ({
      setNumber: index + 1,
      winner: setLog.winner,
      note: setLog.note,
    })),
  );
  const homeScore =
    row.setLogs.length > 0 ? scoreFromLogs.homeScore : row.homeScore;
  const awayScore =
    row.setLogs.length > 0 ? scoreFromLogs.awayScore : row.awayScore;
  const winner = deriveLeagueMatchWinner({
    homeScore,
    awayScore,
    format: {
      winsToClinch: row.winsToClinch,
      maxGames: row.maxGames,
    },
  });

  if (winner === "HOME" || winner === "AWAY") {
    return `${row.homeTeamName || "홈팀"} ${homeScore}:${awayScore} ${row.awayTeamName || "원정팀"}`;
  }

  return "결과 대기";
}

export function ScheduleMatchDayEditor({
  selectedDateLabel,
  rows,
  rosterTeams,
  adminCode,
  isAdminVerified = false,
  isVerifyingAdmin = false,
  timelineError,
  isSavingTimeline,
  isSubmittingResultId,
  isScheduleCompleted = false,
  onAdminCodeChange,
  onVerifyAdminCode,
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
  isAdminVerified?: boolean;
  isVerifyingAdmin?: boolean;
  timelineError: string;
  isSavingTimeline: boolean;
  isSubmittingResultId: string | null;
  isScheduleCompleted?: boolean;
  onAdminCodeChange: (value: string) => void;
  onVerifyAdminCode: () => void;
  onRowChange: (index: number, patch: Partial<MatchEditorRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onSaveDay: () => void;
  onSaveResult: (row: MatchEditorRow) => void;
}) {
  const isEditLocked = isScheduleCompleted && !isAdminVerified;
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
      {isScheduleCompleted && (
        <div
          className={`border-4 border-black p-4 shadow-[8px_8px_0px_rgba(0,0,0,1)] space-y-3 ${
            isAdminVerified
              ? "bg-green-50"
              : "bg-red-50"
          }`}
        >
          <div className="flex items-start gap-3">
            {isAdminVerified ? (
              <LockOpen size={18} className="text-green-700 mt-1 shrink-0" />
            ) : (
              <Lock size={18} className="text-minion-red mt-1 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
                Completed Schedule
              </p>
              <p className="text-fluid-sm font-black text-black">
                {isAdminVerified
                  ? "완료된 일정이 관리자 검증으로 해제되었습니다."
                  : "완료된 일정입니다. 결과와 경기 편집은 잠겨 있습니다."}
              </p>
              <p className="text-fluid-xs font-bold text-gray-700">
                {isAdminVerified
                  ? "지금은 수정 가능하지만, 변경 내용은 즉시 운영 기록에 영향을 줍니다."
                  : "관리자 코드 검증 전에는 경기 추가, 결과 수정, 일정 저장이 모두 비활성화됩니다."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-4 border-black p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] space-y-3">
        <div className="flex items-center gap-3">
          <Shield size={16} className="text-minion-blue" />
          <div>
            <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
              Admin Control
            </p>
            <p className="text-fluid-sm font-black">일정 관리 관리자 코드</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="password"
            data-testid="schedule-editor-admin-code"
            value={adminCode}
            onChange={(event) => onAdminCodeChange(event.target.value)}
            placeholder="일정 저장, 결과 등록, 종료, 삭제에 필요"
            className="w-full border-2 border-black px-4 py-3 bg-white text-fluid-sm font-bold"
          />
          <button
            type="button"
            data-testid="schedule-editor-admin-verify"
            onClick={onVerifyAdminCode}
            disabled={isVerifyingAdmin || !adminCode.trim()}
            className="border-2 border-black bg-black px-4 py-3 text-fluid-xs font-black text-minion-yellow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifyingAdmin ? "확인 중..." : "코드 확인"}
          </button>
        </div>
        {isScheduleCompleted && (
          <div
            className={`border-2 px-4 py-3 text-fluid-sm font-black flex items-center gap-2 ${
              isAdminVerified
                ? "border-green-600 bg-green-50 text-green-700"
                : adminCode.trim() && !isAdminVerified
                  ? "border-orange-500 bg-orange-50 text-orange-700"
                  : "border-minion-red bg-red-50 text-minion-red"
            }`}
          >
            {isAdminVerified ? (
              <LockOpen size={16} className="shrink-0" />
            ) : (
              <Lock size={16} className="shrink-0" />
            )}
            {isAdminVerified
              ? "관리자 코드 확인됨. 완료 일정 편집이 열렸습니다."
              : adminCode.trim()
                ? "관리자 코드가 일치하지 않습니다."
                : "일정이 종료되었습니다. 관리자 코드를 입력하면 수정할 수 있습니다."}
          </div>
        )}
        {!isScheduleCompleted && (
          <p className="text-fluid-xs font-bold text-gray-600">
            공개 일정 화면이지만 실제 저장, 결과 등록, 종료, 삭제는 모두 관리자 코드가 필요합니다.
          </p>
        )}
      </div>

      <div className="border-4 border-black bg-[linear-gradient(180deg,#fffef8_0%,#fff7cf_100%)] shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="border-b-4 border-black bg-black px-4 py-4 text-white sm:px-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px_auto] xl:items-start">
            <div className="space-y-3">
              <div>
                <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-yellow">
                  Selected Day
                </p>
                <h3 className="text-fluid-lg font-black mt-1 break-keep whitespace-normal">
                  {selectedDateLabel}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
                <span className="border-2 border-white bg-minion-yellow px-3 py-1 text-fluid-xs font-black text-black">
                  TOTAL {rows.length}
                </span>
                <span className="border-2 border-white bg-[#143e7a] px-3 py-1 text-fluid-xs font-black">
                  PENDING {pendingCount}
                </span>
                <span className="border-2 border-white bg-green-600 px-3 py-1 text-fluid-xs font-black">
                  SAVED {completedCount}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 w-full self-stretch sm:grid-cols-[minmax(0,1fr)_auto] xl:contents">
              <div className="border-2 border-white/80 bg-white/8 px-4 py-3">
                <p className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-yellow mb-1">
                  Workflow
                </p>
                <p className="text-fluid-sm font-bold leading-relaxed text-white break-keep whitespace-normal">
                  날짜 경기 저장, 결과 등록, 일정 종료까지 모두 관리자 코드로
                  보호됩니다. 완료 일정은 검증 전까지 편집이 잠깁니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onAddRow}
                disabled={isEditLocked}
                className="border-2 border-black bg-minion-yellow px-4 py-3 text-xs font-black inline-flex items-center justify-center gap-2 text-black min-h-[56px] w-full sm:w-auto sm:self-stretch xl:self-stretch xl:px-5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                경기 추가
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 border-4 border-black bg-white px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div>
            <p className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-blue">
              Day Summary
            </p>
            <p className="text-fluid-sm font-bold text-gray-700 mt-1 leading-relaxed break-keep whitespace-normal">
              팀 선택 후 날짜 경기를 먼저 저장하면 아래 로스터 패널과 결과 등록
              액션이 연결됩니다.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-fluid-xs font-black sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center xl:justify-end">
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
              const format = normalizeLeagueMatchFormat({
                winsToClinch: row.winsToClinch,
                maxGames: row.maxGames,
              });
              const scoreFromLogs = summarizeLeagueSetLogs(
                row.setLogs.map((setLog, setIndex) => ({
                  setNumber: setIndex + 1,
                  winner: setLog.winner,
                  note: setLog.note,
                })),
              );
              const displayHomeScore =
                row.setLogs.length > 0
                  ? scoreFromLogs.homeScore
                  : row.homeScore;
              const displayAwayScore =
                row.setLogs.length > 0
                  ? scoreFromLogs.awayScore
                  : row.awayScore;

              return (
                <div
                  key={row.id ?? `new-${index}`}
                  className="border-4 border-black bg-white shadow-[6px_6px_0px_rgba(0,0,0,1)] overflow-hidden"
                >
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="p-4 lg:p-5 space-y-4 bg-[#fffdf8]">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="border-2 border-black bg-minion-yellow px-2 py-1 text-fluid-xs font-black shrink-0">
                            MATCH {index + 1}
                          </span>
                          <span className="text-xs font-bold text-gray-500 leading-none">
                            시간 순서대로 저장됩니다.
                          </span>
                        </div>
                        <span
                          className={`border-2 border-black px-2 py-1 text-fluid-xs font-black self-start ${
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
                          <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                            경기 시간
                          </span>
                          <input
                            type="time"
                            step={60}
                            value={row.startsAt}
                            onChange={(event) =>
                              onRowChange(index, {
                                startsAt: event.target.value,
                              })
                            }
                            disabled={isEditLocked}
                            className="w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </label>

                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-3 lg:items-start">
                          <label className="space-y-1 min-w-0">
                            <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                              홈팀
                            </span>
                            <select
                              data-testid={`schedule-row-home-${index}`}
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
                              disabled={isEditLocked}
                              className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          </label>

                          <div className="min-h-[50px] border-2 border-black bg-black flex items-center justify-center text-minion-yellow text-xs font-black mt-0 lg:mt-[20px]">
                            VS
                          </div>

                          <label className="space-y-1 min-w-0">
                            <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                              원정팀
                            </span>
                            <select
                              data-testid={`schedule-row-away-${index}`}
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
                              disabled={isEditLocked}
                              className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 border-2 border-black bg-[#eef4ff] px-4 py-4">
                        <div>
                          <p className="text-fluid-xs font-black uppercase tracking-[0.12em] text-minion-blue">
                            경기 방식
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[
                              { label: "단판", winsToClinch: 1, maxGames: 1 },
                              {
                                label: "3판 2선",
                                winsToClinch: 2,
                                maxGames: 3,
                              },
                              {
                                label: "5판 3선",
                                winsToClinch: 3,
                                maxGames: 5,
                              },
                            ].map((preset) => {
                              const isActive =
                                row.winsToClinch === preset.winsToClinch &&
                                row.maxGames === preset.maxGames;

                              return (
                                <button
                                  key={`${row.id ?? index}-${preset.label}`}
                                  type="button"
                                  onClick={() =>
                                    onRowChange(index, {
                                      winsToClinch: preset.winsToClinch,
                                      maxGames: preset.maxGames,
                                    })
                                  }
                                  disabled={isEditLocked}
                                  className={`border-2 border-black px-3 py-2 text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? "bg-minion-yellow text-black" : "bg-white text-gray-700"}`}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-xs font-bold text-gray-600">
                            현재 설정: {getLeagueMatchFormatLabel(format)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 border-2 border-black bg-white px-4 py-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="space-y-2">
                          <p className="text-fluid-xs font-black uppercase tracking-[0.12em] text-minion-blue">
                            경기 단계
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              "조별리그",
                              "플레이오프",
                              "8강",
                              "4강",
                              "결승",
                            ].map((stagePreset) => (
                              <button
                                key={`${row.id ?? index}-${stagePreset}`}
                                type="button"
                                onClick={() =>
                                  onRowChange(index, {
                                    stageLabel: stagePreset,
                                  })
                                }
                                disabled={isEditLocked}
                                className={`border-2 border-black px-3 py-2 text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed ${row.stageLabel === stagePreset ? "bg-minion-yellow text-black" : "bg-[#fffdf8] text-gray-700"}`}
                              >
                                {stagePreset}
                              </button>
                            ))}
                          </div>
                        </div>

                        <label className="space-y-1 min-w-0">
                          <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                            커스텀 라벨
                          </span>
                          <input
                            type="text"
                            value={row.stageLabel}
                            onChange={(event) =>
                              onRowChange(index, {
                                stageLabel: event.target.value,
                              })
                            }
                            disabled={isEditLocked}
                            placeholder="예: 승자조 결승"
                            className="w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </label>
                      </div>

                      <div className="border-2 border-black bg-white px-4 py-3">
                        <div className="flex items-start gap-2 text-sm font-black min-w-0">
                          <Swords
                            size={16}
                            className="text-minion-blue shrink-0 mt-0.5"
                          />
                          <span className="leading-relaxed break-words">
                            {row.stageLabel ? `[${row.stageLabel}] ` : ""}
                            {row.homeTeamName || "홈팀"} vs{" "}
                            {row.awayTeamName || "원정팀"} ·{" "}
                            {getLeagueMatchFormatLabel(format)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 min-w-0">
                        <div>
                          <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                            세트 스코어
                          </span>
                          <div className="grid grid-cols-[minmax(0,1fr)_50px_minmax(0,1fr)] gap-2 mt-2 items-end">
                            <label className="space-y-1 min-w-0">
                              <span className="block text-fluid-xs font-black text-gray-500 text-center">
                                {row.homeTeamName || "홈팀"}
                              </span>
                              <input
                                type="number"
                                data-testid={`schedule-row-home-score-${index}`}
                                min={0}
                                max={row.maxGames}
                                value={displayHomeScore}
                                onChange={(event) =>
                                  onRowChange(index, {
                                    setLogs: [],
                                    homeScore: Math.min(
                                      row.maxGames,
                                      Math.max(
                                        0,
                                        Number(event.target.value) || 0,
                                      ),
                                    ),
                                  })
                                }
                                disabled={isEditLocked}
                                className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold text-center min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </label>

                            <div className="min-h-[50px] border-2 border-black bg-black flex items-center justify-center text-minion-yellow text-xs font-black">
                              :
                            </div>

                            <label className="space-y-1 min-w-0">
                              <span className="block text-fluid-xs font-black text-gray-500 text-center">
                                {row.awayTeamName || "원정팀"}
                              </span>
                              <input
                                type="number"
                                data-testid={`schedule-row-away-score-${index}`}
                                min={0}
                                max={row.maxGames}
                                value={displayAwayScore}
                                onChange={(event) =>
                                  onRowChange(index, {
                                    setLogs: [],
                                    awayScore: Math.min(
                                      row.maxGames,
                                      Math.max(
                                        0,
                                        Number(event.target.value) || 0,
                                      ),
                                    ),
                                  })
                                }
                                disabled={isEditLocked}
                                className="w-full min-h-[50px] border-2 border-black px-3 py-3 bg-white text-sm font-bold text-center min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="border-2 border-black bg-[#fffdf8] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-fluid-xs font-black uppercase tracking-[0.12em] text-minion-blue">
                                세트 로그
                              </p>
                              <p className="text-xs font-bold text-gray-600 mt-1">
                                세트별 승자와 메모를 남기면 스코어가 자동으로
                                반영됩니다.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onRowChange(index, {
                                  setLogs: [
                                    ...row.setLogs,
                                    {
                                      winner: "HOME" as LeagueSetWinner,
                                      note: "",
                                    },
                                  ].slice(0, row.maxGames),
                                })
                              }
                              disabled={
                                isEditLocked ||
                                row.setLogs.length >= row.maxGames
                              }
                              className="border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black disabled:opacity-50"
                            >
                              세트 추가
                            </button>
                          </div>

                          <div className="mt-3 space-y-2">
                            {row.setLogs.length === 0 && (
                              <p className="text-xs font-bold text-gray-500">
                                빠른 입력만 쓰려면 위 스코어를 직접 입력하고,
                                상세 로그가 필요하면 세트를 추가하세요.
                              </p>
                            )}
                            {row.setLogs.map((setLog, setIndex) => (
                              <div
                                key={`${row.id ?? index}-set-${setIndex}`}
                                className="border-2 border-black bg-white px-3 py-3"
                              >
                                <div className="text-xs font-black text-gray-700">
                                  SET {setIndex + 1}
                                </div>
                                <div className="mt-2 space-y-2">
                                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2 items-center">
                                    <select
                                      value={setLog.winner}
                                      onChange={(event) =>
                                        onRowChange(index, {
                                          setLogs: row.setLogs.map(
                                            (currentLog, currentIndex) =>
                                              currentIndex === setIndex
                                                ? {
                                                    ...currentLog,
                                                    winner: event.target
                                                      .value as LeagueSetWinner,
                                                  }
                                                : currentLog,
                                          ),
                                        })
                                      }
                                      disabled={isEditLocked}
                                      className="w-full min-w-0 border-2 border-black px-3 py-2 bg-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="HOME">
                                        {row.homeTeamName || "홈팀"} 승
                                      </option>
                                      <option value="AWAY">
                                        {row.awayTeamName || "원정팀"} 승
                                      </option>
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onRowChange(index, {
                                          setLogs: row.setLogs.filter(
                                            (_, currentIndex) =>
                                              currentIndex !== setIndex,
                                          ),
                                        })
                                      }
                                      disabled={isEditLocked}
                                      className="border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black hover:bg-minion-red hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                  <BufferedTextInput
                                    value={setLog.note}
                                    onCommit={(nextValue) =>
                                      onRowChange(index, {
                                        setLogs: row.setLogs.map(
                                          (currentLog, currentIndex) =>
                                            currentIndex === setIndex
                                              ? {
                                                  ...currentLog,
                                                  note: nextValue,
                                                }
                                              : currentLog,
                                        ),
                                      })
                                    }
                                    placeholder="예: 바론 한타 승리"
                                    className="w-full border-2 border-black px-3 py-2 bg-white text-sm font-bold min-w-0"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="border-2 border-black bg-white px-3 py-3 text-sm font-black">
                          {getWinnerLabel(row)}
                        </div>

                        <label className="space-y-1 min-w-0">
                          <span className="block text-fluid-xs font-black uppercase tracking-[0.12em] text-gray-500">
                            결과 메모
                          </span>
                          <BufferedTextarea
                            value={row.note}
                            onCommit={(nextValue) =>
                              onRowChange(index, { note: nextValue })
                            }
                            placeholder="결과 메모 또는 비고"
                            rows={3}
                            className={`w-full border-2 border-black px-3 py-3 bg-white text-sm font-bold resize-none min-w-0 ${
                              isEditLocked
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="border-t-4 xl:border-t-0 xl:border-l-4 border-black bg-[linear-gradient(180deg,#eef4ff_0%,#ffffff_100%)] p-4 lg:p-5 flex flex-col gap-3">
                      <div className="border-2 border-black bg-white px-3 py-3">
                        <p className="text-fluid-xs font-black uppercase tracking-[0.14em] text-minion-blue">
                          Match Action
                        </p>
                        <p className="text-fluid-sm font-bold text-gray-700 mt-2 leading-relaxed">
                          결과 등록은 날짜 경기 저장 이후에 활성화됩니다. 최종
                          스코어는 경기 방식과 일치해야 합니다.
                        </p>
                      </div>

                      <button
                        type="button"
                        data-testid={`schedule-row-save-result-${index}`}
                        onClick={() => onSaveResult(row)}
                        disabled={
                          !row.id ||
                          isSubmittingResultId === row.id ||
                          isEditLocked
                        }
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
                        disabled={isEditLocked}
                        className="border-2 border-black bg-white hover:bg-minion-red hover:text-white transition-colors px-4 py-3 text-xs font-black inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-fluid-xs font-bold text-gray-600">
            공개 일정 화면이지만 실제 저장과 결과 등록은 모두 관리자 코드가
            필요합니다.
          </p>
          <button
            type="button"
            data-testid="schedule-save-day"
            onClick={onSaveDay}
            disabled={isSavingTimeline || isEditLocked}
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
  );
}
