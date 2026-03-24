"use client";

import {
  useAuctionStore,
  Team,
  Player,
} from "@/features/auction/store/useAuctionStore";

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
  const unsoldPlayers = players.filter((p: Player) => p.status === "UNSOLD");

  if (unsoldPlayers.length === 0)
    return (
      <div className="flex-1 flex justify-center items-center py-10 text-fluid-xs text-gray-400 font-heading italic opacity-50">
        유찰된 플레이어가 없습니다
      </div>
    );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="grid grid-cols-1 gap-2">
        {unsoldPlayers.map((p: Player) => (
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

  return (
    <div className="flex flex-col gap-6">
      {sortedTeams.map((team: Team) => {
        const teamPlayers = players.filter(
          (p) => p.team_id === team.id && p.status === "SOLD",
        );
        const isMyTeam = team.id === myTeamId;
        const totalSlots = membersPerTeam - 1;
        const isTeamComplete = teamPlayers.length === totalSlots;

        // Point ratio for gauge (relative to 1000 or max balance)
        const pointRatio = Math.min(100, (team.point_balance / 1000) * 100);

        const gaugeColor = 
          pointRatio >= 60 ? "bg-minion-blue" :
          pointRatio >= 30 ? "bg-minion-yellow" :
          "bg-minion-red animate-pulse";

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
              <div className="flex justify-between items-center">
                <h3
                  className={`font-black text-fluid-sm flex items-center gap-2 ${isMyTeam ? "text-minion-blue" : "text-black"}`}
                >
                  {isMyTeam && <span className="animate-pulse text-minion-blue">▶</span>}
                  {team.name}
                </h3>
                <span className="text-fluid-sm font-black tabular-nums">
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
              {teamPlayers.map((p: Player) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center bg-gray-50 border-2 border-black p-2 min-h-[44px] shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:translate-x-1 transition-transform group"
                >
                  <div className="flex flex-col">
                    <span className="font-black text-fluid-xs text-gray-900 leading-none">
                      {p.name}
                    </span>
                    <span
                      className={`text-fluid-xs font-heading mt-1 ${TIER_COLOR[p.tier]}`}
                    >
                      {p.tier}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-fluid-xs font-black text-minion-blue bg-minion-yellow px-2 py-0.5 border-2 border-black shadow-[1px_1px_0px_rgba(0,0,0,1)] group-hover:scale-110 transition-transform">
                      {p.sold_price} P
                    </span>
                  </div>
                </div>
              ))}

              {/* Empty Slots */}
              {Array.from({ length: totalSlots - teamPlayers.length }).map(
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
