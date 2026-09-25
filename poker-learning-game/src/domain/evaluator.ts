import type { Card, HandValue } from './cards'

const rankValue = (rank: Card['rank']) =>
  ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 })[rank]

const CATEGORY_NAMES = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const

const FACE_NAMES: Record<number, string> = { 14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten' }

const rankName = (value: number) => FACE_NAMES[value] ?? String(value)

const pluralRankName = (value: number) => `${rankName(value)}s`

const straightHigh = (values: number[]) => {
  const unique = [...new Set(values)].sort((a, b) => b - a)
  if (unique.includes(14)) unique.push(1)
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) return unique[index]
  }
  return 0
}

const describe = (category: number, tiebreakers: number[]) => {
  switch (category) {
    case 8:
      return `${rankName(tiebreakers[0])}-high straight flush`
    case 7:
      return `Four ${pluralRankName(tiebreakers[0])}`
    case 6:
      return `${pluralRankName(tiebreakers[0])} full of ${pluralRankName(tiebreakers[1])}`
    case 5:
      return `${rankName(tiebreakers[0])}-high flush`
    case 4:
      return `${rankName(tiebreakers[0])}-high straight`
    case 3:
      return `Three ${pluralRankName(tiebreakers[0])}`
    case 2:
      return `Two pair, ${pluralRankName(tiebreakers[0])} and ${pluralRankName(tiebreakers[1])}`
    case 1:
      return `Pair of ${pluralRankName(tiebreakers[0])}`
    default:
      return `${rankName(tiebreakers[0])} high`
  }
}

const evaluateFive = (cards: Card[]): HandValue => {
  const values = cards.map(({ rank }) => rankValue(rank)).sort((a, b) => b - a)
  const groups = [...new Set(values)]
    .map((value) => ({ value, count: values.filter((candidate) => candidate === value).length }))
    .sort((a, b) => b.count - a.count || b.value - a.value)
  const isFlush = cards.every(({ suit }) => suit === cards[0].suit)
  const highStraight = straightHigh(values)

  let category = 0
  let tiebreakers = [...values]
  if (isFlush && highStraight) {
    category = 8
    tiebreakers = [highStraight]
  } else if (groups[0].count === 4) {
    category = 7
    tiebreakers = [groups[0].value, groups[1].value]
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6
    tiebreakers = [groups[0].value, groups[1].value]
  } else if (isFlush) {
    category = 5
  } else if (highStraight) {
    category = 4
    tiebreakers = [highStraight]
  } else if (groups[0].count === 3) {
    category = 3
    tiebreakers = [groups[0].value, ...groups.slice(1).map(({ value }) => value).sort((a, b) => b - a)]
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2
    const pairs = groups.filter(({ count }) => count === 2).map(({ value }) => value).sort((a, b) => b - a)
    const kicker = groups.find(({ count }) => count === 1)?.value ?? 0
    tiebreakers = [...pairs, kicker]
  } else if (groups[0].count === 2) {
    category = 1
    tiebreakers = [groups[0].value, ...groups.slice(1).map(({ value }) => value).sort((a, b) => b - a)]
  }

  return {
    category,
    categoryName: CATEGORY_NAMES[category],
    tiebreakers,
    description: describe(category, tiebreakers),
    cards: [...cards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank)),
  }
}

const combinations = (cards: Card[], count: number): Card[][] => {
  const result: Card[][] = []
  const visit = (start: number, chosen: Card[]) => {
    if (chosen.length === count) {
      result.push(chosen)
      return
    }
    for (let index = start; index <= cards.length - (count - chosen.length); index += 1) {
      visit(index + 1, [...chosen, cards[index]])
    }
  }
  visit(0, [])
  return result
}

export const compareHands = (a: HandValue, b: HandValue): number => {
  if (a.category !== b.category) return Math.sign(a.category - b.category)
  const length = Math.max(a.tiebreakers.length, b.tiebreakers.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (a.tiebreakers[index] ?? 0) - (b.tiebreakers[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export const evaluateBestHand = (cards: Card[]): HandValue | null => {
  if (cards.length < 5) return null
  if (cards.length > 7) throw new Error('Texas Hold’em evaluation accepts at most seven cards.')
  const candidates = combinations(cards, 5).map(evaluateFive)
  return candidates.reduce((best, candidate) => (compareHands(candidate, best) > 0 ? candidate : best))
}
