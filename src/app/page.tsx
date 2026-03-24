"use client";

import { CreateRoomModal } from "@/components/CreateRoomModal";
import { ArchiveModalWrapper } from "@/components/ArchiveModalWrapper";
import Image from "next/image";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";

const HOW_TO_USE = [
  {
    step: "01",
    icon: PIXEL_ICONS.CREATE,
    title: "경매방 만들기",
    desc: "팀 수, 인원, 포인트를 설정하고 팀장과 선수를 등록해 방을 생성합니다.",
    color: "text-minion-blue",
  },
  {
    step: "02",
    icon: PIXEL_ICONS.LINKS,
    title: "링크 공유",
    desc: "생성된 팀장별 링크를 각 팀장에게 공유합니다. 관전자 링크도 배포 가능합니다.",
    color: "text-minion-blue",
  },
  {
    step: "03",
    icon: PIXEL_ICONS.SUCCESS,
    title: "접속 확인",
    desc: "경매 화면에서 팀장들의 실시간 접속 여부를 확인하고 경매를 시작하세요.",
    color: "text-green-600",
  },
  {
    step: "04",
    icon: PIXEL_ICONS.LEADING,
    title: "경매 진행",
    desc: "주최자가 선수를 추첨하면 각 팀장이 포인트로 입찰합니다. 최고 입찰 시 낙찰!",
    color: "text-minion-yellow",
  },
  {
    step: "05",
    icon: PIXEL_ICONS.FINISH,
    title: "팀 확정",
    desc: "모든 선수가 낙찰되면 최종 팀 구성과 사용 포인트가 확정됩니다.",
    color: "text-minion-blue",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen relative crt-overlay">
      <div className="relative z-10 flex flex-col items-center px-4 py-20 gap-20">
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

        {/* How to Use Section */}
        <div className="max-w-6xl w-full space-y-10">
          <h2 className="text-3xl font-black text-center text-minion-blue uppercase tracking-tighter animate-slide-up delay-100">
            [ Main Quest: How to Play ]
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {HOW_TO_USE.map((item, index) => (
              <div
                key={item.step}
                className={`bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all animate-slide-up`}
                style={{ animationDelay: `${(index + 2) * 100}ms` }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="shrink-0">
                    <PixelIcon icon={item.icon} size={32} color={item.color} />
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
        <div className="flex flex-col items-center gap-4 opacity-40 animate-pulse">
          <div className="flex gap-4">
            <Image src="/favicon.png" alt="pixel" width={24} height={24} className="pixelated grayscale" />
            <Image src="/favicon.png" alt="pixel" width={24} height={24} className="pixelated grayscale" />
            <Image src="/favicon.png" alt="pixel" width={24} height={24} className="pixelated grayscale" />
          </div>
          <p className="text-fluid-xs font-heading">Powered by Minions Bid Engine</p>
        </div>
      </div>
    </div>
  );
}
