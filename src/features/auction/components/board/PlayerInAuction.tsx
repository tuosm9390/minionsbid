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
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center bg-white border-[6px] border-black p-4 relative overflow-hidden shadow-pixel"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none overflow-hidden select-none">
        <span className="text-9xl font-black italic block whitespace-nowrap">
          선수 정보 선수 정보
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 w-full z-10">
        <div className="text-center space-y-2">
          {/* <span className="px-3 py-1 bg-minion-blue text-white text-fluid-xs font-heading uppercase tracking-widest inline-block">
            경매 진행 중
          </span> */}
          <h2 className="text-fluid-lg font-heading tracking-tighter leading-tight drop-shadow-sm">
            {player.name}
          </h2>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 w-full max-w-lg border-y-[6px] border-black border-double py-4 bg-gray-50/50 px-4">
          {/* Tier Section */}
          <div className="flex flex-col items-center gap-2">
            <div className="pixel-box p-2 bg-white border-4 shadow-pixel-sm">
              <Image
                src={getTierImage(player.tier)}
                alt="티어"
                width={60}
                height={60}
                className="pixelated drop-shadow-md"
              />
            </div>
            <span
              className={cn(
                "text-fluid-sm font-black uppercase tracking-widest font-heading",
                TIER_COLOR[player.tier] || "text-black",
              )}
            >
              {player.tier}
            </span>
          </div>

          <div className="w-[4px] h-20 bg-black/10" />

          {/* Position Section */}
          <div className="flex flex-col items-center gap-2 text-gray-700">
            <div className="pixel-box p-2 bg-white border-4 shadow-pixel-sm">
              <Image
                src={getPositionImage(player.main_position)}
                alt="포지션"
                width={48}
                height={48}
                className="pixelated filter contrast-125"
              />
            </div>
            <span className="text-fluid-sm font-black uppercase tracking-widest font-heading">
              {player.main_position}
            </span>
          </div>
        </div>

        {player.description && (
          <div className="bg-minion-yellow/10 p-3 border-4 border-dashed border-black/10 w-full max-w-lg text-center relative">
            <p className="text-fluid-xs font-bold text-gray-700 leading-relaxed italic">
              &quot;{player.description}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
