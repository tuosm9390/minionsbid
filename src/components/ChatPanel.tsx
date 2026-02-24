'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useAuctionStore, Message } from '@/store/useAuctionStore'
import { supabase } from '@/lib/supabase'

const MAX_MESSAGE_LENGTH = 200

function MessageItem({ msg }: { msg: Message }) {
  const role = msg.sender_role

  // ── 시스템 메시지 ──
  if (role === 'SYSTEM') {
    return (
      <div className="flex justify-center my-0.5">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full font-medium italic">
          {msg.content}
        </span>
      </div>
    )
  }

  // ── 공지 메시지 ──
  if (role === 'NOTICE') {
    return (
      <div className="bg-minion-yellow/20 border border-minion-yellow rounded-xl px-3 py-2 my-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-black text-amber-700">📢 공지</span>
          <span className="text-[10px] text-gray-400 ml-auto font-mono">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm font-bold text-amber-900 break-words">{msg.content}</p>
      </div>
    )
  }

  // ── 일반 채팅 ──
  const BADGE: Record<string, React.ReactElement> = {
    ORGANIZER: <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200">👑 주최자</span>,
    LEADER:    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200">🛡️ 팀장</span>,
    VIEWER:    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">👁️ 관전</span>,
  }
  const badge = BADGE[role] ?? <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{role}</span>

  return (
    <div className="text-sm bg-gray-50 hover:bg-gray-100/70 p-2 rounded-xl transition-colors">
      <div className="flex items-center gap-1 mb-0.5">
        {badge}
        <span className="font-bold text-gray-800 text-xs">{msg.sender_name}</span>
        <span className="text-[10px] text-gray-400 ml-auto font-mono">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-gray-700 leading-relaxed pl-0.5 break-words">{msg.content}</p>
    </div>
  )
}

export function ChatPanel() {
  const roomId   = useAuctionStore(s => s.roomId)
  const role     = useAuctionStore(s => s.role)
  const messages = useAuctionStore(s => s.messages)
  const teams    = useAuctionStore(s => s.teams)
  const teamId   = useAuctionStore(s => s.teamId)

  const [input, setInput]       = useState('')
  const [isSending, setIsSending] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const lastSentAtRef = useRef(0)
  const lastMsgIdRef = useRef<string | null>(null)

  // 진짜 새 메시지가 추가됐을 때만 스크롤 (fetchAll 재로드 시 고정 방지)
  // scrollIntoView 대신 컨테이너 scrollTop 직접 제어 → 페이지 스크롤에 영향 없음
  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg) return
    if (lastMsg.id !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastMsg.id
      const el = scrollContainerRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !roomId || isSending) return
    if (input.trim().length > MAX_MESSAGE_LENGTH) return
    // 도배 방지: 1초 쿨다운
    const now = Date.now()
    if (now - lastSentAtRef.current < 1000) return
    lastSentAtRef.current = now

    setIsSending(true)
    try {
      let senderName = '관전자'
      if (role === 'ORGANIZER') senderName = '주최자'
      else if (role === 'LEADER') {
        const myTeam = teams.find(t => t.id === teamId)
        senderName = myTeam?.leader_name || myTeam?.name || '팀장'
      }

      const { error } = await supabase.from('messages').insert([{
        room_id:     roomId,
        sender_name: senderName,
        sender_role: role || 'VIEWER',
        content:     input.trim(),
      }])
      if (error) { console.error('Failed to send message:', error); return }
      setInput('')
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border flex-1 flex flex-col overflow-hidden max-h-[60vh]">
      <h2 className="text-lg font-bold text-minion-blue mx-4 mt-4 mb-2 flex items-center gap-2 border-b pb-2">
        <span className="text-2xl">💬</span> 실시간 채팅
      </h2>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-1 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-muted-foreground text-sm text-center py-10 my-auto">
            첫 메시지를 입력해 대화를 시작하세요.
          </div>
        ) : (
          messages.map((msg) => <MessageItem key={msg.id} msg={msg} />)
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t bg-gray-50 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="메시지 입력..."
          maxLength={MAX_MESSAGE_LENGTH}
          className="flex-1 bg-white border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-minion-yellow transition-shadow"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="bg-minion-blue text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-minion-blue-hover transition-colors disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  )
}
