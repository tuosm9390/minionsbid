"use client";

import { useState, useEffect } from "react";
import { getServerTime } from "@/features/auction/hooks/useServerTimeOffset";

interface ElapsedTimerProps {
  createdAt: string;
}

export function ElapsedTimer({ createdAt }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!createdAt) return;
    const start = new Date(createdAt).getTime();
    const iv = setInterval(() => {
      const sec = Math.floor((getServerTime() - start) / 1000);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      setElapsed(
        `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [createdAt]);

  return (
    <div className="pixel-box bg-black px-4 py-1 text-fluid-xs text-minion-yellow flex gap-2 items-center font-heading border-white/20">
      <span className="animate-pulse">●</span>{" "}
      <span className="font-black">PLAY TIME </span>
      <b className="text-black">{elapsed}</b>
    </div>
  );
}
