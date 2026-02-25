'use client'

import { useState, useEffect, useRef, memo } from 'react'
import { useAuctionStore, Message, PresenceUser, Team } from '@/store/useAuctionStore'
import { placeBid, draftPlayer, restartAuctionWithUnsold, resumeAuction } from '@/lib/auctionActions'
import { AuctionResultModal } from './AuctionResultModal'

const TIER_COLOR: Record<string, string> = {
  '챌린저': 'text-cyan-500', '그랜드마스터': 'text-red-500', '마스터': 'text-purple-500',
  '다이아': 'text-blue-400', '에메랄드': 'text-emerald-500', '플래티넘': 'text-teal-400',
  '골드': 'text-yellow-500', '실버': 'text-gray-400', '브론즈': 'text-amber-700', '언랭': 'text-gray-500',
  'Challenger': 'text-cyan-500', 'Grandmaster': 'text-red-500', 'Master': 'text-purple-500',
  'Diamond': 'text-blue-400', 'Emerald': 'text-emerald-500', 'Platinum': 'text-teal-400',
  'Gold': 'text-yellow-500', 'Silver': 'text-gray-400', 'Bronze': 'text-amber-700',
}

/** 준비 완료 축하 애니메이션 */
const ReadyAnimationOverlay = memo(function ReadyAnimationOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-minion-blue/10 backdrop-blur-sm animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-8 border-minion-yellow flex flex-col items-center gap-4 animate-bounce">
        <span className="text-7xl">🍌</span>
        <h2 className="text-4xl font-black text-minion-blue text-center">경매 준비 완료!</h2>
        <p className="text-gray-500 font-bold">이제 선수를 추첨하고 경매를 시작하세요!</p>
      </div>
    </div>
  )
})

/** 공지 배너 (모든 화면에 공통 표시) */
const NoticeBanner = memo(function NoticeBanner({ msg }: { msg: Message }) {
  return (
    <div className="bg-minion-yellow border-b-2 border-amber-400 px-5 py-3 flex items-start gap-3">
      <span className="text-xl shrink-0">📢</span>
      <div className="min-w-0">
        <p className="text-xs font-black text-amber-900 mb-0.5">주최자 공지</p>
        <p className="text-sm font-bold text-amber-950 break-words">{msg.content}</p>
      </div>
    </div>
  )
})

