'use client'

import {
  doc,
  collection,
  runTransaction,
  Timestamp,
} from 'firebase/firestore'
import { getAuctionClientServices } from '../realtime/clientAdapter'
import { useAuctionStore } from '../store/useAuctionStore'
import {
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
} from '../constants/auctionTimings'

interface PlaceBidDirectArgs {
  roomId: string
  playerId: string
  teamId: string
  amount: number
  resetTimer?: boolean
}

interface PlaceBidDirectResult {
  timerEndsAt?: string | null
  revision?: number
  error?: string
  timerExtended?: boolean
}

type FixtureBidResponse = {
  timerEndsAt?: string | null
  revision?: number
  error?: string
}

/**
 * Firestore 클라이언트 SDK를 사용하여 직접 입찰하는 함수.
 * Vercel Server Action을 경유하지 않으므로 지연이 크게 감소한다.
 *
 * 보안은 Firestore 보안 규칙(isBidUpdate)이 최종 검증한다.
 * 클라이언트 사전 검증은 UX용이며, 규칙이 최종 방어선.
 */
export async function placeBidDirect(
  args: PlaceBidDirectArgs,
): Promise<PlaceBidDirectResult> {
  const { roomId, playerId, teamId, amount, resetTimer = false } = args
  if (process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1') {
    const response = await fetch('/api/e2e/auction-fixture/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roomId,
        action: 'placeBid',
        playerId,
        teamId,
        amount,
        resetTimer,
      }),
    })
    const result = (await response.json().catch(() => ({
      error: 'fixture bid failed',
    }))) as FixtureBidResponse
    if (!response.ok) {
      return { error: result.error ?? 'fixture bid failed' }
    }
    return {
      timerEndsAt: result.timerEndsAt ?? null,
      revision: result.revision,
      error: result.error,
    }
  }

  const { firestore } = getAuctionClientServices()
  const roomRef = doc(firestore, 'rooms', roomId)

  try {
    let newTimerEndsAt: string | null = null
    let newRevision = 0
    let timerExtended = false

    const { serverTimeOffset = 0 } = useAuctionStore.getState()
    
    await runTransaction(firestore, async (tx) => {
      const roomSnap = await tx.get(roomRef)
      if (!roomSnap.exists()) {
        throw new Error('방을 찾을 수 없습니다.')
      }

      const roomData = roomSnap.data()
      const timerEndsAt = roomData.timer_ends_at as Timestamp | null
      if (!timerEndsAt) {
        throw new Error('경매가 진행 중이지 않습니다.')
      }

      // 클라이언트 추정 서버 시간 사용
      const estimatedNow = Date.now() + serverTimeOffset
      if (timerEndsAt.toMillis() <= estimatedNow) {
        throw new Error('경매 시간이 종료되었습니다.')
      }
      if (roomData.current_player_id !== playerId) {
        throw new Error('현재 경매 중인 선수가 아닙니다.')
      }

      const currentBid = roomData.active_bid
      if (currentBid && currentBid.team_id === teamId) {
        throw new Error('현재 최고 입찰자입니다.')
      }
      const minBid = currentBid ? currentBid.amount + 1 : 1
      if (amount < minBid) {
        throw new Error(`최소 입찰액은 ${minBid}P입니다.`)
      }

      const remaining = timerEndsAt.toMillis() - estimatedNow
      // 남은 시간이 연장 기준 이하(<=)일 때만 타이머를 연장함
      const shouldExtendTimer = resetTimer || remaining <= EXTEND_THRESHOLD_MS
      const nextTimerEndsAt = shouldExtendTimer
        ? Timestamp.fromDate(new Date(estimatedNow + EXTEND_DURATION_MS))
        : timerEndsAt
      newTimerEndsAt = nextTimerEndsAt.toDate().toISOString()
      timerExtended = shouldExtendTimer

      const liveBid = {
        player_id: playerId,
        team_id: teamId,
        amount,
        created_at: new Date().toISOString(),
      }

      const currentRevision = (roomData.auction_revision ?? 0) as number
      newRevision = currentRevision + 1

      // Room 문서 업데이트 (보안 규칙이 최종 검증)
      tx.update(roomRef, {
        active_bid: liveBid,
        timer_ends_at: nextTimerEndsAt,
        auction_revision: currentRevision + 1,
      })

      // 입찰 기록 생성
      const bidId = `bid-${estimatedNow}-${Math.random().toString(36).slice(2, 8)}`
      const bidRef = doc(collection(roomRef, 'bids'), bidId)
      tx.set(bidRef, {
        event_id: bidId,
        player_id: playerId,
        team_id: teamId,
        room_id: roomId,
        amount,
        created_at: Timestamp.now(),
      })
    })

    return { 
      timerEndsAt: newTimerEndsAt, 
      revision: newRevision,
      timerExtended
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '입찰 실패'
    // permission-denied → 보안 규칙 위반 (금액 부족, 팀 풀 등)
    if (message.includes('permission-denied') || message.includes('PERMISSION_DENIED')) {
      return { error: '입찰 조건을 충족하지 않습니다.' }
    }
    return { error: message }
  }
}
