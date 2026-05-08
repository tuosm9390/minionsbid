"use client";

// 경매 타이머 정책을 단일 화면에서 검증하는 테스트 페이지
import { Gavel, RefreshCcw, RotateCcw, Timer, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AuctionStatus =
  | "draw_waiting"
  | "draw_completed"
  | "auction_waiting"
  | "auction_active"
  | "auction_closed";

type ParticipantRole = "host" | "bidder";

type Participant = {
  id: string;
  nickname: string;
  role: ParticipantRole;
};

type BidRecord = {
  id: number;
  bidderNickname: string;
  amount: number;
  remainingBeforeMs: number;
  timerChanged: boolean;
  createdAt: number;
};

type AuctionState = {
  status: AuctionStatus;
  itemName: string;
  startedAt: number | null;
  endsAt: number | null;
  highestBidAmount: number | null;
  highestBidderNickname: string | null;
  nextMinBidAmount: number;
  bidCount: number;
  revision: number;
  records: BidRecord[];
  closedAt: number | null;
};

const START_DURATION_MS = 10_000;
const EXTEND_THRESHOLD_MS = 5_000;
const EXTEND_DURATION_MS = 5_000;
const BID_STEP = 10;

const STATUS_LABELS: Record<AuctionStatus, string> = {
  draw_waiting: "추첨 대기",
  draw_completed: "추첨 완료",
  auction_waiting: "경매 대기",
  auction_active: "경매 중",
  auction_closed: "경매 완료(낙찰)",
};

const PARTICIPANTS: Participant[] = [
  { id: "host", nickname: "주최자", role: "host" },
  { id: "leader-a", nickname: "Alpha", role: "bidder" },
  { id: "leader-b", nickname: "Bravo", role: "bidder" },
  { id: "leader-c", nickname: "Charlie", role: "bidder" },
];

const createInitialState = (): AuctionState => ({
  status: "auction_waiting",
  itemName: "MID Player 01",
  startedAt: null,
  endsAt: null,
  highestBidAmount: null,
  highestBidderNickname: null,
  nextMinBidAmount: 10,
  bidCount: 0,
  revision: 0,
  records: [],
  closedAt: null,
});

const formatMs = (value: number) => `${Math.max(0, Math.floor(value / 1000))}초`;

const applyBid = (
  current: AuctionState,
  participant: Participant,
  amount: number,
  now: number,
): { next: AuctionState; error: string | null; nextBidAmount: number | null } => {
  if (current.status !== "auction_active" || current.endsAt === null) {
    return { next: current, error: "입찰에 실패하였습니다.", nextBidAmount: null };
  }

  const remainingBeforeMs = current.endsAt - now;
  const isInvalidBid =
    participant.role === "host" ||
    remainingBeforeMs <= 0 ||
    amount < current.nextMinBidAmount ||
    amount % BID_STEP !== 0;

  if (isInvalidBid) {
    return { next: current, error: "입찰에 실패하였습니다.", nextBidAmount: null };
  }

  const shouldRefreshTimer = remainingBeforeMs <= EXTEND_THRESHOLD_MS;
  const nextEndsAt = shouldRefreshTimer ? now + EXTEND_DURATION_MS : current.endsAt;
  const nextBidCount = current.bidCount + 1;
  const nextBidAmount = amount + BID_STEP;

  return {
    error: null,
    nextBidAmount,
    next: {
      ...current,
      endsAt: nextEndsAt,
      highestBidAmount: amount,
      highestBidderNickname: participant.nickname,
      nextMinBidAmount: nextBidAmount,
      bidCount: nextBidCount,
      revision: current.revision + 1,
      records: [
        {
          id: nextBidCount,
          bidderNickname: participant.nickname,
          amount,
          remainingBeforeMs,
          timerChanged: shouldRefreshTimer,
          createdAt: now,
        },
        ...current.records,
      ].slice(0, 8),
    },
  };
};

export default function AuctionTimerLabPage() {
  const [serverNow, setServerNow] = useState(0);
  const [auction, setAuction] = useState<AuctionState>(() => createInitialState());
  const [selectedParticipantId, setSelectedParticipantId] = useState(PARTICIPANTS[1].id);
  const [bidAmount, setBidAmount] = useState(10);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const syncClock = () => {
      const now = Date.now();

      setServerNow(now);
      setAuction((current) => {
        if (current.status !== "auction_active" || current.endsAt === null || current.endsAt > now) {
          return current;
        }

        return {
          ...current,
          status: "auction_closed",
          closedAt: now,
          revision: current.revision + 1,
        };
      });
    };

    syncClock();
    const id = window.setInterval(syncClock, 100);
    return () => window.clearInterval(id);
  }, []);

  const selectedParticipant = useMemo(
    () => PARTICIPANTS.find((participant) => participant.id === selectedParticipantId) ?? PARTICIPANTS[1],
    [selectedParticipantId],
  );

  const remainingMs = auction.endsAt === null ? 0 : Math.max(0, auction.endsAt - serverNow);
  const displaySeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const canBid = auction.status === "auction_active" && displaySeconds > 0 && selectedParticipant.role !== "host";
  const progressPercent =
    auction.status === "auction_active"
      ? Math.max(0, Math.min(100, (remainingMs / START_DURATION_MS) * 100))
      : 0;

  const startAuction = () => {
    const now = Date.now();

    setLastError(null);
    setBidAmount(10);
    setAuction({
      ...createInitialState(),
      status: "auction_active",
      startedAt: now,
      endsAt: now + START_DURATION_MS,
      revision: 1,
    });
  };

  const resetAuction = () => {
    setLastError(null);
    setBidAmount(10);
    setAuction(createInitialState());
  };

  const placeBid = () => {
    const now = Date.now();
    const result = applyBid(auction, selectedParticipant, bidAmount, now);

    setAuction(result.next);
    setLastError(result.error);

    if (result.nextBidAmount !== null) {
      setBidAmount(result.nextBidAmount);
    }
  };

  const jumpToFiveSeconds = () => {
    setLastError(null);
    setAuction((current) => {
      if (current.status !== "auction_active") {
        return current;
      }

      return {
        ...current,
        endsAt: Date.now() + EXTEND_THRESHOLD_MS,
      };
    });
  };

  const jumpToThreeSeconds = () => {
    setLastError(null);
    setAuction((current) => {
      if (current.status !== "auction_active") {
        return current;
      }

      return {
        ...current,
        endsAt: Date.now() + 3_000,
      };
    });
  };

  return (
    <main className="min-h-screen px-4 py-8 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border-2 border-black bg-minion-yellow px-3 py-1 font-heading text-xs">
                <Timer size={16} aria-hidden="true" />
                TIMER LAB
              </div>
              <h1 className="font-heading text-2xl text-minion-blue sm:text-3xl">
                실시간 경매 타이머 검증
              </h1>
              <p className="max-w-3xl text-sm font-bold text-gray-700">
                서버 기준 종료 시각, 5초 이하 입찰 갱신, floor 표시, 주최자 입찰 차단을 한 화면에서 확인합니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4">
              <StatusChip label="상태" value={STATUS_LABELS[auction.status]} />
              <StatusChip label="REV" value={String(auction.revision)} />
              <StatusChip label="최소 입찰" value={String(auction.nextMinBidAmount)} />
              <StatusChip label="입찰 수" value={String(auction.bidCount)} />
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-heading text-xs text-gray-500">ITEM</p>
                <h2 className="text-2xl font-black">{auction.itemName}</h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={startAuction} className="pixel-button bg-minion-yellow px-4 py-3 text-sm">
                  <Gavel size={18} aria-hidden="true" />
                  시작
                </button>
                <button type="button" onClick={resetAuction} className="pixel-button bg-white px-4 py-3 text-sm">
                  <RotateCcw size={18} aria-hidden="true" />
                  초기화
                </button>
              </div>
            </div>

            <div className="border-4 border-black bg-black p-5 text-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-heading text-xs text-minion-yellow">FLOOR TIMER</p>
                  <div className="font-heading text-7xl leading-none text-minion-yellow sm:text-8xl">
                    {displaySeconds}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-heading text-xs text-gray-300">서버 기준 남은 시간</p>
                  <p className="text-2xl font-black">{formatMs(remainingMs)}</p>
                  <p className="mt-1 text-xs font-bold text-gray-400">
                    {auction.endsAt === null ? "종료 시각 없음" : new Date(auction.endsAt).toLocaleTimeString("ko-KR")}
                  </p>
                </div>
              </div>
              <div className="mt-5 h-5 border-2 border-white bg-gray-800">
                <div className="h-full bg-minion-yellow" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={jumpToFiveSeconds} className="pixel-button bg-white px-4 py-3 text-xs">
                <RefreshCcw size={16} aria-hidden="true" />
                5초 맞춤
              </button>
              <button type="button" onClick={jumpToThreeSeconds} className="pixel-button bg-white px-4 py-3 text-xs">
                <RefreshCcw size={16} aria-hidden="true" />
                3초 맞춤
              </button>
              <div className="border-4 border-black bg-minion-yellow px-4 py-3 text-center font-heading text-xs">
                0초 표시 시 입찰 잠금
              </div>
            </div>
          </div>

          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="mb-4 flex items-center gap-2">
              <Users size={20} aria-hidden="true" />
              <h2 className="font-heading text-lg">입찰 콘솔</h2>
            </div>

            <label className="block text-xs font-black uppercase text-gray-600" htmlFor="participant">
              참여자
            </label>
            <select
              id="participant"
              value={selectedParticipantId}
              onChange={(event) => setSelectedParticipantId(event.target.value)}
              className="mt-2 w-full border-4 border-black bg-white p-3 font-black"
            >
              {PARTICIPANTS.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.nickname} / {participant.role === "host" ? "주최자" : "입찰자"}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-black uppercase text-gray-600" htmlFor="bidAmount">
              입찰 금액
            </label>
            <input
              id="bidAmount"
              type="number"
              min={auction.nextMinBidAmount}
              step={BID_STEP}
              value={bidAmount}
              onChange={(event) => setBidAmount(Number(event.target.value))}
              className="mt-2 w-full border-4 border-black bg-white p-3 text-2xl font-black"
            />

            <button
              type="button"
              onClick={placeBid}
              disabled={!canBid}
              className="pixel-button mt-5 w-full bg-minion-blue px-4 py-4 text-white"
            >
              <Gavel size={20} aria-hidden="true" />
              입찰
            </button>

            {lastError !== null && (
              <div className="mt-4 border-4 border-black bg-minion-red p-3 text-center font-black text-white">
                {lastError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatusChip label="최고 입찰자" value={auction.highestBidderNickname ?? "-"} />
              <StatusChip label="최고가" value={auction.highestBidAmount === null ? "-" : String(auction.highestBidAmount)} />
            </div>
          </div>
        </section>

        {auction.status === "auction_closed" && (
          <section className="border-4 border-black bg-minion-yellow p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Trophy size={28} aria-hidden="true" />
                <h2 className="font-heading text-xl">낙찰 알림</h2>
              </div>
              <p className="text-lg font-black">
                {auction.highestBidderNickname ?? "낙찰자 없음"} / {auction.itemName} /{" "}
                {auction.highestBidAmount === null ? "-" : auction.highestBidAmount}
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <h2 className="font-heading text-lg">참여자 화면 송출 상태</h2>
            <div className="mt-4 grid gap-3">
              {PARTICIPANTS.map((participant) => (
                <div key={participant.id} className="grid grid-cols-[1fr_auto] gap-3 border-2 border-black p-3">
                  <div>
                    <p className="font-black">{participant.nickname}</p>
                    <p className="text-xs font-bold text-gray-500">
                      {participant.role === "host" ? "입찰 불가" : "입찰 가능"} / {STATUS_LABELS[auction.status]}
                    </p>
                  </div>
                  <div className="text-right font-heading text-2xl text-minion-blue">{displaySeconds}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <h2 className="font-heading text-lg">입찰 이벤트 로그</h2>
            <div className="mt-4 max-h-80 overflow-y-auto custom-scrollbar border-2 border-black">
              {auction.records.length === 0 ? (
                <p className="p-4 text-sm font-bold text-gray-500">아직 입찰 이벤트가 없습니다.</p>
              ) : (
                auction.records.map((record) => (
                  <div key={record.id} className="border-b-2 border-black p-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">
                        #{record.id} {record.bidderNickname} {record.amount}
                      </p>
                      <span className="border-2 border-black bg-minion-yellow px-2 py-1 text-xs font-black">
                        {record.timerChanged ? "5초 갱신" : "유지"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-gray-600">
                      입찰 전 남은 시간 {formatMs(record.remainingBeforeMs)} /{" "}
                      {new Date(record.createdAt).toLocaleTimeString("ko-KR")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-white px-3 py-2">
      <p className="font-heading text-[10px] text-gray-500">{label}</p>
      <p className="truncate text-sm font-black">{value}</p>
    </div>
  );
}
