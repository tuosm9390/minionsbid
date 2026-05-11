'use client'

import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { getAuctionClientServices } from '@/features/auction/realtime/clientAdapter'

const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

let globalOffset = 0 // Keep a global reference to avoid react lifecycle issues when getting the current time

export function useServerTimeOffset() {
  const [offset, setOffset] = useState<number>(globalOffset)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (E2E_AUCTION_FIXTURE) return

    const { rtdb } = getAuctionClientServices()
    const offsetRef = ref(rtdb, '.info/serverTimeOffset')
    
    const unsubscribe = onValue(offsetRef, (snapshot) => {
      const val = snapshot.val() || 0
      setOffset(val)
      globalOffset = val
    })

    return () => unsubscribe()
  }, [])

  return offset
}

/**
 * RTDB의 serverTimeOffset을 반영하여 추정된 서버 시간을 반환합니다.
 * 컴포넌트 라이프사이클과 무관하게 언제든 호출하여 최신 추정 시간을 얻을 수 있습니다.
 */
export function getServerTime() {
  return Date.now() + globalOffset
}
