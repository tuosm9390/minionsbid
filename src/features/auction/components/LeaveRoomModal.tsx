"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, LogOut, AlertCircle } from "lucide-react";

interface LeaveRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LeaveRoomModal({
  isOpen,
  onClose,
  onConfirm,
}: LeaveRoomModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm animate-in zoom-in-95 duration-200 cursor-default overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b-4 border-black flex items-center justify-between bg-minion-yellow">
          <div className="flex items-center gap-3">
            <LogOut size={18} className="text-black" />
            <h2 className="text-sm font-black text-black">방 나가기</h2>
          </div>
          <button
            onClick={onClose}
            className="text-black hover:bg-black/10 p-1 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-6 space-y-4">
          <div className="bg-blue-50 border-2 border-black p-4 flex gap-3">
            <AlertCircle
              size={20}
              className="text-minion-blue shrink-0 mt-0.5"
            />
            <div className="text-xs font-bold text-gray-700 space-y-1">
              <p className="text-sm font-black">정말로 나가시겠습니까?</p>
              <p className="leading-relaxed">
                경매방에 다시 접속하려면 초대 링크가 필요합니다. 진행 중인
                데이터는 서버에 안전하게 보관됩니다.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex flex-col gap-3">
          <button
            onClick={onConfirm}
            className="pixel-button w-full py-3 bg-red-500 text-white text-xs"
          >
            <LogOut size={14} className="mr-2" />
            나가기
          </button>
          <button
            onClick={onClose}
            className="pixel-button w-full py-3 bg-white text-gray-500 text-xs"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}
