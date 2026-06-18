"use client";
// 비공개 입찰 카드 공개 상태를 표시하는 중앙 보드

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  useAuctionStore,
  type Player,
  type Role,
  type SealedBidRevealCard,
  type SealedBidState,
  type Team,
} from "@/features/auction/store/useAuctionStore";
import { completeSealedBidReveal } from "@/features/auction/api/auctionActions";
import { CenterTimer } from "@/features/auction/components/board/CenterTimer";
import { AUCTION_DURATION_MS } from "@/features/auction/constants/auctionTimings";
import { getExactTierImage, getPositionImage } from "@/features/auction/utils/display";

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
  revealComplete,
}: {
  card: SealedBidRevealCard;
  revealed: boolean;
  revealComplete: boolean;
}) {
  const showResultState = revealComplete;
  const isHighest = showResultState && card.is_highest && !card.is_pass;
  const isTied = showResultState && card.is_tied && !card.is_pass;
  const isPass = showResultState && card.is_pass;
  const isIneligible = showResultState && !card.eligible;
  const frontTone = isIneligible
    ? "border-gray-500 bg-gray-100 text-gray-500 shadow-[4px_4px_0px_rgba(0,0,0,0.45)]"
    : isPass
      ? "border-gray-500 bg-gray-50 text-gray-500 shadow-[4px_4px_0px_rgba(0,0,0,0.45)]"
      : isHighest
        ? "border-minion-yellow bg-yellow-50/80 text-black shadow-[4px_4px_0px_rgba(0,0,0,1)]"
        : isTied
          ? "border-minion-blue bg-blue-50 text-black shadow-[4px_4px_0px_rgba(0,0,0,1)]"
          : "border-black bg-white text-black shadow-[4px_4px_0px_rgba(0,0,0,1)]";
  const pointTextClass = isHighest
    ? "text-[#2f2600]"
    : isTied
      ? "text-minion-blue"
      : card.is_pass
        ? "text-gray-500"
        : "text-black";

  return (
    <motion.div
      animate={{ rotateY: revealed ? 180 : 0 }}
      transition={{ duration: 0.45 }}
      className="relative h-20 [transform-style:preserve-3d]"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden border-4 border-minion-yellow bg-black text-minion-yellow shadow-[4px_4px_0px_rgba(0,0,0,1)] [backface-visibility:hidden]">
        <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,#ffd60a_8px,#ffd60a_10px)]" />
        <div className="relative flex h-11 w-11 items-center justify-center border-4 border-minion-yellow bg-black shadow-pixel-sm">
          <span className="text-fluid-xs font-heading">?</span>
        </div>
        <span className="relative text-fluid-xs font-heading uppercase tracking-widest">
          SEALED BID
        </span>
      </div>
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center border-4 p-4 text-center [backface-visibility:hidden] [transform:rotateY(180deg)] transition-colors duration-300 ${frontTone}`}
      >
        <p className="mb-2 max-w-full truncate text-fluid-xs font-black text-gray-500">
          {card.team_name}
        </p>
        <p
          className={`font-black leading-none tabular-nums ${
            card.is_pass ? "text-fluid-sm" : "text-fluid-md"
          } ${pointTextClass}`}
        >
          {card.is_pass ? "입찰 포기" : `${card.amount.toLocaleString()}P`}
        </p>
        {isTied && (
          <p className="mt-1 text-fluid-md font-black text-minion-blue">
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
  const [isCompleting, setIsCompleting] = useState(false);
  const organizerToken = useAuctionStore((s) => s.organizerToken);
  const cards = sealedBid.revealResult;
  const revealKey = `${sealedBid.roundId ?? "none"}:${cards.length}`;
  const visibleTeamIds = sealedBid.eligibleTeamIds
    ? new Set(sealedBid.eligibleTeamIds)
    : null;
  const visibleCards = visibleTeamIds
    ? cards.filter((card) => visibleTeamIds.has(card.team_id))
    : cards;
  const visiblePlaceholderTeams = visibleTeamIds
    ? teams.filter((team) => visibleTeamIds.has(team.id))
    : teams;

  useEffect(() => {
    setRevealedCount(0);
  }, [revealKey]);

  useEffect(() => {
    if (sealedBid.phase !== "REVEALING" || visibleCards.length === 0) return;
    if (revealedCount >= visibleCards.length) return;
    const timeoutId = window.setTimeout(
      () => {
        setRevealedCount((count) =>
          Math.min(visibleCards.length, count + 1),
        );
      },
      revealedCount === 0 ? 250 : 650,
    );
    return () => window.clearTimeout(timeoutId);
  }, [revealedCount, sealedBid.phase, visibleCards.length]);

  const showCards =
    sealedBid.phase === "LOCKED" || sealedBid.phase === "REVEALING";
  const revealComplete =
    sealedBid.phase === "REVEALING" &&
    visibleCards.length > 0 &&
    revealedCount >= visibleCards.length;
  const canCompleteReveal =
    role === "ORGANIZER" &&
    sealedBid.phase === "REVEALING" &&
    visibleCards.length > 0 &&
    revealComplete;

  const srTier = currentPlayer.tier ?? null;
  const srTierImageSrc = srTier ? getExactTierImage(srTier) : null;
  const mainPosition = currentPlayer.main_position?.trim() || null;
  const subPosition = currentPlayer.sub_position?.trim() || null;
  const playerComment = currentPlayer.description.trim();

  const handleCompleteReveal = async () => {
    if (!canCompleteReveal || isCompleting) return;
    setIsCompleting(true);
    try {
      const result = await completeSealedBidReveal(roomId, organizerToken ?? "");
      if (result.error) alert(result.error);
    } finally {
      setIsCompleting(false);
    }
  };

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

      <div className="pixel-box bg-yellow-50 border-black p-5">
        <p className="text-fluid-sm font-heading text-gray-500 uppercase text-center">
          입찰 대상
        </p>
        <div className="mx-auto mt-4 max-w-2xl space-y-2">
          <div className="border-2 border-black bg-white px-5 py-4 shadow-pixel-sm">
            <p className="text-xs font-black uppercase text-gray-500">닉네임</p>
            <h2 className="mt-1 text-fluid-lg font-black leading-tight text-black break-all">
              {currentPlayer.name}
            </h2>
            {(srTier || mainPosition) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
                {srTier && srTierImageSrc && (
                  <div className="flex items-center gap-2">
                    <Image
                      src={srTierImageSrc}
                      alt={srTier}
                      width={44}
                      height={44}
                      className="shrink-0 pixelated"
                    />
                    <span className="text-fluid-base font-bold text-gray-600">{srTier}</span>
                  </div>
                )}
                {mainPosition && (
                  <div className="flex items-center gap-2">
                    <Image
                      src={getPositionImage(mainPosition)}
                      alt={mainPosition}
                      width={36}
                      height={36}
                      className="shrink-0"
                    />
                    <span className="text-fluid-base font-bold text-gray-600">
                      {mainPosition}
                      {subPosition ? ` / ${subPosition}` : ""}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {playerComment && (
            <div className="border-2 border-black bg-white px-5 py-4 shadow-pixel-sm">
              <p className="text-xs font-black uppercase text-gray-500">한마디</p>
              <p className="mt-2 text-fluid-sm font-black leading-snug text-black break-words [overflow-wrap:anywhere]">
                &ldquo;{playerComment}&rdquo;
              </p>
            </div>
          )}
        </div>
        {sealedBid.minAmount > 0 && (
          <p className="mt-3 text-center text-fluid-xs font-bold text-minion-red">
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
          {(visibleCards.length > 0
            ? visibleCards
            : visiblePlaceholderTeams.map((team) => ({
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
              revealComplete={revealComplete}
            />
          ))}
        </div>
      )}

      {canCompleteReveal && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void handleCompleteReveal()}
            disabled={isCompleting}
            className="pixel-button bg-minion-yellow text-black h-14 px-10 text-fluid-xs font-heading uppercase tracking-tighter hover:bg-minion-yellow-hover"
          >
            {isCompleting ? "반영 중..." : "낙찰 결과 반영"}
          </button>
        </div>
      )}
    </div>
  );
}
