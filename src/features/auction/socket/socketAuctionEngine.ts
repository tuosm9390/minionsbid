// Socket.IO hybrid 공개 입찰의 서버 권위 상태 전이를 계산한다.
import {
  EXTEND_DURATION_MS,
  EXTEND_THRESHOLD_MS,
  BID_INCREMENT,
} from '@/features/auction/constants/auctionTimings'
import type {
  BidSubmitCommand,
  SocketAuctionAcceptedEvent,
  SocketAuctionCommandResult,
  SocketAuctionRejectedEvent,
  SocketAuctionState,
} from '@/features/auction/socket/socketContracts'

type RequestCache = Map<string, SocketAuctionCommandResult>

function cloneState(state: SocketAuctionState): SocketAuctionState {
  return {
    ...state,
    currentBid: state.currentBid ? { ...state.currentBid } : null,
    teams: state.teams.map((team) => ({ ...team })),
  }
}

function eventIdFor(command: BidSubmitCommand, sequence: number) {
  return `socket-bid-${command.roomId}-${sequence}-${command.requestId}`
}

export function createSocketAuctionEngine(initialState: SocketAuctionState) {
  let state = cloneState(initialState)
  const requestCache: RequestCache = new Map()

  const reject = (
    command: BidSubmitCommand,
    reason: string,
  ): SocketAuctionRejectedEvent => ({
    type: 'bid:rejected',
    requestId: command.requestId,
    reason,
    state: cloneState(state),
  })

  return {
    getSnapshot(): SocketAuctionState {
      return cloneState(state)
    },

    sync(reason: 'JOIN' | 'RECONNECT' | 'GAP' | 'MANUAL') {
      return {
        type: 'auction:sync' as const,
        state: cloneState(state),
        reason,
      }
    },

    submitBid(command: BidSubmitCommand): SocketAuctionCommandResult {
      const cached = requestCache.get(command.requestId)
      if (cached) return cached

      if (command.roomId !== state.roomId) {
        return reject(command, '방 정보가 일치하지 않습니다.')
      }
      if (!state.currentPlayerId || state.currentPlayerId !== command.playerId) {
        return reject(command, '현재 경매 중인 선수가 아닙니다.')
      }
      if (!state.timerEndsAt) {
        return reject(command, '경매가 진행 중이지 않습니다.')
      }
      if (new Date(state.timerEndsAt).getTime() <= Date.now()) {
        return reject(command, '경매 시간이 종료되었습니다.')
      }

      const team = state.teams.find((entry) => entry.id === command.teamId)
      if (!team) return reject(command, '팀을 찾을 수 없습니다.')
      if (team.rosterSlotsUsed >= team.rosterSlotsTotal) {
        return reject(command, '팀 인원이 가득 찼습니다.')
      }
      if (state.currentBid?.teamId === command.teamId) {
        return reject(command, '현재 최고 입찰자입니다. 추가 입찰이 불가합니다.')
      }
      if (!Number.isInteger(command.amount) || command.amount <= 0) {
        return reject(command, '양의 정수 금액을 입력하세요.')
      }
      if (command.amount % BID_INCREMENT !== 0) {
        return reject(command, `${BID_INCREMENT}P 단위로 입찰해야 합니다.`)
      }

      const minBid = state.currentBid
        ? state.currentBid.amount + BID_INCREMENT
        : BID_INCREMENT
      if (command.amount < minBid) {
        return reject(command, `최소 입찰액은 ${minBid}P입니다.`)
      }
      if (team.pointBalance < command.amount) {
        return reject(command, `포인트 부족 (보유: ${team.pointBalance}P)`)
      }

      const nextSequence = state.sequence + 1
      const now = Date.now()
      const previousBid = state.currentBid
      const nextTimerEndsAt =
        new Date(state.timerEndsAt).getTime() - now <= EXTEND_THRESHOLD_MS
          ? new Date(now + EXTEND_DURATION_MS).toISOString()
          : state.timerEndsAt
      const nextBid = {
        eventId: eventIdFor(command, nextSequence),
        requestId: command.requestId,
        playerId: command.playerId,
        teamId: command.teamId,
        amount: command.amount,
        createdAt: new Date(now).toISOString(),
      }

      state = {
        ...state,
        sequence: nextSequence,
        currentBid: nextBid,
        timerEndsAt: nextTimerEndsAt,
        lastEventId: nextBid.eventId,
        serverTime: now,
        teams: state.teams.map((entry) => {
          if (entry.id === previousBid?.teamId) {
            return {
              ...entry,
              pointBalance: entry.pointBalance + previousBid.amount,
            }
          }
          if (entry.id === command.teamId) {
            return {
              ...entry,
              pointBalance: entry.pointBalance - command.amount,
            }
          }
          return entry
        }),
      }

      const accepted: SocketAuctionAcceptedEvent = {
        type: 'bid:accepted',
        requestId: command.requestId,
        eventId: nextBid.eventId,
        state: cloneState(state),
      }
      requestCache.set(command.requestId, accepted)
      return accepted
    },
  }
}
