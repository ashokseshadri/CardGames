import { useId, useState, type ReactNode } from 'react'
import type {
  AnalysisSnapshot,
  BettingAction,
  Card as PokerCard,
  Difficulty,
  GameState,
  HandValue,
  LegalActions,
  OpponentRead,
  PlayerActionRecord,
  PokerAction,
  Street,
  TablePlayer,
} from '../domain/cards'
import { cardId, isRedSuit, rankLabel, suitSymbol } from '../domain/cards'

export interface PokerTrainerViewProps {
  state: GameState
  analysis: AnalysisSnapshot
  difficulty: Difficulty
  isAnalyzing: boolean
  onNewHand: () => void
  onPlayerCountChange: (count: number) => void
  onDifficultyChange: (mode: Difficulty) => void
  legalActions: LegalActions | null
  onAction: (action: BettingAction) => void
  isBotActing: boolean
  turnStatus: string
  canStartNewHand?: boolean
  playerCountLocked?: boolean
  controlStatus?: string
  careerPanel?: ReactNode
}

const difficulties: Record<Difficulty, { label: string; detail: string }> = {
  beginner: { label: 'Beginner', detail: 'Plain-language guidance' },
  intermediate: { label: 'Intermediate', detail: 'Odds and decision factors' },
  advanced: { label: 'Advanced', detail: 'Compact strategic analysis' },
}

const actionLabels: Record<PokerAction, string> = {
  fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise',
}

const streetLabels: Record<Street, string> = {
  preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
}

const seatSlots: Record<number, number[]> = {
  2: [0, 3], 3: [0, 4, 2], 4: [0, 5, 3, 1], 5: [0, 5, 4, 2, 1], 6: [0, 5, 4, 3, 2, 1],
}

const toPercent = (value: number) => Math.max(0, Math.min(100, Math.abs(value) <= 1 ? value * 100 : value))

const formatPercent = (value: number, signed = false) => {
  const percentage = Math.abs(value) <= 1 ? value * 100 : value
  return `${signed && percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`
}

function CardFace({ card, hidden = false, compact = false, label }: { card?: PokerCard; hidden?: boolean; compact?: boolean; label: string }) {
  if (hidden) {
    return <span className={`playing-card playing-card--back${compact ? ' playing-card--compact' : ''}`} role="img" aria-label={`${label}, face down`}><i aria-hidden="true">P</i></span>
  }
  if (!card) {
    return <span className={`playing-card playing-card--empty${compact ? ' playing-card--compact' : ''}`} role="img" aria-label={`${label}, not dealt`}><i aria-hidden="true">+</i></span>
  }
  return (
    <span className={`playing-card${compact ? ' playing-card--compact' : ''}${isRedSuit(card.suit) ? ' playing-card--red' : ''}`} role="img" aria-label={`${label}, ${rankLabel(card.rank)} of ${card.suit}`}>
      <b>{rankLabel(card.rank)}</b><i aria-hidden="true">{suitSymbol(card.suit)}</i><em aria-hidden="true">{suitSymbol(card.suit)}</em>
    </span>
  )
}

function CardRow({ cards, count, hidden = false, compact = false, label }: { cards: PokerCard[]; count: number; hidden?: boolean; compact?: boolean; label: string }) {
  return <span className={`card-row${compact ? ' card-row--compact' : ''}`} aria-label={label}>{Array.from({ length: count }, (_, index) => <CardFace key={cards[index] ? cardId(cards[index]) : `${label}-${index}`} card={cards[index]} hidden={hidden && Boolean(cards[index])} compact={compact} label={`${label} card ${index + 1}`} />)}</span>
}

function latestActionForStreet(player: TablePlayer, street: Street) {
  const matching = player.actions.filter((action) => action.street === street)
  return matching[matching.length - 1] ?? player.actions[player.actions.length - 1]
}

function SeatMarkers({ player, dealerSeat }: { player: TablePlayer; dealerSeat: number }) {
  return (
    <span className="seat-markers" aria-label={`${player.position}${player.seat === dealerSeat ? ', dealer' : ''}`}>
      {player.seat === dealerSeat && <i className="seat-marker seat-marker--dealer" title="Dealer button">D</i>}
      {player.position.includes('SB') && <i className="seat-marker seat-marker--blind" title="Small blind">SB</i>}
      {player.position === 'BB' && <i className="seat-marker seat-marker--blind" title="Big blind">BB</i>}
    </span>
  )
}

