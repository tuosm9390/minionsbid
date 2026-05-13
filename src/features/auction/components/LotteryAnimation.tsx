"use client";

import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
// Migrated from framer‑motion to Motion One.  Instead of importing from
// `framer-motion`, we now import Motion One’s React bindings and the
// standalone animate function.  The `motion` component and
// `useReducedMotion` hook are provided by `@motionone/react`, and
// the imperative `animate` function is imported from `motion`.
import { motion, useReducedMotion } from "motion/react";
import { animate } from "motion";
import { Player } from "@/features/auction/store/useAuctionStore";
import { getTierImage, getPositionImage } from "../utils/display";
import { cn } from "@/lib/utils";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "../constants/icons";
import { CheckedBoxBlue, DiceCube } from "@/components/ui/CyberIcons";

interface LotteryAnimationProps {
  candidates: Player[];
  targetPlayer: Player;
  showEventGameInfo?: boolean;
  onFinished?: () => void;
}

const BOX_WIDTH = 180; // 상자 하나의 너비
const SELECTED_ITEM_CENTER_OFFSET = BOX_WIDTH / 2;
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === "1";
const TOTAL_BOX_COUNT = 40; // 벨트 위에 생성할 총 상자 수

export function LotteryAnimation({
  candidates,
  targetPlayer,
  showEventGameInfo = false,
  onFinished,
}: LotteryAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isSpinning, setIsSpinning] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);

  const beltRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);

  const finishHandledRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const targetPlayerId = targetPlayer.id;
  const targetPlayerComment = targetPlayer.description.trim();
  const hasEventGameInfo =
    showEventGameInfo && (targetPlayer.aram_tier || targetPlayer.tft_tier);

  // 애니메이션 설정값
  const spinDuration = E2E_AUCTION_FIXTURE
    ? 0.5
    : shouldReduceMotion
      ? 1.5
      : 4.2;
  const revealDelay = E2E_AUCTION_FIXTURE ? 100 : 800;

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  // 벨트 위에 표시될 상자들 구성
  const trackItems = useMemo(() => {
    const cand = candidates.length > 0 ? candidates : [targetPlayer];
    const items: Player[] = [];

    // 무한 루프 느낌을 위해 충분한 수의 상자 배치
    for (let i = 0; i < TOTAL_BOX_COUNT; i++) {
      const pseudoRandomIndex = (i * 17) % cand.length;
      items.push(cand[pseudoRandomIndex]);
    }

    // 마지막에서 3번째 위치에 실제 당첨 선수 배치 (중앙 정렬을 위해)
    const targetIndex = TOTAL_BOX_COUNT - 3;
    items[targetIndex] = targetPlayer;

    return { items, targetIndex };
  }, [candidates, targetPlayer]);

  useEffect(() => {
    let isMounted = true;
    finishHandledRef.current = false;
    setIsSpinning(true);
    setHasFinished(false);

    const finishLottery = () => {
      if (!isMounted || finishHandledRef.current) return;
      finishHandledRef.current = true;
      setIsSpinning(false);
      setHasFinished(true);
      onFinishedRef.current?.();
    };

    const startAnimation = async () => {
      if (!isMounted || !trackRef.current || !beltRef.current) return;

      // 1. 초기 위치 설정 (화면 오른쪽 끝에서 시작하는 느낌)
      animate(trackRef.current, { x: 0 }, { duration: 0 });

      // 2. 벨트 배경 무한 루프 애니메이션
      const beltAnimation = animate(
        beltRef.current,
        { backgroundPositionX: ["0px", "-120px"] },
        { duration: 0.8, repeat: Infinity, ease: "linear" },
      );

      // 3. 상자 트랙 이동 애니메이션 (가속 -> 감속)
      const containerInnerWidth = containerRef.current?.clientWidth || 0;
      const targetX =
        -(trackItems.targetIndex * BOX_WIDTH) +
        (containerInnerWidth / 2 - SELECTED_ITEM_CENTER_OFFSET);

      const trackAnimation = animate(
        trackRef.current,
        { x: targetX },
        {
          duration: spinDuration,
          ease: [0.15, 0, 0.15, 1], // Custom cubic-bezier for "conveyor stop" feel
        },
      );

      await trackAnimation;
      beltAnimation.stop();

      if (!isMounted) return;

      // 4. 당첨 연출
      setIsSpinning(false);
      setHasFinished(true);

      if (containerRef.current) {
        animate(
          containerRef.current,
          { scale: [1, 1.05, 1], y: [0, -10, 0] },
          { duration: 0.5 },
        );
      }

      if (shineRef.current) {
        animate(shineRef.current, { opacity: [0, 0.8, 0] }, { duration: 0.6 });
      }

      window.setTimeout(finishLottery, revealDelay);
    };

    startAnimation();

    return () => {
      isMounted = false;
    };
  }, [
    targetPlayerId,
    trackItems,
    spinDuration,
    revealDelay,
    shouldReduceMotion,
  ]);

  return (
    <div className="w-full flex flex-col items-center justify-center gap-6 py-12">
      {/* 상태 메시지 */}
      <div className="h-10 flex items-center justify-center">
        <motion.div
          key={isSpinning ? "spinning" : "finished"}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-2xl font-heading flex items-center gap-3 px-6 py-2 border-4 border-black bg-white shadow-pixel",
            isSpinning ? "text-minion-blue" : "text-minion-blue",
          )}
        >
          <PixelIcon
            icon={isSpinning ? DiceCube : CheckedBoxBlue}
            size={24}
            animation={isSpinning ? "active" : "idle"}
          />
          {isSpinning ? "선수 추첨 진행 중..." : "추첨 완료!"}
        </motion.div>
      </div>

      {/* 컨베이어 벨트 컨테이너 */}
      <div
        ref={containerRef}
        className={cn(
          "relative w-full max-w-2xl h-64 bg-minion-blue/10 border-[6px] border-black overflow-hidden shadow-pixel",
          hasFinished && "ring-8 ring-minion-yellow/30",
        )}
      >
        {/* 배경 벨트 레이어 */}
        <div
          ref={beltRef}
          className="absolute bottom-0 left-0 w-full h-12 bg-repeat-x z-10 border-t-4 border-black"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #333 0%, #333 50%, #444 50%, #444 100%)",
            backgroundSize: "60px 100%",
          }}
        />

        {/* 선택 슬롯 포인터 */}
        <div className="absolute inset-x-0 top-0 z-30 flex justify-center pointer-events-none">
          <div className="flex flex-col items-center">
            <div className="relative h-5 w-7 drop-shadow-[2px_2px_0_rgba(0,0,0,0.25)]">
              <div className="absolute inset-0 bg-black [clip-path:polygon(0_0,100%_0,50%_100%)]" />
              <div className="absolute left-1/2 top-[3px] h-3 w-5 -translate-x-1/2 bg-minion-yellow animate-pulse [clip-path:polygon(0_0,100%_0,50%_100%)]" />
            </div>
          </div>
        </div>

        {/* 상자 트랙 */}
        <div
          ref={trackRef}
          className="absolute top-8 left-0 flex items-end h-40 will-change-transform z-20"
          style={{ transform: "translateZ(0)" }}
        >
          {trackItems.items.map((p, idx) => (
            <div
              key={idx}
              className="flex-shrink-0 flex flex-col items-center justify-center gap-2"
              style={{ width: `${BOX_WIDTH}px` }}
            >
              {/* 선수 상자 디자인 */}
              <div
                className={cn(
                  "w-32 h-32 border-4 border-black bg-white relative flex flex-col items-center justify-center p-2 shadow-pixel transition-transform",
                  !isSpinning && idx === trackItems.targetIndex
                    ? "scale-110 -translate-y-4 ring-4 ring-minion-yellow"
                    : "scale-90",
                )}
              >
                <div className="relative w-16 h-16">
                  <Image
                    src={getTierImage(p.tier)}
                    alt={p.tier}
                    fill
                    className="object-contain pixelated"
                  />
                </div>
                <span className="text-xs font-pixel mt-1 bg-black text-white px-1 truncate w-full text-center">
                  {p.name}
                </span>

                {/* 상자 디테일 */}
                <div className="absolute top-1 left-1 w-2 h-2 bg-black/10" />
                <div className="absolute top-1 right-1 w-2 h-2 bg-black/10" />
              </div>

              {/* 상자 그림자 */}
              <div className="w-24 h-2 bg-black/20 rounded-full blur-sm" />
            </div>
          ))}
        </div>

        {/* 장식용 미니언 캐릭터 (좌우) */}
        {/* <div className="absolute bottom-14 left-4 z-30 pointer-events-none opacity-50">
          <PixelIcon
            icon={PIXEL_ICONS.LEADING}
            size={32}
            color="text-minion-yellow"
            animation="active"
          />
        </div> */}
        {/* <div className="absolute bottom-14 right-4 z-30 pointer-events-none opacity-50 scale-x-[-1]">
          <PixelIcon
            icon={PIXEL_ICONS.LEADING}
            size={32}
            color="text-minion-yellow"
            animation="active"
          />
        </div> */}
      </div>

      {/* 결과 상세 정보 (추첨 완료 시 하단에 표시) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={hasFinished ? { opacity: 1, y: 0 } : { opacity: 0 }}
        className="flex max-w-md flex-col gap-3 p-4 bg-white border-4 border-black shadow-pixel"
      >
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 relative border-2 border-black p-1 bg-minion-blue/5">
            <Image
              src={getTierImage(targetPlayer.tier)}
              alt={targetPlayer.tier}
              fill
              className="object-contain pixelated"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-heading text-black">
              {targetPlayer.name}
            </span>
            <div className="flex gap-2">
              <span className="px-2 py-0.5 bg-black text-white text-xs font-pixel">
                {targetPlayer.tier}
              </span>
              <span className="px-2 py-0.5 bg-minion-blue text-white text-xs font-pixel">
                {targetPlayer.main_position}
              </span>
            </div>
          </div>
        </div>
        {targetPlayerComment && (
          <p className="border-t-2 border-black pt-3 text-sm font-bold leading-relaxed text-gray-700 break-words">
            &quot;{targetPlayerComment}&quot;
          </p>
        )}
        {hasEventGameInfo && (
          <div className="grid gap-2 border-t-2 border-black pt-3 text-sm font-bold text-gray-700">
            {targetPlayer.aram_tier && (
              <div className="flex items-center justify-between gap-4">
                <span>무작위 총력전</span>
                <span className="text-right text-black">{targetPlayer.aram_tier}</span>
              </div>
            )}
            {targetPlayer.tft_tier && (
              <div className="flex items-center justify-between gap-4">
                <span>전략적 팀 전투</span>
                <span className="text-right text-black">{targetPlayer.tft_tier}</span>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 전체 화면 샤인 효과 */}
      <div
        ref={shineRef}
        className="fixed inset-0 pointer-events-none z-50 bg-white opacity-0"
      />
    </div>
  );
}
