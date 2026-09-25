import { describe, expect, it, vi } from 'vitest'
import type { Card, GameState } from '../domain/cards'
import {
  act,
  actAndAdvance,
  advanceBots,
  createNewGame,
  getBlindSeats,
  getLegalActions,
} from './gameEngine'

const heroFirstDealer = (count: number) => count === 2 ? 0 : (count - 3) % count
const playerAt = (state: GameState, seat: number) => state.players.find((player) => player.seat === seat)!

describe('dealer, blinds, and order', () => {
  it.each([2, 3, 4, 5, 6])('posts 5/10 from 100-chip stacks at a %i-player table', (count) => {
    const dealer = heroFirstDealer(count)
    const state = createNewGame(count, dealer)
    const { smallBlindSeat, bigBlindSeat } = getBlindSeats(count, dealer)
    expect(playerAt(state, smallBlindSeat)).toMatchObject({ stack: 95, streetContribution: 5, totalContribution: 5 })
    expect(playerAt(state, bigBlindSeat)).toMatchObject({ stack: 90, streetContribution: 10, totalContribution: 10 })
    expect(state).toMatchObject({ dealerSeat: dealer, pot: 15, currentBet: 10, actingSeat: 0 })
    expect(state.players.reduce((sum, player) => sum + player.stack, state.pot)).toBe(count * 100)
  })

  it('uses the available career balance as a short hero stack', () => {
    const state = createNewGame(6, 0, 90)
    const hero = state.players.find(({ isHero }) => isHero)!
    expect(state.startingStack).toBe(90)
    expect(hero.stack + hero.totalContribution).toBe(90)
    expect(state.pot).toBe(state.players.reduce((sum, player) => sum + player.totalContribution, 0))
  })

  it('uses dealer/SB first preflop and BB first postflop heads-up', () => {
    const preflop = createNewGame(2, 0)
    expect(preflop.actingSeat).toBe(0)
    const afterSmallBlindCalls = act(preflop, { type: 'call' })
    expect(afterSmallBlindCalls).toMatchObject({ street: 'preflop', actingSeat: 1 })
    const flop = act(afterSmallBlindCalls, { type: 'check' })
    expect(flop).toMatchObject({ street: 'flop', actingSeat: 1, currentBet: 0 })
    expect(flop.communityCards).toHaveLength(3)
  })
})

