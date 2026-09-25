import {
  createDeck,
  type BettingAction,
  type Card,
  type GameState,
  type HandValue,
  type LegalActions,
  type PlayerActionRecord,
  type PokerAction,
  type Street,
  type TablePlayer,
  type TimelineEvent,
  type RankedHandResult,
} from '../domain/cards'
import { chooseBotAction } from '../domain/opponentModel'
import { assignPositions } from '../domain/positions'
import { compareHands, evaluateBestHand } from '../domain/evaluator'

export const STARTING_STACK = 100
export const SMALL_BLIND = 5
export const BIG_BLIND = 10
const BOT_GUARD = 256

const shuffle = (cards: Card[]) => {
  const result = [...cards]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[selected]] = [result[selected], result[index]]
  }
  return result
}

const uniqueId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
const event = (street: Street, label: string): TimelineEvent => ({ id: uniqueId(), street, label })
const normalizeCount = (count: number) => Math.min(6, Math.max(2, Math.round(Number.isFinite(count) ? count : 2)))
const normalizeHeroStack = (stack: number) => Math.min(STARTING_STACK, Math.max(1, Math.floor(Number.isFinite(stack) ? stack : STARTING_STACK)))
const nextSeat = (seat: number, count: number) => (seat + 1) % count
const contenders = (state: GameState) => state.players.filter(({ status }) => status !== 'folded')
const activePlayers = (state: GameState) => state.players.filter(({ status }) => status === 'active')

export const getBlindSeats = (playerCount: number, dealerSeat: number) => ({
  smallBlindSeat: playerCount === 2 ? dealerSeat : (dealerSeat + 1) % playerCount,
  bigBlindSeat: playerCount === 2 ? (dealerSeat + 1) % playerCount : (dealerSeat + 2) % playerCount,
})

const findNextSeat = (state: GameState, fromSeat: number, predicate: (player: TablePlayer) => boolean) => {
  for (let offset = 1; offset <= state.playerCount; offset += 1) {
    const seat = (fromSeat + offset) % state.playerCount
    const player = state.players.find((candidate) => candidate.seat === seat)
    if (player && predicate(player)) return seat
  }
  return null
}

const syncToCall = (state: GameState): GameState => {
  const player = state.actingSeat === null ? undefined : state.players.find(({ seat }) => seat === state.actingSeat)
  return { ...state, toCall: player ? Math.max(0, state.currentBet - player.streetContribution) : 0 }
}

const postBlind = (player: TablePlayer, amount: number): TablePlayer => {
  const paid = Math.min(amount, player.stack)
  const stack = player.stack - paid
  return {
    ...player,
    stack,
    streetContribution: player.streetContribution + paid,
    totalContribution: player.totalContribution + paid,
    status: stack === 0 ? 'all-in' : player.status,
  }
}

const initialActingSeat = (playerCount: number, dealerSeat: number, bigBlindSeat: number) =>
  playerCount === 2 ? dealerSeat : nextSeat(bigBlindSeat, playerCount)

const emptyLegal = (): LegalActions => ({
  toCall: 0,
  canFold: false,
  canCheck: false,
  canCall: false,
  callAmount: 0,
  canRaise: false,
  minRaiseTo: 0,
  maxRaiseTo: 0,
})

export const getLegalActions = (state: GameState, playerId?: string): LegalActions => {
  if (state.phase !== 'betting' || state.actingSeat === null) return emptyLegal()
  const player = playerId
    ? state.players.find(({ id }) => id === playerId)
    : state.players.find(({ seat }) => seat === state.actingSeat)
  if (!player || player.seat !== state.actingSeat || player.status !== 'active') return emptyLegal()

  const toCall = Math.max(0, state.currentBet - player.streetContribution)
  const callAmount = Math.min(toCall, player.stack)
  const otherCaps = contenders(state)
    .filter(({ id }) => id !== player.id)
    .map(({ totalContribution, stack }) => totalContribution + stack)
  const priorStreetContribution = player.totalContribution - player.streetContribution
  const actorStreetCap = player.streetContribution + player.stack
  const matchedStreetCap = otherCaps.length
    ? Math.min(...otherCaps) - priorStreetContribution
    : actorStreetCap
  const maxRaiseTo = Math.max(player.streetContribution, Math.min(actorStreetCap, matchedStreetCap))
  const normalMinimum = state.currentBet + state.minRaise
  const canRaise = !player.hasActed && player.stack > toCall && maxRaiseTo > state.currentBet
  const minRaiseTo = canRaise ? Math.min(normalMinimum, maxRaiseTo) : 0
  return {
    toCall,
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0 && callAmount > 0,
    callAmount,
    canRaise,
    minRaiseTo,
    maxRaiseTo: canRaise ? maxRaiseTo : 0,
  }
}

