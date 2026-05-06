"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";

interface CenterTimerProps {
  timerEndsAt: string;
  onExpire?: () => void;
}

export function CenterTimer({ timerEndsAt, onExpire }: CenterTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [initialDuration, setInitialDuration] = useState<number>(() =>
    Math.max(new Date(timerEndsAt).getTime() - Date.now(), 1)
  );
  const hasExpiredRef = useRef(false);

  const target = new Date(timerEndsAt).getTime();
  const timeLeftMs = Math.max(0, target - now);
  const timeLeftSec = Math.max(0, (timeLeftMs - 100) / 1000);
  const isUrgent = Math.ceil(timeLeftSec) > 0 && Math.ceil(timeLeftSec) <= 5;

  // urgent 구간(≤5s)에서만 100ms, 평상시는 200ms로 렌더링 빈도 절반 감소
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), isUrgent ? 100 : 200);
    return () => clearInterval(iv);
  }, [isUrgent]);

  useEffect(() => {
    setInitialDuration(Math.max(target - Date.now(), 1));
    hasExpiredRef.current = false;
  }, [target]);

  useEffect(() => {
    if (timeLeftMs > 0 || hasExpiredRef.current) return;
    hasExpiredRef.current = true;
    onExpire?.();
  }, [onExpire, timeLeftMs]);

  const displayTime = Math.ceil(timeLeftSec);
  const progress = Math.min(100, Math.max(0, (timeLeftMs / initialDuration) * 100));
  const pad = (n: number) => String(n).padStart(2, "0");

  // 매 초 변경 시에만 단발성 shake 트리거 (무한 반복 없음)
  // urgent(≤5s): 300ms 강한 흔들림 / 평상시: 150ms 틱 흔들림
  const [isTickShaking, setIsTickShaking] = useState(false);
  const prevDisplayTimeRef = useRef(displayTime);
  useEffect(() => {
    if (prevDisplayTimeRef.current !== displayTime && displayTime > 0) {
      prevDisplayTimeRef.current = displayTime;
      setIsTickShaking(true);
      const t = setTimeout(() => setIsTickShaking(false), isUrgent ? 310 : 160);
      return () => clearTimeout(t);
    }
  }, [displayTime, isUrgent]);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div
        className={cn(
          "pixel-box px-5 py-2 flex items-center gap-3 transition-colors duration-300",
          isUrgent
            ? cn("bg-white border-minion-red text-minion-red", isTickShaking && "animate-urgent-shake")
            : cn("bg-black border-black text-minion-yellow", isTickShaking && "animate-timer-tick")
        )}
        role="timer"
        aria-live={isUrgent ? "assertive" : "off"}
        aria-atomic="true"
        aria-label={`남은 시간: ${isUrgent ? timeLeftSec.toFixed(1) : displayTime}초`}
      >
        <PixelIcon
          icon={isUrgent ? PIXEL_ICONS.WARNING : PIXEL_ICONS.TIMER}
          color={isUrgent ? "text-minion-red" : "text-minion-yellow"}
          size={24}
          animation={isUrgent ? "urgent" : "idle"}
        />
        <span className="text-fluid-lg font-heading tracking-widest tabular-nums leading-none">
          {isUrgent
            ? timeLeftSec.toFixed(1)
            : `${pad(Math.floor(displayTime / 60))}:${pad(displayTime % 60)}`}
        </span>
      </div>
      
      {/* Progress Bar with CRT feel */}
      <div 
        className={cn(
          "w-48 h-4 bg-black/20 border-4 border-black relative overflow-hidden shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3)] transition-colors",
          isUrgent && "border-minion-red"
        )}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full transition-all duration-150",
            isUrgent ? "bg-minion-red" : "bg-minion-yellow"
          )}
          style={{ width: `${progress}%` }}
        />
        {/* Decorative scanline on progress bar */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
