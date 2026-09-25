import { describe, expect, it, vi } from 'vitest'
import type { Card } from './cards'
import { chooseBotAction, inferOpponentReads } from './opponentModel'
import { createNewGame } from '../game/gameEngine'

const replacementCards: Card[][] = [
  [{ rank: '2', suit: 'clubs' }, { rank: '3', suit: 'diamonds' }],
  [{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }],
  [{ rank: 'T', suit: 'clubs' }, { rank: '9', suit: 'clubs' }],
  [{ rank: '4', suit: 'hearts' }, { rank: '5', suit: 'hearts' }],
  [{ rank: 'K', suit: 'diamonds' }, { rank: 'Q', suit: 'diamonds' }],
]

describe('opponent modeling', () => {
  it('normalizes each opponent holding profile', () => {
    const reads = inferOpponentReads(createNewGame(6), 'advanced')
    expect(reads).toHaveLength(5)
    reads.forEach((read) => {
      expect(read.topHoldings).toHaveLength(3)
      expect(read.topHoldings.reduce((sum, holding) => sum + holding.probability, 0)).toBeCloseTo(1, 10)
    })
  })

  it('uses starting-hand categories rather than impossible made hands preflop', () => {
    const reads = inferOpponentReads(createNewGame(6), 'beginner')
    const labels = reads.flatMap((read) => read.topHoldings.map((holding) => holding.label.toLowerCase()))
    expect(labels.some((label) => label.includes('pair') || label.includes('cards') || label.includes('holding'))).toBe(true)
    expect(labels.some((label) => label.includes('made hand'))).toBe(false)
  })

  it('uses final-hand categories rather than future draws on the river', () => {
    let state = createNewGame(6)
    state = { ...state, street: 'river' }
    const reads = inferOpponentReads(state, 'advanced')
    const labels = reads.flatMap((read) => read.topHoldings.map((holding) => holding.label.toLowerCase()))
    expect(labels.some((label) => label === 'drawing hand' || label.includes('draw or pressure') || label.includes('trap or draw'))).toBe(false)
    expect(reads.every((read) => read.modelBasis.includes('no cards or Monte Carlo samples'))).toBe(true)
  })

  it('cannot leak actual cards into inferred reads before showdown', () => {
    const original = createNewGame(6)
    const changed = {
      ...original,
      players: original.players.map((player, index) => player.isHero
        ? player
        : { ...player, holeCards: replacementCards[index - 1] }),
    }
    expect(inferOpponentReads(changed, 'intermediate')).toEqual(inferOpponentReads(original, 'intermediate'))
  })

  it('chooses only within the supplied legal bounds', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    const state = createNewGame(2, 0)
    const bot = { ...state.players[1], holeCards: replacementCards[1] }
    const choice = chooseBotAction(state, bot, {
      toCall: 10, canFold: true, canCheck: false, canCall: true, callAmount: 10,
      canRaise: true, minRaiseTo: 20, maxRaiseTo: 60,
    })
    expect(choice.type).toBe('raise')
    expect(choice.raiseTo).toBeGreaterThanOrEqual(20)
    expect(choice.raiseTo).toBeLessThanOrEqual(60)
    random.mockRestore()
  })
})