const actionRecord = (state: GameState, action: PokerAction, amount: number, rationale: string): PlayerActionRecord => ({
  id: uniqueId(),
  street: state.street,
  action,
  amount,
  rationale,
  signal: action === 'raise' ? 'strong' : action === 'fold' ? 'weak' : 'neutral',
})

const completedAnalysisBoard = (state: GameState): Card[] => {
  const needed = 5 - state.communityCards.length
  if (needed <= 0) return state.communityCards.slice(0, 5)
  if (state.deck.length < needed) throw new Error('Not enough cards remain for the training replay.')
  return [...state.communityCards, ...state.deck.slice(0, needed)]
}

const rankHands = (players: TablePlayer[], board: Card[]): RankedHandResult[] => {
  const evaluated = players.map((player) => {
    const hand = evaluateBestHand([...player.holeCards, ...board])
    if (!hand) throw new Error('A five-card training board is required to rank hands.')
    return { player, hand }
  }).sort((left, right) => compareHands(right.hand, left.hand))
  let rank = 0
  let priorHand: HandValue | null = null
  return evaluated.map((entry) => {
    if (!priorHand || compareHands(priorHand, entry.hand) !== 0) rank += 1
    priorHand = entry.hand
    return { rank, playerId: entry.player.id, hand: entry.hand }
  })
}

const award = (state: GameState, winnerIds: string[], showdown: boolean, officialHands: {
  winningHand: HandValue | null
  runnerUpIds: string[]
  runnerUpHand: HandValue | null
} = { winningHand: null, runnerUpIds: [], runnerUpHand: null }): GameState => {
  const orderedWinners = state.players.filter(({ id }) => winnerIds.includes(id)).sort((a, b) => a.seat - b.seat)
  const potAwarded = state.pot
  const analysisBoard = completedAnalysisBoard(state)
  const rankedHands = rankHands(state.players, analysisBoard)
  const baseShare = Math.floor(state.pot / orderedWinners.length)
  const remainder = state.pot - baseShare * orderedWinners.length
  const players = state.players.map((player) => {
    const winnerIndex = orderedWinners.findIndex(({ id }) => id === player.id)
    const winnings = winnerIndex < 0 ? 0 : baseShare + (winnerIndex < remainder ? 1 : 0)
    return {
      ...player,
      stack: player.stack + winnings,
      showdownHand: evaluateBestHand([...player.holeCards, ...analysisBoard]) ?? undefined,
    }
  })
  const hero = players.find(({ id }) => id === state.heroId)!
  const heroWon = winnerIds.includes(state.heroId)
  return {
    ...state,
    street: showdown ? 'showdown' : state.street,
    players,
    pot: 0,
    toCall: 0,
    phase: 'complete',
    actingSeat: null,
    winnerIds,
    heroNet: hero.stack - state.startingStack,
    heroResult: heroWon ? winnerIds.length > 1 ? 'tie' : 'win' : 'loss',
    resultSummary: {
      reason: showdown ? 'showdown' : 'uncontested',
      potAwarded,
      winnerIds,
      winningHand: officialHands.winningHand,
      runnerUpIds: officialHands.runnerUpIds,
      runnerUpHand: officialHands.runnerUpHand,
      analysisBoard,
      rankedHands,
    },
    timeline: [...state.timeline, event(
      showdown ? 'showdown' : state.street,
      `${orderedWinners.map(({ name }) => name).join(' and ')} ${winnerIds.length > 1 ? 'split' : 'won'} the ${state.pot}-chip pot${showdown ? ' at showdown' : ' uncontested'}.`,
    )],
  }
}

const showdown = (state: GameState): GameState => {
  const eligible = contenders(state)
  const hands = eligible.map((player) => ({ player, hand: evaluateBestHand([...player.holeCards, ...state.communityCards]) }))
  if (hands.some(({ hand }) => !hand)) throw new Error('Showdown requires five community cards.')
  const best = hands.reduce((current, candidate) => compareHands(candidate.hand!, current.hand!) > 0 ? candidate : current)
  const winners = hands.filter(({ hand }) => compareHands(hand!, best.hand!) === 0).map(({ player }) => player.id)
  const losingHands = hands.filter(({ player }) => !winners.includes(player.id))
  const runnerUp = losingHands.reduce<(typeof losingHands)[number] | null>(
    (current, candidate) => !current || compareHands(candidate.hand!, current.hand!) > 0 ? candidate : current,
    null,
  )
  const runnerUpIds = runnerUp
    ? losingHands.filter(({ hand }) => compareHands(hand!, runnerUp.hand!) === 0).map(({ player }) => player.id)
    : []
  return award({ ...state, street: 'showdown' }, winners, true, {
    winningHand: best.hand!,
    runnerUpIds,
    runnerUpHand: runnerUp?.hand ?? null,
  })
}

