"use client";
// 경매 종료 후 경매 팀 로스터를 실제 팀 번호에 확정 배정한다.
import { useMemo, useState } from "react";
import { saveTeamAssignment } from "@/features/auction/api/teamAssignmentActions";
import type {
  AssignmentExceptionReason,
  AssignmentSelection,
  AssignmentSelectionStatus,
} from "@/features/auction/utils/desiredTeamAssignment";
import {
  applyTeamAssignmentSelections,
  buildRosterAssignmentCandidates,
  formatTeamIds,
  getAllTeamIds,
} from "@/features/auction/utils/desiredTeamAssignment";
import type { Player, Team } from "@/features/auction/store/useAuctionStore";

interface TeamAssignmentPanelProps {
  roomId: string;
  organizerToken: string;
  teams: Team[];
  players: Player[];
  totalTeamCount: number;
  onSaved?: () => void;
}

export function TeamAssignmentPanel({
  roomId,
  organizerToken,
  teams,
  players,
  totalTeamCount,
  onSaved,
}: TeamAssignmentPanelProps) {
  const [manualSelections, setManualSelections] = useState<
    Record<string, number | null>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const candidateRows = useMemo(
    () =>
      buildRosterAssignmentCandidates(
        teams.map((team) => ({
          auctionTeamId: team.id,
          players: players.filter(
            (player) => player.team_id === team.id && player.status === "SOLD",
          ),
        })),
        totalTeamCount,
      ),
    [players, teams, totalTeamCount],
  );
  const explicitSelections: AssignmentSelection[] = Object.entries(
    manualSelections,
  )
    .filter(([, assignedTeamId]) => assignedTeamId !== null)
    .map(([auctionTeamId, assignedTeamId]) => {
      const candidate = candidateRows.find(
        (row) => row.auctionTeamId === auctionTeamId,
      );
      const isException =
        typeof assignedTeamId === "number" &&
        candidate !== undefined &&
        !candidate.candidateTeamIds.includes(assignedTeamId);
      return {
        auctionTeamId,
        assignedTeamId,
        status: isException ? "EXCEPTION" : "MANUAL",
        exceptionReason: isException
          ? resolveExceptionReason(candidate)
          : undefined,
      };
    });
  const resolvedRows = applyTeamAssignmentSelections(
    candidateRows,
    explicitSelections,
    totalTeamCount,
  );
  const rowsByTeamId = new Map(
    resolvedRows.map((row) => [row.auctionTeamId, row]),
  );
  const assignedTeamIds = new Set(
    resolvedRows
      .map((row) => row.assignedTeamId)
      .filter((teamId): teamId is number => typeof teamId === "number"),
  );
  const canConfirm = resolvedRows.every(
    (row) => typeof row.assignedTeamId === "number",
  );

  const handleSave = async () => {
    if (!canConfirm || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveTeamAssignment({
        roomId,
        organizerToken,
        assignments: resolvedRows.map((row) => ({
          auctionTeamId: row.auctionTeamId,
          assignedTeamId: row.assignedTeamId,
          status: row.status as Exclude<AssignmentSelectionStatus, "UNASSIGNED">,
          exceptionReason: row.exceptionReason,
          originalCandidateTeamIds: row.candidateTeamIds,
          message: row.message ?? undefined,
        })),
      });
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      onSaved?.();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="pixel-box w-full bg-white p-5 text-left shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <h2 className="font-heading text-fluid-sm text-black">
            실제 팀 배정
          </h2>
          <p className="mt-1 text-fluid-xs font-bold text-gray-600">
            일정 생성 전 경매 팀을 실제 팀 번호에 확정하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canConfirm || isSaving}
          className="pixel-button h-12 bg-minion-yellow px-5 text-fluid-xs font-heading text-black disabled:opacity-50"
        >
          {isSaving ? "저장 중..." : "최종 배정 확정"}
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {teams.map((team) => {
          const row = rowsByTeamId.get(team.id);
          if (!row) return null;
          const assignedValue =
            manualSelections[team.id] ?? row.assignedTeamId ?? "";
          return (
            <div
              key={team.id}
              data-testid={`team-assignment-row-${team.id}`}
              className="border-4 border-black bg-gray-50 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-heading text-fluid-xs text-black">
                    {team.name}
                  </p>
                  <p className="mt-1 text-[11px] font-black text-gray-600">
                    후보:{" "}
                    {!row.restricted
                      ? "상관없음"
                      : row.availableCandidateTeamIds.length > 0
                        ? formatTeamIds(row.availableCandidateTeamIds)
                      : "팀 내 희망팀 충돌"}
                  </p>
                  <p className="mt-1 text-[11px] font-black text-gray-600">
                    상태: {statusLabel(row.status, row.assignedTeamId)}
                  </p>
                  {row.message && (
                    <p className="mt-2 text-[11px] font-bold text-minion-red">
                      {row.message}
                    </p>
                  )}
                </div>
                <label className="flex min-w-40 flex-col gap-1 text-[11px] font-black text-gray-600">
                  배정 예정 팀
                  <select
                    value={assignedValue}
                    onChange={(event) => {
                      const nextValue = event.target.value
                        ? Number(event.target.value)
                        : null;
                      setManualSelections((current) => ({
                        ...current,
                        [team.id]: nextValue,
                      }));
                    }}
                    className="border-4 border-black bg-white px-3 py-2 text-fluid-xs font-black text-black"
                  >
                    <option value="">미배정</option>
                    {getAllTeamIds(totalTeamCount).map((teamId) => (
                      <option
                        key={teamId}
                        value={teamId}
                        disabled={
                          assignedTeamIds.has(teamId) &&
                          teamId !== row.assignedTeamId
                        }
                      >
                        {teamId}팀
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {saveError && (
        <p className="mt-3 border-4 border-minion-red bg-white px-3 py-2 text-fluid-xs font-black text-minion-red">
          {saveError}
        </p>
      )}
    </section>
  );
}

function resolveExceptionReason(candidate: {
  invalidReasons: AssignmentExceptionReason[];
  candidateTeamIds: number[];
}): AssignmentExceptionReason {
  return (
    candidate.invalidReasons[0] ??
    (candidate.candidateTeamIds.length === 0
      ? "NO_COMMON_CANDIDATE"
      : "FORCED_BY_ORGANIZER")
  );
}

function statusLabel(status: AssignmentSelectionStatus, assignedTeamId: number | null) {
  if (status === "SUGGESTED" && assignedTeamId) return `${assignedTeamId}팀 제안`;
  if (status === "EXCEPTION") return "예외 배정";
  if (status === "MANUAL" && assignedTeamId) return `${assignedTeamId}팀 확정 전`;
  return "제안 대기";
}
