"use client";

import { Team } from "@/features/auction/store/useAuctionStore";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";

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
              <PixelIcon icon={PIXEL_ICONS.SUCCESS} size={20} color="text-minion-yellow" label="입찰" />
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
                <div className="bg-black text-minion-yellow px-2 py-1 text-fluid-xs font-heading animate-pulse flex items-center gap-1.5 border border-minion-yellow shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <PixelIcon icon={PIXEL_ICONS.LEADING} size={12} color="text-minion-yellow" animation="active" />
                  입찰 중
                </div>
              ) : isLeadingMe ? (
                <div className="bg-black text-minion-yellow px-2 py-1 text-fluid-xs font-heading animate-pulse flex items-center gap-1.5 border border-minion-yellow shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <PixelIcon icon={PIXEL_ICONS.LEADING} size={12} color="text-minion-yellow" animation="active" />
                  입찰 중
                </div>
              ) : (
                <div className="pixel-box border-2 border-minion-red bg-minion-red/10 text-minion-red px-2 py-1 text-fluid-xs font-heading shadow-none">
                  OUTBID
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <div className="w-12 h-12 bg-gray-100 flex items-center justify-center pixel-box border-2 border-black/10 shadow-none">
            <PixelIcon icon={PIXEL_ICONS.WAITING} size={24} color="text-gray-300" animation="active" />
          </div>
          <p className="text-fluid-xs font-heading text-gray-400 animate-pulse uppercase tracking-tighter">
            입찰 대기 중... 선수가 경매에 올라왔습니다.
          </p>
        </div>
      )}
    </div>
  );
}
