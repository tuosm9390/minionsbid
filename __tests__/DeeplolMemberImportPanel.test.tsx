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

  it('uses the Riot name and tag for an exact automatic match', async () => {
    const user = userEvent.setup()
    const taggedRosterTeams = rosterTeams.map((team) => team.id === 'team-blue'
      ? { ...team, players: [{ ...team.players[0], name: ' auto player ＃ KR1 ' }] }
      : team)
    render(
      <DeeplolMemberImportPanel
        scheduleId="schedule-1"
        rosterTeams={taggedRosterTeams}
        existingParticipants={[]}
        adminCode="secret"
        isAdminVerified
        onSaved={vi.fn(async () => undefined)}
      />,
    )

    await user.click(screen.getByTestId('deeplol-member-import-open'))
    await waitFor(() => expect(screen.getByText('이름+태그 자동 매칭')).toBeInTheDocument())
    expect(screen.getByLabelText('auto-player 팀')).toHaveValue('team-blue')
  })

  it('filters unmatched members and assigns selected rows to a team in bulk', async () => {
    const user = userEvent.setup()
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
    await waitFor(() => expect(screen.getByText(/2명의 Deeplol 구성원을 불러왔습니다/)).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('매핑 상태 필터'), 'UNMATCHED')
    expect(screen.getAllByText('unmatched-player#KR2').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('checkbox', { name: /unmatched-player#KR2/ }))
    await user.selectOptions(screen.getByLabelText('일괄 배정 팀'), 'team-red')
    await user.click(screen.getByRole('button', { name: '선택 팀 일괄 배정' }))
    await user.selectOptions(screen.getByLabelText('매핑 상태 필터'), 'ALL')
    expect(screen.getByLabelText('unmatched-player 팀')).toHaveValue('team-red')
    expect(screen.getByText(/선택된 구성원을 Red에 일괄 배정했습니다/)).toBeInTheDocument()
  })

  it('syncs missing roster slots with automatic and manual PUUID assignments', async () => {
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
    await waitFor(() => expect(screen.getByTestId('deeplol-roster-sync-panel')).toBeInTheDocument())
    expect(screen.getByText(/미확보 선수 2명/)).toBeInTheDocument()

    await user.click(screen.getByTestId('deeplol-roster-auto-assign'))
    expect(screen.getByLabelText('auto-player Deeplol 구성원')).toHaveValue('puu-auto')

    await user.selectOptions(screen.getByLabelText('manual-player Deeplol 구성원'), 'puu-manual')
    await user.click(screen.getByTestId('deeplol-roster-sync'))

    await waitFor(() => expect(mockSaveDeeplolParticipants).toHaveBeenCalledWith(
      'schedule-1',
      [
        expect.objectContaining({ puuId: 'puu-auto', teamId: 'team-blue', teamName: 'Blue' }),
        expect.objectContaining({ puuId: 'puu-manual', teamId: 'team-red', teamName: 'Red' }),
      ],
      'secret',
    ))
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/2명의 로스터 PUUID 상태를 동기화했습니다/)).toBeInTheDocument()
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
    const autoTeamSelect = screen.getByLabelText('auto-player 팀')
    const manualTeamSelect = screen.getByLabelText('unmatched-player 팀')
    expect(autoTeamSelect).toHaveValue('team-blue')
    expect(manualTeamSelect).toHaveValue('')

    await user.selectOptions(manualTeamSelect, 'team-red')
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