function PlayerSeat({ player, dealerSeat, slot, street, isActing }: { player: TablePlayer; dealerSeat: number; slot: number; street: Street; isActing: boolean }) {
  const action = latestActionForStreet(player, street)
  const reveal = player.isHero || street === 'showdown'
  const initials = player.isHero ? 'YOU' : player.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <article className={`table-seat table-seat--slot-${slot}${player.isHero ? ' table-seat--hero' : ''}${player.status === 'folded' ? ' table-seat--folded' : ''}${player.status === 'all-in' ? ' table-seat--all-in' : ''}${isActing ? ' table-seat--acting' : ''}`} aria-current={isActing ? 'true' : undefined} aria-label={`${player.name}, ${player.position}, ${player.status}, ${player.stack} chips in stack, ${player.streetContribution} committed this street${isActing ? ', acting now' : ''}`}>
      <CardRow cards={player.holeCards} count={2} hidden={!reveal} compact label={`${player.name} hole`} />
      <div className="seat-identity"><span className="seat-avatar" aria-hidden="true">{initials}</span><span className="seat-name"><strong>{player.isHero ? 'You' : player.name}</strong><small>{player.position} · {player.status}</small></span><SeatMarkers player={player} dealerSeat={dealerSeat} /></div>
      <div className="seat-bankroll"><span><small>Stack</small><strong>{player.stack}</strong></span><span><small>This street</small><strong>{player.streetContribution}</strong></span></div>
      {isActing && <span className="acting-badge">Acting</span>}
      {action && <span className={`seat-action seat-action--${action.action}`}>{actionLabels[action.action]}{action.amount > 0 ? ` ${action.amount}` : ''}</span>}
    </article>
  )
}

function orderPlayersAroundHero(players: TablePlayer[]) {
  const sorted = [...players].sort((a, b) => a.seat - b.seat)
  const heroIndex = sorted.findIndex((player) => player.isHero)
  return heroIndex < 0 ? sorted : [...sorted.slice(heroIndex), ...sorted.slice(0, heroIndex)]
}

function TableView({ state, hero }: { state: GameState; hero?: TablePlayer }) {
  const orderedPlayers = orderPlayersAroundHero(state.players)
  const slots = seatSlots[orderedPlayers.length] ?? seatSlots[6]
  return (
    <section className="table-stage" aria-label={`${state.playerCount}-player poker table`}>
      <div className="poker-table" id="training-table">
        <div className="felt-ring" aria-hidden="true" />
        {orderedPlayers.map((player, index) => <PlayerSeat key={player.id} player={player} dealerSeat={state.dealerSeat} slot={slots[index] ?? index} street={state.street} isActing={player.seat === state.actingSeat} />)}
        <div className="table-center"><div className="pot-display"><span>{streetLabels[state.street]} pot</span><strong>{state.pot}</strong><small>chips</small></div><CardRow cards={state.communityCards} count={5} label="Community" /><p>Current bet {state.currentBet} · Shared community board</p></div>
      </div>
      {hero && <p className="hero-summary"><span aria-hidden="true">◆</span> You are in the <strong>{hero.position}</strong> position this hand.</p>}
    </section>
  )
}

const namesFor = (state: GameState, ids: string[]) => ids
  .map((id) => state.players.find((player) => player.id === id)?.name ?? 'Unknown player')
  .join(ids.length > 2 ? ', ' : ' and ')

function ResultHand({ label, hand }: { label: string; hand: HandValue }) {
  return <div className="result-hand"><div><small>{label}</small><strong>{hand.categoryName}</strong><p>{hand.description}</p></div><CardRow cards={hand.cards} count={5} compact label={`${label} best five`} /></div>
}

