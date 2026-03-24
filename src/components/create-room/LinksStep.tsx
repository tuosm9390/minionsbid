"use client";

import { GeneratedLinks } from "@/features/auction/hooks/useCreateRoom";
import { LinkCard } from "../ui/LinkCard";

interface LinksStepProps {
  links: GeneratedLinks;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

export function LinksStep({ links, copied, onCopy }: LinksStepProps) {
  return (
    <div className="space-y-4">
      <div className="border-4 border-green-600 bg-green-50 p-5 text-center shadow-[4px_4px_0px_0px_rgba(22,163,74,1)] mb-6">
        <div className="font-black text-green-700 text-xl font-heading uppercase tracking-tighter">ROOM CREATED!</div>
      </div>

      <div>
        <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter flex items-center gap-2 mb-3">👑 주최자 링크</div>
        <LinkCard
          label="👑 주최자 링크"
          desc="경매 진행 및 관리 전용"
          link={links.organizerLink}
          linkKey="organizer"
          copied={copied}
          onCopy={onCopy}
        />
      </div>

      <div>
        <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter flex items-center gap-2 mb-3">🛡️ 팀장 링크 (팀별 개별 공유)</div>
        <div className="space-y-2">
          {links.captainLinks.map((cl, i) => (
            <LinkCard
              key={i}
              label={cl.teamName}
              desc="팀장 전용 — 입찰 가능"
              link={cl.link}
              linkKey={`captain-${i}`}
              copied={copied}
              onCopy={onCopy}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-fluid-xs font-heading text-gray-500 uppercase tracking-tighter flex items-center gap-2 mb-3">🛡️ 관전자 링크</div>
        <LinkCard
          label="👀 관전자 링크"
          desc="관전 전용 — 입찰 불가, 자유롭게 공유 가능"
          link={links.viewerLink}
          linkKey="viewer"
          copied={copied}
          onCopy={onCopy}
        />
      </div>
    </div>
  );
}
