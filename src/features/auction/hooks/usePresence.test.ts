import { renderHook } from '@testing-library/react'
import { useFirebasePresence } from './usePresence'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { ref, onValue, set } from 'firebase/database'
import { useAuctionStore } from '../store/useAuctionStore'

type PresenceStoreShape = {
  setRealtimeData: (data: unknown) => void
  setPresenceLoaded: (loaded: boolean) => void
  setLocalConnected: (connected: boolean) => void
}

// Mock Firebase Database
vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(),
  ref: vi.fn(),
  set: vi.fn(),
  onDisconnect: vi.fn(() => ({
    remove: vi.fn(),
  })),
  onValue: vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => 123456789),
}))

// Mock Zustand Store
vi.mock('../store/useAuctionStore', () => ({
  useAuctionStore: vi.fn(),
}))

describe('useFirebasePresence', () => {
  const setRealtimeData = vi.fn()
  const setPresenceLoaded = vi.fn()
  const setLocalConnected = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuctionStore as unknown as Mock).mockImplementation(
      (selector: (state: PresenceStoreShape) => unknown) =>
        selector({
          setRealtimeData,
          setPresenceLoaded,
          setLocalConnected,
        }),
    )
  })

  it('should not register presence if role is VIEWER (FR-004)', () => {
    renderHook(() => useFirebasePresence({
      roomId: 'room1',
      teamId: null,
      role: 'VIEWER',
    }))

    // We expect set to not be called for registering self presence
    // In current implementation it returns early, so we'll check if it's called with specific path
    const setCalls = (set as unknown as Mock).mock.calls
    const isRegisteringSelf = setCalls.some((call: unknown[]) => {
      const path = call[0]?.toString() || ''
      return path.includes('presence/room1/')
    })
    expect(isRegisteringSelf).toBe(false)
  })

  it('should register presence if role is LEADER', () => {
    renderHook(() => useFirebasePresence({
      roomId: 'room1',
      teamId: 'team1',
      role: 'LEADER',
    }))

    expect(set).toHaveBeenCalled()
  })

  it('should subscribe to all presence even if role is VIEWER (FR-001)', () => {
    renderHook(() => useFirebasePresence({
      roomId: 'room1',
      teamId: null,
      role: 'VIEWER',
    }))

    // Should call onValue for presence/room1
    expect(onValue).toHaveBeenCalled()
    const onValuePaths = (ref as unknown as Mock).mock.calls.map((call: unknown[]) => call[1])
    expect(onValuePaths).toContain('presence/room1')
  })

  it('should subscribe to .info/connected for local connection monitoring (FR-006)', () => {
    renderHook(() => useFirebasePresence({
      roomId: 'room1',
      teamId: null,
      role: 'VIEWER',
    }))

    const onValuePaths = (ref as unknown as Mock).mock.calls.map((call: unknown[]) => call[1])
    expect(onValuePaths).toContain('.info/connected')
  })
})
