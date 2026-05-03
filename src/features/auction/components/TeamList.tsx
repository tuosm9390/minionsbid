"use client";

import { useMemo, useState } from "react";
import {
  useAuctionStore,
  Team,
} from "@/features/auction/store/useAuctionStore";
import { updateTeamName } from "@/features/auction/api/roomActions";
import {
  buildRosterWithCaptain,
  getAuctionSlotsPerTeam,
} from "@/features/auction/utils/roster";
import { bucketAuctionPlayers } from "@/features/auction/store/auctionSelectors";

const TIER_COLOR: Record<string, string> = {
  챌린저: "text-cyan-400",
  그랜드마스터: "text-red-500",
  마스터: "text-purple-400",
  다이아: "text-blue-400",
  에메랄드: "text-emerald-400",
  플래티넘: "text-teal-400",
  골드: "text-yellow-400",
  실버: "text-gray-600",
  브론즈: "text-amber-600",
};

export function UnsoldPanel() {
  const players = useAuctionStore((state) => state.players || []);
  const { unsoldPlayers } = useMemo(() => bucketAuctionPlayers(players), [players]);

  if (unsoldPlayers.length === 0)
    return (
      <div className="flex-1 flex justify-center items-center py-10 text-fluid-xs text-gray-400 font-heading italic opacity-50">
        유찰된 플레이어가 없습니다
      </div>
    );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-1 gap-2">
        {unsoldPlayers.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center bg-gray-50 border-2 border-black p-2 hover:bg-minion-red/5 transition-colors shadow-[2px_2px_0px_rgba(0,0,0,1)]"
          >
            <span className="font-black text-gray-800 text-fluid-xs truncate">
              {p.name}
            </span>
            <span
              className={`text-fluid-xs font-heading ${TIER_COLOR[p.tier] || "text-gray-600"}`}
            >
              {p.tier}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamList() {
  const teams = useAuctionStore((state) => state.teams || []);
  const players = useAuctionStore((state) => state.players || []);
  const myTeamId = useAuctionStore((state) => state.teamId);
  const membersPerTeam = useAuctionStore((state) => state.membersPerTeam);
  const role = useAuctionStore((state) => state.role);
  const roomId = useAuctionStore((state) => state.roomId);
  const captainMode = useAuctionStore((state) => state.captainMode);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  function startEdit(team: Team) {
    setEditingTeamId(team.id);
    setEditName(team.name);
    setEditError("");
  }

  function cancelEdit() {
    setEditingTeamId(null);
    setEditName("");
    setEditError("");
  }

  async function saveEdit(teamId: string) {
    if (!roomId) return;
    setIsSaving(true);
    setEditError("");
    const result = await updateTeamName(roomId, teamId, editName);
    setIsSaving(false);
    if (result.error) {
      setEditError(result.error);
      return;
    }
    setEditingTeamId(null);
  }

  if (teams.length === 0)
    return (
      <div className="text-gray-400 text-fluid-xs text-center py-20 font-heading opacity-50">
        --- 파티 데이터가 없습니다 ---
      </div>
    );

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === myTeamId) return -1;
    if (b.id === myTeamId) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const canEditTeam = (teamId: string) =>
    role === "ORGANIZER" || (role === "LEADER" && teamId === myTeamId);
  const { soldPlayersByTeam } = useMemo(
    () => bucketAuctionPlayers(players),
    [players],
  );

  return (
    <div className="flex flex-col gap-6">
      {sortedTeams.map((team: Team) => {
        const teamPlayers = soldPlayersByTeam.get(team.id) ?? [];
        const rosterPlayers = buildRosterWithCaptain(
          teamPlayers.map((p) => ({ ...p, sold_price: p.sold_price })),
          {
            captainMode,
            leaderName: team.leader_name,
            leaderPosition: team.leader_position,
          },
        );
        const isMyTeam = team.id === myTeamId;
        const totalSlots = membersPerTeam;
        const isTeamComplete =
          teamPlayers.length ===
          getAuctionSlotsPerTeam(membersPerTeam, captainMode);
        const isEditing = editingTeamId === team.id;

        const pointRatio = Math.min(100, (team.point_balance / 1000) * 100);
        const gaugeColor =
          pointRatio >= 60
            ? "bg-minion-blue"
            : pointRatio >= 30
              ? "bg-minion-yellow"
              : "bg-minion-red animate-pulse";

        return (
          <div
            key={team.id}
            className={`p-4 border-4 border-black relative overflow-hidden transition-all duration-300 ${
              isTeamComplete
                ? "bg-gray-50 grayscale opacity-70"
                : isMyTeam
                  ? "bg-white border-minion-blue shadow-[8px_8px_0px_rgba(35,88,164,1)] scale-[1.02] z-10"
                  : "bg-white shadow-[6px_6px_0px_rgba(0,0,0,1)] grayscale-[0.2]"
            }`}
          >
            {/* Team Header */}
            <div className="flex flex-col gap-2 mb-4 border-b-2 border-black pb-3">
              <div className="flex justify-between items-center gap-2">
                {isEditing ? (
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={20}
                        autoFocus
                        className="flex-1 border-2 border-black px-2 py-1 text-fluid-sm font-black focus:outline-none focus:border-minion-blue min-w-0"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(team.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <button
                        onClick={() => saveEdit(team.id)}
                        disabled={isSaving || !editName.trim()}
                        className="pixel-button bg-minion-yellow px-2 py-1 text-fluid-xs font-heading disabled:opacity-50 shrink-0"
                        aria-label="저장"
                      >
                        {isSaving ? "…" : "저장"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="pixel-button bg-white px-2 py-1 text-fluid-xs font-heading shrink-0"
                        aria-label="취소"
                      >
                        취소
                      </button>
                    </div>
                    {editError && (
                      <p className="text-fluid-xs text-minion-red font-bold">
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h3
                      className={`font-black text-fluid-sm flex items-center gap-2 truncate ${isMyTeam ? "text-minion-blue" : "text-black"}`}
                    >
                      {isMyTeam && (
                        <span className="animate-pulse text-minion-blue shrink-0">
                          ▶
                        </span>
                      )}
                      {team.name}
                    </h3>
                    {canEditTeam(team.id) && (
                      <button
                        onClick={() => startEdit(team)}
                        className="shrink-0 text-gray-400 hover:text-minion-blue transition-colors text-fluid-xs font-heading"
                        aria-label="팀 이름 수정"
                        title="팀 이름 수정"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                )}
                <span className="text-fluid-sm font-black tabular-nums shrink-0">
                  {team.point_balance.toLocaleString()}{" "}
                  <span className="text-fluid-xs">P</span>
                </span>
              </div>

              {/* Point Gauge Bar */}
              <div className="w-full h-3 bg-gray-100 border-2 border-black overflow-hidden relative">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(black_1px,transparent_1px)] bg-[size:4px_4px] z-10 pointer-events-none" />
                <div
                  className={`h-full transition-all duration-[2000ms] ease-out ${gaugeColor}`}
                  style={{ width: `${pointRatio}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {/* Sold Players */}
              {rosterPlayers.map((p, index) => (
                <div
                  key={"id" in p ? p.id : `captain-${team.id}-${index}`}
                  className="flex justify-between items-center bg-gray-50 border-2 border-black p-2 min-h-[44px] shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:translate-x-1 transition-transform group"
                >
                  <div className="flex flex-col">
                    <span className="font-black text-fluid-xs text-gray-900 leading-none">
                      {p.name}
                    </span>
                    <span
                      className={`text-fluid-xs font-heading mt-1 ${TIER_COLOR[p.tier] ?? "text-gray-500"}`}
                    >
                      {p.sold_price == null
                        ? `팀장${p.main_position ? ` · ${p.main_position}` : ""}`
                        : p.tier}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    {p.sold_price != null ? (
                      <span className="text-fluid-xs font-black text-minion-blue bg-minion-yellow px-2 py-0.5 border-2 border-black shadow-[1px_1px_0px_rgba(0,0,0,1)] group-hover:scale-110 transition-transform">
                        {p.sold_price} P
                      </span>
                    ) : (
                      <span className="text-fluid-xs font-black text-gray-500 bg-white px-2 py-0.5 border-2 border-black shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                        팀장
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty Slots */}
              {Array.from({ length: totalSlots - rosterPlayers.length }).map(
                (_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="border-2 border-black border-dashed p-3 min-h-[44px] flex items-center justify-center bg-gray-50/30 opacity-40"
                  >
                    <span className="text-fluid-xs font-heading text-gray-400 uppercase tracking-widest">
                      빈 자리
                    </span>
                  </div>
                ),
              )}
            </div>

            {isTeamComplete && (
              <div className="absolute top-2 -right-10 bg-minion-red text-white text-fluid-xs font-heading px-12 py-1.5 rotate-[35deg] border-2 border-black shadow-lg z-20">
                완료
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
