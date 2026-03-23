"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, HelpCircle } from "lucide-react";

const HOW_TO_USE = [
  {
    step: "01",
    icon: "🍌",
    title: "경매방 만들기",
    desc: "팀 수, 인원, 포인트를 설정하고 팀장과 선수를 등록해 방을 생성합니다.",
  },
  {
    step: "02",
    icon: "🔗",
    title: "링크 공유",
    desc: "생성된 팀장별 링크를 각 팀장에게 공유합니다. 관전자 링크도 배포 가능합니다.",
  },
  {
    step: "03",
    icon: "✅",
    title: "접속 확인",
    desc: "경매 화면에서 팀장들의 실시간 접속 여부를 확인하고 경매를 시작하세요.",
  },
  {
    step: "04",
    icon: "🔥",
    title: "경매 진행",
    desc: "주최자가 선수를 추첨하면 각 팀장이 포인트로 입찰합니다. 최고 입찰 시 낙찰!",
  },
  {
    step: "05",
    icon: "🏆",
    title: "팀 확정",
    desc: "모든 선수가 낙찰되면 최종 팀 구성과 사용 포인트가 확정됩니다.",
  },
];

const TIPS = [
  "팀장 링크와 주최자 링크는 다른 주소입니다. 혼동하지 마세요!",
  "팀 예산 = 총 포인트 − 팀장 포인트",
  '경매 종료 후 "방 종료"를 누르면 결과가 아카이브에 영구 저장됩니다.',
];

export function HowToUseModal({
  variant = "default",
}: {
  variant?: "default" | "header";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const renderTriggerButton = () => {
    if (variant === "header") {
      return (
        <button
          onClick={() => setIsOpen(true)}
          className="pixel-button bg-gray-800 text-white px-4 h-10 text-[10px] font-heading uppercase tracking-tight shadow-none transition-all"
        >
          도움말
        </button>
      );
    }

    return (
      <button
        onClick={() => setIsOpen(true)}
        className="pixel-button w-full h-14 bg-white text-minion-blue text-fluid-xs font-heading uppercase tracking-tighter mt-4"
      >
        이용 방법
      </button>
    );
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-minion-blue px-4 py-4 flex items-center justify-between border-b-4 border-black shrink-0">
          <h2 className="text-sm font-black text-minion-yellow flex items-center gap-2">
            💡 이용 방법
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-minion-yellow transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 custom-scrollbar">
          {HOW_TO_USE.map((item) => (
            <div
              key={item.step}
              className="flex gap-4 bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="text-2xl shrink-0 mt-1">{item.icon}</div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-heading text-minion-blue bg-minion-yellow px-2 py-0.5 border border-black">
                    {item.step}단계
                  </span>
                  <h3 className="font-black text-gray-800 text-sm">
                    {item.title}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 font-bold leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}

          <div className="bg-black text-white border-2 border-minion-yellow p-4 mt-6">
            <p className="text-[10px] font-heading text-minion-yellow mb-2 uppercase">
              ● 알아두면 좋은 팁
            </p>
            <ul className="text-xs font-bold text-gray-300 space-y-2">
              {TIPS.map((tip, i) => (
                <li key={i} className="flex gap-2">
                  <span>-</span> {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t-4 border-black bg-white shrink-0">
          <button
            onClick={() => setIsOpen(false)}
            className="pixel-button w-full h-12 bg-black text-white text-[10px] font-heading uppercase tracking-tight"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {renderTriggerButton()}
      {isOpen && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
