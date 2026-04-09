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
    <div className="min-h-screen relative crt-overlay">
      <div className="relative z-10 flex flex-col items-center px-4 py-20 gap-12">
        {/* 헤더 */}
        <div className="bg-white p-10 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-3xl w-full text-center space-y-6 animate-slide-up">
          <div className="inline-block px-4 py-1 bg-black text-white text-sm font-bold tracking-widest uppercase animate-pulse">
            Legendary Records
          </div>
          <h1 className="text-3xl lg:text-5xl font-heading text-minion-blue">
            HALL OF FAME
          </h1>
          <p className="text-base font-bold border-y-2 border-black py-3 border-dashed text-gray-600">
            미니언즈 리그 역대 우승팀 명예의 전당
          </p>
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

        {/* 목록 */}
        <div className="max-w-3xl w-full">
          {initialEntries.length === 0 ? (
            <div className="bg-white border-4 border-black p-12 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-slide-up">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {initialEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <HallOfFameCard entry={entry} onDeleted={handleDeleted} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 픽셀 장식 */}
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
