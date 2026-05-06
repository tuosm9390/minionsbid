'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
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
import { getAuctionBidState } from '../utils/auctionRealtime'
import {
  buildTeamMap,
  bucketAuctionPlayers,
  findLatestNotice,
  isAuctionRoomComplete,
} from '@/features/auction/store/auctionSelectors'

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
  const liveBid = useAuctionStore((s) => s.liveBid)
  const teams = useAuctionStore((s) => s.teams)
  const presences = useAuctionStore((s) => s.presences)
  const messagesById = useAuctionStore((s) => s.messagesById)
  const orderedMessageIds = useAuctionStore((s) => s.orderedMessageIds)
  const teamId = useAuctionStore((s) => s.teamId)
  const roomId = useAuctionStore((s) => s.roomId)
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt)
  const currentPlayerId = useAuctionStore((s) => s.currentPlayerId)
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

  const { currentPlayer: bucketedCurrentPlayer, unsoldPlayers, waitingPlayers, soldPlayers, soldCountByTeam, playersById } =
    useMemo(() => bucketAuctionPlayers(players, currentPlayerId), [players, currentPlayerId])
  const teamMap = useMemo(() => buildTeamMap(teams), [teams])

  const currentPlayer = isLotteryActive ? undefined : bucketedCurrentPlayer

  const latestNotice = findLatestNotice(messagesById, orderedMessageIds)
  const isCurrentPlayerBid = liveBid?.player_id === currentPlayer?.id

  const { highestBid, topBidTeamId } = getAuctionBidState({
    currentBidAmount: isCurrentPlayerBid && liveBid ? liveBid.amount : null,
    currentBidTeamId: isCurrentPlayerBid && liveBid ? liveBid.team_id : null,
  })
  const topBid =
    topBidTeamId && liveBid?.team_id === topBidTeamId ? liveBid : null
  const leadingTeam = (topBidTeamId ? teamMap.get(topBidTeamId) : null) ?? null

  const waitingPlayersList = waitingPlayers

  const teamPlayerCounts = useMemo(
    () =>
      teams.map((team) => ({
        ...team,
        soldCount: soldCountByTeam.get(team.id) ?? 0,
      })),
    [teams, soldCountByTeam],
  )

  const auctionSlotsPerTeam = getAuctionSlotsPerTeam(membersPerTeam, captainMode)
  const needyTeams = teamPlayerCounts.filter(
    (t) => t.soldCount < auctionSlotsPerTeam,
  )
  const isRoomComplete = isAuctionRoomComplete({
    teamIds: teams.map((team) => team.id),
    soldCountByTeam,
    membersPerTeam,
    captainMode,
  })

  const isAuctionFinished =
    players.length > 0 &&
    waitingPlayersList.length === 0 &&
    !currentPlayer

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
  // room/players 스냅샷 도달 순서에 무관하게 IN_AUCTION→SOLD 전환을 직접 감지
  const prevPlayersRef = useRef<Player[] | null>(null)
  const prevCurrentPlayerIdRef = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevPlayersRef.current
    const prevCurrentPlayerId = prevCurrentPlayerIdRef.current
    if (prev !== null) {
      const justSold = players.find((player) => {
        const prevPlayer = prev.find((p) => p.id === player.id)
        const wasAuctionTarget =
          prevPlayer?.status === 'IN_AUCTION' ||
          prevCurrentPlayerId === player.id
        return player.status === 'SOLD' && wasAuctionTarget
      })
      if (justSold) {
        const team = justSold.team_id ? teamMap.get(justSold.team_id) : null
        setSoldOverlayData({
          playerName: justSold.name,
          teamName: team?.name ?? '팀 미정',
          price: justSold.sold_price ?? 0,
          tier: justSold.tier,
          position: justSold.main_position,
        })
      }
    }
    prevPlayersRef.current = players
    prevCurrentPlayerIdRef.current = currentPlayerId
  }, [players, teamMap, currentPlayerId])

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
