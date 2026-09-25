import type {
  BettingAction,
  Difficulty,
  GameState,
  HoldingProbability,
  LegalActions,
  OpponentRead,
  PokerAction,
  Street,
  TablePlayer,
} from './cards'
import { evaluateBestHand } from './evaluator'

const rankValue = (rank: TablePlayer['holeCards'][number]['rank']) =>
  ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 })[rank]

const concealedStrength = (player: TablePlayer, state: GameState) => {
  if (state.communityCards.length >= 3) {
    const hand = evaluateBestHand([...player.holeCards, ...state.communityCards])
    if (!hand) return 0.4
    return Math.min(0.98, 0.25 + hand.category * 0.105 + (hand.tiebreakers[0] ?? 2) / 100)
  }
  const [first, second] = player.holeCards
  const high = Math.max(rankValue(first.rank), rankValue(second.rank))
  const low = Math.min(rankValue(first.rank), rankValue(second.rank))
  const pairBonus = first.rank === second.rank ? 0.32 + high / 45 : 0
  const suitedBonus = first.suit === second.suit ? 0.06 : 0
  const connectedBonus = Math.abs(high - low) <= 2 ? 0.05 : 0
  return Math.min(0.96, 0.12 + (high + low) / 42 + pairBonus + suitedBonus + connectedBonus)
}

/** Uses concealed cards only to choose a bounded legal action; public reads never call this helper. */
export const chooseBotAction = (state: GameState, player: TablePlayer, legal: LegalActions): BettingAction => {
  const strength = concealedStrength(player, state)
  const roll = Math.random()
  if (legal.canRaise && strength >= 0.72 && roll < 0.42) {
    const desired = legal.minRaiseTo + Math.floor((legal.maxRaiseTo - legal.minRaiseTo) * Math.min(1, strength))
    return { type: 'raise', raiseTo: Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, desired)) }
  }
  if (legal.canCheck) return { type: 'check' }
  if (legal.canFold && strength < 0.38 && roll < 0.62) return { type: 'fold' }
  if (legal.canCall) return { type: 'call' }
  if (legal.canRaise) return { type: 'raise', raiseTo: legal.minRaiseTo }
  throw new Error('Bot was asked to act without a legal option.')
}

const normalize = (holdings: HoldingProbability[]): HoldingProbability[] => {
  const total = holdings.reduce((sum, holding) => sum + holding.probability, 0)
  return holdings.map((holding) => ({ ...holding, probability: holding.probability / total }))
}

