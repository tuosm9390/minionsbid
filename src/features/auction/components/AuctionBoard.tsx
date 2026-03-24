"use client";

import {
  motion,
  AnimatePresence,
  useReducedMotion,
  Variants,
} from "framer-motion";
import { useAuctionBoard } from "@/features/auction/hooks/useAuctionBoard";
import { AuctionResultModal } from "./AuctionResultModal";
import { LotteryAnimation } from "./LotteryAnimation";
import { SoldOverlay } from "./SoldOverlay";
import { NoticeBanner } from "./board/NoticeBanner";
import { CenterTimer } from "./board/CenterTimer";
import { PlayerInAuction } from "./board/PlayerInAuction";
import { BidStatus } from "./board/BidStatus";
import { DraftPanel } from "./board/DraftPanel";
import { AuctionWaitingState } from "./board/AuctionWaitingState";
import { useAuctionStore, Player, Role } from "../store/useAuctionStore";
import { PIXEL_ICONS } from "@/features/auction/constants/icons";
import { PixelIcon } from "@/components/ui/PixelIcon";

interface AuctionBoardProps {
  isLotteryActive: boolean;
  lotteryPlayer: Player | null;
  waitingPlayers: Player[];
  role: Role;
  allConnected: boolean;
  onCloseLottery: () => void;
  roomId: string;
}

type SceneName = "lottery" | "bidding" | "draft" | "finished" | "waiting";

const sceneVariants: Record<SceneName, Variants> = {
  waiting: {
    initial: { y: 20, opacity: 0 },
    animate: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
    },
    exit: { y: -20, opacity: 0, transition: { duration: 0.25 } },
  },
  lottery: {
    initial: { scale: 0.85, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] as const },
    },
    exit: { scale: 1.1, opacity: 0, transition: { duration: 0.3 } },
  },
  bidding: {
    initial: { y: -30, opacity: 0 },
    animate: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
    },
    exit: {
      x: 100,
      opacity: 0,
      transition: { duration: 0.35, ease: "easeIn" },
    },
  },
  draft: {
    initial: { x: -20, opacity: 0 },
    animate: { x: 0, opacity: 1, transition: { duration: 0.4 } },
    exit: { opacity: 0, transition: { duration: 0.2 } },
  },
  finished: {
    initial: { scale: 0.9, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] as const },
    },
    exit: {},
  },
};

