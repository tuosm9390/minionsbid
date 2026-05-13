"use client";

import { Upload } from "@/components/ui/CyberIcons";
import { ThreeDIcon } from "@/components/ui/ThreeDIcon";
import { TIERS, POSITIONS } from "@/features/auction/constants/room";
import { PlayerInfo } from "@/features/auction/utils/roomGenerator";

interface PlayerRegistrationStepProps {
  players: PlayerInfo[];
  setPlayers: React.Dispatch<React.SetStateAction<PlayerInfo[]>>;
  minPlayers: number;
  openTemplateModal: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleExcelUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
}

function getCreateRoomTierLabel(tier: string) {
  if (tier === "마스터 이상") return "마스터";
  if (tier === "실버 이하") return "실버";
  return tier;
}

function getTierOptions(currentTier: string) {
  return TIERS.includes(currentTier) || !currentTier
    ? TIERS
    : [currentTier, ...TIERS];
}

export function PlayerRegistrationStep({
  players,
  setPlayers,
  minPlayers,
  openTemplateModal,
  fileInputRef,
  handleExcelUpload,
  isUploading,
}: PlayerRegistrationStepProps) {
  const updatePlayer = (i: number, field: keyof PlayerInfo, value: string) => {
    setPlayers((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)),
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">
            경매 선수 목록
          </span>
          <span
            className={`text-xs font-bold px-2 py-0.5 ${players.filter((p) => p.name.trim()).length === minPlayers ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-500"}`}
          >
            {players.filter((p) => p.name.trim()).length} / {minPlayers}명
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openTemplateModal}
            className="pixel-button flex items-center gap-1.5 text-purple-700 hover:bg-purple-100 px-3 py-1 text-sm font-bold transition-colors"
          >
            {/* <ThreeDIcon name="cube" alt="테스트 데이터" size={18} /> */}
            테스트 데이터 생성
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            className="hidden"
            onChange={handleExcelUpload}
          />
          <button
            type="button"
            data-testid="excel-upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="pixel-button flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-sm font-bold transition-colors disabled:opacity-50"
          >
            <Upload size={14} /> {isUploading ? "처리 중..." : "엑셀 업로드"}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div
          className="grid gap-2 text-xs font-bold text-gray-400 px-2 pb-1"
          style={{ gridTemplateColumns: "1.5rem 1fr 5rem 5rem 5rem 1fr" }}
        >
          <span className="text-center">#</span>
          <span>이름 *</span>
          <span>티어</span>
          <span>주 포지션</span>
          <span>부 포지션</span>
          <span>소개</span>
        </div>
        {players.map((player, i) => (
          <div
            key={i}
            className="grid gap-2 items-center bg-white border-2 border-black px-2 py-1.5"
            style={{ gridTemplateColumns: "1.5rem 1fr 5rem 5rem 5rem 1fr" }}
          >
            <span className="text-xs text-gray-400 text-center">{i + 1}</span>
            <input
              type="text"
              value={player.name}
              onChange={(e) => updatePlayer(i, "name", e.target.value)}
              placeholder="선수 이름"
              className="border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none w-full"
            />
            <select
              value={player.tier}
              onChange={(e) => updatePlayer(i, "tier", e.target.value)}
              className="border-2 border-black py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none bg-white w-full"
            >
              {getTierOptions(player.tier).map((t) => (
                <option key={t} value={t}>
                  {getCreateRoomTierLabel(t)}
                </option>
              ))}
            </select>
            <select
              value={player.mainPosition}
              onChange={(e) => updatePlayer(i, "mainPosition", e.target.value)}
              className="border-2 border-black py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none bg-white w-full"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={player.subPosition}
              onChange={(e) => updatePlayer(i, "subPosition", e.target.value)}
              className="border-2 border-black py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none bg-white w-full"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={player.description}
              onChange={(e) => updatePlayer(i, "description", e.target.value)}
              placeholder="소개 (선택)"
              className="border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none w-full"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
