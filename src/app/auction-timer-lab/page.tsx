"use client";

// 경매 타이머 랩을 Firebase 서버 액션과 실시간 구독으로 검증하는 페이지
import { Gavel, Link2, RefreshCcw, RotateCcw, Timer, Trophy, Users } from "@/components/ui/CyberIcons";
import { onValue, ref } from "firebase/database";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getAuctionClientServices } from "@/features/auction/realtime/clientAdapter";
import {
  closeExpiredTimerLab,
  createTimerLab,
  placeTimerLabBid,
  startTimerLab,
  type TimerLabEvent,
  type TimerLabState,
} from "@/features/timer-lab/actions";

type ParticipantRole = "host" | "bidder";

type Participant = {
  id: string;
  nickname: string;
  role: ParticipantRole;
};

const START_DURATION_MS = 10_000;
const BID_STEP = 10;

const STATUS_LABELS: Record<TimerLabState["status"], string> = {
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

const createEmptyLabState = (): TimerLabState => ({
  kind: "timer_lab",
  status: "auction_waiting",
  itemName: "MID Player 01",
  startedAtMs: null,
  endsAtMs: null,
  closedAtMs: null,
  highestBidAmount: null,
  highestBidderId: null,
  highestBidderNickname: null,
  nextMinBidAmount: 10,
  bidCount: 0,
  revision: 0,
  recentBids: [],
  lastEvent: null,
  createdAtMs: Date.now(),
  expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
});

const createStateFromEvent = (event: TimerLabEvent | null): TimerLabState => ({
  ...createEmptyLabState(),
  status: event?.status ?? "auction_waiting",
  endsAtMs: event?.endsAtMs ?? null,
  highestBidAmount: event?.highestBidAmount ?? null,
  highestBidderNickname: event?.highestBidderNickname ?? null,
  nextMinBidAmount: event?.nextMinBidAmount ?? 10,
  revision: event?.revision ?? 0,
  bidCount: event?.type === "BID_PLACED" ? 1 : 0,
  lastEvent: event,
});

function applyEventOverlay(state: TimerLabState | null, event: TimerLabEvent | null): TimerLabState {
  const base = state ?? createStateFromEvent(event);
  if (!event?.eventId || event.revision < base.revision) return base;

  return {
    ...base,
    status: event.status,
    endsAtMs: event.endsAtMs,
    highestBidAmount: event.highestBidAmount,
    highestBidderNickname: event.highestBidderNickname,
    nextMinBidAmount: event.nextMinBidAmount,
    revision: event.revision,
    lastEvent: event,
  };
}

const formatMs = (value: number) => `${Math.max(0, Math.floor(value / 1000))}초`;

function readLabIdFromLocation() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("labId");
}

function writeLabIdToLocation(labId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("labId", labId);
  window.history.replaceState(null, "", url.toString());
}

function deserializeTimerLabState(value: unknown): TimerLabState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<TimerLabState>;
  if (data.kind !== "timer_lab") return null;

  return {
    kind: "timer_lab",
    status: data.status ?? "auction_waiting",
    itemName: data.itemName ?? "MID Player 01",
    startedAtMs: data.startedAtMs ?? null,
    endsAtMs: data.endsAtMs ?? null,
    closedAtMs: data.closedAtMs ?? null,
    highestBidAmount: data.highestBidAmount ?? null,
    highestBidderId: data.highestBidderId ?? null,
    highestBidderNickname: data.highestBidderNickname ?? null,
    nextMinBidAmount: data.nextMinBidAmount ?? 10,
    bidCount: data.bidCount ?? 0,
    revision: data.revision ?? 0,
    recentBids: Array.isArray(data.recentBids) ? data.recentBids : [],
    lastEvent: data.lastEvent ?? null,
    createdAtMs: data.createdAtMs ?? Date.now(),
    expiresAtMs: data.expiresAtMs ?? Date.now() + 24 * 60 * 60 * 1000,
  };
}

