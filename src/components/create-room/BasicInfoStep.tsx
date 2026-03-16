"use client";

import { ArrowRight } from "lucide-react";
import { BasicInfo, StoredRoom } from "@/features/auction/hooks/useCreateRoom";

interface BasicInfoStepProps {
  basic: BasicInfo;
  setBasic: React.Dispatch<React.SetStateAction<BasicInfo>>;
  activeRooms: StoredRoom[];
  isCheckingRooms: boolean;
  goToRoom: (path: string) => void;
  minPlayers: number;
}

export function BasicInfoStep({
  basic,
  setBasic,
  activeRooms,
  isCheckingRooms,
  goToRoom,
  minPlayers,
}: BasicInfoStepProps) {
  return (
    <div className="space-y-5">
      {!isCheckingRooms && activeRooms.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-sm font-black text-orange-700 mb-3">⚠️ 진행 중인 경매방이 있습니다</p>
          <div className="space-y-2">
            {activeRooms.map((room) => (
              <div key={room.id} className="bg-white border border-orange-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{room.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(room.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 생성
                  </p>
                </div>
                <button onClick={() => goToRoom(room.organizerPath)} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0">
                  이 방으로 이동 <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-sm font-bold text-gray-700 block mb-1.5">경매 제목 *</label>
        <input
          data-testid="room-title-input"
          type="text"
          value={basic.title}
          onChange={(e) => setBasic((p) => ({ ...p, title: e.target.value }))}
          placeholder="예시) 제 14회 미니언즈 정규 리그전"
          className="w-full bg-white border-2 border-black rounded-0 px-4 py-3 text-sm focus:bg-yellow-50 outline-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">팀 수</label>
          <input
            type="number" min={2} max={12}
            value={basic.teamCount}
            onChange={(e) => setBasic((p) => ({ ...p, teamCount: e.target.value === "" ? 0 : parseInt(e.target.value) }))}
            className="w-full bg-white border-2 border-black rounded-0 px-4 py-3 text-sm focus:bg-yellow-50 outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">팀당 인원 수</label>
          <input
            type="number" min={2} max={5}
            value={basic.membersPerTeam}
            onChange={(e) => setBasic((p) => ({ ...p, membersPerTeam: e.target.value === "" ? 0 : parseInt(e.target.value) }))}
            className="w-full bg-white border-2 border-black rounded-0 px-4 py-3 text-sm focus:bg-yellow-50 outline-none"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">팀당 총 포인트</label>
          <input
            type="number" min={100} step={100}
            value={basic.totalPoints}
            onChange={(e) => setBasic((p) => ({ ...p, totalPoints: e.target.value === "" ? 0 : parseInt(e.target.value) }))}
            className="w-full bg-white border-2 border-black rounded-0 px-4 py-3 text-sm focus:bg-yellow-50 outline-none"
          />
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-sm text-gray-600 space-y-1">
        <p className="font-bold text-black mb-1">요약</p>
        <p>· 총 {basic.teamCount}팀, 팀당 {basic.membersPerTeam}명 (팀장 포함)</p>
        <p>· 경매 선수 <span className="font-bold text-black">{minPlayers}명</span> 고정 등록</p>
        <p>· 각 팀 시작 포인트: {basic.totalPoints}P</p>
      </div>
    </div>
  );
}
