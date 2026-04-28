"use client";

import { X } from "lucide-react";
import { BasicInfo } from "@/features/auction/hooks/useCreateRoom";
import { CaptainInfo, PlayerInfo } from "@/features/auction/utils/roomGenerator";
import { getAuctionSlotsPerTeam } from "@/features/auction/utils/roster";

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  basic: BasicInfo;
  templateData: { captains: CaptainInfo[]; players: PlayerInfo[] } | null;
  onRegenerate: () => void;
  onApply: () => void;
}

export function TemplatePreviewModal({
  isOpen,
  onClose,
  basic,
  templateData,
  onRegenerate,
  onApply,
}: TemplatePreviewModalProps) {
  if (!isOpen || !templateData) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b-4 border-black flex items-center justify-between bg-minion-yellow">
          <div>
            <h3 className="text-lg font-black text-black">🎲 테스트 데이터 미리보기</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {basic.teamCount}팀 · 팀장 {basic.teamCount}명 · 경매 선수{" "}
              {basic.teamCount *
                getAuctionSlotsPerTeam(
                  basic.membersPerTeam,
                  basic.captainMode,
                )}
              명
            </p>
          </div>
          <button onClick={onClose} className="text-black hover:bg-black/10 p-1 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
          <div>
            <p className="text-sm font-black text-gray-700 mb-2">🛡️ 팀장 ({templateData.captains.length}명)</p>
            <div className="rounded-xl overflow-hidden border border-gray-100">
              <div className="grid text-xs font-bold text-gray-400 bg-gray-50 px-3 py-2" style={{ gridTemplateColumns: "2rem 1fr 1fr 4rem 1fr" }}>
                <span>#</span><span>팀 이름</span><span>팀장 이름</span><span>포지션</span><span>소개</span>
              </div>
              {templateData.captains.map((c, i) => (
                <div key={i} className="grid text-xs text-gray-700 px-3 py-2 border-t border-gray-50 hover:bg-gray-50" style={{ gridTemplateColumns: "2rem 1fr 1fr 4rem 1fr" }}>
                  <span className="text-gray-400">{i + 1}</span>
                  <span className="font-bold text-black truncate pr-2">{c.teamName}</span>
                  <span className="truncate pr-2">{c.name}</span>
                  <span className="text-gray-500">{c.position}</span>
                  <span className="text-gray-500 truncate">{c.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-black text-gray-700 mb-2">⚔️ 경매 선수 ({templateData.players.length}명)</p>
            <div className="rounded-xl overflow-hidden border border-gray-100">
              <div className="grid text-xs font-bold text-gray-400 bg-gray-50 px-3 py-2" style={{ gridTemplateColumns: "2rem 1fr 4rem 4rem 4rem 1fr" }}>
                <span>#</span><span>이름</span><span>티어</span><span>주 포지션</span><span>부 포지션</span><span>소개</span>
              </div>
              {templateData.players.map((p, i) => (
                <div key={i} className="grid text-xs text-gray-700 px-3 py-2 border-t border-gray-50 hover:bg-gray-50" style={{ gridTemplateColumns: "2rem 1fr 4rem 4rem 4rem 1fr" }}>
                  <span className="text-gray-400">{i + 1}</span>
                  <span className="font-bold truncate pr-2">{p.name}</span>
                  <span className="text-gray-500">{p.tier}</span>
                  <span className="text-gray-500">{p.mainPosition}</span>
                  <span className="text-gray-500">{p.subPosition}</span>
                  <span className="text-gray-500 truncate">{p.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t-4 border-black bg-white flex justify-between items-center">
          <button onClick={onClose} className="pixel-button bg-white text-black px-5 py-2.5 text-sm font-bold">취소</button>
          <div className="flex items-center gap-2">
            <button onClick={onRegenerate} className="pixel-button bg-purple-100 text-purple-700 px-4 py-2.5 text-sm font-bold">🔄 다시 생성</button>
            <button onClick={onApply} className="pixel-button bg-black text-white px-8 py-3 text-sm font-heading">템플릿 적용 ✓</button>
          </div>
        </div>
      </div>
    </div>
  );
}
