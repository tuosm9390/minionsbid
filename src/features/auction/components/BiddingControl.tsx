"use client";

import {
  type Player,
  type Team,
} from "@/features/auction/store/useAuctionStore";
import { useBiddingControl } from "@/features/auction/hooks/useBiddingControl";

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

export function BiddingControl(props: BiddingControlProps) {
  const {
    bidAmount,
    setBidAmount,
    bidError,
    isLeading,
    numericBidAmount,
    canBid,
    waitingCount,
    soldCount,
    isBidding,
    handleBid,
    incrementBid,
    decrementBid,
  } = useBiddingControl(props);

  const {
    currentPlayer,
    isAuctionActive,
    timerEndsAt,
    minBid,
    isTeamFull,
    myTeam,
  } = props;

  const pointBalance = myTeam?.point_balance ?? 0;
  // Visual gauge: how much of the initial points (assumed 1000 for calc or relative) are left
  // If we don't have initial, we just show a vibrant bar.
  const pointRatio = Math.min(100, (pointBalance / 1000) * 100);

  return (
    <div className="pixel-box bg-white p-5 shrink-0 relative z-20 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      {/* GM Panel Style Header */}
      <div className="bg-black text-white px-4 py-2 mb-4 flex justify-between items-center border-b-4 border-black -mx-5 -mt-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-minion-red animate-pulse" />
          <span className="text-fluid-xs font-heading uppercase tracking-tighter">
            CONTROL PANEL
          </span>
        </div>
        <div className="flex gap-3">
          <span className="text-fluid-xs font-bold text-minion-yellow">
            대기: {waitingCount} 명
          </span>
          <span className="text-fluid-xs font-bold text-minion-blue">
            낙찰: {soldCount} 명
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="space-y-1">
          <span className="text-fluid-xs font-heading text-gray-400 uppercase">
            보유 포인트
          </span>
          <div className="flex flex-col">
            <span className="text-fluid-lg font-black text-black leading-none tabular-nums">
              {pointBalance.toLocaleString()}{" "}
              <span className="text-sm font-bold">P</span>
            </span>
            {/* Point Gauge */}
            <div className="w-full h-2 bg-gray-100 border-2 border-black mt-1 overflow-hidden">
              <div
                className="h-full  bg-minion-blue transition-all duration-[2000ms] ease-out"
                style={{ width: `${pointRatio}%` }}
              />
            </div>
          </div>
        </div>

        {currentPlayer && (
          <div className="space-y-1 text-right">
            <span className="text-fluid-xs font-heading text-gray-400 uppercase">
              최소 입찰가
            </span>
            <span className="text-fluid-lg font-black text-minion-red leading-none tabular-nums block">
              {minBid.toLocaleString()}{" "}
              <span className="text-sm font-bold">P</span>
            </span>
          </div>
        )}
      </div>

      {bidError && (
        <div className="mb-4 bg-minion-red/10 border-2 border-minion-red text-minion-red text-fluid-xs py-2 px-3 font-bold text-center animate-shake uppercase">
          ⚠️ {bidError}
        </div>
      )}

      <div className="flex gap-3 h-14 relative">
        {!isAuctionActive && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-30 flex items-center justify-center border-4 border-black pixel-box shadow-none transition-all">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-bounce">⏳</span>
              <p className="text-fluid-xs font-heading text-gray-500 uppercase">
                {!currentPlayer ? "다음 선수 불러오는 중..." : "대기 중"}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-1 h-full">
          <button
            onClick={decrementBid}
            disabled={!canBid || numericBidAmount <= minBid}
            className="pixel-button bg-white text-black w-14 h-full text-xl font-heading hover:bg-gray-50 active:translate-y-1 uppercase"
          >
            -
          </button>

          <div className="relative group w-32">
            <input
              type="number"
              value={bidAmount}
              min={minBid}
              step={10}
              onChange={(e) => setBidAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
              disabled={!canBid}
              className="w-full h-full bg-yellow-50/50 border-4 border-black px-4 text-fluid-base font-black text-center focus:bg-white focus:outline-none tabular-nums transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 font-black text-sm pointer-events-none group-focus-within:text-minion-blue transition-colors">
              P
            </div>
          </div>

          <button
            onClick={incrementBid}
            disabled={!canBid}
            className="pixel-button bg-white text-black w-14 h-full text-xl font-heading hover:bg-gray-50 active:translate-y-1 uppercase"
          >
            +
          </button>
        </div>

        <button
          onClick={handleBid}
          disabled={!canBid}
          className={`flex-1 h-full pixel-button font-heading text-fluid-xs px-6 uppercase tracking-tighter transition-all relative overflow-hidden group ${
            isLeading
              ? "bg-black text-minion-yellow border-minion-yellow"
              : "bg-minion-blue text-white border-black hover:bg-minion-blue-hover"
          }`}
        >
          {/* Shine effect for leading state */}
          {isLeading && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
          )}

          <span className="relative z-10">
            {isLeading
              ? "입찰 중"
              : isBidding
                ? "입찰 중..."
                : isTeamFull
                  ? "팀 가득 참"
                  : "입찰하기 🔥"}
          </span>
        </button>
      </div>

      {isTeamFull && (
        <p className="text-fluid-xs font-heading text-minion-red mt-4 text-center animate-pulse uppercase tracking-tight">
          팀이 가득 찼습니다. 더 이상 입찰할 수 없습니다.
        </p>
      )}
    </div>
  );
}
