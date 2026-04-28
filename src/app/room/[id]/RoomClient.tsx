"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuctionStore, Role, PresenceUser } from "@/features/auction/store/useAuctionStore";
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
import { PixelIcon } from "@/components/ui/PixelIcon";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import {
  buildRosterWithCaptain,
  getAuctionSlotsPerTeam,
} from "@/features/auction/utils/roster";

export function RoomClient({
  roomId,
  roleParam,
  teamIdParam,
}: {
  roomId: string;
  roleParam: Role;
  teamIdParam: string | null;
}) {
  useFirebaseRealtime(roomId);
  const players = useAuctionStore((s) => s.players);
  const teams = useAuctionStore((s) => s.teams);
  const roomName = useAuctionStore((s) => s.roomName);
  const createdAt = useAuctionStore((s) => s.createdAt);
  const roomExists = useAuctionStore((s) => s.roomExists);
  const isRoomLoaded = useAuctionStore((s) => s.isRoomLoaded);
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt);
  const membersPerTeam = useAuctionStore((s) => s.membersPerTeam);
  const captainMode = useAuctionStore((s) => s.captainMode);
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
  const [isExpired, setIsExpired] = useState(false);
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);

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
    presences.filter((p: PresenceUser) => p.role === "LEADER").map((p: PresenceUser) => p.teamId),
  );
  const allConnected =
    teams.length > 0 && connectedLeaderIds.size >= teams.length;
  const currentPlayer = players.find((p) => p.status === "IN_AUCTION");
  const waitingPlayers = players.filter((p) => p.status === "WAITING");
  const soldPlayers = players.filter((p) => p.status === "SOLD");
  const unsoldPlayers = players.filter((p) => p.status === "UNSOLD");

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
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [timerEndsAt]);

  const isAuctionActive = !!timerEndsAt && !isExpired;
  const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
    membersPerTeam,
    captainMode,
  );
  const myTeam = teams.find((t) => t.id === storeTeamId);
  const isTeamFull = myTeam
    ? players.filter((p) => p.team_id === myTeam.id && p.status === "SOLD")
        .length >=
      auctionSlotsPerTeam
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
    try {
      const res = await startAuction(roomId, isReAuctionRound ? 5000 : 10000);
      if (res.timerEndsAt) setRealtimeData({ timerEndsAt: res.timerEndsAt });
    } finally {
      // isStarting removed as it was unused in UI
    }
  };

  const handleStartFromLottery = async () => {
    await handleStart();
    await handleCloseLottery();
  };

  const isRoomComplete =
    teams.length > 0 &&
    teams.every(
      (t) =>
        players.filter((p) => p.team_id === t.id && p.status === "SOLD")
          .length ===
        auctionSlotsPerTeam,
    );
  const allDone =
    waitingPlayers.length === 0 &&
    !currentPlayer &&
    unsoldPlayers.length === 0 &&
    soldPlayers.length > 0 &&
    (isRoomComplete || players.length === soldPlayers.length);

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
            leader_position: t.leader_position,
            captain_mode: captainMode,
            point_balance: t.point_balance,
            players: buildRosterWithCaptain(
              players
                .filter((p) => p.team_id === t.id && p.status === "SOLD")
                .map((p) => ({
                  name: p.name,
                  tier: p.tier,
                  main_position: p.main_position,
                  sub_position: p.sub_position,
                  sold_price: p.sold_price,
                })),
              {
                captainMode,
                leaderName: t.leader_name,
                leaderPosition: t.leader_position,
              },
            ),
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
      <div className="h-screen flex items-center justify-center font-black text-fluid-xl">
        LOADING INSTANCE...
      </div>
    );
  if (!roomExists)
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="pixel-box bg-white p-10 font-black">
          <p className="text-fluid-lg mb-6">ERROR: ROOM NOT FOUND</p>
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
    <div className="flex flex-col h-screen overflow-hidden relative crt-overlay bg-background">
      {/* Texture Polishing: Noise & Grid */}
      <div className="absolute inset-0 pixel-noise z-0" />

      <RoomHeader
        effectiveRole={effectiveRole}
        createdAt={createdAt}
        onLeaveRoom={() => setIsLeaveRoomOpen(true)}
      />

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 overflow-y-auto lg:overflow-hidden w-full max-w-7xl mx-auto z-10 relative max-h-[95vh] custom-scrollbar">
        {/* Left Side: Team List (Mobile Accordion) */}
        <aside
          className={`lg:col-span-3 flex flex-col min-h-0 order-3 lg:order-1 transition-all duration-300 ease-in-out ${isTeamsExpanded ? "h-auto" : "h-14 lg:h-full"}`}
        >
          <div className="pixel-box bg-white flex-1 flex flex-col overflow-hidden min-h-0 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <button
              onClick={() => {
                if (window.innerWidth < 1024) setIsTeamsExpanded(!isTeamsExpanded);
              }}
              className="bg-black text-white px-4 h-14 font-heading text-fluid-xs uppercase flex justify-between items-center border-b-4 border-black w-full text-left lg:cursor-default group shrink-0"
            >
              <div className="flex items-center gap-3">
                <PixelIcon icon={PIXEL_ICONS.WAITING} size={16} color="text-minion-yellow" animation="active" />
                <span>Team Rosters</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 bg-minion-blue/20 px-2 py-1 border-2 border-minion-blue/30">
                  <div className="w-1.5 h-1.5 bg-green-500" />
                  <span className="text-minion-blue text-[10px] font-bold">LIVE FEED</span>
                </div>
                <span className={`lg:hidden text-minion-yellow font-heading transition-transform duration-300 ${isTeamsExpanded ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </div>
            </button>
            <div
              className={`flex-1 overflow-y-auto custom-scrollbar p-4 min-h-0 bg-gray-50/30 transition-all duration-300 ${
                isTeamsExpanded 
                  ? "block opacity-100" 
                  : "hidden lg:block lg:opacity-100 opacity-0"
              }`}
            >
              <TeamList />
            </div>
          </div>
        </aside>

        {/* Center: Main Auction Board & Control */}
        <section className="lg:col-span-6 flex flex-col gap-3 min-h-0 order-1 lg:order-2 lg:h-full shrink-0">
          <div className="pixel-box bg-black p-4 flex items-center justify-between overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)] border-b-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-minion-yellow pixel-box border-2 shadow-none flex items-center justify-center">
                <span className="text-2xl">
                  <PixelIcon
                    icon={PIXEL_ICONS.FINISH}
                    size={18}
                    color="text-minion-yellow"
                    animation="active"
                    label="도움말"
                  />
                </span>
              </div>
              <h2 className="text-fluid-base lg:text-fluid-sm font-bold text-foreground truncate uppercase leading-none">
                {roomName}
              </h2>
            </div>
            <div className="flex gap-3">
              <HowToUseModal variant="header" />
              {effectiveRole === "ORGANIZER" && (
                <button
                  onClick={() => setIsEndRoomOpen(true)}
                  className="pixel-button bg-minion-red text-white h-10 px-5 py-2 text-fluid-xs font-heading hover:bg-minion-red-hover border-2 shadow-none"
                >
                  방 종료
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <AuctionBoard
              isLotteryActive={!!lotteryPlayer}
              lotteryPlayer={lotteryPlayer}
              waitingPlayers={waitingPlayers}
              role={effectiveRole}
              allConnected={allConnected}
              onCloseLottery={handleStartFromLottery}
              onShowResult={() => setShowResultModal(true)}
              roomId={roomId}
            />
          </div>

          {effectiveRole === "ORGANIZER" && (
            <div>
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
                onDraw={handleDraw}
              />
            </div>
          )}

          {effectiveRole === "LEADER" && roomId && storeTeamId && (
            <div>
              <BiddingControl
                roomId={roomId}
                teamId={storeTeamId}
                currentPlayer={currentPlayer || null}
                myTeam={myTeam || null}
                isAuctionActive={isAuctionActive}
                timerEndsAt={timerEndsAt}
                minBid={minBid}
                isTeamFull={isTeamFull}
                allDone={allDone}
              />
            </div>
          )}
        </section>

        {/* Right Side: Unsold & Chat */}
        <aside className="lg:col-span-3 flex flex-col gap-4 min-h-0 order-2 lg:order-3 h-auto shrink-0">
          <div className="pixel-box bg-white flex-none max-h-[160px] lg:max-h-[200px] flex flex-col overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <div className="bg-minion-red text-white px-4 py-2 font-heading text-fluid-xs uppercase border-b-4 border-black">
              Unsold Roster
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0 bg-gray-50/30">
              <UnsoldPanel />
            </div>
          </div>

          <div className="pixel-box bg-white flex-1 flex flex-col overflow-hidden min-h-0 shadow-[8px_8px_0px_rgba(0,0,0,1)] max-h-[300px] lg:max-h-none">
            <div className="bg-minion-blue text-white px-4 py-2 font-heading text-fluid-xs uppercase flex justify-between items-center border-b-4 border-black">
              <span>Communication</span>
              <span className="text-fluid-xs text-blue-200">
                ● LIVE
              </span>
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