describe('legal actions and betting closure', () => {
  it('offers the hero fold/call/raise facing the big blind and validates raise bounds', () => {
    const state = createNewGame(2, 0)
    expect(getLegalActions(state, state.heroId)).toEqual({
      toCall: 5,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 5,
      canRaise: true,
      minRaiseTo: 20,
      maxRaiseTo: 100,
    })
    expect(() => act(state, { type: 'check' })).toThrow(/not legal/)
    expect(() => act(state, { type: 'raise', raiseTo: 19 })).toThrow(/20 through 100/)
    const raised = act(state, { type: 'raise', raiseTo: 20 })
    expect(playerAt(raised, 0)).toMatchObject({ stack: 80, streetContribution: 20, totalContribution: 20 })
    expect(raised).toMatchObject({ pot: 30, currentBet: 20, minRaise: 10, actingSeat: 1 })
  })

  it('caps raises at the smallest effective matchable total', () => {
    const base = createNewGame(3, 0)
    const state = {
      ...base,
      players: base.players.map((player) => player.seat === 1 ? { ...player, stack: 15 } : player),
    }
    const legal = getLegalActions(state)
    expect(legal).toMatchObject({ minRaiseTo: 20, maxRaiseTo: 20 })
    expect(() => act(state, { type: 'raise', raiseTo: 21 })).toThrow(/20 through 20/)
  })

  it('supports calls, checks, a full raise reopening action, and automatic street closure', () => {
    let state = createNewGame(3, 0)
    state = act(state, { type: 'call' })
    state = act(state, { type: 'call' })
    state = act(state, { type: 'check' })
    expect(state).toMatchObject({ street: 'flop', actingSeat: 1, currentBet: 0 })
    state = act(state, { type: 'check' })
    state = act(state, { type: 'check' })
    expect(state.actingSeat).toBe(0)
    state = act(state, { type: 'raise', raiseTo: 10 })
    expect(playerAt(state, 0).hasActed).toBe(true)
    expect(playerAt(state, 1).hasActed).toBe(false)
    expect(playerAt(state, 2).hasActed).toBe(false)
    state = act(state, { type: 'call' })
    state = act(state, { type: 'call' })
    expect(state).toMatchObject({ street: 'turn', currentBet: 0, actingSeat: 1 })
    expect(state.communityCards).toHaveLength(4)
  })

  it('allows a short all-in response without reopening a prior actor\'s raise option', () => {
    const base = createNewGame(3, 0)
    let state: GameState = {
      ...base,
      players: base.players.map((player) => player.seat === 1 ? { ...player, stack: 10 } : player),
    }
    state = act(state, { type: 'call' })
    expect(getLegalActions(state)).toMatchObject({ minRaiseTo: 15, maxRaiseTo: 15, canRaise: true })
    state = act(state, { type: 'raise', raiseTo: 15 })
    state = act(state, { type: 'call' })
    expect(state.actingSeat).toBe(0)
    expect(getLegalActions(state, state.heroId)).toMatchObject({ canCall: true, callAmount: 5, canRaise: false })
  })

  it('awards an early fold immediately', () => {
    const state = act(createNewGame(2, 0), { type: 'fold' })
    expect(state).toMatchObject({ phase: 'complete', pot: 0, winnerIds: [playerAt(state, 1).id], heroNet: -5, heroResult: 'loss' })
    expect(playerAt(state, 1).stack).toBe(105)
    expect(state.resultSummary).toMatchObject({ reason: 'uncontested', potAwarded: 15, winningHand: null, runnerUpIds: [], runnerUpHand: null })
    expect(state.resultSummary?.analysisBoard).toHaveLength(5)
    expect(state.resultSummary?.rankedHands.map(({ playerId }) => playerId)).toHaveLength(2)
  })

  it('requires a response to an all-in raise before running out the board', () => {
    const raised = act(createNewGame(2, 0), { type: 'raise', raiseTo: 100 })
    expect(raised).toMatchObject({ phase: 'betting', street: 'preflop', actingSeat: 1, currentBet: 100 })
    expect(playerAt(raised, 0).status).toBe('all-in')
    const result = act(raised, { type: 'call' })
    expect(result).toMatchObject({ phase: 'complete', street: 'showdown', pot: 0 })
    expect(result.communityCards).toHaveLength(5)
  })
})

