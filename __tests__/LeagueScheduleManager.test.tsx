import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LeagueScheduleManager } from '@/components/LeagueScheduleManager'

const mockGetLeagueScheduleCatalog = vi.fn()
const mockGetLeagueScheduleTimeline = vi.fn()
const mockVerifyScheduleAdminCode = vi.fn()
const mockCreateLeagueSchedule = vi.fn()
const mockSaveLeagueScheduleDay = vi.fn()
const mockRegisterLeagueMatchResult = vi.fn()
const mockDeleteLeagueSchedule = vi.fn()
const mockCompleteLeagueSchedule = vi.fn()

vi.mock('@/features/schedules/api/scheduleActions', () => ({
  getLeagueScheduleCatalog: (...args: unknown[]) => mockGetLeagueScheduleCatalog(...args),
  getLeagueScheduleTimeline: (...args: unknown[]) => mockGetLeagueScheduleTimeline(...args),
  verifyScheduleAdminCode: (...args: unknown[]) => mockVerifyScheduleAdminCode(...args),
  createLeagueSchedule: (...args: unknown[]) => mockCreateLeagueSchedule(...args),
  saveLeagueScheduleDay: (...args: unknown[]) => mockSaveLeagueScheduleDay(...args),
  registerLeagueMatchResult: (...args: unknown[]) => mockRegisterLeagueMatchResult(...args),
  deleteLeagueSchedule: (...args: unknown[]) => mockDeleteLeagueSchedule(...args),
  completeLeagueSchedule: (...args: unknown[]) => mockCompleteLeagueSchedule(...args),
}))

