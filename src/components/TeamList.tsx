'use client'

import { useAuctionStore, Team, Player } from '@/store/useAuctionStore'

export function TeamList() {
  const teams = useAuctionStore((state) => state.teams || [])
  const players = useAuctionStore((state) => state.players || [])
  const myTeamId = useAuctionStore((state) => state.teamId)
  const membersPerTeam = useAuctionStore((state) => state.membersPerTeam)

  const unsoldPlayers = players.filter((p: Player) => p.status === 'UNSOLD')

  if (teams.length === 0) {
    return <div className="text-muted-foreground text-sm text-center py-10">생성된 팀이 없습니다. 주최자가 팀을 등록해야 합니다.</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {teams.map((team: Team) => {
        const teamPlayers = players.filter(p => p.team_id === team.id)
        const isMyTeam = team.id === myTeamId

        return (
          <div
            key={team.id}
            className={`p-3 rounded-xl border-2 transition-all duration-300 ${isMyTeam ? 'border-minion-yellow bg-minion-yellow/10 shadow-md' : 'border-gray-100 bg-gray-50'}`}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                {isMyTeam && <span className="text-minion-yellow text-lg">★</span>}
                {team.name}
              </h3>
              <div className="font-mono font-bold text-minion-blue bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
                {team.point_balance} P
              </div>
            </div>

            {/* 낙찰된 선수 목록 */}
            <div className="space-y-1 mt-3">
              <p className="text-xs text-muted-foreground font-semibold mb-1">낙찰 선수 ({teamPlayers.length}/{membersPerTeam - 1})</p>
              {teamPlayers.length === 0 ? (
                <div className="text-xs text-gray-400 italic">아직 낙찰된 선수가 없습니다.</div>
              ) : (
                teamPlayers.map((p: Player) => (
                  <div key={p.id} className="flex justify-between items-center text-sm bg-white p-1.5 rounded border border-gray-100">
                    <span className="font-medium text-gray-700 truncate mr-2">{p.name}</span>
                    <span className="text-xs font-mono text-gray-500">{p.sold_price || 0}P</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}

      {/* 유찰된 선수 목록 */}
      <div className="mt-4 p-3 rounded-xl border-2 border-red-200 bg-red-50">
        <h3 className="font-bold text-red-800 flex items-center gap-2 mb-2 text-sm">
          <span>😭</span> 유찰 선수 명단
          <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{unsoldPlayers.length}명</span>
        </h3>
        {unsoldPlayers.length === 0 ? (
          <div className="text-xs text-red-400/70 italic p-1">아직 유찰된 선수가 없습니다.</div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {unsoldPlayers.map((p: Player) => (
              <div key={p.id} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-red-100 shadow-sm">
                <span className="font-bold text-gray-700 truncate mr-2">{p.name}</span>
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{p.tier}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
