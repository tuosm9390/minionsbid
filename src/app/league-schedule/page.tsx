import Link from "next/link";
import type { Metadata } from "next";
import { LeagueScheduleManager } from "@/components/LeagueScheduleManager";

export const metadata: Metadata = {
  title: "리그전 일정 | Minions Bid",
  description: "미니언즈 리그전 일정 생성 및 경기 관리",
};

export default function LeagueSchedulePage() {
  return (
    <div className="min-h-screen relative crt-overlay">
      <div className="relative z-10 flex flex-col items-center px-4 py-20 gap-12">
        <div className="bg-white p-10 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-4xl w-full text-center space-y-6 animate-slide-up">
          <div className="inline-block px-4 py-1 bg-black text-white text-sm font-bold tracking-widest uppercase animate-pulse">
            Strategy Control
          </div>
          <h1 className="text-3xl lg:text-5xl font-heading text-minion-blue">
            LEAGUE SCHEDULE
          </h1>
          <p className="text-base font-bold border-y-2 border-black py-3 border-dashed text-gray-600">
            리그전 일정 생성, 경기 결과 등록, 우승팀 확정까지 관리합니다.
          </p>
          <div className="flex justify-center">
            <Link
              href="/"
              className="pixel-button w-full sm:w-auto bg-white text-minion-blue py-4 px-10 text-lg font-heading shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-2 active:translate-y-2 transition-all text-center uppercase"
            >
              ← 홈으로
            </Link>
          </div>
        </div>

        <div className="max-w-6xl w-full animate-slide-up delay-100">
          <LeagueScheduleManager />
        </div>
      </div>
    </div>
  );
}
