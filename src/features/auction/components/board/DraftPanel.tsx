"use client";

import { Player, Team } from "@/features/auction/store/useAuctionStore";
import { TIER_COLOR } from "../../constants/room";

interface DraftPanelProps {
  phase: string;
  isAutoDraftMode: boolean;
  currentTurnTeam: Team | null;
  playersList: Player[];
  role: string | null;
  onDraft: (playerId: string) => void;
  onRestartAuction?: () => void;
  isRestarting?: boolean;
}

export function DraftPanel({
  phase,
  isAutoDraftMode,
  currentTurnTeam,
  playersList,
  role,
  onDraft,
  onRestartAuction,
  isRestarting = false,
}: DraftPanelProps) {
  const isReAuctionPhase = phase !== "DRAFT" && !isAutoDraftMode;

  return (
    <div className="flex-1 flex flex-col">
      <div className="text-center mb-6">
        <div className="pixel-box !bg-primary text-primary-foreground inline-block px-6 py-2 font-bold mb-4">
          {phase === "DRAFT" || isAutoDraftMode
            ? "유찰 선수 배정"
            : "재경매 진행"}
        </div>
        {phase === "DRAFT" && currentTurnTeam && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-fluid-xs font-bold text-gray-600">
              현재 차례
            </span>
            <div className="pixel-box bg-purple-100 px-6 py-2 font-black text-purple-700">
              {currentTurnTeam.name} ({currentTurnTeam.point_balance}P)
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[300px] p-2">
        {playersList.map((p) => (
          <div
            key={p.id}
            className="pixel-box bg-white p-3 flex justify-between items-center"
          >
            <div>
              <p className="font-black">{p.name}</p>
              <p
                className={`text-fluid-xs font-bold ${TIER_COLOR[p.tier] || "text-black"}`}
              >
                {p.tier} | {p.main_position}
              </p>
            </div>
            {phase === "DRAFT" && role === "ORGANIZER" && (
              <button
                onClick={() => onDraft(p.id)}
                className="pixel-button bg-purple-600 text-white px-3 py-1 text-fluid-xs"
              >
                배정
              </button>
            )}
          </div>
        ))}
      </div>
      {isReAuctionPhase && role === "ORGANIZER" && (
        <div className="flex justify-center px-2 pt-6">
          <button
            onClick={onRestartAuction}
            disabled={isRestarting}
            className="pixel-button relative overflow-hidden bg-minion-blue text-white min-h-14 px-10 py-4 text-fluid-sm font-heading uppercase tracking-tight shadow-[6px_6px_0px_rgba(0,0,0,1)] disabled:bg-gray-400"
          >
            {!isRestarting && (
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shine pointer-events-none" />
            )}
            <span className="relative z-10">
              {isRestarting ? "재경매 준비 중..." : "재경매 시작"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
