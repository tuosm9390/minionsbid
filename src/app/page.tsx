import { CreateRoomModal } from "@/components/CreateRoomModal";
import { ArchiveModalWrapper } from "@/components/ArchiveModalWrapper";
import Image from "next/image";

const HOW_TO_USE = [
  {
    step: "01",
    icon: "🍌",
    title: "경매방 만들기",
    desc: "팀 수, 인원, 포인트를 설정하고 팀장과 경매 선수를 등록해 방을 생성합니다.",
  },
  {
    step: "02",
    icon: "🔗",
    title: "링크 공유",
    desc: "생성된 팀장별 링크를 각 팀장에게 공유합니다. 관전자 링크도 자유롭게 배포할 수 있습니다.",
  },
  {
    step: "03",
    icon: "✅",
    title: "팀장 접속 확인",
    desc: "경매 화면에서 팀장들의 실시간 접속 여부를 확인합니다.",
  },
  {
    step: "04",
    icon: "🔥",
    title: "경매 시작",
    desc: "주최자가 선수를 하나씩 경매에 올리면 각 팀장이 포인트로 입찰합니다.",
  },
  {
    step: "05",
    icon: "🏆",
    title: "팀 확정",
    desc: "모든 선수가 낙찰되면 최종 팀 구성과 사용 포인트가 확정됩니다.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-blue-50 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-minion-yellow/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-4 py-16 gap-16">
        {/* Hero Card */}
        <div className="bg-card p-12 rounded-3xl shadow-xl border-4 border-minion-blue max-w-2xl w-full text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-5xl font-black text-minion-blue drop-shadow-sm uppercase tracking-tight flex items-center justify-center gap-2">
            <Image
              src="/favicon.png"
              alt="Minions Icon"
              width={48}
              height={48}
            />
            <div className="w-[350px]">
              <span className="text-minion-yellow block drop-shadow-sm">
                M I N I O N S
              </span>
              <span className="block drop-shadow-sm">auction</span>
            </div>
            <Image
              src="/favicon.png"
              alt="Minions Icon"
              width={48}
              height={48}
            />
          </h1>
          <p className="text-xl text-muted-foreground font-medium break-keep">
            미니언즈 공식 팀 드래프트 시스템 두둥!등장!
          </p>
          <div className="pt-4 w-full flex flex-col items-center">
            <CreateRoomModal />
            <ArchiveModalWrapper />
          </div>
        </div>

        {/* How to use */}
        <div className="max-w-4xl w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <h2 className="text-2xl font-black text-minion-blue text-center mb-8">
            이용 방법
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {HOW_TO_USE.map((item) => (
              <div
                key={item.step}
                className="bg-card rounded-2xl p-5 border-2 border-gray-100 hover:border-minion-yellow transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-black text-minion-blue bg-minion-yellow/30 px-2 py-0.5 rounded-full">
                    STEP {item.step}
                  </span>
                </div>
                <h3 className="font-black text-gray-800 mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div className="mt-6 bg-minion-blue/5 border border-minion-blue/20 rounded-2xl p-5">
            <p className="text-sm font-black text-minion-blue mb-2">
              💡 알아두면 좋은 점
            </p>
            <ul className="text-sm text-gray-600 space-y-1.5 list-none">
              <li>
                · 팀장 링크와 주최자 링크는{" "}
                <span className="font-bold">다른 주소</span>입니다. 링크를
                혼동하지 않도록 주의해주세요.
              </li>
              <li>
                · 경매 순서를 <span className="font-bold">주최자만 공개</span>로
                설정하면 팀장들이 다음 선수를 미리 알 수 없습니다.
              </li>
              <li>
                · 팀장 포인트는 팀 시작 포인트에서 차감됩니다 (팀 예산 = 총
                포인트 - 팀장 포인트).
              </li>
              <li>
                · 링크는{" "}
                <span className="font-bold">
                  방 페이지 상단 &ldquo;링크 확인&rdquo; 버튼
                </span>
                으로 언제든지 다시 확인할 수 있습니다.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
