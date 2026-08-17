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

/**
 * Riot ID 비교용 키입니다. 표시용 문자열은 보존하고, 비교할 때만
 * NFKC·대소문자·공백·zero-width 문자·구분 문자를 정리합니다.
 * 후보가 여러 팀이면 자동 배정하지 않으므로 특수문자 제거로 인한 충돌도 안전하게 처리됩니다.
 */
function riotMatchKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function splitRiotId(value: string | null | undefined) {
  const normalized = (value ?? "").normalize("NFKC").trim();
  const separator = normalized.lastIndexOf("#");
  return separator > 0
    ? { name: normalized.slice(0, separator).trim(), tag: normalized.slice(separator + 1).trim() }
    : { name: normalized, tag: "" };
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

type MatchStatus = "EXACT" | "NAME_ONLY" | "UNMATCHED" | "SAVED";
type Filter = "ALL" | "UNMATCHED" | "REVIEW" | "MATCHED" | "SAVED";
type DraftMember = DeeplolMember & {
  teamId: string;
  teamName: string;
  selected: boolean;
  matchStatus: MatchStatus;
};

type RosterSlot = {
  key: string;
  teamId: string;
  teamName: string;
  playerName: string;
};

export type RosterPuuidMapping = {
  teamId: string;
  teamName: string;
  playerName: string;
  puuId: string;
};

function memberMatchesRosterPlayer(member: DeeplolMember, playerName: string) {
  const rosterId = splitRiotId(playerName);
  const memberName = riotMatchKey(member.riotName);
  const rosterName = riotMatchKey(rosterId.name);
  if (!rosterName || rosterName !== memberName) return false;
  return !rosterId.tag || !member.riotTag || riotMatchKey(rosterId.tag) === riotMatchKey(member.riotTag);
}

function findTeam(rosterTeams: LeagueRosterTeam[], member: DeeplolMember, existing?: LeagueDeeplolParticipant) {
  if (existing) {
    const savedTeam = rosterTeams.find((team) => team.id === existing.teamId || key(team.name) === key(existing.teamName));
    if (savedTeam) return { team: savedTeam, status: "SAVED" as const };
  }

  const exactCandidates = rosterTeams.filter((team) => team.players.some((player) => {
    const playerId = splitRiotId(player.name);
    return riotMatchKey(playerId.name) === riotMatchKey(member.riotName) && Boolean(playerId.tag) && riotMatchKey(playerId.tag) === riotMatchKey(member.riotTag);
  }));
  if (exactCandidates.length === 1) return { team: exactCandidates[0], status: "EXACT" as const };

  const nameCandidates = rosterTeams.filter((team) => team.players.some((player) => riotMatchKey(splitRiotId(player.name).name) === riotMatchKey(member.riotName)));
  if (nameCandidates.length === 1) return { team: nameCandidates[0], status: "NAME_ONLY" as const };
  return { team: null, status: "UNMATCHED" as const };
}

export function DeeplolMemberImportPanel({
  scheduleId,
  rosterTeams,
  existingParticipants,
  rosterPuuidMappings,
  adminCode,
  isAdminVerified,
  onSaved,
}: {
  scheduleId: string;
  rosterTeams: LeagueRosterTeam[];
  existingParticipants: LeagueDeeplolParticipant[];
  rosterPuuidMappings?: RosterPuuidMapping[];
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [bulkTeamId, setBulkTeamId] = useState("");
  const [rosterAssignments, setRosterAssignments] = useState<Record<string, string>>({});
  const [rosterQuery, setRosterQuery] = useState("");

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
        const matched = findTeam(rosterTeams, member, existing);
        return {
          ...member,
          teamId: matched.team?.id ?? "",
          teamName: matched.team?.name ?? "",
          selected: Boolean(matched.team),
          matchStatus: matched.status,
        };
      });
      setMembers(next);
      setNotice(`${next.length}명의 Deeplol 구성원을 불러왔습니다. 자동 매칭과 미매칭 항목을 확인해주세요.`);
    } catch (loadError) {
      setError(toMemberImportError(loadError));
    } finally {
      setIsLoading(false);
    }
  };

  const updateMember = (puuId: string, patch: Partial<DraftMember>) => {
    setMembers((current) => current.map((member) => (member.puuId === puuId ? { ...member, ...patch } : member)));
  };

  const filteredMembers = useMemo(() => {
    const normalizedQuery = key(query);
    return members.filter((member) => {
      const matchesQuery = !normalizedQuery || [member.riotName, member.riotTag, member.puuId, member.teamName].some((value) => key(value).includes(normalizedQuery));
      const matchesFilter = filter === "ALL"
        || (filter === "UNMATCHED" && member.matchStatus === "UNMATCHED")
        || (filter === "REVIEW" && member.matchStatus === "NAME_ONLY")
        || (filter === "MATCHED" && ["EXACT", "NAME_ONLY"].includes(member.matchStatus))
        || (filter === "SAVED" && member.matchStatus === "SAVED");
      return matchesQuery && matchesFilter;
    });
  }, [filter, members, query]);

  const rosterSlots = useMemo<RosterSlot[]>(
    () => rosterTeams.flatMap((team) => team.players.map((player, index) => ({
      key: `${team.id}:${index}:${player.name}`,
      teamId: team.id,
      teamName: team.name,
      playerName: player.name,
    }))),
    [rosterTeams],
  );

  const savedRosterSlotKeys = useMemo(() => {
    const mappings = rosterPuuidMappings ?? existingParticipants
      .filter((participant) => participant.status === 'ACTIVE')
      .map((participant) => ({
        teamId: participant.teamId ?? '',
        teamName: participant.teamName ?? '',
        playerName: participant.riotName ?? '',
        puuId: participant.puuId,
      }));

    return new Set(
      rosterSlots
        .filter((slot) => mappings.some((mapping) =>
          mapping.teamId === slot.teamId &&
          (key(mapping.playerName) === key(splitRiotId(slot.playerName).name) ||
            key(mapping.playerName) === key(slot.playerName)),
        ))
        .map((slot) => slot.key),
    );
  }, [existingParticipants, rosterPuuidMappings, rosterSlots]);
  const missingRosterSlots = useMemo(() => rosterSlots.filter((slot) => !savedRosterSlotKeys.has(slot.key)), [rosterSlots, savedRosterSlotKeys]);
  const filteredRosterSlots = useMemo(() => {
    const normalizedQuery = key(rosterQuery);
    return missingRosterSlots.filter((slot) => !normalizedQuery || key(`${slot.playerName} ${slot.teamName}`).includes(normalizedQuery));
  }, [missingRosterSlots, rosterQuery]);

  const selectedCount = members.filter((member) => member.selected && member.teamId).length;
  const unresolvedCount = members.filter((member) => member.matchStatus === "UNMATCHED").length;
  const reviewCount = members.filter((member) => member.matchStatus === "NAME_ONLY").length;

  const rosterCandidates = (slot: RosterSlot) => members.filter((member) => memberMatchesRosterPlayer(member, slot.playerName));

  const assignRosterCandidate = (slot: RosterSlot, puuId: string) => {
    setRosterAssignments((current) => ({ ...current, [slot.key]: puuId }));
    const member = members.find((item) => item.puuId === puuId);
    if (member) updateMember(puuId, { teamId: slot.teamId, teamName: slot.teamName, selected: true, matchStatus: "NAME_ONLY" });
  };

  const autoAssignRosterCandidates = () => {
    const used = new Set<string>();
    const assignments: Record<string, string> = {};
    for (const slot of missingRosterSlots) {
      const candidates = rosterCandidates(slot).filter((member) => !used.has(member.puuId));
      if (candidates.length === 1) {
        assignments[slot.key] = candidates[0].puuId;
        used.add(candidates[0].puuId);
      }
    }
    setRosterAssignments((current) => ({ ...current, ...assignments }));
    setMembers((current) => current.map((member) => {
      const entry = Object.entries(assignments).find(([, puuId]) => puuId === member.puuId);
      if (!entry) return member;
      const slot = rosterSlots.find((item) => item.key === entry[0]);
      return slot ? { ...member, teamId: slot.teamId, teamName: slot.teamName, selected: true, matchStatus: "NAME_ONLY" } : member;
    }));
    setNotice(`${Object.keys(assignments).length}명의 로스터 후보를 자동 연결했습니다. 나머지는 수동으로 선택해주세요.`);
  };

  const handleRosterSync = async () => {
    if (!isAdminVerified) {
      setError("상태를 동기화하려면 관리자 코드를 먼저 확인해주세요.");
      return;
    }
    const assigned = Object.entries(rosterAssignments).map(([slotKey, puuId]) => {
      const slot = rosterSlots.find((item) => item.key === slotKey);
      const member = members.find((item) => item.puuId === puuId);
      return slot && member ? { slot, member } : null;
    }).filter((item): item is { slot: RosterSlot; member: DraftMember } => Boolean(item));
    if (assigned.length === 0) {
      setError("동기화할 로스터 선수를 선택해주세요.");
      return;
    }
    const duplicatePuuIds = new Set(assigned.map((item) => item.member.puuId));
    if (duplicatePuuIds.size !== assigned.length) {
      setError("하나의 Deeplol 구성원이 여러 로스터 선수에 중복 연결되었습니다.");
      return;
    }
    const teamCounts = new Map<string, number>();
    for (const item of assigned) teamCounts.set(item.slot.teamId, (teamCounts.get(item.slot.teamId) ?? 0) + 1);
    const overfullTeam = [...teamCounts.entries()].find(([, count]) => count > 6);
    if (overfullTeam) {
      const team = rosterTeams.find((item) => item.id === overfullTeam[0]);
      setError(`${team?.name ?? "선택한 팀"}에 ${overfullTeam[1]}명이 연결되어 팀 정원 6명을 초과합니다.`);
      return;
    }
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await saveDeeplolParticipants(scheduleId, assigned.map(({ slot, member }) => ({
        puuId: member.puuId,
        riotName: member.riotName,
        riotTag: member.riotTag,
        teamId: slot.teamId,
        teamName: slot.teamName,
        position: member.position,
      })), adminCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`${result.savedCount ?? assigned.length}명의 로스터 PUUID 상태를 동기화했습니다.`);
      await onSaved();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "로스터 PUUID 동기화에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const applyBulkTeam = () => {
    const team = rosterTeams.find((item) => item.id === bulkTeamId);
    if (!team) return;
    const targetIds = new Set(filteredMembers.filter((member) => member.selected).map((member) => member.puuId));
    setMembers((current) => current.map((member) => targetIds.has(member.puuId)
      ? { ...member, teamId: team.id, teamName: team.name, selected: true, matchStatus: "NAME_ONLY" }
      : member));
    setNotice(`${targetIds.size}명의 선택된 구성원을 ${team.name}에 일괄 배정했습니다. 저장 전에 팀 인원을 확인해주세요.`);
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
    const puuIds = new Set<string>();
    const teamCounts = new Map<string, number>();
    for (const member of selected) {
      if (puuIds.has(member.puuId)) {
        setError(`PUUID ${member.puuId}가 중복 선택되었습니다.`);
        return;
      }
      puuIds.add(member.puuId);
      teamCounts.set(member.teamId, (teamCounts.get(member.teamId) ?? 0) + 1);
    }
    const overfullTeam = [...teamCounts.entries()].find(([, count]) => count > 6);
    if (overfullTeam) {
      const team = rosterTeams.find((item) => item.id === overfullTeam[0]);
      setError(`${team?.name ?? "선택한 팀"}에 ${overfullTeam[1]}명이 선택되어 팀 정원 6명을 초과합니다.`);
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
          <p className="mt-1 text-fluid-xs font-bold text-gray-700">이름·태그 자동 매칭 후 미매칭 구성원만 검색·수동 배정할 수 있습니다.</p>
        </div>
        <button type="button" data-testid="deeplol-member-import-open" onClick={() => void openAndLoad()} disabled={isLoading || !isAdminVerified} className="border-2 border-black bg-minion-blue px-4 py-3 text-fluid-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
          {isLoading ? "불러오는 중..." : "Deeplol 구성원 불러오기"}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 border-2 border-black bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-fluid-xs font-black">불러온 구성원 {members.length}명 · 저장 선택 {selectedCount}명 · 미매칭 {unresolvedCount}명 · 확인 필요 {reviewCount}명</p>
            <button type="button" onClick={() => setIsOpen(false)} className="self-start border-2 border-black bg-white px-3 py-1 text-fluid-xs font-black">닫기</button>
          </div>

          {notice && <p className="mt-3 border-2 border-green-700 bg-green-50 px-3 py-2 text-fluid-xs font-black text-green-800">{notice}</p>}
          {error && <div role="alert" aria-live="assertive" data-testid="deeplol-member-import-error" className="mt-3 border-2 border-minion-red bg-red-50 px-3 py-3 text-fluid-xs font-black text-minion-red"><p>{error}</p><button type="button" onClick={() => void openAndLoad()} disabled={isLoading || !isAdminVerified} className="mt-2 border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-50">다시 시도</button></div>}

          {members.length > 0 && missingRosterSlots.length > 0 && (
            <section className="mt-4 border-2 border-black bg-[#fffdf8] p-3" data-testid="deeplol-roster-sync-panel">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-fluid-xs font-black text-minion-blue">현재 리그 PUUID 미확보 로스터</p>
                  <p className="mt-1 text-fluid-xs font-bold text-gray-700">미확보 선수 {missingRosterSlots.length}명 · 연결 완료 {Object.keys(rosterAssignments).length}명</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-testid="deeplol-roster-auto-assign" onClick={autoAssignRosterCandidates} disabled={isSaving} className="border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black disabled:cursor-not-allowed disabled:opacity-50">이름 후보 자동 연결</button>
                  <button type="button" data-testid="deeplol-roster-sync" onClick={() => void handleRosterSync()} disabled={isSaving || Object.keys(rosterAssignments).length === 0} className="border-2 border-black bg-minion-yellow px-3 py-2 text-fluid-xs font-black disabled:cursor-not-allowed disabled:opacity-50">로스터 상태 동기화</button>
                </div>
              </div>
              <input aria-label="미확보 로스터 선수 검색" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} placeholder="로스터 선수명·팀 검색" className="mt-3 w-full border-2 border-black px-3 py-2 text-fluid-xs font-bold" />
              <p className="mt-2 text-fluid-xs font-bold text-gray-600">각 로스터 선수에 Deeplol 구성원을 하나씩 연결하세요. 이름 후보가 없으면 전체 구성원 목록에서 직접 선택할 수 있습니다.</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {filteredRosterSlots.map((slot) => {
                  const suggested = rosterCandidates(slot);
                  const options = suggested.length > 0 ? suggested : members;
                  return (
                    <div key={slot.key} className="border-2 border-black bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-fluid-sm font-black">{slot.playerName}</p>
                          <p className="text-fluid-xs font-bold text-gray-600">{slot.teamName}</p>
                        </div>
                        <span className="text-[10px] font-black text-minion-red">PUUID 미확보</span>
                      </div>
                      <select aria-label={`${slot.playerName} Deeplol 구성원`} value={rosterAssignments[slot.key] ?? ""} onChange={(event) => assignRosterCandidate(slot, event.target.value)} className="mt-2 w-full border-2 border-black bg-white px-2 py-2 text-fluid-xs font-black">
                        <option value="">Deeplol 구성원 선택</option>
                        {options.map((member) => <option key={member.puuId} value={member.puuId}>{member.riotName ?? "이름 미확인"}{member.riotTag ? `#${member.riotTag}` : ""}</option>)}
                      </select>
                      <p className="mt-1 text-[10px] font-bold text-gray-600">{suggested.length > 0 ? `이름 후보 ${suggested.length}명` : "이름 후보 없음 · 직접 선택"}</p>
                    </div>
                  );
                })}
              </div>
              {filteredRosterSlots.length === 0 && <p className="mt-3 border-2 border-dashed border-gray-500 px-3 py-4 text-center text-fluid-xs font-black text-gray-600">조건에 맞는 미확보 로스터 선수가 없습니다.</p>}
            </section>
          )}

          {members.length > 0 && (
            <>
              <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                <input aria-label="Deeplol 구성원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·태그·PUUID·팀 검색" className="border-2 border-black px-3 py-2 text-fluid-xs font-bold" />
                <select aria-label="매핑 상태 필터" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="border-2 border-black bg-white px-3 py-2 text-fluid-xs font-black">
                  <option value="ALL">전체 ({members.length})</option>
                  <option value="UNMATCHED">미매칭 ({unresolvedCount})</option>
                  <option value="REVIEW">확인 필요 ({reviewCount})</option>
                  <option value="MATCHED">자동·후보 매칭</option>
                  <option value="SAVED">기존 저장</option>
                </select>
                <div className="flex gap-2">
                  <select aria-label="일괄 배정 팀" value={bulkTeamId} onChange={(event) => setBulkTeamId(event.target.value)} className="min-w-0 border-2 border-black bg-white px-2 py-2 text-fluid-xs font-black">
                    <option value="">팀 선택</option>
                    {rosterTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <button type="button" onClick={applyBulkTeam} disabled={!bulkTeamId || filteredMembers.filter((member) => member.selected).length === 0} className="border-2 border-black bg-minion-yellow px-3 py-2 text-fluid-xs font-black disabled:cursor-not-allowed disabled:opacity-50">선택 팀 일괄 배정</button>
                </div>
              </div>
              <p className="mt-2 text-fluid-xs font-bold text-gray-600">목록에서 체크한 구성원을 일괄 배정할 수 있습니다. 이름만 일치한 항목은 반드시 관리자 확인 후 저장하세요.</p>

              <div className="mt-3 space-y-2">
                {filteredMembers.map((member) => (
                  <div key={member.puuId} className="border-2 border-black bg-[#fffdf8] p-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <label className="flex min-w-0 items-start gap-2">
                        <input type="checkbox" checked={member.selected} onChange={(event) => updateMember(member.puuId, { selected: event.target.checked })} className="mt-1 h-4 w-4 accent-black" />
                        <span className="min-w-0">
                          <span className="block text-fluid-sm font-black">{member.riotName ?? "이름 미확인"}{member.riotTag ? `#${member.riotTag}` : ""}</span>
                          <span className="mt-1 block break-all font-mono text-[10px] font-bold text-gray-600">{member.puuId}</span>
                        </span>
                      </label>
                      <div className="flex w-full flex-col gap-1 lg:w-72">
                        <select aria-label={`${member.riotName ?? "구성원"} 팀`} value={member.teamId} onChange={(event) => { const team = rosterTeams.find((item) => item.id === event.target.value); updateMember(member.puuId, { teamId: team?.id ?? "", teamName: team?.name ?? "", selected: Boolean(team), matchStatus: team ? "NAME_ONLY" : "UNMATCHED" }); }} className="w-full border-2 border-black bg-white px-2 py-2 text-fluid-xs font-black">
                          <option value="">팀을 선택하세요</option>
                          {rosterTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                        </select>
                        <span className={`text-[10px] font-black ${member.matchStatus === "EXACT" || member.matchStatus === "SAVED" ? "text-green-700" : member.matchStatus === "NAME_ONLY" ? "text-amber-700" : "text-red-700"}`}>
                          {member.matchStatus === "EXACT" && "이름+태그 자동 매칭"}
                          {member.matchStatus === "SAVED" && "기존 저장 매핑"}
                          {member.matchStatus === "NAME_ONLY" && "이름 일치 · 확인 필요"}
                          {member.matchStatus === "UNMATCHED" && "수동 팀 지정 필요"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredMembers.length === 0 && <p className="border-2 border-dashed border-gray-500 px-3 py-4 text-center text-fluid-xs font-black text-gray-600">조건에 맞는 구성원이 없습니다.</p>}
              </div>
            </>
          )}

          {members.length > 0 && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-fluid-xs font-bold text-gray-700">팀별 최대 6명까지 저장할 수 있습니다. 전체 리그 로스터를 완성한 뒤 저장하세요.</p><button type="button" data-testid="deeplol-member-import-save" onClick={() => void handleSave()} disabled={isSaving || !isAdminVerified} className="shrink-0 border-2 border-black bg-minion-yellow px-4 py-3 text-fluid-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "저장 중..." : "PUUID 매핑 저장"}</button></div>}
        </div>
      )}
    </div>
  );
}

export { splitRiotId };