export default function AuctionTimerLabPage() {
  const [labId, setLabId] = useState<string | null>(() => readLabIdFromLocation());
  const [labState, setLabState] = useState<TimerLabState | null>(null);
  const [serverNow, setServerNow] = useState(() => Date.now());
  const [selectedParticipantId, setSelectedParticipantId] = useState(PARTICIPANTS[1].id);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<TimerLabEvent | null>(null);
  const [isPending, startTransition] = useTransition();
  const closeRequestedKeyRef = useRef<string | null>(null);
  const bidAmountInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setServerNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!labId) {
      return;
    }

    const { firestore, rtdb } = getAuctionClientServices();
    const labUnsub = onSnapshot(doc(firestore, "timerLabs", labId), (snapshot) => {
      const next = deserializeTimerLabState(snapshot.data());
      setLabState(next);
      if (next?.lastEvent) {
        setLastEvent(next.lastEvent);
      }
    });
    const eventUnsub = onValue(ref(rtdb, `timerLabSignals/${labId}/auctionEvent`), (snapshot) => {
      const event = snapshot.val() as TimerLabEvent | null;
      if (event?.eventId) {
        setLastEvent(event);
      }
    });

    return () => {
      labUnsub();
      eventUnsub();
    };
  }, [labId]);

  const selectedParticipant = useMemo(
    () => PARTICIPANTS.find((participant) => participant.id === selectedParticipantId) ?? PARTICIPANTS[1],
    [selectedParticipantId],
  );
  const effectiveState = useMemo(() => applyEventOverlay(labState, lastEvent), [labState, lastEvent]);

  useEffect(() => {
    if (!labId || !effectiveState.endsAtMs || effectiveState.status !== "auction_active") return;
    if (effectiveState.endsAtMs > serverNow) return;

    const recoveryKey = `${labId}:${effectiveState.revision}:${effectiveState.endsAtMs}`;
    if (closeRequestedKeyRef.current === recoveryKey) return;
    closeRequestedKeyRef.current = recoveryKey;

    startTransition(async () => {
      await closeExpiredTimerLab(labId);
    });
  }, [effectiveState.endsAtMs, effectiveState.revision, effectiveState.status, labId, serverNow]);

  const remainingMs = effectiveState.endsAtMs === null ? 0 : Math.max(0, effectiveState.endsAtMs - serverNow);
  const displaySeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const canBid =
    !!labId &&
    effectiveState.status === "auction_active" &&
    displaySeconds > 0 &&
    selectedParticipant.role !== "host" &&
    !isPending;
  const progressPercent =
    effectiveState.status === "auction_active"
      ? Math.max(0, Math.min(100, (remainingMs / START_DURATION_MS) * 100))
      : 0;
  const shareUrl = labId
    ? `${typeof window === "undefined" ? "" : window.location.origin}/auction-timer-lab?labId=${labId}`
    : "";

  const handleCreateLab = () => {
    setLastError(null);
    startTransition(async () => {
      const result = await createTimerLab();
      if (result.error || !result.labId) {
        setLastError(result.error ?? "타이머 랩 생성에 실패했습니다.");
        return;
      }

      setLabState(null);
      setLastEvent(null);
      closeRequestedKeyRef.current = null;
      writeLabIdToLocation(result.labId);
      setLabId(result.labId);
    });
  };

  const handleStartAuction = () => {
    if (!labId) return;
    setLastError(null);
    startTransition(async () => {
      const result = await startTimerLab(labId);
      if (result.error) {
        setLastError(result.error);
      }
    });
  };

  const handlePlaceBid = () => {
    if (!labId) return;
    const requestedAmount = Number(bidAmountInputRef.current?.value ?? effectiveState.nextMinBidAmount);
    setLastError(null);
    startTransition(async () => {
      const result = await placeTimerLabBid({
        labId,
        bidderId: selectedParticipant.id,
        bidderNickname: selectedParticipant.nickname,
        amount: requestedAmount,
      });
      if (result.error) {
        setLastError(result.error);
      }
    });
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
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
                Firebase 실시간 경매 타이머 검증
              </h1>
              <p className="max-w-3xl text-sm font-bold text-gray-700">
                `timerLabs` 전용 Firestore 정본과 `timerLabSignals` 전용 RTDB 이벤트로 같은 labId 사용자의 화면을 동기화합니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4">
              <StatusChip label="상태" value={STATUS_LABELS[effectiveState.status]} />
              <StatusChip label="REV" value={String(effectiveState.revision)} />
              <StatusChip label="최소 입찰" value={String(effectiveState.nextMinBidAmount)} />
              <StatusChip label="입찰 수" value={String(effectiveState.bidCount)} />
            </div>
          </div>
        </header>

        <section className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="font-heading text-xs text-gray-500">LAB ID</p>
              <p className="break-all text-sm font-black">{labId ?? "아직 생성되지 않음"}</p>
              {shareUrl && <p className="mt-1 break-all text-xs font-bold text-gray-500">{shareUrl}</p>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={handleCreateLab} disabled={isPending} className="pixel-button bg-minion-yellow px-4 py-3 text-sm">
                <RefreshCcw size={18} aria-hidden="true" />
                새 랩 생성
              </button>
              <button type="button" onClick={handleCopyShareUrl} disabled={!shareUrl} className="pixel-button bg-white px-4 py-3 text-sm">
                <Link2 size={18} aria-hidden="true" />
                링크 복사
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-heading text-xs text-gray-500">ITEM</p>
                <h2 className="text-2xl font-black">{effectiveState.itemName}</h2>
              </div>
              <button
                type="button"
                onClick={handleStartAuction}
                disabled={!labId || isPending}
                className="pixel-button bg-minion-yellow px-4 py-3 text-sm"
              >
                <Gavel size={18} aria-hidden="true" />
                시작
              </button>
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
                  <p className="font-heading text-xs text-gray-300">Firestore endsAt 기준</p>
                  <p className="text-2xl font-black">{formatMs(remainingMs)}</p>
                  <p className="mt-1 text-xs font-bold text-gray-400">
                    {effectiveState.endsAtMs === null ? "종료 시각 없음" : new Date(effectiveState.endsAtMs).toLocaleTimeString("ko-KR")}
                  </p>
                </div>
              </div>
              <div className="mt-5 h-5 border-2 border-white bg-gray-800">
                <div className="h-full bg-minion-yellow" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="mt-5 border-4 border-black bg-minion-yellow px-4 py-3 text-center font-heading text-xs">
              서버 액션이 endsAtMs를 갱신하고 모든 사용자는 같은 labId를 구독합니다.
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
              key={effectiveState.nextMinBidAmount}
              ref={bidAmountInputRef}
              id="bidAmount"
              type="number"
              min={effectiveState.nextMinBidAmount}
              step={BID_STEP}
              defaultValue={effectiveState.nextMinBidAmount}
              className="mt-2 w-full border-4 border-black bg-white p-3 text-2xl font-black"
            />

            <button
              type="button"
              onClick={handlePlaceBid}
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
              <StatusChip label="최고 입찰자" value={effectiveState.highestBidderNickname ?? "-"} />
              <StatusChip label="최고가" value={effectiveState.highestBidAmount === null ? "-" : String(effectiveState.highestBidAmount)} />
            </div>
          </div>
        </section>

        {effectiveState.status === "auction_closed" && (
          <section className="border-4 border-black bg-minion-yellow p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Trophy size={28} aria-hidden="true" />
                <h2 className="font-heading text-xl">낙찰 알림</h2>
              </div>
              <p className="text-lg font-black">
                {effectiveState.highestBidderNickname ?? "낙찰자 없음"} / {effectiveState.itemName} /{" "}
                {effectiveState.highestBidAmount === null ? "-" : effectiveState.highestBidAmount}
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
                      {participant.role === "host" ? "입찰 불가" : "입찰 가능"} / {STATUS_LABELS[effectiveState.status]}
                    </p>
                  </div>
                  <div className="text-right font-heading text-2xl text-minion-blue">{displaySeconds}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-4 border-black bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg">이벤트 로그</h2>
              <div className="flex items-center gap-2 text-xs font-black text-gray-500">
                <RotateCcw size={14} aria-hidden="true" />
                {lastEvent?.type ?? "NO_EVENT"}
              </div>
            </div>
            <div className="mt-4 max-h-80 overflow-y-auto custom-scrollbar border-2 border-black">
              {effectiveState.recentBids.length === 0 ? (
                <p className="p-4 text-sm font-bold text-gray-500">
                  아직 입찰 이벤트가 없습니다. 같은 링크를 다른 브라우저에서 열고 입찰해보세요.
                </p>
              ) : (
                effectiveState.recentBids.map((record) => (
                  <div key={record.id} className="border-b-2 border-black p-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black">
                        {record.bidderNickname} {record.amount}
                      </p>
                      <span className="border-2 border-black bg-minion-yellow px-2 py-1 text-xs font-black">
                        {record.timerChanged ? "8초 갱신" : "유지"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-gray-600">
                      입찰 전 남은 시간 {formatMs(record.remainingBeforeMs)} /{" "}
                      {new Date(record.createdAtMs).toLocaleTimeString("ko-KR")}
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
