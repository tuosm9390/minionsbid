import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ScheduleMatchDayEditor,
  type MatchEditorRow,
} from '@/components/ScheduleMatchDayEditor'
import type { LeagueRosterTeam } from '@/features/schedules/types'

const rosterTeams: LeagueRosterTeam[] = [
  {
    id: 'team-1',
    name: 'Blue',
    leaderName: 'Captain Blue',
    captainMode: 'IN_ROSTER',
    pointBalance: 0,
    players: [],
    source: 'room',
    auctionKey: 'room:1',
    auctionName: 'Room One',
  },
  {
    id: 'team-2',
    name: 'Red',
    leaderName: 'Captain Red',
    captainMode: 'IN_ROSTER',
    pointBalance: 0,
    players: [],
    source: 'room',
    auctionKey: 'room:1',
    auctionName: 'Room One',
  },
  {
    id: 'team-3',
    name: 'Gold',
    leaderName: 'Captain Gold',
    captainMode: 'IN_ROSTER',
    pointBalance: 0,
    players: [],
    source: 'room',
    auctionKey: 'room:2',
    auctionName: 'Room Two',
  },
]

const baseRow: MatchEditorRow = {
  id: 'match-1',
  startsAt: '19:00',
  homeTeamName: 'Blue',
  awayTeamName: 'Red',
  stageLabel: '조별리그',
  winsToClinch: 2,
  maxGames: 3,
  setLogs: [],
  homeScore: 0,
  awayScore: 0,
  winner: 'PENDING',
  note: '',
  isCompleted: false,
}

function renderEditor(overrides?: Partial<ComponentProps<typeof ScheduleMatchDayEditor>>) {
  const props: ComponentProps<typeof ScheduleMatchDayEditor> = {
    selectedDateLabel: '4월 27일 일요일',
    rows: [baseRow],
    rosterTeams,
    adminCode: '',
    isAdminVerified: false,
    isVerifyingAdmin: false,
    timelineError: '',
    isSavingTimeline: false,
    isSubmittingResultId: null,
    isScheduleCompleted: false,
    onAdminCodeChange: vi.fn(),
    onVerifyAdminCode: vi.fn(),
    onRowChange: vi.fn(),
    onAddRow: vi.fn(),
    onRemoveRow: vi.fn(),
    onSaveDay: vi.fn(),
    onSaveResult: vi.fn(),
    ...overrides,
  }

  render(<ScheduleMatchDayEditor {...props} />)
  return props
}

describe('ScheduleMatchDayEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls admin code change and verify handlers explicitly', async () => {
    const user = userEvent.setup()
    const props = renderEditor({ adminCode: 'sec' })

    await user.clear(screen.getByPlaceholderText(/일정 저장, 결과 등록, 종료, 삭제에 필요/i))
    await user.type(
      screen.getByPlaceholderText(/일정 저장, 결과 등록, 종료, 삭제에 필요/i),
      'secret-code',
    )
    await user.click(screen.getByRole('button', { name: /코드 확인/i }))

    expect(props.onAdminCodeChange).toHaveBeenCalled()
    expect(props.onVerifyAdminCode).toHaveBeenCalledTimes(1)
  })

  it('locks editing controls for completed schedules until admin verification succeeds', () => {
    renderEditor({
      isScheduleCompleted: true,
      isAdminVerified: false,
    })

    expect(screen.getByRole('button', { name: /경기 추가/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /날짜 경기 저장/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /결과 등록/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /경기 삭제/i })).toBeDisabled()
    expect(screen.getByText(/완료된 일정입니다. 결과와 경기 편집은 잠겨 있습니다./)).toBeInTheDocument()
  })

  it('filters opponent team options to the same auction group', () => {
    renderEditor({
      rows: [
        {
          ...baseRow,
          homeTeamName: 'Blue',
          awayTeamName: '',
        },
      ],
    })

    const awaySelect = screen.getByDisplayValue('원정팀 선택')
    const optionValues = Array.from((awaySelect as HTMLSelectElement).options).map(
      (option) => option.value,
    )
    expect(optionValues).toContain('Red')
    expect(optionValues).not.toContain('Gold')
  })

  it('adds a set log row through onRowChange and trims to max games', async () => {
    const user = userEvent.setup()
    const onRowChange = vi.fn()
    renderEditor({
      onRowChange,
      rows: [
        {
          ...baseRow,
          setLogs: [
            { winner: 'HOME', note: '1세트' },
            { winner: 'AWAY', note: '2세트' },
          ],
          maxGames: 3,
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: /세트 추가/i }))

    expect(onRowChange).toHaveBeenCalledWith(0, {
      setLogs: [
        { winner: 'HOME', note: '1세트' },
        { winner: 'AWAY', note: '2세트' },
        { winner: 'HOME', note: '' },
      ],
    })
  })

  it('submits results through onSaveResult for the selected row', async () => {
    const user = userEvent.setup()
    const onSaveResult = vi.fn()
    renderEditor({ onSaveResult })

    await user.click(screen.getByRole('button', { name: /결과 등록/i }))

    expect(onSaveResult).toHaveBeenCalledWith(baseRow)
  })
})
