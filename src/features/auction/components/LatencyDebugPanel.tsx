"use client";

import { useEffect, useState } from "react";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";

type LatencyMarker = {
  eventId: string;
  amount?: number | null;
  respondedAt?: number;
  appliedAt?: number;
  source?: "client-click" | "client-response" | "rtdb" | "room-fallback";
};

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).has("debugRealtime") ||
    window.localStorage.getItem("debugRealtime") === "1"
  );
}

function readMarkers() {
  if (typeof window === "undefined") return [] as LatencyMarker[];
  return (
    (
      window as Window & {
        __auctionLatencyMarkers__?: LatencyMarker[];
      }
    ).__auctionLatencyMarkers__ ?? []
  ).slice(-6).reverse();
}

function formatDelta(now: number, at?: number) {
  if (!at) return "-";
  return `${Math.max(0, now - at)}ms ago`;
}

export function LatencyDebugPanel() {
  const [debugState, setDebugState] = useState<{
    enabled: boolean;
    markers: LatencyMarker[];
    now: number;
  }>({
    enabled: false,
    markers: [],
    now: 0,
  });

  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt);
  const currentPlayerId = useAuctionStore((s) => s.currentPlayerId);
  const revision = useAuctionStore((s) => s.auctionEventRevision);
  const liveBid = useAuctionStore((s) => s.liveBid);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    const initialSnapshotId = window.setTimeout(() => {
      setDebugState({
        enabled: true,
        markers: readMarkers(),
        now: Date.now(),
      });
    }, 0);
    const intervalId = window.setInterval(() => {
      setDebugState({
        enabled: true,
        markers: readMarkers(),
        now: Date.now(),
      });
    }, 250);
    return () => {
      window.clearTimeout(initialSnapshotId);
      window.clearInterval(intervalId);
    };
  }, []);

  if (!debugState.enabled) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-[140] w-[320px] max-w-[calc(100vw-2rem)] pixel-box border-2 border-minion-blue bg-black/90 text-white shadow-[8px_8px_0px_rgba(0,0,0,1)] backdrop-blur-sm">
      <div className="border-b-4 border-minion-blue bg-minion-blue px-3 py-2 text-[11px] font-heading uppercase tracking-tight text-white">
        Realtime Debug
      </div>
      <div className="space-y-3 p-3 text-[11px]">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
          <span className="text-blue-200">revision</span>
          <span>{revision}</span>
          <span className="text-blue-200">player</span>
          <span>{currentPlayerId ?? "-"}</span>
          <span className="text-blue-200">bid</span>
          <span>{liveBid ? `${liveBid.team_id}:${liveBid.amount}` : "-"}</span>
          <span className="text-blue-200">timer</span>
          <span>{timerEndsAt ? "active" : "paused"}</span>
        </div>

        <div className="space-y-2">
          <div className="font-heading uppercase text-minion-yellow">Recent Markers</div>
          {debugState.markers.length === 0 ? (
            <div className="font-mono text-gray-400">no markers</div>
          ) : (
            debugState.markers.map((marker) => (
              <div
                key={`${marker.eventId}:${marker.source ?? "unknown"}`}
                className="border border-white/15 bg-white/5 p-2 font-mono"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-minion-yellow">
                    {marker.eventId}
                  </span>
                  <span className="uppercase text-blue-200">
                    {marker.source ?? "unknown"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-gray-300">
                  <span>amount {marker.amount ?? "-"}</span>
                  <span>{formatDelta(debugState.now, marker.appliedAt ?? marker.respondedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
