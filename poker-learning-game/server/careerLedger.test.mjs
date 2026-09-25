// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dailyDebtInterest, DAY_MS, openCareerLedger, round4 } from './careerLedger.mjs'

const resources = []

const testLedger = (initial = '2026-01-01T00:00:00.000Z') => {
  const directory = mkdtempSync(join(tmpdir(), 'poker-career-'))
  let current = new Date(initial)
  const dbPath = join(directory, 'career.sqlite')
  const ledger = openCareerLedger({ dbPath, now: () => new Date(current) })
  resources.push({ ledger, directory })
  return {
    ledger,
    dbPath,
    setNow: (value) => { current = new Date(value) },
    advanceDays: (days) => { current = new Date(current.getTime() + days * DAY_MS) },
  }
}

afterEach(() => {
  while (resources.length) {
    const { ledger, directory } = resources.pop()
    try { ledger.close() } catch { /* Already closed by a persistence test. */ }
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('career interest math', () => {
  it('applies marginal debt rates exactly at and around bracket boundaries', () => {
    expect(dailyDebtInterest(0)).toBe(0)
    expect(dailyDebtInterest(1000)).toBe(round4(1000 * 0.15 / 365))
    expect(dailyDebtInterest(1001)).toBe(round4(1000 * 0.15 / 365 + 1 * 0.20 / 365))
    expect(dailyDebtInterest(5000)).toBe(round4(1000 * 0.15 / 365 + 4000 * 0.20 / 365))
    expect(dailyDebtInterest(5001)).toBe(round4(1000 * 0.15 / 365 + 4000 * 0.20 / 365 + 1 * 0.40 / 365))
  })

  it('compounds savings once per full elapsed 24-hour UTC day', () => {
    const { ledger, advanceDays, setNow } = testLedger()
    ledger.borrow()
    setNow('2026-01-01T23:59:59.999Z')
    expect(ledger.read().availableChips).toBe(100)
    advanceDays(3)
    const snapshot = ledger.read()
    let expected = 100
    for (let day = 0; day < 3; day += 1) expected = round4(expected + round4(expected * 0.05 / 365))
    expect(snapshot.availableChips).toBe(expected)
    expect(snapshot.totalInterestEarned).toBe(round4(expected - 100))
    expect(snapshot.story.filter(({ type }) => type === 'daily_interest')).toHaveLength(1)
  })

  it('compounds interest on principal plus previously charged debt interest', () => {
    const { ledger, advanceDays } = testLedger()
    for (let count = 0; count < 11; count += 1) ledger.borrow()
    advanceDays(2)
    const snapshot = ledger.read()
    const dayOne = dailyDebtInterest(1100)
    const dayTwo = dailyDebtInterest(round4(1100 + dayOne))
    expect(snapshot.loanInterestOwed).toBe(round4(dayOne + dayTwo))
  })

  it('does not accrue a partial day or move the anchor backward', () => {
    const { ledger, setNow } = testLedger('2026-03-10T12:00:00.000Z')
    const initial = ledger.read()
    setNow('2026-03-09T12:00:00.000Z')
    expect(ledger.read()).toMatchObject({ availableChips: 0, lastAccruedAt: initial.lastAccruedAt })
    setNow('2026-03-11T11:59:59.999Z')
    expect(ledger.read()).toMatchObject({ availableChips: 0, lastAccruedAt: initial.lastAccruedAt })
  })
})

describe('career persistence and mutations', () => {
  it('persists a career after closing and reopening the database', () => {
    const fixture = testLedger()
    fixture.ledger.borrow()
    fixture.ledger.settleRound({ handId: 'persist-1', outcome: 'win', netChips: 37 })
    fixture.ledger.close()
    const reopened = openCareerLedger({ dbPath: fixture.dbPath, now: () => new Date('2026-01-01T00:00:00.000Z') })
    resources.push({ ledger: reopened, directory: fixture.dbPath.replace(/\/career\.sqlite$/, '') })
    const snapshot = reopened.read()
    expect(snapshot).toMatchObject({ availableChips: 137, loanPrincipal: 100, totalBorrowed: 100, totalWon: 37, handsPlayed: 1 })
    expect(Number(reopened.database.prepare('PRAGMA user_version').get().user_version)).toBe(1)
  })

  it('borrows exactly 100 without a maximum and repays interest before principal', () => {
    const { ledger, advanceDays } = testLedger()
    for (let count = 0; count < 60; count += 1) ledger.borrow()
    expect(ledger.read()).toMatchObject({ availableChips: 6000, loanPrincipal: 6000, totalBorrowed: 6000 })
    advanceDays(1)
    const accrued = ledger.read()
    expect(accrued.loanInterestOwed).toBeGreaterThan(0)
    const repaid = ledger.repay()
    expect(repaid.loanInterestOwed).toBe(0)
    expect(repaid.loanPrincipal).toBe(round4(6000 - (100 - accrued.loanInterestOwed)))
    expect(repaid.totalRepaid).toBe(100)
  })

  it('settles a hand once, returns identical duplicates idempotently, and rejects conflicts', () => {
    const { ledger } = testLedger()
    ledger.borrow()
    const first = ledger.settleRound({ handId: 'hand-42', outcome: 'win', netChips: 65 })
    const duplicate = ledger.settleRound({ handId: 'hand-42', outcome: 'win', netChips: 65 })
    expect(duplicate).toEqual(first)
    expect(duplicate).toMatchObject({ availableChips: 165, totalWon: 65, handsPlayed: 1, wins: 1 })
    expect(() => ledger.settleRound({ handId: 'hand-42', outcome: 'win', netChips: 64 })).toThrowError(expect.objectContaining({ code: 'HAND_CONFLICT' }))
    expect(() => ledger.settleRound({ handId: 'hand-42', outcome: 'loss', netChips: -65 })).toThrowError(expect.objectContaining({ code: 'HAND_CONFLICT' }))
    expect(ledger.read()).toMatchObject({ availableChips: 165, handsPlayed: 1 })
  })

  it('accounts actual positive, negative, and zero table results independently from the record label', () => {
    const { ledger } = testLedger()
    ledger.borrow()
    ledger.borrow()
    ledger.settleRound({ handId: 'actual-win', outcome: 'win', netChips: 42 })
    ledger.settleRound({ handId: 'actual-loss', outcome: 'loss', netChips: -17 })
    const snapshot = ledger.settleRound({ handId: 'actual-tie', outcome: 'tie', netChips: 0 })
    expect(snapshot).toMatchObject({
      availableChips: 225,
      totalWon: 42,
      totalLost: 17,
      handsPlayed: 3,
      wins: 1,
      losses: 1,
      ties: 1,
    })
    expect(snapshot.story.filter(({ handId }) => handId?.startsWith('actual-')).map(({ amount }) => amount)).toEqual([42, -17, 0])
  })

  it('starts at zero, requires the first borrow, then permits a funded round', () => {
    const { ledger } = testLedger()
    const fresh = ledger.read()
    expect(fresh).toMatchObject({ availableChips: 0, totalDebt: 0, handsPlayed: 0 })
    expect(fresh.story[0]).toMatchObject({ type: 'career_started', amount: 0, balanceAfter: 0 })
    expect(fresh.story[0].detail).toMatch(/Borrow exactly 100/)
    expect(() => ledger.settleRound({ handId: 'too-soon', outcome: 'tie', netChips: 0 })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_CHIPS' }))
    expect(ledger.read()).toMatchObject({ availableChips: 0, handsPlayed: 0 })
    expect(ledger.borrow()).toMatchObject({ availableChips: 100, loanPrincipal: 100, totalBorrowed: 100 })
    expect(ledger.settleRound({ handId: 'first-funded', outcome: 'tie', netChips: 0 })).toMatchObject({ availableChips: 100, handsPlayed: 1, ties: 1 })
  })

  it('settles a short-stack hand when the remaining positive balance funds it', () => {
    const { ledger } = testLedger()
    ledger.borrow()
    ledger.settleRound({ handId: 'loss-ten', outcome: 'loss', netChips: -10, tableStack: 100 })
    expect(ledger.read()).toMatchObject({ availableChips: 90 })
    expect(ledger.settleRound({ handId: 'short-stack', outcome: 'tie', netChips: 0, tableStack: 90 })).toMatchObject({ availableChips: 90, handsPlayed: 2 })
    expect(() => ledger.settleRound({ handId: 'over-loss', outcome: 'loss', netChips: -91, tableStack: 90 })).toThrowError(expect.objectContaining({ code: 'INVALID_NET_CHIPS' }))
  })

  it('rolls back malformed and underfunded settlements without partial writes', () => {
    const { ledger, advanceDays } = testLedger()
    expect(() => ledger.settleRound({ handId: '', outcome: 'win', netChips: 25 })).toThrowError(expect.objectContaining({ code: 'INVALID_HAND_ID' }))
    expect(() => ledger.settleRound({ handId: 'bad-net', outcome: 'win', netChips: 501 })).toThrowError(expect.objectContaining({ code: 'INVALID_NET_CHIPS' }))
    ledger.borrow()
    ledger.settleRound({ handId: 'loss-0', outcome: 'loss', netChips: -100 })
    const before = ledger.read()
    advanceDays(1)
    expect(() => ledger.settleRound({ handId: 'underfunded-win', outcome: 'win', netChips: 40 })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_CHIPS' }))
    expect(() => ledger.settleRound({ handId: 'loss-11', outcome: 'loss', netChips: -25 })).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_CHIPS' }))
    const after = ledger.read()
    expect(after).toMatchObject({ availableChips: 0, handsPlayed: 1, losses: 1 })
    expect(after.story.filter(({ handId }) => handId === 'loss-11')).toHaveLength(0)
    expect(after.story.length).toBe(before.story.length + 1)
  })
})
