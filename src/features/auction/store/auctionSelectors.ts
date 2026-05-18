import { getAuctionSlotsPerTeam, type CaptainMode } from '@/features/auction/utils/roster'
import type { Message, Player, Team } from '@/features/auction/store/useAuctionStore'

export function selectIsReAuctionRound(state: { nextAuctionDurationMs: number | null }): boolean {
  return state.nextAuctionDurationMs !== null
}

export interface AuctionPlayerBuckets {
  currentPlayer: Player | null
  waitingPlayers: Player[]
  soldPlayers: Player[]
  unsoldPlayers: Player[]
  soldCountByTeam: Map<string, number>
  soldPlayersByTeam: Map<string, Player[]>
  playersById: Map<string, Player>
}

const MAX_STORED_MESSAGES = 200

function getMessageKey(message: Message) {
  return message.event_id ?? message.id
}

export function bucketAuctionPlayers(
  players: Player[],
  currentPlayerId?: string | null,
): AuctionPlayerBuckets {
  const waitingPlayers: Player[] = []
  const soldPlayers: Player[] = []
  const unsoldPlayers: Player[] = []
  const soldCountByTeam = new Map<string, number>()
  const soldPlayersByTeam = new Map<string, Player[]>()
  const playersById = new Map<string, Player>()

  let currentPlayer: Player | null = null
  let fallbackCurrentPlayer: Player | null = null

  const sortedPlayers = [...players].sort((a, b) => (b.order ?? 0) - (a.order ?? 0))

  for (const player of sortedPlayers) {
    playersById.set(player.id, player)
    if (
      currentPlayerId &&
      player.id === currentPlayerId &&
      player.status === 'IN_AUCTION'
    ) {
      currentPlayer = player
    } else if (!fallbackCurrentPlayer && player.status === 'IN_AUCTION') {
      fallbackCurrentPlayer = player
    }

    if (player.status === 'WAITING') {
      waitingPlayers.push(player)
      continue
    }

    if (player.status === 'UNSOLD') {
      unsoldPlayers.push(player)
      continue
    }

    if (player.status === 'SOLD') {
      soldPlayers.push(player)
      if (player.team_id) {
        soldCountByTeam.set(player.team_id, (soldCountByTeam.get(player.team_id) ?? 0) + 1)
        const teamPlayers = soldPlayersByTeam.get(player.team_id)
        if (teamPlayers) {
          teamPlayers.push(player)
        } else {
          soldPlayersByTeam.set(player.team_id, [player])
        }
      }
    }
  }

  return {
    currentPlayer: currentPlayer ?? fallbackCurrentPlayer,
    waitingPlayers,
    soldPlayers,
    unsoldPlayers,
    soldCountByTeam,
    soldPlayersByTeam,
    playersById,
  }
}

export function findCurrentAuctionPlayerId(players: Player[]) {
  for (const player of players) {
    if (player.status === 'IN_AUCTION') {
      return player.id
    }
  }
  return null
}

export function buildTeamMap(teams: Team[]) {
  const teamMap = new Map<string, Team>()
  for (const team of teams) {
    teamMap.set(team.id, team)
  }
  return teamMap
}

export function isAuctionRoomComplete(args: {
  teamIds: string[]
  soldCountByTeam: Map<string, number>
  membersPerTeam: number
  captainMode: CaptainMode
}) {
  const requiredSlots = getAuctionSlotsPerTeam(args.membersPerTeam, args.captainMode)
  return (
    args.teamIds.length > 0 &&
    args.teamIds.every((teamId) => (args.soldCountByTeam.get(teamId) ?? 0) === requiredSlots)
  )
}

export function buildOrderedMessageState(messages: Message[]) {
  const recentMessages = messages.slice(-MAX_STORED_MESSAGES)
  const messagesById: Record<string, Message> = {}
  const orderedMessageIds: string[] = []

  for (const message of recentMessages) {
    const key = getMessageKey(message)
    messagesById[key] = message
    orderedMessageIds.push(key)
  }

  return {
    messagesById,
    orderedMessageIds,
  }
}

export function appendOrderedMessage(args: {
  messagesById: Record<string, Message>
  orderedMessageIds: string[]
  message: Message
}) {
  const key = getMessageKey(args.message)
  const nextById = {
    ...args.messagesById,
    [key]: args.message,
  }
  const withoutExisting = args.orderedMessageIds.filter((id) => id !== key)
  const nextIds = [...withoutExisting, key].slice(-MAX_STORED_MESSAGES)

  if (nextIds.length === MAX_STORED_MESSAGES && !nextIds.includes(key)) {
    delete nextById[key]
  }

  for (const id of Object.keys(nextById)) {
    if (!nextIds.includes(id)) {
      delete nextById[id]
    }
  }

  return {
    messagesById: nextById,
    orderedMessageIds: nextIds,
  }
}

export function removeOrderedMessage(args: {
  messagesById: Record<string, Message>
  orderedMessageIds: string[]
  messageId: string
}) {
  const targetId = args.messageId
  const targetKey =
    args.orderedMessageIds.find((id) => {
      const message = args.messagesById[id]
      return id === targetId || message?.id === targetId || message?.event_id === targetId
    }) ?? targetId

  const nextById = { ...args.messagesById }
  delete nextById[targetKey]

  return {
    messagesById: nextById,
    orderedMessageIds: args.orderedMessageIds.filter((id) => id !== targetKey),
  }
}

export function selectOrderedMessages(
  messagesById: Record<string, Message>,
  orderedMessageIds: string[],
) {
  return orderedMessageIds
    .map((id) => messagesById[id])
    .filter((message): message is Message => !!message)
}

export function findLatestNotice(
  messagesById: Record<string, Message>,
  orderedMessageIds: string[],
) {
  for (let i = orderedMessageIds.length - 1; i >= 0; i -= 1) {
    const message = messagesById[orderedMessageIds[i]]
    if (message?.sender_role === 'NOTICE') {
      return message
    }
  }
  return null
}