describe('showdown and bots', () => {
  it('evaluates and awards a single showdown winner', () => {
    const board: Card[] = [
      { rank: '2', suit: 'clubs' }, { rank: '3', suit: 'diamonds' }, { rank: '4', suit: 'hearts' },
      { rank: '8', suit: 'spades' }, { rank: '9', suit: 'clubs' },
    ]
    const base = createNewGame(2, 0)
    const river: GameState = {
      ...base,
      street: 'river',
      communityCards: board,
      players: base.players.map((player) => ({
        ...player,
        holeCards: player.isHero
          ? [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' }]
          : [{ rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }],
        stack: 90,
        streetContribution: 0,
        totalContribution: 10,
        hasActed: false,
        status: 'active',
      })),
      pot: 20,
      currentBet: 0,
      actingSeat: 1,
      toCall: 0,
    }
    const result = act(act(river, { type: 'check' }), { type: 'check' })
    expect(result).toMatchObject({ phase: 'complete', heroResult: 'win', heroNet: 10, winnerIds: [base.heroId] })
    expect(result.players.find(({ isHero }) => isHero)?.stack).toBe(110)
    expect(result.resultSummary).toMatchObject({
      reason: 'showdown', potAwarded: 20, winnerIds: [base.heroId],
      winningHand: { categoryName: 'One pair' },
      runnerUpIds: [base.players[1].id], runnerUpHand: { categoryName: 'One pair' },
    })
  })

  it('splits a tied showdown deterministically and conserves chips', () => {
    const royalBoard: Card[] = [
      { rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' }, { rank: 'Q', suit: 'spades' },
      { rank: 'J', suit: 'spades' }, { rank: 'T', suit: 'spades' },
    ]
    const base = createNewGame(2, 0)
    const river: GameState = {
      ...base,
      street: 'river',
      communityCards: royalBoard,
      players: base.players.map((player) => ({ ...player, stack: 90, streetContribution: 0, totalContribution: 10, hasActed: false, status: 'active' })),
      pot: 20,
      currentBet: 0,
      actingSeat: 1,
      toCall: 0,
    }
    const afterFirstCheck = act(river, { type: 'check' })
    const result = act(afterFirstCheck, { type: 'check' })
    expect(result).toMatchObject({ street: 'showdown', phase: 'complete', pot: 0, heroNet: 0, heroResult: 'tie' })
    expect(result.winnerIds).toHaveLength(2)
    expect(result.players.every(({ stack, showdownHand }) => stack === 100 && showdownHand?.categoryName === 'Straight flush')).toBe(true)
    expect(result.resultSummary?.rankedHands).toHaveLength(2)
    expect(result.resultSummary?.rankedHands.every(({ rank }) => rank === 1)).toBe(true)
    expect(result.resultSummary).toMatchObject({ runnerUpIds: [], runnerUpHand: null })
  })

  it('keeps folded hands out of the official result while ranking every dealt hand for training', () => {
    const board: Card[] = [
      { rank: '2', suit: 'clubs' }, { rank: '3', suit: 'diamonds' }, { rank: '4', suit: 'hearts' },
      { rank: '8', suit: 'spades' }, { rank: '9', suit: 'clubs' },
    ]
    const base = createNewGame(3, 0)
    const hero = base.players[0]
    const eligibleRunnerUp = base.players[1]
    const foldedBest = base.players[2]
    const river: GameState = {
      ...base,
      street: 'river', communityCards: board, pot: 30, currentBet: 0, actingSeat: 1, toCall: 0,
      players: base.players.map((player) => ({
        ...player,
        holeCards: player.id === hero.id
          ? [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'diamonds' }]
          : player.id === eligibleRunnerUp.id
            ? [{ rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }]
            : [{ rank: '5', suit: 'clubs' }, { rank: '6', suit: 'clubs' }],
        stack: 90, streetContribution: 0, totalContribution: 10,
        status: player.id === foldedBest.id ? 'folded' : 'active',
        hasActed: player.id === foldedBest.id,
      })),
    }
    const result = act(act(river, { type: 'check' }), { type: 'check' })
    expect(result.resultSummary).toMatchObject({
      winnerIds: [hero.id], runnerUpIds: [eligibleRunnerUp.id],
      winningHand: { categoryName: 'One pair' }, runnerUpHand: { categoryName: 'One pair' },
    })
    expect(result.resultSummary?.rankedHands[0]).toMatchObject({ rank: 1, playerId: foldedBest.id, hand: { categoryName: 'Straight' } })
    expect(result.resultSummary?.rankedHands[1]).toMatchObject({ rank: 2, playerId: hero.id, hand: { categoryName: 'One pair' } })
    expect(result.resultSummary?.rankedHands[2]).toMatchObject({ rank: 3, playerId: eligibleRunnerUp.id, hand: { categoryName: 'One pair' } })
  })

  it('advances bots in order and always stops at hero or a terminal state', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const initial = createNewGame(4, 1)
    expect(initial.actingSeat).toBe(0)
    const resolved = actAndAdvance(initial, { type: 'call' })
    expect(resolved.phase === 'complete' || playerAt(resolved, resolved.actingSeat!).isHero).toBe(true)
    expect(advanceBots(resolved)).toBe(resolved)
    random.mockRestore()
  })
})
