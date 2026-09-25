import { describe, expect, it, vi } from 'vitest'
import type { Card } from './cards'
import { analyzeDraws, estimateEquity, estimateMultiwayEquity } from './equity'

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('estimateEquity', () => {
  it('ties every simulation when the board itself is an unbeatable royal flush', () => {
    const equity = estimateEquity(
      [card('2', 'clubs'), card('3', 'diamonds')],
      [card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'), card('T', 'spades')],
      30,
    )
    expect(equity).toMatchObject({ equity: 0.5, win: 0, tie: 1, loss: 0, simulations: 30 })
  })

  it('rejects duplicate visible cards', () => {
    expect(() => estimateEquity([card('A', 'spades'), card('A', 'spades')], [], 5)).toThrow(/unique/)
  })
})

describe('estimateMultiwayEquity', () => {
  it('splits a board-only royal flush across hero and every opponent', () => {
    const result = estimateMultiwayEquity(
      [card('2', 'clubs'), card('3', 'diamonds')],
      [card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'), card('T', 'spades')],
      3,
      20,
    )
    expect(result).toMatchObject({ equity: 0.25, win: 0, tie: 1, loss: 0 })
  })

  it('is isolated from actual opponent cards by API and repeatable sampling behavior', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.371)
    const hero = [card('A', 'clubs'), card('K', 'clubs')]
    const board = [card('Q', 'clubs'), card('7', 'diamonds'), card('2', 'spades')]
    const first = estimateMultiwayEquity(hero, board, 4, 25)
    const second = estimateMultiwayEquity(hero, board, 4, 25)
    expect(first).toEqual(second)
    expect(estimateMultiwayEquity.length).toBe(3)
    random.mockRestore()
  })

  it('supports every possible number of active opponents', () => {
    for (let opponents = 1; opponents <= 5; opponents += 1) {
      const result = estimateMultiwayEquity([card('A', 'clubs'), card('A', 'diamonds')], [], opponents, 5)
      expect(result.win + result.tie + result.loss).toBeCloseTo(1, 10)
    }
  })
})

describe('analyzeDraws', () => {
  it('reports nine flush improvement cards without calling them guaranteed outs', () => {
    const draws = analyzeDraws(
      [card('A', 'hearts'), card('K', 'hearts')],
      [card('2', 'hearts'), card('7', 'hearts'), card('Q', 'clubs')],
    )
    const flush = draws.find(({ label }) => label.includes('Flush'))
    expect(flush?.outs).toBe(9)
    expect(flush?.label).toContain('improvement cards')
  })

  it('reports eight cards for a clean open-ended straight draw', () => {
    const draws = analyzeDraws(
      [card('8', 'clubs'), card('9', 'diamonds')],
      [card('6', 'hearts'), card('7', 'spades'), card('A', 'clubs')],
    )
    expect(draws.find(({ label }) => label.includes('Open-ended'))?.outs).toBe(8)
  })

  it('stops reporting next-card draws on the river', () => {
    expect(analyzeDraws(
      [card('A', 'hearts'), card('K', 'hearts')],
      [card('2', 'hearts'), card('7', 'hearts'), card('Q', 'clubs'), card('4', 'clubs'), card('5', 'clubs')],
    )).toEqual([])
  })

  it('does not count cards that leave an existing full house unchanged', () => {
    const draws = analyzeDraws(
      [card('A', 'spades'), card('A', 'hearts')],
      [card('A', 'clubs'), card('K', 'clubs'), card('K', 'diamonds')],
    )
    expect(draws.find(({ label }) => label.includes('Three-of-a-kind'))).toBeUndefined()
    expect(draws.find(({ label }) => label.includes('quads'))?.cards).toEqual([card('A', 'diamonds')])
  })
})
