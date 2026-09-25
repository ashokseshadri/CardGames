import { describe, expect, it } from 'vitest'
import { assignPositions } from './positions'

describe('assignPositions', () => {
  it.each([
    [2, ['BTN/SB', 'BB']],
    [3, ['BTN', 'SB', 'BB']],
    [4, ['BTN', 'SB', 'BB', 'CO']],
    [5, ['BTN', 'SB', 'BB', 'HJ', 'CO']],
    [6, ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']],
  ] as const)('assigns standard labels at a %i-player table', (count, expected) => {
    expect(assignPositions(count, 0)).toEqual(expected)
  })

  it('rotates every label with the dealer seat', () => {
    expect(assignPositions(6, 2)).toEqual(['HJ', 'CO', 'BTN', 'SB', 'BB', 'UTG'])
  })
})
