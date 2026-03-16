import { CreateRoomModal } from "@/components/CreateRoomModal";
import { ArchiveModalWrapper } from "@/components/ArchiveModalWrapper";
import Image from "next/image";

export const metadata = {
  title: "Minions Bid 🍌 - 실시간 드래프트 시작하기",
  description:
    "미니언즈 경매 시스템으로 공정한 팀 구성과 실시간 드래프트를 경험하세요.  bananas included! 🍌",
};

const HOW_TO_USE = [
  {
    step: "01",
    icon: "🍌",
    title: "경매방 만들기",
    desc: "팀 수, 인원, 포인트를 설정하고 팀장과 선수를 등록하세요.",
  },
  {
    step: "02",
    icon: "🔗",
    title: "링크 공유",
    desc: "팀장 전용 링크를 복사하여 각 팀장에게 전달하세요.",
  },
  {
    step: "03",
    icon: "✅",
    title: "접속 확인",
    desc: "팀장들이 입장하면 실시간으로 상태가 표시됩니다.",
  },
  {
    step: "04",
    icon: "🔥",
    title: "경매 시작",
    desc: "주최자가 뽑기를 돌려 선수를 올리고 경매를 진행합니다.",
  },
  {
    step: "05",
    icon: "🏆",
    title: "팀 확정",
    desc: "최종 팀 구성을 확인하고 경기를 준비하세요!",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen relative crt-overlay">
      <div className="relative z-10 flex flex-col items-center px-4 py-20 gap-20">
        <div className="bg-white p-10 lg:p-14 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-3xl w-full text-center space-y-10">
          <div className="inline-block px-4 py-1 bg-black text-white text-sm font-bold tracking-widest uppercase mb-4">
            Level 1: System Start
          </div>
          <h1 className="text-4xl lg:text-6xl font-heading flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/favicon.png"
                alt="Icon"
                width={48}
                height={48}
                className="pixelated shrink-0 animate-minion-bounce"
              />
              <div className="w-[300px] sm:w-[450px] aspect-[3/1] relative flex items-center justify-center overflow-hidden">
                <Image
                  src="/thumbnail.png"
                  alt="MINIONS AUCTION"
                  fill
                  priority
                  className="pixelated object-contain scale-[1.8]"
                />
              </div>
              <Image
                src="/favicon.png"
                alt="Icon"
                width={48}
                height={48}
                className="pixelated shrink-0 animate-minion-bounce"
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

        <div className="max-w-6xl w-full space-y-10">
          <h2 className="text-3xl font-black text-center text-minion-blue uppercase tracking-tighter">
            [ Main Quest: How to Play ]
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {HOW_TO_USE.map((item) => (
              <div
                key={item.step}
                className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-3xl">{item.icon}</span>
                  <span className="bg-minion-yellow border-2 border-black px-2 py-0.5 text-[10px] font-bold">
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

        <div className="max-w-3xl w-full bg-black text-white border-4 border-minion-yellow p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]">
          <h3 className="text-xl font-bold text-minion-yellow mb-4 flex items-center gap-2">
            <span className="animate-pulse">●</span> 알아두면 좋은 팁
          </h3>
          <ul className="text-sm space-y-3 font-bold text-gray-300">
            <li className="flex gap-2">
              <span>-</span>{" "}
              <span>팀장 링크와 주최자 링크는 별개의 고유 주소입니다.</span>
            </li>
            <li className="flex gap-2">
              <span>-</span>{" "}
              <span>
                모든 입찰은 실시간으로 동기화되며 취소가 불가능합니다.
              </span>
            </li>
            <li className="flex gap-2">
              <span>-</span>{" "}
              <span>
                방 페이지 상단의 [LINK] 버튼으로 언제든 주소를 재확인하세요.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <footer className="py-10 text-center text-xs font-bold text-gray-500">
        Copyright © {new Date().getFullYear()} MINIONS(소모임). All rights
        reserved.
      </footer>
    </div>
  );
}
