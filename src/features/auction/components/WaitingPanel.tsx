// 경매 대기 중인 선수 목록을 오른쪽 보조 패널에 표시하는 컴포넌트
import type { Player } from "@/features/auction/store/useAuctionStore";

interface WaitingPanelProps {
  players: Player[];
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
    <div className="grid w-full grid-cols-3 gap-1.5 2xl:grid-cols-4">
      {players.map((player) => (
        <div
          key={player.id}
          className="min-w-0 border-2 border-black bg-gray-50 px-1.5 py-1 shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-colors hover:bg-minion-yellow/10"
          title={player.name}
        >
          <div className="truncate text-center text-fluid-xs font-semibold leading-tight text-gray-900">
            {player.name}
          </div>
        </div>
      ))}
    </div>
  );
}
