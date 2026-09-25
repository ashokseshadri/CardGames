import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CareerSnapshot } from '../career/contracts'
import { CareerDashboard } from './CareerDashboard'

const snapshot: CareerSnapshot = {
  availableChips: 1200,
  loanPrincipal: 300,
  loanInterestOwed: 12.5,
  totalDebt: 312.5,
  totalWon: 500,
  totalLost: 300,
  totalBorrowed: 300,
  totalRepaid: 0,
  totalInterestEarned: 2.5,
  totalInterestCharged: 12.5,
  handsPlayed: 8,
  wins: 5,
  losses: 3,
  ties: 0,
  lastAccruedAt: '2026-08-26T12:00:00.000Z',
  story: [{
    id: 1,
    occurredAt: '2026-08-26T12:00:00.000Z',
    type: 'career_started',
    amount: 1000,
    balanceAfter: 1000,
    debtAfter: 0,
    headline: 'Career started',
    detail: 'Your fictional-chip journey began.',
    handId: null,
  }],
}

function renderDashboard() {
  return render(<CareerDashboard mode="career" snapshot={snapshot} operation={null} error={null} onModeChange={vi.fn()} onBorrow={vi.fn()} onRepay={vi.fn()} onRetry={vi.fn()} />)
}

describe('CareerDashboard compact disclosures', () => {
  it('shows the three named controls collapsed with valid ARIA relationships', () => {
    renderDashboard()

    const buttons = [
      screen.getByRole('button', { name: 'Career Ledger' }),
      screen.getByRole('button', { name: 'Marginal Debt Bracket' }),
      screen.getByRole('button', { name: 'Career Story' }),
    ]

    for (const button of buttons) {
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(button.getAttribute('aria-controls')).toBeTruthy()
      expect(document.getElementById(button.getAttribute('aria-controls') ?? '')?.hidden).toBe(true)
    }
  })

  it('expands sections independently and collapses only the selected section', () => {
    renderDashboard()
    const ledger = screen.getByRole('button', { name: 'Career Ledger' })
    const debt = screen.getByRole('button', { name: 'Marginal Debt Bracket' })
    const story = screen.getByRole('button', { name: 'Career Story' })

    fireEvent.click(ledger)
    expect(ledger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Lifetime totals')).toBeTruthy()
    expect(document.getElementById(ledger.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)

    fireEvent.click(debt)
    fireEvent.click(story)
    expect(debt.getAttribute('aria-expanded')).toBe('true')
    expect(story.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(debt.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)
    expect(document.getElementById(story.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)
    expect(screen.getByText('Lifetime totals')).toBeTruthy()
    expect(screen.getByText('15% APR · First 1,000 band')).toBeTruthy()
    expect(screen.getByText('Your career story')).toBeTruthy()

    fireEvent.click(ledger)
    expect(ledger.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(ledger.getAttribute('aria-controls') ?? '')?.hidden).toBe(true)
    expect(document.getElementById(debt.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)
    expect(document.getElementById(story.getAttribute('aria-controls') ?? '')?.hidden).toBe(false)
  })
})
