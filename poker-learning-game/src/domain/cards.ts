export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type PokerAction = 'fold' | 'check' | 'call' | 'raise'
export type PositionLabel = 'BTN/SB' | 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO'
export type PlayerStatus = 'active' | 'folded' | 'all-in'
export type BettingPhase = 'betting' | 'complete'
export type HeroResult = 'win' | 'loss' | 'tie'

export interface Card {
  rank: Rank
  suit: Suit
}

export interface HandValue {
  category: number
  categoryName: string
  tiebreakers: number[]
  description: string
  cards: Card[]
}

export interface DrawInsight {
  label: string
  explanation: string
  outs: number
  cards: Card[]
}

export interface EquityResult {
  equity: number
  win: number
  tie: number
  loss: number
  simulations: number
}

export interface CoachingAdvice {
  action: PokerAction
  headline: string
  reasoning: string[]
  potOdds: number
  edge: number
  confidence: 'low' | 'medium' | 'high'
}

export interface PlayerActionRecord {
  id: string
  street: Street
  action: PokerAction
  amount: number
  rationale: string
  signal: 'weak' | 'neutral' | 'strong'
}

export interface TablePlayer {
  id: string
  name: string
  seat: number
  position: PositionLabel
  isHero: boolean
  holeCards: Card[]
  status: PlayerStatus
  stack: number
  streetContribution: number
  totalContribution: number
  hasActed: boolean
  actions: PlayerActionRecord[]
  showdownHand?: HandValue
}

export interface HoldingProbability {
  label: string
  probability: number
  explanation: string
  examples: string[]
}

export interface OpponentRead {
  playerId: string
  playerName: string
  position: PositionLabel
  status: PlayerStatus
  topHoldings: HoldingProbability[]
  rangeStrength: 'wide' | 'balanced' | 'strong' | 'very strong'
  watchout: string
  modelBasis: string
}

export interface BriefingSection {
  title: string
  tone: 'info' | 'warning' | 'opportunity'
  points: string[]
}

export interface StreetBriefing {
  headline: string
  summary: string
  sections: BriefingSection[]
  opponentReads: OpponentRead[]
}

export interface TimelineEvent {
  id: string
  street: Street
  label: string
}

export interface GameState {
  handId: string
  street: Street
  deck: Card[]
  players: TablePlayer[]
  heroId: string
  playerCount: number
  dealerSeat: number
  communityCards: Card[]
  pot: number
  toCall: number
  phase: BettingPhase
  actingSeat: number | null
  currentBet: number
  minRaise: number
  lastAggressorSeat: number | null
  smallBlind: number
  bigBlind: number
  startingStack: number
  winnerIds: string[]
  heroNet: number | null
  heroResult: HeroResult | null
  resultSummary: HandResultSummary | null
  timeline: TimelineEvent[]
}

export interface LegalActions {
  toCall: number
  canFold: boolean
  canCheck: boolean
  canCall: boolean
  callAmount: number
  canRaise: boolean
  minRaiseTo: number
  maxRaiseTo: number
}

export interface BettingAction {
  type: PokerAction
  raiseTo?: number
}

export interface HandResultSummary {
  reason: 'showdown' | 'uncontested'
  potAwarded: number
  winnerIds: string[]
  winningHand: HandValue | null
  runnerUpIds: string[]
  runnerUpHand: HandValue | null
  analysisBoard: Card[]
  rankedHands: RankedHandResult[]
}

export interface RankedHandResult {
  rank: number
  playerId: string
  hand: HandValue
}

export interface AnalysisSnapshot {
  hand: HandValue | null
  equity: EquityResult
  draws: DrawInsight[]
  advice: CoachingAdvice
  briefing: StreetBriefing
}

export const cardId = (card: Card) => `${card.rank}-${card.suit}`

export const createDeck = (): Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))

export const rankLabel = (rank: Rank) =>
  rank === 'T' ? '10' : rank

export const suitSymbol = (suit: Suit) =>
  ({ clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' })[suit]

export const isRedSuit = (suit: Suit) => suit === 'diamonds' || suit === 'hearts'
