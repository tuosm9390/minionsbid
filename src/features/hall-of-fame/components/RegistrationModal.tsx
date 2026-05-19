"use client";

import { useState } from "react";
import {
  getAuctionArchivesForHof,
  registerHallOfFameEntry,
} from "../api/hallOfFameActions";
import type { AuctionArchiveForHof } from "../types";
import { useOverlayDismiss } from "@/components/ui/useOverlayDismiss";

interface RegistrationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "code" | "archive" | "team";

export function RegistrationModal({ onClose, onSuccess }: RegistrationModalProps) {
  const [step, setStep] = useState<Step>("code");
  const overlayDismiss = useOverlayDismiss<HTMLDivElement>(onClose);
  const [adminCode, setAdminCode] = useState("");
  const [codeError, setCodoError] = useState("");

  const [archives, setArchives] = useState<AuctionArchiveForHof[]>([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);

  const [selectedArchive, setSelectedArchive] =
    useState<AuctionArchiveForHof | null>(null);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<number | null>(null);
  const [seasonName, setSeasonName] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleCodeSubmit() {
    if (!adminCode.trim()) return;
    setCodoError("");
    setIsLoadingArchives(true);

    // 코드 검증: 아카이브 목록 조회를 서버에서 실행하므로
    // 여기서는 코드를 임시 보관 후 실제 저장 시점에 검증
    // 아카이브는 별도 액션으로 로드
    const data = await getAuctionArchivesForHof();
    setIsLoadingArchives(false);

    if (data.length === 0 && adminCode) {
      // 아카이브가 없는 정상 케이스도 있으므로 진행
    }
    setArchives(data);
    setStep("archive");
  }

  function handleArchiveSelect(archive: AuctionArchiveForHof) {
    setSelectedArchive(archive);
    setSeasonName(archive.room_name);
    setSeasonLabel("");
    setSelectedTeamIdx(null);
    setStep("team");
  }

  async function handleSave() {
    if (!selectedArchive || selectedTeamIdx === null) return;
    const team = selectedArchive.result_snapshot[selectedTeamIdx];
    if (!team) return;

    setIsSaving(true);
    setSaveError("");

    const result = await registerHallOfFameEntry(
      {
        archiveId: selectedArchive.id,
        teamId: team.id,
        teamName: team.name,
        seasonName: seasonName.trim() || selectedArchive.room_name,
        seasonLabel: seasonLabel.trim() || null,
      },
      adminCode
    );

    setIsSaving(false);

    if (result.error) {
      if (result.error === "관리자 코드가 올바르지 않습니다.") {
        setCodoError(result.error);
        setStep("code");
        return;
      }
      setSaveError(result.error);
      return;
    }

    onSuccess();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={overlayDismiss.onMouseDown}
      onMouseUp={overlayDismiss.onMouseUp}
    >
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b-4 border-black px-6 py-4 shrink-0">
          <h2 className="font-heading text-lg uppercase tracking-widest">
            {step === "code" && "Step 1: 관리자 인증"}
            {step === "archive" && "Step 2: 리그 선택"}
            {step === "team" && "Step 3: 우승팀 등록"}
          </h2>
          <button
            onClick={onClose}
            className="font-heading text-2xl leading-none hover:text-minion-red transition-colors"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 p-6">
          {/* Step 1: 관리자 코드 */}
          {step === "code" && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-600">
                명예의 전당 등록에는 관리자 코드가 필요합니다.
              </p>
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="관리자 코드 입력"
                className="w-full border-4 border-black px-4 py-3 text-base font-bold focus:outline-none focus:border-minion-blue"
                onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                autoFocus
              />
              {codeError && (
                <p className="text-sm text-minion-red font-bold">{codeError}</p>
              )}
              <button
                onClick={handleCodeSubmit}
                disabled={isLoadingArchives || !adminCode.trim()}
                className="pixel-button w-full bg-minion-yellow py-3 font-heading text-base uppercase disabled:opacity-50"
              >
                {isLoadingArchives ? "로딩 중..." : "다음 →"}
              </button>
            </div>
          )}

          {/* Step 2: 아카이브 선택 */}
          {step === "archive" && (
            <div className="space-y-3">
              {archives.length === 0 ? (
                <p className="text-sm font-bold text-gray-500 text-center py-8">
                  저장된 경매 기록이 없습니다.
                </p>
              ) : (
                archives.map((archive) => {
                  const date = archive.closed_at
                    ? new Date(archive.closed_at).toLocaleDateString("ko-KR")
                    : "-";
                  return (
                    <button
                      key={archive.id}
                      onClick={() => handleArchiveSelect(archive)}
                      className="w-full text-left border-4 border-black p-4 hover:bg-minion-yellow/30 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all space-y-1"
                    >
                      <p className="font-heading text-base font-black">
                        {archive.room_name}
                      </p>
                      <p className="text-xs font-bold text-gray-500">
                        종료: {date} · 팀 수: {archive.result_snapshot.length}
                      </p>
                    </button>
                  );
                })
              )}
              <button
                onClick={() => setStep("code")}
                className="text-xs text-gray-400 hover:text-black underline font-bold"
              >
                ← 이전
              </button>
            </div>
          )}

          {/* Step 3: 우승팀 선택 */}
          {step === "team" && selectedArchive && (
            <div className="space-y-4">
              {/* 시즌명 입력 */}
              <div>
                <label className="block text-xs font-heading uppercase tracking-wide mb-1">
                  시즌 / 리그 이름
                </label>
                <input
                  type="text"
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  maxLength={40}
                  className="w-full border-4 border-black px-4 py-2 text-sm font-bold focus:outline-none focus:border-minion-blue"
                  placeholder="예: 제1회 미니언즈 리그"
                />
              </div>

              <div>
                <label className="block text-xs font-heading uppercase tracking-wide mb-1">
                  시즌 정보
                </label>
                <input
                  type="text"
                  value={seasonLabel}
                  onChange={(e) => setSeasonLabel(e.target.value)}
                  maxLength={40}
                  className="w-full border-4 border-black px-4 py-2 text-sm font-bold focus:outline-none focus:border-minion-blue"
                  placeholder="예: 26년 상반기"
                />
              </div>

              {/* 팀 선택 */}
              <div>
                <label className="block text-xs font-heading uppercase tracking-wide mb-2">
                  우승팀 선택
                </label>
                <div className="space-y-2">
                  {selectedArchive.result_snapshot.map((team, idx) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeamIdx(idx)}
                      className={`w-full text-left border-4 px-4 py-3 transition-all ${
                        selectedTeamIdx === idx
                          ? "border-minion-blue bg-minion-blue/10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                          : "border-black hover:bg-gray-50"
                      }`}
                    >
                      <p className="font-heading font-black text-base">
                        {team.name}
                      </p>
                      <p className="text-xs font-bold text-gray-500">
                        팀장: {team.leader_name} · 선수: {team.players.length}명
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {saveError && (
                <p className="text-sm text-minion-red font-bold">{saveError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep("archive")}
                  className="pixel-button flex-1 bg-white py-3 font-heading text-sm uppercase"
                >
                  ← 이전
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || selectedTeamIdx === null}
                  className="pixel-button flex-1 bg-minion-yellow py-3 font-heading text-sm uppercase disabled:opacity-50"
                >
                  {isSaving ? "저장 중..." : "등록 완료"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
