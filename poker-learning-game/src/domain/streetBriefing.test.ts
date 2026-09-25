import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeDraws } from './equity'
import { evaluateBestHand } from './evaluator'
import { inferOpponentReads } from './opponentModel'
import { buildStreetBriefing } from './streetBriefing'
import { actAndAdvance, createNewGame, getLegalActions } from '../game/gameEngine'

const advanceTo = (target: 'flop' | 'river' | 'showdown') => {
  let state = createNewGame(6)
  for (let guard = 0; state.street !== target && state.phase !== 'complete' && guard < 20; guard += 1) {
    const legal = getLegalActions(state, state.heroId)
    state = actAndAdvance(state, { type: legal.canCall ? 'call' : 'check' })
  }
  return state
}

describe('buildStreetBriefing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds technical depth by difficulty without exposing hole cards', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const state = advanceTo('flop')
    const hero = state.players.find(({ isHero }) => isHero)!
    const hand = evaluateBestHand([...hero.holeCards, ...state.communityCards])
    const draws = analyzeDraws(hero.holeCards, state.communityCards)
    const beginner = buildStreetBriefing(state, hand, draws, inferOpponentReads(state, 'beginner'), 'beginner')
    const advanced = buildStreetBriefing(state, hand, draws, inferOpponentReads(state, 'advanced'), 'advanced')
    expect(beginner.sections.length).toBeLessThan(advanced.sections.length)
    expect(advanced.sections.flatMap(({ points }) => points).join(' ')).toMatch(/concealed cards|not their concealed cards/i)
    const changedOpponentCards = {
      ...state,
      players: state.players.map((player) => player.isHero ? player : { ...player, holeCards: [...hero.holeCards] }),
    }
    const changedReads = inferOpponentReads(changedOpponentCards, 'advanced')
    expect(buildStreetBriefing(changedOpponentCards, hand, draws, changedReads, 'advanced')).toEqual(advanced)
  })

  it.each(['river', 'showdown'] as const)('uses final-board guidance on %s without implying another card', (targetStreet) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const state = advanceTo(targetStreet)
    const hero = state.players.find(({ isHero }) => isHero)!
    const hand = evaluateBestHand([...hero.holeCards, ...state.communityCards])
    const draws = analyzeDraws(hero.holeCards, state.communityCards)
    const briefing = buildStreetBriefing(state, hand, draws, inferOpponentReads(state, 'advanced'), 'advanced')
    const titles = briefing.sections.map(({ title }) => title)
    const copy = briefing.sections.flatMap(({ points }) => points).join(' ')

    expect(titles).toContain('Completed draw picture')
    expect(titles).toContain('Final-board watchouts')
    expect(titles).not.toContain('Threats on the next card')
    expect(copy).toMatch(/no future community-card outs/i)
    expect(copy).not.toMatch(/next-card improvement|another community card can|on the next card/i)
  })
})
