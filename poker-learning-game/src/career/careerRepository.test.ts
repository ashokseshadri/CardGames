import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CareerSnapshot } from './contracts'
import { careerRepository, CareerRepositoryError } from './careerRepository'

const snapshot: CareerSnapshot = {
  availableChips: 1000,
  loanPrincipal: 0,
  loanInterestOwed: 0,
  totalDebt: 0,
  totalWon: 0,
  totalLost: 0,
  totalBorrowed: 0,
  totalRepaid: 0,
  totalInterestEarned: 0,
  totalInterestCharged: 0,
  handsPlayed: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  lastAccruedAt: '2026-08-26T00:00:00.000Z',
  story: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('careerRepository', () => {
  it('loads the authoritative career snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(careerRepository.getCareer()).resolves.toEqual(snapshot)
    expect(fetchMock).toHaveBeenCalledWith('/api/career', expect.objectContaining({ signal: undefined }))
  })

  it('posts an idempotent hand identifier and outcome for settlement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await careerRepository.settleRound('hand-42', 'win', 37, 90)

    expect(fetchMock).toHaveBeenCalledWith('/api/career/round', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ handId: 'hand-42', outcome: 'win', netChips: 37, tableStack: 90 }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('preserves structured API error details and retryability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'Career database is busy.',
      code: 'DATABASE_BUSY',
    }), { status: 503 })))

    const error = await careerRepository.borrow().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CareerRepositoryError)
    expect(error).toMatchObject({ code: 'DATABASE_BUSY', status: 503, retryable: true })
  })

  it('reports unreachable local service as a retryable network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(careerRepository.getCareer()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    })
  })
})
