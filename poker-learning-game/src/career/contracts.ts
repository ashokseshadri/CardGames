export type CareerMode = 'practice' | 'career'
export type CareerOutcome = 'win' | 'loss' | 'tie'
export type CareerEntryType = 'career_started' | 'round_win' | 'round_loss' | 'round_tie' | 'borrowed' | 'repaid' | 'daily_interest'

export interface CareerStoryEntry {
  id: number
  occurredAt: string
  type: CareerEntryType
  amount: number
  balanceAfter: number
  debtAfter: number
  headline: string
  detail: string
  handId: string | null
}

export interface CareerSnapshot {
  availableChips: number
  loanPrincipal: number
  loanInterestOwed: number
  totalDebt: number
  totalWon: number
  totalLost: number
  totalBorrowed: number
  totalRepaid: number
  totalInterestEarned: number
  totalInterestCharged: number
  handsPlayed: number
  wins: number
  losses: number
  ties: number
  lastAccruedAt: string
  story: CareerStoryEntry[]
}

export interface CareerRoundRequest {
  handId: string
  outcome: CareerOutcome
  netChips: number
  tableStack: number
}

export interface CareerApiError {
  error: string
  code: string
}

export const CAREER_ROUND_CHIPS = 100
export const CAREER_STARTING_CHIPS = 0
export const CAREER_SAVINGS_APR = 0.05
