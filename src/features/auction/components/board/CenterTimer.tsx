"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";

interface CenterTimerProps {
  timerEndsAt: string;
  auctionDurationMs?: number;
  onExpire?: () => void;
}

export function CenterTimer({ timerEndsAt, auctionDurationMs, onExpire }: CenterTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const target = new Date(timerEndsAt).getTime();
  const durationKey = `${target}:${auctionDurationMs ?? "auto"}`;
  // auctionDurationMs가 주어지면 progress bar 계산에 사용 (연장 시에도 일관된 비율)
  // 주어지지 않으면 기존 로직대로 timerEndsAt에서 역산
  const [durationState, setDurationState] = useState(() => ({
    duration: auctionDurationMs ?? Math.max(target - Date.now(), 1),
    key: durationKey,
  }));
  const hasExpiredRef = useRef(false);

  const timeLeftMs = Math.max(0, target - now);
  const timeLeftSec = Math.max(0, (timeLeftMs - 100) / 1000);
  const isUrgent = Math.ceil(timeLeftSec) > 0 && Math.ceil(timeLeftSec) <= 5;
  const initialDuration =
    durationState.key === durationKey
      ? durationState.duration
      : auctionDurationMs ?? Math.max(target - now, 1);

  // urgent 구간(≤5s)에서만 100ms, 평상시는 200ms로 렌더링 빈도 절반 감소
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), isUrgent ? 100 : 200);
    return () => clearInterval(iv);
  }, [isUrgent]);

  useEffect(() => {
    // 입찰 연장 시에는 남은 시간으로 initialDuration을 갱신하되,
    // auctionDurationMs가 있으면 그 값을 우선 사용
    hasExpiredRef.current = false;
    const timeoutId = window.setTimeout(() => {
      setDurationState({
        duration: auctionDurationMs ?? Math.max(target - Date.now(), 1),
        key: durationKey,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [auctionDurationMs, durationKey, target]);

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
      const start = window.setTimeout(() => setIsTickShaking(true), 0);
      const t = setTimeout(() => setIsTickShaking(false), isUrgent ? 310 : 160);
      return () => {
        window.clearTimeout(start);
        clearTimeout(t);
      };
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
