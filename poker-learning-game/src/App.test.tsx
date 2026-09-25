import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const fixtures = vi.hoisted(() => ({
  settleRound: vi.fn().mockResolvedValue(null),
  trainer: {
    state: { street: 'showdown', phase: 'complete', handId: 'career-hand-1', playerCount: 6, heroNet: 37, startingStack: 100 },
    showdownResult: 'win',
    analysis: {}, difficulty: 'beginner', isAnalyzing: false,
    legalActions: null, isBotActing: false, turnStatus: 'Hand complete.', act: vi.fn(),
    newHand: vi.fn(), setPlayerCount: vi.fn(), setDifficulty: vi.fn(),
  },
  career: {
    snapshot: { availableChips: 1000, story: [] as Array<{ handId: string }> } as { availableChips: number; story: Array<{ handId: string }> } | null, operation: null, error: null,
    settleRound: vi.fn(), retry: vi.fn(), borrow: vi.fn(), repay: vi.fn(),
  },
}))

vi.mock('./hooks/usePokerTrainer', () => ({ usePokerTrainer: () => fixtures.trainer }))
vi.mock('./career/useCareer', () => ({ useCareer: () => fixtures.career }))
vi.mock('./components/PokerTrainerView', () => ({
  PokerTrainerView: ({ canStartNewHand, careerPanel }: { canStartNewHand: boolean; careerPanel: ReactNode }) => <>{careerPanel}<div data-testid="trainer" data-can-start={String(canStartNewHand)} /></>,
}))
vi.mock('./components/CareerDashboard', () => ({
  CareerDashboard: ({ modeChangeLocked }: { modeChangeLocked: boolean }) => <button type="button" disabled={modeChangeLocked}>Mode switch</button>,
}))

describe('career hand lifecycle integration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'career'), setItem: vi.fn() })
    fixtures.career.settleRound.mockReset().mockResolvedValue(null)
    fixtures.career.snapshot = { availableChips: 1000, story: [] }
    fixtures.career.operation = null
    fixtures.trainer.state = { street: 'showdown', phase: 'complete', handId: 'career-hand-1', playerCount: 6, heroNet: 37, startingStack: 100 }
    fixtures.trainer.showdownResult = 'win'
    fixtures.trainer.newHand.mockReset()
  })

  it('locks mode and next-hand controls while settling a completed career hand', async () => {
    render(<App />)

    expect((screen.getByRole('button', { name: 'Mode switch' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('trainer').getAttribute('data-can-start')).toBe('false')
    await waitFor(() => expect(fixtures.career.settleRound).toHaveBeenCalledWith('career-hand-1', 'win', 37, 100))
  })

  it('settles an early fold using its actual table-stack loss', async () => {
    fixtures.trainer.state = { street: 'preflop', phase: 'complete', handId: 'career-fold-1', playerCount: 6, heroNet: -5, startingStack: 100 }
    fixtures.trainer.showdownResult = 'loss'
    render(<App />)
    await waitFor(() => expect(fixtures.career.settleRound).toHaveBeenCalledWith('career-fold-1', 'loss', -5, 100))
  })

  it('unlocks the next hand and mode switch only after the hand appears in persisted history', () => {
    fixtures.career.snapshot = { availableChips: 1000, story: [{ handId: 'career-hand-1' }] }
    render(<App />)

    expect((screen.getByRole('button', { name: 'Mode switch' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('trainer').getAttribute('data-can-start')).toBe('true')
    expect(fixtures.career.settleRound).not.toHaveBeenCalled()
  })

  it('keeps the mode switch available when the career database did not load', () => {
    fixtures.career.snapshot = null
    render(<App />)

    expect((screen.getByRole('button', { name: 'Mode switch' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('trainer').getAttribute('data-can-start')).toBe('false')
  })

  it('keeps the mode switch available before the first 100-chip borrow', () => {
    fixtures.career.snapshot = { availableChips: 0, story: [] }
    render(<App />)

    expect((screen.getByRole('button', { name: 'Mode switch' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByTestId('trainer').getAttribute('data-can-start')).toBe('false')
  })

  it('allows a 90-chip balance to continue as a 90-chip short stack', async () => {
    fixtures.career.snapshot = { availableChips: 90, story: [{ handId: 'career-hand-1' }] }
    render(<App />)

    expect(screen.getByTestId('trainer').getAttribute('data-can-start')).toBe('true')
    await waitFor(() => expect(fixtures.trainer.newHand).toHaveBeenCalledWith(90))
  })
})
