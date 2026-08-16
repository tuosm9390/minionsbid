import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DeeplolMemberImportPanel } from '@/components/DeeplolMemberImportPanel'

const mockGetDeeplolMemberCatalog = vi.fn()
const mockSaveDeeplolParticipants = vi.fn()

vi.mock('@/features/schedules/api/scheduleActions', () => ({
  getDeeplolMemberCatalog: (...args: unknown[]) => mockGetDeeplolMemberCatalog(...args),
  saveDeeplolParticipants: (...args: unknown[]) => mockSaveDeeplolParticipants(...args),
}))

const rosterTeams = [
  {
    id: 'team-blue',
    name: 'Blue',
    leaderName: 'Captain Blue',
    captainMode: 'IN_ROSTER' as const,
    pointBalance: 0,
    players: [
      { name: 'auto-player', tier: 'Gold', mainPosition: 'Jungle', subPosition: '', soldPrice: null },
    ],
    source: 'archive' as const,
    auctionKey: 'archive:1',
    auctionName: 'Spring Split',
  },
  {
    id: 'team-red',
    name: 'Red',
    leaderName: 'Captain Red',
    captainMode: 'IN_ROSTER' as const,
    pointBalance: 0,
    players: [
      { name: 'manual-player', tier: 'Gold', mainPosition: 'Mid', subPosition: '', soldPrice: null },
    ],
    source: 'archive' as const,
    auctionKey: 'archive:1',
    auctionName: 'Spring Split',
  },
]

const members = [
  { puuId: 'puu-auto', riotName: 'auto-player', riotTag: 'KR1', teamId: null, teamName: null, position: 'Jungle' },
  { puuId: 'puu-manual', riotName: 'unmatched-player', riotTag: 'KR2', teamId: null, teamName: null, position: 'Mid' },
]

describe('DeeplolMemberImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDeeplolMemberCatalog.mockResolvedValue({ members })
    mockSaveDeeplolParticipants.mockResolvedValue({ savedCount: 2 })
  })

  it('blocks loading until the administrator is verified', async () => {
    const user = userEvent.setup()
    render(
      <DeeplolMemberImportPanel
        scheduleId="schedule-1"
        rosterTeams={rosterTeams}
        existingParticipants={[]}
        adminCode="secret"
        isAdminVerified={false}
        onSaved={vi.fn(async () => undefined)}
      />,
    )

    expect(screen.getByTestId('deeplol-member-import-open')).toBeDisabled()
    expect(mockGetDeeplolMemberCatalog).not.toHaveBeenCalled()
    expect(user).toBeDefined()
  })

  it('shows a friendly error and retries after Deeplol member loading fails', async () => {
    const user = userEvent.setup()
    mockGetDeeplolMemberCatalog
      .mockRejectedValueOnce(new Error('Deeplol HTTP 503: service unavailable'))
      .mockResolvedValueOnce({ members })

    render(
      <DeeplolMemberImportPanel
        scheduleId="schedule-1"
        rosterTeams={rosterTeams}
        existingParticipants={[]}
        adminCode="secret"
        isAdminVerified
        onSaved={vi.fn(async () => undefined)}
      />,
    )

    await user.click(screen.getByTestId('deeplol-member-import-open'))
    await waitFor(() => expect(screen.getByTestId('deeplol-member-import-error')).toHaveTextContent('Deeplol 서버에서 오류가 발생했습니다.'))
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.getByText(/2명의 Deeplol 구성원을 불러왔습니다/)).toBeInTheDocument())
    expect(mockGetDeeplolMemberCatalog).toHaveBeenCalledTimes(2)
  })

  it('loads members, auto-maps a unique roster match, and saves reviewed teams', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn(async () => undefined)
    render(
      <DeeplolMemberImportPanel
        scheduleId="schedule-1"
        rosterTeams={rosterTeams}
        existingParticipants={[]}
        adminCode="secret"
        isAdminVerified
        onSaved={onSaved}
      />,
    )

    await user.click(screen.getByTestId('deeplol-member-import-open'))
    await waitFor(() => expect(mockGetDeeplolMemberCatalog).toHaveBeenCalledWith('schedule-1', 'secret'))

    expect(screen.getByText(/2명의 Deeplol 구성원을 불러왔습니다/)).toBeInTheDocument()
    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toHaveValue('team-blue')
    expect(selects[1]).toHaveValue('')

    await user.selectOptions(selects[1], 'team-red')
    await user.click(screen.getByTestId('deeplol-member-import-save'))

    await waitFor(() => expect(mockSaveDeeplolParticipants).toHaveBeenCalledWith(
      'schedule-1',
      [
        expect.objectContaining({ puuId: 'puu-auto', teamId: 'team-blue', teamName: 'Blue' }),
        expect.objectContaining({ puuId: 'puu-manual', teamId: 'team-red', teamName: 'Red' }),
      ],
      'secret',
    ))
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/2명의 PUUID 매핑을 저장했습니다/)).toBeInTheDocument()
  })
})