vi.mock('@/components/ScheduleCalendar', () => ({
  formatDateKey: (date: Date) => {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },
  ScheduleCalendar: ({
    label,
    selectedDate,
    onChange,
  }: {
    label: string
    selectedDate: Date
    onChange: (date: Date) => void
  }) => {
    const year = selectedDate.getFullYear()
    const month = `${selectedDate.getMonth() + 1}`.padStart(2, '0')
    const day = `${selectedDate.getDate()}`.padStart(2, '0')
    return (
      <div>
        <p>{label}</p>
        <p data-testid={`calendar-${label}`}>{`${year}-${month}-${day}`}</p>
        <button type="button" onClick={() => onChange(new Date('2026-06-19T00:00:00'))}>
          change {label}
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/ScheduleMatchDayEditor', () => ({
  ScheduleMatchDayEditor: ({
    adminCode,
    isVerifyingAdmin,
    isSavingTimeline,
    timelineError,
    onAdminCodeChange,
    onVerifyAdminCode,
    onSaveDay,
  }: {
    adminCode: string
    isVerifyingAdmin: boolean
    isSavingTimeline: boolean
    timelineError: string
    onAdminCodeChange: (value: string) => void
    onVerifyAdminCode: () => void
    onSaveDay: () => void
  }) => (
    <div>
      <input
        aria-label="mock-admin-code"
        value={adminCode}
        onChange={(event) => onAdminCodeChange(event.target.value)}
      />
      <button type="button" onClick={onVerifyAdminCode}>
        {isVerifyingAdmin ? 'verifying' : 'verify'}
      </button>
      <button type="button" onClick={onSaveDay}>
        {isSavingTimeline ? 'saving-day' : 'save-day'}
      </button>
      {timelineError ? <p>{timelineError}</p> : null}
    </div>
  ),
}))

vi.mock('@/components/ScheduleRosterPanel', () => ({
  ScheduleRosterPanel: () => <div>Roster Panel</div>,
}))

vi.mock('@/components/LeagueRecordSummaryPanel', () => ({
  LeagueRecordSummaryPanel: () => <div>Record Panel</div>,
}))

const baseTimeline = {
  schedule: {
    id: 'schedule-1',
    name: 'Spring Split',
    linkedAuctionId: 'archive-1',
    linkedLeagueName: '2026 스프링',
    rosterSourceType: 'archive' as const,
    rosterSourceId: 'archive-1',
    startsAt: '2026-04-27T00:00:00.000Z',
    endsAt: '2026-04-30T00:00:00.000Z',
    notes: '메모',
    createdAt: '2026-04-27T00:00:00.000Z',
    status: 'ACTIVE' as const,
    completedAt: null,
    championTeamName: null,
  },
  days: [],
  rosterTeams: [
    {
      id: 'team-1',
      name: 'Blue',
      leaderName: 'Captain Blue',
      captainMode: 'IN_ROSTER',
      pointBalance: 0,
      players: [],
      source: 'archive' as const,
      auctionKey: 'archive:1',
      auctionName: '2026 스프링',
    },
  ],
  availableTeamNames: ['Blue'],
  nextMatches: [],
}

const secondTimeline = {
  ...baseTimeline,
  schedule: {
    ...baseTimeline.schedule,
    id: 'schedule-2',
    name: 'Summer Split',
    linkedAuctionId: 'archive-2',
    linkedLeagueName: '2026 서머',
    rosterSourceId: 'archive-2',
    startsAt: '2026-05-05T00:00:00.000Z',
    endsAt: '2026-05-10T00:00:00.000Z',
  },
  days: [],
}

describe('LeagueScheduleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-18T09:00:00.000Z'))
    vi.clearAllMocks()
    mockGetLeagueScheduleCatalog.mockResolvedValue({
      leagueOptions: [
        { id: 'archive-1', name: '2026 스프링', closedAt: '2026-04-01T00:00:00.000Z' },
        { id: 'archive-2', name: '2026 서머', closedAt: '2026-05-01T00:00:00.000Z' },
      ],
      schedules: [baseTimeline.schedule, secondTimeline.schedule],
    })
    mockGetLeagueScheduleTimeline.mockImplementation((scheduleId: string) =>
      Promise.resolve(scheduleId === 'schedule-2' ? secondTimeline : baseTimeline),
    )
    mockVerifyScheduleAdminCode.mockResolvedValue({ valid: true })
    mockCreateLeagueSchedule.mockResolvedValue({})
    mockSaveLeagueScheduleDay.mockResolvedValue({})
    mockRegisterLeagueMatchResult.mockResolvedValue({})
    mockDeleteLeagueSchedule.mockResolvedValue({})
    mockCompleteLeagueSchedule.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads catalog first and then timeline for the selected schedule', async () => {
    render(<LeagueScheduleManager />)

    await waitFor(() => {
      expect(mockGetLeagueScheduleCatalog).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-1')
    })

    expect(screen.getAllByText('Spring Split').length).toBeGreaterThan(0)
  })

  it('verifies admin code and reloads catalog plus timeline after completion', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LeagueScheduleManager />)

    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-1')
    })

    await user.type(screen.getByLabelText('mock-admin-code'), 'secret-code')
    await user.click(screen.getByRole('button', { name: 'verify' }))

    await waitFor(() => {
      expect(mockVerifyScheduleAdminCode).toHaveBeenCalledWith('secret-code')
    })

    await user.click(screen.getByRole('button', { name: /일정 종료/i }))
    await user.selectOptions(screen.getByRole('combobox'), 'Blue')
    await user.click(screen.getByRole('button', { name: /종료 및 등록/i }))

    await waitFor(() => {
      expect(mockCompleteLeagueSchedule).toHaveBeenCalledWith({
        scheduleId: 'schedule-1',
        championTeamName: 'Blue',
        adminCode: 'secret-code',
      })
    })
    await waitFor(() => {
      expect(mockGetLeagueScheduleCatalog).toHaveBeenCalledTimes(2)
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledTimes(2)
    })
  })

  it('restores save-day button state and surfaces an error when save fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockSaveLeagueScheduleDay.mockRejectedValueOnce(new Error('save exploded'))

    render(<LeagueScheduleManager />)

    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-1')
    })

    await user.click(screen.getByRole('button', { name: 'save-day' }))

    await waitFor(() => {
      expect(screen.getByText('save exploded')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'save-day' })).toBeInTheDocument()
  })

  it('defaults each selected schedule to today before saving', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LeagueScheduleManager />)

    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-1')
    })

    await user.click(screen.getByRole('button', { name: /Summer Split/i }))
    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-2')
    })
    expect(screen.getByTestId('calendar-Match Days')).toHaveTextContent('2026-06-18')

    await user.click(screen.getByRole('button', { name: 'save-day' }))

    await waitFor(() => {
      expect(mockSaveLeagueScheduleDay).toHaveBeenCalledWith(
        'schedule-2',
        expect.objectContaining({ dateKey: '2026-06-18' }),
        undefined,
      )
    })
  })

  it('keeps the selected date after saving a match day', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LeagueScheduleManager />)

    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledWith('schedule-1')
    })
    await waitFor(() => {
      expect(screen.getByTestId('calendar-Match Days')).toHaveTextContent('2026-06-18')
    })

    fireEvent.click(screen.getByRole('button', { name: 'change Match Days' }))
    await waitFor(() => {
      expect(screen.getByTestId('calendar-Match Days')).toHaveTextContent('2026-06-19')
    })
    await user.click(screen.getByRole('button', { name: 'save-day' }))

    await waitFor(() => {
      expect(mockSaveLeagueScheduleDay).toHaveBeenCalledWith(
        'schedule-1',
        expect.objectContaining({ dateKey: '2026-06-19' }),
        undefined,
      )
    })
    await waitFor(() => {
      expect(mockGetLeagueScheduleTimeline).toHaveBeenCalledTimes(2)
    })
    expect(screen.getByTestId('calendar-Match Days')).toHaveTextContent('2026-06-19')
  })
})
