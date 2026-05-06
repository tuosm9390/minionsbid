"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "../constants/icons";

interface UnsoldNoticeProps {
  playerName: string;
  onDismiss: () => void;
}

export function UnsoldNotice({ playerName, onDismiss }: UnsoldNoticeProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 260 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pixel-box bg-white border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] px-6 py-4 flex items-center gap-4">
        <PixelIcon
          icon={PIXEL_ICONS.WARNING}
          size={24}
          color="text-gray-500"
          animation="idle"
        />
        <div className="flex flex-col">
          <span className="font-heading text-[10px] text-gray-400 uppercase tracking-widest">
            유찰
          </span>
          <span className="font-heading text-fluid-sm text-black tracking-tighter leading-none">
            {playerName}
          </span>
        </div>
        <span className="font-bold text-[11px] text-gray-500 ml-2">
          다음 추첨 대기
        </span>
      </div>
    </motion.div>
  );
}
