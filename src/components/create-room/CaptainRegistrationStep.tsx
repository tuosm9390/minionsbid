"use client";

import { POSITIONS } from "@/features/auction/constants/room";
import { CaptainInfo } from "@/features/auction/utils/roomGenerator";
import { Upload } from "@/components/ui/CyberIcons";

interface CaptainRegistrationStepProps {
  captains: CaptainInfo[];
  setCaptains: React.Dispatch<React.SetStateAction<CaptainInfo[]>>;
  totalPoints: number;
  openTemplateModal: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleExcelUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
}

export function CaptainRegistrationStep({
  captains,
  setCaptains,
  totalPoints,
  openTemplateModal,
  fileInputRef,
  handleExcelUpload,
  isUploading,
}: CaptainRegistrationStepProps) {
  const updateCaptain = (
    i: number,
    field: keyof CaptainInfo,
    value: string | number,
  ) => {
    setCaptains((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const updated = { ...c, [field]: value };
        if (field === "name" && typeof value === "string") {
          const defaultName = `팀 ${i + 1}`;
          const prevAutoName = `${c.name}팀`;
          if (
            !c.name ||
            c.teamName === defaultName ||
            c.teamName === prevAutoName
          ) {
            updated.teamName = value ? `${value}팀` : defaultName;
          }
        }
        return updated;
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-gray-500 whitespace-pre-line text-left leading-relaxed">
          {
            "● 팀장 이름을 입력하면 팀명이 자동으로 생성됩니다.\n● 팀장 포인트는 시작 포인트에서 차감됩니다."
          }
        </p>
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
      {captains.map((captain, i) => (
        <div
          key={i}
          className="bg-white border-2 border-black p-6 mb-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-minion-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
              {i + 1}
            </div>{" "}
            <input
              type="text"
              value={captain.teamName}
              onChange={(e) => updateCaptain(i, "teamName", e.target.value)}
              placeholder="팀 이름"
              className="font-bold text-black bg-transparent border-b-2 border-gray-200 focus:border-minion-blue outline-none px-1 py-0.5 text-sm flex-1"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap">
              시작 포인트:{" "}
              <span
                className={`font-bold ${totalPoints - captain.captainPoints > 0 ? "text-black" : "text-red-500"}`}
              >
                {totalPoints - captain.captainPoints}P
              </span>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                팀장 이름 *
              </label>
              <input
                type="text"
                value={captain.name}
                onChange={(e) => updateCaptain(i, "name", e.target.value)}
                placeholder="이름"
                className="w-full border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">포지션</label>
              <select
                value={captain.position}
                onChange={(e) => updateCaptain(i, "position", e.target.value)}
                className="w-full border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none bg-white"
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                팀장 포인트
              </label>
              <input
                type="number"
                min={0}
                max={totalPoints - 1}
                value={captain.captainPoints}
                onChange={(e) =>
                  updateCaptain(
                    i,
                    "captainPoints",
                    e.target.value === "" ? 0 : parseInt(e.target.value),
                  )
                }
                className="w-full border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">소개</label>
              <input
                type="text"
                value={captain.description}
                onChange={(e) =>
                  updateCaptain(i, "description", e.target.value)
                }
                placeholder="간단 소개"
                className="w-full border-2 border-black px-2 py-1.5 text-sm focus:ring-2 focus:ring-minion-blue outline-none"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
