"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "../constants/icons";
import { getTierImage, getPositionImage } from "../utils/display";

interface SoldOverlayProps {
  playerName: string;
  teamName: string;
  price: number;
  tier?: string;
  position?: string;
  onDismiss: () => void;
}

export function SoldOverlay({
  playerName,
  teamName,
  price,
  tier,
  position,
  onDismiss,
}: SoldOverlayProps) {
  useEffect(() => {
    // 낙찰의 여운을 위해 3초간 유지 (기존 2.5초에서 약간 증가)
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // 가격에 따라 파티클 밀도 조절 (고가 낙찰일수록 화려하게)
  const particleCount = price >= 500 ? 40 : 20;
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }, (_, i) => {
        const angle = (i / particleCount) * Math.PI * 2 + ((i % 5) * 0.08);
        const velocity = 20 + ((i * 11) % 40);
        return {
          x: Math.cos(angle) * velocity,
          y: Math.sin(angle) * velocity,
          rotate: 360 * (i % 2 === 0 ? 1 : -1),
          duration: 1.5 + ((i % 4) * 0.2),
          delay: (i % 5) * 0.03,
        };
      }),
    [particleCount],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sold-title"
    >
      {/* 화면 전체 음성 안내 (Screen Reader Only) */}
      <div className="sr-only" aria-live="assertive">
        {teamName} 팀이 {playerName} 선수를 {price}포인트에 낙찰받았습니다!
      </div>

      {/* 순간적인 화이트 플래시 효과 */}
      <motion.div
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 0.4, times: [0, 0.5, 1] }}
        className="absolute inset-0 bg-white z-0"
      />

      {/* Background Decoration Text */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none opacity-10 select-none">
        <motion.span
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-[20rem] font-black italic rotate-[-15deg] whitespace-nowrap text-white"
        >
          SOLD SOLD SOLD
        </motion.span>
      </div>

      {/* Explosion Pixel Confetti */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {particles.map((particle, i) => (
          <motion.div
            key={i}
            initial={{
              x: "50vw",
              y: "50vh",
              scale: 0,
              rotate: 0,
            }}
            animate={{
              x: `calc(50vw + ${particle.x}vw)`,
              y: `calc(50vh + ${particle.y}vh)`,
              scale: [0, 1.5, 0],
              rotate: particle.rotate,
            }}
            transition={{
              duration: particle.duration,
              ease: [0.1, 0.8, 0.3, 1],
              delay: particle.delay,
            }}
            className={`absolute w-3 h-3 md:w-5 md:h-5 pixel-box border-2 border-black ${
              i % 3 === 0
                ? "bg-minion-yellow"
                : i % 3 === 1
                  ? "bg-minion-blue"
                  : "bg-white"
            }`}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.5, rotate: -5, opacity: 0 }}
        animate={{
          scale: 1,
          rotate: 0,
          opacity: 1,
          transition: { type: "spring", damping: 12, stiffness: 200 },
        }}
        className="relative z-10 w-full max-w-lg px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pixel-box bg-white border-[6px] border-black shadow-[16px_16px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* 상단 장식 바 */}
          <div className="bg-black text-white px-4 py-2 flex justify-between items-center border-b-4 border-black">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 animate-pulse" />
              <span className="font-heading text-[10px] tracking-tighter uppercase">
                Contract Finalized
              </span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 bg-white/20" />
              <div className="w-2 h-2 bg-white/10" />
            </div>
          </div>

          <div className="p-8 md:p-10 flex flex-col items-center gap-8 bg-[radial-gradient(circle_at_center,rgba(251,224,66,0.1)_0%,transparent_70%)]">
            <div className="text-center space-y-4">
              <motion.div
                animate={{
                  y: [0, -10, 0],
                  filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"],
                }}
                transition={{ duration: 0.6, repeat: Infinity }}
                className="bg-minion-red text-white px-4 py-1 text-[10px] font-heading uppercase inline-block mb-2 shadow-pixel-sm border-2 border-black"
              >
                NEW RECRUIT!
              </motion.div>

              <div className="space-y-4">
                <motion.h1
                  id="sold-title"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="text-fluid-xl font-black text-black leading-none uppercase tracking-tighter drop-shadow-sm"
                >
                  {playerName}
                </motion.h1>

                {/* 티어 / 포지션 이미지 배지 */}
                <div className="flex justify-center gap-6">
                  {tier && (
                    <div className="flex flex-col items-center gap-2 group">
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="pixel-box bg-gray-50 border-4 border-black p-2 shadow-none"
                      >
                        <Image
                          src={getTierImage(tier)}
                          alt={tier}
                          width={64}
                          height={64}
                          className="pixelated drop-shadow-sm"
                        />
                      </motion.div>
                      <span className="font-heading text-[10px] text-black/40 uppercase group-hover:text-black transition-colors">
                        {tier}
                      </span>
                    </div>
                  )}
                  {position && (
                    <div className="flex flex-col items-center gap-2 group">
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        className="pixel-box bg-gray-50 border-4 border-black p-2 shadow-none"
                      >
                        <Image
                          src={getPositionImage(position)}
                          alt={position}
                          width={64}
                          height={64}
                          className="pixelated contrast-125"
                        />
                      </motion.div>
                      <span className="font-heading text-[10px] text-black/40 uppercase group-hover:text-black transition-colors">
                        {position}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full flex items-center gap-4">
              <div className="flex-1 h-1 bg-black/10" />
              <PixelIcon
                icon={PIXEL_ICONS.SUCCESS}
                size={16}
                color="text-black/20"
              />
              <div className="flex-1 h-1 bg-black/10" />
            </div>

            {/* 영입 팀 정보 */}
            <div className="text-center space-y-3 w-full">
              <span className="font-heading text-[10px] text-gray-400 uppercase tracking-widest block">
                Acquired By
              </span>
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="text-fluid-lg font-black text-minion-blue leading-tight uppercase tracking-tight"
              >
                {teamName}
              </motion.div>
            </div>

            {/* 가격 정보 - Shine Effect */}
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
              className="mt-2 relative overflow-hidden bg-black text-minion-yellow px-12 py-6 font-heading text-fluid-base shadow-[8px_8px_0px_rgba(0,0,0,0.2)] group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-shine pointer-events-none" />
              <span className="relative z-10 tabular-nums">
                {price.toLocaleString()} P
              </span>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
