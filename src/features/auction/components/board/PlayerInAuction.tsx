"use client";

import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { Player } from "@/features/auction/store/useAuctionStore";
import { getTierImage, getPositionImage } from "../../utils/display";
import { TIER_COLOR } from "../../constants/room";
import { cn } from "@/lib/utils";

interface PlayerInAuctionProps {
  player: Player;
}

export function PlayerInAuction({ player }: PlayerInAuctionProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex-1 flex flex-col items-center justify-center bg-white border-[6px] border-black p-4 relative overflow-hidden shadow-pixel"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none overflow-hidden select-none">
        <span className="text-9xl font-black italic block whitespace-nowrap">
          선수 정보 선수 정보
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 w-full z-10">
        <motion.div variants={itemVariants} className="text-center space-y-2">
          {/* <span className="px-3 py-1 bg-minion-blue text-white text-[12px] font-heading uppercase tracking-widest inline-block">
            경매 진행 중
          </span> */}
          <h2 className="text-fluid-lg font-heading tracking-tighter leading-tight drop-shadow-sm">
            {player.name}
          </h2>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 w-full max-w-lg border-y-[6px] border-black border-double py-4 bg-gray-50/50 px-4"
        >
          {/* Tier Section */}
          <div className="flex flex-col items-center gap-2">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              className="pixel-box p-2 bg-white border-4 shadow-pixel-sm"
            >
              <Image
                src={getTierImage(player.tier)}
                alt="티어"
                width={60}
                height={60}
                className="pixelated drop-shadow-md"
              />
            </motion.div>
            <span
              className={cn(
                "text-fluid-sm font-black uppercase tracking-widest font-heading",
                TIER_COLOR[player.tier] || "text-black",
              )}
            >
              {player.tier}
            </span>
          </div>

          <div className="w-[4px] h-20 bg-black/10 rounded-full" />

          {/* Position Section */}
          <div className="flex flex-col items-center gap-2 text-gray-700">
            <motion.div
              whileHover={{ scale: 1.1, rotate: -5 }}
              className="pixel-box p-2 bg-white border-4 shadow-pixel-sm"
            >
              <Image
                src={getPositionImage(player.main_position)}
                alt="포지션"
                width={48}
                height={48}
                className="pixelated filter contrast-125"
              />
            </motion.div>
            <span className="text-fluid-sm font-black uppercase tracking-widest font-heading">
              {player.main_position}
            </span>
          </div>
        </motion.div>

        {player.description && (
          <motion.div
            variants={itemVariants}
            className="bg-minion-yellow/10 p-3 border-4 border-dashed border-black/10 w-full max-w-lg text-center relative"
          >
            <p className="text-fluid-xs font-bold text-gray-700 leading-relaxed italic">
              &quot;{player.description}&quot;
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
