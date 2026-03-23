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
}

export function DraftPanel({
  phase,
  isAutoDraftMode,
  currentTurnTeam,
  playersList,
  role,
  onDraft,
}: DraftPanelProps) {
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
            <span className="text-[10px] font-bold text-gray-600">
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
                className={`text-[10px] font-bold ${TIER_COLOR[p.tier] || "text-black"}`}
              >
                {p.tier} | {p.main_position}
              </p>
            </div>
            {phase === "DRAFT" && role === "ORGANIZER" && (
              <button
                onClick={() => onDraft(p.id)}
                className="pixel-button bg-purple-600 text-white px-3 py-1 text-[10px]"
              >
                배정
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
