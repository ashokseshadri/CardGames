import { cardId, createDeck, type Card, type DrawInsight, type EquityResult } from './cards'
import { compareHands, evaluateBestHand } from './evaluator'

const assertUnique = (cards: Card[]) => {
  if (new Set(cards.map(cardId)).size !== cards.length) throw new Error('Cards must be unique.')
}

const drawSample = (source: Card[], count: number) => {
  const cards = [...source]
  for (let index = 0; index < count; index += 1) {
    const selected = index + Math.floor(Math.random() * (cards.length - index))
    ;[cards[index], cards[selected]] = [cards[selected], cards[index]]
  }
  return cards.slice(0, count)
}

export const estimateEquity = (
  playerCards: Card[],
  communityCards: Card[],
  iterations = 2500,
): EquityResult => estimateMultiwayEquity(playerCards, communityCards, 1, iterations)

export const estimateMultiwayEquity = (
  heroCards: Card[],
  board: Card[],
  opponentCount: number,
  iterations = 2500,
): EquityResult => {
  if (heroCards.length !== 2) throw new Error('Equity requires exactly two hero cards.')
  if (!Number.isInteger(opponentCount) || opponentCount < 1 || opponentCount > 5) {
    throw new Error('Opponent count must be an integer from one through five.')
  }
  if (board.length > 5) throw new Error('A board cannot contain more than five cards.')
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Iterations must be a positive integer.')
  const visible = [...heroCards, ...board]
  assertUnique(visible)
  const visibleIds = new Set(visible.map(cardId))
  const unseen = createDeck().filter((card) => !visibleIds.has(cardId(card)))
  const boardCardsNeeded = 5 - board.length
  let win = 0
  let tie = 0
  let equityShare = 0

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    // This API can consume only hero-visible cards. Actual opponent cards therefore
    // cannot influence a pre-showdown result, even though GameState stores them.
    const sample = drawSample(unseen, opponentCount * 2 + boardCardsNeeded)
    const completeBoard = [...board, ...sample.slice(opponentCount * 2)]
    const heroHand = evaluateBestHand([...heroCards, ...completeBoard])
    const opponentHands = Array.from({ length: opponentCount }, (_, index) =>
      evaluateBestHand([...sample.slice(index * 2, index * 2 + 2), ...completeBoard]),
    )
    if (!heroHand || opponentHands.some((hand) => !hand)) throw new Error('Equity simulation did not produce complete hands.')
    const comparisons = opponentHands.map((hand) => compareHands(heroHand, hand!))
    if (comparisons.every((comparison) => comparison > 0)) {
      win += 1
      equityShare += 1
    } else if (comparisons.every((comparison) => comparison >= 0)) {
      const tiedOpponents = comparisons.filter((comparison) => comparison === 0).length
      tie += 1
      equityShare += 1 / (tiedOpponents + 1)
    }
  }

  const loss = iterations - win - tie
  return {
    equity: equityShare / iterations,
    win: win / iterations,
    tie: tie / iterations,
    loss: loss / iterations,
    simulations: iterations,
  }
}

const rankValue = (rank: Card['rank']) =>
  ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 })[rank]

const hasStraight = (cards: Card[]) => {
  const values = new Set(cards.map(({ rank }) => rankValue(rank)))
  if (values.has(14)) values.add(1)
  return [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].some((high) =>
    [0, 1, 2, 3, 4].every((offset) => values.has(high - offset)),
  )
}

const insight = (label: string, explanation: string, cards: Card[]): DrawInsight => ({
  label,
  explanation,
  outs: cards.length,
  cards,
})

export const analyzeDraws = (playerCards: Card[], communityCards: Card[]): DrawInsight[] => {
  const known = [...playerCards, ...communityCards]
  assertUnique(known)
  if (communityCards.length >= 5 || known.length < 5) return []
  const knownIds = new Set(known.map(cardId))
  const unseen = createDeck().filter((card) => !knownIds.has(cardId(card)))
  const draws: DrawInsight[] = []
  const currentHand = evaluateBestHand(known)
  if (!currentHand) return []
  const improvesBestHand = (card: Card) => {
    const nextHand = evaluateBestHand([...known, card])
    return Boolean(nextHand && compareHands(nextHand, currentHand) > 0)
  }

  for (const suit of ['clubs', 'diamonds', 'hearts', 'spades'] as const) {
    if (known.filter((card) => card.suit === suit).length === 4) {
      const cards = unseen.filter((card) => card.suit === suit && improvesBestHand(card))
      if (cards.length) draws.push(insight('Flush improvement cards', `${cards.length} unseen ${suit} can improve your best hand on the next card.`, cards))
    }
  }

  if (!hasStraight(known)) {
    const straightCards = unseen.filter((card) => hasStraight([...known, card]) && improvesBestHand(card))
    if (straightCards.length) {
      const ranks = new Set(straightCards.map(({ rank }) => rank)).size
      const kind = ranks > 1 ? 'Open-ended straight improvement cards' : 'Gutshot straight improvement cards'
      draws.push(insight(kind, `${straightCards.length} unseen cards can complete a straight on the next card.`, straightCards))
    }
  }

  const rankGroups = new Map<Card['rank'], Card[]>()
  for (const card of known) rankGroups.set(card.rank, [...(rankGroups.get(card.rank) ?? []), card])
  const pairs = [...rankGroups.entries()].filter(([, cards]) => cards.length === 2)
  if (pairs.length >= 2) {
    const pairRanks = new Set(pairs.map(([rank]) => rank))
    const cards = unseen.filter((card) => pairRanks.has(card.rank) && improvesBestHand(card))
    if (cards.length) draws.push(insight('Full-house improvement cards', `${cards.length} cards can turn two pair into a full house.`, cards))
  } else if (pairs.length === 1) {
    const cards = unseen.filter((card) => card.rank === pairs[0][0] && improvesBestHand(card))
    if (cards.length) draws.push(insight('Three-of-a-kind improvement cards', `${cards.length} cards can improve the pair to three of a kind.`, cards))
  }

  const trips = [...rankGroups.entries()].find(([, cards]) => cards.length === 3)
  if (trips) {
    const singletonRanks = new Set([...rankGroups.entries()].filter(([, cards]) => cards.length === 1).map(([rank]) => rank))
    const cards = unseen.filter((card) => (card.rank === trips[0] || singletonRanks.has(card.rank)) && improvesBestHand(card))
    if (cards.length) draws.push(insight('Full-house or quads improvement cards', `${cards.length} cards can improve trips to a full house or four of a kind.`, cards))
  }

  return draws
}
