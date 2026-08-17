"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAuctionStore,
  Role,
  PresenceUser,
} from "@/features/auction/store/useAuctionStore";
import { useFirebaseRealtime } from "@/features/auction/hooks/useAuctionRealtime";
import { useFirebasePresence } from "@/features/auction/hooks/usePresence";
import { useLatencyReporter } from "@/features/auction/hooks/useLatencyReporter";
import { subscribeSocketAuctionState } from "@/features/auction/socket/socketAuctionClient";
import { isSocketPrimaryTransport } from "@/features/auction/utils/auctionTransport";
import { useAuctionPresenceGuard } from "@/features/auction/hooks/useAuctionPresenceGuard";
import { useRoomAuth } from "@/features/auction/hooks/useRoomAuth";
import { useAuctionControl } from "@/features/auction/hooks/useAuctionControl";
import {
  startAuction,
  deleteRoom,
  drawNextPlayer,
  saveAuctionArchive,
  sendNotice,
  lockSealedBidRound,
  revealSealedBidRound,
} from "@/features/auction/api/auctionActions";
import { AuctionBoard } from "@/features/auction/components/AuctionBoard";
import { TeamList, UnsoldPanel } from "@/features/auction/components/TeamList";
import { WaitingPanel } from "@/features/auction/components/WaitingPanel";
import { ChatPanel } from "@/features/auction/components/ChatPanel";
import { BiddingControl } from "@/features/auction/components/BiddingControl";
import { SealedBiddingControl } from "@/features/auction/components/SealedBiddingControl";
import { LatencyDebugPanel } from "@/features/auction/components/LatencyDebugPanel";
import { HowToUseModal } from "@/features/auction/components/HowToUseModal";
import { EndRoomModal } from "@/features/auction/components/EndRoomModal";
import { AuctionResultModal } from "@/features/auction/components/AuctionResultModal";
import { LeaveRoomModal } from "@/features/auction/components/LeaveRoomModal";
import { RoomHeader } from "./components/RoomHeader";
import { OrganizerControlPanel } from "./components/OrganizerControlPanel";
import { ThreeDIcon } from "@/components/ui/ThreeDIcon";
import {
  buildRosterWithCaptain,
  getAuctionSlotsPerTeam,
} from "@/features/auction/utils/roster";
import { getAuctionBidState } from "@/features/auction/utils/auctionRealtime";
import {
  bucketAuctionPlayers,
  isAuctionRoomComplete,
} from "@/features/auction/store/auctionSelectors";
import {
  AUCTION_DURATION_MS,
  SEALED_BID_DURATION_MS,
} from "@/features/auction/constants/auctionTimings";

const REQUIRE_ALL_LEADERS_CONNECTED =
  process.env.NEXT_PUBLIC_REQUIRE_ALL_LEADERS_CONNECTED === "1";

