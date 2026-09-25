import type { CoachingAdvice, Difficulty, DrawInsight, EquityResult, HandValue, LegalActions, Street } from './cards'

interface CoachingInput {
  equity: EquityResult
  hand: HandValue | null
  draws: DrawInsight[]
  pot: number
  toCall: number
  difficulty: Difficulty
  street: Street
  opponentCount: number
}

const percent = (value: number) => `${Math.round(value * 100)}%`

export const constrainAdviceToLegalActions = (advice: CoachingAdvice, legal: LegalActions): CoachingAdvice => {
  const allowed = {
    fold: legal.canFold,
    check: legal.canCheck,
    call: legal.canCall,
    raise: legal.canRaise,
  }
  if (allowed[advice.action]) return advice
  const action: CoachingAdvice['action'] = legal.canCall
    ? 'call'
    : legal.canCheck
      ? 'check'
      : legal.canFold
        ? 'fold'
        : legal.canRaise
          ? 'raise'
          : advice.action
  const headlines: Record<CoachingAdvice['action'], string> = {
    fold: 'Fold—the price is not supportable',
    check: 'Check—the aggressive option is unavailable',
    call: 'Call—the current betting rules prevent a raise',
    raise: 'Raise within the legal effective-stack range',
  }
  return {
    ...advice,
    action,
    headline: headlines[action],
    reasoning: [
      `The initial ${advice.action} recommendation is not legal under the current betting rules, so the coach adjusts to ${action}.`,
      ...advice.reasoning,
    ],
  }
}

export const getCoachingAdvice = ({ equity, hand, draws, pot, toCall, difficulty, street, opponentCount }: CoachingInput): CoachingAdvice => {
  if (pot < 0 || toCall < 0) throw new Error('Pot and amount to call cannot be negative.')
  const potOdds = toCall === 0 ? 0 : toCall / (pot + toCall)
  const edge = equity.equity - potOdds
  const boardComplete = street === 'river' || street === 'showdown'
  const drawing = boardComplete ? 0 : draws.reduce((total, draw) => Math.max(total, draw.outs), 0)
  let action: CoachingAdvice['action']

  if (toCall === 0) action = equity.equity >= 0.62 || (hand?.category ?? 0) >= 4 ? 'raise' : 'check'
  else if (equity.equity >= Math.max(0.65, potOdds + 0.22)) action = 'raise'
  else if (edge >= -0.025 || (drawing >= 8 && edge >= -0.08)) action = 'call'
  else action = 'fold'

  const reasoning: string[] = []
  if (difficulty === 'beginner') {
    reasoning.push(`You win about ${percent(equity.equity)} of the pot in this simulation.`)
    reasoning.push(toCall === 0 ? 'Checking costs nothing and keeps you in the hand.' : `Calling asks you to invest ${percent(potOdds)} of the pot you could win.`)
    if (!boardComplete && draws[0]) reasoning.push(`${draws[0].outs} next cards may improve you; they do not guarantee a win.`)
    if (boardComplete) reasoning.push('The board is complete, so base this decision on final hand strength and plausible bluffs—not future outs.')
  } else {
    reasoning.push(`Estimated equity is ${percent(equity.equity)} versus ${opponentCount} random opponent hand${opponentCount === 1 ? '' : 's'}; required pot odds are ${percent(potOdds)}.`)
    reasoning.push(`${edge >= 0 ? 'Positive' : 'Negative'} equity-versus-price edge: ${edge >= 0 ? '+' : ''}${percent(edge)}.`)
    if (hand) reasoning.push(`Current made hand: ${hand.description} (${hand.categoryName}).`)
    if (!boardComplete && draws.length) reasoning.push(`Improvement-card analysis: ${draws.map((draw) => `${draw.label} (${draw.outs})`).join(', ')}.`)
    if (boardComplete) reasoning.push('No community cards remain. Evaluate final value, bluff catchers, and the action sequence.')
    if (difficulty === 'advanced') {
      reasoning.push(`Based on ${equity.simulations.toLocaleString()} Monte Carlo samples; opponent range is uniform random, not population- or solver-weighted.`)
      reasoning.push('Card-removal effects, position, bet sizing, and opponent tendencies can change the best decision.')
    }
  }

  const confidence = equity.simulations >= 5000 && Math.abs(edge) >= 0.12
    ? 'high'
    : equity.simulations >= 1500 && Math.abs(edge) >= 0.05
      ? 'medium'
      : 'low'

  return {
    action,
    headline: action === 'check' && boardComplete
      ? 'Check and reach showdown'
      : ({ fold: 'Fold and wait for a better price', check: 'Check and see the next card', call: 'Call—the price is supportable', raise: 'Raise for value and pressure' })[action],
    reasoning,
    potOdds,
    edge,
    confidence,
  }
}
