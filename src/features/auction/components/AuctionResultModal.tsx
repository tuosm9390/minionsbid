"use client";

import { useMemo, memo } from "react";
import { createPortal } from "react-dom";
import {
  useAuctionStore,
  Team,
  Player,
} from "@/features/auction/store/useAuctionStore";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { ThreeDIcon } from "@/components/ui/ThreeDIcon";
import { PIXEL_ICONS } from "../constants/icons";
import {
  buildRosterWithCaptain,
  getAuctionSlotsPerTeam,
  type CaptainMode,
} from "@/features/auction/utils/roster";
import { bucketAuctionPlayers } from "@/features/auction/store/auctionSelectors";

// 개별 팀 카드를 별도 컴포넌트로 분리하여 메모이제이션
const TeamResultCard = memo(
  ({
    team,
    soldPlayers,
    rosterSlots,
    captainMode,
  }: {
    team: Team;
    soldPlayers: Player[];
    rosterSlots: number;
    captainMode: CaptainMode;
  }) => {
    const teamPlayers = useMemo(
      () =>
        buildRosterWithCaptain(soldPlayers.map((p) => ({ ...p, sold_price: p.sold_price })), {
          captainMode,
          leaderName: team.leader_name,
          leaderPosition: team.leader_position,
        }),
      [captainMode, soldPlayers, team.leader_name, team.leader_position],
    );

    const slots = useMemo(
      () =>
        Array.from({ length: rosterSlots }, (_, i) => teamPlayers[i] ?? null),
      [teamPlayers, rosterSlots],
    );

    return (
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col group hover:-translate-y-1 transition-transform duration-200">
        {/* Team Profile Section */}
        <div className="p-5 border-b-4 border-black bg-gray-100/50">
          <div className="flex justify-between items-start mb-4">
            <div className="space-y-1">
              <span className="text-fluid-xs font-heading text-minion-blue uppercase block">
                팀명
              </span>
              <h3 className="text-fluid-sm font-black text-black leading-none">
                {team.name}
              </h3>
            </div>
            <div className="w-20 shrink-0 bg-black text-minion-yellow px-2 py-1 text-center pixel-box border-2 shadow-none text-fluid-xs font-heading leading-none tabular-nums">
              {team.point_balance}P
            </div>
          </div>

          <div className="bg-white border-2 border-black p-3 relative overflow-hidden group-hover:border-minion-blue transition-colors duration-200">
            <span className="absolute -right-4 -top-2 text-4xl opacity-[0.05] font-black italic">
              팀장
            </span>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 border-2 border-black flex items-center justify-center shrink-0">
                <PixelIcon icon={PIXEL_ICONS.MEDAL} size={20} color="text-minion-blue" />
              </div>
              <div>
                <p className="text-fluid-xs font-heading text-gray-400 uppercase">
                  팀장
                </p>
                <p className="text-fluid-xs font-black text-black leading-none">
                  {team.leader_name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 p-4 space-y-2 bg-white font-body">
          <p className="text-fluid-xs font-heading text-gray-400 uppercase mb-2 tracking-tighter">
            영입된 멤버
          </p>
          {slots.map((player, idx) => (
            (() => {
              const isCaptainSlot =
                captainMode === "IN_ROSTER" &&
                player?.sold_price == null &&
                player?.name === team.leader_name;

              return (
                <div
                  key={player?.id ?? `empty-${team.id}-${idx}`}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-2 border-2 border-black transition-colors duration-150 ${
                    player
                      ? "bg-gray-50 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:bg-yellow-50"
                      : "bg-gray-100 border-dashed opacity-40 shadow-none"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 ${player ? "bg-green-500" : "bg-gray-300"}`}
                    />
                    <span
                      className={`truncate text-fluid-xs font-black ${player ? "text-gray-800" : "text-gray-400"}`}
                    >
                      {player ? player.name : "빈 자리"}
                    </span>
                  </div>
                  {isCaptainSlot ? (
                    <span className="w-16 shrink-0 text-center text-fluid-xs font-black text-minion-blue bg-blue-50 px-1.5 py-0.5 border border-black">
                      팀장
                    </span>
                  ) : player?.sold_price != null ? (
                    <span className="w-16 shrink-0 text-center text-fluid-xs font-black text-minion-red bg-white px-1.5 py-0.5 border border-black tabular-nums">
                      {player.sold_price}P
                    </span>
                  ) : null}
                </div>
              );
            })()
          ))}
        </div>
      </div>
    );
  },
);

TeamResultCard.displayName = "TeamResultCard";

export function AuctionResultModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const teams = useAuctionStore((state) => state.teams);
  const players = useAuctionStore((state) => state.players);
  const membersPerTeam = useAuctionStore((state) => state.membersPerTeam);
  const captainMode = useAuctionStore((state) => state.captainMode);
  const { soldPlayersByTeam } = useMemo(() => bucketAuctionPlayers(players), [players]);

  // 팀 정렬 결과 메모이제이션
  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) =>
        a.name.localeCompare(b.name, "ko-KR", { numeric: true }),
      ),
    [teams],
  );

  // 로스터 슬롯 계산 메모이제이션
  const rosterSlots = useMemo(
    () => Math.max(membersPerTeam ?? 5, getAuctionSlotsPerTeam(membersPerTeam ?? 5, captainMode)),
    [captainMode, membersPerTeam],
  );

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-black shadow-[12px_12px_0px_rgba(0,0,0,1)] w-full max-w-6xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-200 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Gold Effect */}
        <div className="px-6 py-6 border-b-4 border-black flex items-center justify-between shrink-0 bg-black text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent animate-shimmer pointer-events-none" />

          <div className="flex items-center gap-4 z-10">
            <div className="w-12 h-12 bg-minion-yellow pixel-box border-2 shadow-none flex items-center justify-center">
              <ThreeDIcon name="trophy" alt="최종 팀 구성" size={40} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-fluid-lg font-heading text-minion-yellow leading-none mb-1">
                최종 팀 구성
              </h2>
              <p className="text-fluid-xs font-bold text-gray-400 uppercase tracking-widest">
                모든 플레이어의 배정이 완료되었습니다
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-minion-red text-white p-2 pixel-box border-2 shadow-none hover:bg-minion-red-hover transition-colors z-10"
          >
            <PixelIcon icon={PIXEL_ICONS.CLOSE} size={20} color="text-black" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 bg-gray-50/50 custom-scrollbar">
          {sortedTeams.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300 font-heading gap-4 border-4 border-dashed border-gray-200">
              <span className="text-6xl">❓</span>
              <p className="text-fluid-xs">팀 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {sortedTeams.map((team) => (
                <TeamResultCard
                  key={team.id}
                  team={team}
                  soldPlayers={soldPlayersByTeam.get(team.id) ?? []}
                  rosterSlots={rosterSlots}
                  captainMode={captainMode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer with a large button */}
        <div className="px-10 py-6 border-t-4 border-black bg-white shrink-0">
          <button
            onClick={onClose}
            className="pixel-button w-full py-4 bg-black text-white text-fluid-xs font-heading hover:bg-minion-blue transition-colors shadow-[8px_8px_0px_rgba(0,0,0,0.2)]"
          >
            결과 확인 완료
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