const runout = (state: GameState): GameState => {
  const needed = 5 - state.communityCards.length
  if (state.deck.length < needed) throw new Error('Not enough cards remain for showdown.')
  return showdown({
    ...state,
    deck: state.deck.slice(needed),
    communityCards: [...state.communityCards, ...state.deck.slice(0, needed)],
  })
}

const streetClosed = (state: GameState) => activePlayers(state).every((player) =>
  player.hasActed && player.streetContribution === state.currentBet,
)

const nextStreet = (state: GameState): GameState => {
  if (state.street === 'river') return showdown({ ...state, street: 'showdown' })
  const transition = {
    preflop: { street: 'flop' as const, count: 3 },
    flop: { street: 'turn' as const, count: 1 },
    turn: { street: 'river' as const, count: 1 },
  }[state.street as 'preflop' | 'flop' | 'turn']
  if (!transition || state.deck.length < transition.count) throw new Error('Cannot advance this betting street.')
  const players = state.players.map((player) => ({
    ...player,
    streetContribution: 0,
    hasActed: player.status !== 'active',
  }))
  const advanced: GameState = {
    ...state,
    street: transition.street,
    deck: state.deck.slice(transition.count),
    communityCards: [...state.communityCards, ...state.deck.slice(0, transition.count)],
    players,
    currentBet: 0,
    minRaise: state.bigBlind,
    lastAggressorSeat: null,
    actingSeat: findNextSeat({ ...state, players }, state.dealerSeat, ({ status }) => status === 'active'),
    timeline: [...state.timeline, event(transition.street, `The ${transition.street} was revealed.`)],
  }
  if (activePlayers(advanced).length <= 1) return runout(advanced)
  return syncToCall(advanced)
}

const resolveAfterAction = (state: GameState): GameState => {
  const remaining = contenders(state)
  if (remaining.length === 1) return award(state, [remaining[0].id], false)
  const ableToAct = activePlayers(state)
  if (ableToAct.length <= 1 && ableToAct.every(({ streetContribution }) => streetContribution === state.currentBet)) {
    return runout(state)
  }
  if (streetClosed(state)) return nextStreet(state)
  const acting = state.actingSeat ?? state.dealerSeat
  const next = findNextSeat(state, acting, (player) =>
    player.status === 'active' && (!player.hasActed || player.streetContribution < state.currentBet),
  )
  if (next === null) throw new Error('Betting round could not find the next required action.')
  return syncToCall({ ...state, actingSeat: next })
}

export const act = (state: GameState, action: BettingAction): GameState => {
  if (state.phase !== 'betting' || state.actingSeat === null) throw new Error('The hand is not accepting actions.')
  const actingIndex = state.players.findIndex(({ seat }) => seat === state.actingSeat)
  if (actingIndex < 0) throw new Error('Acting seat is invalid.')
  const legal = getLegalActions(state)
  const actor = state.players[actingIndex]
  let amount = 0
  let record: PlayerActionRecord
  let nextCurrentBet = state.currentBet
  let nextMinRaise = state.minRaise
  let nextAggressor = state.lastAggressorSeat
  let fullRaise = false

  if (action.type === 'fold') {
    if (!legal.canFold) throw new Error('Fold is not legal when checking is available.')
    record = actionRecord(state, 'fold', 0, 'Folded rather than matching the current bet.')
  } else if (action.type === 'check') {
    if (!legal.canCheck) throw new Error('Check is not legal while facing a bet.')
    record = actionRecord(state, 'check', 0, 'Checked with no chips required to continue.')
  } else if (action.type === 'call') {
    if (!legal.canCall) throw new Error('Call is not legal in this state.')
    amount = legal.callAmount
    record = actionRecord(state, 'call', amount, `Called ${amount} chips.`)
  } else if (action.type === 'raise') {
    const raiseTo = action.raiseTo
    if (!legal.canRaise || !Number.isInteger(raiseTo) || raiseTo! < legal.minRaiseTo || raiseTo! > legal.maxRaiseTo) {
      throw new Error(`Raise total must be an integer from ${legal.minRaiseTo} through ${legal.maxRaiseTo}.`)
    }
    amount = raiseTo! - actor.streetContribution
    const raiseSize = raiseTo! - state.currentBet
    fullRaise = raiseSize >= state.minRaise
    nextCurrentBet = raiseTo!
    if (fullRaise) nextMinRaise = raiseSize
    nextAggressor = actor.seat
    record = actionRecord(state, 'raise', amount, `Raised to ${raiseTo} chips total on this street.`)
  } else {
    throw new Error('Unknown poker action.')
  }

  const players = state.players.map((player, index) => {
    if (fullRaise && player.status === 'active') player = { ...player, hasActed: false }
    if (index !== actingIndex) return player
    const stack = player.stack - amount
    return {
      ...player,
      stack,
      streetContribution: player.streetContribution + amount,
      totalContribution: player.totalContribution + amount,
      hasActed: true,
      status: action.type === 'fold' ? 'folded' as const : stack === 0 ? 'all-in' as const : player.status,
      actions: [...player.actions, record],
    }
  })
  const verb = action.type === 'raise' ? `raises to ${nextCurrentBet}` : action.type === 'call' ? `calls ${amount}` : `${action.type}s`
  return resolveAfterAction({
    ...state,
    players,
    pot: state.pot + amount,
    currentBet: nextCurrentBet,
    minRaise: nextMinRaise,
    lastAggressorSeat: nextAggressor,
    timeline: [...state.timeline, event(state.street, `${actor.name} ${verb}.`)],
  })
}

