import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const DAY_MS = 24 * 60 * 60 * 1000
export const STARTING_CHIPS = 0
export const ROUND_CHIPS = 100
export const SAVINGS_APR = 0.05

export class CareerLedgerError extends Error {
  constructor(message, code = 'CAREER_ERROR', status = 400) {
    super(message)
    this.name = 'CareerLedgerError'
    this.code = code
    this.status = status
  }
}

export const round4 = (amount) => Number(Number(amount).toFixed(4))

export const dailyDebtInterest = (totalDebt) => {
  const debt = Math.max(0, totalDebt)
  const first = Math.min(debt, 1000)
  const second = Math.min(Math.max(debt - 1000, 0), 4000)
  const third = Math.max(debt - 5000, 0)
  return round4(first * 0.15 / 365 + second * 0.20 / 365 + third * 0.40 / 365)
}

const outcomeForType = (type) => ({ round_win: 'win', round_loss: 'loss', round_tie: 'tie' })[type]

const validateHandId = (handId) => {
  if (typeof handId !== 'string' || handId.length < 1 || handId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(handId)) {
    throw new CareerLedgerError('handId must be 1–128 safe identifier characters.', 'INVALID_HAND_ID', 400)
  }
}

const validateOutcome = (outcome) => {
  if (!['win', 'loss', 'tie'].includes(outcome)) {
    throw new CareerLedgerError('outcome must be win, loss, or tie.', 'INVALID_OUTCOME', 400)
  }
}

const validateNetChips = (netChips) => {
  if (!Number.isInteger(netChips) || netChips < -ROUND_CHIPS || netChips > ROUND_CHIPS * 5) {
    throw new CareerLedgerError('netChips must be an integer from -100 through 500.', 'INVALID_NET_CHIPS', 400)
  }
}

const validateTableStack = (tableStack) => {
  if (!Number.isInteger(tableStack) || tableStack < 1 || tableStack > ROUND_CHIPS) {
    throw new CareerLedgerError('tableStack must be an integer from 1 through 100.', 'INVALID_TABLE_STACK', 400)
  }
}

const transaction = (db, operation) => {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* Preserve the original failure. */ }
    throw error
  }
}

const schema = `
  CREATE TABLE IF NOT EXISTS career_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    available_chips REAL NOT NULL,
    loan_principal REAL NOT NULL,
    loan_interest_owed REAL NOT NULL,
    total_won REAL NOT NULL,
    total_lost REAL NOT NULL,
    total_borrowed REAL NOT NULL,
    total_repaid REAL NOT NULL,
    total_interest_earned REAL NOT NULL,
    total_interest_charged REAL NOT NULL,
    hands_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ties INTEGER NOT NULL,
    last_accrued_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS career_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    occurred_at TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    debt_after REAL NOT NULL,
    headline TEXT NOT NULL,
    detail TEXT NOT NULL,
    hand_id TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS career_transactions_hand_id
    ON career_transactions(hand_id) WHERE hand_id IS NOT NULL;
`

