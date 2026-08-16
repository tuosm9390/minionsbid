"use client";

import { useMemo, useState } from "react";
import {
  getDeeplolMemberCatalog,
  saveDeeplolParticipants,
  type DeeplolParticipantRegistration,
} from "@/features/schedules/api/scheduleActions";
import type { LeagueDeeplolParticipant, LeagueRosterTeam } from "@/features/schedules/types";
import type { DeeplolMember } from "@/features/deeplol/types";

function key(value: string | null | undefined) {
  return (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function toMemberImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/AbortError|timeout|timed out/i.test(message)) return "Deeplol 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  if (/HTTP 401|HTTP 403|unauthorized|forbidden/i.test(message)) return "Deeplol 구성원 조회 권한이 없습니다. 연결 상태를 확인해주세요.";
  if (/HTTP 404|not found/i.test(message)) return "Deeplol 모임 구성원 정보를 찾지 못했습니다. Connect ID를 확인해주세요.";
  if (/HTTP 429|too many/i.test(message)) return "Deeplol 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.";
  if (/HTTP 5\d\d|server error/i.test(message)) return "Deeplol 서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  if (/Failed to fetch|network|fetch/i.test(message)) return "Deeplol 서버에 연결하지 못했습니다. 네트워크 상태를 확인해주세요.";
  return message || "Deeplol 구성원을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
}

type DraftMember = DeeplolMember & {
  teamId: string;
  teamName: string;
  selected: boolean;
};

export function DeeplolMemberImportPanel({
  scheduleId,
  rosterTeams,
  existingParticipants,
  adminCode,
  isAdminVerified,
  onSaved,
}: {
  scheduleId: string;
  rosterTeams: LeagueRosterTeam[];
  existingParticipants: LeagueDeeplolParticipant[];
  adminCode: string;
  isAdminVerified: boolean;
  onSaved: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<DraftMember[]>([]);

  const existingByPuuId = useMemo(
    () => new Map(existingParticipants.map((participant) => [participant.puuId, participant])),
    [existingParticipants],
  );

  const openAndLoad = async () => {
    if (!isAdminVerified) {
      setError("구성원을 불러오려면 관리자 코드를 먼저 확인해주세요.");
      setIsOpen(true);
      return;
    }
    setIsOpen(true);
    setIsLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await getDeeplolMemberCatalog(scheduleId, adminCode);
      if (result.error || !result.members) {
        setError(result.error ?? "구성원 목록을 불러오지 못했습니다.");
        return;
      }
      const next = result.members.map((member) => {
        const existing = existingByPuuId.get(member.puuId);
        const matches = rosterTeams.filter((team) =>
          team.players.some((player) => key(player.name) === key(member.riotName)),
        );
        const matchedTeam = existing
          ? rosterTeams.find((team) => team.id === existing.teamId || key(team.name) === key(existing.teamName))
          : matches.length === 1
            ? matches[0]
            : null;
        return {
          ...member,
          teamId: matchedTeam?.id ?? "",
          teamName: matchedTeam?.name ?? "",
          selected: Boolean(matchedTeam),
        };
      });
      setMembers(next);
      setNotice(`${next.length}명의 Deeplol 구성원을 불러왔습니다. 팀 매칭을 확인한 뒤 저장해주세요.`);
    } catch (loadError) {
      setError(toMemberImportError(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  const updateMember = (puuId: string, patch: Partial<DraftMember>) => {
    setMembers((current) => current.map((member) => (member.puuId === puuId ? { ...member, ...patch } : member)));
  };

  const handleSave = async () => {
    const selected = members.filter((member) => member.selected && member.teamId);
    if (!isAdminVerified) {
      setError("저장하려면 관리자 코드를 먼저 확인해주세요.");
      return;
    }
    if (selected.length === 0) {
      setError("저장할 구성원을 선택하고 팀을 지정해주세요.");
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const payload: DeeplolParticipantRegistration[] = selected.map((member) => ({
        puuId: member.puuId,
        riotName: member.riotName,
        riotTag: member.riotTag,
        teamId: member.teamId,
        teamName: member.teamName,
        position: member.position,
      }));
      const result = await saveDeeplolParticipants(scheduleId, payload, adminCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`${result.savedCount ?? selected.length}명의 PUUID 매핑을 저장했습니다.`);
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "PUUID 매핑 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-4 border-black bg-[#e7f5ff] p-5 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">Deeplol Connect</p>
          <h3 className="mt-1 text-fluid-lg font-black">Deeplol 구성원 불러오기</h3>
          <p className="mt-1 text-fluid-xs font-bold text-gray-700">구성원 PUUID를 불러온 뒤 리그 로스터 팀을 확인하고 저장합니다.</p>
        </div>
        <button
          type="button"
          data-testid="deeplol-member-import-open"
          onClick={() => void openAndLoad()}
          disabled={isLoading || !isAdminVerified}
          className="border-2 border-black bg-minion-blue px-4 py-3 text-fluid-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "불러오는 중..." : "Deeplol 구성원 불러오기"}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 border-2 border-black bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-fluid-xs font-black">불러온 구성원 {members.length}명 · 선택된 매핑 {members.filter((member) => member.selected && member.teamId).length}명</p>
            <button type="button" onClick={() => setIsOpen(false)} className="self-start border-2 border-black bg-white px-3 py-1 text-fluid-xs font-black">닫기</button>
          </div>

          {notice && <p className="mt-3 border-2 border-green-700 bg-green-50 px-3 py-2 text-fluid-xs font-black text-green-800">{notice}</p>}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="deeplol-member-import-error"
              className="mt-3 border-2 border-minion-red bg-red-50 px-3 py-3 text-fluid-xs font-black text-minion-red"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void openAndLoad()}
                disabled={isLoading || !isAdminVerified}
                className="mt-2 border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                다시 시도
              </button>
            </div>
          )}

          {members.length > 0 && (
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div key={member.puuId} className="border-2 border-black bg-[#fffdf8] p-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex min-w-0 items-start gap-2">
                      <input
                        type="checkbox"
                        checked={member.selected}
                        onChange={(event) => updateMember(member.puuId, { selected: event.target.checked })}
                        className="mt-1 h-4 w-4 accent-black"
                      />
                      <span className="min-w-0">
                        <span className="block text-fluid-sm font-black">{member.riotName ?? "이름 미확인"}{member.riotTag ? `#${member.riotTag}` : ""}</span>
                        <span className="mt-1 block break-all font-mono text-[10px] font-bold text-gray-600">{member.puuId}</span>
                      </span>
                    </label>
                    <select
                      value={member.teamId}
                      onChange={(event) => {
                        const team = rosterTeams.find((item) => item.id === event.target.value);
                        updateMember(member.puuId, { teamId: team?.id ?? "", teamName: team?.name ?? "", selected: Boolean(team) });
                      }}
                      className="w-full border-2 border-black bg-white px-2 py-2 text-fluid-xs font-black lg:w-64"
                    >
                      <option value="">팀을 선택하세요</option>
                      {rosterTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {members.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-fluid-xs font-bold text-gray-700">자동으로 팀을 찾지 못한 구성원은 팀을 직접 선택해야 합니다. 저장 후 다음 배치부터 해당 PUUID가 경기 조회에 사용됩니다.</p>
              <button
                type="button"
                data-testid="deeplol-member-import-save"
                onClick={() => void handleSave()}
                disabled={isSaving || !isAdminVerified}
                className="shrink-0 border-2 border-black bg-minion-yellow px-4 py-3 text-fluid-xs font-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "저장 중..." : "PUUID 매핑 저장"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
