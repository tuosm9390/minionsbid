'use client'

import { useAuctionStore, Team, Player } from '@/store/useAuctionStore'

export function UnsoldPanel() {
  const players = useAuctionStore((state) => state.players || [])
  const unsoldPlayers = players.filter((p: Player) => p.status === 'UNSOLD')

  if (unsoldPlayers.length === 0) return (
    <div className="flex-1 flex justify-center items-center py-10 text-sm text-gray-400 font-medium">유찰된 선수가 없습니다.</div>
  )

  return (
    <div className="flex flex-col gap-1.5 pb-2">
      <div className="flex justify-between items-center mb-1 px-1">
        <span className="text-xs font-bold text-gray-500">총 인원</span>
        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{unsoldPlayers.length}명</span>
      </div>
      {unsoldPlayers.map((p: Player) => (
        <div key={p.id} className="flex justify-between items-center text-xs bg-red-50 hover:bg-red-100 transition-colors p-2.5 rounded-xl border border-red-100/50 shadow-sm">
          <span className="font-bold text-gray-800 truncate mr-2">{p.name}</span>
          <span className="text-[10px] font-black text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-100">{p.tier}</span>
        </div>
      ))}
    </div>
  )
}

export function TeamList() {
  const teams = useAuctionStore((state) => state.teams || [])
  const players = useAuctionStore((state) => state.players || [])
  const myTeamId = useAuctionStore((state) => state.teamId)
  const membersPerTeam = useAuctionStore((state) => state.membersPerTeam)

  if (teams.length === 0) {
    return <div className="text-muted-foreground text-sm text-center py-10">생성된 팀이 없습니다. 주최자가 팀을 등록해야 합니다.</div>
  }

  const sortedTeams = [...teams].sort((a, b) => {
    // 내 팀은 무조건 맨 위로
    if (a.id === myTeamId) return -1;
    if (b.id === myTeamId) return 1;

    // 나머지 팀은 이름(예: 1팀, 2팀)에 포함된 숫자를 기준으로 순차 정렬
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  return (
    <div className="flex flex-col gap-3">
      {sortedTeams.map((team: Team) => {
        const teamPlayers = players.filter(p => p.team_id === team.id)
        const isMyTeam = team.id === myTeamId
        const isTeamComplete = teamPlayers.length === (membersPerTeam - 1)

        return (
          <div
            key={team.id}
            className={`p-3 rounded-xl border-2 transition-all duration-300 relative overflow-hidden
              ${isTeamComplete
                ? 'border-green-400 bg-green-50/80 shadow-md ring-2 ring-green-400/20'
                : isMyTeam
                  ? 'border-minion-yellow bg-minion-yellow/10 shadow-md'
                  : 'border-gray-100 bg-gray-50'
              }`}
          >
            {isTeamComplete && (
              <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none">
                <div className="absolute top-3 -right-6 origin-center rotate-45 bg-green-500 text-white text-[10px] font-bold py-1 px-8 shadow-sm">
                  COMPLETED
                </div>
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-bold flex items-center gap-2 ${isTeamComplete ? 'text-green-800' : 'text-gray-800'}`}>
                {isMyTeam && <span className="text-minion-yellow text-lg">★</span>}
                {team.name}
              </h3>
              <div className={`font-mono font-bold px-2 py-1 rounded shadow-sm border ${isTeamComplete
                ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-white text-minion-blue border-gray-200'
                }`}>
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

    </div>
  )
}
