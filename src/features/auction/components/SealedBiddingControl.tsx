"use client";
// 비공개 입찰 방식에서 팀장이 본인 금액만 제출하는 컨트롤

import { useEffect, useMemo, useState } from "react";
import {
  type Player,
  type SealedBidState,
  type Team,
} from "@/features/auction/store/useAuctionStore";
import { submitSealedBid } from "@/features/auction/api/auctionActions";

interface SealedBiddingControlProps {
  roomId: string;
  teamId: string;
  leaderToken: string;
  currentPlayer: Player | null;
  myTeam: Team | null;
  isAuctionActive: boolean;
  isTeamFull: boolean;
  allDone: boolean;
  sealedBid: SealedBidState;
}

export function SealedBiddingControl({
  roomId,
  teamId,
  leaderToken,
  currentPlayer,
  myTeam,
  isAuctionActive,
  isTeamFull,
  allDone,
  sealedBid,
}: SealedBiddingControlProps) {
  const pointBalance = myTeam?.point_balance ?? 0;
  const minAmount = sealedBid.minAmount;
  const isEligible =
    !sealedBid.eligibleTeamIds || sealedBid.eligibleTeamIds.includes(teamId);
  const isRebidExcluded =
    !!sealedBid.eligibleTeamIds && !sealedBid.eligibleTeamIds.includes(teamId);
  const canSubmit =
    !!currentPlayer &&
    isAuctionActive &&
    sealedBid.phase === "ACTIVE" &&
    isEligible &&
    !isTeamFull &&
    !allDone;
  const defaultAmount = useMemo(
    () => Math.min(pointBalance, minAmount > 0 ? minAmount : 0),
    [minAmount, pointBalance],
  );
  const [amount, setAmount] = useState<number | string>(defaultAmount);
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setAmount(defaultAmount);
      setSubmittedAmount(null);
      setError(null);
    });
  }, [currentPlayer?.id, sealedBid.roundId, defaultAmount]);

  const submit = async (nextAmount: number) => {
    if (!currentPlayer || !canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const normalizedAmount = Math.max(0, Math.min(pointBalance, nextAmount));
      const result = await submitSealedBid(
        roomId,
        currentPlayer.id,
        teamId,
        normalizedAmount,
        leaderToken,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmittedAmount(result.submittedAmount ?? normalizedAmount);
    } finally {
      setIsSubmitting(false);
    }
  };

  const numericAmount =
    typeof amount === "string" ? parseInt(amount, 10) || 0 : amount;
  const clampedBidAmount = Math.max(
    minAmount,
    Math.min(pointBalance, numericAmount),
  );
  const canBidAmount = canSubmit && pointBalance >= minAmount;
  const inactiveMessage = !currentPlayer
    ? "다음 선수를 기다리는 중..."
    : isTeamFull
      ? "팀 정원이 가득 찼습니다"
      : !isEligible
        ? "재입찰 대상이 아닙니다"
        : sealedBid.phase === "LOCKED" || sealedBid.phase === "REVEALING"
          ? "입찰이 마감되었습니다"
          : "비공개 입찰 대기중...";

  if (isRebidExcluded) {
    return (
      <div className="pixel-box bg-white p-5 shrink-0 relative z-20 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <div className="bg-black text-white px-4 py-2 mb-0 flex justify-between items-center border-b-4 border-black -mx-5 -mt-5">
          <span className="text-fluid-xs font-heading uppercase tracking-tighter">
            CONTROL PANEL
          </span>
        </div>
        <div className="h-14 flex items-center justify-center">
          <span className="text-fluid-xs font-heading text-gray-500 uppercase">
            다음 선수 추첨을 기다리는 중...
          </span>
        </div>
      </div>
    );
  }

  if (!canSubmit) {
    return (
      <div className="pixel-box bg-white p-5 shrink-0 relative z-20 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <div className="bg-black text-white px-4 py-2 mb-0 flex justify-between items-center border-b-4 border-black -mx-5 -mt-5">
          <span className="text-fluid-xs font-heading uppercase tracking-tighter">
            CONTROL PANEL
          </span>
          <span className="text-fluid-xs font-bold text-minion-yellow">
            보유 {pointBalance.toLocaleString()}P
          </span>
        </div>
        <div className="h-14 flex items-center justify-center">
          <span className="text-fluid-xs font-heading text-gray-500 uppercase">
            {inactiveMessage}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pixel-box bg-white p-5 shrink-0 relative z-20 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="bg-black text-white px-4 py-2 mb-4 flex justify-between items-center border-b-4 border-black -mx-5 -mt-5">
        <span className="text-fluid-xs font-heading uppercase tracking-tighter">
          CONTROL PANEL
        </span>
        <span className="text-fluid-xs font-bold text-minion-yellow">
          보유 {pointBalance.toLocaleString()}P
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-fluid-xs font-heading text-gray-400 uppercase">
            최소 금액
          </p>
          <p className="text-fluid-lg font-black text-minion-red tabular-nums">
            {minAmount.toLocaleString()}P
          </p>
        </div>
        <div className="text-right">
          <p className="text-fluid-xs font-heading text-gray-400 uppercase">
            제출 상태
          </p>
          <p className="text-fluid-sm font-black text-black">
            {submittedAmount === null
              ? "미제출"
              : submittedAmount <= 0
                ? "입찰 포기"
                : `${submittedAmount.toLocaleString()}P`}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-minion-red/10 border-4 border-minion-red px-4 py-2 text-center text-fluid-xs font-bold text-minion-red">
          {error}
        </div>
      )}

      <div className="flex gap-3 h-14 relative">
        <input
          type="number"
          value={amount}
          min={minAmount}
          max={pointBalance}
          step={1}
          onChange={(event) =>
            setAmount(
              event.target.value === "" ? "" : parseInt(event.target.value, 10),
            )
          }
          onFocus={(event) => event.target.select()}
          disabled={!canSubmit || !canBidAmount}
          className="min-w-0 flex-1 h-full bg-yellow-50/30 border-4 border-black px-4 text-fluid-base font-black text-center focus:bg-white focus:outline-none tabular-nums"
        />
        <button
          type="button"
          onClick={() => void submit(0)}
          disabled={!canSubmit || isSubmitting}
          className="pixel-button bg-white text-black h-full px-4 text-fluid-xs font-heading"
        >
          포기
        </button>
        <button
          type="button"
          onClick={() => void submit(clampedBidAmount)}
          disabled={!canSubmit || !canBidAmount || isSubmitting}
          className="pixel-button bg-minion-blue text-white h-full px-6 text-fluid-xs font-heading"
        >
          {isSubmitting ? "제출 중..." : "제출"}
        </button>
      </div>
    </div>
  );
}
