"use client";

import { memo } from "react";
import { Message } from "@/features/auction/store/useAuctionStore";

interface NoticeBannerProps {
  msg: Message;
}

export const NoticeBanner = memo(function NoticeBanner({
  msg,
}: NoticeBannerProps) {
  return (
    <div className="bg-black border-b-4 border-minion-yellow px-6 py-3 flex items-center gap-4 shrink-0 relative overflow-hidden group">
      {/* Decorative background grid effect */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,var(--color-minion-yellow)_1px,transparent_1px)] bg-[size:10px_10px]" />
      
      <div className="z-10 flex items-center gap-3">
        <span className="bg-minion-yellow text-black font-heading text-fluid-xs px-2 py-1 animate-pulse shadow-[2px_2px_0px_var(--color-minion-blue)]">
          공지
        </span>
        <p className="text-fluid-xs font-bold text-white tracking-tight truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all">
          {msg.content}
        </p>
      </div>
      
      {/* Animated pixel decoration at the end */}
      <div className="ml-auto flex gap-1 z-10">
        <div className="w-2 h-2 bg-minion-yellow animate-bounce [animation-delay:0s]" />
        <div className="w-2 h-2 bg-minion-yellow animate-bounce [animation-delay:0.2s]" />
        <div className="w-2 h-2 bg-minion-yellow animate-bounce [animation-delay:0.4s]" />
      </div>
    </div>
  );
});
