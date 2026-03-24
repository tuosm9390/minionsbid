"use client";

import { createPortal } from "react-dom";
import { X, ExternalLink, Check } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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
        className="pixel-button w-full sm:w-auto bg-minion-yellow text-black py-5 px-12 text-fluid-sm font-heading shadow-[8px_8px_0px_rgba(0,0,0,1)] hover:scale-105 active:scale-95 transition-all"
      >
        MAKE ROOM
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => {
              if (step < 3) close();
            }}
          >
            <div
              className="bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] w-full max-w-3xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-200 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b-4 border-black flex items-center justify-between shrink-0 bg-black text-white">
                <div className="flex items-center gap-3">
                  <div className="bg-minion-yellow p-1 pixel-box border-2 shadow-none">
                    <Image
                      src="/favicon.png"
                      alt="Minions Icon"
                      width={24}
                      height={24}
                      className="pixelated"
                    />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-fluid-xs font-heading text-minion-yellow leading-none mb-1">
                      NEW MISSION
                    </h2>
                    <p className="text-fluid-xs font-bold text-gray-400 uppercase tracking-widest">
                      Step {step + 1}: {STEPS[step]}
                    </p>
                  </div>
                </div>
                {step < 3 && (
                  <button
                    onClick={close}
                    className="bg-minion-red text-white p-1 pixel-box border-2 shadow-none hover:bg-minion-red-hover transition-colors"
                  >
                    <X size={18} className="text-black" />
                  </button>
                )}
              </div>

              {/* Dynamic Step Progress Indicator */}
              <div className="bg-gray-50 border-b-4 border-black px-10 py-10 relative overflow-hidden shrink-0">
                <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(black_2px,transparent_2px)] bg-[size:16px_16px] pointer-events-none" />

                <div className="relative flex justify-between items-center max-w-xl mx-auto">
                  {/* Track Line */}
                  <div className="absolute left-0 top-[20px] w-full h-1 bg-black/10 z-0" />

                  {/* Animated Minion Character */}
                  <motion.div
                    initial={false}
                    animate={{
                      left: `calc(${(step / (STEPS.length - 1)) * 100}% + ${
                        20 - (step / (STEPS.length - 1)) * 40
                      }px)`,
                    }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="absolute top-[-35px] z-20 flex flex-col items-center pointer-events-none -translate-x-1/2"
                  >
                    <div className="bg-minion-yellow text-black text-[10px] font-black px-2 py-0.5 border-2 border-black mb-1 animate-minion-bounce shadow-pixel-sm whitespace-nowrap">
                      (•‿•) MISSION!
                    </div>
                    <div className="w-2 h-2 bg-black rotate-45 translate-y-[-4px]" />
                  </motion.div>

                  {STEPS.map((label, i) => (
                    <div
                      key={label}
                      className="relative z-10 flex flex-col items-center gap-3"
                    >
                      <div
                        className={`w-10 h-10 flex items-center justify-center border-4 font-black text-fluid-xs transition-all duration-300 ${
                          i <= step
                            ? "bg-black text-minion-yellow border-black scale-110 shadow-pixel-sm"
                            : "bg-white text-gray-300 border-gray-200"
                        }`}
                      >
                        {i < step ? <Check size={18} strokeWidth={4} /> : i + 1}
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase tracking-tighter transition-colors duration-300 ${
                          i <= step ? "text-black" : "text-gray-300"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar font-body">
                {step === 0 && (
                  <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                    <BasicInfoStep
                      basic={basic}
                      setBasic={setBasic}
                      activeRooms={activeRooms}
                      isCheckingRooms={isCheckingRooms}
                      goToRoom={goToRoom}
                      minPlayers={minPlayers}
                    />
                  </div>
                )}
                {step === 1 && (
                  <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                    <CaptainRegistrationStep
                      captains={captains}
                      setCaptains={setCaptains}
                      totalPoints={basic.totalPoints}
                      openTemplateModal={openTemplateModal}
                    />
                  </div>
                )}
                {step === 2 && (
                  <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                    <PlayerRegistrationStep
                      players={players}
                      setPlayers={setPlayers}
                      minPlayers={minPlayers}
                      openTemplateModal={openTemplateModal}
                      fileInputRef={fileInputRef}
                      handleExcelUpload={handleExcelUpload}
                      isUploading={isUploading}
                    />
                  </div>
                )}
                {step === 3 && links && (
                  <div className="animate-in fade-in zoom-in-95 duration-500">
                    <LinksStep
                      links={links}
                      copied={copied}
                      onCopy={copyToClipboard}
                    />
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-8 py-5 border-t-4 border-black bg-gray-50 flex justify-between items-center shrink-0">
                {step < 3 ? (
                  <>
                    <button
                      onClick={step === 0 ? close : () => setStep((s) => s - 1)}
                      className="pixel-button bg-white text-black px-6 py-2.5 text-fluid-xs font-bold hover:bg-gray-100"
                    >
                      {step === 0 ? "CANCEL" : "BACK"}
                    </button>
                    <button
                      data-testid="next-button"
                      onClick={handleNext}
                      disabled={isLoading}
                      className="pixel-button bg-black text-minion-yellow px-10 py-3 text-fluid-xs font-heading disabled:opacity-50 hover:bg-minion-blue hover:text-white transition-colors"
                    >
                      {isLoading
                        ? "PROCESSING..."
                        : step === 2
                          ? "CREATE ROOM ✨"
                          : "NEXT STEP"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={close}
                      className="pixel-button bg-white text-black px-6 py-2.5 text-fluid-xs font-bold"
                    >
                      CLOSE
                    </button>
                    {links && (
                      <button
                        onClick={() => {
                          window.location.href = links.organizerPath;
                          close();
                        }}
                        className="pixel-button bg-minion-yellow text-black px-8 py-3 text-fluid-xs font-heading hover:scale-105 transition-transform flex items-center gap-3"
                      >
                        START AUCTION <ExternalLink size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {typeof document !== "undefined" &&
        createPortal(
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
          />,
          document.body,
        )}
    </>
  );
}
