"use client";

import { Team } from "@/features/auction/store/useAuctionStore";

interface BidStatusProps {
  highestBid: number;
  leadingTeam: Team | null | undefined;
  teamId: string | null;
}

export function BidStatus({ highestBid, leadingTeam, teamId }: BidStatusProps) {
  const isLeadingMe = leadingTeam?.id === teamId && teamId;

  return (
    <div
      className={`pixel-box p-3 transition-all duration-300 ${
        highestBid > 0 
          ? isLeadingMe 
            ? "bg-minion-yellow/20 border-minion-yellow shadow-[0_0_20px_rgba(251,224,66,0.3)]" 
            : "bg-white" 
          : "bg-gray-50 opacity-60"
      }`}
    >
      {highestBid > 0 ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black flex items-center justify-center pixel-box border-2 shadow-none">
              <span className="text-xl animate-bounce">💰</span>
            </div>
            <div>
              <p className="text-fluid-xs font-heading text-gray-400 uppercase tracking-tighter mb-1">
                현재 입찰가
              </p>
              <p className="text-fluid-lg font-black text-minion-blue leading-none tabular-nums">
                {highestBid.toLocaleString()} <span className="text-sm">P</span>
              </p>
            </div>
          </div>

          <div className="text-right flex flex-col items-end gap-1">
            <p className="text-fluid-xs font-heading text-gray-400 uppercase tracking-tighter">
              최고 입찰 팀
            </p>
            <div className="flex flex-col items-end">
              <p className={`text-fluid-sm font-black leading-none mb-1 ${isLeadingMe ? "text-black" : "text-gray-800"}`}>
                {leadingTeam?.name || "?"}
              </p>
              {teamId === null ? (
                <div className="bg-black text-minion-yellow px-2 py-1 text-fluid-xs font-heading animate-pulse flex items-center gap-1 border border-minion-yellow shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  👑 입찰 중
                </div>
              ) : isLeadingMe ? (
                <div className="bg-black text-minion-yellow px-2 py-1 text-fluid-xs font-heading animate-pulse flex items-center gap-1 border border-minion-yellow shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  👑 입찰 중
                </div>
              ) : (
                <div className="bg-gray-200 text-gray-500 px-2 py-1 text-fluid-xs font-heading border border-gray-300">
                  입찰 밀림
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-xl grayscale">💰</span>
          </div>
          <p className="text-fluid-xs font-heading text-gray-400 animate-pulse">
            첫 입찰을 기다리는 중...
          </p>
        </div>
      )}
    </div>
  );
}

