import { useId, useState, type ReactNode } from 'react'
import type { CareerClientError, CareerOperation } from '../career/useCareer'
import type { CareerMode, CareerSnapshot, CareerStoryEntry } from '../career/contracts'
import { CAREER_ROUND_CHIPS, CAREER_SAVINGS_APR } from '../career/contracts'
import '../styles/career.css'

export interface CareerDashboardProps {
  mode: CareerMode
  snapshot: CareerSnapshot | null
  operation: CareerOperation
  error: CareerClientError | null
  onModeChange: (mode: CareerMode) => void
  onBorrow: () => void | Promise<unknown>
  onRepay: () => void | Promise<unknown>
  onRetry: () => void | Promise<unknown>
  canRepayNow?: boolean
  modeChangeLocked?: boolean
}

const chips = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const storyDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const formatChips = (value: number) => chips.format(value)

function marginalDebtBand(totalDebt: number) {
  if (totalDebt <= 0) return { rate: '15% APR', label: 'No active debt', detail: 'The first 1,000 borrowed chips use the lowest fictional debt band.' }
  if (totalDebt < 1000) return { rate: '15% APR', label: 'First 1,000 band', detail: `${formatChips(1000 - totalDebt)} chips remain before the next band.` }
  if (totalDebt < 5000) return { rate: '20% APR', label: '1,000–5,000 band', detail: `${formatChips(5000 - totalDebt)} chips remain before the highest band.` }
  return { rate: '40% APR', label: '5,000+ marginal band', detail: 'Additional fictional debt above 5,000 accrues in the highest marginal band.' }
}

