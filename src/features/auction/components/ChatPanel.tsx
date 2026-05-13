"use client";

import React, { memo, useState, useRef, useEffect, useMemo } from "react";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  AuctionStartPlay,
  AwardPersonCheck,
  BidMoneyIncrease,
  LotteryStarburst,
  SealedBidReveal,
  SealedBidStart,
} from "@/components/ui/CyberIcons";
import {
  useAuctionStore,
  type Message,
} from "@/features/auction/store/useAuctionStore";
import { sendChatMessage } from "@/features/auction/api/auctionActions";
import { selectOrderedMessages } from "@/features/auction/store/auctionSelectors";

const MAX_MESSAGE_LENGTH = 200;

function getSystemMessageVisual(content: string): {
  icon: React.ReactNode | null;
  content: string;
} {
  if (content.startsWith("🎲")) {
    return {
      icon: <LotteryStarburst size={18} aria-label="추첨 결과" />,
      content: content.replace(/^🎲\s*/, ""),
    };
  }
  if (content.startsWith("🏆")) {
    return {
      icon: <AwardPersonCheck size={18} aria-label="낙찰" />,
      content: content.replace(/^🏆\s*/, ""),
    };
  }
  if (content.startsWith("💰")) {
    return {
      icon: <BidMoneyIncrease size={18} aria-label="입찰" />,
      content: content.replace(/^💰\s*/, ""),
    };
  }
  if (content.startsWith("⏱️")) {
    return {
      icon: <AuctionStartPlay size={18} aria-label="경매 시작" />,
      content: content.replace(/^⏱️\s*/, ""),
    };
  }
  if (content.startsWith("🔒")) {
    return {
      icon: <SealedBidStart size={18} aria-label="비공개 입찰" />,
      content: content.replace(/^🔒\s*/, ""),
    };
  }
  if (content.startsWith("🃏")) {
    return {
      icon: <SealedBidReveal size={18} aria-label="점수 공개" />,
      content: content.replace(/^🃏\s*/, ""),
    };
  }
  if (content.startsWith("⚠️")) {
    return {
      icon: (
        <PixelIcon
          icon={PIXEL_ICONS.WARNING}
          size={14}
          color="text-minion-red"
        />
      ),
      content: content.replace(/^⚠️\s*/, ""),
    };
  }
  if (content.startsWith("✅")) {
    return {
      icon: (
        <PixelIcon
          icon={PIXEL_ICONS.SUCCESS}
          size={14}
          color="text-green-600"
        />
      ),
      content: content.replace(/^✅\s*/, ""),
    };
  }
  if (content.startsWith("❌")) {
    return {
      icon: (
        <PixelIcon icon={PIXEL_ICONS.CLOSE} size={14} color="text-minion-red" />
      ),
      content: content.replace(/^❌\s*/, ""),
    };
  }

  return { icon: null, content };
}

