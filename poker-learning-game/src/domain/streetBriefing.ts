import type { Difficulty, DrawInsight, GameState, HandValue, OpponentRead, StreetBriefing } from './cards'

const rankValue = (rank: GameState['communityCards'][number]['rank']) =>
  ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 })[rank]

export const buildStreetBriefing = (
  state: GameState,
  heroHand: HandValue | null,
  draws: DrawInsight[],
  reads: OpponentRead[],
  difficulty: Difficulty,
): StreetBriefing => {
  const activeOpponents = state.players.filter((player) => !player.isHero && player.status === 'active')
  const hero = state.players.find((player) => player.id === state.heroId)
  const ranks = state.communityCards.map(({ rank }) => rankValue(rank))
  const suits = new Map<string, number>()
  state.communityCards.forEach(({ suit }) => suits.set(suit, (suits.get(suit) ?? 0) + 1))
  const paired = new Set(ranks).size < ranks.length
  const maxSuit = Math.max(0, ...suits.values())
  const sorted = [...new Set(ranks)].sort((a, b) => a - b)
  const connected = sorted.some((value, index) => (sorted[index + 2] ?? 99) - value <= 4)
  const boardComplete = state.street === 'river' || state.street === 'showdown'
  const texture = state.street === 'preflop'
    ? 'No board is visible yet, so position and opponent action carry most of the information.'
    : `The board is ${paired ? 'paired' : 'unpaired'}, ${maxSuit >= 3 ? 'three-flush or more' : maxSuit === 2 ? 'two-tone' : 'rainbow'}, and ${connected ? 'connected enough for straight pressure' : 'relatively disconnected'}.`
  const strongestRead = reads
    .filter((read) => read.status === 'active')
    .sort((a, b) => (b.topHoldings[0]?.probability ?? 0) - (a.topHoldings[0]?.probability ?? 0))[0]

  const sections: StreetBriefing['sections'] = [
    {
      title: 'Board and made hand',
      tone: paired || maxSuit >= 3 || connected ? 'warning' : 'info',
      points: [texture, heroHand ? `Your current best five-card result is ${heroHand.description}.` : 'Before the flop, judge the two-card starting hand rather than a five-card category.'],
    },
    {
      title: 'Multiway pressure',
      tone: activeOpponents.length >= 3 ? 'warning' : 'info',
      points: [
        `${activeOpponents.length} opponent${activeOpponents.length === 1 ? '' : 's'} remain active; more opponents make one-pair hands less secure.`,
        strongestRead ? `${strongestRead.playerName} currently deserves attention: ${strongestRead.watchout}` : 'No opponent remains active in the model.',
      ],
    },
    {
      title: boardComplete ? 'Completed draw picture' : 'Improvement cards',
      tone: !boardComplete && draws.length ? 'opportunity' : 'info',
      points: boardComplete
        ? ['The board is complete, so there are no future community-card outs. Judge only the final made hands and plausible bluffs.']
        : draws.length
          ? draws.map((draw) => `${draw.label}: ${draw.outs}. These improve your hand but are not guaranteed winning outs.`)
          : ['No supported next-card improvement pattern is currently identified. Avoid inventing extra outs.'],
    },
    {
      title: 'Position and action signals',
      tone: hero && ['BTN', 'BTN/SB', 'CO'].includes(hero.position) ? 'opportunity' : 'info',
      points: [
        `You are in ${hero?.position ?? 'an unknown position'}; later position gives more information before acting.`,
        `${reads.filter((read) => read.status === 'active' && read.rangeStrength === 'very strong').length} active opponent range${reads.length === 1 ? '' : 's'} currently carry a strong raise signal.`,
      ],
    },
  ]

  if (difficulty !== 'beginner' && state.street === 'preflop') {
    sections.push({
      title: 'What to watch for on the flop',
      tone: 'warning',
      points: [
        'A coordinated or single-suit flop helps more drawing ranges than a dry, disconnected flop.',
        'With several opponents, top pair can be useful without being strong enough for a large pot.',
      ],
    })
  } else if (difficulty !== 'beginner' && (state.street === 'flop' || state.street === 'turn')) {
    sections.push({
      title: 'Threats on the next card',
      tone: 'warning',
      points: [
        maxSuit >= 2 ? 'Another card of the repeated suit can complete or strengthen flushes.' : 'No immediate suit concentration is visible.',
        connected ? 'Cards near the board ranks can complete straights for several ranges.' : 'Broadway overcards can still change top-pair and overpair relationships.',
      ],
    })
  } else if (difficulty !== 'beginner' && (state.street === 'river' || state.street === 'showdown')) {
    sections.push({
      title: 'Final-board watchouts',
      tone: 'warning',
      points: [
        'The five-card board is complete. Do not count future outs or price in another community card.',
        'Focus on value hands, bluff catchers, missed draws that may bluff, and how the final action fits each public range.',
      ],
    })
  }
  if (difficulty === 'advanced') {
    sections.push({
      title: 'Model limits and blockers',
      tone: 'info',
      points: [
        'Opponent profiles are conditioned on public actions and position, not their concealed cards or a solved range.',
        'Your visible cards remove combinations from opponents’ possible ranges, but this briefing does not claim exact combo-level blocker frequencies.',
        'Bet sizes, stack depth, action order, and player tendencies are simplified in this training model.',
      ],
    })
  }

  return {
    headline: `${state.street === 'showdown' ? 'Showdown review' : `${state.street[0].toUpperCase()}${state.street.slice(1)} briefing`}: ${activeOpponents.length} opponent${activeOpponents.length === 1 ? '' : 's'} in`,
    summary: difficulty === 'beginner'
      ? 'Start with your made hand, count only supported improvement cards, then compare that with how many opponents remain.'
      : 'Combine board texture, position, public action signals, and multiway risk; no single percentage is the whole decision.',
    sections,
    opponentReads: reads,
  }
}
