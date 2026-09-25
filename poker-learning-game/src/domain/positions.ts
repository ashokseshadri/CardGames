import type { PositionLabel } from './cards'

/** Returns one position label per seat, indexed by seat number. */
export const assignPositions = (playerCount: number, dealerSeat: number): PositionLabel[] => {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new Error('Player count must be an integer from 2 through 6.')
  }
  if (!Number.isInteger(dealerSeat) || dealerSeat < 0 || dealerSeat >= playerCount) {
    throw new Error('Dealer seat must identify a seat at the table.')
  }

  const positions = Array<PositionLabel>(playerCount)
  positions[dealerSeat] = playerCount === 2 ? 'BTN/SB' : 'BTN'
  positions[(dealerSeat + 1) % playerCount] = playerCount === 2 ? 'BB' : 'SB'
  if (playerCount === 2) return positions
  positions[(dealerSeat + 2) % playerCount] = 'BB'

  const earlyLabels: PositionLabel[] = ['UTG', 'HJ', 'CO'].slice(6 - playerCount) as PositionLabel[]
  earlyLabels.forEach((label, index) => {
    positions[(dealerSeat + 3 + index) % playerCount] = label
  })
  return positions
}
