"use client";

import { useMemo } from "react";
import {
  useAuctionStore,
  Player,
} from "@/features/auction/store/useAuctionStore";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";

interface OrganizerControlPanelProps {
  noticeText: string;
  setNoticeText: (val: string) => void;
  onSendNotice: () => void;
  waitingPlayersCount: number;
  soldPlayersCount: number;
  allDone: boolean;
  currentPlayer: Player | null;
  timerEndsAt: string | null;
  lotteryPlayer: Player | null;
  isDrawing: boolean;
  allConnected: boolean;
  onDraw: () => void;
  onStart: () => void;
}

export function OrganizerControlPanel({
  noticeText,
  setNoticeText,
  onSendNotice,
  waitingPlayersCount,
  soldPlayersCount,
  allDone,
  currentPlayer,
  timerEndsAt,
  lotteryPlayer,
  isDrawing,
  allConnected,
  onDraw,
  onStart,
}: OrganizerControlPanelProps) {
  const isPresenceLoaded = useAuctionStore((s) => s.isPresenceLoaded);
  const presences = useAuctionStore((s) => s.presences);
  const sessionCount = presences.length;
  const showLoadWarning = useMemo(() => sessionCount >= 80, [sessionCount]);

  return (
    <div className="pixel-box bg-white p-5 shrink-0 relative z-20 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      {/* GM Panel Style Header */}
      <div className="bg-black text-white px-4 py-2 mb-4 flex justify-between items-center border-b-4 border-black -mx-5 -mt-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-minion-yellow animate-pulse" />
          <span className="text-fluid-xs font-heading uppercase tracking-tighter">
            CONTROL PANEL
          </span>
        </div>
        <div className="flex gap-3">
          <span className="text-fluid-xs font-bold text-minion-yellow">
            대기: {waitingPlayersCount} 명
          </span>
          <span className="text-fluid-xs font-bold text-minion-blue">
            낙찰: {soldPlayersCount} 명
          </span>
        </div>
      </div>

      {/* 시스템 부하 경고 (FR-007) */}
      <AnimatePresence>
        {showLoadWarning && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
            animate={{ height: "auto", opacity: 1, marginBottom: 16 }}
            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
            className="bg-minion-red/10 border-2 border-minion-red p-3 flex items-center gap-3 overflow-hidden"
          >
            <PixelIcon
              icon={PIXEL_ICONS.WARNING}
              size={20}
              color="text-minion-red"
              animation="urgent"
            />
            <p className="text-fluid-xs font-bold text-minion-red uppercase tracking-tight">
              시스템 부하 주의: 현재 접속자 {sessionCount}명
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice Input Section */}
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-fluid-xs font-heading text-gray-400 uppercase">
          공지사항
        </span>
        <div className="flex gap-2 h-12">
          <input
            type="text"
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSendNotice()}
            placeholder="공지를 작성해주세요..."
            className="flex-1 bg-yellow-50/50 border-4 border-black px-4 text-xs font-black focus:bg-white focus:outline-none transition-colors"
          />
          <button
            onClick={onSendNotice}
            className="pixel-button bg-black text-white h-full px-4 text-fluid-xs font-heading uppercase tracking-tight hover:bg-minion-blue transition-colors"
          >
            전송
          </button>
        </div>
      </div>

      {/* Main Action Buttons */}
      <div className="h-14 relative">
        <AnimatePresence mode="wait">
          {allDone ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full h-full pixel-box bg-green-500/15 border-green-600 flex items-center justify-center"
            >
              <span className="text-fluid-xs font-heading text-green-700 uppercase">
                중앙 화면에서 최종 결과를 확인하세요
              </span>
            </motion.div>
          ) : !currentPlayer ? (
            <motion.button
              key="draw"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={onDraw}
              disabled={isDrawing || waitingPlayersCount === 0 || !allConnected}
              className={cn(
                "w-full h-full pixel-button font-heading text-fluid-xs px-6 uppercase tracking-tighter transition-all relative overflow-hidden group",
                isDrawing
                  ? "bg-gray-400"
                  : "bg-minion-blue text-white hover:bg-minion-blue-hover",
              )}
            >
              {isDrawing && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
              )}
              <span className="relative z-10 uppercase">
                {isDrawing
                  ? "추첨 중..."
                  : `다음 선수 추첨 (${waitingPlayersCount} 명)`}
              </span>
            </motion.button>
          ) : !timerEndsAt && lotteryPlayer ? (
            <motion.div
              key="lottery-lock"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full h-full pixel-box bg-minion-yellow/15 border-minion-yellow flex items-center justify-center"
            >
              <div className="flex items-center gap-2">
                <PixelIcon
                  icon={PIXEL_ICONS.WARNING}
                  size={18}
                  color="text-black"
                  animation="active"
                />
                <span className="text-fluid-xs font-heading text-black uppercase">
                  추첨 화면에서 경매를 시작하세요
                </span>
              </div>
            </motion.div>
          ) : !timerEndsAt && currentPlayer ? (
            <motion.button
              key="start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={onStart}
              className="w-full h-full pixel-button bg-minion-yellow text-black font-heading text-fluid-xs px-6 uppercase tracking-tighter hover:bg-minion-yellow-hover"
            >
              경매 시작
            </motion.button>
          ) : (
            <motion.div
              key="in-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full pixel-box bg-minion-red/10 border-minion-red flex items-center justify-center"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-minion-red animate-pulse" />
                <span className="text-fluid-xs font-heading text-minion-red uppercase animate-pulse">
                  경매 진행 중
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Connection Status Sub-hint */}
      {!allDone && (
        <div className="mt-4 text-center h-4 flex items-center justify-center">
          {!isPresenceLoaded ? (
            <p className="text-fluid-xs font-heading text-gray-400 animate-pulse uppercase tracking-tight">
              접속 현황 확인 중...
            </p>
          ) : !allConnected ? (
            <p className="text-fluid-xs font-heading text-minion-red animate-pulse uppercase tracking-tight">
              모든 팀장님들의 접속을 기다리는 중...
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
