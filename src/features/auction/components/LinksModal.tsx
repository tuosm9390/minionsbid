"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useAuctionStore,
  Team,
} from "@/features/auction/store/useAuctionStore";
import { X } from "lucide-react";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { LinkCard } from "@/components/ui/LinkCard";

export function LinksModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const roomId = useAuctionStore((state) => state.roomId);
  const teams = useAuctionStore((state) => state.teams);
  const organizerToken = useAuctionStore((state) => state.organizerToken);
  const viewerToken = useAuctionStore((state) => state.viewerToken);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!roomId) return null;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const organizerLink = organizerToken
    ? `${baseUrl}/api/room-auth?roomId=${roomId}&role=ORGANIZER&token=${organizerToken}`
    : null;
  const viewerLink = viewerToken
    ? `${baseUrl}/api/room-auth?roomId=${roomId}&role=VIEWER&token=${viewerToken}`
    : null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b-4 border-black flex items-center justify-between bg-minion-blue text-white">
          <h2 className="text-sm font-black flex items-center gap-2">
            <PixelIcon icon={PIXEL_ICONS.LINKS} size={18} color="text-white" label="연결" />
            접속 링크
          </h2>
          <button onClick={() => setIsOpen(false)} className="hover:text-minion-yellow transition-colors flex items-center">
            <PixelIcon icon={X} size={20} label="닫기" />
          </button>
        </div>

        <div className="p-5 space-y-2 overflow-y-auto custom-scrollbar bg-gray-50">
          {organizerLink && (
            <div>
              <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter mb-2 flex items-center gap-1.5">
                <PixelIcon icon={PIXEL_ICONS.LEADING} size={14} color="text-minion-yellow" />
                주최자
              </div>
              <LinkCard
                label="주최자" desc="주최자 전용 컨트롤 패널"
                link={organizerLink} linkKey="organizer" variant="compact"
                copied={copied} onCopy={copyToClipboard}
              />
            </div>
          )}

          <div className="pt-2">
            <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter mb-2 flex items-center gap-1.5">
              <PixelIcon icon={PIXEL_ICONS.SUCCESS} size={14} color="text-minion-blue" />
              팀장 링크
            </div>
            <div className="space-y-1">
              {[...teams]
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                .map((team: Team, i: number) => {
                  const link = team.leader_token
                    ? `${baseUrl}/api/room-auth?roomId=${roomId}&role=LEADER&teamId=${team.id}&token=${team.leader_token}`
                    : null;
                  if (!link) return null;
                  return (
                    <LinkCard
                      key={team.id} label={team.name}
                      desc={`팀장: ${team.leader_name || "(미설정)"}`}
                      link={link} linkKey={`captain-${i}`} variant="compact"
                      copied={copied} onCopy={copyToClipboard}
                    />
                  );
                })}
            </div>
          </div>

          {viewerLink && (
            <div className="pt-2">
              <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter mb-2 flex items-center gap-1.5">
                <PixelIcon icon={PIXEL_ICONS.HOW_TO_USE} size={14} color="text-gray-400" />
                관전자 링크
              </div>
              <LinkCard
                label="관전자" desc="누구나 관전 가능"
                link={viewerLink} linkKey="viewer" variant="compact"
                copied={copied} onCopy={copyToClipboard}
              />
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t-4 border-black bg-white">
          <button 
            onClick={() => setIsOpen(false)} 
            className="pixel-button w-full h-12 bg-black text-white text-fluid-xs font-heading uppercase tracking-tight"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="pixel-button bg-white/10 hover:bg-white/20 text-white px-4 h-10 text-fluid-xs font-heading uppercase tracking-tight border-white/20 shadow-none transition-all gap-2"
      >
        <PixelIcon icon={PIXEL_ICONS.LINKS} size={14} color="text-white" />
        링크
      </button>

      {isOpen && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