export function AuctionBoard(props: AuctionBoardProps) {
  const shouldReduceMotion = useReducedMotion();
  const isPresenceLoaded = useAuctionStore((s) => s.isPresenceLoaded);
  const isLocalConnected = useAuctionStore((s) => s.isLocalConnected);

  const {
    teams,
    teamId,
    timerEndsAt,
    connectedLeaderIds,
    currentPlayer,
    latestNotice,
    highestBid,
    leadingTeam,
    unsoldPlayers,
    waitingPlayersList,
    isRoomComplete,
    isAuctionFinished,
    isAuctionStarted,
    isAuctionComplete,
    isAutoDraftMode,
    phase,
    currentTurnTeam,
    showResultModal,
    setShowResultModal,
    lotteryDone,
    setLotteryDone,
    handleDraft,
    soldOverlayData,
    setSoldOverlayData,
  } = useAuctionBoard({
    isLotteryActive: props.isLotteryActive,
    lotteryPlayer: props.lotteryPlayer,
    role: props.role,
    allConnected: props.allConnected,
  });

  const currentScene: SceneName = props.isLotteryActive
    ? "lottery"
    : currentPlayer
      ? "bidding"
      : (isAuctionFinished || isAutoDraftMode) && !isRoomComplete
        ? "draft"
        : isAuctionFinished
          ? "finished"
          : "waiting";

  const bgStyle = currentScene === "bidding" ? "bg-white" : "bg-gray-50";

  return (
    <div
      className={`pixel-box ${bgStyle} flex-1 flex flex-col relative overflow-hidden min-h-0 transition-colors duration-500`}
    >
      {/* Decorative Background Grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:40px_40px]" />

      {latestNotice && <NoticeBanner msg={latestNotice} />}

      {/* 1. 중립 로딩 상태 (FR-005) */}
      {!isPresenceLoaded && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-minion-bounce">
            <PixelIcon
              icon={PIXEL_ICONS.TIMER}
              size={48}
              color="text-minion-yellow"
              animation="active"
            />
            <p className="text-fluid-xs font-heading text-white uppercase tracking-tighter">
              접속 현황 확인 중...
            </p>
          </div>
        </div>
      )}

      {/* 2. 로컬 네트워크 단절 (FR-006) */}
      {!isLocalConnected && (
        <div className="absolute inset-0 z-[120] flex flex-col items-center justify-center bg-minion-blue/20 backdrop-blur-md">
          <div className="pixel-box bg-white p-8 border-minion-blue flex flex-col items-center gap-4 text-center animate-minion-bounce">
            <PixelIcon
              icon={PIXEL_ICONS.WARNING}
              size={48}
              color="text-minion-blue"
              animation="active"
            />
            <h2 className="text-fluid-md font-heading text-minion-blue uppercase tracking-tighter">
              연결 확인 중...
            </h2>
          </div>
        </div>
      )}

      {/* 3. 팀장 접속 이탈 경고 — 데이터 로딩 완료 후에만 표시 (FR-003 보완) — AnimatePresence 씬 시스템과 독립된 별도 레이어 */}
      {isPresenceLoaded &&
        !props.allConnected &&
        isAuctionStarted &&
        !isAuctionComplete && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
            <div className="pixel-box bg-white p-10 border-minion-red flex flex-col items-center gap-6 text-center max-w-md animate-minion-bounce">
              <div className="mb-4">
                <PixelIcon
                  icon={PIXEL_ICONS.WARNING}
                  size={64}
                  color="text-minion-red"
                  animation="urgent"
                  label="연결 끊김"
                />
              </div>
              <div className="space-y-2">
                <h2 className="text-fluid-lg font-heading text-minion-red tracking-tighter">
                  연결 끊김
                </h2>
                <p className="text-fluid-xs font-bold text-gray-600">
                  팀장의 연결이 끊겨 경매가 일시정지되었습니다.
                  <br />
                  재연결을 기다리는 중입니다...
                </p>
              </div>
              <div className="w-full h-2 bg-gray-100 border-2 border-black overflow-hidden">
                <div
                  className="h-full bg-minion-red animate-[progress_2s_ease-in-out_infinite]"
                  style={{ width: "30%" }}
                />
              </div>
            </div>
          </div>
        )}

      <div className="flex-1 flex flex-col p-4 lg:p-6 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScene}
            variants={sceneVariants[currentScene]}
            initial={shouldReduceMotion ? false : "initial"}
            animate="animate"
            exit={shouldReduceMotion ? {} : "exit"}
            className="flex-1 flex flex-col"
          >
            {currentScene === "lottery" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-12">
                <LotteryAnimation
                  candidates={props.waitingPlayers}
                  targetPlayer={props.lotteryPlayer!}
                  onFinished={() => setLotteryDone(true)}
                />
                {props.role === "ORGANIZER" && lotteryDone && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    onClick={props.onCloseLottery}
                    className="pixel-button bg-black text-white h-14 px-12 text-fluid-sm font-heading uppercase tracking-tighter hover:bg-minion-blue transition-colors flex items-center gap-3"
                  >
                    경매 시작하기
                    <PixelIcon
                      icon={PIXEL_ICONS.SUCCESS}
                      size={20}
                      color="text-minion-yellow"
                      animation="active"
                    />
                  </motion.button>
                )}
              </div>
            )}

            {currentScene === "bidding" && (
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex justify-center">
                  {timerEndsAt && <CenterTimer timerEndsAt={timerEndsAt} />}
                </div>
                <PlayerInAuction player={currentPlayer!} />
                <BidStatus
                  highestBid={highestBid}
                  leadingTeam={leadingTeam}
                  teamId={teamId}
                />
              </div>
            )}

            {currentScene === "draft" && (
              <DraftPanel
                phase={phase}
                isAutoDraftMode={isAutoDraftMode}
                currentTurnTeam={currentTurnTeam}
                playersList={
                  isAutoDraftMode ? waitingPlayersList : unsoldPlayers
                }
                role={props.role}
                onDraft={handleDraft}
              />
            )}

            {currentScene === "finished" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-8">
                <div className="mb-4">
                  <PixelIcon
                    icon={PIXEL_ICONS.FINISH}
                    size={96}
                    color="text-minion-yellow"
                    animation="success"
                    label="경매 종료"
                  />
                </div>
                <div className="space-y-4">
                  <h1 className="text-fluid-xl font-heading text-minion-blue">
                    경매 종료
                  </h1>
                  <p className="text-fluid-sm font-bold text-gray-500">
                    모든 경매가 성공적으로 종료되었습니다!
                  </p>
                </div>
                <button
                  onClick={() => setShowResultModal(true)}
                  className="pixel-button bg-minion-yellow text-black h-14 px-12 text-fluid-sm font-heading uppercase tracking-tighter hover:scale-105 transition-transform flex items-center gap-3"
                >
                  팀 결과 확인하기
                  <PixelIcon
                    icon={PIXEL_ICONS.SUCCESS}
                    size={20}
                    color="text-black"
                    animation="active"
                  />
                </button>
                <AuctionResultModal
                  isOpen={showResultModal}
                  onClose={() => setShowResultModal(false)}
                />
              </div>
            )}

            {currentScene === "waiting" && (
              <AuctionWaitingState
                allConnected={props.allConnected}
                teams={teams}
                connectedLeaderIds={connectedLeaderIds}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {soldOverlayData && (
        <SoldOverlay
          playerName={soldOverlayData.playerName}
          teamName={soldOverlayData.teamName}
          price={soldOverlayData.price}
          tier={soldOverlayData.tier}
          position={soldOverlayData.position}
          onDismiss={() => setSoldOverlayData(null)}
        />
      )}
    </div>
  );
}
