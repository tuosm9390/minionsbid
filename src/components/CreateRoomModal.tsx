"use client";

import { X, ExternalLink, Check } from "lucide-react";
import Image from "next/image";
import { useCreateRoom } from "@/features/auction/hooks/useCreateRoom";
import { BasicInfoStep } from "./create-room/BasicInfoStep";
import { CaptainRegistrationStep } from "./create-room/CaptainRegistrationStep";
import { PlayerRegistrationStep } from "./create-room/PlayerRegistrationStep";
import { LinksStep } from "./create-room/LinksStep";
import { TemplatePreviewModal } from "./create-room/TemplatePreviewModal";

const STEPS = ["기본 정보", "팀장 등록", "선수 등록", "링크 발급"];

export function CreateRoomModal() {
  const {
    isOpen,
    setIsOpen,
    step,
    setStep,
    isLoading,
    isUploading,
    copied,
    fileInputRef,
    activeRooms,
    isCheckingRooms,
    basic,
    setBasic,
    captains,
    setCaptains,
    players,
    setPlayers,
    links,
    isTemplateModalOpen,
    setIsTemplateModalOpen,
    templateData,
    setTemplateData,
    handleNext,
    handleExcelUpload,
    copyToClipboard,
    close,
    goToRoom,
    openTemplateModal,
    applyTemplate,
    buildTemplateData,
  } = useCreateRoom();

  const minPlayers = basic.teamCount * (basic.membersPerTeam - 1);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="pixel-button w-[200px] sm:w-auto bg-minion-yellow text-black py-5 px-12 text-xl font-heading shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-2 active:translate-y-2 transition-all"
      >
        MAKE ROOM
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => {
            if (step < 3) close();
          }}
        >
          <div
            className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-3xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b-4 border-black flex items-center justify-between shrink-0 bg-minion-yellow">
              <div className="flex items-center gap-2">
                <Image
                  src="/favicon.png"
                  alt="Minions Icon"
                  width={28}
                  height={28}
                  className="drop-shadow-sm"
                />
                <h2 className="font-black text-lg font-heading text-black uppercase">
                  경매방 만들기
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {STEPS[step]} ({step + 1}/{STEPS.length})
                </p>
              </div>
              {step < 3 && (
                <button
                  onClick={close}
                  className="text-black hover:bg-black/10 p-1 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Step Indicator */}
            <div className="px-6 pt-4 pb-2 flex items-center shrink-0">
              {STEPS.map((label, i) => (
                <div
                  key={i}
                  className="flex items-center"
                  style={{ flex: i < STEPS.length - 1 ? "1" : "initial" }}
                >
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors shrink-0 ${
                      i < step
                        ? "bg-green-500 text-white"
                        : i === step
                          ? "bg-black text-white"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i < step ? <Check size={13} /> : i + 1}
                  </div>
                  <span
                    className={`ml-1.5 text-xs font-medium whitespace-nowrap ${i === step ? "text-black" : "text-gray-400"}`}
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 rounded-full ${i < step ? "bg-green-400" : "bg-gray-100"}`}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
              {step === 0 && (
                <BasicInfoStep
                  basic={basic}
                  setBasic={setBasic}
                  activeRooms={activeRooms}
                  isCheckingRooms={isCheckingRooms}
                  goToRoom={goToRoom}
                  minPlayers={minPlayers}
                />
              )}
              {step === 1 && (
                <CaptainRegistrationStep
                  captains={captains}
                  setCaptains={setCaptains}
                  totalPoints={basic.totalPoints}
                  openTemplateModal={openTemplateModal}
                />
              )}
              {step === 2 && (
                <PlayerRegistrationStep
                  players={players}
                  setPlayers={setPlayers}
                  minPlayers={minPlayers}
                  openTemplateModal={openTemplateModal}
                  fileInputRef={fileInputRef}
                  handleExcelUpload={handleExcelUpload}
                  isUploading={isUploading}
                />
              )}
              {step === 3 && links && (
                <LinksStep
                  links={links}
                  copied={copied}
                  onCopy={copyToClipboard}
                />
              )}
            </div>

            <div className="px-6 py-4 border-t-4 border-black bg-white flex justify-between items-center shrink-0">
              {step < 3 ? (
                <>
                  <button
                    onClick={step === 0 ? close : () => setStep((s) => s - 1)}
                    className="pixel-button bg-white text-black px-5 py-2.5 text-sm font-bold"
                  >
                    {step === 0 ? "취소" : "← 이전"}
                  </button>
                  <button
                    data-testid="next-button"
                    onClick={handleNext}
                    disabled={isLoading}
                    className="pixel-button bg-black text-white px-8 py-3 text-sm font-heading disabled:opacity-50"
                  >
                    {isLoading
                      ? "생성 중..."
                      : step === 2
                        ? "방 만들기 🎉"
                        : "다음 →"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={close}
                    className="pixel-button bg-white text-black px-5 py-2.5 text-sm font-bold"
                  >
                    닫기
                  </button>
                  {links && (
                    <button
                      onClick={() => {
                        window.location.href = links.organizerPath;
                        close();
                      }}
                      className="pixel-button bg-minion-yellow hover:bg-minion-yellow-hover text-black px-6 py-2.5 text-sm font-black transition-colors flex items-center gap-2 shadow-[0_4px_0_#D9B310]"
                    >
                      경매 시작하기 <ExternalLink size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <TemplatePreviewModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        basic={basic}
        templateData={templateData}
        onApply={applyTemplate}
        onRegenerate={() =>
          setTemplateData(
            buildTemplateData(basic.teamCount, basic.membersPerTeam),
          )
        }
      />
    </>
  );
}
