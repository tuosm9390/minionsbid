"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, AlertTriangle } from "@/components/ui/CyberIcons";
import { useOverlayDismiss } from "@/components/ui/useOverlayDismiss";

interface EndRoomModalProps {
  isOpen: boolean;
  isCompleted: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: (saveResult: boolean) => void;
}

export function EndRoomModal({
  isOpen,
  isCompleted,
  isDeleting,
  onClose,
  onConfirm,
}: EndRoomModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmed(false);
    onClose();
  };
  const overlayDismiss = useOverlayDismiss<HTMLDivElement>(handleClose);

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onMouseDown={overlayDismiss.onMouseDown}
      onMouseUp={overlayDismiss.onMouseUp}
    >
      <div
        className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b-4 border-black flex items-center justify-between bg-red-500 text-white">
          <div className="flex items-center gap-2.5">
            <Trash2 size={16} />
            <h2 className="text-md font-black">경매 종료</h2>
          </div>
          {!isDeleting && (
            <button
              onClick={handleClose}
              className="hover:bg-white/20 p-1 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          <div className="bg-red-50 border-2 border-black p-3 flex gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-fluid-xs font-bold text-red-700 space-y-1">
              <p className="text-xs font-black uppercase">데이터 삭제 경고</p>
              <p className="leading-tight">
                경매를 종료하면 입찰 기록, 채팅 등 모든 데이터가 영구 삭제되며
                복구할 수 없습니다.
              </p>
            </div>
          </div>

          {!isCompleted && (
            <label className="flex items-start gap-2.5 cursor-pointer select-none group mt-1">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-500 border-2 border-black rounded-none"
              />
              <span className="text-fluid-xs font-bold text-gray-600 group-hover:text-black transition-colors leading-tight">
                데이터 삭제 내용을 확인했으며 경매를 종료하는 것에 동의합니다.
              </span>
            </label>
          )}

          {isCompleted && (
            <div className="bg-green-50 border-2 border-black p-3 text-fluid-xs font-bold text-green-700">
              <p className="text-xs font-black mb-1 uppercase">경매 완료!</p>
              <p>
                결과를 저장하면 나중에 아카이브에서 다시 확인할 수 있습니다.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 flex flex-col gap-3">
          {isCompleted ? (
            <>
              <button
                onClick={() => onConfirm(true)}
                disabled={isDeleting}
                className="pixel-button w-full py-3 bg-minion-blue text-white text-fluid-xs"
              >
                {isDeleting ? "저장하는중..." : "저장 & 종료"}
              </button>
              <button
                onClick={() => onConfirm(false)}
                disabled={isDeleting}
                className="pixel-button w-full py-2 bg-white text-red-600 text-fluid-xs"
              >
                저장하지 않고 종료
              </button>
            </>
          ) : (
            <button
              onClick={() => onConfirm(false)}
              disabled={isDeleting || !confirmed}
              className="pixel-button w-full py-3 bg-red-500 text-white text-fluid-xs"
            >
              {isDeleting ? "방 삭제중..." : "방 삭제"}
            </button>
          )}
          {!isDeleting && (
            <button
              onClick={handleClose}
              className="pixel-button w-full py-2 bg-white text-gray-500 text-fluid-xs"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
