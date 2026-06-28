"use client";
// 비공개 입찰 카드 공개 상태를 표시하는 중앙 보드

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
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
import {
  getPositionImage,
  getTierImage,
} from "@/features/auction/utils/display";
import { cn } from "@/lib/utils";

interface SealedBidBoardProps {
  roomId: string;
  role: Role;
  currentPlayer: Player;
  teams: Team[];
  timerEndsAt: string | null;
  sealedBid: SealedBidState;
  onTimerExpire?: () => void;
}

const sealedPhaseVariants: Variants = {
  initial: { x: -18, opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    x: 18,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeOut" },
  },
};

const reducedSealedPhaseVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

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
      <div className="sealed-bid-card-bounce absolute inset-0 [transform-style:preserve-3d]">
        <div className="sealed-bid-card-back absolute inset-0 flex items-center justify-center overflow-hidden border-4 border-minion-blue bg-white text-minion-blue [backface-visibility:hidden]">
          <span className="sealed-bid-card-mark relative font-heading text-[2.6rem] leading-none md:text-[3rem]">
            ?
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
  const shouldReduceMotion = useReducedMotion();
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
        setRevealedCount((count) => Math.min(visibleCards.length, count + 1));
      },
      revealedCount === 0 ? 250 : 650,
    );
    return () => window.clearTimeout(timeoutId);
  }, [revealedCount, sealedBid.phase, visibleCards.length]);

  const showCards =
    sealedBid.phase === "LOCKED" || sealedBid.phase === "REVEALING";
  const isScoreRevealPhase = showCards;
  const revealComplete =
    sealedBid.phase === "REVEALING" &&
    visibleCards.length > 0 &&
    revealedCount >= visibleCards.length;
  const canCompleteReveal =
    role === "ORGANIZER" &&
    sealedBid.phase === "REVEALING" &&
    visibleCards.length > 0 &&
    revealComplete;
  const isRebidReady =
    sealedBid.highestAmount > 0 && sealedBid.tiedTeamIds.length > 1;
  const shouldCenterAuctionTarget =
    sealedBid.phase === null || sealedBid.phase === "ACTIVE";
  const phaseRenderKey = sealedBid.roundId ?? "READY";
  const activePhaseVariants = shouldReduceMotion
    ? reducedSealedPhaseVariants
    : sealedPhaseVariants;

  const srTier = currentPlayer.tier?.trim() || null;
  const srTierImageSrc = srTier ? getTierImage(srTier) : null;
  const mainPosition = currentPlayer.main_position?.trim() || null;
  const subPosition = currentPlayer.sub_position?.trim() || null;
  const positionText = mainPosition
    ? `${mainPosition}${subPosition ? ` / ${subPosition}` : ""}`
    : null;
  const playerComment = currentPlayer.description.trim();
  const desiredTeam = currentPlayer.desired_team?.trim() || null;

  const handleCompleteReveal = async () => {
    if (!canCompleteReveal || isCompleting) return;
    setIsCompleting(true);
    try {
      const result = await completeSealedBidReveal(
        roomId,
        organizerToken ?? "",
      );
      if (result.error) alert(result.error);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phaseRenderKey}
        variants={activePhaseVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={cn(
          "flex-1 flex flex-col gap-4",
          shouldCenterAuctionTarget && "relative",
        )}
      >
        <div
          className={cn(
            "flex justify-center",
            shouldCenterAuctionTarget && "absolute inset-x-0 top-0 z-10",
          )}
        >
          {sealedBid.phase === "ACTIVE" && timerEndsAt && (
            <CenterTimer
              timerEndsAt={timerEndsAt}
              auctionDurationMs={AUCTION_DURATION_MS}
              onExpire={onTimerExpire}
            />
          )}
        </div>

        <div
          className={cn(
            "pixel-box relative bg-yellow-50 border-black",
            shouldCenterAuctionTarget &&
              "absolute inset-x-0 top-1/2 -translate-y-1/2",
            !shouldCenterAuctionTarget && "mt-2",
            isScoreRevealPhase ? "p-3 pt-8" : "p-5 pt-10",
          )}
        >
          <p
            className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 border-4 border-black bg-yellow-50 px-4 py-2 text-center font-heading text-black shadow-pixel-sm ${
              isScoreRevealPhase ? "text-fluid-xs" : "text-fluid-sm"
            }`}
          >
            입찰 대상
          </p>
          <div
            className={`mx-auto max-w-2xl space-y-2 ${
              isScoreRevealPhase ? "mt-2" : "mt-4"
            }`}
          >
            {isScoreRevealPhase ? (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 border-2 border-black bg-white px-4 py-3 shadow-pixel-sm">
                <div
                  className="flex min-w-0 flex-col items-center justify-center border-2 border-black bg-white px-3 py-2 text-center"
                  data-testid="sealed-bid-target-identity"
                >
                  <div className="flex w-full items-start justify-center gap-3">
                    {srTier && srTierImageSrc && (
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <Image
                          src={srTierImageSrc}
                          alt={srTier}
                          width={200}
                          height={200}
                          className="h-auto w-full max-w-14 pixelated"
                        />
                        <span className="w-full truncate whitespace-nowrap text-fluid-xs font-bold text-gray-600">
                          {srTier}
                        </span>
                      </div>
                    )}
                    {mainPosition && (
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <Image
                          src={getPositionImage(mainPosition)}
                          alt={mainPosition}
                          width={200}
                          height={200}
                          className="h-auto w-full max-w-14"
                        />
                        <span className="w-full truncate whitespace-nowrap text-fluid-xs font-bold text-gray-600">
                          {positionText}
                        </span>
                      </div>
                    )}
                  </div>
                  <h2 className="mt-2 max-w-full break-all text-fluid-base font-black leading-tight text-black">
                    {currentPlayer.name}
                  </h2>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {desiredTeam && (
                    <div className="min-w-0 border-2 border-black bg-[#fff7cc] px-3 py-2 shadow-pixel-sm">
                      <p className="text-[10px] font-black uppercase text-gray-500">
                        희망 팀
                      </p>
                      <p className="mt-1 truncate text-fluid-xs font-black text-black">
                        {desiredTeam}
                      </p>
                    </div>
                  )}
                  {playerComment && (
                    <div className="min-w-0 flex-1 border-2 border-black bg-white px-3 py-2 shadow-pixel-sm">
                      <p className="text-[10px] font-black uppercase text-gray-500">
                        한마디
                      </p>
                      <p className="mt-1 line-clamp-2 text-fluid-xs font-black leading-snug text-black break-words [overflow-wrap:anywhere]">
                        &ldquo;{playerComment}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="border-2 border-black bg-white px-5 py-5 text-center shadow-pixel-sm">
                  {(srTier || mainPosition) && (
                    <div className="mb-4 flex justify-center gap-6">
                      {srTier && srTierImageSrc && (
                        <div className="flex w-[30%] flex-col items-center gap-2">
                          <Image
                            src={srTierImageSrc}
                            alt={srTier}
                            width={200}
                            height={200}
                            className="h-auto w-full pixelated"
                          />
                          <span className="w-full truncate whitespace-nowrap text-fluid-base font-bold text-gray-600">
                            {srTier}
                          </span>
                        </div>
                      )}
                      {mainPosition && (
                        <div className="flex w-[30%] flex-col items-center gap-2">
                          <Image
                            src={getPositionImage(mainPosition)}
                            alt={mainPosition}
                            width={200}
                            height={200}
                            className="h-auto w-full"
                          />
                          <span className="w-full truncate whitespace-nowrap text-fluid-base font-bold text-gray-600">
                            {positionText}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <h2 className="break-all text-fluid-lg font-black leading-tight text-black">
                    {currentPlayer.name}
                  </h2>
                </div>
                {desiredTeam && (
                  <div className="border-2 border-black bg-[#fff7cc] px-5 py-4 shadow-pixel-sm">
                    <p className="text-xs font-black uppercase text-gray-500">
                      희망 팀
                    </p>
                    <p className="mt-2 text-fluid-sm font-black leading-snug text-black break-words [overflow-wrap:anywhere]">
                      {desiredTeam}
                    </p>
                  </div>
                )}
                {playerComment && (
                  <div className="border-2 border-black bg-white px-5 py-4 shadow-pixel-sm">
                    <p className="text-xs font-black uppercase text-gray-500">
                      한마디
                    </p>
                    <p className="mt-2 text-fluid-sm font-black leading-snug text-black break-words [overflow-wrap:anywhere]">
                      &ldquo;{playerComment}&rdquo;
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          {sealedBid.minAmount > 0 && (
            <p className="mt-3 text-center text-fluid-xs font-bold text-minion-red">
              재입찰 최소 금액 {sealedBid.minAmount.toLocaleString()}P
            </p>
          )}
        </div>

        {showCards && (
          <div
            className={cn(
              "pixel-box relative bg-white p-4 pt-14 [border-color:var(--color-minion-blue)]",
              shouldCenterAuctionTarget
                ? "absolute inset-x-0 bottom-0 z-10"
                : "mt-8",
            )}
          >
            <p className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 border-4 border-minion-blue bg-white px-4 py-2 text-center text-fluid-sm font-heading text-minion-blue shadow-pixel-sm">
              입찰가격공개
            </p>
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
              {isCompleting
                ? isRebidReady
                  ? "재입찰 준비 중..."
                  : "반영 중..."
                : isRebidReady
                  ? "재입찰 준비"
                  : "낙찰 결과 반영"}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
