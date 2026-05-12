"use client";

import { useState } from "react";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { ArchiveModalWrapper } from "@/components/ArchiveModalWrapper";
import { UpdateTicker } from "@/components/UpdateTicker";
import { LegalInfoModal } from "@/components/LegalInfoModal";
import Image from "next/image";
import Link from "next/link";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { ThreeDIcon } from "@/components/ui/ThreeDIcon";
import { HOW_TO_USE_STEPS } from "@/features/auction/constants/howToUse";

export default function Home() {
  const [legalDocument, setLegalDocument] = useState<
    "terms" | "privacy" | null
  >(null);

  return (
    <div className="min-h-screen relative crt-overlay">
      <div className="relative z-10 flex flex-col items-center px-4 py-20 gap-20">
        <UpdateTicker />

        {/* Hero Section */}
        <div className="bg-white p-10 lg:p-14 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-3xl w-full text-center space-y-10 animate-slide-up">
          <div className="inline-block px-4 py-1 bg-black text-white text-sm font-bold tracking-widest uppercase mb-4 animate-pulse">
            Level 1: System Start
          </div>
          <h1 className="text-4xl lg:text-6xl font-heading flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon.png"
                alt="Icon"
                width={48}
                height={48}
                className="pixelated shrink-0 animate-minion-bounce w-auto h-auto"
                priority
              />
              <div className="w-[300px] sm:w-[450px] aspect-[3/1] relative flex items-center justify-center overflow-hidden">
                <Image
                  src="/thumbnail.png"
                  alt="MINIONS AUCTION"
                  fill
                  priority
                  sizes="(max-width: 768px) 300px, 450px"
                  className="pixelated object-contain scale-[1.8] hover:scale-[2.0] transition-transform duration-500"
                />
              </div>
              <Image
                src="/favicon.png"
                alt="Icon"
                width={48}
                height={48}
                className="pixelated shrink-0 animate-minion-bounce w-auto h-auto"
                priority
              />
            </div>
          </h1>
          <p className="text-xl font-bold border-y-2 border-black py-4 border-dashed">
            미니언즈 공식 팀 드래프트 시스템 v1.0
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
            <CreateRoomModal />
            <ArchiveModalWrapper />
          </div>
        </div>

        <div className="max-w-5xl w-full space-y-8 animate-slide-up delay-100">
          <div className="text-center space-y-3">
            <p className="inline-block border-2 border-black bg-black px-4 py-1 text-xs font-black tracking-[0.24em] text-minion-yellow uppercase">
              World Select
            </p>
            <h2 className="text-3xl font-black text-minion-blue uppercase tracking-tight">
              Command Portals
            </h2>
            <p className="text-sm font-bold text-gray-600">
              경매 로비에서 모드를 선택해 기록 보관소나 리그 관제실로
              이동하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/hall-of-fame"
              className="group bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 border-2 border-black bg-minion-yellow px-3 py-1 text-xs font-black uppercase tracking-[0.18em]">
                    Hall Portal
                  </div>
                  <div>
                    <h3 className="text-2xl font-heading text-minion-blue">
                      명예의 전당
                    </h3>
                    <p className="mt-3 text-sm font-bold text-gray-600 leading-relaxed">
                      역대 우승팀 기록을 확인하고 관리하는 전용 공간입니다.
                    </p>
                  </div>
                </div>
                <div className="border-4 border-background p-4 text-minion-yellow">
                  <ThreeDIcon name="hallOfFame" alt="명예의 전당" size={44} />
                </div>
              </div>
            </Link>

            <Link
              href="/league-schedule"
              className="group bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 border-2 border-black bg-minion-blue px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                    Strategy Room
                  </div>
                  <div>
                    <h3 className="text-2xl font-heading text-minion-blue">
                      리그전 일정 관리
                    </h3>
                    <p className="mt-3 text-sm font-bold text-gray-600 leading-relaxed">
                      일정 생성, 대진 배치, 결과 등록, 우승팀 확정까지 한 곳에서
                      처리합니다.
                    </p>
                  </div>
                </div>
                <div className="border-4 border-background p-4 text-minion-yellow">
                  <ThreeDIcon
                    name="calendar"
                    alt="리그전 일정 관리"
                    size={44}
                  />
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* How to Use Section */}
        <div className="max-w-6xl w-full space-y-10">
          <h2 className="text-3xl font-black text-center text-minion-blue uppercase tracking-tighter animate-slide-up delay-100">
            [ Main Quest: How to Play ]
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {HOW_TO_USE_STEPS.map((item, index) => (
              <div
                key={item.step}
                className={`bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all animate-slide-up`}
                style={{ animationDelay: `${(index + 2) * 100}ms` }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="shrink-0">
                    <ThreeDIcon
                      name={item.iconName}
                      alt={item.iconAlt}
                      size={44}
                    />
                  </div>
                  <span className="bg-minion-yellow border-2 border-black px-2 py-0.5 text-fluid-xs font-bold">
                    STAGE {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-black mb-2">{item.title}</h3>
                <p className="text-xs text-gray-600 font-bold leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative Pixel Footer */}
        <div className="flex flex-col items-center gap-4 opacity-60">
          <div className="flex gap-4">
            <Image
              src="/favicon.png"
              alt="pixel"
              width={24}
              height={24}
              className="pixelated grayscale"
            />
            <Image
              src="/favicon.png"
              alt="pixel"
              width={24}
              height={24}
              className="pixelated grayscale"
            />
            <Image
              src="/favicon.png"
              alt="pixel"
              width={24}
              height={24}
              className="pixelated grayscale"
            />
          </div>
          <p className="text-fluid-xs font-heading">
            Powered by Minions Bid Engine
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-black">
            <button
              type="button"
              onClick={() => setLegalDocument("terms")}
              className="border-2 border-black bg-white/90 px-3 py-2 text-black hover:bg-minion-yellow transition-colors"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => setLegalDocument("privacy")}
              className="border-2 border-black bg-white/90 px-3 py-2 text-black hover:bg-minion-yellow transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </div>

      <LegalInfoModal
        isOpen={legalDocument !== null}
        documentType={legalDocument ?? "terms"}
        onClose={() => setLegalDocument(null)}
      />
    </div>
  );
}
