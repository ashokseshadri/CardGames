import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePokerTrainer } from './usePokerTrainer'

describe('usePokerTrainer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('starts with six seats and can create a heads-up table without losing chips', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { result } = renderHook(() => usePokerTrainer())
    expect(result.current.state.players).toHaveLength(6)
    act(() => result.current.setPlayerCount(2))
    expect(result.current.state.players).toHaveLength(2)
    expect(result.current.state.pot).toBe(15)
    expect(result.current.state.players.reduce((sum, player) => sum + player.stack, result.current.state.pot)).toBe(200)
  })

  it('keeps sampled equity stable when only the teaching level changes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { result } = renderHook(() => usePokerTrainer())
    const sampledEquity = result.current.analysis.equity
    act(() => result.current.setDifficulty('advanced'))
    expect(result.current.analysis.equity).toBe(sampledEquity)
  })

  it('uses legal hero actions to reach exact multiway showdown analysis', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { result } = renderHook(() => usePokerTrainer())
    for (let step = 0; result.current.state.phase !== 'complete' && step < 20; step += 1) {
      const legal = result.current.legalActions
      expect(legal).not.toBeNull()
      act(() => result.current.act({ type: legal!.canCall ? 'call' : 'check' }))
    }
    expect(result.current.state.phase).toBe('complete')
    expect(result.current.state.street).toBe('showdown')
    expect(result.current.analysis.equity.simulations).toBe(1)
    expect(['win', 'tie', 'loss']).toContain(result.current.showdownResult)
    expect(result.current.state.players.every((player) => player.showdownHand)).toBe(true)
  })

  it('finishes and explains an early hero fold without pretending there was a showdown', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { result } = renderHook(() => usePokerTrainer())
    expect(result.current.legalActions?.canFold).toBe(true)
    act(() => result.current.act({ type: 'fold' }))
    expect(result.current.state.phase).toBe('complete')
    expect(result.current.showdownResult).toBe('loss')
    expect(result.current.state.heroNet).toBeLessThanOrEqual(0)
    expect(result.current.analysis.advice.reasoning.join(' ')).toMatch(/You folded|uncontested/i)
    expect(result.current.analysis.advice.reasoning.join(' ')).not.toMatch(/stronger five-card hand/i)
  })
})
