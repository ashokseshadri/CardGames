import { describe, expect, it } from 'vitest'
import { constrainAdviceToLegalActions, getCoachingAdvice } from './coach'

const equity = (value: number) => ({ equity: value, win: value, tie: 0, loss: 1 - value, simulations: 2500 })

describe('getCoachingAdvice', () => {
  it('folds weak equity facing an expensive call', () => {
    const advice = getCoachingAdvice({ equity: equity(0.2), hand: null, draws: [], pot: 30, toCall: 30, difficulty: 'beginner', street: 'flop', opponentCount: 2 })
    expect(advice.action).toBe('fold')
    expect(advice.potOdds).toBe(0.5)
  })

  it('checks rather than folds when there is no price to continue', () => {
    const advice = getCoachingAdvice({ equity: equity(0.2), hand: null, draws: [], pot: 30, toCall: 0, difficulty: 'intermediate', street: 'flop', opponentCount: 2 })
    expect(advice.action).toBe('check')
  })

  it('adds simulation limitations in advanced mode', () => {
    const advice = getCoachingAdvice({ equity: equity(0.7), hand: null, draws: [], pot: 60, toCall: 10, difficulty: 'advanced', street: 'turn', opponentCount: 3 })
    expect(advice.action).toBe('raise')
    expect(advice.reasoning.join(' ')).toMatch(/uniform random/)
  })

  it('does not promise another card when checking the river', () => {
    const advice = getCoachingAdvice({ equity: equity(0.2), hand: null, draws: [], pot: 30, toCall: 0, difficulty: 'beginner', street: 'river', opponentCount: 2 })
    expect(advice.headline).toBe('Check and reach showdown')
    expect(advice.reasoning.join(' ')).toMatch(/board is complete/i)
    expect(`${advice.headline} ${advice.reasoning.join(' ')}`).not.toMatch(/see the next card|next cards may/i)
  })

  it('never recommends a raise when the effective stack allows only calling or folding', () => {
    const theoretical = getCoachingAdvice({ equity: equity(0.9), hand: null, draws: [], pot: 180, toCall: 20, difficulty: 'advanced', street: 'turn', opponentCount: 1 })
    expect(theoretical.action).toBe('raise')
    const adjusted = constrainAdviceToLegalActions(theoretical, {
      toCall: 20, canFold: true, canCheck: false, canCall: true, callAmount: 20,
      canRaise: false, minRaiseTo: 0, maxRaiseTo: 0,
    })
    expect(adjusted.action).toBe('call')
    expect(adjusted.reasoning[0]).toMatch(/not legal|betting rules/i)
  })
})
