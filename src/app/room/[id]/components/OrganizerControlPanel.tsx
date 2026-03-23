"use client";

import { Player } from "@/features/auction/store/useAuctionStore";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
  onShowResult: () => void;
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
  onShowResult,
  onDraw,
  onStart,
}: OrganizerControlPanelProps) {
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
          <span className="text-[10px] font-bold text-minion-yellow">
            대기: {waitingPlayersCount} 명
          </span>
          <span className="text-[10px] font-bold text-minion-blue">
            낙찰: {soldPlayersCount} 명
          </span>
        </div>
      </div>

      {/* Notice Input Section */}
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-[9px] font-heading text-gray-400 uppercase">
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
            className="pixel-button bg-black text-white h-full px-4 text-[10px] font-heading uppercase tracking-tight hover:bg-minion-blue transition-colors"
          >
            전송
          </button>
        </div>
      </div>

      {/* Main Action Buttons */}
      <div className="h-14 relative">
        <AnimatePresence mode="wait">
          {allDone ? (
            <motion.button
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onShowResult}
              className="w-full h-full pixel-button bg-green-500 text-white font-heading text-fluid-xs px-6 uppercase tracking-tighter animate-bounce shadow-pixel-sm"
            >
              최종 결과 ✨
            </motion.button>
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
          ) : !timerEndsAt && !lotteryPlayer ? (
            <motion.button
              key="start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={onStart}
              className="w-full h-full pixel-button bg-minion-yellow text-black font-heading text-fluid-xs px-6 uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              경매 시작 🔥
            </motion.button>
          ) : (
            <motion.div
              key="in-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full pixel-box bg-minion-red/10 border-minion-red flex items-center justify-center"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-minion-red animate-pulse rounded-full" />
                <span className="text-[10px] font-heading text-minion-red uppercase animate-pulse">
                  경매 진행 중
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Connection Status Sub-hint */}
      {!allConnected && !allDone && (
        <p className="text-[9px] font-heading text-minion-red mt-4 text-center animate-pulse uppercase tracking-tight">
          모든 팀장님들의 접속을 기다리는 중...
        </p>
      )}
    </div>
  );
}
