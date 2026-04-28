"use client";

import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import {
  motion,
  AnimatePresence,
  useAnimationControls,
  useReducedMotion,
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

export function LotteryAnimation({
  candidates,
  targetPlayer,
  onFinished,
}: LotteryAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  const [isSpinning, setIsSpinning] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);
  const controls = useAnimationControls();
  const spinItemCount = shouldReduceMotion ? 8 : VISIBLE_ITEMS;
  const spinDuration = shouldReduceMotion ? 1.05 : 3.6;
  const revealDelay = shouldReduceMotion ? 180 : 700;

  // Generate a sequence of items that ends with the target player
  const trackItems = useMemo(() => {
    const cand = candidates.length > 0 ? candidates : [targetPlayer];
    const items: Player[] = [];
    // Use a deterministic sequence for the track to satisfy purity
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

    const startAnimation = async () => {
      // Small delay before starting to ensure Framer Motion is ready
      await new Promise((resolve) =>
        setTimeout(resolve, shouldReduceMotion ? 120 : 240),
      );

      if (!isMounted) return;

      try {
        // Animate the track
        await controls.start({
          y: -(spinItemCount * ITEM_HEIGHT),
          transition: {
            duration: spinDuration,
            ease: [0.16, 1, 0.3, 1] as const, // easeOutExpo-like
          },
        });

        if (!isMounted) return;

        setIsSpinning(false);
        setHasFinished(true);

        // Additional delay for the winning moment
        setTimeout(() => {
          if (isMounted) onFinished?.();
        }, revealDelay);
      } catch (error) {
        console.error("Animation failed:", error);
      }
    };

    startAnimation();

    return () => {
      isMounted = false;
      controls.stop();
    };
  }, [
    controls,
    onFinished,
    revealDelay,
    shouldReduceMotion,
    spinDuration,
    spinItemCount,
  ]);

  return (
    <div className="w-full flex flex-col items-center justify-center gap-8 py-8 perspective-1000">
      <AnimatePresence mode="wait">
        {isSpinning ? (
          <motion.div
            key="spinning"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.2 }}
            className="text-2xl font-heading tracking-widest text-minion-blue drop-shadow-[0_0_8px_rgba(50,150,250,0.5)]"
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
            key="locked"
            initial={{ opacity: 0, scale: 0.5, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            className="text-3xl font-heading tracking-tighter text-minion-yellow drop-shadow-[0_0_12px_rgba(255,220,0,0.8)]"
          >
            <PixelIcon
              icon={PIXEL_ICONS.SUCCESS}
              size={20}
              color="text-minion-yellow"
            />
            추첨 완료!
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={
          hasFinished
            ? shouldReduceMotion
              ? {
                  scale: [1, 1.04, 1],
                  transition: {
                    duration: 0.35,
                    ease: "easeOut",
                  },
                }
              : {
                  scale: [1, 1.1, 1.05],
                  x: [0, -4, 4, -4, 4, 0],
                  transition: {
                    scale: { duration: 0.5, ease: "easeOut" },
                    x: {
                      duration: 0.4,
                      ease: "linear",
                      times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                    },
                  },
                }
            : {}
        }
        className={cn(
          "w-full max-w-sm overflow-hidden bg-white border-[6px] border-black relative mx-auto rounded-none",
          hasFinished
            ? "shadow-[0_0_40px_rgba(255,215,0,0.6)]"
            : "shadow-pixel",
          "transition-all duration-700 ease-out-expo",
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
              <motion.div
                key={i}
                initial={{ scale: 0, x: "50%", y: "50%", opacity: 1 }}
                animate={{
                  scale: [0, 1.5, 0],
                  x: `${particle.x}%`,
                  y: `${particle.y}%`,
                  rotate: particle.rotate,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 1, ease: "easeOut", delay: i * 0.05 }}
                className="absolute w-4 h-4 bg-minion-yellow border-2 border-black"
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
        <motion.div
          animate={controls}
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
                      ? shouldReduceMotion
                        ? {
                            duration: 0.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }
                        : {
                            duration: 0.45,
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
                <div className="w-12 h-12 relative">
                  <Image
                    src={getPositionImage(p.main_position)}
                    alt={p.main_position}
                    fill
                    className="object-contain drop-shadow-md opacity-90 pixelated"
                  />
                </div>
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
        </motion.div>
      </motion.div>

      {/* Shine effect overlay when finished */}
      {hasFinished && !shouldReduceMotion && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, times: [0, 0.2, 1] }}
          className="fixed inset-0 pointer-events-none z-50 bg-white"
        />
      )}
    </div>
  );
}
