"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Clock3, Flag, Trash2, X } from "lucide-react";
import {
  completeLeagueSchedule,
  createLeagueSchedule,
  deleteLeagueSchedule,
  getLeagueScheduleCatalog,
  getLeagueScheduleTimeline,
  registerLeagueMatchResult,
  saveLeagueScheduleDay,
  verifyScheduleAdminCode,
} from "@/features/schedules/api/scheduleActions";
import type {
  LeagueMatchWinner,
  LeagueRosterTeam,
  LeagueScheduleDay,
  LeagueScheduleTimeline,
} from "@/features/schedules/types";
import {
  DEFAULT_LEAGUE_MATCH_FORMAT,
  deriveLeagueMatchWinner,
  getLeagueMatchFormatLabel,
  isCompletedLeagueMatch,
  summarizeLeagueSetLogs,
} from "@/features/schedules/utils/leagueMatchRules";
import { buildNextMatchesPreview } from "@/features/schedules/utils/leagueNextMatches";
import { ScheduleCalendar, formatDateKey } from "@/components/ScheduleCalendar";
import {
  ScheduleMatchDayEditor,
  type MatchEditorRow,
} from "@/components/ScheduleMatchDayEditor";
import { ScheduleRosterPanel } from "@/components/ScheduleRosterPanel";
import { LeagueRecordSummaryPanel } from "@/components/LeagueRecordSummaryPanel";

function startOfSelectedDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function formatScheduleDate(startIso: string, endIso: string | null) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const startText = start.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return startText;
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${startText} - ${end.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `${startText} - ${end.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function formatTimelineDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function isScheduleInProgress(startIso: string, endIso: string | null) {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Number.POSITIVE_INFINITY;

  if (!Number.isFinite(start)) return false;
  return now >= start && now <= end;
}

function getWinnerLabel(match: {
  winner: LeagueMatchWinner;
  homeTeamName: string;
  awayTeamName: string;
  stageLabel: string;
  homeScore: number;
  awayScore: number;
  format: {
    winsToClinch: number;
    maxGames: number;
  };
}) {
  const prefix = match.stageLabel ? `[${match.stageLabel}] ` : "";
  if (match.winner === "HOME" || match.winner === "AWAY") {
    return `${prefix}${match.homeTeamName} ${match.homeScore}:${match.awayScore} ${match.awayTeamName}`;
  }
  return `${prefix}${getLeagueMatchFormatLabel(match.format)}`;
}

function createEmptyMatchRow(): MatchEditorRow {
  return {
    startsAt: "21:30",
    homeTeamName: "",
    awayTeamName: "",
    stageLabel: "",
    winsToClinch: DEFAULT_LEAGUE_MATCH_FORMAT.winsToClinch,
    maxGames: DEFAULT_LEAGUE_MATCH_FORMAT.maxGames,
    setLogs: [],
    homeScore: 0,
    awayScore: 0,
    winner: "PENDING",
    note: "",
    isCompleted: false,
  };
}

function buildEditorRows(day: LeagueScheduleDay | null): MatchEditorRow[] {
  if (!day || day.matches.length === 0) {
    return [createEmptyMatchRow()];
  }
  return day.matches.map((match) => ({
    id: match.id,
    startsAt: match.startsAt,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    stageLabel: match.stageLabel,
    winsToClinch: match.format.winsToClinch,
    maxGames: match.format.maxGames,
    setLogs: match.setLogs.map((setLog) => ({
      winner: setLog.winner,
      note: setLog.note,
    })),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    winner: match.winner,
    note: match.note,
    isCompleted: match.isCompleted,
  }));
}

function ActionModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[230] bg-black/80 p-4 flex items-center justify-center"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[#fffdf6] border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-black bg-black text-white">
          <h3 className="text-lg font-heading">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="bg-minion-red text-black border-2 border-black p-1"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function LeagueScheduleManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingTimeline, setIsSavingTimeline] = useState(false);
  const [isSubmittingResultId, setIsSubmittingResultId] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [timelineError, setTimelineError] = useState("");
  const [leagueOptions, setLeagueOptions] = useState<
    Array<{ id: string; name: string; closedAt: string | null }>
  >([]);
  const [schedules, setSchedules] = useState<
    LeagueScheduleTimeline["schedule"][]
  >([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [timeline, setTimeline] = useState<LeagueScheduleTimeline | null>(null);
  const [selectedLinkedAuctionId, setSelectedLinkedAuctionId] = useState("");
  const [customName, setCustomName] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    formatDateKey(new Date()),
  );
  const [matchRows, setMatchRows] = useState<MatchEditorRow[]>(
    buildEditorRows(null),
  );
  const [adminCode, setAdminCode] = useState("");
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [isCompletingSchedule, setIsCompletingSchedule] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedChampionName, setSelectedChampionName] = useState("");

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const catalog = await getLeagueScheduleCatalog();
      setLeagueOptions(catalog.leagueOptions);
      setSchedules(catalog.schedules);
      setSelectedScheduleId((prev) => prev || catalog.schedules[0]?.id || "");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTimeline = useCallback(async (scheduleId: string) => {
    if (!scheduleId) {
      setTimeline(null);
      return;
    }
    setIsLoadingTimeline(true);
    try {
      const next = await getLeagueScheduleTimeline(scheduleId);
      setTimeline(next);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (selectedScheduleId) void loadTimeline(selectedScheduleId);
  }, [loadTimeline, selectedScheduleId]);

  useEffect(() => {
    const schedule = timeline?.schedule;
    if (!schedule) return;
    setSelectedDateKey(
      (prev) => prev || formatDateKey(new Date(schedule.startsAt)),
    );
  }, [timeline?.schedule?.id, timeline?.schedule?.startsAt]);

  const selectedDay = useMemo(
    () => timeline?.days.find((day) => day.dateKey === selectedDateKey) ?? null,
    [selectedDateKey, timeline],
  );

  useEffect(() => {
    setMatchRows(buildEditorRows(selectedDay));
  }, [selectedDay]);

  useEffect(() => {
    setSelectedChampionName(timeline?.schedule?.championTeamName ?? "");
  }, [timeline?.schedule?.championTeamName, selectedScheduleId]);

  const daySummaries = useMemo(() => {
    const map = new Map<
      string,
      { total: number; completed: number; labels?: string[] }
    >();
    timeline?.days.forEach((day) => {
      map.set(day.dateKey, {
        total: day.matches.length,
        completed: day.matches.filter((match) => match.isCompleted).length,
        labels: day.matches
          .slice(0, 2)
          .map((match) => `${match.homeTeamName} vs ${match.awayTeamName}`),
      });
    });
    return map;
  }, [timeline]);

  const handleAdminCodeChange = useCallback((value: string) => {
    setAdminCode(value);
    setIsAdminVerified(false);
  }, []);

  const handleVerifyAdminCode = useCallback(async () => {
    if (!adminCode.trim()) {
      setIsAdminVerified(false);
      return;
    }

    setIsVerifyingAdmin(true);
    try {
      const result = await verifyScheduleAdminCode(adminCode.trim());
      setIsAdminVerified(result.valid);
    } finally {
      setIsVerifyingAdmin(false);
    }
  }, [adminCode]);

  const selectedRosterMatches = useMemo(() => {
    const rosterMap = new Map<string, LeagueRosterTeam>();
    timeline?.rosterTeams.forEach((team) => rosterMap.set(team.name, team));

    return matchRows
      .filter((row) => row.homeTeamName.trim() || row.awayTeamName.trim())
      .map((row, index) => ({
        id: row.id ?? `match-${selectedDateKey}-${index}`,
        homeTeam: rosterMap.get(row.homeTeamName.trim()) ?? null,
        awayTeam: rosterMap.get(row.awayTeamName.trim()) ?? null,
        winner: deriveLeagueMatchWinner({
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          format: {
            winsToClinch: row.winsToClinch,
            maxGames: row.maxGames,
          },
        }),
        homeScore: row.homeScore,
        awayScore: row.awayScore,
      }));
  }, [matchRows, selectedDateKey, timeline]);

  const nextMatchesPreview = useMemo(() => {
    if (!timeline) return [];

    const previewMatchRows = matchRows
      .filter((row) => row.homeTeamName.trim() && row.awayTeamName.trim())
      .map((row, index) => {
        const format = {
          winsToClinch: row.winsToClinch,
          maxGames: row.maxGames,
        };
        const winner = deriveLeagueMatchWinner({
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          format,
        });

        return {
          id: row.id ?? `preview-${selectedDateKey}-${index}`,
          startsAt: row.startsAt.trim(),
          homeTeamName: row.homeTeamName.trim(),
          awayTeamName: row.awayTeamName.trim(),
          stageLabel: row.stageLabel.trim(),
          format,
          setLogs: row.setLogs.map((setLog, setIndex) => ({
            setNumber: setIndex + 1,
            winner: setLog.winner,
            note: setLog.note,
          })),
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          winner,
          isCompleted: isCompletedLeagueMatch({
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            format,
          }),
          note: row.note,
          createdAt: null,
          updatedAt: null,
        };
      });

    return buildNextMatchesPreview({
      days: timeline.days,
      selectedDateKey,
      previewMatches: previewMatchRows,
    });
  }, [matchRows, selectedDateKey, timeline]);

  const handleCreate = async () => {
    const linkedAuction =
      leagueOptions.find((option) => option.id === selectedLinkedAuctionId) ??
      null;
    const linkedLeagueName = linkedAuction?.name ?? null;
    const name = customName.trim() || linkedLeagueName?.trim() || "";
    if (!name) {
      setError("기존 리그를 선택하거나 새 일정 이름을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const result = await createLeagueSchedule(
        {
          name,
          linkedAuctionId: linkedAuction?.id ?? null,
          linkedLeagueName,
          rosterSourceType: linkedAuction ? "archive" : null,
          rosterSourceId: linkedAuction?.id ?? null,
          startsAt: startOfSelectedDay(startDate).toISOString(),
          endsAt: startOfSelectedDay(endDate).toISOString(),
          notes,
        },
        adminCode.trim() || undefined,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      await loadCatalog();
      if (result.schedule?.id) setSelectedScheduleId(result.schedule.id);
      setIsOpen(false);
      setSelectedLinkedAuctionId("");
      setCustomName("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDay = async () => {
    if (!selectedScheduleId) return;
    setIsSavingTimeline(true);
    setTimelineError("");
    try {
      const result = await saveLeagueScheduleDay(
        selectedScheduleId,
        {
          dateKey: selectedDateKey,
          matches: matchRows.map((row) => ({
            id: row.id,
            startsAt: row.startsAt,
            homeTeamName: row.homeTeamName,
            awayTeamName: row.awayTeamName,
            stageLabel: row.stageLabel,
            winsToClinch: row.winsToClinch,
            maxGames: row.maxGames,
          })),
        },
        adminCode.trim() || undefined,
      );
      if (result.error) {
        setTimelineError(result.error);
        return;
      }
      await loadTimeline(selectedScheduleId);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsSavingTimeline(false);
    }
  };

  const handleSaveResult = async (row: MatchEditorRow) => {
    if (!selectedScheduleId || !row.id) {
      setTimelineError("먼저 날짜 경기를 저장한 뒤 결과를 등록해주세요.");
      return;
    }
    setIsSubmittingResultId(row.id);
    setTimelineError("");
    try {
      const result = await registerLeagueMatchResult({
        scheduleId: selectedScheduleId,
        dateKey: selectedDateKey,
        matchId: row.id,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        setLogs: row.setLogs.map((setLog) => ({
          winner: setLog.winner,
          note: setLog.note,
        })),
        note: row.note,
        adminCode: adminCode.trim() || undefined,
      });
      if (result.error) {
        setTimelineError(result.error);
        return;
      }
      await loadTimeline(selectedScheduleId);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsSubmittingResultId(null);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!selectedScheduleId) return;
    setIsDeletingSchedule(true);
    setTimelineError("");
    try {
      const result = await deleteLeagueSchedule(
        selectedScheduleId,
        adminCode.trim() || undefined,
      );
      if (result.error) {
        setTimelineError(result.error);
        return;
      }
      setIsDeleteModalOpen(false);
      setSelectedScheduleId("");
      setTimeline(null);
      await loadCatalog();
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const handleCompleteSchedule = async () => {
    if (!selectedScheduleId) return;
    setIsCompletingSchedule(true);
    setTimelineError("");
    try {
      const result = await completeLeagueSchedule({
        scheduleId: selectedScheduleId,
        championTeamName: selectedChampionName,
        adminCode: adminCode.trim() || undefined,
      });
      if (result.error) {
        setTimelineError(result.error);
        return;
      }

      setIsCompleteModalOpen(false);
      await Promise.all([loadCatalog(), loadTimeline(selectedScheduleId)]);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setIsCompletingSchedule(false);
    }
  };

  return (
    <>
      <div className="w-full space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-fluid-sm font-black uppercase tracking-[0.24em] text-minion-blue">
              League Schedule
            </p>
            <h2 className="text-fluid-xl font-heading">
              리그전 일정 타임라인
            </h2>
            <p className="text-fluid-sm font-bold text-gray-600 mt-2">
              날짜별 경기 시간, 참가 팀, 결과를 기록하고 클릭한 날짜 아래에서 팀
              로스터를 바로 확인할 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => setIsOpen(true)}
            data-testid="schedule-create-open"
            className="pixel-button w-full lg:w-auto bg-minion-blue text-white py-4 px-8 text-lg font-heading shadow-[8px_8px_0px_rgba(0,0,0,1)] inline-flex items-center justify-center gap-3"
          >
            <CalendarDays size={20} />
            리그전 일정 생성
          </button>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
          <div className="bg-white border-4 border-black p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
                  Schedule List
                </p>
                <p className="text-fluid-lg font-black">리그전 일정</p>
              </div>
              <button
                type="button"
                onClick={loadCatalog}
                className="border-2 border-black px-3 py-2 text-xs font-black bg-minion-yellow"
              >
                새로고침
              </button>
            </div>
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {isLoading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="border-4 border-black p-4 bg-gray-100 animate-pulse"
                    >
                      <div className="h-5 bg-gray-300 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              )}
              {!isLoading && schedules.length === 0 && (
                <div className="border-2 border-dashed border-black p-6 text-center text-sm font-black">
                  등록된 일정이 없습니다.
                </div>
              )}
              {!isLoading && schedules.map((schedule) =>
                schedule ? (
                  <button
                    key={schedule.id}
                    data-testid={`schedule-card-${schedule.id}`}
                    type="button"
                    onClick={() => setSelectedScheduleId(schedule.id)}
                    className={`w-full text-left border-4 p-4 ${selectedScheduleId === schedule.id ? "border-minion-blue bg-minion-blue text-white" : "border-black bg-[#fffdf8]"}`}
                  >
                    <p className="text-fluid-lg font-black">{schedule.name}</p>
                    <p
                      className={`text-fluid-xs font-bold mt-2 ${selectedScheduleId === schedule.id ? "text-blue-100" : "text-gray-500"}`}
                    >
                      {formatScheduleDate(schedule.startsAt, schedule.endsAt)}
                    </p>
                    <p
                      className={`text-fluid-xs font-bold mt-2 ${selectedScheduleId === schedule.id ? "text-blue-100" : "text-gray-600"}`}
                    >
                      {schedule.linkedLeagueName
                        ? `연결 경매: ${schedule.linkedLeagueName}`
                        : "커스텀 일정"}
                    </p>
                  </button>
                ) : null,
              )}
            </div>
          </div>

          <div className="space-y-5">
            {timeline?.schedule ? (
              <>
                {isLoadingTimeline && (
                  <div className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex items-center gap-4 animate-pulse">
                    <div className="border-4 border-black border-t-minion-yellow w-8 h-8 rounded-full animate-spin shrink-0" />
                    <div>
                      <p className="text-fluid-sm font-black tracking-widest uppercase text-gray-500">타임라인 불러오는 중...</p>
                      <p className="text-fluid-xs font-bold text-gray-400 mt-1">잠시만 기다려주세요.</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-[linear-gradient(180deg,#fffef8_0%,#fff5c5_100%)] border-4 border-black p-5 shadow-[10px_10px_0px_rgba(0,0,0,1)] lg:col-span-2">
                    <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
                      Current Schedule
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <h3 className="text-fluid-lg font-black">
                        {timeline.schedule.name}
                      </h3>
                      {(timeline.schedule.status === "COMPLETED" ||
                        isScheduleInProgress(
                          timeline.schedule.startsAt,
                          timeline.schedule.endsAt,
                        )) && (
                        <span
                          className={`border-2 border-black px-3 py-1 text-fluid-xs font-black ${timeline.schedule.status === "COMPLETED" ? "bg-green-600 text-white" : "bg-minion-yellow text-black"}`}
                        >
                          {timeline.schedule.status === "COMPLETED"
                            ? "종료됨"
                            : "진행중"}
                        </span>
                      )}
                    </div>
                    <p className="text-fluid-sm font-bold text-gray-700 mt-2">
                      {formatScheduleDate(
                        timeline.schedule.startsAt,
                        timeline.schedule.endsAt,
                      )}
                    </p>
                    {timeline.schedule.status === "COMPLETED" && !isAdminVerified && (
                      <div className="mt-4 border-4 border-black bg-red-50 px-4 py-3">
                        <p className="text-fluid-xs font-black uppercase tracking-[0.16em] text-minion-red">
                          Read-Only Mode
                        </p>
                        <p className="mt-1 text-fluid-sm font-bold text-gray-800">
                          완료된 일정입니다. 관리자 코드 검증 전에는 결과 수정과 일정 편집이 잠겨 있습니다.
                        </p>
                      </div>
                    )}
                    {timeline.schedule.championTeamName && (
                      <p className="mt-3 text-fluid-sm font-black text-green-700">
                        최종 우승팀: {timeline.schedule.championTeamName}
                      </p>
                    )}
                    {timeline.schedule.notes && (
                      <p className="mt-4 border-2 border-black bg-[#fffdf6] px-4 py-3 text-fluid-sm font-bold text-gray-700">
                        {timeline.schedule.notes}
                      </p>
                    )}
                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => setIsCompleteModalOpen(true)}
                        data-testid="schedule-current-complete"
                        disabled={
                          timeline.rosterTeams.length === 0 ||
                          timeline.schedule.status === "COMPLETED"
                        }
                        className="border-2 border-black bg-green-600 text-white px-4 py-3 text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Flag size={16} />
                        일정 종료
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsDeleteModalOpen(true)}
                        data-testid="schedule-current-delete"
                        disabled={
                          timeline.schedule.status === "COMPLETED" &&
                          !isAdminVerified
                        }
                        className="border-2 border-black bg-minion-red text-white px-4 py-3 text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                        일정 삭제
                      </button>
                    </div>
                  </div>
                  <div className="bg-black text-white border-4 border-black p-5 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                    <div className="flex items-center gap-3">
                      <Clock3 size={18} className="text-minion-yellow" />
                      <div>
                        <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-yellow">
                          Next Match
                        </p>
                        <p className="text-fluid-lg font-black mt-1">
                          {nextMatchesPreview.length > 0
                            ? `${nextMatchesPreview.length}경기 예정`
                            : "대기 중"}
                        </p>
                      </div>
                    </div>
                    {nextMatchesPreview.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {nextMatchesPreview.map((match) => (
                          <div
                            key={match.id}
                            className="border-2 border-white/20 bg-white/5 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {match.stageLabel && (
                                <span className="border border-white/50 bg-white/10 px-2 py-0.5 text-fluid-xs font-black">
                                  {match.stageLabel}
                                </span>
                              )}
                              <p className="text-sm font-black">
                                {match.homeTeamName} vs {match.awayTeamName}
                              </p>
                            </div>
                            <p className="text-fluid-xs font-bold text-white/70 mt-1">
                              {match.startsAt} · {getWinnerLabel(match)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-bold text-white/80 mt-4">
                        등록된 다음 경기가 없습니다.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <ScheduleCalendar
                    label="Match Days"
                    selectedDate={new Date(`${selectedDateKey}T00:00:00`)}
                    onChange={(date) => setSelectedDateKey(formatDateKey(date))}
                    daySummaries={daySummaries}
                    minDate={new Date(timeline.schedule.startsAt)}
                    maxDate={
                      timeline.schedule.endsAt
                        ? new Date(timeline.schedule.endsAt)
                        : undefined
                    }
                  />
                  <ScheduleMatchDayEditor
                    selectedDateLabel={formatTimelineDate(selectedDateKey)}
                    rows={matchRows}
                    rosterTeams={timeline.rosterTeams}
                    adminCode={adminCode}
                    isAdminVerified={isAdminVerified}
                    isVerifyingAdmin={isVerifyingAdmin}
                    timelineError={timelineError}
                    isSavingTimeline={isSavingTimeline}
                    isSubmittingResultId={isSubmittingResultId}
                    isScheduleCompleted={timeline.schedule.status === "COMPLETED"}
                    onAdminCodeChange={handleAdminCodeChange}
                    onVerifyAdminCode={() => void handleVerifyAdminCode()}
                    onRowChange={(index, patch) =>
                      setMatchRows((prev) =>
                        prev.map((row, rowIndex) => {
                          if (rowIndex !== index) return row;

                          const nextWinsToClinch =
                            patch.winsToClinch ?? row.winsToClinch;
                          const nextMaxGames = Math.max(
                            patch.maxGames ?? row.maxGames,
                            nextWinsToClinch,
                          );
                          const nextSetLogs = (patch.setLogs ?? row.setLogs).slice(
                            0,
                            nextMaxGames,
                          );
                          const derivedScoreFromLogs = summarizeLeagueSetLogs(
                            nextSetLogs.map((setLog, setIndex) => ({
                              setNumber: setIndex + 1,
                              winner: setLog.winner,
                              note: setLog.note,
                            })),
                          );
                          const usesSetLogs = nextSetLogs.length > 0;

                          return {
                            ...row,
                            ...patch,
                            winsToClinch: nextWinsToClinch,
                            maxGames: nextMaxGames,
                            setLogs: nextSetLogs,
                            homeScore: usesSetLogs
                              ? derivedScoreFromLogs.homeScore
                              : Math.min(
                                  nextMaxGames,
                                  patch.homeScore ?? row.homeScore,
                                ),
                            awayScore: usesSetLogs
                              ? derivedScoreFromLogs.awayScore
                              : Math.min(
                                  nextMaxGames,
                                  patch.awayScore ?? row.awayScore,
                                ),
                          };
                        }),
                      )
                    }
                    onAddRow={() =>
                      setMatchRows((prev) => [
                        ...prev,
                        createEmptyMatchRow(),
                      ])
                    }
                    onRemoveRow={(index) =>
                      setMatchRows((prev) =>
                        prev.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    onSaveDay={() => void handleSaveDay()}
                    onSaveResult={(row) => void handleSaveResult(row)}
                  />
                </div>

                <ScheduleRosterPanel matches={selectedRosterMatches} />
                <LeagueRecordSummaryPanel
                  scheduleName={timeline.schedule.name}
                  championTeamName={timeline.schedule.championTeamName}
                  rosterTeams={timeline.rosterTeams}
                  days={timeline.days}
                />
              </>
            ) : isLoadingTimeline ? (
              <div className="bg-white border-4 border-black p-10 text-center space-y-4 animate-pulse">
                <div className="flex justify-center">
                  <div className="border-4 border-black border-t-minion-yellow w-10 h-10 rounded-full animate-spin" />
                </div>
                <p className="text-sm font-black tracking-widest uppercase text-gray-500">일정 불러오는 중...</p>
              </div>
            ) : (
              <div className="bg-white border-4 border-dashed border-black p-10 text-center">
                <p className="text-lg font-black">선택된 일정이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[220] bg-black/80 p-4 flex items-center justify-center"
            onClick={(event) =>
              event.target === event.currentTarget && setIsOpen(false)
            }
          >
            <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden bg-[#fffdf6] border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b-4 border-black bg-black text-white">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-minion-yellow">
                    Schedule Maker
                  </p>
                  <h3 className="text-xl font-heading mt-1">
                    리그전 일정 생성
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="bg-minion-red text-black border-2 border-black p-1"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
                <div className="space-y-4">
                  <div className="border-2 border-black bg-[#eef4ff] px-4 py-4 space-y-3">
                    <div>
                      <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
                        Admin Access
                      </p>
                      <p className="text-fluid-sm font-black mt-1">
                        일정 생성 관리자 코드
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="password"
                        data-testid="schedule-create-admin-code"
                        value={adminCode}
                        onChange={(event) =>
                          handleAdminCodeChange(event.target.value)
                        }
                        placeholder="일정 생성/저장/종료/삭제에 필요"
                        className="w-full border-2 border-black px-4 py-3 bg-white text-fluid-sm font-bold"
                      />
                      <button
                        type="button"
                        data-testid="schedule-create-admin-verify"
                        onClick={() => void handleVerifyAdminCode()}
                        disabled={isVerifyingAdmin || !adminCode.trim()}
                        className="pixel-button shrink-0 bg-black text-minion-yellow px-5 py-3 text-sm font-black disabled:opacity-50"
                      >
                        {isVerifyingAdmin ? "확인 중..." : "코드 확인"}
                      </button>
                    </div>
                    <p
                      className={`text-fluid-xs font-bold ${
                        isAdminVerified ? "text-green-700" : "text-gray-600"
                      }`}
                    >
                      {isAdminVerified
                        ? "관리자 코드가 확인되었습니다."
                        : "이 코드가 없으면 서버에서 일정 변경이 거부됩니다."}
                    </p>
                  </div>
                  <select
                    data-testid="schedule-create-linked-auction"
                    value={selectedLinkedAuctionId}
                    onChange={(event) =>
                      setSelectedLinkedAuctionId(event.target.value)
                    }
                    className="w-full border-2 border-black px-4 py-3 bg-white text-sm font-bold"
                  >
                    <option value="">연결할 경매 선택 안 함</option>
                    {leagueOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                        {option.closedAt
                          ? ` · ${new Date(option.closedAt).toLocaleDateString("ko-KR")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    data-testid="schedule-create-name"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="새 일정 이름"
                    className="w-full border-2 border-black px-4 py-3 bg-white text-sm font-bold"
                  />
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="메모"
                    rows={4}
                    className="w-full border-2 border-black px-4 py-3 bg-white text-sm font-bold resize-none"
                  />
                  {error && (
                    <div className="border-4 border-black bg-red-100 px-4 py-3 text-sm font-black text-red-700">
                      {error}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <ScheduleCalendar
                      label="시작일"
                      selectedDate={startDate}
                      onChange={setStartDate}
                      daySummaries={new Map()}
                    />
                  </div>
                  <div className="space-y-3">
                    <ScheduleCalendar
                      label="종료일"
                      selectedDate={endDate}
                      onChange={setEndDate}
                      daySummaries={new Map()}
                    />
                  </div>
                </div>
              </div>
              <div className="border-t-4 border-black bg-white px-6 py-4 flex justify-between items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="pixel-button bg-white text-black px-6 py-3 text-sm font-bold"
                >
                  닫기
                </button>
                <button
                  type="button"
                  data-testid="schedule-create-save"
                  onClick={() => void handleCreate()}
                  disabled={isSaving}
                  className="pixel-button bg-black text-minion-yellow px-8 py-3 text-sm font-heading disabled:opacity-50"
                >
                  {isSaving ? "저장 중..." : "일정 저장"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {isDeleteModalOpen && typeof document !== "undefined" && (
        <ActionModal
          title="일정 삭제"
          onClose={() => setIsDeleteModalOpen(false)}
        >
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-700 leading-relaxed">
              선택한 일정과 날짜별 경기 데이터가 모두 삭제됩니다. 이 작업은
              되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="pixel-button flex-1 bg-white text-black px-4 py-3 text-sm font-bold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSchedule()}
                disabled={isDeletingSchedule}
                className="pixel-button flex-1 bg-minion-red text-white px-4 py-3 text-sm font-bold disabled:opacity-50"
              >
                {isDeletingSchedule ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </ActionModal>
      )}

      {isCompleteModalOpen &&
        typeof document !== "undefined" &&
        timeline?.schedule && (
          <ActionModal
            title="일정 종료"
            onClose={() => setIsCompleteModalOpen(false)}
          >
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-700 leading-relaxed">
                최종 우승팀을 선택하면 일정이 종료되고 명예의 전당에 자동
                등록됩니다.
              </p>
              <select
                data-testid="schedule-complete-champion"
                value={selectedChampionName}
                onChange={(event) =>
                  setSelectedChampionName(event.target.value)
                }
                className="w-full border-2 border-black px-4 py-3 bg-white text-sm font-bold"
              >
                <option value="">최종 우승팀 선택</option>
                {timeline.rosterTeams.map((team) => (
                  <option key={`champion-${team.name}`} value={team.name}>
                    {team.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="pixel-button flex-1 bg-white text-black px-4 py-3 text-sm font-bold"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="schedule-complete-submit"
                  onClick={() => void handleCompleteSchedule()}
                  disabled={isCompletingSchedule || !selectedChampionName}
                  className="pixel-button flex-1 bg-green-600 text-white px-4 py-3 text-sm font-bold disabled:opacity-50"
                >
                  {isCompletingSchedule ? "종료 처리 중..." : "종료 및 등록"}
                </button>
              </div>
            </div>
          </ActionModal>
        )}
    </>
  );
}
