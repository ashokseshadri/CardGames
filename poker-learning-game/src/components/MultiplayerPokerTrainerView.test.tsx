import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisSnapshot, GameState, LegalActions, TablePlayer } from '../domain/cards'
import { PokerTrainerView, type PokerTrainerViewProps } from './MultiplayerPokerTrainerView'

const players: TablePlayer[] = [
  {
    id: 'hero', name: 'Learner', seat: 0, position: 'BTN/SB', isHero: true,
    holeCards: [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
    status: 'active', stack: 95, streetContribution: 5, totalContribution: 5, hasActed: false, actions: [],
  },
  {
    id: 'bot', name: 'Maya', seat: 1, position: 'BB', isHero: false,
    holeCards: [{ rank: 'Q', suit: 'clubs' }, { rank: 'J', suit: 'diamonds' }],
    status: 'active', stack: 90, streetContribution: 10, totalContribution: 10, hasActed: true,
    actions: [{ id: 'bot-call', street: 'preflop', action: 'call', amount: 10, rationale: 'Matched the bet.', signal: 'neutral' }],
  },
]

const state: GameState = {
  handId: 'hand-betting-ui', street: 'preflop', deck: [], players, heroId: 'hero', playerCount: 2, dealerSeat: 0,
  communityCards: [], pot: 30, toCall: 5, phase: 'betting', actingSeat: 0, currentBet: 10, minRaise: 10,
  lastAggressorSeat: 1, smallBlind: 5, bigBlind: 10, startingStack: 100, winnerIds: [], heroNet: null, heroResult: null,
  resultSummary: null,
  timeline: [{ id: 'blinds', street: 'preflop', label: 'Blinds posted.' }],
}

const analysis: AnalysisSnapshot = {
  hand: null,
  equity: { equity: .58, win: .55, tie: .06, loss: .39, simulations: 1000 },
  draws: [],
  advice: { action: 'call', headline: 'Continue carefully', reasoning: ['Your price is reasonable.'], potOdds: .14, edge: .08, confidence: 'medium' },
  briefing: {
    headline: 'Pre-flop decision', summary: 'Read the action before choosing.', sections: [],
    opponentReads: [{ playerId: 'bot', playerName: 'Maya', position: 'BB', status: 'active', topHoldings: [], rangeStrength: 'balanced', watchout: 'A re-raise signals strength.', modelBasis: 'Visible actions only.' }],
  },
}

const checkActions: LegalActions = {
  toCall: 0, canFold: true, canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaiseTo: 20, maxRaiseTo: 80,
}

const callActions: LegalActions = {
  ...checkActions, toCall: 5, canCheck: false, canCall: true, callAmount: 5,
}

const replayBoard = [
  { rank: '2', suit: 'clubs' }, { rank: '3', suit: 'diamonds' }, { rank: '4', suit: 'hearts' },
  { rank: '8', suit: 'spades' }, { rank: '9', suit: 'clubs' },
] as const
const heroPair = { category: 1, categoryName: 'One pair', tiebreakers: [14, 9, 8, 4], description: 'Pair of aces', cards: [players[0].holeCards[0], players[0].holeCards[1], replayBoard[4], replayBoard[3], replayBoard[2]] }
const botPair = { category: 1, categoryName: 'One pair', tiebreakers: [13, 9, 8, 4], description: 'Pair of kings', cards: [players[1].holeCards[0], players[1].holeCards[1], replayBoard[4], replayBoard[3], replayBoard[2]] }

function renderView(overrides: Partial<PokerTrainerViewProps> = {}) {
  const props: PokerTrainerViewProps = {
    state,
    analysis,
    difficulty: 'beginner',
    isAnalyzing: false,
    onNewHand: vi.fn(),
    onPlayerCountChange: vi.fn(),
    onDifficultyChange: vi.fn(),
    legalActions: checkActions,
    onAction: vi.fn(),
    isBotActing: false,
    turnStatus: 'Your turn — choose a legal action',
    canStartNewHand: false,
    ...overrides,
  }
  return { ...render(<PokerTrainerView {...props} />), props }
}

describe('PokerTrainerView betting controls', () => {
  it('lays increasing seat numbers clockwise around the hero', () => {
    const thirdPlayer: TablePlayer = {
      ...players[1], id: 'bot-two', name: 'Noah', seat: 2, position: 'BB',
    }
    const threePlayers: TablePlayer[] = [
      { ...players[0], position: 'BTN' },
      { ...players[1], position: 'SB' },
      thirdPlayer,
    ]
    renderView({ state: { ...state, players: threePlayers, playerCount: 3 } })
    expect(screen.getByLabelText(/Learner, BTN,/).classList.contains('table-seat--slot-0')).toBe(true)
    expect(screen.getByLabelText(/Maya, SB,/).classList.contains('table-seat--slot-4')).toBe(true)
    expect(screen.getByLabelText(/Noah, BB,/).classList.contains('table-seat--slot-2')).toBe(true)
  })

  it('renders only exact legal check controls and authoritative table state', () => {
    const onAction = vi.fn()
    renderView({ onAction })

    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Call/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Raise' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'New hand' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByLabelText('Training pot')).toBeNull()
    expect(screen.queryByText(/Deal the flop/)).toBeNull()
    expect(screen.queryByText('Official result')).toBeNull()

    const actingSeat = screen.getByLabelText(/Learner, BTN\/SB, active, 95 chips in stack, 5 committed this street, acting now/)
    expect(actingSeat.getAttribute('aria-current')).toBe('true')
    expect(within(actingSeat).getByText('Stack')).toBeTruthy()
    expect(within(actingSeat).getByText('95')).toBeTruthy()
    expect(within(actingSeat).getByText('This street')).toBeTruthy()
    expect(within(actingSeat).getByText('5')).toBeTruthy()
    expect(screen.getByTitle('Dealer button')).toBeTruthy()
    expect(screen.getByTitle('Small blind')).toBeTruthy()
    expect(screen.getByTitle('Big blind')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText(/Quick guide:/)).toBeTruthy()
    expect(screen.getByText('Your turn — choose a legal action').closest('[role="status"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check' }))
    expect(onAction).toHaveBeenCalledWith({ type: 'check' })
  })

  it('shows Call N instead of Check when chips are required', () => {
    renderView({ legalActions: callActions })
    expect(screen.getByRole('button', { name: 'Call 5' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
  })

  it('offers clamped raise presets and validates a custom total before dispatch', () => {
    const onAction = vi.fn()
    const { container } = renderView({ legalActions: callActions, onAction })
    const raise = screen.getByRole('button', { name: 'Raise' })
    fireEvent.click(raise)

    expect(raise.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(raise.getAttribute('aria-controls') ?? '')).toBeTruthy()
    expect(container.querySelector('.raise-presets')).toBeTruthy()
    const halfPot = screen.getByText('Half pot').closest('button')
    expect(halfPot).toBeTruthy()
    fireEvent.click(halfPot as HTMLButtonElement)
    expect((screen.getByLabelText('Custom raise total') as HTMLInputElement).value).toBe('28')
    fireEvent.click(screen.getByRole('button', { name: 'Raise to 28' }))
    expect(onAction).toHaveBeenCalledWith({ type: 'raise', raiseTo: 28 })

    fireEvent.click(screen.getByRole('button', { name: 'Raise' }))
    const custom = screen.getByLabelText('Custom raise total') as HTMLInputElement
    fireEvent.change(custom, { target: { value: '999' } })
    expect(custom.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('button', { name: 'Raise to 20' }).hasAttribute('disabled')).toBe(true)
    fireEvent.blur(custom)
    expect(custom.value).toBe('80')
    expect(custom.getAttribute('aria-invalid')).toBe('false')
  })

  it('keeps every hero action disabled while a bot is acting and announces status', () => {
    const { container } = renderView({ legalActions: callActions, isBotActing: true, turnStatus: 'Maya is deciding' })
    for (const button of ['Fold', 'Call 5', 'Raise']) {
      expect(screen.getByRole('button', { name: button }).hasAttribute('disabled')).toBe(true)
    }
    expect(screen.getByText('Maya is deciding').closest('[role="status"]')?.getAttribute('aria-live')).toBe('polite')
    expect(container.querySelector('.action-controls')).toBeTruthy()
    expect(container.querySelector('.betting-controls')).toBeTruthy()
  })

  it('enables New hand only when the terminal gate allows it', () => {
    const onNewHand = vi.fn()
    renderView({
      state: { ...state, street: 'showdown', phase: 'complete', actingSeat: null },
      legalActions: null,
      turnStatus: 'Hand complete',
      canStartNewHand: true,
      onNewHand,
    })
    const newHand = screen.getByRole('button', { name: 'New hand' })
    expect(newHand.hasAttribute('disabled')).toBe(false)
    fireEvent.click(newHand)
    expect(onNewHand).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Fold' })).toBeNull()
  })

  it('summarizes the official showdown and ranks all dealt hands', () => {
    renderView({
      state: {
        ...state, street: 'showdown', phase: 'complete', actingSeat: null, pot: 0,
        winnerIds: ['hero'], heroNet: 15, heroResult: 'win',
        resultSummary: {
          reason: 'showdown', potAwarded: 30, winnerIds: ['hero'], winningHand: heroPair,
          runnerUpIds: ['bot'], runnerUpHand: botPair, analysisBoard: [...replayBoard],
          rankedHands: [
            { rank: 1, playerId: 'hero', hand: heroPair },
            { rank: 2, playerId: 'bot', hand: botPair },
          ],
        },
      },
      legalActions: null, turnStatus: 'Hand complete', canStartNewHand: true,
    })
    expect(screen.getByRole('heading', { name: 'Learner won 30 chips' })).toBeTruthy()
    expect(screen.getByText('Winning hand · Learner')).toBeTruthy()
    expect(screen.getByText('Official runner-up · Maya')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Every dealt hand, strongest to weakest' })).toBeTruthy()
    const rankings = document.querySelectorAll('.ranked-hands > li')
    expect(rankings).toHaveLength(2)
    expect(rankings[0].textContent).toMatch(/#1.*Learner.*One pair/)
    expect(rankings[1].textContent).toMatch(/#2.*Maya.*One pair/)
  })

  it('shows a folded learner what-if without changing an uncontested official result', () => {
    renderView({
      state: {
        ...state, phase: 'complete', actingSeat: null, pot: 0,
        players: [{ ...players[0], status: 'folded' }, players[1]],
        winnerIds: ['bot'], heroNet: -5, heroResult: 'loss',
        resultSummary: {
          reason: 'uncontested', potAwarded: 15, winnerIds: ['bot'], winningHand: null,
          runnerUpIds: [], runnerUpHand: null, analysisBoard: [...replayBoard],
          rankedHands: [
            { rank: 1, playerId: 'hero', hand: heroPair },
            { rank: 2, playerId: 'bot', hand: botPair },
          ],
        },
      },
      legalActions: null, turnStatus: 'Hand complete', canStartNewHand: true,
    })
    expect(screen.getByRole('heading', { name: 'Maya won 15 chips' })).toBeTruthy()
    expect(screen.getByText(/awarded without comparing hands/i)).toBeTruthy()
    expect(screen.getByText(/Your fold what-if:/).closest('p')?.textContent).toMatch(/ranked #1 of 2/)
    expect(screen.getByText(/Later betting decisions and the final pot could have been different/i)).toBeTruthy()
    expect(screen.queryByText(/Official runner-up/)).toBeNull()
  })
})