const MessageItem = memo(function MessageItem({ msg }: { msg: Message }) {
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
    const visual = getSystemMessageVisual(msg.content);

    return (
      <div className="flex items-center gap-3 my-1.5 px-3 py-2 bg-minion-blue/5 border-l-4 border-minion-blue animate-slide-in-left relative group">
        <div className="absolute inset-0 bg-minion-blue/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <span className="text-fluid-xs text-minion-blue font-heading tracking-tighter shrink-0 flex items-center gap-1.5 relative z-10">
          <PixelIcon
            icon={PIXEL_ICONS.SUCCESS}
            size={10}
            color="text-minion-blue"
          />
          SYS
        </span>
        {visual.icon && (
          <span className="relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center">
            {visual.icon}
          </span>
        )}
        <span className="text-fluid-xs text-gray-700 font-body leading-normal relative z-10 break-words">
          {renderFormattedSystemMessage(visual.content)}
        </span>
      </div>
    );
  }

  if (role === "NOTICE") {
    return (
      <div className="bg-minion-yellow border-4 border-black p-3.5 my-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden group shrink-0">
        <div className="absolute inset-0 opacity-5 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,black_5px,black_10px)]" />
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-black px-2 py-0.5 flex items-center gap-1.5">
              <PixelIcon
                icon={PIXEL_ICONS.WARNING}
                size={10}
                color="text-minion-yellow"
                animation="urgent"
              />
              <span className="text-minion-yellow text-[10px] font-heading uppercase tracking-tighter">
                IMPORTANT
              </span>
            </div>
            <span className="text-[10px] text-black/40 ml-auto font-mono">
              {new Date(msg.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-fluid-xs font-black text-black leading-snug font-body break-words whitespace-pre-wrap">
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
    ORGANIZER: "HOST",
    LEADER: "TEAM",
    VIEWER: "VIEW",
  };

  return (
    <div className="my-3 group animate-slide-up">
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <span
          className={`text-[10px] font-heading px-1.5 py-0.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] leading-none ${BADGE[role] || ""}`}
        >
          {label[role] || "NPC"}
        </span>
        <span className="text-fluid-xs font-black text-black tracking-tighter uppercase">
          {msg.sender_name}
        </span>
        <span className="text-[10px] text-gray-300 ml-auto font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {new Date(msg.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="pixel-box bg-white border-2 p-3 shadow-pixel-active group-hover:shadow-pixel-sm transition-all">
        <p className="text-gray-800 font-body text-fluid-sm leading-relaxed break-words">
          {msg.content}
        </p>
      </div>
    </div>
  );
});

const MessageList = memo(function MessageList({
  messages,
}: {
  messages: Message[];
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const lastMsgKey = lastMsg.event_id ?? lastMsg.id;
    if (lastMsgKey !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastMsgKey;
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1 custom-scrollbar"
    >
      {messages.length === 0 ? (
        <div className="text-gray-300 text-fluid-xs text-center py-20 my-auto font-heading italic uppercase opacity-50 flex flex-col items-center gap-4">
          <PixelIcon
            icon={PIXEL_ICONS.WAITING}
            size={32}
            color="text-gray-200"
            animation="active"
          />
          --- WAITING FOR LOGS ---
        </div>
      ) : (
        messages.map((msg) => (
          <MessageItem key={msg.event_id ?? msg.id} msg={msg} />
        ))
      )}
    </div>
  );
});

const ChatComposer = memo(function ChatComposer() {
  const roomId = useAuctionStore((s) => s.roomId);
  const role = useAuctionStore((s) => s.role);
  const teams = useAuctionStore((s) => s.teams);
  const teamId = useAuctionStore((s) => s.teamId);
  const appendMessage = useAuctionStore((s) => s.appendMessage);
  const removeMessage = useAuctionStore((s) => s.removeMessage);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !roomId || isSending) return;
    setIsSending(true);
    const content = input.trim();
    let optimisticEventId: string | null = null;
    try {
      let senderName = "관전자";
      if (role === "ORGANIZER") senderName = "주최자";
      else if (role === "LEADER") {
        const myTeam = teams.find((t) => t.id === teamId);
        senderName = myTeam?.leader_name || myTeam?.name || "팀장";
      }

      const eventId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      optimisticEventId = eventId;
      appendMessage({
        id: eventId,
        event_id: eventId,
        room_id: roomId,
        sender_name: senderName,
        sender_role: (role || "VIEWER") as Message["sender_role"],
        content,
        created_at: new Date().toISOString(),
      });

      const result = await sendChatMessage(
        roomId,
        senderName,
        role || "VIEWER",
        content,
        eventId,
      );
      if (result.error) {
        removeMessage(eventId);
        return;
      }
      setInput("");
    } catch {
      if (optimisticEventId) {
        removeMessage(optimisticEventId);
      }
      return;
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      onSubmit={handleSend}
      className="p-4 bg-gray-50 border-t-4 border-black flex flex-col gap-3"
    >
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500 animate-pulse" />
          <span className="text-[10px] font-heading text-gray-400 uppercase tracking-tighter">
            COMMS LINK ACTIVE
          </span>
        </div>
        <span className="text-[10px] font-mono text-gray-400">
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
          className="flex-1 bg-white border-4 w-2 border-black px-4 py-2 text-fluid-xs font-body focus:bg-yellow-50 focus:outline-none placeholder:text-gray-200 transition-colors"
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
  );
});

export function ChatPanel() {
  const messagesById = useAuctionStore((s) => s.messagesById);
  const orderedMessageIds = useAuctionStore((s) => s.orderedMessageIds);
  const messages = useMemo(
    () => selectOrderedMessages(messagesById, orderedMessageIds),
    [messagesById, orderedMessageIds],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white border-4 border-black shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]">
      <MessageList messages={messages} />
      <ChatComposer />
    </div>
  );
}