function EndOfHandRecap({ state }: { state: GameState }) {
  const summary = state.resultSummary
  if (state.phase !== 'complete' || !summary) return null
  const titleId = `hand-result-${state.handId}`
  const winnerNames = namesFor(state, summary.winnerIds)
  const hero = state.players.find((player) => player.id === state.heroId)
  const heroRank = summary.rankedHands.find((entry) => entry.playerId === state.heroId)?.rank
  const distinctRankCount = new Set(summary.rankedHands.map((entry) => entry.rank)).size
  const officialSplit = summary.winnerIds.length > 1
  return (
    <section className="hand-result" aria-labelledby={titleId}>
      <header className="hand-result__header"><div><p className="eyebrow">Official result</p><h2 id={titleId}>{winnerNames} {officialSplit ? 'split' : 'won'} {summary.potAwarded} chips</h2></div><span>{summary.reason === 'showdown' ? 'Showdown' : 'Uncontested'}</span></header>
      {summary.reason === 'showdown' && summary.winningHand ? (
        <div className="official-hands"><ResultHand label={`Winning hand · ${winnerNames}`} hand={summary.winningHand} />{summary.runnerUpHand ? <ResultHand label={`Official runner-up · ${namesFor(state, summary.runnerUpIds)}`} hand={summary.runnerUpHand} /> : <p className="no-runner-up">Every eligible hand tied for first; there was no lower official runner-up.</p>}</div>
      ) : <p className="uncontested-copy">Every other player folded, so the pot was awarded without comparing hands.</p>}

      <div className="training-replay"><div className="training-replay__heading"><div><p className="eyebrow">Training replay</p><h3>Every dealt hand, strongest to weakest</h3></div><CardRow cards={summary.analysisBoard} count={5} compact label="Training replay board" /></div>
        {hero?.status === 'folded' && heroRank && <p className="what-if"><strong>Your fold what-if:</strong> your cards ranked #{heroRank} of {distinctRankCount} distinct hand rank{distinctRankCount === 1 ? '' : 's'} on this completed board.</p>}
        <ol className="ranked-hands">{summary.rankedHands.map((entry) => { const player = state.players.find((candidate) => candidate.id === entry.playerId); const tags = [summary.winnerIds.includes(entry.playerId) ? 'official winner' : '', player?.status === 'folded' ? 'folded · what-if' : ''].filter(Boolean); return <li key={entry.playerId}><span className="rank-number">#{entry.rank}</span><div className="ranked-hand-copy"><div><strong>{player?.name ?? 'Unknown player'}</strong><span>{tags.join(' · ') || 'showdown hand'}</span></div><b>{entry.hand.categoryName}</b><p>{entry.hand.description}</p></div><CardRow cards={entry.hand.cards} count={5} compact label={`Rank ${entry.rank} ${player?.name ?? 'player'} best five`} /></li> })}</ol>
        <p className="counterfactual-note"><strong>Learning note:</strong> folded-hand rankings compare card strength on this runout only. Later betting decisions and the final pot could have been different.</p>
      </div>
    </section>
  )
}

function EquityPanel({ analysis, isAnalyzing, activeOpponents }: { analysis: AnalysisSnapshot; isAnalyzing: boolean; activeOpponents: number }) {
  const { equity } = analysis
  return (
    <section className="panel equity-panel" aria-labelledby="equity-title" aria-busy={isAnalyzing}>
      <div className="panel-heading"><div><p className="eyebrow">Against {activeOpponents} active opponent{activeOpponents === 1 ? '' : 's'}</p><h2 id="equity-title">Your equity</h2></div><span className="analysis-status" role="status"><i className={isAnalyzing ? 'busy' : ''} />{isAnalyzing ? 'Updating' : equity.simulations === 1 ? 'Exact result' : `${equity.simulations.toLocaleString()} trials`}</span></div>
      <div className="equity-score"><strong>{formatPercent(equity.equity)}</strong><span>estimated share of this multiway pot</span></div>
      <div className="equity-meter" role="progressbar" aria-label="Estimated hero equity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(toPercent(equity.equity))}><span style={{ width: `${toPercent(equity.equity)}%` }} /></div>
      <div className="equity-breakdown"><span><i className="dot dot--win" />Win <b>{formatPercent(equity.win)}</b></span><span><i className="dot dot--tie" />Tie <b>{formatPercent(equity.tie)}</b></span><span><i className="dot dot--loss" />Lose <b>{formatPercent(equity.loss)}</b></span></div>
      <p className="helper-copy">{equity.simulations === 1 ? 'The hand is complete, so this is the exact recorded result.' : 'Approximate simulation only. Equity can shift as players act and new cards arrive.'}</p>
    </section>
  )
}

function HandPanel({ analysis, street }: { analysis: AnalysisSnapshot; street: Street }) {
  return (
    <section className="panel hand-panel" aria-labelledby="hand-title"><div className="panel-heading"><div><p className="eyebrow">Your cards</p><h2 id="hand-title">Hand &amp; draws</h2></div><span className="street-chip">{streetLabels[street]}</span></div><div className="hand-strength"><span aria-hidden="true">◆</span><div><strong>{analysis.hand?.categoryName ?? 'Starting hand'}</strong><p>{analysis.hand?.description ?? 'Your final five-card hand will take shape as the board arrives.'}</p></div></div><div className="draw-list">{analysis.draws.length ? analysis.draws.map((draw) => <article className="draw-item" key={`${draw.label}-${draw.outs}`}><span className="out-badge">{draw.outs}<small>outs</small></span><div><h3>{draw.label}</h3><p>{draw.explanation}</p>{draw.cards.length > 0 && <p className="draw-cards">{draw.cards.slice(0, 8).map((card) => <span className={isRedSuit(card.suit) ? 'red-suit' : ''} key={cardId(card)}>{rankLabel(card.rank)}{suitSymbol(card.suit)}</span>)}{draw.cards.length > 8 && <span>+{draw.cards.length - 8}</span>}</p>}</div></article>) : <div className="empty-insight"><span aria-hidden="true">○</span><p>{street === 'river' || street === 'showdown' ? <><strong>Board complete.</strong> There are no future community-card outs.</> : <><strong>No clear draw yet.</strong> An out is an unseen card that could improve your hand.</>}</p></div>}</div></section>
  )
}

function CoachPanel({ analysis }: { analysis: AnalysisSnapshot }) {
  const { advice } = analysis
  return (
    <section className={`panel coach-panel coach-panel--${advice.action}`} aria-labelledby="coach-title"><div className="panel-heading"><div><p className="eyebrow">Coach recommendation</p><h2 id="coach-title">{advice.headline}</h2></div><span className={`action-pill action-pill--${advice.action}`}>{actionLabels[advice.action]}</span></div><ol className="reason-list">{advice.reasoning.map((reason, index) => <li key={`${index}-${reason}`}><span>{index + 1}</span><p>{reason}</p></li>)}</ol><dl className="decision-metrics"><div><dt>Pot odds</dt><dd>{formatPercent(advice.potOdds)}</dd></div><div><dt>Estimated edge</dt><dd className={advice.edge >= 0 ? 'positive' : 'negative'}>{formatPercent(advice.edge, true)}</dd></div><div><dt>Confidence</dt><dd>{advice.confidence}</dd></div></dl><p className="helper-copy">Educational guidance for a simplified scenario, not a solver-grade prescription.</p></section>
  )
}

function BriefingPanel({ analysis }: { analysis: AnalysisSnapshot }) {
  const { briefing } = analysis
  return (
    <section className="panel briefing-panel" aria-labelledby="briefing-title"><div className="panel-heading"><div><p className="eyebrow">Street briefing</p><h2 id="briefing-title">{briefing.headline}</h2></div><span className="briefing-icon" aria-hidden="true">◎</span></div><p className="briefing-summary">{briefing.summary}</p><div className="briefing-sections">{briefing.sections.map((section, index) => <article className={`briefing-section briefing-section--${section.tone}`} key={`${section.title}-${index}`}><h3><i aria-hidden="true" />{section.title}</h3><ul>{section.points.map((point, pointIndex) => <li key={`${pointIndex}-${point}`}>{point}</li>)}</ul></article>)}</div></section>
  )
}

function ActionHistory({ actions }: { actions: PlayerActionRecord[] }) {
  if (!actions.length) return <p className="no-actions">No action observed yet.</p>
  return <ol className="action-history">{actions.map((action) => <li key={action.id}><span className={`history-action history-action--${action.action}`}>{actionLabels[action.action]}</span><div><strong>{streetLabels[action.street]}{action.amount > 0 ? ` · ${action.amount} chips` : ''}</strong><p>{action.rationale}</p></div></li>)}</ol>
}

function OpponentReadCard({ read, player, showdown }: { read: OpponentRead; player?: TablePlayer; showdown: boolean }) {
  return (
    <details className={`opponent-read${read.status === 'folded' ? ' opponent-read--folded' : ''}`} open={read.status !== 'folded'}>
      <summary><span className="read-avatar" aria-hidden="true">{read.playerName.slice(0, 1).toUpperCase()}</span><span className="read-name"><strong>{read.playerName}</strong><small>{read.position} · {read.status}</small></span><span className={`range-chip range-chip--${read.rangeStrength.replace(' ', '-')}`}>{read.rangeStrength}</span><span className="disclosure" aria-hidden="true">⌄</span></summary>
      <div className="opponent-read__body">
        {showdown && player && <div className="revealed-hand"><span><b>Actual hand</b>{player.showdownHand && <small>{player.showdownHand.categoryName}: {player.showdownHand.description}</small>}</span><CardRow cards={player.holeCards} count={2} compact label={`${player.name} revealed`} /></div>}
        <div className="holding-list" aria-label={`Likely holdings for ${read.playerName}`}>{read.topHoldings.map((holding) => <article key={holding.label}><div><strong>{holding.label}</strong><b>{formatPercent(holding.probability)}</b></div><span className="holding-meter" aria-hidden="true"><i style={{ width: `${toPercent(holding.probability)}%` }} /></span><p>{holding.explanation}</p>{holding.examples.length > 0 && <small>Examples: {holding.examples.join(', ')}</small>}</article>)}</div>
        <div className="watchout"><strong>Watch for</strong><p>{read.watchout}</p></div><div className="history-block"><h4>Observed action</h4><ActionHistory actions={player?.actions ?? []} /></div><p className="sample-note">{read.modelBasis}</p>
      </div>
    </details>
  )
}

function OpponentReadsPanel({ analysis, players, street }: { analysis: AnalysisSnapshot; players: TablePlayer[]; street: Street }) {
  return (
    <section className="panel reads-panel" aria-labelledby="reads-title"><div className="panel-heading"><div><p className="eyebrow">Opponent study</p><h2 id="reads-title">What they may hold</h2></div><span className="read-count">{analysis.briefing.opponentReads.length} reads</span></div><p className="reads-intro">Each estimate uses position and simulated visible actions. Open a player to study the signals.</p><div className="opponent-reads">{analysis.briefing.opponentReads.map((read) => <OpponentReadCard key={read.playerId} read={read} player={players.find((player) => player.id === read.playerId)} showdown={street === 'showdown'} />)}</div><p className="model-caveat"><strong>Important:</strong> Broad learning heuristics only—not exact ranges, predictions, or GTO solver output. Hidden cards are not used before showdown.</p></section>
  )
}

const clampRaise = (value: number, legal: LegalActions) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(value)))

function BettingControls({ state, legalActions, isBotActing, turnStatus, difficulty, onAction, onNewHand, canStartNewHand, controlStatus }: {
  state: GameState
  legalActions: LegalActions | null
  isBotActing: boolean
  turnStatus: string
  difficulty: Difficulty
  onAction: (action: BettingAction) => void
  onNewHand: () => void
  canStartNewHand: boolean
  controlStatus?: string
}) {
  const controlId = useId()
  const raiseTrayId = `${controlId}-raise-tray`
  const customRaiseId = `${controlId}-custom-raise`
  const raiseLimitsId = `${controlId}-raise-limits`
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseDraft, setRaiseDraft] = useState('')
  const controlsDisabled = isBotActing || state.phase !== 'betting'
  const draftValue = Number(raiseDraft)
  const draftValid = Boolean(legalActions?.canRaise)
    && Number.isInteger(draftValue)
    && draftValue >= (legalActions?.minRaiseTo ?? 0)
    && draftValue <= (legalActions?.maxRaiseTo ?? 0)

  const chooseRaise = (value: number) => {
    if (!legalActions) return
    setRaiseDraft(String(clampRaise(value, legalActions)))
  }

  const toggleRaise = () => {
    if (!legalActions?.canRaise) return
    if (!raiseOpen) setRaiseDraft(String(legalActions.minRaiseTo))
    setRaiseOpen((open) => !open)
  }

  const submitRaise = () => {
    if (!draftValid) return
    onAction({ type: 'raise', raiseTo: draftValue })
    setRaiseOpen(false)
  }

  const takeAction = (action: BettingAction) => {
    setRaiseOpen(false)
    onAction(action)
  }

  const presets = legalActions ? [
    { label: 'Minimum', value: legalActions.minRaiseTo },
    { label: 'Half pot', value: clampRaise(state.currentBet + Math.ceil((state.pot + legalActions.callAmount) / 2), legalActions) },
    { label: 'Pot', value: clampRaise(state.currentBet + state.pot + legalActions.callAmount, legalActions) },
  ] : []

  return (
    <section className="betting-controls" aria-labelledby="betting-controls-title">
      <div className="turn-status" role="status" aria-live="polite" aria-atomic="true">
        <span className={isBotActing ? 'turn-status__pulse' : ''} aria-hidden="true">{state.phase === 'complete' ? '✓' : isBotActing ? '…' : '◆'}</span>
        <div><strong id="betting-controls-title">{turnStatus}</strong>{controlStatus && <small>{controlStatus}</small>}</div>
      </div>

      <div className="action-controls" aria-label="Poker actions">
        {legalActions?.canFold && <button className="poker-action poker-action--fold" type="button" disabled={controlsDisabled} onClick={() => takeAction({ type: 'fold' })}>Fold</button>}
        {legalActions?.canCheck && <button className="poker-action poker-action--check" type="button" disabled={controlsDisabled} onClick={() => takeAction({ type: 'check' })}>Check</button>}
        {legalActions?.canCall && <button className="poker-action poker-action--call" type="button" disabled={controlsDisabled} onClick={() => takeAction({ type: 'call' })}>Call {legalActions.callAmount}</button>}
        {legalActions?.canRaise && <button className="poker-action poker-action--raise" type="button" aria-expanded={raiseOpen} aria-controls={raiseTrayId} disabled={controlsDisabled} onClick={toggleRaise}>Raise <span aria-hidden="true">⌄</span></button>}
        <button className="button button--secondary new-hand-action" type="button" onClick={() => { setRaiseOpen(false); onNewHand() }} disabled={!canStartNewHand || isBotActing}>New hand</button>
      </div>

      {raiseOpen && legalActions?.canRaise && (
        <div className="raise-tray" id={raiseTrayId}>
          <fieldset><legend>Choose a total bet</legend><div className="raise-presets">{presets.map((preset) => <button key={preset.label} type="button" disabled={controlsDisabled} onClick={() => chooseRaise(preset.value)}><span>{preset.label}</span><strong>{preset.value}</strong></button>)}</div></fieldset>
          <label className="custom-raise" htmlFor={customRaiseId}><span>Custom total</span><span className="custom-raise__input"><input id={customRaiseId} aria-label="Custom raise total" type="number" inputMode="numeric" step="1" min={legalActions.minRaiseTo} max={legalActions.maxRaiseTo} value={raiseDraft} aria-invalid={raiseDraft !== '' && !draftValid} aria-describedby={raiseLimitsId} disabled={controlsDisabled} onChange={(event) => setRaiseDraft(event.target.value)} onBlur={() => chooseRaise(Number.isFinite(draftValue) ? draftValue : legalActions.minRaiseTo)} /><i>chips</i></span></label>
          <button className="confirm-raise" type="button" disabled={controlsDisabled || !draftValid} onClick={submitRaise}>Raise to {draftValid ? draftValue : legalActions.minRaiseTo}</button>
          <p id={raiseLimitsId} className={raiseDraft !== '' && !draftValid ? 'raise-limits raise-limits--error' : 'raise-limits'}>Allowed total: {legalActions.minRaiseTo}–{legalActions.maxRaiseTo} chips. Values are clamped to this range.</p>
        </div>
      )}

      {difficulty === 'beginner' && legalActions && state.phase === 'betting' && <p className="beginner-action-help"><strong>Quick guide:</strong> Fold gives up the hand. {legalActions.canCheck ? 'Check stays in for free.' : `Call matches ${legalActions.callAmount} chips.`} {legalActions.canRaise ? `Raise increases your total bet; the legal range is ${legalActions.minRaiseTo}–${legalActions.maxRaiseTo}.` : ''}</p>}
    </section>
  )
}

function SettingsBar({ state, difficulty, onPlayerCountChange, onDifficultyChange, playerCountLocked = false }: Pick<PokerTrainerViewProps, 'state' | 'difficulty' | 'onPlayerCountChange' | 'onDifficultyChange' | 'playerCountLocked'>) {
  return <div className="settings-bar"><fieldset className="segmented-control player-count"><legend>Players at table</legend><div>{[2, 3, 4, 5, 6].map((count) => <label key={count}><input type="radio" name="player-count" value={count} checked={state.playerCount === count} disabled={playerCountLocked} onChange={() => onPlayerCountChange(count)} /><span>{count}</span></label>)}</div></fieldset><fieldset className="segmented-control difficulty"><legend>Explanation level</legend><div>{(Object.keys(difficulties) as Difficulty[]).map((mode) => <label key={mode} title={difficulties[mode].detail}><input type="radio" name="difficulty" value={mode} checked={difficulty === mode} onChange={() => onDifficultyChange(mode)} /><span>{difficulties[mode].label}</span></label>)}</div></fieldset></div>
}

export function PokerTrainerView({ state, analysis, difficulty, isAnalyzing, onNewHand, onPlayerCountChange, onDifficultyChange, legalActions, onAction, isBotActing, turnStatus, canStartNewHand, playerCountLocked = false, controlStatus, careerPanel }: PokerTrainerViewProps) {
  const hero = state.players.find((player) => player.id === state.heroId)
  const activeOpponents = state.players.filter((player) => !player.isHero && player.status !== 'folded').length
  const actingPlayer = state.players.find((player) => player.seat === state.actingSeat)
  const resolvedTurnStatus = turnStatus || (state.phase === 'complete' ? 'Hand complete' : isBotActing ? `${actingPlayer?.name ?? 'Opponent'} is acting` : legalActions ? 'Your turn' : 'Waiting for the next action')
  const newHandAvailable = canStartNewHand ?? state.phase === 'complete'
  return (
    <main className="poker-trainer">
      <header className="app-header"><a className="brand" href="#training-table" aria-label="Poker Study Lab, skip to table"><span className="brand-mark" aria-hidden="true">♠</span><span><strong>Poker Study Lab</strong><small>Multiway Hold’em trainer</small></span></a><div className="simulation-notice"><span aria-hidden="true">✓</span>Learning simulation · Fictional chips only</div></header>
      <div className="trainer-shell">
        <section className="lesson-header"><div><p className="eyebrow">Guided multiway practice</p><h1>Read every seat. See the whole hand.</h1><p>Learn how position, board texture, and opponent actions change a Texas Hold’em decision.</p></div><SettingsBar state={state} difficulty={difficulty} onPlayerCountChange={onPlayerCountChange} onDifficultyChange={onDifficultyChange} playerCountLocked={playerCountLocked} /></section>
        {careerPanel}
        <div className="workspace-grid"><section className="table-column" aria-label="Poker table and hand controls"><TableView state={state} hero={hero} /><EndOfHandRecap state={state} /><BettingControls state={state} legalActions={legalActions} isBotActing={isBotActing} turnStatus={resolvedTurnStatus} difficulty={difficulty} onAction={onAction} onNewHand={onNewHand} canStartNewHand={newHandAvailable} controlStatus={controlStatus} /><div className="street-progress" aria-label={`Hand progress: ${streetLabels[state.street]}`}>{(['preflop', 'flop', 'turn', 'river', 'showdown'] as Street[]).map((street, index, streets) => { const current = streets.indexOf(state.street); return <span key={street} className={index < current ? 'complete' : index === current ? 'current' : ''}>{streetLabels[street]}</span> })}</div></section><aside className="insights-column" aria-label="Live hero analysis"><EquityPanel analysis={analysis} isAnalyzing={isAnalyzing} activeOpponents={activeOpponents} /><HandPanel analysis={analysis} street={state.street} /><CoachPanel analysis={analysis} /></aside></div>
        <div className="study-grid"><BriefingPanel analysis={analysis} /><OpponentReadsPanel analysis={analysis} players={state.players} street={state.street} /></div>
        <footer className="learning-footer"><p><strong>Learning simulation only.</strong> This trainer uses fictional chips, simplified opponent behavior, and approximate probabilities. It does not support betting, deposits, prizes, or real-money play.</p><span>Hand {state.handId.slice(0, 8)}</span></footer>
      </div>
    </main>
  )
}
