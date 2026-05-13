"use client";
// 비공개 입찰 카드 공개 상태를 표시하는 중앙 보드

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  type Player,
  type Role,
  type SealedBidRevealCard,
  type SealedBidState,
  type Team,
} from "@/features/auction/store/useAuctionStore";
import { completeSealedBidReveal } from "@/features/auction/api/auctionActions";
import { CenterTimer } from "@/features/auction/components/board/CenterTimer";
import { AUCTION_DURATION_MS } from "@/features/auction/constants/auctionTimings";

interface SealedBidBoardProps {
  roomId: string;
  role: Role;
  currentPlayer: Player;
  teams: Team[];
  timerEndsAt: string | null;
  sealedBid: SealedBidState;
  onTimerExpire?: () => void;
}

function SealedCard({
  card,
  revealed,
}: {
  card: SealedBidRevealCard;
  revealed: boolean;
}) {
  return (
    <motion.div
      animate={{ rotateY: revealed ? 180 : 0 }}
      transition={{ duration: 0.45 }}
      className="relative h-28 [transform-style:preserve-3d]"
    >
      <div className="absolute inset-0 pixel-box bg-black text-minion-yellow border-minion-yellow flex items-center justify-center [backface-visibility:hidden]">
        <span className="text-fluid-xs font-heading uppercase">SEALED</span>
      </div>
      <div className="absolute inset-0 pixel-box bg-white border-black p-3 flex flex-col items-center justify-center text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
        <p className="text-fluid-xs font-black text-gray-500 truncate max-w-full">
          {card.team_name}
        </p>
        <p
          className={`mt-2 text-fluid-base font-black tabular-nums ${
            card.is_highest ? "text-minion-red" : "text-black"
          }`}
        >
          {card.is_pass ? "입찰 포기" : `${card.amount.toLocaleString()}P`}
        </p>
        {card.is_tied && (
          <p className="mt-1 text-[10px] font-black text-minion-blue">
            재입찰 대상
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function SealedBidBoard({
  roomId,
  role,
  currentPlayer,
  teams,
  timerEndsAt,
  sealedBid,
  onTimerExpire,
}: SealedBidBoardProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const completionKeyRef = useRef<string | null>(null);
  const cards = sealedBid.revealResult;
  const revealKey = `${sealedBid.roundId ?? "none"}:${cards.length}`;

  useEffect(() => {
    setRevealedCount(0);
  }, [revealKey]);

  useEffect(() => {
    if (sealedBid.phase !== "REVEALING" || cards.length === 0) return;
    if (revealedCount >= cards.length) return;
    const timeoutId = window.setTimeout(
      () => {
        setRevealedCount((count) => Math.min(cards.length, count + 1));
      },
      revealedCount === 0 ? 250 : 650,
    );
    return () => window.clearTimeout(timeoutId);
  }, [cards.length, revealedCount, sealedBid.phase]);

  useEffect(() => {
    if (
      role !== "ORGANIZER" ||
      sealedBid.phase !== "REVEALING" ||
      cards.length === 0 ||
      revealedCount < cards.length
    ) {
      return;
    }
    const completionKey = `${sealedBid.roundId}:${cards.length}:complete`;
    if (completionKeyRef.current === completionKey) return;
    completionKeyRef.current = completionKey;
    const timeoutId = window.setTimeout(() => {
      void completeSealedBidReveal(roomId);
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [
    cards.length,
    revealedCount,
    role,
    roomId,
    sealedBid.phase,
    sealedBid.roundId,
  ]);

  const showCards =
    sealedBid.phase === "LOCKED" || sealedBid.phase === "REVEALING";

  return (
    <div className="flex-1 flex flex-col gap-4">
      <div className="flex justify-center">
        {sealedBid.phase === "ACTIVE" && timerEndsAt && (
          <CenterTimer
            timerEndsAt={timerEndsAt}
            auctionDurationMs={AUCTION_DURATION_MS}
            onExpire={onTimerExpire}
          />
        )}
      </div>

      <div className="pixel-box bg-yellow-50 border-black p-4 text-center">
        <p className="text-fluid-xs font-heading text-gray-500 uppercase">
          입찰 대상
        </p>
        <h2 className="mt-1 text-fluid-lg font-black text-black">
          {currentPlayer.name}
        </h2>
        {sealedBid.minAmount > 0 && (
          <p className="mt-2 text-fluid-xs font-bold text-minion-red">
            재입찰 최소 금액 {sealedBid.minAmount.toLocaleString()}P
          </p>
        )}
      </div>

      {sealedBid.phase === "ACTIVE" && (
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-fluid-sm font-heading text-gray-500 uppercase">
            팀장들이 입찰을 제출 중입니다
          </p>
        </div>
      )}

      {showCards && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {(cards.length > 0
            ? cards
            : teams.map((team) => ({
                team_id: team.id,
                team_name: team.name,
                amount: 0,
                is_pass: true,
                is_highest: false,
                is_tied: false,
                eligible: true,
              }))
          ).map((card, index) => (
            <SealedCard
              key={card.team_id}
              card={card}
              revealed={
                sealedBid.phase === "REVEALING" && index < revealedCount
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
