"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuctionStore } from "@/features/auction/store/useAuctionStore";
import { useFirebaseRealtime } from "@/features/auction/hooks/useAuctionRealtime";
import { useFirebasePresence } from "@/features/auction/hooks/usePresence";
import { useRoomAuth } from "@/features/auction/hooks/useRoomAuth";
import { useAuctionControl } from "@/features/auction/hooks/useAuctionControl";
import {
  startAuction,
  deleteRoom,
  drawNextPlayer,
  saveAuctionArchive,
  sendNotice,
} from "@/features/auction/api/auctionActions";
import { AuctionBoard } from "@/features/auction/components/AuctionBoard";
import { TeamList, UnsoldPanel } from "@/features/auction/components/TeamList";
import { ChatPanel } from "@/features/auction/components/ChatPanel";
import { BiddingControl } from "@/features/auction/components/BiddingControl";
import { HowToUseModal } from "@/features/auction/components/HowToUseModal";
import { EndRoomModal } from "@/features/auction/components/EndRoomModal";
import { AuctionResultModal } from "@/features/auction/components/AuctionResultModal";
import { LeaveRoomModal } from "@/features/auction/components/LeaveRoomModal";
import { RoomHeader } from "./components/RoomHeader";
import { OrganizerControlPanel } from "./components/OrganizerControlPanel";

