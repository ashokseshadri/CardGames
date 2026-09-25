import { useMemo, useState } from 'react'
import type { BettingAction, Difficulty, EquityResult } from '../domain/cards'
import { constrainAdviceToLegalActions, getCoachingAdvice } from '../domain/coach'
import { analyzeDraws, estimateMultiwayEquity } from '../domain/equity'
import { evaluateBestHand } from '../domain/evaluator'
import { inferOpponentReads } from '../domain/opponentModel'
import { buildStreetBriefing } from '../domain/streetBriefing'
import { actAndAdvance, createNewGame, getLegalActions } from '../game/gameEngine'

export function usePokerTrainer() {
  const [state, setState] = useState(() => createNewGame(6))
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')

  const cardAnalysis = useMemo(() => {
    const hero = state.players.find((player) => player.id === state.heroId)
    if (!hero) throw new Error('The learning table requires a hero seat.')
    const visibleCards = [...hero.holeCards, ...state.communityCards]
    const hand = evaluateBestHand(visibleCards)
    const draws = analyzeDraws(hero.holeCards, state.communityCards)
    const activeOpponents = state.players.filter((player) => !player.isHero && player.status !== 'folded')

    let equity: EquityResult
    const showdownResult = state.heroResult
    if (state.phase === 'complete' && showdownResult) {
      equity = {
        equity: showdownResult === 'win' ? 1 : showdownResult === 'tie' ? 1 / Math.max(2, state.winnerIds.length) : 0,
        win: showdownResult === 'win' ? 1 : 0,
        tie: showdownResult === 'tie' ? 1 : 0,
        loss: showdownResult === 'loss' ? 1 : 0,
        simulations: 1,
      }
    } else {
      equity = estimateMultiwayEquity(
        hero.holeCards,
        state.communityCards,
        Math.max(1, activeOpponents.length),
        state.street === 'preflop' ? 1000 : 1600,
      )
    }
    return { hero, hand, draws, equity, showdownResult }
  }, [state.communityCards, state.heroId, state.heroResult, state.phase, state.players, state.street, state.winnerIds.length])

  const heroTurn = state.phase === 'betting'
    && state.actingSeat !== null
    && state.players.some((player) => player.id === state.heroId && player.seat === state.actingSeat)
  const legalActions = heroTurn ? getLegalActions(state, state.heroId) : null

  const publicAnalysis = useMemo(() => {
    const reads = inferOpponentReads(state, difficulty)
    const briefing = buildStreetBriefing(state, cardAnalysis.hand, cardAnalysis.draws, reads, difficulty)
    const streetAdvice = getCoachingAdvice({
      equity: cardAnalysis.equity,
      hand: cardAnalysis.hand,
      draws: cardAnalysis.draws,
      pot: state.pot,
      toCall: state.toCall,
      difficulty,
      street: state.street,
      opponentCount: Math.max(1, state.players.filter((player) => !player.isHero && player.status !== 'folded').length),
    })
    const legalStreetAdvice = legalActions ? constrainAdviceToLegalActions(streetAdvice, legalActions) : streetAdvice
    const advice = state.phase === 'complete'
      ? {
          ...streetAdvice,
          action: 'check' as const,
          headline: cardAnalysis.hero.status === 'folded' || state.street !== 'showdown'
            ? 'Hand complete—review the fold and chip result'
            : 'Hand complete—review every range and reveal',
          reasoning: cardAnalysis.hero.status === 'folded'
            ? [
                'You folded, so you no longer contested the pot and kept any chips not committed.',
                'Review the action history and the chips you committed before folding.',
              ]
            : state.street !== 'showdown'
            ? [
                cardAnalysis.showdownResult === 'win'
                  ? 'Every opponent folded, so you won the committed pot without showing a hand.'
                  : 'You folded, so the remaining player won the committed pot uncontested.',
                'Review the action history and the chips you committed before the hand ended.',
              ]
            : [
                cardAnalysis.showdownResult === 'win'
                  ? 'Your best five-card hand wins against every opponent who remained active.'
                  : cardAnalysis.showdownResult === 'tie'
                    ? 'Your best hand ties for the pot with at least one active opponent.'
                    : 'At least one active opponent shows a stronger five-card hand.',
                'Compare each revealed holding with the probability profile you saw before showdown; folded hands are included for study.',
              ],
          potOdds: 0,
          edge: cardAnalysis.equity.equity,
          confidence: 'high' as const,
        }
      : legalStreetAdvice
    return { reads, briefing, advice }
  }, [cardAnalysis, difficulty, legalActions, state])
  const takeAction = (action: BettingAction) => setState((current) => actAndAdvance(current, action))
  const turnStatus = state.phase === 'complete'
    ? state.heroResult === 'win'
      ? `Hand complete. You finished ${state.heroNet! >= 0 ? '+' : ''}${state.heroNet} chips.`
      : state.heroResult === 'tie'
        ? `Hand complete. The pot was split; your net result is ${state.heroNet! >= 0 ? '+' : ''}${state.heroNet} chips.`
        : `Hand complete. You finished ${state.heroNet} chips.`
    : heroTurn
      ? `Your turn in the ${state.players.find((player) => player.id === state.heroId)?.position} position.`
      : 'Simulated opponents are acting in table order.'

  return {
    state,
    analysis: {
      hand: cardAnalysis.hand,
      draws: cardAnalysis.draws,
      equity: cardAnalysis.equity,
      advice: publicAnalysis.advice,
      briefing: publicAnalysis.briefing,
    },
    showdownResult: cardAnalysis.showdownResult,
    difficulty,
    isAnalyzing: false,
    legalActions,
    isBotActing: state.phase === 'betting' && !heroTurn,
    turnStatus,
    act: takeAction,
    newHand: (heroStartingStack = 100) => setState((current) => createNewGame(
      current.playerCount,
      (current.dealerSeat + 1) % current.playerCount,
      heroStartingStack,
    )),
    setPlayerCount: (count: number, heroStartingStack = 100) => setState(() => createNewGame(count, 0, heroStartingStack)),
    setDifficulty,
  }
}
