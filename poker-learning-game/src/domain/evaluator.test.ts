import { describe, expect, it } from 'vitest'
import type { Card } from './cards'
import { compareHands, evaluateBestHand } from './evaluator'

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit })

describe('evaluateBestHand', () => {
  it('selects a royal flush from seven cards', () => {
    const hand = evaluateBestHand([
      card('A', 'spades'), card('K', 'spades'), card('Q', 'spades'), card('J', 'spades'),
      card('T', 'spades'), card('2', 'hearts'), card('2', 'clubs'),
    ])
    expect(hand?.category).toBe(8)
    expect(hand?.tiebreakers).toEqual([14])
  })

  it('recognizes an ace-low straight', () => {
    const hand = evaluateBestHand([
      card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs'),
      card('4', 'diamonds'), card('5', 'spades'),
    ])
    expect(hand?.categoryName).toBe('Straight')
    expect(hand?.tiebreakers).toEqual([5])
  })

  it('uses all kickers to compare equal pairs', () => {
    const queensAce = evaluateBestHand([
      card('Q', 'spades'), card('Q', 'hearts'), card('A', 'clubs'), card('8', 'diamonds'), card('4', 'spades'),
    ])
    const queensKing = evaluateBestHand([
      card('Q', 'clubs'), card('Q', 'diamonds'), card('K', 'spades'), card('J', 'hearts'), card('9', 'clubs'),
    ])
    expect(queensAce && queensKing && compareHands(queensAce, queensKing)).toBe(1)
  })

  it('returns null before five cards are available', () => {
    expect(evaluateBestHand([card('A', 'spades'), card('A', 'hearts')])).toBeNull()
  })
})
