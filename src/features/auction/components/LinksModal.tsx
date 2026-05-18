"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import { X } from "@/components/ui/CyberIcons";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { LinkCard } from "@/components/ui/LinkCard";
import { getNicknameWithoutTag } from "@/features/auction/utils/display";
import { useOverlayDismiss } from "@/components/ui/useOverlayDismiss";

interface OrganizerLinksPayload {
  captainLinks: Array<{
    teamId: string;
    teamName: string;
    leaderName: string;
    leaderToken: string;
  }>;
}

export function LinksModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [links, setLinks] = useState<OrganizerLinksPayload | null>(null);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [linksError, setLinksError] = useState<string | null>(null);

  const roomId = useAuctionStore((state) => state.roomId);
  const organizerToken = useAuctionStore((state) => state.organizerToken);
  const overlayDismiss = useOverlayDismiss<HTMLDivElement>(() =>
    setIsOpen(false),
  );

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

  useEffect(() => {
    if (!isOpen || !roomId) return;

    let cancelled = false;
    const loadLinks = async () => {
      setIsLoadingLinks(true);
      setLinksError(null);

      try {
        const response = await fetch(
          `/api/room-links?roomId=${encodeURIComponent(roomId)}&organizerToken=${encodeURIComponent(organizerToken ?? "")}`,
          {
          method: "GET",
          cache: "no-store",
          },
        );
        const payload = (await response.json()) as
          | OrganizerLinksPayload
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "링크 정보를 불러오지 못했습니다.",
          );
        }

        if (!cancelled) {
          setLinks(payload as OrganizerLinksPayload);
        }
      } catch (err) {
        if (!cancelled) {
          setLinks(null);
          setLinksError(err instanceof Error ? err.message : "링크 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLinks(false);
        }
      }
    };

    void loadLinks();
    return () => {
      cancelled = true;
    };
  }, [isOpen, roomId]);

  if (!roomId) return null;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const organizerLink = organizerToken
    ? `${baseUrl}/room/${roomId}?role=ORGANIZER&token=${encodeURIComponent(organizerToken)}`
    : `${baseUrl}/room/${roomId}?role=ORGANIZER`;
  const viewerLink = `${baseUrl}/room/${roomId}?role=VIEWER`;

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onMouseDown={overlayDismiss.onMouseDown}
      onMouseUp={overlayDismiss.onMouseUp}
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
          {isLoadingLinks && (
            <div className="rounded border-2 border-black bg-white px-3 py-4 text-fluid-xs font-heading text-gray-600">
              링크 정보를 불러오는 중입니다...
            </div>
          )}

          {linksError && (
            <div className="rounded border-2 border-black bg-red-50 px-3 py-4 text-fluid-xs font-heading text-red-700">
              {linksError}
            </div>
          )}

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

          <div className="pt-2">
            <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter mb-2 flex items-center gap-1.5">
              <PixelIcon icon={PIXEL_ICONS.SUCCESS} size={14} color="text-minion-blue" />
              팀장 링크
            </div>
            <div className="space-y-1">
              {[...(links?.captainLinks ?? [])]
                .sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { numeric: true }))
                .map((team, i: number) => {
                  const link = `${baseUrl}/room/${roomId}?role=LEADER&teamId=${team.teamId}&token=${encodeURIComponent(team.leaderToken)}`;
                  return (
                    <LinkCard
                      key={team.teamId} label={team.teamName}
                      desc={`팀장: ${team.leaderName ? getNicknameWithoutTag(team.leaderName) : "(미설정)"}`}
                      link={link} linkKey={`captain-${i}`} variant="compact"
                      copied={copied} onCopy={copyToClipboard}
                    />
                  );
                })}
            </div>
          </div>

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

      {isOpen && typeof document !== "undefined" && createPortal(modalContent, document.body)}
    </>
  );
}