export function RoomClient({ roomId, roleParam, teamIdParam }: any) {
  useFirebaseRealtime(roomId);
  const players = useAuctionStore((s) => s.players);
  const teams = useAuctionStore((s) => s.teams);
  const roomName = useAuctionStore((s) => s.roomName);
  const createdAt = useAuctionStore((s) => s.createdAt);
  const roomExists = useAuctionStore((s) => s.roomExists);
  const isRoomLoaded = useAuctionStore((s) => s.isRoomLoaded);
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt);
  const membersPerTeam = useAuctionStore((s) => s.membersPerTeam);
  const presences = useAuctionStore((s) => s.presences);
  const storeTeamId = useAuctionStore((s) => s.teamId);
  const isReAuctionRound = useAuctionStore((s) => s.isReAuctionRound);
  const setRoomContext = useAuctionStore((s) => s.setRoomContext);
  const setRealtimeData = useAuctionStore((s) => s.setRealtimeData);

  const [isLeaveRoomOpen, setIsLeaveRoomOpen] = useState(false);
  const [isEndRoomOpen, setIsEndRoomOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const router = useRouter();

  const { effectiveRole } = useRoomAuth({
    role: roleParam,
    teamId: teamIdParam || undefined,
    roomId,
    setRoomContext,
  });

  // Firebase RTDB Presence (팀장/주최자 접속 현황)
  const myTeamForPresence = teams.find((t) => t.id === storeTeamId);
  useFirebasePresence({
    roomId,
    teamId: storeTeamId,
    role: effectiveRole,
    teamName: myTeamForPresence?.name,
  });

  const connectedLeaderIds = new Set(
    presences.filter((p: any) => p.role === "LEADER").map((p: any) => p.teamId),
  );
  const allConnected =
    teams.length > 0 && connectedLeaderIds.size >= teams.length;
  const currentPlayer = players.find((p) => p.status === "IN_AUCTION");
  const waitingPlayers = players.filter((p) => p.status === "WAITING");
  const soldPlayers = players.filter((p) => p.status === "SOLD");
  const unsoldPlayers = players.filter((p) => p.status === "UNSOLD");

  const biddableTeams = teams.filter(
    (t) =>
      players.filter((p) => p.team_id === t.id && p.status === "SOLD").length <
        membersPerTeam - 1 && t.point_balance >= 10,
  );

  const bids = useAuctionStore((s) => s.bids);
  const playerBids = bids.filter((b) => b.player_id === currentPlayer?.id);
  const highestBid =
    playerBids.length > 0 ? Math.max(...playerBids.map((b) => b.amount)) : 0;
  const minBid = highestBid > 0 ? highestBid + 10 : 10;

  useEffect(() => {
    if (!timerEndsAt) {
      setIsExpired(false);
      return;
    }
    const update = () => {
      const remain = new Date(timerEndsAt).getTime() - Date.now();
      setIsExpired(remain <= 0);
    };
    update();
    const t = setInterval(update, 100);
    return () => clearInterval(t);
  }, [timerEndsAt]);

  const isAuctionActive = !!timerEndsAt && !isExpired;
  const myTeam = teams.find((t) => t.id === storeTeamId);
  const isTeamFull = myTeam
    ? players.filter((p) => p.team_id === myTeam.id && p.status === "SOLD")
        .length >=
      membersPerTeam - 1
    : false;
  const lotteryPlayer = useAuctionStore((s) => s.lotteryPlayer);

  const { handleCloseLottery } = useAuctionControl({
    roomId,
    effectiveRole: effectiveRole ?? "VIEWER",
    players,
    timerEndsAt,
  });

  const handleNotice = async () => {
    if (!noticeText.trim() || !roomId || isSendingNotice) return;
    setIsSendingNotice(true);
    try {
      await sendNotice(roomId, noticeText.trim());
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
      const res = await startAuction(roomId, isReAuctionRound ? 5000 : 10000);
      if (res.timerEndsAt) setRealtimeData({ timerEndsAt: res.timerEndsAt });
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
      await deleteRoom(roomId);
      router.push("/");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isRoomLoaded)
    return (
      <div className="h-screen flex items-center justify-center font-black text-3xl animate-pulse">
        LOADING INSTANCE...
      </div>
    );
  if (!roomExists)
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="pixel-box bg-white p-10 font-black">
          <p className="text-2xl mb-6">ERROR: ROOM NOT FOUND</p>
          <button
            onClick={() => router.push("/")}
            className="pixel-button bg-minion-yellow px-8 py-3"
          >
            RETURN TO MENU
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col h-screen overflow-hidden relative crt-overlay">
      <RoomHeader
        effectiveRole={effectiveRole}
        createdAt={createdAt}
        onLeaveRoom={() => setIsLeaveRoomOpen(true)}
      />

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 overflow-y-auto lg:overflow-hidden w-full max-w-7xl mx-auto">
        <aside className="lg:col-span-3 flex flex-col min-h-0 order-3 lg:order-1 h-[300px] lg:h-auto shrink-0">
          <div className="pixel-box bg-white flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="bg-black text-white px-3 py-1.5 font-heading text-[8px] uppercase flex justify-between">
              <span>Team Roster</span>
              <span className="text-minion-yellow animate-pulse">ACTIVE</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0">
              <TeamList />
            </div>
          </div>
        </aside>

        <section className="lg:col-span-6 flex flex-col gap-4 min-h-0 order-1 lg:order-2 lg:h-full shrink-0">
          <div className="pixel-box bg-black p-3 flex items-center justify-between overflow-hidden">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏆</span>
              <h2 className="text-xl font-black text-black truncate uppercase">
                {roomName}
              </h2>
            </div>
            <div className="flex gap-2">
              <HowToUseModal variant="header" />
              {effectiveRole === "ORGANIZER" && (
                <button
                  onClick={() => setIsEndRoomOpen(true)}
                  className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-1.5 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all text-[10px] font-heading uppercase"
                >
                  END
                </button>
              )}
            </div>
          </div>

          <AuctionBoard
            isLotteryActive={!!lotteryPlayer}
            lotteryPlayer={lotteryPlayer}
            waitingPlayers={waitingPlayers}
            role={effectiveRole}
            allConnected={allConnected}
            onCloseLottery={handleCloseLottery}
            roomId={roomId}
          />

          {effectiveRole === "ORGANIZER" && (
            <OrganizerControlPanel
              noticeText={noticeText}
              setNoticeText={setNoticeText}
              onSendNotice={handleNotice}
              waitingPlayersCount={waitingPlayers.length}
              soldPlayersCount={soldPlayers.length}
              allDone={allDone}
              currentPlayer={currentPlayer || null}
              timerEndsAt={timerEndsAt}
              lotteryPlayer={lotteryPlayer}
              isDrawing={isDrawing}
              allConnected={allConnected}
              onShowResult={() => setShowResultModal(true)}
              onDraw={handleDraw}
              onStart={handleStart}
            />
          )}

          {effectiveRole === "LEADER" && roomId && storeTeamId && (
            <BiddingControl
              roomId={roomId}
              teamId={storeTeamId}
              currentPlayer={currentPlayer || null}
              myTeam={myTeam || null}
              isAuctionActive={isAuctionActive}
              timerEndsAt={timerEndsAt}
              minBid={minBid}
              isTeamFull={isTeamFull}
            />
          )}
        </section>

        <aside className="lg:col-span-3 flex flex-col gap-4 min-h-0 order-2 lg:order-3 h-[400px] lg:h-auto shrink-0">
          <div className="pixel-box bg-black flex-none max-h-[150px] flex flex-col overflow-hidden">
            <div className="bg-red-600 text-white px-3 py-1.5 font-heading text-[8px] uppercase">
              유찰명단 (Unsold)
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 min-h-0">
              <UnsoldPanel />
            </div>
          </div>
          <div className="pixel-box bg-white flex-1 flex flex-col overflow-hidden">
            <div className="bg-minion-blue text-white px-3 py-1 font-heading text-[8px] uppercase flex justify-between">
              <span>채팅 로그</span>
              <span className="animate-pulse">● ONLINE</span>
            </div>
            <ChatPanel />
          </div>
        </aside>
      </main>

      <LeaveRoomModal
        isOpen={isLeaveRoomOpen}
        onClose={() => setIsLeaveRoomOpen(false)}
        onConfirm={() => router.push("/")}
      />
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
