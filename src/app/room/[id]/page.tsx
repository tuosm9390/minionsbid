'use client'

import { useEffect, use, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuctionStore, Role, Player } from '@/store/useAuctionStore'
import { useAuctionRealtime } from '@/hooks/useAuctionRealtime'
import { drawNextPlayer, startAuction, awardPlayer, deleteRoom, saveAuctionArchive, pauseAuction } from '@/lib/auctionActions'
import { supabase } from '@/lib/supabase'
import { AuctionBoard } from '@/components/AuctionBoard'
import { TeamList, UnsoldPanel } from '@/components/TeamList'
import { ChatPanel } from '@/components/ChatPanel'
import { LinksModal } from '@/components/LinksModal'
import { HowToUseModal } from '@/components/HowToUseModal'
import { LotteryOverlay } from '@/components/LotteryOverlay'
import { EndRoomModal } from '@/components/EndRoomModal'
import { AuctionResultModal } from '@/components/AuctionResultModal'

import { useRoomAuth } from '@/hooks/useRoomAuth'
import { useAuctionControl } from '@/hooks/useAuctionControl'

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(createdAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000))

    const iv = setInterval(update, 1000)
    update()
    return () => clearInterval(iv)
  }, [createdAt])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60

  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`

  return (
    <div className="bg-white/10 px-3 py-1.5 rounded-xl text-sm font-mono font-bold flex items-center gap-1.5 border border-white/20 ml-2" role="timer" aria-label="경매 진행 시간">
      <span className="text-white/70 text-xs">진행 시간</span>
      <span className="text-minion-yellow">{timeStr}</span>
    </div>
  )
}

export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const roomId = resolvedParams.id
  const searchParams = useSearchParams()
  const roleParam = searchParams.get('role')
  const role: Role = (roleParam === 'ORGANIZER' || roleParam === 'LEADER' || roleParam === 'VIEWER') ? roleParam : null
  const teamId = searchParams.get('teamId') || undefined
  const tokenParam = searchParams.get('token')

  // 스토어 데이터
  const setRoomContext = useAuctionStore(s => s.setRoomContext)
  const players = useAuctionStore(s => s.players)
  const timerEndsAt = useAuctionStore(s => s.timerEndsAt)
  const createdAt = useAuctionStore(s => s.createdAt)
  const roomName = useAuctionStore(s => s.roomName)
  const teams = useAuctionStore(s => s.teams)
  const presences = useAuctionStore(s => s.presences)
  const isReAuctionRound = useAuctionStore(s => s.isReAuctionRound)
  const storeOrganizerToken = useAuctionStore(s => s.organizerToken)
  const storeViewerToken = useAuctionStore(s => s.viewerToken)
  const roomExists = useAuctionStore(s => s.roomExists)
  const isRoomLoaded = useAuctionStore(s => s.isRoomLoaded)
  const membersPerTeam = useAuctionStore(s => s.membersPerTeam)

  // 1. 인증 및 역할 관리 (Hook)
  const { effectiveRole } = useRoomAuth({
    role, teamId, tokenParam, isRoomLoaded, roomExists,
    storeOrganizerToken, storeViewerToken, teams, roomId, setRoomContext
  })

  // 2. 경매 진행 제어 (Hook)
  const { lotteryPlayer, handleCloseLottery } = useAuctionControl({
    roomId, effectiveRole, players, timerEndsAt
  })

  useAuctionRealtime(roomId)

  // 3. 기타 상태 및 계산
  const [isInitializing, setIsInitializing] = useState(true)
  useEffect(() => {
    if (isRoomLoaded) {
      const timer = setTimeout(() => setIsInitializing(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isRoomLoaded])

  const connectedLeaderIds = new Set(presences.filter(p => p.role === 'LEADER').map(p => p.teamId))
  const allConnected = teams.length > 0 && teams.every(t => connectedLeaderIds.has(t.id))

  // 접속 장애 감지 및 자동 일시정지 (주최자 전용)
  useEffect(() => {
    if (effectiveRole === 'ORGANIZER' && !allConnected && timerEndsAt && roomId) {
      void pauseAuction(roomId)
    }
  }, [allConnected, timerEndsAt, effectiveRole, roomId])

  const currentPlayer = players.find(p => p.status === 'IN_AUCTION')
  const waitingPlayers = players.filter(p => p.status === 'WAITING')
  const soldPlayers = players.filter(p => p.status === 'SOLD')
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD')

  // 자동 드래프트 모드 판별
  const biddableTeams = teams.filter(t => {
    const sold = players.filter(p => p.team_id === t.id && p.status === 'SOLD').length
    return sold < (membersPerTeam - 1) && t.point_balance >= 10
  })
  const isAutoDraftMode = !currentPlayer && waitingPlayers.length > 0 && unsoldPlayers.length === 0 && biddableTeams.length <= 1

  const [isDrawing, setIsDrawing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const router = useRouter()
  const [isEndRoomOpen, setIsEndRoomOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [noticeText, setNoticeText] = useState('')
  const [isSendingNotice, setIsSendingNotice] = useState(false)

  const handleNotice = async () => {
    if (!noticeText.trim() || !roomId || isSendingNotice) return
    setIsSendingNotice(true)
    try {
      await supabase.from('messages').insert([{
        room_id: roomId, sender_name: '주최자', sender_role: 'NOTICE', content: noticeText.trim(),
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
      await handleCloseLottery()
      const duration = isReAuctionRound ? 5000 : 10000
      const res = await startAuction(roomId, duration)
      if (res.error) alert(res.error)
    } finally {
      setIsStarting(false)
    }
  }

  // 모든 팀이 정원을 채웠는지 계산
  const needyTeams = teams.filter(t =>
    players.filter(p => p.team_id === t.id && p.status === 'SOLD').length < (membersPerTeam - 1)
  )
  const isRoomComplete = teams.length > 0 && needyTeams.length === 0
  const allDone = waitingPlayers.length === 0 && !currentPlayer && soldPlayers.length > 0 && isRoomComplete

  const handleEndRoom = async (saveResult: boolean) => {
    if (!roomId) return
    setIsDeleting(true)
    try {
      if (saveResult && allDone) {
        await saveAuctionArchive({
          roomId,
          roomName: roomName ?? `경매방 (${new Date().toLocaleDateString('ko-KR')})`,
          roomCreatedAt: createdAt ?? new Date().toISOString(),
          teams: teams.map(t => ({
            id: t.id, name: t.name, leader_name: t.leader_name, point_balance: t.point_balance,
            players: players.filter(p => p.team_id === t.id).map(p => ({ name: p.name, sold_price: p.sold_price })),
          })),
        })
      }
      const result = await deleteRoom(roomId)
      if (!result.error) router.push('/')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 border-4 border-minion-blue border-t-minion-yellow rounded-full animate-spin mb-6" />
        <h2 className="text-2xl font-black text-minion-blue mb-2">방 정보를 불러오고 있습니다</h2>
        <p className="text-gray-500 font-bold">잠시만 기다려주세요. 실시간 데이터를 연결 중입니다...</p>
        <div className="mt-8 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-3 h-3 bg-minion-yellow rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!roomExists || roomName?.startsWith('[종료된 경매]')) {
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-6">🚪</div>
        <h2 className="text-3xl font-black text-minion-blue mb-2">경매가 종료되었습니다.</h2>
        <p className="text-gray-500 font-bold mb-8 italic">주최자에 의해 방이 삭제되었거나 종료된 경매입니다.</p>
        <button
          onClick={() => router.push('/')}
          className="bg-minion-yellow hover:bg-minion-yellow-hover text-minion-blue font-black px-8 py-3 rounded-2xl text-lg shadow-md transition-all"
        >
          메인 화면으로 돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-blue-50 text-foreground flex flex-col font-sans">

      {/* Header */}
      <header className="bg-minion-blue text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-minion-yellow tracking-tight">M I N I O N S 🍌</h1>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold border border-white/30">
            {effectiveRole === 'ORGANIZER' && '👑 주최자 모드'}
            {effectiveRole === 'LEADER' && '🛡️ 팀장 모드'}
            {effectiveRole === 'VIEWER' && '👀 관전자 모드'}
          </span>
          {effectiveRole === 'ORGANIZER' && <LinksModal />}
          <HowToUseModal variant="header" />
          {/* 낙찰 선수가 한 명이라도 있으면 결과 확인 버튼 노출 */}
          {soldPlayers.length > 0 && (
            <button
              onClick={() => setShowResultModal(true)}
              className="flex items-center gap-1.5 bg-minion-yellow hover:bg-minion-yellow-hover text-minion-blue px-3 py-1.5 rounded-xl text-sm font-bold transition-colors"
            >
              📋 경매 결과
            </button>
          )}
          {/* 주최자 전용: 방 종료 버튼 */}
          {effectiveRole === 'ORGANIZER' && (
            <button
              onClick={() => setIsEndRoomOpen(true)}
              className="flex items-center gap-1.5 bg-red-500/80 hover:bg-red-500 text-white px-3 py-1.5 rounded-xl text-sm font-bold transition-colors border border-red-400/40"
            >
              🚪 방 종료
            </button>
          )}
        </div>
        {createdAt && <ElapsedTimer createdAt={createdAt} />}
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden min-h-0">

        {/* Left: 팀 현황 */}
        <aside className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 flex-1 overflow-y-auto min-h-0 relative">
            <div className="sticky top-0 bg-card py-2 z-10 mb-2">
              <h2 className="text-lg font-bold text-minion-blue flex items-center gap-2">
                <span className="text-2xl">👥</span> 참가 팀 현황
              </h2>
            </div>
            <TeamList />
          </div>
        </aside>

        {/* Center: 경매 보드 + 컨트롤 패널 */}
        <section className="col-span-6 flex flex-col gap-4 h-full min-h-0">
          <AuctionBoard isLotteryActive={!!lotteryPlayer} />

          {/* 주최자 컨트롤 패널 */}
          {effectiveRole === 'ORGANIZER' && (
            <div className="bg-card rounded-2xl shadow-sm border border-border p-4 shrink-0">
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
                isAutoDraftMode ? (
                  <div className="bg-indigo-50 border-2 border-indigo-200 text-indigo-800 py-3.5 px-4 rounded-xl font-bold text-center flex flex-col items-center gap-1">
                    <span className="text-lg">⚡ 자동 드래프트 진행 중</span>
                    <span className="text-xs font-medium opacity-80">
                      {biddableTeams.length === 0 ? '전 팀 포인트 부족' : '입찰 가능 팀 1팀'} — 중앙 보드에서 선수를 배정하세요.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleDraw}
                      disabled={isDrawing || waitingPlayers.length === 0 || !allConnected}
                      className="w-full bg-minion-blue hover:bg-minion-blue-hover text-white py-3.5 rounded-xl font-black text-lg transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDrawing
                        ? '추첨 중...'
                        : !allConnected
                          ? '⏳ 팀장 전원 대기 중...'
                          : waitingPlayers.length === 0
                            ? '대기 중인 선수 없음'
                            : `🎲 다음 선수 추첨 (${waitingPlayers.length}명 대기)`}
                    </button>
                    {!allConnected && (
                      <p className="text-xs text-center text-red-600 font-bold animate-pulse bg-red-50 py-1.5 rounded-lg border border-red-100">
                        ⚠️ 모든 팀장({connectedLeaderIds.size}/{teams.length})이 입장해야 추첨 가능합니다.
                      </p>
                    )}
                  </div>
                )
              ) : !timerEndsAt ? (
                // 2. 선수 추첨됨, 경매 시작 대기
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleStart}
                    disabled={isStarting || !allConnected}
                    className="w-full bg-lime-500 hover:bg-lime-600 text-white py-3.5 rounded-xl font-black text-lg transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 shadow-[0_3px_0_#4d7c0f]"
                  >
                    {isStarting
                      ? '준비 중...'
                      : !allConnected
                        ? '⏳ 팀장 입장 대기 중'
                        : '▶ 경매 시작'}
                  </button>
                  {!allConnected && (
                    <p className="text-xs text-center text-red-600 font-bold animate-pulse bg-red-50 py-1.5 rounded-lg border border-red-100">
                      ⚠️ 모든 팀장({connectedLeaderIds.size}/{teams.length})이 입장해야 경매를 시작할 수 있습니다.
                    </p>
                  )}
                </div>
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

        {/* Right: 유찰선수 + 채팅 */}
        <aside className="col-span-3 flex flex-col gap-4 h-full min-h-0">
          <div className="bg-card rounded-2xl shadow-sm border border-border p-4 flex-[2] overflow-y-auto min-h-0 relative">
            <div className="sticky top-0 bg-card py-2 z-10 mb-2 border-b border-border">
              <h2 className="text-lg font-bold text-red-500 flex items-center gap-2">
                <span className="text-2xl">👻</span> 유찰 대기석
              </h2>
            </div>
            <UnsoldPanel />
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-border flex-[3] overflow-hidden flex flex-col min-h-0">
            <ChatPanel />
          </div>
        </aside>

      </main>

      {/* 추첨 애니메이션 오버레이 */}
      {lotteryPlayer && (
        <LotteryOverlay
          candidates={waitingPlayers}
          targetPlayer={lotteryPlayer}
          role={effectiveRole}
          isStarting={isStarting}
          allConnected={allConnected}
          onClose={handleCloseLottery}
          onStartAuction={handleStart}
        />
      )}

      {/* 방 종료 확인 모달 */}
      <EndRoomModal
        isOpen={isEndRoomOpen}
        isCompleted={allDone}
        isDeleting={isDeleting}
        onClose={() => setIsEndRoomOpen(false)}
        onConfirm={handleEndRoom}
      />

      {/* 경매 결과 확인 모달 (헤더 버튼 연결) */}
      <AuctionResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
      />
    </div>
  )
}
