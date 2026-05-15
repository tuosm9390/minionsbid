// 경매 대기 중인 선수 목록을 오른쪽 보조 패널에 표시하는 컴포넌트
import type { Player } from "@/features/auction/store/useAuctionStore";

const TIER_COLOR: Record<string, string> = {
  챌린저: "text-cyan-400",
  그랜드마스터: "text-red-500",
  마스터: "text-purple-400",
  다이아: "text-blue-400",
  에메랄드: "text-emerald-400",
  플래티넘: "text-teal-400",
  골드: "text-yellow-400",
  실버: "text-gray-600",
  브론즈: "text-amber-600",
};

interface WaitingPanelProps {
  players: Player[];
}

function formatPositions(player: Player) {
  const main = player.main_position || "-";
  const sub = player.sub_position || "-";
  return `${main}/${sub}`;
}

export function WaitingPanel({ players }: WaitingPanelProps) {
  if (players.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-center text-fluid-xs font-heading italic text-gray-400 opacity-60">
        대기 중인 선수가 없습니다
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex min-w-0 items-center gap-2 border-2 border-black bg-gray-50 px-2 py-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-colors hover:bg-minion-yellow/10"
          title={player.name}
        >
          <span className="min-w-0 flex-1 truncate text-fluid-xs font-semibold leading-tight text-gray-900">
            {player.name}
          </span>
          <span
            className={`shrink-0 text-fluid-xs font-heading ${TIER_COLOR[player.tier] || "text-gray-600"}`}
          >
            {player.tier}
          </span>
          <span className="shrink-0 text-fluid-xs font-bold text-gray-500">
            {formatPositions(player)}
          </span>
        </div>
      ))}
    </div>
  );
}
