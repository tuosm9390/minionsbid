"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAuctionStore,
  Role,
  PresenceUser,
} from "@/features/auction/store/useAuctionStore";
import { useAuctionRealtime } from "@/features/auction/hooks/useAuctionRealtime";
import { useRoomAuth } from "@/features/auction/hooks/useRoomAuth";
import { useAuctionControl } from "@/features/auction/hooks/useAuctionControl";
import { supabase } from "@/lib/supabase";
import {
  startAuction,
  deleteRoom,
  drawNextPlayer,
  saveAuctionArchive,
  pauseAuction,
} from "@/features/auction/api/auctionActions";
import { AuctionBoard } from "@/features/auction/components/AuctionBoard";
import { TeamList, UnsoldPanel } from "@/features/auction/components/TeamList";
import { ChatPanel } from "@/features/auction/components/ChatPanel";
import { BiddingControl } from "@/features/auction/components/BiddingControl";
import { LinksModal } from "@/features/auction/components/LinksModal";
import { HowToUseModal } from "@/features/auction/components/HowToUseModal";
import { EndRoomModal } from "@/features/auction/components/EndRoomModal";
import { AuctionResultModal } from "@/features/auction/components/AuctionResultModal";

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const iv = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      setElapsed(
        `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [createdAt]);
  return (
    <div className="text-xs font-mono font-black text-blue-200 bg-blue-900/30 px-4 py-1.5 rounded-full border-2 border-blue-700/50 shadow-inner tracking-widest">
      경과 시간 <b className="text-minion-yellow text-sm">{elapsed}</b>
    </div>
  );
}

interface RoomClientProps {
  roomId: string;
  roleParam: Role | null;
  teamIdParam: string | null;
  tokenParam: string | null;
}

export function RoomClient({
  roomId,
  roleParam,
  teamIdParam,
  tokenParam,
}: RoomClientProps) {
  useAuctionRealtime(roomId);
  const players = useAuctionStore((s) => s.players);
  const teams = useAuctionStore((s) => s.teams);
  const roomName = useAuctionStore((s) => s.roomName);
  const createdAt = useAuctionStore((s) => s.createdAt);
  const roomExists = useAuctionStore((s) => s.roomExists);
  const isRoomLoaded = useAuctionStore((s) => s.isRoomLoaded);
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt);
  const membersPerTeam = useAuctionStore((s) => s.membersPerTeam);
  const presences = useAuctionStore((s) => s.presences);
  const organizerToken = useAuctionStore((s) => s.organizerToken);
  const viewerToken = useAuctionStore((s) => s.viewerToken);
  const setRoomContext = useAuctionStore((s) => s.setRoomContext);
  const { effectiveRole, isTokenChecked } = useRoomAuth({
    role: roleParam,
    teamId: teamIdParam || undefined,
    tokenParam,
    isRoomLoaded,
    roomExists,
    storeOrganizerToken: organizerToken,
    storeViewerToken: viewerToken,
    teams,
    roomId,
    setRoomContext,
  });
  const connectedLeaderIds = new Set(
    presences
      .filter((p: PresenceUser) => p.role === "LEADER")
      .map((p: PresenceUser) => p.teamId),
  );
  const allConnected =
    teams.length > 0 && connectedLeaderIds.size >= teams.length;
  const currentPlayer = players.find((p) => p.status === "IN_AUCTION");
  const waitingPlayers = players.filter((p) => p.status === "WAITING");
  const soldPlayers = players.filter((p) => p.status === "SOLD");
  const unsoldPlayers = players.filter((p) => p.status === "UNSOLD");
  const isReAuctionRound =
    unsoldPlayers.length > 0 && waitingPlayers.length === 0;
  const biddableTeams = teams.filter(
    (t) =>
      players.filter((p) => p.team_id === t.id && p.status === "SOLD").length <
        membersPerTeam - 1 && t.point_balance >= 10,
  );
  const isAutoDraftMode =
    !currentPlayer &&
    waitingPlayers.length > 0 &&
    unsoldPlayers.length === 0 &&
    biddableTeams.length <= 1;
  const bids = useAuctionStore((s) => s.bids);
  const playerBids = bids.filter((b) => b.player_id === currentPlayer?.id);
  const highestBid =
    playerBids.length > 0 ? Math.max(...playerBids.map((b) => b.amount)) : 0;
  const minBid = highestBid > 0 ? highestBid + 10 : 10;
  const [isExpired, setIsExpired] = useState(false);
  useEffect(() => {
    if (!timerEndsAt) {
      setIsExpired(false);
      return;
    }
    const remain = new Date(timerEndsAt).getTime() - Date.now();
    if (remain <= 0) {
      setIsExpired(true);
      return;
    }
    setIsExpired(false);
    const t = setTimeout(() => setIsExpired(true), remain);
    return () => clearTimeout(t);
  }, [timerEndsAt]);
  const isAuctionActive = !!timerEndsAt && !isExpired;
  const myTeam = teams.find((t) => t.id === teamIdParam);
  let isTeamFull = false;
  if (myTeam)
    isTeamFull =
      players.filter((p) => p.team_id === myTeam.id && p.status === "SOLD")
        .length >=
      membersPerTeam - 1;
  const { lotteryPlayer, setLotteryPlayer, handleCloseLottery } =
    useAuctionControl({
      roomId,
      effectiveRole: effectiveRole ?? "VIEWER",
      players,
      timerEndsAt,
    });

  // Pause/resume auction on team leader disconnect/reconnect (ORGANIZER only)
  const prevAllConnectedRef = useRef<boolean | null>(null);
  const wasPausedByDisconnectRef = useRef(false);
  const timerEndsAtRef = useRef(timerEndsAt);
  const currentPlayerRef = useRef(currentPlayer);
  timerEndsAtRef.current = timerEndsAt;
  currentPlayerRef.current = currentPlayer;
  useEffect(() => {
    if (!roomId || effectiveRole !== "ORGANIZER") return;
    const prev = prevAllConnectedRef.current;
    prevAllConnectedRef.current = allConnected;
    if (prev === null) return;
    if (!allConnected && prev === true) {
      if (timerEndsAtRef.current) {
        wasPausedByDisconnectRef.current = true;
        pauseAuction(roomId);
      }
    }
    // allConnected 복귀 시 자동 재개하지 않음 — 방장이 수동으로 "▶ 경매 시작" 버튼을 눌러야 재개
  }, [allConnected, roomId, effectiveRole]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const router = useRouter();
  const [isEndRoomOpen, setIsEndRoomOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const handleNotice = async () => {
    if (!noticeText.trim() || !roomId || isSendingNotice) return;
    setIsSendingNotice(true);
    try {
      await supabase.from("messages").insert([
        {
          room_id: roomId,
          sender_name: "주최자",
          sender_role: "NOTICE",
          content: noticeText.trim(),
        },
      ]);
      setNoticeText("");
    } finally {
      setIsSendingNotice(false);
    }
  };
  const handleDraw = async () => {
    setIsDrawing(true);
    try {
      const res = await drawNextPlayer(roomId);
      if (res.error) alert(res.error);
    } finally {
      setIsDrawing(false);
    }
  };
  const handleStart = async () => {
    setIsStarting(true);
    try {
      setLotteryPlayer(null);
      const duration =
        isReAuctionRound || wasPausedByDisconnectRef.current ? 5000 : 10000;
      wasPausedByDisconnectRef.current = false;
      const res = await startAuction(roomId, duration);
      if (res.error) alert(res.error);
    } finally {
      setIsStarting(false);
    }
  };
  const isRoomComplete =
    teams.length > 0 &&
    teams.every(
      (t) =>
        players.filter((p) => p.team_id === t.id && p.status === "SOLD")
          .length ===
        membersPerTeam - 1,
    );
  const allDone =
    waitingPlayers.length === 0 &&
    !currentPlayer &&
    soldPlayers.length > 0 &&
    isRoomComplete;
  const handleEndRoom = async (saveResult: boolean) => {
    if (!roomId) return;
    setIsDeleting(true);
    try {
      if (saveResult && allDone) {
        await saveAuctionArchive({
          roomId,
          roomName: roomName ?? "경매방",
          roomCreatedAt: createdAt ?? new Date().toISOString(),
          teams: teams.map((t) => ({
            id: t.id,
            name: t.name,
            leader_name: t.leader_name,
            point_balance: t.point_balance,
            players: players
              .filter((p) => p.team_id === t.id)
              .map((p) => ({ name: p.name, sold_price: p.sold_price })),
          })),
        });
      }
      const result = await deleteRoom(roomId);
      if (!result.error) router.push("/");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isRoomLoaded)
    return (
      <div className="h-screen bg-blue-50 flex items-center justify-center font-black text-minion-blue text-2xl animate-pulse tracking-tighter uppercase">
        데이터 로딩 중...
      </div>
    );
  if (!roomExists)
    return (
      <div className="h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-red-100">
          <span className="text-5xl">🚫</span>
        </div>
        <h2 className="text-3xl font-black text-minion-blue mb-6">
          경매가 종료된 방이거나, 유효하지 않은 접근입니다.
        </h2>
        <button
          onClick={() => router.push("/")}
          className="bg-minion-yellow text-minion-blue font-black px-10 py-3 rounded-2xl shadow-lg text-lg uppercase"
        >
          홈으로 돌아가기
        </button>
      </div>
    );

  if (!isTokenChecked)
    return (
      <div className="h-screen bg-blue-50 flex items-center justify-center font-black text-minion-blue text-2xl animate-pulse tracking-tighter uppercase">
        Syncing Data...
      </div>
    );

  if (effectiveRole === null)
    return (
      <div className="h-screen bg-blue-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mb-6 border-4 border-red-100">
          <span className="text-5xl">🚫</span>
        </div>
        <h2 className="text-3xl font-black text-red-500 mb-3">
          유효하지 않은 접근
        </h2>
        <p className="text-base text-gray-500 font-bold mb-8 max-w-sm leading-relaxed">
          유효한 인증 정보가 없습니다.
          <br />
          초대 링크를 통해 다시 접속해 주세요.
        </p>
        <button
          onClick={() => router.push("/")}
          className="bg-minion-yellow text-minion-blue font-black px-10 py-3 rounded-2xl shadow-lg text-lg uppercase"
        >
          홈으로 돌아가기
        </button>
      </div>
    );

  return (
    <div className="h-screen max-h-screen flex flex-col bg-blue-50 text-foreground font-sans overflow-hidden tracking-tight">
      <header className="h-14 shrink-0 bg-minion-blue text-white px-8 flex justify-between items-center shadow-xl relative z-[110]">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-black text-minion-yellow tracking-tighter">
            MINIONS 🍌
          </h1>
          <div className="flex items-center gap-3">
            <span className="bg-white/20 px-4 py-1 rounded-full text-xs font-black border border-white/30 uppercase tracking-widest">
              {effectiveRole === "ORGANIZER"
                ? "👑 주최자"
                : effectiveRole === "LEADER"
                  ? "🛡️ 팀장"
                  : "👀 관전자"}
            </span>
            <div className="h-4 w-px bg-white/20 mx-1" />
            <div className="flex gap-2">
              {effectiveRole === "ORGANIZER" && <LinksModal />}
              <HowToUseModal variant="header" />
              {soldPlayers.length > 0 && (
                <button
                  onClick={() => setShowResultModal(true)}
                  className="bg-minion-yellow hover:bg-yellow-400 text-minion-blue px-4 py-1.5 rounded-xl text-xs font-black shadow-sm transition-all"
                >
                  📋 결과
                </button>
              )}
              {effectiveRole === "ORGANIZER" && (
                <button
                  onClick={() => setIsEndRoomOpen(true)}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-xl text-xs font-black shadow-sm"
                >
                  🚪 종료
                </button>
              )}
            </div>
          </div>
        </div>
        {createdAt && <ElapsedTimer createdAt={createdAt} />}
      </header>

      <main className="flex-1 flex flex-col xl:grid xl:grid-cols-12 gap-5 p-4 sm:p-6 lg:px-12 xl:px-24 overflow-y-auto xl:overflow-hidden min-h-0">
        <aside className="xl:col-span-3 flex flex-col min-h-0 order-3 xl:order-1 mt-6 xl:mt-0 h-[400px] xl:h-auto">
          <div className="bg-card rounded-[2.5rem] shadow-xl border-[3px] border-border flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="p-5 border-b-2 border-border bg-card shrink-0">
              <h2 className="text-lg font-black text-minion-blue flex items-center gap-2 uppercase tracking-tighter">
                👥 팀 현황
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pr-4 mr-1 min-h-0">
              <TeamList />
            </div>
          </div>
        </aside>

        <section className="xl:col-span-6 flex flex-col gap-5 min-h-0 order-1 xl:order-2">
          <AuctionBoard
            isLotteryActive={!!lotteryPlayer}
            lotteryPlayer={lotteryPlayer}
            waitingPlayers={waitingPlayers}
            role={effectiveRole}
            allConnected={allConnected}
            onCloseLottery={handleCloseLottery}
          />
          {effectiveRole === "ORGANIZER" && (
            <div className="bg-card rounded-[2.5rem] shadow-2xl border-[3px] border-border p-8 shrink-0 mt-auto">
              <div className="flex items-center justify-between mb-5 px-2">
                <h3 className="text-base font-black text-minion-blue uppercase tracking-widest flex items-center gap-3">
                  🎛️ 주최자 컨트롤 박스
                </h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-black text-gray-400 bg-gray-50 px-4 py-1.5 rounded-full border-2 border-gray-100 shadow-inner">
                    대기자: {waitingPlayers.length}명 / 낙찰자:{" "}
                    {soldPlayers.length}명
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mb-5 pb-5 border-b-2 border-gray-100">
                <input
                  type="text"
                  value={noticeText}
                  onChange={(e) => setNoticeText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNotice()}
                  placeholder="공지 내용 입력..."
                  className="flex-1 border-4 border-gray-50 rounded-2xl px-6 py-4 text-base font-bold focus:outline-none focus:border-minion-blue shadow-inner"
                  disabled={isSendingNotice}
                />
                <button
                  onClick={handleNotice}
                  disabled={!noticeText.trim() || isSendingNotice}
                  className="bg-minion-yellow text-minion-blue px-8 py-4 rounded-2xl text-base font-black shadow-lg"
                >
                  선포
                </button>
              </div>
              {allDone ? (
                <div className="text-center py-6 bg-green-50 rounded-3xl border-[3px] border-green-100">
                  <p className="font-black text-green-600 text-2xl tracking-tighter">
                    🏆 경매 완료!
                  </p>
                </div>
              ) : !currentPlayer ? (
                isAutoDraftMode ? (
                  <div className="bg-indigo-50 border-4 border-indigo-100 text-indigo-800 py-6 rounded-3xl font-black text-center text-xl animate-pulse">
                    ⚡ 자동 드래프트 진행 중
                  </div>
                ) : (
                  <button
                    onClick={handleDraw}
                    disabled={
                      isDrawing || waitingPlayers.length === 0 || !allConnected
                    }
                    className="w-full bg-minion-blue hover:bg-minion-blue-hover text-white h-20 rounded-3xl font-black text-2xl shadow-[0_8px_0_#1a3d73]"
                  >
                    🎲 다음 선수 추첨 (남은 인원 : {waitingPlayers.length}명)
                  </button>
                )
              ) : !timerEndsAt && !lotteryPlayer ? (
                <button
                  onClick={handleStart}
                  disabled={isStarting || !allConnected}
                  className="w-full bg-lime-500 hover:bg-lime-600 text-white h-20 rounded-3xl font-black text-3xl shadow-[0_8px_0_#4d7c0f]"
                >
                  ▶ 경매 시작
                </button>
              ) : !timerEndsAt ? (
                <div className="bg-minion-blue/10 border-[6px] border-minion-blue/20 text-minion-blue py-6 rounded-[2rem] font-black text-center text-2xl animate-pulse uppercase tracking-widest">
                  🎰 추첨 진행 중
                </div>
              ) : (
                <div className="bg-minion-yellow/10 border-[6px] border-minion-yellow/20 text-minion-blue py-6 rounded-[2rem] font-black text-center text-2xl animate-pulse uppercase tracking-widest">
                  🔥 경매 진행 중 🔥
                </div>
              )}
            </div>
          )}
          {effectiveRole === "LEADER" && roomId && teamIdParam && (
            <BiddingControl
              roomId={roomId}
              teamId={teamIdParam}
              currentPlayer={currentPlayer || null}
              myTeam={myTeam || null}
              isAuctionActive={isAuctionActive}
              timerEndsAt={timerEndsAt}
              minBid={minBid}
              isTeamFull={isTeamFull}
            />
          )}
        </section>

        <aside className="xl:col-span-3 flex flex-col gap-5 min-h-0 order-2 xl:order-3 mt-6 xl:mt-0 h-[500px] xl:h-auto">
          <div className="bg-card rounded-[2.5rem] shadow-xl border-[3px] border-border flex-none max-h-[160px] flex flex-col overflow-hidden min-h-0 relative">
            <div className="p-3 border-b-2 border-border bg-card shrink-0">
              <h2 className="text-sm font-black text-red-500 flex items-center gap-2 uppercase px-1">
                👻 유찰 대기석
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pr-3 mr-1 min-h-0">
              <UnsoldPanel />
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-card rounded-[2.5rem] shadow-xl border-[3px] border-border relative">
            <div className="flex-1 flex flex-col min-h-0 mr-1 overflow-hidden">
              <ChatPanel />
            </div>
          </div>
        </aside>
      </main>

      <EndRoomModal
        isOpen={isEndRoomOpen}
        isCompleted={allDone}
        isDeleting={isDeleting}
        onClose={() => setIsEndRoomOpen(false)}
        onConfirm={handleEndRoom}
      />
      <AuctionResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
      />
    </div>
  );
}