/** 중앙 타이머 (경매 중에만 표시) */
function CenterTimer({ timerEndsAt }: { timerEndsAt: string }) {
  const [now, setNow] = useState(Date.now())
  const initialDuration = useRef<number | null>(null)

  useEffect(() => {
    // 100ms 단위로 업데이트하여 부드러운 흐름 제공
    const iv = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(iv)
  }, [])

  const target = new Date(timerEndsAt).getTime()
  const lastTarget = useRef(target)

  // 타이머가 연장되거나 새로 시작될 때마다 기준 기간(initialDuration)을 갱신
  useEffect(() => {
    const diff = target - Date.now()
    if (target !== lastTarget.current) {
      initialDuration.current = diff
      lastTarget.current = target
    }
  }, [target])

  const timeLeftMs = Math.max(0, target - now)

  // 6초로 튀는 현상 방지: 0.1초 정도의 오차는 버림 처리하여 사용자에게는 5초로 보이게 함
  const timeLeftSec = Math.max(0, (timeLeftMs - 100) / 1000)
  const displayTime = Math.ceil(timeLeftSec)

  const progress = initialDuration.current ? (timeLeftMs / initialDuration.current) * 100 : 0
  const pad = (n: number) => String(n).padStart(2, '0')
  const isUrgent = displayTime > 0 && displayTime <= 5

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative flex items-center justify-center gap-2 rounded-2xl px-8 py-4 font-mono font-black text-5xl transition-all duration-300 overflow-hidden ${isUrgent
          ? 'bg-red-500 text-white animate-shake shadow-xl shadow-red-200 scale-110'
          : displayTime === 0
            ? 'bg-gray-100 text-gray-400'
            : 'bg-minion-blue text-white shadow-lg'
          }`}
        role="timer"
        aria-live="polite"
        aria-label={`남은 시간 ${isUrgent ? timeLeftSec.toFixed(1) : displayTime}초`}
      >
        <div className="z-10 flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">⏱</span>
          <span>
            {isUrgent ? (
              // 5초 이하일 때 소수점 표시하여 긴박감 조성
              timeLeftSec.toFixed(1)
            ) : (
              `${pad(Math.floor(displayTime / 60))}:${pad(displayTime % 60)}`
            )}
          </span>
        </div>

        {/* 진행 바 (배경에서 서서히 줄어듦) */}
        {displayTime > 0 && (
          <div
            className={`absolute bottom-0 left-0 h-1.5 transition-all duration-100 ${isUrgent ? 'bg-white/40' : 'bg-minion-yellow/40'}`}
            style={{ width: `${progress}%` }}
          />
        )}
      </div>

      {isUrgent && (
        <p className="text-red-600 font-black text-sm animate-pulse">입찰 시 5초로 연장됩니다!</p>
      )}
    </div>
  )
}

export function AuctionBoard({ isLotteryActive = false }: { isLotteryActive?: boolean }) {
  const players = useAuctionStore(s => s.players)
  const bids = useAuctionStore(s => s.bids)
  const teams = useAuctionStore(s => s.teams)
  const presences = useAuctionStore(s => s.presences)
  const messages = useAuctionStore(s => s.messages)
  const role = useAuctionStore(s => s.role)
  const teamId = useAuctionStore(s => s.teamId)
  const roomId = useAuctionStore(s => s.roomId)
  const timerEndsAt = useAuctionStore(s => s.timerEndsAt)
  const membersPerTeam = useAuctionStore(s => s.membersPerTeam) // 추가: 팀당 최대 인원
  const hasPlayedReadyAnimation = useAuctionStore(s => s.hasPlayedReadyAnimation)
  const setReadyAnimationPlayed = useAuctionStore(s => s.setReadyAnimationPlayed)

  // 모든 팀장 접속 여부 체크
  const connectedLeaderIds = new Set(
    presences.filter((p: PresenceUser) => p.role === 'LEADER').map((p: PresenceUser) => p.teamId)
  )
  const allConnected = teams.length > 0 && teams.every(t => connectedLeaderIds.has(t.id))

  // 애니메이션 자동 트리거 (모두 접속 시 한 번만)
  const [showReadyAnim, setShowReadyAnim] = useState(false)
  useEffect(() => {
    if (allConnected && !hasPlayedReadyAnimation && teams.length > 0) {
      setShowReadyAnim(true)
    }
  }, [allConnected, hasPlayedReadyAnimation, teams.length])

  // 애니메이션 중 팀장 이탈 시 즉시 닫기
  useEffect(() => {
    if (!allConnected && showReadyAnim) {
      setShowReadyAnim(false)
    }
  }, [allConnected, showReadyAnim])

  // 선수 추첨 시(경매 시작 시) 애니메이션 즉시 종료
  useEffect(() => {
    const hasActivePlayer = players.some(p => p.status === 'IN_AUCTION')
    if (hasActivePlayer && showReadyAnim) {
      setShowReadyAnim(false)
      setReadyAnimationPlayed(true)
    }
  }, [players, showReadyAnim, setReadyAnimationPlayed])

  // 추첨 애니메이션 중에는 선수를 숨겨 중앙 화면에 노출되지 않도록 마스킹
  const currentPlayer = isLotteryActive ? undefined : players.find(p => p.status === 'IN_AUCTION')

  // 최신 공지 메시지
  const latestNotice = [...messages].reverse().find(m => m.sender_role === 'NOTICE')

  // 현재 선수 입찰 데이터
  const playerBids = bids.filter(b => b.player_id === currentPlayer?.id)
  const highestBid = playerBids.length > 0 ? Math.max(...playerBids.map(b => b.amount)) : 0
  const topBid = playerBids.find(b => b.amount === highestBid)
  const leadingTeam = teams.find(t => t.id === topBid?.team_id)
  const myTeam = teams.find(t => t.id === teamId)
  const minBid = highestBid > 0 ? highestBid + 10 : 10

  // 입찰 UI 상태
  const [bidAmount, setBidAmount] = useState(minBid)
  const [isBidding, setIsBidding] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)

  // 타이머 활성 여부: 부모는 100ms 주기로 리렌더링할 필요가 없으므로 setTimeout으로 만료 관리
  const [isExpired, setIsExpired] = useState(false)
  useEffect(() => {
    if (!timerEndsAt) {
      setIsExpired(false)
      return
    }
    const remain = new Date(timerEndsAt).getTime() - Date.now()
    if (remain <= 0) {
      setIsExpired(true)
      return
    }
    setIsExpired(false)
    const timeout = setTimeout(() => setIsExpired(true), remain)
    return () => clearTimeout(timeout)
  }, [timerEndsAt])

  const isAuctionActive = !!timerEndsAt && !isExpired

  // 최소 입찰 변동 시 입력값 자동 조정
  const prevMinRef = useRef(minBid)
  useEffect(() => {
    if (minBid !== prevMinRef.current) {
      setBidAmount(prev => Math.max(prev, minBid))
      prevMinRef.current = minBid
    }
  }, [minBid])

  // 선수 바뀔 때 초기화
  useEffect(() => {
    setBidAmount(10)
    setBidError(null)
  }, [currentPlayer?.id])

  const handleBid = async () => {
    if (!currentPlayer || !roomId || !teamId) return
    const amount = Math.max(bidAmount, minBid)
    setBidError(null)
    setIsBidding(true)
    try {
      const res = await placeBid(roomId, currentPlayer.id, teamId, amount)
      if (res.error) setBidError(res.error)
      else setBidAmount(amount + 10)
    } finally {
      setIsBidding(false)
    }
  }

  const isLeading = leadingTeam?.id === teamId

  // 팀 인원 초과 여부 체크
  let isTeamFull = false
  if (myTeam) {
    const myTeamPlayersCount = players.filter(p => p.team_id === myTeam.id && p.status === 'SOLD').length
    isTeamFull = myTeamPlayersCount >= (membersPerTeam - 1)
  }

  const canBid = role === 'LEADER' && isAuctionActive && !isBidding && !!currentPlayer && !isLeading && !isTeamFull

  // ── 드래프트 (자유계약) 로직 판별 ──
  const isAuctionFinished = players.length > 0 && players.filter(p => p.status === 'WAITING' || p.status === 'IN_AUCTION').length === 0

  // 모든 팀이 정원을 채웠는지 확인
  const teamPlayerCounts = teams.map(t => ({
    ...t,
    soldCount: players.filter(p => p.team_id === t.id && p.status === 'SOLD').length
  }))
  const needyTeams = teamPlayerCounts.filter(t => t.soldCount < (membersPerTeam - 1))
  const isRoomComplete = teams.length > 0 && needyTeams.length === 0

  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD')
  const waitingPlayers = players.filter(p => p.status === 'WAITING')

  // 입찰 가능 팀: 정원 미달 AND 포인트 10P 이상
  const biddableTeams = teamPlayerCounts.filter(t =>
    t.soldCount < (membersPerTeam - 1) && t.point_balance >= 10
  )

  // 자동 드래프트 모드: WAITING 선수 있고, UNSOLD 없고, 입찰 가능 팀 1팀 이하
  const isAutoDraftMode = !currentPlayer
    && waitingPlayers.length > 0
    && unsoldPlayers.length === 0
    && biddableTeams.length <= 1

  // 최대 빈자리 수 계산
  const maxEmptySlots = needyTeams.length > 0
    ? Math.max(...needyTeams.map(t => (membersPerTeam - 1) - t.soldCount))
    : 0

  /**
   * 페이즈 판정 로직:
   * 1. 미완성 팀이 2팀 이상이고, 어떤 팀이라도 빈자리가 2개 이상이면 '재경매'
   * 2. 그 외(미완성 1팀뿐이거나, 모두 1자리씩만 남음)는 '드래프트'
   */
  const phase = (needyTeams.length >= 2 && maxEmptySlots >= 2) ? 'RE_AUCTION' : 'DRAFT'

  // 포인트 높은 순으로 정렬 (우선권 부여). 포인트가 같다면 name 기준 오름차순
  needyTeams.sort((a, b) => {
    if (b.point_balance === a.point_balance) {
      return a.name.localeCompare(b.name)
    }
    return b.point_balance - a.point_balance
  })

  const currentTurnTeam = needyTeams.length > 0 ? needyTeams[0] : null
  const isMyTurn = currentTurnTeam?.id === teamId
  const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null)
  const [showResultModal, setShowResultModal] = useState(false)

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

  const [isRestarting, setIsRestarting] = useState(false)
  const handleRestartAuction = async () => {
    if (!roomId) return
    setIsRestarting(true)
    try {
      const res = await restartAuctionWithUnsold(roomId)
      if (res.error) alert(res.error)
    } finally {
      setIsRestarting(false)
    }
  }

  const [isResuming, setIsResuming] = useState(false)
  const handleResume = async () => {
    if (!roomId) return
    setIsResuming(true)
    try {
      const res = await resumeAuction(roomId)
      if (res.error) alert(res.error)
    } finally {
      setIsResuming(false)
    }
  }

  // ── 경매 대기 화면 (팀장 접속 현황) 혹은 종료/드래프트 모드 ──
  if (!currentPlayer) {
    if (isAuctionFinished && !isRoomComplete) {
      const isDraft = phase === 'DRAFT'
      const titleText = isDraft ? '🤝 유찰 선수 자유계약 (드래프트) 진행 중' : '🔄 유찰 선수 재경매 지명 진행 중'

      return (
        <div className={`bg-white rounded-3xl shadow-xl border-4 flex-1 flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-500 ${isDraft ? 'border-purple-500' : 'border-orange-500'}`}>
          {latestNotice && <NoticeBanner msg={latestNotice} />}
          <div className="flex-1 flex flex-col p-6">
            <div className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none ${isDraft ? 'bg-purple-500/10' : 'bg-orange-500/10'}`} />

            <div className="text-center mb-6">
              <span className={`text-white font-black px-6 py-2 rounded-full text-base shadow-lg border-2 ${isDraft ? 'bg-purple-500 border-purple-600' : 'bg-orange-500 border-orange-600'}`}>
                {titleText}
              </span>

              {isDraft ? (
                <div className="mt-4 flex flex-col items-center gap-1 z-10 relative">
                  <span className="text-sm font-bold text-gray-500">현재 영입 차례</span>
                  <span className="text-3xl font-black text-purple-700 bg-purple-50 px-6 py-2 rounded-xl border-2 border-purple-200">
                    {currentTurnTeam?.name} <span className="text-lg text-gray-400">({currentTurnTeam?.point_balance}P)</span>
                  </span>
                  {role === 'ORGANIZER' ? (
                    <span className="mt-2 font-bold text-minion-blue bg-minion-yellow px-4 py-1.5 rounded-full border border-amber-300 shadow-sm animate-pulse">
                      👑 주최자가 선수를 선택하여 배정할 수 있습니다.
                    </span>
                  ) : (
                    <span className={`mt-2 font-bold px-4 py-1 rounded-full border ${isMyTurn ? 'text-green-600 bg-green-50 border-green-200 animate-pulse' : 'text-gray-400 bg-white border-gray-200'}`}>
                      {isMyTurn ? '내 팀의 영입 차례입니다! 주최자의 진행을 기다리세요.' : '다른 팀의 영입을 기다리는 중...'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-2 z-10 relative bg-orange-50 border-2 border-orange-200 p-4 rounded-2xl mx-auto max-w-lg shadow-sm">
                  <span className="text-sm font-bold text-orange-800">
                    각 팀마다 빈자리가 충분히 남아있어 <strong className="text-orange-900 border-b-2 border-orange-300">재경매 기준점</strong>을 만족했습니다.
                  </span>
                  <p className="text-xs text-gray-500 mb-2">주최자가 재시작을 누르면 유찰된 모든 선수가 대기 상태로 전환되며 새롭게 경매를 엽니다.</p>

                  {role === 'ORGANIZER' ? (
                    <div className="flex flex-col gap-2 items-center">
                      <button
                        onClick={handleRestartAuction}
                        disabled={isRestarting || !allConnected}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3 rounded-xl shadow-[0_4px_0_#9a3412] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:shadow-none"
                      >
                        {isRestarting ? '준비 중...' : !allConnected ? '⏳ 팀장 입장 대기 중' : '▶ 유찰 선수 전체 재경매 시작'}
                      </button>
                      {!allConnected && (
                        <p className="text-xs text-orange-600 font-bold animate-pulse">※ 모든 팀장이 입장해야 재경매 시작 가능</p>
                      )}
                    </div>
                  ) : (
                    <span className="font-bold text-gray-400 bg-white px-4 py-2 rounded border border-gray-200 shadow-inner">
                      주최자의 판단을 기다리고 있습니다...
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {unsoldPlayers.length === 0 ? (
                <div className="text-center text-gray-400 py-10 font-bold">남은 유찰 선수가 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 z-10">
                  {unsoldPlayers.map(p => (
                    <div key={p.id} className={`bg-gray-50 border-2 border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm transition-all hover:shadow-md ${isDraft ? 'hover:border-purple-300' : 'hover:border-orange-300'}`}>
                      <div>
                        <p className="font-black text-lg text-gray-800">{p.name}</p>
                        <div className="flex gap-2 items-center mt-1">
                          <span className={`text-xs font-bold ${TIER_COLOR[p.tier] || 'text-gray-500'}`}>{p.tier}</span>
                          <span className="text-xs text-gray-400">|</span>
                          <span className="text-xs font-bold text-gray-600">{p.main_position}</span>
                        </div>
                      </div>

                      {isDraft && role === 'ORGANIZER' && (
                        <button
                          onClick={() => handleDraft(p.id)}
                          disabled={isProcessingAction !== null || !currentTurnTeam}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-4 py-2 rounded-lg transition-all shadow-[0_3px_0_#4c1d95] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isProcessingAction === p.id ? '배정 중...' : `배정 (→ ${currentTurnTeam?.name})`}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    } else if (isAutoDraftMode) {
      // 자동 드래프트 모드: 입찰 가능 팀이 1팀 이하일 때 WAITING 선수를 드래프트로 배정
      const autoDraftLabel = biddableTeams.length === 0
        ? '⚡ 자동 드래프트 모드 (전 팀 포인트 부족)'
        : '⚡ 자동 드래프트 모드 (입찰 가능 팀 1팀)'
      const autoDraftDesc = biddableTeams.length === 0
        ? '모든 팀의 포인트가 부족하여 경매를 진행할 수 없습니다. 남은 선수들을 드래프트로 배정합니다.'
        : `입찰 가능한 팀이 ${biddableTeams[0].name} 1팀뿐입니다. 남은 선수들을 자동 드래프트로 배정합니다.`

      return (
        <div className="bg-white rounded-3xl shadow-xl border-4 border-indigo-500 flex-1 flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-500">
          {latestNotice && <NoticeBanner msg={latestNotice} />}
          <div className="flex-1 flex flex-col p-6">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-[100px] pointer-events-none bg-indigo-500/10" />

            <div className="text-center mb-6">
              <span className="text-white font-black px-6 py-2 rounded-full text-base shadow-lg border-2 bg-indigo-500 border-indigo-600">
                {autoDraftLabel}
              </span>

              <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 mx-auto max-w-md">
                <p className="text-xs text-indigo-700 font-bold">{autoDraftDesc}</p>
              </div>

              {currentTurnTeam && (
                <div className="mt-4 flex flex-col items-center gap-1 z-10 relative">
                  <span className="text-sm font-bold text-gray-500">현재 배정 차례</span>
                  <span className="text-3xl font-black text-indigo-700 bg-indigo-50 px-6 py-2 rounded-xl border-2 border-indigo-200">
                    {currentTurnTeam.name} <span className="text-lg text-gray-400">({currentTurnTeam.point_balance}P)</span>
                  </span>
                  {role === 'ORGANIZER' ? (
                    <span className="mt-2 font-bold text-minion-blue bg-minion-yellow px-4 py-1.5 rounded-full border border-amber-300 shadow-sm animate-pulse">
                      👑 주최자가 선수를 선택하여 배정할 수 있습니다.
                    </span>
                  ) : (
                    <span className={`mt-2 font-bold px-4 py-1 rounded-full border ${isMyTurn ? 'text-green-600 bg-green-50 border-green-200 animate-pulse' : 'text-gray-400 bg-white border-gray-200'}`}>
                      {isMyTurn ? '내 팀의 배정 차례입니다! 주최자의 진행을 기다리세요.' : '다른 팀의 배정을 기다리는 중...'}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {waitingPlayers.length === 0 ? (
                <div className="text-center text-gray-400 py-10 font-bold">배정할 선수가 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 z-10">
                  {waitingPlayers.map(p => (
                    <div key={p.id} className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm transition-all hover:shadow-md hover:border-indigo-300">
                      <div>
                        <p className="font-black text-lg text-gray-800">{p.name}</p>
                        <div className="flex gap-2 items-center mt-1">
                          <span className={`text-xs font-bold ${TIER_COLOR[p.tier] || 'text-gray-500'}`}>{p.tier}</span>
                          <span className="text-xs text-gray-400">|</span>
                          <span className="text-xs font-bold text-gray-600">{p.main_position}</span>
                        </div>
                      </div>

                      {role === 'ORGANIZER' && currentTurnTeam && (
                        <button
                          onClick={() => handleDraft(p.id)}
                          disabled={isProcessingAction !== null}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-lg transition-all shadow-[0_3px_0_#312e81] active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isProcessingAction === p.id ? '배정 중...' : `배정 (→ ${currentTurnTeam.name})`}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    } else if (isAuctionFinished) {
      return (
        <div className="bg-white rounded-3xl shadow-xl flex-1 flex flex-col items-center justify-center border-4 border-green-500 animate-in zoom-in-95 duration-500 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-green-500/5 rounded-[1.5rem] pointer-events-none" />
          <span className="text-6xl mb-4 animate-bounce">🎉</span>
          <h1 className="text-4xl font-black text-green-600 mb-2 drop-shadow-sm">모든 경매가 종료되었습니다!</h1>
          <p className="text-gray-500 font-bold mb-6">모든 팀이 선발을 완료했습니다. 각 팀의 선수 구성을 확인해주세요.</p>
          <button
            onClick={() => setShowResultModal(true)}
            className="bg-minion-blue hover:bg-minion-blue-hover text-white font-black px-8 py-4 rounded-2xl text-xl shadow-[0_6px_0_#1a3d73] active:translate-y-1.5 active:shadow-none transition-all animate-pulse duration-2000"
          >
            📋 경매 결과 최종 확인
          </button>
          <AuctionResultModal isOpen={showResultModal} onClose={() => setShowResultModal(false)} />
        </div>
      )
    }

    return (
      <div className="bg-white rounded-3xl shadow-xl border-4 border-minion-yellow flex-1 flex flex-col relative overflow-hidden">
        {latestNotice && <NoticeBanner msg={latestNotice} />}
        <div className="flex-1 flex flex-col p-6">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-minion-yellow/10 rounded-full blur-3xl pointer-events-none" />

          {/* 애니메이션 오버레이 */}
          {showReadyAnim && (
            <ReadyAnimationOverlay onDone={() => { setShowReadyAnim(false); setReadyAnimationPlayed(true); }} />
          )}

          <div className="flex items-center justify-between mb-5 z-10">
            <h2 className="text-xl font-black text-minion-blue">팀장 접속 현황</h2>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${allConnected ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
              }`}>
              {allConnected ? '✅ 모두 접속' : `⏳ ${connectedLeaderIds.size}/${teams.length}명 접속`}
            </span>
          </div>

          {teams.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 z-10">
              <p className="text-4xl mb-2">⏳</p>
              <p className="text-sm">팀 정보 로딩 중...</p>
            </div>
          ) : allConnected ? (
            // 모두 접속되었을 때의 깔끔한 화면
            <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-4 border-4 border-green-200 shadow-inner">
                <span className="text-5xl animate-pulse">🍌</span>
              </div>
              <h3 className="text-2xl font-black text-minion-blue mb-2">모든 팀장이 입장했습니다!</h3>
              <p className="text-gray-500 font-bold max-w-sm">
                주최자의 <span className="text-minion-yellow bg-minion-blue px-2 py-0.5 rounded">선수 추첨</span>을 대기 중입니다...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 z-10 overflow-y-auto">
              {teams.map((team) => {
                const connected = connectedLeaderIds.has(team.id)
                return (
                  <div key={team.id} className={`rounded-2xl border-2 p-4 flex items-center gap-3 ${connected ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${connected ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {connected ? '✅' : '⏳'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{team.name}</p>
                      <p className="text-xs text-gray-500">팀장: {team.leader_name || '미설정'}</p>
                      <p className={`text-xs font-bold mt-0.5 ${connected ? 'text-green-600' : 'text-gray-400'}`}>
                        {connected ? '접속 중' : '대기 중'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!allConnected && (
            <div className="mt-4 pt-3 border-t border-gray-100 z-10">
              <p className="text-xs text-center text-gray-400">
                팀장 링크를 각 팀장에게 공유해 접속을 안내하세요.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── 경매 진행 화면 ──
  return (
    <div className="bg-white rounded-3xl shadow-xl border-4 border-minion-blue flex-1 flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-500">
      {latestNotice && <NoticeBanner msg={latestNotice} />}

      {/* 접속 이탈 시 일시 정지 오버레이 */}
      {!allConnected && (
        <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-red-500 flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl animate-pulse">⚠️</div>
            <h2 className="text-2xl font-black text-red-600">팀장 접속 이탈</h2>
            <p className="text-gray-500 font-bold leading-tight">
              현재 <span className="text-red-500">{teams.length - connectedLeaderIds.size}명</span>의 팀장이 부재 중입니다.
              <br />모든 팀장이 재접속해야 경매를 재개할 수 있습니다.
            </p>
            {role === 'ORGANIZER' && (
              <p className="text-xs text-red-400 font-bold animate-pulse mt-2">※ 모든 팀장({connectedLeaderIds.size}/{teams.length}) 입장 대기 중...<br />전원 재접속 후 상단 컨트롤 패널에서 경매를 재개하세요.</p>
            )}
          </div>
        </div>
      )}

      <div className="absolute top-0 right-0 w-96 h-96 bg-minion-yellow/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-minion-blue/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="z-10 flex flex-col h-full p-6 gap-3">
        {/* 경매 배지 */}
        <div className="flex justify-center min-h-[40px] mb-2">
          {timerEndsAt ? (
            <span className="bg-red-500 text-white font-black px-6 py-2 rounded-full text-base shadow-lg border-2 border-red-600 animate-bounce">
              🔥 현재 경매 중 🔥
            </span>
          ) : (
            <span className="bg-gray-200 text-gray-500 font-bold px-6 py-2 rounded-full text-base shadow-inner border border-gray-300 animate-pulse duration-1000">
              ⏳ 경매 대기중입니다...
            </span>
          )}
        </div>

        {/* 중앙 타이머 */}
        <div className="flex justify-center min-h-[56px] mb-2">
          {timerEndsAt && <CenterTimer timerEndsAt={timerEndsAt} />}
        </div>

        {/* 선수 정보 */}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <h2 className="text-5xl font-black text-gray-900 tracking-tight">{currentPlayer.name}</h2>
          <div className="flex gap-3 items-center justify-center flex-wrap">
            <div className={`text-xl font-bold bg-gray-100 px-4 py-1.5 rounded-xl border border-gray-200 ${TIER_COLOR[currentPlayer.tier] || 'text-gray-600'}`}>
              {currentPlayer.tier}
            </div>
            <div className="text-xl font-bold bg-gray-100 px-4 py-1.5 rounded-xl border border-gray-200 text-gray-700">
              {currentPlayer.main_position}
              {currentPlayer.sub_position && currentPlayer.sub_position !== '무관'
                ? ` / ${currentPlayer.sub_position}` : ''}
            </div>
          </div>
          {currentPlayer.description && (
            <p className="text-sm text-gray-400 max-w-xs">{currentPlayer.description}</p>
          )}
        </div>

        {/* 현재 입찰 현황 */}
        <div className={`rounded-xl p-3 border-2 ${highestBid > 0
          ? 'bg-minion-yellow/10 border-minion-yellow'
          : 'bg-gray-50 border-gray-200'
          }`}>
          {highestBid > 0 ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">현재 최고 입찰</p>
                <p className="text-2xl font-black text-minion-blue">{highestBid.toLocaleString()}P</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-0.5">선두 팀</p>
                <p className="text-sm font-black text-gray-800">{leadingTeam?.name || '?'}</p>
                {leadingTeam?.id === teamId && (
                  <p className="text-xs font-bold text-green-600">내 팀 리드 중 👑</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-center text-gray-500 py-0.5">아직 입찰 없음 — 먼저 입찰하세요!</p>
          )}
        </div>

        {/* 팀장 입찰 UI */}
        {role === 'LEADER' && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>보유: <span className="font-bold text-minion-blue">{myTeam?.point_balance?.toLocaleString() ?? 0}P</span></span>
              <span>최소: <span className="font-bold">{minBid.toLocaleString()}P</span></span>
            </div>
            {bidError && (
              <p className="text-xs text-red-500 mb-1 text-center font-bold">{bidError}</p>
            )}
            {!isAuctionActive && (
              <p className="text-xs text-gray-400 text-center mb-1 font-bold">
                {!timerEndsAt ? '⏱️ 주최자의 경매 시작을 대기 중입니다...' : '⏱️ 경매 시간 종료'}
              </p>
            )}

            {isTeamFull ? (
              <div className="w-full">
                <button
                  disabled
                  className="w-full px-4 py-3 rounded-xl font-black text-lg bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed uppercase tracking-wide"
                >
                  🚫 팀 완성 (입찰 불가)
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setBidAmount(v => Math.max(minBid, v - 10))}
                  disabled={!canBid || bidAmount <= minBid}
                  aria-label="입찰금액 10 감소"
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-black text-sm transition-colors disabled:opacity-30"
                >−10</button>
                <input
                  type="number"
                  value={bidAmount}
                  min={minBid}
                  step={10}
                  aria-label="입찰 금액 입력"
                  onChange={e => setBidAmount(Math.max(minBid, parseInt(e.target.value) || minBid))}
                  disabled={!canBid}
                  className="flex-1 border-2 border-gray-200 focus:border-red-400 rounded-xl px-2 py-2 text-lg font-black text-center focus:outline-none disabled:opacity-50 disabled:bg-gray-50"
                />
                <button
                  onClick={() => setBidAmount(v => v + 10)}
                  disabled={!canBid}
                  aria-label="입찰금액 10 증가"
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-black text-sm transition-colors disabled:opacity-30"
                >+10</button>
                <button
                  onClick={handleBid}
                  disabled={!canBid}
                  aria-label={isLeading ? "현재 선두 유지 중" : "입찰하기"}
                  className={`px-4 py-2 rounded-xl font-black text-base transition-all whitespace-nowrap ${isLeading
                    ? 'bg-minion-yellow text-minion-blue opacity-100 cursor-not-allowed border-2 border-minion-yellow shadow-[0_3px_0_#D9B310]'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_3px_0_#991B1B] hover:shadow-[0_2px_0_#991B1B] hover:translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none'
                    }`}
                >
                  {isLeading ? '선두 유지 중 👑' : isBidding ? '입찰 중...' : '입찰 🔥'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
