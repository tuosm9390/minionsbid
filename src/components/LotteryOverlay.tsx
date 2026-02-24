'use client'

import { useState, useEffect } from 'react'
import { Role, Player } from '@/store/useAuctionStore'

interface LotteryOverlayProps {
  candidates: Player[]
  targetPlayer: Player | null
  role: Role
  isStarting?: boolean
  onClose: () => void
  onStartAuction: () => void
}

const ITEM_HEIGHT = 120 // px, 슬롯 아이템 높이

export function LotteryOverlay({
  candidates,
  targetPlayer,
  role,
  isStarting = false,
  onClose,
  onStartAuction,
}: LotteryOverlayProps) {
  const [isSpinning, setIsSpinning] = useState(true)
  const [startRoll, setStartRoll] = useState(false)

  // 40개의 랜덤 선수 목록 생성 + 마지막에 실제 당첨자 배치 (슬롯머신 트랙)
  // useState 초기값으로 생성 → 컴포넌트 마운트 시 1회만 실행 (LotteryOverlay는 매번 새로 마운트됨)
  const [trackItems] = useState<Player[]>(() => {
    if (!targetPlayer) return []
    const cand = candidates.length > 0 ? candidates : [targetPlayer]
    const items: Player[] = []
    for (let i = 0; i < 40; i++) {
      items.push(cand[Math.floor(Math.random() * cand.length)])
    }
    items.push(targetPlayer)
    return items
  })

  useEffect(() => {
    if (!targetPlayer) return

    // 약간의 지연 후 CSS 트랜지션 트리거
    const timer1 = setTimeout(() => {
      setStartRoll(true)
    }, 100)

    // 애니메이션 4초간 진행 후 종료 상태로 변경
    const timer2 = setTimeout(() => {
      setIsSpinning(false)
    }, 4100)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [targetPlayer])

  if (!targetPlayer || trackItems.length === 0) return null

  // 40개의 가짜 항목들을 지나서 정확히 41번째(인덱스 40) 아이템으로 translateY 이동
  const targetTranslateY = -(40 * ITEM_HEIGHT)

  return (
    <div className="fixed inset-0 bg-black/85 z-[9999] flex flex-col items-center justify-center gap-8 animate-in fade-in duration-300 p-4 overflow-hidden">
      <div
        className={`text-3xl font-black tracking-widest transition-all duration-500 ${isSpinning
          ? 'text-minion-yellow animate-pulse drop-shadow-[0_2px_8px_rgba(255,204,0,0.4)]'
          : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] scale-110'
          }`}
      >
        {isSpinning ? '🎰 추첨 중...' : '🎉 추첨 완료!'}
      </div>

      <div
        className="w-80 overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 border-4 border-minion-yellow shadow-[0_0_30px_rgba(255,204,0,0.3),inset_0_0_20px_rgba(0,0,0,0.8)] relative"
        style={{ height: `${ITEM_HEIGHT}px` }}
      >
        <div
          className="flex flex-col w-full absolute top-0 left-0"
          style={{
            transform: startRoll ? `translateY(${targetTranslateY}px)` : 'translateY(0px)',
            transition: startRoll ? 'transform 4s cubic-bezier(0.1, 0.8, 0.2, 1)' : 'none'
          }}
        >
          {trackItems.map((p, idx) => (
            <div
              key={idx}
              className="w-full flex flex-col items-center justify-center shrink-0"
              style={{ height: `${ITEM_HEIGHT}px` }}
            >
              <span
                className={`text-3xl font-black transition-all duration-300 ${!isSpinning && idx === 40
                  ? 'text-minion-yellow drop-shadow-[0_0_12px_rgba(255,204,0,0.6)] animate-pulse scale-110'
                  : 'text-white'
                  }`}
              >
                {p.name}
              </span>
              <span className={`text-sm font-bold transition-all duration-300 ${!isSpinning && idx === 40 ? 'text-gray-300 scale-110 mt-1' : 'text-gray-400'
                }`}
              >
                {p.tier} / {p.main_position}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`flex flex-col sm:flex-row gap-3 mt-4 transition-all duration-500 ${isSpinning ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
          }`}
      >
        {role === 'ORGANIZER' && (
          <button
            onClick={onStartAuction}
            disabled={isStarting}
            className="bg-gradient-to-r from-lime-400 to-lime-500 hover:from-lime-500 hover:to-lime-600 text-green-950 px-8 py-3.5 rounded-xl font-black text-lg shadow-[0_4px_16px_rgba(132,204,22,0.4)] hover:shadow-[0_6px_24px_rgba(132,204,22,0.6)] transition-all hover:-translate-y-1 active:translate-y-0 text-center disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
          >
            {isStarting ? '시작 중...' : '▶ 바로 경매 시작'}
          </button>
        )}
        {role === 'ORGANIZER' && (
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-3.5 rounded-xl font-black text-lg shadow-lg hover:shadow-xl transition-all text-center"
          >
            닫기 (전체 화면 닫힘)
          </button>
        )}
      </div>
    </div>
  )
}
