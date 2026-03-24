"use client";

import { useEffect } from "react";
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
    // 낙찰의 여운을 위해 2.5초간 유지
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onDismiss}
    >
      {/* 순간적인 화이트 플래시 효과 */}
      <motion.div
        animate={{ opacity: [0, 0.2, 0] }}
        transition={{ duration: 0.3, times: [0, 0.5, 1] }}
        className="absolute inset-0 bg-white z-0"
      />

      <motion.div
        initial={{ scale: 0.8, y: 20, opacity: 0 }}
        animate={{
          scale: 1,
          y: 0,
          opacity: 1,
          transition: { type: "spring", damping: 20, stiffness: 300 },
        }}
        className="relative z-10 w-full max-w-lg px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pixel-box bg-minion-yellow border-[6px] border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* 상단 장식 바 */}
          <div className="bg-black text-minion-yellow px-4 py-1.5 flex justify-between items-center border-b-4 border-black">
            <span className="font-heading text-[10px] tracking-tighter uppercase">
              Recruitment Success
            </span>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-minion-yellow" />
              <div className="w-1.5 h-1.5 bg-minion-yellow/40" />
            </div>
          </div>

          <div className="p-6 md:p-8 flex flex-col items-center gap-6">
            {/* 경매 망치 아이콘 애니메이션 (SOLD 전용) */}
            <motion.div
              initial={{ rotate: -20 }}
              animate={{ rotate: [0, -30, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <PixelIcon
                icon={PIXEL_ICONS.SOLD}
                size={64}
                color="text-black"
                animation="active"
                label="낙찰 확정"
              />
            </motion.div>

            <div className="text-center space-y-3">
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-fluid-lg font-heading text-black italic tracking-tighter leading-none"
              >
                SOLD!
              </motion.h2>

              <div className="space-y-4">
                <motion.h1
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="text-5xl md:text-6xl font-black text-black leading-none uppercase tracking-tighter drop-shadow-[3px_3px_0px_white]"
                >
                  {playerName}
                </motion.h1>

                {/* 티어 / 포지션 이미지 배지 */}
                <div className="flex justify-center gap-4">
                  {tier && (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="pixel-box bg-white border-[3px] border-black p-1.5 shadow-none">
                        <Image
                          src={getTierImage(tier)}
                          alt={tier}
                          width={48}
                          height={48}
                          className="pixelated drop-shadow-sm"
                        />
                      </div>
                      <span className="font-heading text-[8px] text-black/60 uppercase">
                        {tier}
                      </span>
                    </div>
                  )}
                  {position && (
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="pixel-box bg-white border-[3px] border-black p-1.5 shadow-none">
                        <Image
                          src={getPositionImage(position)}
                          alt={position}
                          width={48}
                          height={48}
                          className="pixelated contrast-125"
                        />
                      </div>
                      <span className="font-heading text-[8px] text-black/60 uppercase">
                        {position}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full h-0.5 bg-black/10 my-1" />

            {/* 영입 팀 정보 */}
            <div className="text-center space-y-2 w-full">
              <span className="font-heading text-[9px] text-black/60 uppercase tracking-widest block">
                Acquired By
              </span>
              <div className="text-3xl md:text-4xl font-black text-minion-blue leading-tight uppercase tracking-tight drop-shadow-sm">
                {teamName}
              </div>
            </div>

            {/* 가격 정보 */}
            <motion.div
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-2 bg-black text-minion-yellow px-8 py-4 font-heading text-xl md:text-2xl shadow-[6px_6px_0px_rgba(0,0,0,0.2)]"
            >
              {price.toLocaleString()} P
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
