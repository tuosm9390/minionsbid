"use client";

import { useMemo } from "react";
import { Check, Copy } from "@/components/ui/CyberIcons";

interface LinkCardProps {
  label: string;
  desc: string;
  link: string;
  linkKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  variant?: "default" | "compact";
}

function stripAuthToken(value: string) {
  try {
    const url = new URL(value);
    url.searchParams.delete("authToken");
    return url.toString();
  } catch {
    return value;
  }
}

export function LinkCard({
  label,
  desc,
  link,
  linkKey,
  copied,
  onCopy,
  variant = "default",
}: LinkCardProps) {
  const isCompact = variant === "compact";
  const sanitizedLink = useMemo(() => stripAuthToken(link), [link]);
  // 인증 정보가 포함된 링크는 화면에 노출하지 않되, invite 링크는
  // 외부 단축 서비스를 거치지 않고 원본 URL을 그대로 사용한다.
  const displayLink = sanitizedLink;

  return (
    <div className={`border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative flex items-center gap-4 ${isCompact ? "p-3 mb-3" : "p-4 mb-4"}`}>
      <div className="flex-1 min-w-0">
        <p className={`${isCompact ? "text-xs" : "text-sm"} font-black text-black uppercase flex items-center gap-2`}>
          {label}
        </p>
        <p className="text-fluid-xs text-gray-400 font-bold mt-0.5">{desc}</p>
        <div className={`mt-2 bg-gray-100 p-2 border-2 border-black overflow-hidden relative group`}>
          <p className="text-fluid-xs text-minion-blue font-mono truncate pr-2">
            {displayLink}
          </p>
        </div>
      </div>
      <button
        onClick={() => onCopy(displayLink, linkKey)}
        className={`pixel-button shrink-0 flex items-center justify-center transition-all ${isCompact ? "w-10 h-10" : "w-12 h-12"} ${
          copied === linkKey
            ? "bg-green-500 text-white"
            : "bg-white hover:bg-gray-50 text-black"
        }`}
        title="복사하기"
      >
        {copied === linkKey ? (
          <Check size={isCompact ? 16 : 20} />
        ) : (
          <Copy size={isCompact ? 16 : 20} />
        )}
      </button>
    </div>
  );
}