function ModeSwitch({ mode, onChange, locked = false }: { mode: CareerMode; onChange: (mode: CareerMode) => void; locked?: boolean }) {
  return (
    <fieldset className="career-mode-switch">
      <legend>Training mode</legend>
      <div>
        {(['practice', 'career'] as CareerMode[]).map((option) => (
          <label key={option}>
            <input type="radio" name="career-mode" value={option} checked={mode === option} disabled={locked} onChange={() => onChange(option)} />
            <span>{option === 'practice' ? 'Practice' : 'Career'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function DashboardLoading() {
  return (
    <div className="career-loading" role="status" aria-live="polite">
      <span className="career-spinner" aria-hidden="true" />
      <div><strong>Opening your local career…</strong><p>Applying any full days of fictional interest.</p></div>
    </div>
  )
}

function CareerError({ error, onRetry }: { error: CareerClientError; onRetry: () => void | Promise<unknown> }) {
  return (
    <div className="career-error" role="alert">
      <span aria-hidden="true">!</span>
      <div><strong>Career data is temporarily unavailable</strong><p>{error.message}</p><small>Code: {error.code}</small></div>
      {error.retryable && <button type="button" onClick={() => void onRetry()}>Try again</button>}
    </div>
  )
}

function BalanceCard({ snapshot }: { snapshot: CareerSnapshot }) {
  return (
    <section className="career-balance" aria-labelledby="career-balance-title">
      <div><p className="career-kicker">Available to play</p><h3 id="career-balance-title">{formatChips(snapshot.availableChips)}</h3><span>fictional training chips</span></div>
      <dl><div><dt>Total debt</dt><dd>{formatChips(snapshot.totalDebt)}</dd></div><div><dt>Principal</dt><dd>{formatChips(snapshot.loanPrincipal)}</dd></div><div><dt>Interest owed</dt><dd>{formatChips(snapshot.loanInterestOwed)}</dd></div></dl>
    </section>
  )
}

function RecordCard({ snapshot }: { snapshot: CareerSnapshot }) {
  const played = Math.max(1, snapshot.handsPlayed)
  const winRate = snapshot.handsPlayed ? (snapshot.wins / played) * 100 : 0
  return (
    <section className="career-record" aria-labelledby="career-record-title">
      <div className="career-panel-heading"><div><p className="career-kicker">Lifetime record</p><h3 id="career-record-title">{snapshot.wins}–{snapshot.losses}–{snapshot.ties}</h3></div><span>{winRate.toFixed(0)}% wins</span></div>
      <div className="record-track" role="img" aria-label={`${snapshot.wins} wins, ${snapshot.losses} losses, and ${snapshot.ties} ties`}><i className="record-track__wins" style={{ width: `${(snapshot.wins / played) * 100}%` }} /><i className="record-track__ties" style={{ width: `${(snapshot.ties / played) * 100}%` }} /></div>
      <p>{snapshot.handsPlayed} settled hand{snapshot.handsPlayed === 1 ? '' : 's'} · Each hand starts with {CAREER_ROUND_CHIPS} table chips and records the actual net result.</p>
    </section>
  )
}

function LifetimeStats({ snapshot }: { snapshot: CareerSnapshot }) {
  const metrics = [
    ['Won', snapshot.totalWon, 'positive'],
    ['Lost', snapshot.totalLost, 'negative'],
    ['Borrowed', snapshot.totalBorrowed, 'neutral'],
    ['Repaid', snapshot.totalRepaid, 'positive'],
    ['Interest earned', snapshot.totalInterestEarned, 'positive'],
    ['Interest charged', snapshot.totalInterestCharged, 'negative'],
  ] as const
  return (
    <section className="career-stat-panel" aria-labelledby="career-totals-title">
      <div className="career-panel-heading"><div><p className="career-kicker">Career ledger</p><h3 id="career-totals-title">Lifetime totals</h3></div><span>Local profile</span></div>
      <dl className="career-stats">{metrics.map(([label, value, tone]) => <div key={label}><dt>{label}</dt><dd className={`career-value--${tone}`}>{formatChips(value)}</dd><small>chips</small></div>)}</dl>
    </section>
  )
}

function DebtBand({ snapshot }: { snapshot: CareerSnapshot }) {
  const band = marginalDebtBand(snapshot.totalDebt)
  return (
    <section className="debt-band" aria-labelledby="debt-band-title">
      <span className="debt-band__icon" aria-hidden="true">%</span>
      <div><p className="career-kicker">Effective marginal debt bracket</p><h3 id="debt-band-title">{band.rate} · {band.label}</h3><p>{band.detail}</p></div>
    </section>
  )
}

function StoryIcon({ entry }: { entry: CareerStoryEntry }) {
  const icons: Record<CareerStoryEntry['type'], string> = {
    career_started: '★', round_win: '+', round_loss: '−', round_tie: '=', borrowed: '↗', repaid: '↙', daily_interest: '%',
  }
  return <span className={`story-icon story-icon--${entry.type}`} aria-hidden="true">{icons[entry.type]}</span>
}

function CareerStory({ story }: { story: CareerStoryEntry[] }) {
  const recent = [...story].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 20)
  return (
    <section className="career-story" aria-labelledby="career-story-title">
      <div className="career-panel-heading"><div><p className="career-kicker">Recent activity</p><h3 id="career-story-title">Your career story</h3></div><span>Newest first</span></div>
      {recent.length ? <ol>{recent.map((entry) => <li key={entry.id}><StoryIcon entry={entry} /><div><div><strong>{entry.headline}</strong><time dateTime={entry.occurredAt}>{storyDate.format(new Date(entry.occurredAt))}</time></div><p>{entry.detail}</p><small>Balance {formatChips(entry.balanceAfter)} · Debt {formatChips(entry.debtAfter)}</small></div></li>)}</ol> : <div className="story-empty"><span aria-hidden="true">◇</span><p>Your first career event will appear here.</p></div>}
    </section>
  )
}

function InterestExplainer({ lastAccruedAt }: { lastAccruedAt: string }) {
  return (
    <details className="interest-explainer">
      <summary><span aria-hidden="true">i</span><div><strong>How daily fictional interest works</strong><small>Full elapsed UTC days · locally calculated</small></div><i aria-hidden="true">⌄</i></summary>
      <div><p>Unused available chips earn {(CAREER_SAVINGS_APR * 100).toFixed(0)}% APR, compounded once per full elapsed UTC day.</p><p>Debt is charged marginally: the first 1,000 chips at 15% APR, the next 4,000 at 20% APR, and debt above 5,000 at 40% APR. Interest owed is included in total debt and compounds daily.</p><p>Partial days and backward clock changes do not accrue. Last accrual anchor: <time dateTime={lastAccruedAt}>{storyDate.format(new Date(lastAccruedAt))}</time>.</p><strong>These rates and chips are game mechanics only—not money, credit, lending, or financial advice.</strong></div>
    </details>
  )
}

function CareerDisclosure({ label, panelId, expanded, onToggle, children }: { label: string; panelId: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`career-disclosure${expanded ? ' career-disclosure--open' : ''}`}>
      <button type="button" className="career-disclosure-button" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        <span>{label}</span>
        <i aria-hidden="true">⌄</i>
      </button>
      <div className="career-disclosure-panel" id={panelId} hidden={!expanded}>{children}</div>
    </section>
  )
}

export function CareerDashboard({ mode, snapshot, operation, error, onModeChange, onBorrow, onRepay, onRetry, canRepayNow = true, modeChangeLocked = false }: CareerDashboardProps) {
  const busy = operation !== null
  const canRepay = Boolean(canRepayNow && snapshot && snapshot.totalDebt > 0 && snapshot.availableChips > 0)
  const idPrefix = useId()
  const [openSections, setOpenSections] = useState({ ledger: false, debt: false, story: false })
  const toggleSection = (section: keyof typeof openSections) => setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  return (
    <section className={`career-dashboard${mode === 'practice' ? ' career-dashboard--practice' : ''}`} aria-labelledby="career-title">
      <header className="career-header"><div><p className="career-kicker">Persistent local progression</p><h2 id="career-title">Career mode</h2><p>Build a fictional-chip record that survives browser restarts. No money, deposits, prizes, or real-world lending.</p></div><div className="career-mode-area"><ModeSwitch mode={mode} onChange={onModeChange} locked={modeChangeLocked} />{modeChangeLocked && <small>Finish this career hand to switch modes.</small>}</div></header>
      {mode === 'practice' ? <div className="career-paused"><span aria-hidden="true">♠</span><div><strong>Practice mode is active</strong><p>Hands remain consequence-free and will not call career mutations or change your saved ledger.</p></div><button type="button" onClick={() => onModeChange('career')}>View career</button></div> : (
        <>
          {error && <CareerError error={error} onRetry={onRetry} />}
          {!snapshot ? <DashboardLoading /> : (
            <>
              <div className="career-top-grid"><BalanceCard snapshot={snapshot} /><RecordCard snapshot={snapshot} /></div>
              <div className="career-actions" aria-label="Career chip actions"><div><strong>Need more training chips?</strong><p>Borrowing has no game limit and adds exactly 100 chips to principal. Repayment is available between completed rounds.</p></div><button className="career-button career-button--borrow" type="button" disabled={busy} onClick={() => void onBorrow()}>{operation === 'borrowing' ? 'Borrowing…' : 'Borrow 100'}</button><button className="career-button career-button--repay" type="button" disabled={busy || !canRepay} onClick={() => void onRepay()}>{operation === 'repaying' ? 'Repaying…' : 'Repay up to 100'}</button></div>
              <div className="career-disclosures" aria-label="Career details">
                <CareerDisclosure label="Career Ledger" panelId={`${idPrefix}-ledger`} expanded={openSections.ledger} onToggle={() => toggleSection('ledger')}><LifetimeStats snapshot={snapshot} /></CareerDisclosure>
                <CareerDisclosure label="Marginal Debt Bracket" panelId={`${idPrefix}-debt`} expanded={openSections.debt} onToggle={() => toggleSection('debt')}><div className="career-side-stack"><DebtBand snapshot={snapshot} /><InterestExplainer lastAccruedAt={snapshot.lastAccruedAt} /></div></CareerDisclosure>
                <CareerDisclosure label="Career Story" panelId={`${idPrefix}-story`} expanded={openSections.story} onToggle={() => toggleSection('story')}><CareerStory story={snapshot.story} /></CareerDisclosure>
              </div>
            </>
          )}
        </>
      )}
      <footer className="career-disclaimer"><span aria-hidden="true">✓</span><p><strong>Fictional training chips only.</strong> Career mode has no monetary value, cash-out, payment, prize, credit product, or effect outside this local learning simulation.</p></footer>
    </section>
  )
}
