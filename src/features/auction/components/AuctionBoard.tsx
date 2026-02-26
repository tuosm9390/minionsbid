'use client'

import { useState, useEffect, useRef, memo } from 'react'
import { useAuctionStore, Message, PresenceUser, Team, Player, Role } from '@/features/auction/store/useAuctionStore'
import { draftPlayer, restartAuctionWithUnsold } from '@/features/auction/api/auctionActions'
import { AuctionResultModal } from './AuctionResultModal'
import { LotteryAnimation } from './LotteryAnimation'

const TIER_COLOR: Record<string, string> = {
  '챌린저': 'text-cyan-500', '그랜드마스터': 'text-red-500', '마스터': 'text-purple-500',
  '다이아': 'text-blue-400', '에메랄드': 'text-emerald-500', '플래티넘': 'text-teal-400',
  '골드': 'text-yellow-500', '실버': 'text-gray-400', '브론즈': 'text-amber-700', '언랭': 'text-gray-500',
  'Challenger': 'text-cyan-500', 'Grandmaster': 'text-red-500', 'Master': 'text-purple-500',
  'Diamond': 'text-blue-400', 'Emerald': 'text-emerald-500', 'Platinum': 'text-teal-400',
  'Gold': 'text-yellow-500', 'Silver': 'text-gray-400', 'Bronze': 'text-amber-700',
}

const NoticeBanner = memo(function NoticeBanner({ msg }: { msg: Message }) {
  return (
    <div className="bg-minion-yellow border-b-2 border-amber-400 px-6 py-2.5 flex items-center gap-3 shrink-0">
      <span className="text-xl shrink-0">📢</span>
      <p className="text-[13px] font-black text-amber-950 truncate"><span className="opacity-50 mr-2">공지:</span>{msg.content}</p>
    </div>
  )
})

export function CenterTimer({ timerEndsAt }: { timerEndsAt: string }) {
  const [now, setNow] = useState(Date.now())
  const initialDuration = useRef<number | null>(null)
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(iv) }, [])
  const target = new Date(timerEndsAt).getTime(); const lastTarget = useRef(target)
  useEffect(() => { const diff = target - Date.now(); if (target !== lastTarget.current) { initialDuration.current = diff; lastTarget.current = target } }, [target])
  const timeLeftMs = Math.max(0, target - now); const timeLeftSec = Math.max(0, (timeLeftMs - 100) / 1000); const displayTime = Math.ceil(timeLeftSec)
  const progress = initialDuration.current ? (timeLeftMs / initialDuration.current) * 100 : 0
  const pad = (n: number) => String(n).padStart(2, '0'); const isUrgent = displayTime > 0 && displayTime <= 5
  return (
    <div className="flex flex-col items-center">
      <div className={`relative flex items-center justify-center gap-3 rounded-2xl px-10 py-4 font-mono font-black text-6xl transition-all duration-300 overflow-hidden ${isUrgent ? 'bg-red-500 text-white animate-shake shadow-xl' : displayTime === 0 ? 'bg-gray-100 text-gray-400' : 'bg-minion-blue text-white shadow-lg'}`}>
        <span className="text-4xl">⏱</span>
        <span className="z-10 tracking-tighter">{isUrgent ? timeLeftSec.toFixed(1) : `${pad(Math.floor(displayTime / 60))}:${pad(displayTime % 60)}`}</span>
        {displayTime > 0 && <div className={`absolute bottom-0 left-0 h-2 transition-all duration-100 ${isUrgent ? 'bg-white/40' : 'bg-minion-yellow/40'}`} style={{ width: `${progress}%` }} />}
      </div>
    </div>
  )
}

