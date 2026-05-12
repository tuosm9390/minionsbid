"use client";

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

  return (
    <div className={`border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative flex items-center gap-4 ${isCompact ? "p-3 mb-3" : "p-4 mb-4"}`}>
      <div className="flex-1 min-w-0">
        <p className={`${isCompact ? "text-xs" : "text-sm"} font-black text-black uppercase flex items-center gap-2`}>
          {label}
        </p>
        <p className="text-fluid-xs text-gray-400 font-bold mt-0.5">{desc}</p>
        <div className={`mt-2 bg-gray-100 p-2 border-2 border-black overflow-hidden relative group`}>
          <p className="text-fluid-xs text-minion-blue font-mono truncate pr-2">
            {link}
          </p>
        </div>
      </div>
      <button
        onClick={() => onCopy(link, linkKey)}
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
