'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { AuctionArchiveSection } from './AuctionArchiveSection'

export function ArchiveModalWrapper() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="mt-4 flex items-center justify-center gap-2 bg-white text-minion-blue border-2 border-minion-blue/20 hover:border-minion-blue/50 hover:bg-blue-50 px-8 py-4 rounded-2xl text-lg font-bold shadow-sm transition-all w-full"
      >
        <History size={20} />
        이전 경매 결과 조회
      </button>

      {/* isOpen 상태에 따라 화면 전체를 덮는 결과 목록 모달(AuctionArchiveSection 내부 처리) */}
      <AuctionArchiveSection isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
