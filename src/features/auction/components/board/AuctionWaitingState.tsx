"use client";

import { Team } from "@/features/auction/store/useAuctionStore";

interface AuctionWaitingStateProps {
  allConnected: boolean;
  teams: Team[];
  connectedLeaderIds: Set<string | null>;
}

export function AuctionWaitingState({
  allConnected,
  teams,
  connectedLeaderIds,
}: AuctionWaitingStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      {!allConnected ? (
        <div className="w-full space-y-6">
          <h2 className="text-xl font-black text-minion-blue">
            팀장 연결 대기 중...
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className={`pixel-box p-4 min-w-[120px] ${connectedLeaderIds.has(team.id) ? "bg-green-50" : "bg-gray-100 grayscale opacity-50"}`}
              >
                <div className="text-2xl mb-2">
                  {connectedLeaderIds.has(team.id) ? "✅" : "💤"}
                </div>
                <p className="font-bold text-xs truncate">
                  {team.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-700 space-y-6">
          <div className="text-6xl animate-bounce">⏳</div>
          <h3 className="text-2xl font-black text-minion-blue">
            경매 준비 완료
          </h3>
          <p className="font-bold text-gray-500">
            방장이 추첨을 시작하면 경매가 개시됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
