"use client";

import React, { useState, useRef, useEffect } from "react";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  useAuctionStore,
  Message,
} from "@/features/auction/store/useAuctionStore";
import { sendChatMessage } from "@/features/auction/api/auctionActions";

const MAX_MESSAGE_LENGTH = 200;

function MessageItem({ msg }: { msg: Message }) {
  const role = msg.sender_role;

  const renderFormattedSystemMessage = (content: string) => {
    const regex =
      /(\d+P|[\w가-힣]+팀|[\w가-힣]+(?=\s선수)|[\w가-힣]+(?=\s->)|(?<=->\s)[\w가-힣]+)/g;
    const parts = content.split(regex);
    return parts.map((part, i) => {
      if (part.match(regex)) {
        return (
          <strong key={i} className="font-black text-black not-italic mx-0.5">
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  if (role === "SYSTEM") {
    return (
      <div className="flex items-center gap-3 my-2 px-3 py-2 bg-minion-blue/5 border-l-4 border-minion-blue animate-slide-in-left">
        <span className="text-fluid-xs text-minion-blue font-heading tracking-tighter shrink-0 flex items-center gap-1.5">
          <PixelIcon icon={PIXEL_ICONS.SUCCESS} size={10} color="text-minion-blue" strokeWidth={4} />
          [SYS]
        </span>
        <span className="text-fluid-xs text-gray-700 font-body leading-tight">
          {renderFormattedSystemMessage(msg.content)}
        </span>
      </div>
    );
  }

  if (role === "NOTICE") {
    return (
      <div className="bg-minion-yellow border-4 border-black p-3 my-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden group shrink-0 animate-bounce">
        <div className="absolute inset-0 opacity-5 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,black_5px,black_10px)]" />
        <div className="relative z-10 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-black text-minion-yellow text-fluid-xs px-2 py-0.5 font-heading uppercase">
              NOTICE
            </span>
            <span className="text-fluid-xs text-black/40 ml-auto font-mono">
              {new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-fluid-xs font-black text-black leading-normal font-body break-words whitespace-pre-wrap">
            {msg.content}
          </p>
        </div>
      </div>
    );
  }

  const BADGE: Record<string, string> = {
    ORGANIZER: "bg-minion-red text-white",
    LEADER: "bg-minion-blue text-white",
    VIEWER: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const label: Record<string, string> = {
    ORGANIZER: "주최자",
    LEADER: "팀장",
    VIEWER: "관전자",
  };

  return (
    <div className="my-2 group animate-slide-up">
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <span
          className={`text-fluid-xs font-heading px-1.5 py-0.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] leading-none ${BADGE[role] || ""}`}
        >
          {label[role] || "NPC"}
        </span>
        <span className="text-fluid-xs font-heading text-black tracking-tighter uppercase">
          {msg.sender_name}
        </span>
        <span className="text-fluid-xs text-gray-300 ml-auto font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(msg.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="pixel-box bg-white border-2 p-3 shadow-[4px_4px_0px_rgba(0,0,0,0.1)] group-hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all">
        <p className="text-gray-800 font-body text-fluid-sm leading-relaxed break-words">
          {msg.content}
        </p>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const roomId = useAuctionStore((s) => s.roomId);
  const role = useAuctionStore((s) => s.role);
  const messages = useAuctionStore((s) => s.messages);
  const teams = useAuctionStore((s) => s.teams);
  const teamId = useAuctionStore((s) => s.teamId);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    if (lastMsg.id !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastMsg.id;
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !roomId || isSending) return;
    setIsSending(true);
    try {
      let senderName = "관전자";
      if (role === "ORGANIZER") senderName = "주최자";
      else if (role === "LEADER") {
        const myTeam = teams.find((t) => t.id === teamId);
        senderName = myTeam?.leader_name || myTeam?.name || "팀장";
      }
      await sendChatMessage(roomId, senderName, role || "VIEWER", input.trim());
      setInput("");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white border-4 border-black shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]">
      {/* Chat Header */}
      {/* <div className="bg-black text-white px-4 py-2 flex items-center justify-between border-b-4 border-black">
        <span className="text-fluid-xs font-heading tracking-widest">
          실시간 로그
        </span>
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[8px] font-bold text-gray-400">온라인</span>
        </div>
      </div> */}

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="text-gray-300 text-fluid-xs text-center py-20 my-auto font-heading italic uppercase opacity-50">
            --- 대기 중 ---
          </div>
        ) : (
          messages.map((msg) => <MessageItem key={msg.id} msg={msg} />)
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="p-4 bg-gray-50 border-t-4 border-black flex flex-col gap-3"
      >
        <div className="flex justify-between items-center px-1">
          <span className="text-fluid-xs font-heading text-gray-400 uppercase tracking-tighter">
            MESSAGE
          </span>
          <span className="text-fluid-xs font-mono text-gray-400">
            {input.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
        <div className="flex gap-3 h-12">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요..."
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 bg-white border-4 w-2 border-black px-4 py-2 text-fluid-sm font-body font-bold focus:bg-yellow-50 focus:outline-none placeholder:text-gray-200 transition-colors"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="pixel-button bg-minion-yellow text-black h-full px-6 text-fluid-xs font-heading uppercase tracking-tight"
          >
            SEND
          </button>
        </div>
      </form>
    </div>
  );
}