export const openCareerLedger = ({
  dbPath = resolve('data/career.sqlite'),
  now = () => new Date(),
  storyLimit = 100,
} = {}) => {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (dbPath !== ':memory:') db.exec('PRAGMA journal_mode = WAL')

  transaction(db, () => {
    const version = Number(db.prepare('PRAGMA user_version').get().user_version)
    if (version > 1) throw new CareerLedgerError('Career database is newer than this server.', 'DATABASE_VERSION_UNSUPPORTED', 500)
    if (version < 1) {
      db.exec(schema)
      db.exec('PRAGMA user_version = 1')
    } else {
      db.exec(schema)
    }
    const existing = db.prepare('SELECT id FROM career_profile WHERE id = 1').get()
    if (!existing) {
      const timestamp = now().toISOString()
      db.prepare(`INSERT INTO career_profile (
        id, available_chips, loan_principal, loan_interest_owed,
        total_won, total_lost, total_borrowed, total_repaid,
        total_interest_earned, total_interest_charged,
        hands_played, wins, losses, ties, last_accrued_at
      ) VALUES (1, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)`).run(STARTING_CHIPS, timestamp)
      db.prepare(`INSERT INTO career_transactions
        (occurred_at, type, amount, balance_after, debt_after, headline, detail, hand_id)
        VALUES (?, 'career_started', ?, ?, 0, ?, ?, NULL)`).run(
        timestamp,
        STARTING_CHIPS,
        STARTING_CHIPS,
        'Career started at 0 fictional chips',
        'Borrow exactly 100 fictional chips before the first career round. Chips have no monetary value.',
      )
    }
  })

  const profile = () => db.prepare('SELECT * FROM career_profile WHERE id = 1').get()

  const appendStory = ({ occurredAt, type, amount, balanceAfter, debtAfter, headline, detail, handId = null }) => {
    db.prepare(`INSERT INTO career_transactions
      (occurred_at, type, amount, balance_after, debt_after, headline, detail, hand_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      occurredAt, type, round4(amount), round4(balanceAfter), round4(debtAfter), headline, detail, handId,
    )
  }

  const accrue = () => {
    const row = profile()
    const current = now()
    const anchorMs = Date.parse(row.last_accrued_at)
    const elapsed = current.getTime() - anchorMs
    const days = elapsed > 0 ? Math.floor(elapsed / DAY_MS) : 0
    if (days < 1) return row

    let available = row.available_chips
    let interestOwed = row.loan_interest_owed
    let earned = 0
    let charged = 0
    for (let day = 0; day < days; day += 1) {
      const savings = round4(available * SAVINGS_APR / 365)
      const debtCharge = dailyDebtInterest(round4(row.loan_principal + interestOwed))
      available = round4(available + savings)
      interestOwed = round4(interestOwed + debtCharge)
      earned = round4(earned + savings)
      charged = round4(charged + debtCharge)
    }
    const accruedAt = new Date(anchorMs + days * DAY_MS).toISOString()
    db.prepare(`UPDATE career_profile SET
      available_chips = ?, loan_interest_owed = ?,
      total_interest_earned = ?, total_interest_charged = ?, last_accrued_at = ?
      WHERE id = 1`).run(
      available,
      interestOwed,
      round4(row.total_interest_earned + earned),
      round4(row.total_interest_charged + charged),
      accruedAt,
    )
    appendStory({
      occurredAt: current.toISOString(),
      type: 'daily_interest',
      amount: round4(earned - charged),
      balanceAfter: available,
      debtAfter: round4(row.loan_principal + interestOwed),
      headline: `${days} full UTC day${days === 1 ? '' : 's'} accrued`,
      detail: `Savings earned ${earned.toFixed(4)} chips; debt interest charged ${charged.toFixed(4)} chips.`,
    })
    return profile()
  }

  const snapshot = () => {
    const row = profile()
    const storyRows = db.prepare(`SELECT * FROM (
      SELECT * FROM career_transactions ORDER BY id DESC LIMIT ?
    ) ORDER BY id ASC`).all(storyLimit)
    return {
      availableChips: round4(row.available_chips),
      loanPrincipal: round4(row.loan_principal),
      loanInterestOwed: round4(row.loan_interest_owed),
      totalDebt: round4(row.loan_principal + row.loan_interest_owed),
      totalWon: round4(row.total_won),
      totalLost: round4(row.total_lost),
      totalBorrowed: round4(row.total_borrowed),
      totalRepaid: round4(row.total_repaid),
      totalInterestEarned: round4(row.total_interest_earned),
      totalInterestCharged: round4(row.total_interest_charged),
      handsPlayed: row.hands_played,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
      lastAccruedAt: row.last_accrued_at,
      story: storyRows.map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurred_at,
        type: entry.type,
        amount: round4(entry.amount),
        balanceAfter: round4(entry.balance_after),
        debtAfter: round4(entry.debt_after),
        headline: entry.headline,
        detail: entry.detail,
        handId: entry.hand_id,
      })),
    }
  }

  const read = () => transaction(db, () => {
    accrue()
    return snapshot()
  })

  const borrow = () => transaction(db, () => {
    const row = accrue()
    const timestamp = now().toISOString()
    const available = round4(row.available_chips + ROUND_CHIPS)
    const principal = round4(row.loan_principal + ROUND_CHIPS)
    db.prepare(`UPDATE career_profile SET available_chips = ?, loan_principal = ?, total_borrowed = ? WHERE id = 1`).run(
      available, principal, round4(row.total_borrowed + ROUND_CHIPS),
    )
    appendStory({
      occurredAt: timestamp, type: 'borrowed', amount: ROUND_CHIPS,
      balanceAfter: available, debtAfter: round4(principal + row.loan_interest_owed),
      headline: 'Borrowed 100 fictional chips',
      detail: 'The career balance increased by exactly 100 chips; this is only a game mechanic.',
    })
    return snapshot()
  })

  const repay = () => transaction(db, () => {
    const row = accrue()
    const totalDebt = round4(row.loan_principal + row.loan_interest_owed)
    if (totalDebt <= 0) throw new CareerLedgerError('There is no fictional-chip debt to repay.', 'NO_DEBT', 409)
    if (row.available_chips <= 0) throw new CareerLedgerError('No available chips can be used for repayment.', 'INSUFFICIENT_CHIPS', 409)
    const payment = round4(Math.min(ROUND_CHIPS, row.available_chips, totalDebt))
    const interestPayment = round4(Math.min(payment, row.loan_interest_owed))
    const principalPayment = round4(payment - interestPayment)
    const available = round4(row.available_chips - payment)
    const interest = round4(row.loan_interest_owed - interestPayment)
    const principal = round4(row.loan_principal - principalPayment)
    db.prepare(`UPDATE career_profile SET
      available_chips = ?, loan_interest_owed = ?, loan_principal = ?, total_repaid = ? WHERE id = 1`).run(
      available, interest, principal, round4(row.total_repaid + payment),
    )
    appendStory({
      occurredAt: now().toISOString(), type: 'repaid', amount: -payment,
      balanceAfter: available, debtAfter: round4(principal + interest),
      headline: `Repaid ${payment.toFixed(4)} fictional chips`,
      detail: `${interestPayment.toFixed(4)} went to interest first; ${principalPayment.toFixed(4)} reduced principal.`,
    })
    return snapshot()
  })

  const settleRound = ({ handId, outcome, netChips, tableStack = ROUND_CHIPS } = {}) => transaction(db, () => {
    validateHandId(handId)
    validateOutcome(outcome)
    validateNetChips(netChips)
    validateTableStack(tableStack)
    if (netChips < -tableStack) {
      throw new CareerLedgerError('netChips cannot lose more than the starting table stack.', 'INVALID_NET_CHIPS', 400)
    }
    const row = accrue()
    const prior = db.prepare('SELECT type, amount FROM career_transactions WHERE hand_id = ?').get(handId)
    if (prior) {
      if (outcomeForType(prior.type) === outcome && round4(prior.amount) === netChips) return snapshot()
      throw new CareerLedgerError('This handId was already settled with a different outcome or chip result.', 'HAND_CONFLICT', 409)
    }
    if (row.available_chips < tableStack) {
      throw new CareerLedgerError(`At least ${tableStack} available chips are required to settle this career round.`, 'INSUFFICIENT_CHIPS', 409)
    }
    const available = round4(row.available_chips + netChips)
    db.prepare(`UPDATE career_profile SET
      available_chips = ?, total_won = ?, total_lost = ?, hands_played = hands_played + 1,
      wins = wins + ?, losses = losses + ?, ties = ties + ? WHERE id = 1`).run(
      available,
      round4(row.total_won + Math.max(0, netChips)),
      round4(row.total_lost + Math.max(0, -netChips)),
      outcome === 'win' ? 1 : 0,
      outcome === 'loss' ? 1 : 0,
      outcome === 'tie' ? 1 : 0,
    )
    const type = `round_${outcome}`
    appendStory({
      occurredAt: now().toISOString(), type, amount: netChips,
      balanceAfter: available, debtAfter: round4(row.loan_principal + row.loan_interest_owed),
      headline: netChips > 0
        ? `Career round ${outcome}: +${netChips} chips`
        : netChips < 0
          ? `Career round ${outcome}: −${Math.abs(netChips)} chips`
          : `Career round ${outcome}: no chip change`,
      detail: `Hand ${handId} began with ${tableStack} chips and was settled once as a ${outcome} using its actual table-stack result.`, handId,
    })
    return snapshot()
  })

  return {
    read,
    borrow,
    repay,
    settleRound,
    close: () => db.close(),
    database: db,
  }
}
