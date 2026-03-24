"use client";

import Image from "next/image";
import { ElapsedTimer } from "@/components/ui/ElapsedTimer";
import { LinksModal } from "@/features/auction/components/LinksModal";

interface RoomHeaderProps {
  effectiveRole: string | null;
  createdAt: string | null;
  onLeaveRoom: () => void;
}

export function RoomHeader({
  effectiveRole,
  createdAt,
  onLeaveRoom,
}: RoomHeaderProps) {
  return (
    <header className="h-14 shrink-0 bg-black border-b-4 border-black text-white relative z-[110]">
      <div className="max-w-7xl mx-auto px-4 h-full flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/favicon.png"
              alt="Icon"
              width={24}
              height={24}
              className="pixelated shadow-lg"
            />
            <span className="font-black text-minion-yellow tracking-tighter">
              MINIONS
            </span>
          </div>
          <div className="flex gap-2">
            <div className="pixel-box bg-black font-black text-black text-fluid-sm px-3 py-1 font-heading uppercase border-white/20">
              {effectiveRole === "ORGANIZER"
                ? "주최자"
                : effectiveRole === "LEADER"
                  ? "팀장"
                  : "관전자"}
            </div>
            {createdAt && <ElapsedTimer createdAt={createdAt} />}
          </div>
        </div>
        <div className="flex gap-3">
          {effectiveRole === "ORGANIZER" && <LinksModal />}
          <button
            onClick={onLeaveRoom}
            className="pixel-button bg-white/50 hover:bg-white/20 text-white px-4 h-10 text-fluid-xs font-heading uppercase tracking-tight border-white/20 shadow-none transition-all"
          >
            나가기
          </button>
        </div>
      </div>
    </header>
  );
}
