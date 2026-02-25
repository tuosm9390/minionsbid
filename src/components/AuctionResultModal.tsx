import { useAuctionStore, Team, Player } from '@/store/useAuctionStore'
import { X, Trophy } from 'lucide-react'

export function AuctionResultModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const teams = useAuctionStore((state) => state.teams || [])
  const players = useAuctionStore((state) => state.players || [])

  if (!isOpen) return null

  // 1팀부터 정렬 (이름 기준 오름차순 정도)
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR', { numeric: true }))

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-minion-yellow/20 rounded-full blur-[80px] pointer-events-none transform-gpu" />

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white/95 rounded-t-3xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-minion-yellow rounded-xl flex items-center justify-center shadow-inner pt-1 text-xl">
              <Trophy size={20} className="text-orange-600 mb-1" />
            </div>
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">최종 경매 결과</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors bg-white shadow-sm border border-gray-100"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 z-10 bg-gray-50/50">
          {sortedTeams.length === 0 ? (
            <div className="text-center py-20 text-gray-400 font-bold">표시할 팀 데이터가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {sortedTeams.map((team: Team) => {
                const teamPlayers = players.filter(p => p.team_id === team.id)

                return (
                  <div key={team.id} className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {/* 헤더 행: 왼쪽엔 팀명, 오른쪽엔 '롤닉' */}
                        <tr>
                          <td
                            rowSpan={Math.max(teamPlayers.length, 1) + 2}
                            className="w-1/3 border-r-2 border-b border-gray-200 bg-gray-50 text-center align-middle p-4"
                          >
                            <span className="text-xl font-black text-gray-800">{team.leader_name}</span>
                            <div className="text-xs text-gray-500 mt-1">{team.name}</div>
                          </td>
                          <td className="w-2/3 border-b-2 border-gray-200 bg-minion-blue/5 text-center py-2 px-4">
                            <span className="font-bold text-gray-600">롤닉</span>
                          </td>
                        </tr>

                        {/* 팀장 행 */}
                        <tr>
                          <td className="w-2/3 border-b border-gray-100 text-center py-2.5 px-4 bg-white relative">
                            <span className="text-indigo-500 absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black bg-indigo-50 px-1.5 py-0.5 rounded">👑</span>
                            <span className="font-bold text-gray-900">{team.leader_name}</span>
                          </td>
                        </tr>

                        {/* 팀원 행렬 */}
                        {teamPlayers.length > 0 ? (
                          teamPlayers.map((p: Player, idx: number) => (
                            <tr key={p.id}>
                              <td className={`w-2/3 text-center py-2.5 px-4 font-semibold text-gray-700 ${idx !== teamPlayers.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                {p.name}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="w-2/3 text-center py-4 text-xs text-gray-400 italic">
                              아직 낙찰된 선수가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