export function AuctionBoard({
  isLotteryActive = false, lotteryPlayer, waitingPlayers = [], role, allConnected = true, onCloseLottery,
}: {
  isLotteryActive?: boolean; lotteryPlayer?: Player | null; waitingPlayers?: Player[]; role?: Role; allConnected?: boolean; onCloseLottery?: () => void;
}) {
  const players = useAuctionStore(s => s.players); const bids = useAuctionStore(s => s.bids); const teams = useAuctionStore(s => s.teams); const presences = useAuctionStore(s => s.presences); const messages = useAuctionStore(s => s.messages); const teamId = useAuctionStore(s => s.teamId); const roomId = useAuctionStore(s => s.roomId); const timerEndsAt = useAuctionStore(s => s.timerEndsAt); const membersPerTeam = useAuctionStore(s => s.membersPerTeam); const hasPlayedReadyAnimation = useAuctionStore(s => s.hasPlayedReadyAnimation); const setReadyAnimationPlayed = useAuctionStore(s => s.setReadyAnimationPlayed)
  const connectedLeaderIds = new Set(presences.filter((p: PresenceUser) => p.role === 'LEADER').map((p: PresenceUser) => p.teamId))
  const [showReadyAnim, setShowReadyAnim] = useState(false)
  useEffect(() => { if (allConnected && !hasPlayedReadyAnimation && teams.length > 0) setShowReadyAnim(true) }, [allConnected, hasPlayedReadyAnimation, teams.length])
  useEffect(() => { if (!allConnected && showReadyAnim) setShowReadyAnim(false) }, [allConnected, showReadyAnim])
  useEffect(() => { if (players.some(p => p.status === 'IN_AUCTION') && showReadyAnim) { setShowReadyAnim(false); setReadyAnimationPlayed(true) } }, [players, showReadyAnim, setReadyAnimationPlayed])
  const currentPlayer = isLotteryActive ? undefined : players.find(p => p.status === 'IN_AUCTION')
  const latestNotice = [...messages].reverse().find(m => m.sender_role === 'NOTICE')
  const playerBids = bids.filter(b => b.player_id === currentPlayer?.id); const highestBid = playerBids.length > 0 ? Math.max(...playerBids.map(b => b.amount)) : 0; const topBid = playerBids.find(b => b.amount === highestBid); const leadingTeam = teams.find(t => t.id === topBid?.team_id)
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD'); const waitingPlayersList = players.filter(p => p.status === 'WAITING'); const teamPlayerCounts = teams.map(t => ({ ...t, soldCount: players.filter(p => p.team_id === t.id && p.status === 'SOLD').length }))
  const needyTeams = teamPlayerCounts.filter(t => t.soldCount < (membersPerTeam - 1)); const isRoomComplete = teams.length > 0 && needyTeams.length === 0; const isAuctionFinished = players.length > 0 && players.filter(p => p.status === 'WAITING' || p.status === 'IN_AUCTION').length === 0
  const biddableTeams = teamPlayerCounts.filter(t => t.soldCount < (membersPerTeam - 1) && t.point_balance >= 10); const isAutoDraftMode = !currentPlayer && waitingPlayersList.length > 0 && unsoldPlayers.length === 0 && biddableTeams.length <= 1; const maxEmptySlots = needyTeams.length > 0 ? Math.max(...needyTeams.map(t => (membersPerTeam - 1) - t.soldCount)) : 0; const phase = (needyTeams.length >= 2 && maxEmptySlots >= 2) ? 'RE_AUCTION' : 'DRAFT'
  needyTeams.sort((a, b) => b.point_balance === a.point_balance ? a.name.localeCompare(b.name) : b.point_balance - a.point_balance)
  const currentTurnTeam = needyTeams.length > 0 ? needyTeams[0] : null; const [isProcessingAction, setIsProcessingAction] = useState<string | null>(null); const [showResultModal, setShowResultModal] = useState(false)
  const handleDraft = async (playerId: string) => { if (!currentTurnTeam || !roomId) return; setIsProcessingAction(playerId); try { const res = await draftPlayer(roomId, playerId, currentTurnTeam.id); if (res.error) alert(res.error) } finally { setIsProcessingAction(null) } }
  const [isRestarting, setIsRestarting] = useState(false); const handleRestartAuction = async () => { if (!roomId) return; setIsRestarting(true); try { const res = await restartAuctionWithUnsold(roomId); if (res.error) alert(res.error) } finally { setIsRestarting(false) } }
  const [lotteryDone, setLotteryDone] = useState(false)
  useEffect(() => { setLotteryDone(false) }, [lotteryPlayer])

  return (
    <div className="bg-white rounded-[2.5rem] shadow-xl border-[6px] border-minion-blue flex-1 flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-500 min-h-0">
      {latestNotice && <NoticeBanner msg={latestNotice} />}
      {!allConnected && (
        <div className="absolute inset-0 z-[50] flex flex-col items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-[10px] border-red-500 flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-5xl animate-pulse">⚠️</div>
            <h2 className="text-3xl font-black text-red-600 tracking-tighter">팀장 접속 이탈</h2>
            <p className="text-base text-gray-500 font-bold leading-tight">경매가 일시정지되었습니다.<br />모든 팀장이 재입장하면 재개됩니다.</p>
          </div>
        </div>
      )}
      <div className="absolute top-0 right-0 w-80 h-80 bg-minion-yellow/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="z-10 flex flex-col flex-1 p-6 gap-4 min-h-0">
        <div className="flex justify-center min-h-[40px]">
          {currentPlayer ? (timerEndsAt ? <span className="bg-red-500 text-white font-black px-6 py-2 rounded-full text-sm shadow-lg border-2 border-red-600 animate-bounce">🔥 경매 진행 중 🔥</span> : <span className="bg-gray-200 text-gray-500 font-black px-6 py-2 rounded-full text-sm border-2 border-gray-300 animate-pulse uppercase tracking-widest">경매 준비중...</span>)
            : isLotteryActive ? <span className="bg-minion-blue text-white font-black px-6 py-2 rounded-full text-sm shadow-lg border-2 border-blue-600 animate-pulse">🎲 추첨 진행 중</span>
              : isAuctionFinished ? <span className="bg-green-500 text-white font-black px-6 py-2 rounded-full text-sm shadow-lg border-2 border-green-600">✅ 경매 종료</span>
                : <span className="bg-minion-yellow text-minion-blue font-black px-6 py-2 rounded-full text-sm shadow-lg border-2 border-amber-400">⏱️ 추첨 대기</span>}
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {isLotteryActive && lotteryPlayer ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <LotteryAnimation candidates={waitingPlayers} targetPlayer={lotteryPlayer} onFinished={() => setLotteryDone(true)} />
              <div className="min-h-[70px] flex items-center justify-center">
                {role === 'ORGANIZER' && lotteryDone && (
                  <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <button onClick={onCloseLottery} className="w-[200px] bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-2xl font-black text-lg shadow-[0_4px_0_#374151] active:translate-y-1 transition-all">경매 준비</button>
                  </div>
                )}
              </div>
            </div>
          ) : currentPlayer ? (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              <div className="flex justify-center min-h-[60px]">{timerEndsAt && <CenterTimer timerEndsAt={timerEndsAt} />}</div>
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <h2 className="text-6xl font-black text-gray-900 tracking-tighter drop-shadow-sm leading-none">{currentPlayer.name}</h2>
                <div className="flex gap-3 items-center justify-center">
                  <div className={`text-2xl font-black bg-gray-50 px-5 py-2 rounded-2xl border-2 border-gray-200 ${TIER_COLOR[currentPlayer.tier] || 'text-gray-600'}`}>{currentPlayer.tier}</div>
                  <div className="text-2xl font-black bg-gray-50 px-5 py-2 rounded-2xl border-2 border-gray-200 text-gray-700">{currentPlayer.main_position}</div>
                </div>
                {currentPlayer.description && <p className="text-sm text-gray-400 max-w-md font-bold italic">"{currentPlayer.description}"</p>}
              </div>
              <div className={`rounded-3xl p-5 border-[3px] transition-all ${highestBid > 0 ? 'bg-minion-yellow/5 border-minion-yellow shadow-inner' : 'bg-gray-50 border-gray-200'}`}>
                {highestBid > 0 ? (
                  <div className="flex items-center justify-between px-4">
                    <div><p className="text-xs text-gray-400 font-black mb-1 uppercase tracking-widest">Highest Bid</p><p className="text-5xl font-black text-minion-blue tabular-nums">{highestBid.toLocaleString()}<span className="text-2xl ml-1">P</span></p></div>
                    <div className="text-right"><p className="text-xs text-gray-400 font-black mb-1 uppercase tracking-widest">Leading Team</p><p className="text-2xl font-black text-gray-800">{leadingTeam?.name || '?'}</p>{leadingTeam?.id === teamId && <p className="text-xs font-black text-green-600 animate-pulse mt-1">MY TEAM IS LEADING 👑</p>}</div>
                  </div>
                ) : <p className="text-xl text-center text-gray-400 py-2 font-black italic tracking-tight">입찰을 기다리고 있습니다...</p>}
              </div>
            </div>
          ) : (isAuctionFinished || isAutoDraftMode) && !isRoomComplete ? (
            <div className="flex-1 flex flex-col min-h-0">
              {(() => {
                const effectivePhase = isAutoDraftMode ? 'DRAFT' : phase
                const draftablePlayers = isAutoDraftMode ? waitingPlayersList : unsoldPlayers
                return <>
                  <div className="text-center mb-4">
                    <span className={`text-white font-black px-8 py-3 rounded-2xl text-base border-[3px] shadow-lg ${effectivePhase === 'DRAFT' ? 'bg-purple-500 border-purple-600' : 'bg-orange-500 border-orange-600'}`}>{effectivePhase === 'DRAFT' ? '🤝 자유계약 (드래프트) 진행 중' : '🔄 유찰 선수 재경매 진행 중'}</span>
                    {effectivePhase === 'DRAFT' && currentTurnTeam && <div className="mt-6 flex flex-col items-center"><span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Current Turn</span><span className="text-4xl font-black text-purple-700 bg-purple-50 px-8 py-2 rounded-2xl border-2 border-purple-200 shadow-sm">{currentTurnTeam.name} <span className="text-2xl text-purple-400 ml-2">({currentTurnTeam.point_balance}P)</span></span></div>}
                    {effectivePhase !== 'DRAFT' && role === 'ORGANIZER' && <div className="mt-6"><button onClick={handleRestartAuction} disabled={isRestarting || !allConnected} className="bg-orange-500 text-white font-black px-10 py-4 rounded-2xl text-xl shadow-[0_6px_0_#9a3412] active:translate-y-1 transition-all">▶ 재경매 시작하기</button></div>}
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-2 mt-2">
                    <div className="grid grid-cols-2 gap-3 p-1">
                      {draftablePlayers.map(p => (
                        <div key={p.id} className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 flex items-center justify-between hover:border-minion-blue transition-colors shadow-sm">
                          <div className="min-w-0"><p className="font-black text-base text-gray-800 truncate">{p.name}</p><p className={`text-xs font-black ${TIER_COLOR[p.tier] || 'text-gray-500'}`}>{p.tier} <span className="text-gray-300 ml-1">|</span> <span className="text-gray-500 ml-1">{p.main_position}</span></p></div>
                          {effectivePhase === 'DRAFT' && role === 'ORGANIZER' && <button onClick={() => handleDraft(p.id)} disabled={isProcessingAction !== null || !currentTurnTeam} className="bg-purple-600 text-white font-black px-5 py-2.5 rounded-xl text-sm shadow-[0_4px_0_#4c1d95] active:translate-y-0.5">배정</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              })()}
            </div>
          ) : isAuctionFinished ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-32 h-32 bg-green-50 rounded-full flex items-center justify-center mb-6 border-[8px] border-green-100 shadow-inner"><span className="text-7xl animate-bounce">🎉</span></div>
              <h1 className="text-5xl font-black text-green-600 mb-4 drop-shadow-sm">모든 경매 종료!</h1>
              <button onClick={() => setShowResultModal(true)} className="bg-minion-blue text-white font-black px-12 py-5 rounded-[2.5rem] text-2xl shadow-[0_8px_0_#1a3d73] active:translate-y-1.5 transition-all animate-pulse">📋 결과 최종 확인</button>
              <AuctionResultModal isOpen={showResultModal} onClose={() => setShowResultModal(false)} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {!allConnected ? (
                <>
                  <div className="flex items-center justify-between mb-6 px-2">
                    <h2 className="text-3xl font-black text-minion-blue flex items-center gap-3"><span className="w-2.5 h-10 bg-minion-yellow rounded-full shadow-sm"></span>팀장 접속 현황</h2>
                    <span className="text-sm font-black px-5 py-2 rounded-full border-2 bg-orange-50 text-orange-600 border-orange-200 shadow-sm animate-pulse">⏳ 접속 대기 중 ({connectedLeaderIds.size}/{teams.length})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 overflow-y-auto custom-scrollbar p-2 flex-1 min-h-0">
                    {teams.map((team) => {
                      const connected = connectedLeaderIds.has(team.id)
                      return (
                        <div key={team.id} className={`rounded-[2.5rem] border-4 p-6 flex items-center gap-5 transition-all duration-500 ${connected ? 'border-green-300 bg-green-50/50 shadow-md scale-[1.02]' : 'border-gray-100 bg-gray-50/50 grayscale opacity-60'}`}>
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-4xl shadow-inner ${connected ? 'bg-green-100' : 'bg-gray-200'}`}>{connected ? '✅' : '⏳'}</div>
                          <div className="min-w-0"><p className="font-black text-gray-800 text-lg truncate mb-0.5">{team.name}</p><p className={`font-black text-xs uppercase tracking-widest ${connected ? 'text-green-600' : 'text-gray-400'}`}>{connected ? 'Online' : 'Offline'}</p></div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-700">
                  <div className="w-32 h-32 bg-minion-yellow/10 rounded-full flex items-center justify-center mb-6 border-4 border-dashed border-minion-yellow animate-[spin_15s_linear_infinite] shadow-inner"><span className="text-6xl animate-bounce">🎰</span></div>
                  <h3 className="text-4xl font-black text-minion-blue mb-3 tracking-tighter">모든 준비가 완료되었습니다!</h3>
                  <p className="text-lg text-gray-500 font-bold max-w-md leading-relaxed">현재 <span className="text-minion-blue bg-minion-yellow px-3 py-1 rounded-xl shadow-sm">추첨 대기 중</span>입니다.<br />주최자가 선수를 추첨하면 경매가 시작됩니다.</p>
                  <div className="mt-8 flex gap-3">
                    {[0, 0.2, 0.4].map(d => <div key={d} className="w-3 h-3 bg-minion-yellow rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
