'use client'

import { useAuctionStore, Team, Player } from '@/features/auction/store/useAuctionStore'

const TIER_COLOR: Record<string, string> = {
  '챌린저': 'text-cyan-600', '그랜드마스터': 'text-red-600', '마스터': 'text-purple-600',
  '다이아': 'text-blue-500', '에메랄드': 'text-emerald-600', '플래티넘': 'text-teal-600',
  '골드': 'text-yellow-600', '실버': 'text-gray-500', '브론즈': 'text-amber-800',
}

export function UnsoldPanel() {
  const players = useAuctionStore((state) => state.players || [])
  const unsoldPlayers = players.filter((p: Player) => p.status === 'UNSOLD')

  if (unsoldPlayers.length === 0) return (
    <div className="flex-1 flex justify-center items-center py-6 text-sm text-gray-400 font-bold italic">유찰 선수가 없습니다.</div>
  )

  return (
    <div className="flex flex-col gap-1 pb-1 w-full">
      <div className="flex justify-between items-center mb-1 px-0.5">
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Total Unsold</span>
        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-black shadow-sm">{unsoldPlayers.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {unsoldPlayers.map((p: Player) => (
          <div key={p.id} className="flex justify-between items-center bg-red-50/50 hover:bg-red-50 p-1.5 rounded-lg border border-red-100 transition-colors shadow-sm">
            <span className="font-black text-gray-800 text-[12px] truncate mr-2">{p.name}</span>
            <span className={`text-[9px] font-black bg-white px-1.5 py-0.5 rounded border border-red-100 ${TIER_COLOR[p.tier] || 'text-gray-400'}`}>{p.tier}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TeamList() {
  const teams = useAuctionStore((state) => state.teams || [])
  const players = useAuctionStore((state) => state.players || [])
  const myTeamId = useAuctionStore((state) => state.teamId)
  const membersPerTeam = useAuctionStore((state) => state.membersPerTeam)

  if (teams.length === 0) return <div className="text-gray-400 text-sm text-center py-10 font-bold">팀 정보가 없습니다.</div>

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === myTeamId) return -1
    if (b.id === myTeamId) return 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })

  return (
    <div className="flex flex-col gap-3">
      {sortedTeams.map((team: Team) => {
        const teamPlayers = players.filter(p => p.team_id === team.id)
        const isMyTeam = team.id === myTeamId
        const isTeamComplete = teamPlayers.length === (membersPerTeam - 1)

        return (
          <div key={team.id} className={`p-3.5 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${isTeamComplete ? 'border-green-400 bg-green-50/50 shadow-md' : isMyTeam ? 'border-minion-blue bg-blue-50/50 shadow-md ring-2 ring-minion-blue/10' : 'border-gray-100 bg-gray-50/30'}`}>
            {isTeamComplete && (
              <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none">
                <div className="absolute top-2 -right-4 origin-center rotate-45 bg-green-500 text-white text-[8px] font-black py-0.5 px-6 shadow-sm">DONE</div>
              </div>
            )}
            <div className="flex justify-between items-start mb-2.5">
              <h3 className={`font-black text-base flex items-center gap-1.5 ${isTeamComplete ? 'text-green-700' : isMyTeam ? 'text-minion-blue' : 'text-gray-800'}`}>
                {isMyTeam && <span className="text-minion-yellow text-xl drop-shadow-sm">★</span>}
                {team.name}
              </h3>
              <div className={`font-mono font-black px-2 py-1 rounded-lg text-sm shadow-sm border ${isTeamComplete ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-minion-blue border-gray-200'}`}>
                {team.point_balance.toLocaleString()}P
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1.5 flex justify-between items-center px-0.5">
                <span>Roster</span>
                <span className={isTeamComplete ? 'text-green-500' : 'text-gray-400'}>{teamPlayers.length} / {membersPerTeam - 1}</span>
              </p>
              {teamPlayers.length === 0 ? (
                <div className="text-[11px] text-gray-300 font-bold italic py-1 px-1">No players drafted yet.</div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  {teamPlayers.map((p: Player) => (
                    <div key={p.id} className="flex justify-between items-center text-[13px] bg-white/80 p-2 rounded-xl border border-gray-100/50 shadow-sm group hover:border-minion-blue/30 transition-colors">
                      <span className="font-bold text-gray-700 truncate">{p.name}</span>
                      <span className="font-black text-minion-blue bg-blue-50 px-1.5 py-0.5 rounded-md text-[10px]">{p.sold_price || 0}P</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
