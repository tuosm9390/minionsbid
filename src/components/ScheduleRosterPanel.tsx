"use client";

import { Trophy } from "lucide-react";
import type {
  LeagueMatchWinner,
  LeagueRosterTeam,
} from "@/features/schedules/types";

function RosterCard({
  team,
  isWinner = false,
}: {
  team: LeagueRosterTeam;
  isWinner?: boolean;
}) {
  return (
    <div className="border-4 border-black bg-white p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="text-fluid-lg font-black">{team.name}</p>
          <p className="text-fluid-xs font-bold text-gray-500 mt-1">
            팀장: {team.leaderName || "미등록"}
          </p>
          {/* <p className="text-fluid-xs font-bold text-gray-400 mt-1">
            경매: {team.auctionName}
          </p> */}
        </div>
        <div className="flex flex-col items-end gap-2">
          {isWinner && (
            <div className="border-2 border-black bg-green-600 px-2 py-1 text-fluid-xs font-black text-white">
              WIN
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {team.players.length === 0 && (
          <div className="border-2 border-dashed border-black/40 bg-gray-50 px-3 py-4 text-center text-fluid-sm font-bold text-gray-400">
            등록된 로스터가 없습니다.
          </div>
        )}
        {team.players.map((player) => (
          <div
            key={`${team.id}-${player.name}`}
            className="flex items-center justify-between border-2 border-black bg-[#fffdf8] px-3 py-2"
          >
            <div>
              <p className="text-fluid-sm font-black">{player.name}</p>
              <p className="text-fluid-xs font-bold text-gray-500">
                {player.tier || "티어 미기입"} ·{" "}
                {player.mainPosition || "포지션 미기입"}
                {player.subPosition ? ` / ${player.subPosition}` : ""}
              </p>
            </div>
            {/* <div className="text-xs font-black text-minion-blue">
              {player.soldPrice ? `${player.soldPrice}P` : "-"}
            </div> */}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleRosterPanel({
  matches,
}: {
  matches: Array<{
    id: string;
    homeTeam: LeagueRosterTeam | null;
    awayTeam: LeagueRosterTeam | null;
    winner: LeagueMatchWinner;
  }>;
}) {
  return (
    <div className="bg-white border-4 border-black p-5 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center gap-3 mb-4">
        <Trophy size={18} className="text-minion-blue" />
        <div>
          <p className="text-fluid-xs font-black uppercase tracking-[0.18em] text-minion-blue">
            Team Rosters
          </p>
          <h3 className="text-fluid-lg font-black mt-1">경기 예정 팀 로스터</h3>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="border-2 border-dashed border-black p-8 text-center">
          <p className="text-fluid-sm font-black">표시할 로스터가 없습니다.</p>
          <p className="text-fluid-xs font-bold text-gray-500 mt-2">
            해당 날짜에 팀 이름을 입력하고 저장하면 경기 예정 팀 로스터가 아래에
            표시됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {matches.map((match, index) => (
            <div
              key={match.id || `roster-match-${index}`}
              className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] gap-4 items-start xl:items-center"
            >
              <div>
                {match.homeTeam ? (
                  <RosterCard
                    team={match.homeTeam}
                    isWinner={match.winner === "HOME"}
                  />
                ) : (
                  <div className="border-4 border-dashed border-black/40 bg-gray-50 p-8 text-center text-fluid-sm font-black text-gray-400">
                    홈팀 로스터 없음
                  </div>
                )}
              </div>

              <div className="border-4 border-black bg-black text-minion-yellow min-h-[88px] flex items-center justify-center text-xl font-black shadow-[6px_6px_0px_rgba(0,0,0,1)] self-center">
                VS
              </div>

              <div>
                {match.awayTeam ? (
                  <RosterCard
                    team={match.awayTeam}
                    isWinner={match.winner === "AWAY"}
                  />
                ) : (
                  <div className="border-4 border-dashed border-black/40 bg-gray-50 p-8 text-center text-fluid-sm font-black text-gray-400">
                    원정팀 로스터 없음
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
