"use client";

import { useState, useEffect } from "react";
import { Player } from "@/features/auction/store/useAuctionStore";

interface LotteryAnimationProps {
  candidates: Player[];
  targetPlayer: Player;
  onFinished?: () => void;
}

const ITEM_HEIGHT = 80; // 중앙 보드에 맞게 높이 축소

export function LotteryAnimation({
  candidates,
  targetPlayer,
  onFinished,
}: LotteryAnimationProps) {
  const [isSpinning, setIsSpinning] = useState(true);
  const [startRoll, setStartRoll] = useState(false);

  // 40개의 랜덤 선수 목록 생성 + 마지막에 실제 당첨자 배치 (슬롯머신 트랙)
  const [trackItems] = useState<Player[]>(() => {
    const cand = candidates.length > 0 ? candidates : [targetPlayer];
    const items: Player[] = [];
    for (let i = 0; i < 40; i++) {
      items.push(cand[Math.floor(Math.random() * cand.length)]);
    }
    items.push(targetPlayer);
    return items;
  });

  useEffect(() => {
    // 약간의 지연 후 CSS 트랜지션 트리거
    const timer1 = setTimeout(() => {
      setStartRoll(true);
    }, 100);

    // 애니메이션 3초간 진행 후 종료 상태로 변경
    const timer2 = setTimeout(() => {
      setIsSpinning(false);
      onFinished?.();
    }, 3100);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [targetPlayer]);

  // 40개의 가짜 항목들을 지나서 정확히 41번째(인덱스 40) 아이템으로 translateY 이동
  const targetTranslateY = -(40 * ITEM_HEIGHT);

  return (
    <div className="w-full flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in-95 duration-500 py-4">
      <div
        className={`text-xl font-black tracking-widest transition-all duration-500 ${
          isSpinning
            ? "text-minion-blue animate-pulse"
            : "text-minion-blue scale-110"
        }`}
      >
        {isSpinning ? "🎰 추첨 중..." : "🎉 추첨 완료!"}
      </div>

      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-gray-50 border-4 border-minion-yellow shadow-inner relative mx-auto"
        style={{ height: `${ITEM_HEIGHT}px` }}
      >
        <div
          className="flex flex-col w-full absolute top-0 left-0 px-4"
          style={{
            transform: startRoll
              ? `translateY(${targetTranslateY}px)`
              : "translateY(0px)",
            transition: startRoll
              ? "transform 4s cubic-bezier(0.1, 0.8, 0.2, 1)"
              : "none",
          }}
        >
          {trackItems.map((p, idx) => (
            <div
              key={idx}
              className="w-full flex flex-col items-center justify-center shrink-0"
              style={{ height: `${ITEM_HEIGHT}px` }}
            >
              <span
                className={`text-2xl font-black w-full text-center truncate transition-all duration-300 ${
                  !isSpinning && idx === 40
                    ? "text-minion-blue scale-110"
                    : "text-gray-400"
                }`}
                title={p.name}
              >
                {p.name}
              </span>
              <span
                className={`text-xs font-bold transition-all duration-300 ${
                  !isSpinning && idx === 40
                    ? "text-minion-blue/60 scale-110"
                    : "text-gray-300"
                }`}
              >
                {p.tier} / {p.main_position}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
