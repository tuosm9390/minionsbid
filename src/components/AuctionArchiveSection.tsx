'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Trophy, X, RefreshCw } from 'lucide-react'
import type { ArchiveTeam } from '@/features/auction/api/auctionActions'

interface AuctionArchiveRow {
  id: string
  room_id: string
  room_name: string
  room_created_at: string
  closed_at: string
  result_snapshot: ArchiveTeam[]
}

// ── 상세 결과 모달 ──────────────────────────────────────────────────────────────
function ArchiveDetailModal({ archive, onClose }: { archive: AuctionArchiveRow; onClose: () => void }) {
  const sortedTeams = [...archive.result_snapshot].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko-KR', { numeric: true })
  )

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-minion-yellow rounded-xl flex items-center justify-center">
              <Trophy size={20} className="text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800">{archive.room_name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(archive.closed_at).toLocaleDateString('ko-KR', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })} 종료
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedTeams.map((team) => (
              <div key={team.id} className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <tr>
                      <td
                        rowSpan={Math.max(team.players.length, 1) + 2}
                        className="w-1/3 border-r-2 border-b border-gray-200 bg-gray-50 text-center align-middle p-4"
                      >
                        <span className="text-xl font-black text-gray-800">{team.leader_name}</span>
                        <div className="text-xs text-gray-500 mt-1">{team.name}</div>
                        <div className="text-xs text-minion-blue font-bold mt-1">잔여 {team.point_balance.toLocaleString()}P</div>
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
                    {/* 선수 목록 */}
                    {team.players.length > 0 ? (
                      team.players.map((p, idx) => (
                        <tr key={idx}>
                          <td className={`w-2/3 text-center py-2.5 px-4 font-semibold text-gray-700 ${idx !== team.players.length - 1 ? 'border-b border-gray-100' : ''}`}>
                            <span>{p.name}</span>
                            {p.sold_price != null && (
                              <span className="ml-2 text-xs text-gray-400">
                                {p.sold_price === 0 ? '(유찰)' : `${p.sold_price.toLocaleString()}P`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="w-2/3 text-center py-4 text-xs text-gray-400 italic">낙찰된 선수가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 아카이브 목록 섹션 모달 ─────────────────────────────────────────────────────────
export function AuctionArchiveSection({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [archives, setArchives] = useState<AuctionArchiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AuctionArchiveRow | null>(null)

  const fetchArchives = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('auction_archives')
        .select('*')
        .order('closed_at', { ascending: false })
        .limit(20)

      if (!error && data) setArchives(data as AuctionArchiveRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      void fetchArchives()
    }
  }, [isOpen, fetchArchives])

  if (!isOpen) return null

  if (loading) return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center text-gray-400 text-sm animate-pulse">
        이전 경매 결과 불러오는 중...
      </div>
    </div>
  )

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >

          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 className="text-2xl font-black text-minion-blue flex items-center gap-2">
              <Trophy className="text-minion-yellow" size={24} />
              이전 경매 결과 모음
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setLoading(true); void fetchArchives(); }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-minion-blue transition-colors px-3 py-1.5 rounded-xl hover:bg-gray-100"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 bg-blue-50/50">
            {archives.length === 0 ? (
              <div className="text-center py-10 text-gray-400 font-medium">저장된 경매 기록이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                {archives.map((archive) => (
                  <div
                    key={archive.id}
                    className="bg-white rounded-2xl border-2 border-gray-100 hover:border-minion-yellow p-5 transition-all shadow-sm group hover:-translate-y-1 hover:shadow-md cursor-pointer"
                    onClick={() => setSelected(archive)}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="w-12 h-12 bg-minion-yellow/20 rounded-xl flex items-center justify-center shrink-0">
                            <span className="text-xl">🏆</span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-black text-gray-800 text-lg truncate group-hover:text-minion-blue transition-colors">
                              {archive.room_name}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              {new Date(archive.closed_at).toLocaleDateString('ko-KR', {
                                year: 'numeric', month: 'long', day: 'numeric',
                              })}
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <span className="font-bold text-minion-blue bg-minion-blue/5 px-2 py-0.5 rounded-md">총 {archive.result_snapshot.length}팀</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <ArchiveDetailModal
          archive={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