const holdingsFor = (player: TablePlayer, street: Street, difficulty: Difficulty): HoldingProbability[] => {
  const latest = player.actions.at(-1)
  const action = latest?.action ?? 'check'
  const positionBoost = ['BTN', 'BTN/SB', 'CO'].includes(player.position) ? 0.05 : 0
  const detail = difficulty === 'beginner'
    ? 'This is a broad learning estimate from the visible action.'
    : `This action-conditioned estimate also accounts for ${player.position} position; it is not a solver range.`
  const postflopTemplates: Record<PokerAction, Array<[string, number, string[]]>> = {
    raise: [['Very strong made hand', 0.43 - positionBoost, ['sets', 'two pair', 'overpairs']], ['Strong pair', 0.34, ['top pair', 'pocket pair']], ['Draw or pressure play', 0.23 + positionBoost, ['flush draw', 'straight draw', 'bluff']]],
    call: [['Pair-type hand', 0.46, ['top pair', 'middle pair', 'pocket pair']], ['Drawing hand', 0.34, ['flush draw', 'straight draw', 'overcards']], ['Slow-play or weak continue', 0.20, ['trips', 'bottom pair', 'ace high']]],
    check: [['Unpaired or marginal hand', 0.45 + positionBoost, ['high card', 'bottom pair']], ['Pair-type hand', 0.34, ['middle pair', 'top pair']], ['Trap or draw', 0.21 - positionBoost, ['strong made hand', 'draw']]],
    fold: [['Missed or weak hand', 0.62, ['low high card', 'weak pair']], ['Abandoned draw', 0.25, ['backdoor draw', 'overcards']], ['Cautious medium hand', 0.13, ['middle pair', 'small pocket pair']]],
  }
  const preflopTemplates: Record<PokerAction, Array<[string, number, string[]]>> = {
    raise: [['Premium pair or big cards', 0.43 - positionBoost, ['AA–JJ', 'AK', 'AQ']], ['Playable pair or broadway', 0.34, ['TT–77', 'KQ', 'AJ']], ['Suited connector or pressure raise', 0.23 + positionBoost, ['suited connectors', 'suited ace', 'bluff']]],
    call: [['Medium or small pair', 0.40, ['TT–22']], ['Broadway or strong ace', 0.35, ['AQ–AT', 'KQ', 'KJ']], ['Suited or connected hand', 0.25, ['suited connectors', 'suited one-gappers']]],
    check: [['Wide unpaired holding', 0.46 + positionBoost, ['two overcards', 'one high card']], ['Pair or broadway hand', 0.33, ['pocket pair', 'two broadway cards']], ['Suited or connected holding', 0.21 - positionBoost, ['suited ace', 'connector']]],
    fold: [['Weak disconnected cards', 0.57, ['low offsuit cards', 'large rank gaps']], ['Weak single-high-card hand', 0.28, ['unpaired king', 'unpaired queen']], ['Cautious fold with playable cards', 0.15, ['small pair', 'suited connector']]],
  }
  const finalBoardTemplates: Record<PokerAction, Array<[string, number, string[]]>> = {
    raise: [['Very strong final hand', 0.49 - positionBoost, ['straight or flush', 'full house', 'set']], ['Strong value hand', 0.34, ['two pair', 'overpair', 'top pair with strong kicker']], ['Polarized pressure or bluff', 0.17 + positionBoost, ['missed draw bluff', 'blocker bluff']]],
    call: [['Pair-type bluff catcher', 0.48, ['top pair', 'middle pair', 'pocket pair']], ['Two pair or better', 0.29, ['two pair', 'trips', 'straight']], ['High-card or thin bluff catcher', 0.23, ['ace high', 'underpair']]],
    check: [['Marginal final hand', 0.46 + positionBoost, ['high card', 'bottom pair', 'underpair']], ['Pair-type showdown hand', 0.35, ['middle pair', 'top pair']], ['Slow-played final strength', 0.19 - positionBoost, ['two pair', 'trips', 'straight or better']]],
    fold: [['Missed or weak final hand', 0.60, ['missed draw', 'high card']], ['Weak pair', 0.27, ['bottom pair', 'underpair']], ['Cautious medium-strength fold', 0.13, ['middle pair', 'top pair on a dangerous board']]],
  }
  const templates = street === 'preflop'
    ? preflopTemplates
    : street === 'river' || street === 'showdown'
      ? finalBoardTemplates
      : postflopTemplates
  return normalize(templates[action].map(([label, probability, examples]) => ({ label, probability, examples, explanation: detail })))
}

/** Derives reads from public position/status/actions only; holeCards are intentionally untouched. */
export const inferOpponentReads = (state: GameState, difficulty: Difficulty): OpponentRead[] =>
  state.players.filter((player) => !player.isHero).map((player) => {
    const latest = player.actions.at(-1)
    const rangeStrength: OpponentRead['rangeStrength'] = latest?.action === 'raise'
      ? 'very strong'
      : latest?.action === 'call'
        ? 'balanced'
        : latest?.action === 'fold'
          ? 'wide'
          : 'wide'
    return {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      status: player.status,
      topHoldings: holdingsFor(player, state.street, difficulty),
      rangeStrength,
      watchout: latest?.action === 'raise'
        ? 'A raise shifts the visible range toward value, while bluffs remain possible.'
        : latest?.action === 'fold'
          ? 'This player is no longer contesting the pot; their cards remain unknown until review.'
          : state.street === 'river' || state.street === 'showdown'
            ? 'Calls and checks retain final medium-strength hands, bluff catchers, slow plays, and missed draws that may bluff.'
            : 'Calls and checks retain many medium-strength hands and live draws.',
      modelBasis: 'Fixed educational weights from public action and position; no cards or Monte Carlo samples are used.',
    }
  })
