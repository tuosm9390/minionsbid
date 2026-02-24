'use client'

import { useEffect, use, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuctionStore, Role, Player } from '@/store/useAuctionStore'
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime'
import { drawNextPlayer, startAuction, awardPlayer } from '@/lib/auctionActions'
import { supabase } from '@/lib/supabase'
import { AuctionBoard } from '@/components/AuctionBoard'
import { TeamList } from '@/components/TeamList'
import { ChatPanel } from '@/components/ChatPanel'
import { LinksModal } from '@/components/LinksModal'
import { HowToUseModal } from '@/components/HowToUseModal'
import { LotteryOverlay } from '@/components/LotteryOverlay'

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const roomId = resolvedParams.id
  const searchParams = useSearchParams()
  const roleParam = searchParams.get('role')
  const role: Role = (roleParam === 'ORGANIZER' || roleParam === 'LEADER' || roleParam === 'VIEWER') ? roleParam : null
  const teamId = searchParams.get('teamId') || undefined

  const setRoomContext = useAuctionStore(s => s.setRoomContext)
  const players = useAuctionStore(s => s.players)
  const timerEndsAt = useAuctionStore(s => s.timerEndsAt)

  useEffect(() => {
    setRoomContext(roomId, role, teamId)
  }, [roomId, role, teamId, setRoomContext])

  useAuctionRealtime(roomId)

  const currentPlayer = players.find(p => p.status === 'IN_AUCTION')
  const waitingPlayers = players.filter(p => p.status === 'WAITING')
  const soldPlayers = players.filter(p => p.status === 'SOLD')
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD')

  // 버튼 로딩 상태
  const [isDrawing, setIsDrawing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  // 추첨 모달 상태 관리 (진입 시 자동 실행 방지)
  const [lotteryPlayer, setLotteryPlayer] = useState<Player | null>(null)
  const prevPlayersRef = useRef<Player[]>([])

  useEffect(() => {
    const prev = prevPlayersRef.current
    const curr = players

    // 초기 로딩 이후(배열에 값이 채워진 뒤) 상태 변화 감지
    if (prev.length > 0 && curr.length > 0) {
      const prevActive = prev.find(p => p.status === 'IN_AUCTION')
      const currActive = curr.find(p => p.status === 'IN_AUCTION')

      // 이전에 IN_AUCTION 선수가 없었는데 새로 등장했을 때만 추첨 팝업 발생 (즉, 당첨 버튼이 눌렸을 때)
      if (!prevActive && currActive) {
        setLotteryPlayer(currActive)
      }
    }
    prevPlayersRef.current = curr
  }, [players])

  // 전역 추첨 모달 닫기 동기화 (Broadcast)
  useEffect(() => {
    if (!roomId) return
    const channel = supabase.channel(`lottery-${roomId}`)
      .on('broadcast', { event: 'CLOSE_LOTTERY' }, () => {
        setLotteryPlayer(null)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  const handleCloseLottery = async () => {
    if (role !== 'ORGANIZER') return
    // 내 화면 닫기
    setLotteryPlayer(null)
    // 다른 모든 사람 닫기
    await supabase.channel(`lottery-${roomId}`).send({
      type: 'broadcast',
      event: 'CLOSE_LOTTERY',
      payload: {}
    })
  }

  // 공지 상태
  const [noticeText, setNoticeText] = useState('')
  const [isSendingNotice, setIsSendingNotice] = useState(false)

  const handleNotice = async () => {
    if (!noticeText.trim() || !roomId || isSendingNotice) return
    if (noticeText.trim().length > 200) return
    setIsSendingNotice(true)
    try {
      await supabase.from('messages').insert([{
        room_id: roomId,
        sender_name: '주최자',
        sender_role: 'NOTICE',
        content: noticeText.trim(),
      }])
      setNoticeText('')
    } finally {
      setIsSendingNotice(false)
    }
  }

  const handleDraw = async () => {
    setIsDrawing(true)
    try {
      const res = await drawNextPlayer(roomId)
      if (res.error) alert(res.error)
    } finally {
      setIsDrawing(false)
    }
  }

  const handleStart = async () => {
    setIsStarting(true)
    try {
      const res = await startAuction(roomId)
      if (res.error) alert(res.error)
      else await handleCloseLottery() // 경매 시작 시 모달 글로벌 닫기
    } finally {
      setIsStarting(false)
    }
  }

  // ── 타이머 만료 시 자동 낙찰 (주최자 클라이언트) ──
  const awardLock = useRef(false)
  const playersRef = useRef(players)
  playersRef.current = players

  useEffect(() => {
    if (role !== 'ORGANIZER' || !timerEndsAt || !roomId) return

    const cp = playersRef.current.find(p => p.status === 'IN_AUCTION')
    if (!cp) return

    const playerId = cp.id
    const delay = Math.max(0, new Date(timerEndsAt).getTime() - Date.now()) + 800 // 800ms 여유

    let cancelled = false
    const t = setTimeout(async () => {
      if (cancelled || awardLock.current) return
      const stillActive = playersRef.current.find(p => p.id === playerId && p.status === 'IN_AUCTION')
      if (!stillActive) return
      awardLock.current = true
      try {
        await awardPlayer(roomId, playerId)
      } finally {
        awardLock.current = false
      }
    }, delay)

    return () => { cancelled = true; clearTimeout(t) }
  }, [timerEndsAt, role, roomId])

  const allDone = waitingPlayers.length === 0 && !currentPlayer && soldPlayers.length > 0 && unsoldPlayers.length === 0

  return (
    <div className="min-h-screen bg-blue-50 text-foreground flex flex-col font-sans">

      {/* Header */}
      <header className="bg-minion-blue text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-minion-yellow tracking-tight">M I N I O N S 🍌</h1>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold border border-white/30">
            {role === 'ORGANIZER' && '👑 주최자 모드'}
            {role === 'LEADER' && '🛡️ 팀장 모드'}
            {role === 'VIEWER' && '👀 관전자 모드'}
          </span>
          {role === 'ORGANIZER' && <LinksModal />}
          <HowToUseModal variant="header" />
        </div>
        {/* 헤더 타이머: 중앙 화면에 타이머가 없을 때(대기 중)만 표시 */}
        {/* {!currentPlayer && <AuctionTimer />} */}
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">

        {/* Left: 팀 현황 */}
        <aside className="col-span-3 flex flex-col gap-4">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 flex-1 overflow-y-auto">
            <h2 className="text-lg font-bold text-minion-blue mb-4 flex items-center gap-2 sticky top-0 bg-card py-2 z-10">
              <span className="text-2xl">👥</span> 참가 팀 현황
            </h2>
            <TeamList />
          </div>
        </aside>

        {/* Center: 경매 보드 + 컨트롤 패널 */}
        <section className="col-span-6 flex flex-col gap-4">
          <AuctionBoard />

          {/* 주최자 컨트롤 패널 */}
          {role === 'ORGANIZER' && (
            <div className="bg-card rounded-2xl shadow-sm border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-muted-foreground">🎛️ 주최자 컨트롤</h3>
                <span className="text-xs text-gray-400">
                  대기 {waitingPlayers.length}명 · 낙찰 {soldPlayers.length}명
                  {players.length > 0 && ` / 총 ${players.length}명`}
                </span>
              </div>

              {/* 공지사항 입력 */}
              <div className="mb-3 pb-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 mb-1.5">📢 공지사항</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noticeText}
                    onChange={e => setNoticeText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNotice()}
                    placeholder="모든 참가자에게 공지..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-minion-yellow"
                    disabled={isSendingNotice}
                  />
                  <button
                    onClick={handleNotice}
                    disabled={!noticeText.trim() || isSendingNotice}
                    className="bg-minion-yellow hover:bg-minion-yellow-hover text-minion-blue px-4 py-2 rounded-xl text-sm font-black transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    공지
                  </button>
                </div>
              </div>

              {allDone ? (
                <div className="text-center py-4">
                  <p className="text-2xl mb-1">🏆</p>
                  <p className="font-black text-minion-blue">모든 선수 경매 완료!</p>
                  <p className="text-sm text-gray-400 mt-1">왼쪽 팀 현황에서 최종 결과를 확인하세요.</p>
                </div>
              ) : !currentPlayer ? (
                // 1. 경매 대기 상태 (추첨 전)
                <button
                  onClick={handleDraw}
                  disabled={isDrawing || waitingPlayers.length === 0}
                  className="w-full bg-minion-blue hover:bg-minion-blue-hover text-white py-3.5 rounded-xl font-black text-lg transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDrawing
                    ? '추첨 중...'
                    : waitingPlayers.length === 0
                      ? '대기 중인 선수 없음'
                      : `🎲 다음 선수 추첨 (${waitingPlayers.length}명 대기)`}
                </button>
              ) : !timerEndsAt ? (
                // 2. 선수 추첨됨, 경매 시작 대기
                <button
                  onClick={handleStart}
                  disabled={isStarting}
                  className="w-full bg-lime-500 hover:bg-lime-600 text-white py-3.5 rounded-xl font-black text-lg transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 shadow-[0_3px_0_#4d7c0f]"
                >
                  {isStarting ? '준비 중...' : '▶ 경매 시작'}
                </button>
              ) : (
                // 3. 경매 진행 중 (타이머 시작됨)
                <div className="bg-minion-yellow/10 border-2 border-minion-yellow/30 text-minion-blue py-3.5 px-4 rounded-xl font-bold text-center flex flex-col items-center justify-center">
                  <span className="text-lg">🔥 경매 진행 중</span>
                  <span className="text-sm font-medium mt-1 opacity-80">타이머가 종료되면 최고 입찰자에게 자동 낙찰 (혹은 유찰) 됩니다.</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: 채팅 */}
        <aside className="col-span-3 flex flex-col gap-4">
          <ChatPanel />
        </aside>

      </main>

      {/* 추첨 애니메이션 오버레이 */}
      {lotteryPlayer && (
        <LotteryOverlay
          candidates={waitingPlayers}
          targetPlayer={lotteryPlayer}
          role={role}
          isStarting={isStarting}
          onClose={handleCloseLottery}
          onStartAuction={handleStart}
        />
      )}
    </div>
  )
}