export const advanceBots = (state: GameState): GameState => {
  let current = state
  for (let step = 0; step < BOT_GUARD; step += 1) {
    if (current.phase === 'complete' || current.actingSeat === null) return current
    const actor = current.players.find(({ seat }) => seat === current.actingSeat)
    if (!actor || actor.isHero) return current
    current = act(current, chooseBotAction(current, actor, getLegalActions(current)))
  }
  throw new Error('Bot action guard exceeded before reaching the learner or terminal state.')
}

export const actAndAdvance = (state: GameState, action: BettingAction): GameState => advanceBots(act(state, action))

export const createNewGame = (playerCount = 2, dealerSeat = 0, heroStartingStack = STARTING_STACK): GameState => {
  const count = normalizeCount(playerCount)
  const heroStack = normalizeHeroStack(heroStartingStack)
  const requestedDealer = Number.isFinite(dealerSeat) ? Math.round(dealerSeat) : 0
  const dealer = ((requestedDealer % count) + count) % count
  const shuffled = shuffle(createDeck())
  const handId = uniqueId()
  const positions = assignPositions(count, dealer)
  const { smallBlindSeat, bigBlindSeat } = getBlindSeats(count, dealer)
  let players: TablePlayer[] = Array.from({ length: count }, (_, seat) => ({
    id: seat === 0 ? `hero-${handId}` : `opponent-${seat}-${handId}`,
    name: seat === 0 ? 'You' : `Opponent ${seat}`,
    seat,
    position: positions[seat],
    isHero: seat === 0,
    holeCards: shuffled.slice(seat * 2, seat * 2 + 2),
    status: 'active',
    stack: seat === 0 ? heroStack : STARTING_STACK,
    streetContribution: 0,
    totalContribution: 0,
    hasActed: false,
    actions: [],
  }))
  players = players.map((player) => player.seat === smallBlindSeat
    ? postBlind(player, SMALL_BLIND)
    : player.seat === bigBlindSeat
      ? postBlind(player, BIG_BLIND)
      : player)
  const openingPot = players.reduce((total, player) => total + player.totalContribution, 0)
  const smallBlindPosted = players.find(({ seat }) => seat === smallBlindSeat)!.totalContribution
  const bigBlindPosted = players.find(({ seat }) => seat === bigBlindSeat)!.totalContribution
  const state: GameState = {
    handId,
    street: 'preflop',
    deck: shuffled.slice(count * 2),
    players,
    heroId: players[0].id,
    playerCount: count,
    dealerSeat: dealer,
    communityCards: [],
    pot: openingPot,
    toCall: 0,
    phase: 'betting',
    actingSeat: initialActingSeat(count, dealer, bigBlindSeat),
    currentBet: BIG_BLIND,
    minRaise: BIG_BLIND,
    lastAggressorSeat: null,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    startingStack: heroStack,
    winnerIds: [],
    heroNet: null,
    heroResult: null,
    resultSummary: null,
    timeline: [event('preflop', `${players.find(({ seat }) => seat === smallBlindSeat)!.name} posted ${smallBlindPosted}; ${players.find(({ seat }) => seat === bigBlindSeat)!.name} posted ${bigBlindPosted}.`)],
  }
  return advanceBots(syncToCall(state))
}

export const getNextStreetLabel = (street: Street): string =>
  ({ preflop: 'Finish preflop betting', flop: 'Finish flop betting', turn: 'Finish turn betting', river: 'Finish river betting', showdown: 'Hand complete' })[street]
