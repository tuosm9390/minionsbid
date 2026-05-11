"use client";

import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  motion,
  useReducedMotion,
  animate,
} from "framer-motion";
import { Player } from "@/features/auction/store/useAuctionStore";
import { getTierImage, getPositionImage } from "../utils/display";
import { cn } from "@/lib/utils";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "../constants/icons";

interface LotteryAnimationProps {
  candidates: Player[];
  targetPlayer: Player;
  onFinished?: () => void;
}

const ITEM_HEIGHT = 160;
const VISIBLE_ITEMS = 24;
const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === "1";

export function LotteryAnimation({
  candidates,
  targetPlayer,
  onFinished,
}: LotteryAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isSpinning, setIsSpinning] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);
  
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  const finishHandledRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const targetPlayerId = targetPlayer.id;
  const spinItemCount = E2E_AUCTION_FIXTURE ? 2 : shouldReduceMotion ? 8 : VISIBLE_ITEMS;
  const spinDuration = E2E_AUCTION_FIXTURE ? 0.05 : shouldReduceMotion ? 1.05 : 3.6;
  const revealDelay = E2E_AUCTION_FIXTURE ? 50 : shouldReduceMotion ? 180 : 700;

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const trackItems = useMemo(() => {
    const cand = candidates.length > 0 ? candidates : [targetPlayer];
    const items: Player[] = [];
    for (let i = 0; i < spinItemCount; i++) {
      const pseudoRandomIndex = (i * 13) % cand.length;
      items.push(cand[pseudoRandomIndex]);
    }
    items.push(targetPlayer);
    return items;
  }, [candidates, spinItemCount, targetPlayer]);

  const particles = useMemo(
    () =>
      Array.from({ length: shouldReduceMotion ? 4 : 12 }, (_, index) => ({
        x: 10 + ((index * 17) % 80),
        y: 12 + ((index * 29) % 76),
        rotate: (index * 57) % 360,
      })),
    [shouldReduceMotion],
  );

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

    const finishAfterReveal = () => {
      if (!isMounted || finishHandledRef.current) return;
      setIsSpinning(false);
      setHasFinished(true);

      if (containerRef.current) {
        if (shouldReduceMotion) {
          animate(containerRef.current, { scale: [1, 1.04, 1] }, { duration: 0.35 });
        } else {
          animate(containerRef.current, { 
            scale: [1, 1.1, 1.05],
            x: [0, -4, 4, -4, 4, 0]
          }, { 
            duration: 0.5,
          });
        }
      }

      if (shineRef.current && !shouldReduceMotion) {
        animate(shineRef.current, { opacity: [0, 1, 0] }, { duration: 0.8 });
      }

      if (particleRefs.current.length > 0 && !shouldReduceMotion) {
        particleRefs.current.forEach((el, i) => {
          if (el) {
            animate(el, {
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0],
              rotate: particles[i].rotate,
            }, {
              duration: 1,
              delay: i * 0.05
            });
          }
        });
      }

      if (E2E_AUCTION_FIXTURE) {
        finishLottery();
        return;
      }

      window.setTimeout(finishLottery, revealDelay);
    };

    const startAnimation = async () => {
      await new Promise((resolve) =>
        window.setTimeout(resolve, shouldReduceMotion ? 120 : 240),
      );

      if (!isMounted) return;

      try {
        if (trackRef.current) {
          const animation = animate(trackRef.current, {
            y: -(spinItemCount * ITEM_HEIGHT),
          }, {
            duration: spinDuration,
            ease: [0.16, 1, 0.3, 1],
          });

          await animation;
        }

        if (!isMounted) return;
        
        finishAfterReveal();
      } catch (error) {
        console.error("Animation failed:", error);
      }
    };

    const fallbackDelay =
      (shouldReduceMotion ? 120 : 240) + spinDuration * 1000 + revealDelay;
    const fallbackTimer = window.setTimeout(finishLottery, fallbackDelay);

    startAnimation();

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
    };
  }, [
    revealDelay,
    shouldReduceMotion,
    spinDuration,
    spinItemCount,
    targetPlayerId,
    particles,
  ]);

  return (
    <div className="w-full flex flex-col items-center justify-center gap-8 py-8 perspective-1000">
      <div className="h-8 flex items-center justify-center">
        {isSpinning ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.2 }}
            className="text-2xl font-heading tracking-widest text-minion-blue drop-shadow-[0_0_8px_rgba(50,150,250,0.5)] flex items-center gap-2"
          >
            <PixelIcon
              icon={PIXEL_ICONS.LEADING}
              size={20}
              color="text-minion-blue"
              animation="active"
            />
            추첨 중...
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            className="text-3xl font-heading tracking-tighter text-minion-yellow drop-shadow-[0_0_12px_rgba(255,220,0,0.8)] flex items-center gap-2"
          >
            <PixelIcon
              icon={PIXEL_ICONS.SUCCESS}
              size={20}
              color="text-minion-yellow"
            />
            추첨 완료!
          </motion.div>
        )}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "w-full max-w-sm overflow-hidden bg-white border-[6px] border-black relative mx-auto rounded-none",
          hasFinished
            ? "shadow-[0_0_40px_rgba(255,215,0,0.6)]"
            : "shadow-pixel",
          "transition-all duration-700 ease-out",
        )}
        style={{
          height: `${ITEM_HEIGHT}px`,
          boxShadow: hasFinished
            ? "0 0 40px oklch(85% 0.20 85 / 0.6), 8px 8px 0px 0px black"
            : "8px 8px 0px 0px black",
        }}
      >
        {/* Success Particles Effect */}
        {hasFinished && !shouldReduceMotion && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            {particles.map((particle, i) => (
              <div
                key={i}
                ref={(el) => { particleRefs.current[i] = el; }}
                className="absolute w-4 h-4 bg-minion-yellow border-2 border-black"
                style={{ left: "50%", top: "50%", transform: `translate(${particle.x}%, ${particle.y}%) scale(0)` }}
              />
            ))}
          </div>
        )}

        {/* CRT Scanlines Effect */}
        <div className="absolute inset-0 pointer-events-none z-30 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />

        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_60px_rgba(0,0,0,0.2)]" />

        {/* Center Slot Highlight */}
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-full h-[calc(100%-12px)] border-y-2 border-minion-yellow/30 bg-minion-yellow/5" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-black clip-path-polygon-[0%_0%,100%_50%,0%_100%]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-8 bg-black clip-path-polygon-[100%_0%,0%_50%,100%_100%]" />
        </div>

        {/* Scrolling Track */}
        <div
          ref={trackRef}
          className="absolute top-0 left-0 flex w-full flex-col px-4 will-change-transform"
          style={{ backfaceVisibility: "hidden", transform: "translateZ(0)" }}
        >
          {trackItems.map((p, idx) => (
            <div
              key={idx}
              className="w-full flex flex-col items-center justify-center shrink-0 gap-2"
              style={{ height: `${ITEM_HEIGHT}px` }}
            >
              <span
                className={cn(
                  "text-3xl font-heading w-full text-center truncate px-2 transition-all",
                  !isSpinning && idx === spinItemCount
                    ? "text-minion-yellow scale-110"
                    : "text-black",
                )}
              >
                {p.name}
              </span>

              <div className="flex items-center justify-center gap-6">
                <motion.div
                  className="w-16 h-16 relative"
                  animate={
                    isSpinning
                      ? shouldReduceMotion
                        ? { opacity: [1, 0.9, 1] }
                        : {
                            scale: [1, 1.08, 1],
                            rotate: [0, -2, 2, 0],
                          }
                      : {}
                  }
                  transition={
                    isSpinning
                      ? {
                          duration: shouldReduceMotion ? 0.5 : 0.45,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }
                      : undefined
                  }
                >
                  <Image
                    src={getTierImage(p.tier)}
                    alt={p.tier}
                    fill
                    className="object-contain drop-shadow-lg pixelated"
                  />
                </motion.div>
                <motion.div 
                  className="w-12 h-12 relative"
                  animate={
                    isSpinning
                      ? shouldReduceMotion
                        ? { opacity: [1, 0.9, 1] }
                        : {
                            scale: [1, 1.08, 1],
                            rotate: [0, 2, -2, 0],
                          }
                      : {}
                  }
                  transition={
                    isSpinning
                      ? {
                          duration: shouldReduceMotion ? 0.5 : 0.45,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: 0.1
                        }
                      : undefined
                  }
                >
                  <Image
                    src={getPositionImage(p.main_position)}
                    alt={p.main_position}
                    fill
                    className="object-contain drop-shadow-md opacity-90 pixelated"
                  />
                </motion.div>
              </div>

              <div className="flex gap-2">
                <span className="px-2 py-0.5 bg-black text-white text-fluid-xs font-pixel">
                  {p.tier}
                </span>
                <span className="px-2 py-0.5 bg-minion-blue text-white text-fluid-xs font-pixel">
                  {p.main_position}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shine effect overlay when finished */}
      <div
        ref={shineRef}
        className="fixed inset-0 pointer-events-none z-50 bg-white opacity-0"
      />
    </div>
  );
}
