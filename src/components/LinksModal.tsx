'use client'

import { useState } from 'react'
import { useAuctionStore, Team } from '@/store/useAuctionStore'
import { Copy, Check, X, Link } from 'lucide-react'

export function LinksModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const roomId = useAuctionStore((state) => state.roomId)
  const teams = useAuctionStore((state) => state.teams)
  const organizerToken = useAuctionStore((state) => state.organizerToken)
  const viewerToken = useAuctionStore((state) => state.viewerToken)

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  if (!roomId) return null

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const organizerLink = organizerToken
    ? `${baseUrl}/room/${roomId}?role=ORGANIZER&token=${organizerToken}`
    : null
  const viewerLink = viewerToken
    ? `${baseUrl}/room/${roomId}?role=VIEWER&token=${viewerToken}`
    : null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-sm font-bold transition-colors border border-white/30"
      >
        <Link size={14} /> 링크 확인
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl">

            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-minion-blue">🔗 경매방 링크</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">

              {organizerLink && (
                <LinkRow
                  label="👑 주최자 링크"
                  desc="경매 진행 및 관리 전용"
                  link={organizerLink}
                  linkKey="organizer"
                  copied={copied}
                  onCopy={copyToClipboard}
                />
              )}

              <div>
                <p className="text-sm font-bold text-gray-600 mb-2">🛡️ 팀장 링크</p>
                <div className="space-y-2">
                  {teams.map((team: Team, i: number) => {
                    const link = team.leader_token
                      ? `${baseUrl}/room/${roomId}?role=LEADER&teamId=${team.id}&token=${team.leader_token}`
                      : null
                    if (!link) return null
                    return (
                      <LinkRow
                        key={team.id}
                        label={team.name}
                        desc={`팀장: ${team.leader_name || '(미설정)'} · 입찰 가능`}
                        link={link}
                        linkKey={`captain-${i}`}
                        copied={copied}
                        onCopy={copyToClipboard}
                      />
                    )
                  })}
                </div>
              </div>

              {viewerLink && (
                <LinkRow
                  label="👀 관전자 링크"
                  desc="관전 전용 — 자유롭게 공유 가능"
                  link={viewerLink}
                  linkKey="viewer"
                  copied={copied}
                  onCopy={copyToClipboard}
                />
              )}

            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}

function LinkRow({
  label, desc, link, linkKey, copied, onCopy,
}: {
  label: string
  desc: string
  link: string
  linkKey: string
  copied: string | null
  onCopy: (text: string, key: string) => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 flex items-center gap-3 bg-gray-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
        <p className="text-xs text-blue-500 truncate mt-0.5 font-mono">{link}</p>
      </div>
      <button
        onClick={() => onCopy(link, linkKey)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
          copied === linkKey
            ? 'bg-green-100 text-green-700'
            : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-200'
        }`}
      >
        {copied === linkKey ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
      </button>
    </div>
  )
}
