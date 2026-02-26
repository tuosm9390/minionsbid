"use client";

import { useState, useEffect, useRef } from "react";
import {
  useAuctionStore,
  Player,
  Team,
} from "@/features/auction/store/useAuctionStore";
import { placeBid } from "@/features/auction/api/auctionActions";

interface BiddingControlProps {
  roomId: string;
  teamId: string;
  currentPlayer: Player | null;
  myTeam: Team | null;
  isAuctionActive: boolean;
  timerEndsAt: string | null;
  minBid: number;
  isTeamFull: boolean;
}

export function BiddingControl({
  roomId,
  teamId,
  currentPlayer,
  myTeam,
  isAuctionActive,
  timerEndsAt,
  minBid,
  isTeamFull,
}: BiddingControlProps) {
  const [bidAmount, setBidAmount] = useState<number | string>(minBid);
  const [isBidding, setIsBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  const bids = useAuctionStore((s) => s.bids);
  const playerBids = bids.filter((b) => b.player_id === currentPlayer?.id);
  const highestBid =
    playerBids.length > 0 ? Math.max(...playerBids.map((b) => b.amount)) : 0;
  const topBid = playerBids.find((b) => b.amount === highestBid);
  const isLeading = topBid?.team_id === teamId;

  useEffect(() => {
    setBidAmount((prev) => {
      const val = typeof prev === "string" ? parseInt(prev) || 0 : prev;
      return Math.max(val, minBid);
    });
  }, [minBid]);

  useEffect(() => {
    setBidAmount(minBid);
    setBidError(null);
  }, [currentPlayer?.id, minBid]);

  const handleBid = async () => {
    if (!currentPlayer || !roomId || !teamId) return;
    const numericAmount =
      typeof bidAmount === "string" ? parseInt(bidAmount) || 0 : bidAmount;
    const finalAmount = Math.max(numericAmount, minBid);
    setBidError(null);
    setIsBidding(true);
    try {
      const res = await placeBid(roomId, currentPlayer.id, teamId, finalAmount);
      if (res.error) setBidError(res.error);
      else setBidAmount(finalAmount + 10);
    } finally {
      setIsBidding(false);
    }
  };

  const numericBidAmount =
    typeof bidAmount === "string" ? parseInt(bidAmount) || 0 : bidAmount;
  const canBid =
    isAuctionActive &&
    !isBidding &&
    !!currentPlayer &&
    !isLeading &&
    !isTeamFull;

  return (
    <div className="bg-card rounded-[2rem] shadow-xl border-[3px] border-border p-5 lg:p-7 shrink-0 mt-auto">
      <div className="flex items-center justify-between mb-4 lg:mb-5 px-1 lg:px-2">
        <h3 className="text-sm lg:text-base font-black text-minion-blue uppercase tracking-widest flex items-center gap-2">
          <span className="text-xl lg:text-2xl">🔨</span> 팀장 컨트롤 박스
        </h3>
        <div className="flex gap-4 lg:gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[9px] lg:text-[10px] font-black text-gray-400 uppercase tracking-tighter">
              남은 포인트
            </span>
            <span className="text-xl lg:text-2xl font-black text-minion-blue tabular-nums leading-none">
              {myTeam?.point_balance?.toLocaleString() ?? 0}P
            </span>
          </div>
          {currentPlayer && (
            <div className="flex flex-col items-end">
              <span className="text-[9px] lg:text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                최소 입찰가
              </span>
              <span className="text-xl lg:text-2xl font-black text-red-500 tabular-nums leading-none">
                {minBid.toLocaleString()}P
              </span>
            </div>
          )}
        </div>
      </div>

      {bidError && (
        <div className="mb-4 bg-red-50 border-2 border-red-100 text-red-600 text-[13px] py-2.5 px-4 rounded-2xl font-black text-center animate-pulse">
          {bidError}
        </div>
      )}

      <div className="flex gap-2 lg:gap-4 relative h-12 md:h-14 lg:h-16">
        {!isAuctionActive && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-[1.5rem] border-2 border-dashed border-gray-200 shadow-inner">
            <p className="text-sm lg:text-base text-gray-500 font-black flex items-center gap-2 lg:gap-3">
              <span className="text-xl lg:text-2xl animate-bounce">⏱️</span>
              {!currentPlayer
                ? "선수가 추첨되면 입찰 창이 활성화됩니다."
                : !timerEndsAt
                  ? "주최자가 경매를 시작하면 입찰할 수 있습니다."
                  : "경매 시간이 종료되었습니다."}
            </p>
          </div>
        )}

        <button
          onClick={() =>
            setBidAmount((v) =>
              Math.max(
                minBid,
                (typeof v === "string" ? parseInt(v) || 0 : v) - 10,
              ),
            )
          }
          disabled={!canBid || numericBidAmount <= minBid}
          className="bg-white hover:bg-gray-50 text-gray-700 w-12 lg:w-16 h-full rounded-2xl font-black text-2xl lg:text-3xl border-2 border-gray-100 transition-all active:scale-90 disabled:opacity-20 shadow-sm"
        >
          －
        </button>

        <div className="relative flex-1 group">
          <input
            type="number"
            value={bidAmount}
            min={minBid}
            step={10}
            onChange={(e) => setBidAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
            disabled={!canBid}
            className="w-full h-full bg-white border-[3px] lg:border-[4px] border-gray-100 focus:border-minion-blue rounded-2xl px-3 sm:px-4 lg:px-6 text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-center focus:outline-none transition-all disabled:opacity-50 shadow-inner tabular-nums"
          />
          <div className="absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 text-gray-300 font-black text-lg lg:text-xl pointer-events-none group-focus-within:text-minion-blue transition-colors">
            P
          </div>
        </div>

        <button
          onClick={() =>
            setBidAmount(
              (v) => (typeof v === "string" ? parseInt(v) || 0 : v) + 10,
            )
          }
          disabled={!canBid}
          className="bg-white hover:bg-gray-50 text-gray-700 w-12 lg:w-16 h-full rounded-2xl font-black text-2xl lg:text-3xl border-2 border-gray-100 transition-all active:scale-90 disabled:opacity-20 shadow-sm"
        >
          ＋
        </button>

        <button
          onClick={handleBid}
          disabled={!canBid}
          className={`flex-[1.3] h-full rounded-2xl font-black text-sm md:text-lg lg:text-xl tracking-tighter transition-all active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_6px_0_rgba(0,0,0,0.1)] ${
            isLeading
              ? "bg-minion-yellow text-minion-blue border-2 border-amber-300 shadow-[0_6px_0_#D9B310]"
              : "bg-red-500 hover:bg-red-600 text-white shadow-[0_6px_0_#991B1B]"
          }`}
        >
          {isLeading
            ? "낙찰 유력 후보! 👑"
            : isBidding
              ? "입찰 중..."
              : isTeamFull
                ? "🚫 정원 초과"
                : "입찰 하기 🔥"}
        </button>
      </div>

      {isTeamFull && (
        <p className="text-xs text-red-500 mt-4 text-center font-black animate-pulse">
          ※ 현재 팀의 모든 자리가 가득 찼습니다.
        </p>
      )}
    </div>
  );
}