export function RoomClient({
  roomId,
  roleParam,
  teamIdParam,
  roomAuthTokenParam,
}: {
  roomId: string;
  roleParam: Role;
  teamIdParam: string | null;
  roomAuthTokenParam: string | null;
}) {
  const players = useAuctionStore((s) => s.players);
  const teams = useAuctionStore((s) => s.teams);
  const roomName = useAuctionStore((s) => s.roomName);
  const createdAt = useAuctionStore((s) => s.createdAt);
  const roomExists = useAuctionStore((s) => s.roomExists);
  const isRoomLoaded = useAuctionStore((s) => s.isRoomLoaded);
  const timerEndsAt = useAuctionStore((s) => s.timerEndsAt);
  const currentPlayerId = useAuctionStore((s) => s.currentPlayerId);
  const membersPerTeam = useAuctionStore((s) => s.membersPerTeam);
  const captainMode = useAuctionStore((s) => s.captainMode);
  const auctionMode = useAuctionStore((s) => s.auctionMode);
  const auctionTransport = useAuctionStore((s) => s.auctionTransport);
  const sealedBid = useAuctionStore((s) => s.sealedBid);
  const presences = useAuctionStore((s) => s.presences);
  const isPresenceLoaded = useAuctionStore((s) => s.isPresenceLoaded);
  const storeTeamId = useAuctionStore((s) => s.teamId);
  const organizerToken = useAuctionStore((s) => s.organizerToken);
  const roomAuthToken = useAuctionStore((s) => s.roomAuthToken);
  const setLotteryPlayer = useAuctionStore((s) => s.setLotteryPlayer);
  const setRoomContext = useAuctionStore((s) => s.setRoomContext);
  const setRealtimeData = useAuctionStore((s) => s.setRealtimeData);
  const nextAuctionDurationMs = useAuctionStore((s) => s.nextAuctionDurationMs);

  const [isLeaveRoomOpen, setIsLeaveRoomOpen] = useState(false);
  const [isEndRoomOpen, setIsEndRoomOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isTeamsExpanded, setIsTeamsExpanded] = useState(false);

  const router = useRouter();

  const { effectiveRole } = useRoomAuth({
    role: roleParam,
    teamId: teamIdParam || undefined,
    roomAuthToken: roomAuthTokenParam,
    roomId,
    setRoomContext,
  });
  useFirebaseRealtime(roomId, effectiveRole);
  useEffect(() => {
    if (!effectiveRole || !isSocketPrimaryTransport(auctionTransport)) return;
    return subscribeSocketAuctionState({
      roomId,
      role: effectiveRole === "ORGANIZER" || effectiveRole === "LEADER" ? effectiveRole : "VIEWER",
      teamId: storeTeamId,
      authToken: roomAuthToken,
    });
  }, [auctionTransport, effectiveRole, roomAuthToken, roomId, storeTeamId]);
  // 입찰 latency·폴백 발동 운영 리포트 (30초 주기 + 이탈 시 flush)
  useLatencyReporter(roomId);

  // Firebase RTDB Presence (팀장/주최자 접속 현황)
  const myTeamForPresence = teams.find((t) => t.id === storeTeamId);
  useFirebasePresence({
    roomId,
    teamId: storeTeamId,
    role: effectiveRole,
    teamName: myTeamForPresence?.name,
    disableRoomFirebaseAuth: auctionMode === "SEALED_BID",
  });

  const connectedLeaderIds = new Set(
    presences
      .filter((p: PresenceUser) => p.role === "LEADER")
      .map((p: PresenceUser) => p.teamId),
  );
  const allConnected =
    teams.length > 0 && connectedLeaderIds.size >= teams.length;
  const canProceedWithPresence =
    !REQUIRE_ALL_LEADERS_CONNECTED || allConnected;
  const {
    currentPlayer,
    waitingPlayers,
    soldPlayers,
    unsoldPlayers,
    soldCountByTeam,
  } = useMemo(
    () => bucketAuctionPlayers(players, currentPlayerId),
    [players, currentPlayerId],
  );

  const lotteryPlayer = useAuctionStore((s) => s.lotteryPlayer);

  const displayWaitingPlayers = waitingPlayers;

  const liveBid = useAuctionStore((s) => s.liveBid);
  const isCurrentPlayerBid = liveBid?.player_id === currentPlayer?.id;
  const { minBid } = getAuctionBidState({
    currentBidAmount: isCurrentPlayerBid && liveBid ? liveBid.amount : null,
    currentBidTeamId: isCurrentPlayerBid && liveBid ? liveBid.team_id : null,
  });

  useEffect(() => {
    if (!timerEndsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [timerEndsAt]);

  const isExpired = Boolean(timerEndsAt && new Date(timerEndsAt).getTime() <= now);

  useEffect(() => {
    const inProgress = (!!timerEndsAt && !isExpired) || sealedBid?.phase === "ACTIVE";
    if (!inProgress) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [timerEndsAt, isExpired, sealedBid?.phase]);

  const isAuctionActive = !!timerEndsAt && !isExpired;
  const auctionSlotsPerTeam = getAuctionSlotsPerTeam(
    membersPerTeam,
    captainMode,
  );
  const myTeam = teams.find((t) => t.id === storeTeamId);
  const isTeamFull = myTeam
    ? (soldCountByTeam.get(myTeam.id) ?? 0) >= auctionSlotsPerTeam
    : false;

  const guardCurrentPlayerId = currentPlayerId ?? currentPlayer?.id ?? null;

  const isAuctionStarted =
    soldPlayers.length > 0 || !!currentPlayerId || !!lotteryPlayer;

  useAuctionPresenceGuard({
    roomId,
    effectiveRole,
    isPresenceLoaded,
    allConnected: canProceedWithPresence,
    currentPlayerId: guardCurrentPlayerId,
    timerEndsAt,
    lotteryPlayerId: lotteryPlayer?.id ?? null,
    isAuctionStarted,
  });

  const { handleCloseLottery, triggerAward } = useAuctionControl({
    roomId,
    effectiveRole: effectiveRole ?? "VIEWER",
    organizerToken: organizerToken ?? "",
    players,
    currentPlayerId,
    timerEndsAt,
  });

  const handleNotice = async () => {
    if (!noticeText.trim() || !roomId || isSendingNotice) return;
    setIsSendingNotice(true);
    try {
      await sendNotice(roomId, organizerToken ?? "", noticeText.trim());
      setNoticeText("");
    } finally {
      setIsSendingNotice(false);
    }
  };

  const handleDraw = async () => {
    setIsDrawing(true);
    try {
      const res = await drawNextPlayer(roomId, organizerToken ?? "");
      if (res.error) alert(res.error);
    } finally {
      setIsDrawing(false);
    }
  };

  const handleStart = async () => {
    const optimisticDurationMs =
      nextAuctionDurationMs ??
      (auctionMode === "SEALED_BID"
        ? SEALED_BID_DURATION_MS
        : AUCTION_DURATION_MS);
    const optimisticTimerEndsAt = new Date(
      Date.now() + optimisticDurationMs,
    ).toISOString();
    setLotteryPlayer(null);
    setRealtimeData({ timerEndsAt: optimisticTimerEndsAt });
    try {
      const res = await startAuction(roomId, organizerToken ?? "");
      if (res.error) {
        // 경매 시작 실패 — 타이머를 원래 상태(null)로 롤백
        setRealtimeData({ timerEndsAt: null });
        alert(res.error);
        return;
      }
      // 서버 정본 적용: RTDB 이벤트가 이미 더 최신 값을 적용했을 수 있으므로 가드
      if (res.timerEndsAt) {
        const currentTimerEndsAt = useAuctionStore.getState().timerEndsAt;
        if (
          !currentTimerEndsAt ||
          new Date(res.timerEndsAt).getTime() >=
            new Date(currentTimerEndsAt).getTime()
        ) {
          setRealtimeData({ timerEndsAt: res.timerEndsAt });
        }
      }
    } catch (error) {
      setRealtimeData({ timerEndsAt: null });
      throw error;
    }
  };

  const handleSealedTimerExpire = async () => {
    const res = await lockSealedBidRound(roomId, organizerToken ?? "");
    if (res.error) alert(res.error);
  };

  const handleRevealSealedBid = async () => {
    const res = await revealSealedBidRound(roomId, organizerToken ?? "");
    if (res.error) alert(res.error);
  };

  const handleStartFromLottery = async () => {
    await handleCloseLottery();
  };

  const isRoomComplete = isAuctionRoomComplete({
    teamIds: teams.map((team) => team.id),
    soldCountByTeam,
    membersPerTeam,
    captainMode,
  });
  const allDone =
    displayWaitingPlayers.length === 0 &&
    !currentPlayer &&
    unsoldPlayers.length === 0 &&
    soldPlayers.length > 0 &&
    (isRoomComplete || players.length === soldPlayers.length);
  const shouldExpandTeamRoster =
    effectiveRole === "ORGANIZER" || effectiveRole === "LEADER";

  const handleEndRoom = async (saveResult: boolean) => {
    if (!roomId) return;
    setIsDeleting(true);
    try {
      if (saveResult && allDone) {
        await saveAuctionArchive({
          roomId,
          organizerToken: organizerToken ?? "",
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
      await deleteRoom(roomId, organizerToken ?? "");
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

      <div className="room-layout-scale flex flex-col">
        <RoomHeader
          effectiveRole={effectiveRole}
          createdAt={createdAt}
          onLeaveRoom={() => setIsLeaveRoomOpen(true)}
        />

        <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 overflow-y-auto lg:overflow-hidden xl:overflow-visible w-full max-w-7xl mx-auto z-10 relative min-h-0 custom-scrollbar">
          {/* Left Side: Team List (Mobile Accordion) */}
          <aside
            className={`lg:col-span-3 flex flex-col min-h-0 order-3 lg:order-1 transition-all duration-300 ease-in-out xl:relative xl:overflow-visible ${isTeamsExpanded ? "h-auto" : "h-14 lg:h-full"}`}
          >
            <div
              className={`pixel-box bg-white flex-1 flex flex-col overflow-hidden min-h-0 shadow-[8px_8px_0px_rgba(0,0,0,1)] ${
                shouldExpandTeamRoster
                  ? "xl:absolute xl:inset-y-0 xl:right-0 xl:w-[calc(200%+1rem)]"
                  : ""
              }`}
            >
              <button
                onClick={() => {
                  if (window.innerWidth < 1024)
                    setIsTeamsExpanded(!isTeamsExpanded);
                }}
                className="bg-black text-white px-4 h-14 font-heading text-fluid-xs uppercase flex justify-between items-center border-b-4 border-black w-full text-left lg:cursor-default group shrink-0"
              >
                <div className="flex items-center gap-3">
                  <span>Team Rosters</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1.5 bg-minion-blue/20 px-2 py-1 border-2 border-minion-blue/30">
                    <div className="w-1.5 h-1.5 bg-green-500" />
                    <span className="text-minion-blue text-[10px] font-bold">
                      LIVE FEED
                    </span>
                  </div>
                  <span
                    className={`lg:hidden text-minion-yellow font-heading transition-transform duration-300 ${isTeamsExpanded ? "rotate-180" : ""}`}
                  >
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
                  <ThreeDIcon name="trophy" alt="경매방" size={32} />
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
                waitingPlayers={displayWaitingPlayers}
                role={effectiveRole}
                allConnected={canProceedWithPresence}
                onCloseLottery={handleStartFromLottery}
                onShowResult={() => setShowResultModal(true)}
                roomId={roomId}
                onTimerExpire={
                  effectiveRole === "ORGANIZER" && currentPlayerId
                    ? auctionMode === "SEALED_BID"
                      ? handleSealedTimerExpire
                      : () => triggerAward(currentPlayerId)
                    : undefined
                }
              />
            </div>

            {effectiveRole === "ORGANIZER" && (
              <div>
                <OrganizerControlPanel
                  noticeText={noticeText}
                  setNoticeText={setNoticeText}
                  onSendNotice={handleNotice}
                  waitingPlayersCount={displayWaitingPlayers.length}
                  soldPlayersCount={soldPlayers.length}
                  allDone={allDone}
                  currentPlayer={currentPlayer || null}
                  timerEndsAt={timerEndsAt}
                  lotteryPlayer={lotteryPlayer}
                  isDrawing={isDrawing}
                  allConnected={canProceedWithPresence}
                  auctionMode={auctionMode}
                  sealedBid={sealedBid}
                  onDraw={handleDraw}
                  onStart={handleStart}
                  onRevealSealedBid={handleRevealSealedBid}
                />
              </div>
            )}

            {effectiveRole === "LEADER" && roomId && storeTeamId && (
              <div>
                {auctionMode === "SEALED_BID" ? (
                  <SealedBiddingControl
                    roomId={roomId}
                    teamId={storeTeamId}
                    leaderToken={roomAuthToken ?? ""}
                    currentPlayer={currentPlayer || null}
                    myTeam={myTeam || null}
                    isAuctionActive={isAuctionActive}
                    isTeamFull={isTeamFull}
                    allDone={allDone}
                    sealedBid={sealedBid}
                  />
                ) : (
                  <BiddingControl
                    roomId={roomId}
                    teamId={storeTeamId}
                    leaderToken={roomAuthToken ?? ""}
                    currentPlayer={currentPlayer || null}
                    myTeam={myTeam || null}
                    isAuctionActive={isAuctionActive}
                    timerEndsAt={timerEndsAt}
                    minBid={minBid}
                    isTeamFull={isTeamFull}
                    allDone={allDone}
                  />
                )}
              </div>
            )}
          </section>

          {/* Right Side: Unsold & Chat */}
          <aside className="lg:col-span-3 flex flex-col gap-4 min-h-0 order-2 lg:order-3 h-auto shrink-0">
            <div className="pixel-box bg-white flex-none max-h-[160px] lg:max-h-[200px] flex flex-col overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)]">
              <div className="bg-minion-red text-white px-4 py-2 font-heading text-fluid-xs uppercase border-b-4 border-black">
                유찰 명단
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0 bg-gray-50/30">
                <UnsoldPanel />
              </div>
            </div>

            <div className="pixel-box bg-white flex-1 flex flex-col overflow-hidden min-h-0 shadow-[8px_8px_0px_rgba(0,0,0,1)] max-h-[300px] lg:max-h-none">
              <div className="bg-minion-blue text-white px-4 py-2 font-heading text-fluid-xs uppercase flex justify-between items-center border-b-4 border-black">
                <span>로그</span>
                <span className="text-fluid-xs text-blue-200">● LIVE</span>
              </div>
              <ChatPanel />
            </div>
          </aside>

          <aside className="hidden xl:absolute xl:inset-y-4 xl:left-full xl:ml-4 xl:flex xl:w-[280px] 2xl:w-[340px] flex-col">
            <div className="pixel-box bg-white flex h-full min-h-0 flex-col overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)]">
              <div className="bg-minion-yellow text-black px-4 py-2 font-heading text-fluid-xs uppercase flex justify-between items-center border-b-4 border-black">
                <span>대기 명단</span>
                <span className="text-fluid-xs font-black tabular-nums">
                  {displayWaitingPlayers.length} 명
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0 bg-gray-50/30">
                <WaitingPanel players={displayWaitingPlayers} />
              </div>
            </div>
          </aside>
        </main>
      </div>

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
      <LatencyDebugPanel />
    </div>
  );
}
