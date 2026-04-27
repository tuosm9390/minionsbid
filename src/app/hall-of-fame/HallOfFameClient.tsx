"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HallOfFameCard } from "@/features/hall-of-fame/components/HallOfFameCard";
import { RegistrationModal } from "@/features/hall-of-fame/components/RegistrationModal";
import type { HallOfFameEntry } from "@/features/hall-of-fame/types";

interface HallOfFameClientProps {
  initialEntries: HallOfFameEntry[];
}

export function HallOfFameClient({ initialEntries }: HallOfFameClientProps) {
  const router = useRouter();
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  function handleSuccess() {
    router.refresh();
  }

  function handleDeleted() {
    router.refresh();
  }

  return (
    <div className="min-h-screen relative crt-overlay hof-page">
      <div className="relative z-10 flex flex-col items-center px-4 py-16 lg:py-20 gap-10">
        <div className="hof-archive-header animate-slide-up">
          <div className="hof-archive-header-top">
            <div className="hof-archive-eyebrow">Legendary Records</div>
            <div className="hof-archive-stamp">Archive Wing</div>
          </div>
          <h1 className="hof-archive-title">HALL OF FAME</h1>
          <p className="hof-archive-subtitle">
            미니언즈 리그 역대 우승팀이 보관된 공식 기록 전시 구역
          </p>
          <div className="hof-archive-rule" aria-hidden="true" />
          <div className="hof-archive-meta">
            <span>Champion Trophies</span>
            <span>Season Records</span>
            <span>Roster Archive</span>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <button
              onClick={() => setIsRegisterOpen(true)}
              className="pixel-button w-full sm:w-auto bg-minion-yellow py-4 px-10 text-lg font-heading shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-2 active:translate-y-2 transition-all uppercase"
            >
              우승팀 등록
            </button>
            <Link
              href="/"
              className="pixel-button w-full sm:w-auto bg-white text-minion-blue py-4 px-10 text-lg font-heading shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-2 active:translate-y-2 transition-all text-center uppercase"
            >
              ← 홈으로
            </Link>
          </div>
        </div>

        <div className="hof-archive-stage">
          {initialEntries.length === 0 ? (
            <div className="hof-empty-state animate-slide-up">
              <p className="font-heading text-2xl text-gray-400 mb-3">
                [ EMPTY ]
              </p>
              <p className="text-sm font-bold text-gray-500">
                아직 등록된 우승팀이 없습니다.
              </p>
              <p className="text-xs font-bold text-gray-400 mt-1">
                리그가 끝나면 우승팀을 등록해보세요!
              </p>
            </div>
          ) : (
            <div className="hof-gallery-grid">
              {initialEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="hof-gallery-item animate-slide-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <HallOfFameCard entry={entry} onDeleted={handleDeleted} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 opacity-30 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-3 h-3 bg-black" />
          ))}
        </div>
      </div>

      {isRegisterOpen && (
        <RegistrationModal
          onClose={() => setIsRegisterOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
