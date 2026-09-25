import type { CareerApiError, CareerOutcome, CareerSnapshot } from './contracts'

const CAREER_ENDPOINT = '/api/career'

export class CareerRepositoryError extends Error {
  readonly code: string
  readonly status: number | null
  readonly retryable: boolean

  constructor(message: string, options: { code: string; status?: number | null; retryable?: boolean }) {
    super(message)
    this.name = 'CareerRepositoryError'
    this.code = options.code
    this.status = options.status ?? null
    this.retryable = options.retryable ?? false
  }
}

export interface CareerRepository {
  getCareer(signal?: AbortSignal): Promise<CareerSnapshot>
  borrow(signal?: AbortSignal): Promise<CareerSnapshot>
  repay(signal?: AbortSignal): Promise<CareerSnapshot>
  settleRound(handId: string, outcome: CareerOutcome, netChips: number, tableStack: number, signal?: AbortSignal): Promise<CareerSnapshot>
}

function isApiError(value: unknown): value is CareerApiError {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CareerApiError>
  return typeof candidate.error === 'string' && typeof candidate.code === 'string'
}

function isSnapshot(value: unknown): value is CareerSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CareerSnapshot>
  const numericFields: (keyof CareerSnapshot)[] = [
    'availableChips', 'loanPrincipal', 'loanInterestOwed', 'totalDebt',
    'totalWon', 'totalLost', 'totalBorrowed', 'totalRepaid',
    'totalInterestEarned', 'totalInterestCharged', 'handsPlayed',
    'wins', 'losses', 'ties',
  ]
  return numericFields.every((field) => typeof candidate[field] === 'number')
    && typeof candidate.lastAccruedAt === 'string'
    && Array.isArray(candidate.story)
}

async function request(path = '', init: RequestInit = {}): Promise<CareerSnapshot> {
  let response: Response
  try {
    response = await fetch(`${CAREER_ENDPOINT}${path}`, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new CareerRepositoryError('Career mode could not reach the local career service.', {
      code: 'NETWORK_ERROR',
      retryable: true,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new CareerRepositoryError('The career service returned an unreadable response.', {
      code: 'INVALID_RESPONSE',
      status: response.status,
      retryable: response.status >= 500,
    })
  }

  if (!response.ok) {
    const apiError = isApiError(payload) ? payload : null
    throw new CareerRepositoryError(apiError?.error ?? 'Career mode could not complete that request.', {
      code: apiError?.code ?? 'REQUEST_FAILED',
      status: response.status,
      retryable: response.status >= 500 || response.status === 408 || response.status === 429,
    })
  }

  if (!isSnapshot(payload)) {
    throw new CareerRepositoryError('The career service returned incomplete career data.', {
      code: 'INVALID_RESPONSE',
      status: response.status,
      retryable: false,
    })
  }

  return payload
}

export const careerRepository: CareerRepository = {
  getCareer: (signal) => request('', { signal }),
  borrow: (signal) => request('/borrow', { method: 'POST', signal }),
  repay: (signal) => request('/repay', { method: 'POST', signal }),
  settleRound: (handId, outcome, netChips, tableStack, signal) => request('/round', {
    method: 'POST',
    signal,
    body: JSON.stringify({ handId, outcome, netChips, tableStack }),
  }),
}
