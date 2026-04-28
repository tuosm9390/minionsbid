'use client'

import { useState, useEffect, useRef } from 'react'
import {
  useAuctionStore,
  type PresenceUser,
  type Player,
  type Role,
} from '@/features/auction/store/useAuctionStore'
import {
  draftPlayer,
  restartAuctionWithUnsold,
} from '@/features/auction/api/auctionActions'
import { getAuctionSlotsPerTeam } from '../utils/roster'
import { getAuctionDerivedState } from '../utils/auctionRealtime'

const E2E_AUCTION_FIXTURE = process.env.NEXT_PUBLIC_E2E_AUCTION_FIXTURE === '1'

interface UseAuctionBoardProps {
  isLotteryActive: boolean
  lotteryPlayer?: Player | null
  role?: Role
  allConnected: boolean
}

/**
 * AuctionBoard 컴포넌트의 비즈니스 로직 Hook.
 *
 * 관심사 분리 원칙에 따라 Store 셀렉터, 파생 데이터 계산,
 * 이벤트 핸들러를 컴포넌트에서 분리하여 테스트 및 재사용성을 향상합니다.
 */
export function useAuctionBoard({
  isLotteryActive,
  lotteryPlayer,
}: UseAuctionBoardProps) {
  // ── Store 셀렉터 ──
  const players = useAuctionStore((s) => s.players)
  const bids = useAuctionStore((s) => s.bids)
  const liveBid = useAuctionStore((s) => s.liveBid)
  const teams = useAuctionStore((s) => s.teams)
  const presences = useAuctionStore((s) => s.presences)
  const messages = useAuctionStore((s) => s.messages)
  const teamId = useAuctionStore((s) => s.teamId)
  const roomId = useAuctionStore((s) => s.roomId)
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt)
  const membersPerTeam = useAuctionStore((s) => s.membersPerTeam)
  const captainMode = useAuctionStore((s) => s.captainMode)
  const setReAuctionRound = useAuctionStore((s) => s.setReAuctionRound)

  // ── 로컬 상태 ──
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const [lotteryDone, setLotteryDone] = useState(false)
  const [soldOverlayData, setSoldOverlayData] = useState<{
    playerName: string
    teamName: string
    price: number
    tier?: string
    position?: string
  } | null>(null)

  // ── 파생 데이터 ──
  const connectedLeaderIds = new Set(
    presences
      .filter((p: PresenceUser) => p.role === 'LEADER')
      .map((p: PresenceUser) => p.teamId),
  )

  const currentPlayer = isLotteryActive
    ? undefined
    : players.find((p) => p.status === 'IN_AUCTION')

  const latestNotice = messages.findLast((m) => m.sender_role === 'NOTICE')

  const { highestBid, topBid, leadingTeam } = getAuctionDerivedState({
    bids,
    currentPlayerId: currentPlayer?.id,
    liveBid,
    teams,
  })

  const unsoldPlayers = players.filter((p) => p.status === 'UNSOLD')
  const waitingPlayersList = players.filter((p) => p.status === 'WAITING')
  const soldPlayers = players.filter((p) => p.status === 'SOLD')

  const teamPlayerCounts = teams.map((t) => ({
    ...t,
    soldCount: players.filter((p) => p.team_id === t.id && p.status === 'SOLD').length,
  }))

  const auctionSlotsPerTeam = getAuctionSlotsPerTeam(membersPerTeam, captainMode)
  const needyTeams = teamPlayerCounts.filter(
    (t) => t.soldCount < auctionSlotsPerTeam,
  )
  const isRoomComplete = teams.length > 0 && needyTeams.length === 0

  const isAuctionFinished =
    players.length > 0 &&
    players.filter((p) => p.status === 'WAITING' || p.status === 'IN_AUCTION').length === 0

  const biddableTeams = teamPlayerCounts.filter(
    (t) => t.soldCount < auctionSlotsPerTeam && t.point_balance >= 10,
  )
  const isAutoDraftMode =
    !currentPlayer &&
    waitingPlayersList.length > 0 &&
    unsoldPlayers.length === 0 &&
    biddableTeams.length <= 1
  const hasDraftablePlayers = unsoldPlayers.length > 0 || isAutoDraftMode
  const isAuctionStarted = soldPlayers.length > 0 || !!currentPlayer
  const isAuctionTerminal =
    isAuctionFinished && !hasDraftablePlayers && soldPlayers.length > 0
  const isAuctionComplete = isRoomComplete || isAuctionTerminal

  const maxEmptySlots =
    needyTeams.length > 0
      ? Math.max(...needyTeams.map((t) => auctionSlotsPerTeam - t.soldCount))
      : 0
  const phase =
    needyTeams.length >= 2 && maxEmptySlots >= 2 ? 'RE_AUCTION' : 'DRAFT'

  // needyTeams 정렬 (포인트 내림차순, 이름순)
  needyTeams.sort((a, b) =>
    b.point_balance === a.point_balance
      ? a.name.localeCompare(b.name)
      : b.point_balance - a.point_balance,
  )
  const currentTurnTeam = needyTeams.length > 0 ? needyTeams[0] : null

  // ── SOLD 감지 ──
  const prevCurrentPlayerRef = useRef<Player | undefined>(undefined)

  useEffect(() => {
    const prev = prevCurrentPlayerRef.current
    // IN_AUCTION이었던 선수가 사라졌을 때 → SOLD 상태로 전환됐는지 확인
    if (prev && !currentPlayer) {
      const justSold = players.find(
        (p) => p.id === prev.id && p.status === 'SOLD',
      )
      if (justSold) {
        const team = teams.find((t) => t.id === justSold.team_id)
        setSoldOverlayData({
          playerName: justSold.name,
          teamName: team?.name ?? '팀 미정',
          price: justSold.sold_price ?? 0,
          tier: justSold.tier,
          position: justSold.main_position,
        })
      }
    }
    prevCurrentPlayerRef.current = currentPlayer
  }, [currentPlayer, players, teams])

  useEffect(() => {
    setLotteryDone(false)
  }, [lotteryPlayer])

  useEffect(() => {
    if (E2E_AUCTION_FIXTURE && isLotteryActive) {
      setLotteryDone(true)
    }
  }, [isLotteryActive])

  // ── 이벤트 핸들러 ──
  const handleDraft = async (playerId: string) => {
    if (!currentTurnTeam || !roomId) return
    setIsProcessingAction(playerId)
    try {
      const res = await draftPlayer(roomId, playerId, currentTurnTeam.id)
      if (res.error) alert(res.error)
    } finally {
      setIsProcessingAction(null)
    }
  }

  const handleRestartAuction = async () => {
    if (!roomId) return
    setIsRestarting(true)
    try {
      const res = await restartAuctionWithUnsold(roomId)
      if (res.error) alert(res.error)
      else if (res.reAuctionStarted) setReAuctionRound(true)
    } finally {
      setIsRestarting(false)
    }
  }

  return {
    // Store data
    teams,
    players,
    teamId,
    timerEndsAt,
    connectedLeaderIds,

    // 파생 데이터
    currentPlayer,
    latestNotice,
    highestBid,
    topBid,
    leadingTeam,
    unsoldPlayers,
    waitingPlayersList,
    soldPlayers,
    teamPlayerCounts,
    needyTeams,
    isRoomComplete,
    isAuctionFinished,
    isAuctionStarted,
    isAuctionComplete,
    isAuctionTerminal,
    isAutoDraftMode,
    hasDraftablePlayers,
    phase,
    currentTurnTeam,

    // 로컬 상태
    soldOverlayData,
    setSoldOverlayData,
    isProcessingAction,
    isRestarting,
    lotteryDone,
    setLotteryDone,

    // 핸들러
    handleDraft,
    handleRestartAuction,
  }
}
