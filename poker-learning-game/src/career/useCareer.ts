import { useCallback, useEffect, useRef, useState } from 'react'
import { CAREER_ROUND_CHIPS, type CareerMode, type CareerOutcome, type CareerSnapshot } from './contracts'
import { careerRepository, CareerRepositoryError, type CareerRepository } from './careerRepository'

export type CareerOperation = 'loading' | 'borrowing' | 'repaying' | 'settling' | null

export interface CareerClientError {
  message: string
  code: string
  retryable: boolean
}

export interface UseCareerOptions {
  mode: CareerMode
  repository?: CareerRepository
}

export interface UseCareerResult {
  snapshot: CareerSnapshot | null
  operation: CareerOperation
  isLoading: boolean
  error: CareerClientError | null
  refresh: () => Promise<CareerSnapshot | null>
  retry: () => Promise<CareerSnapshot | null>
  borrow: () => Promise<CareerSnapshot | null>
  repay: () => Promise<CareerSnapshot | null>
  settleRound: (handId: string, outcome: CareerOutcome, netChips: number, tableStack: number) => Promise<CareerSnapshot | null>
  clearError: () => void
}

function normalizeError(error: unknown): CareerClientError {
  if (error instanceof CareerRepositoryError) {
    return { message: error.message, code: error.code, retryable: error.retryable }
  }
  return { message: 'Career mode encountered an unexpected local error.', code: 'UNKNOWN_ERROR', retryable: false }
}

export function useCareer({ mode, repository = careerRepository }: UseCareerOptions): UseCareerResult {
  const [snapshot, setSnapshot] = useState<CareerSnapshot | null>(null)
  const [operation, setOperation] = useState<CareerOperation>(null)
  const [error, setError] = useState<CareerClientError | null>(null)
  const mountedRef = useRef(true)
  const operationRef = useRef<CareerOperation>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const run = useCallback(async (nextOperation: Exclude<CareerOperation, null>, task: () => Promise<CareerSnapshot>) => {
    if (mode !== 'career' || operationRef.current !== null) return null
    operationRef.current = nextOperation
    setOperation(nextOperation)
    setError(null)
    try {
      const nextSnapshot = await task()
      if (mountedRef.current) setSnapshot(nextSnapshot)
      return nextSnapshot
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null
      if (mountedRef.current) setError(normalizeError(caught))
      return null
    } finally {
      operationRef.current = null
      if (mountedRef.current) setOperation(null)
    }
  }, [mode])

  const refresh = useCallback(() => run('loading', () => repository.getCareer()), [repository, run])
  const borrow = useCallback(() => run('borrowing', () => repository.borrow()), [repository, run])
  const repay = useCallback(() => run('repaying', () => repository.repay()), [repository, run])
  const settleRound = useCallback((handId: string, outcome: CareerOutcome, netChips: number, tableStack: number) => {
    if (mode !== 'career') return Promise.resolve(null)
    if (!handId.trim()) {
      setError({ message: 'This round is missing its hand identifier and was not recorded.', code: 'INVALID_HAND_ID', retryable: false })
      return Promise.resolve(null)
    }
    if (!Number.isInteger(netChips) || netChips < -100 || netChips > 500) {
      setError({ message: 'This round has an invalid table-stack result and was not recorded.', code: 'INVALID_NET_CHIPS', retryable: false })
      return Promise.resolve(null)
    }
    if (!Number.isInteger(tableStack) || tableStack < 1 || tableStack > CAREER_ROUND_CHIPS || netChips < -tableStack) {
      setError({ message: 'This round has an invalid starting stack and was not recorded.', code: 'INVALID_TABLE_STACK', retryable: false })
      return Promise.resolve(null)
    }
    return run('settling', () => repository.settleRound(handId, outcome, netChips, tableStack))
  }, [mode, repository, run])

  useEffect(() => {
    if (mode !== 'career') return
    let active = true
    queueMicrotask(() => {
      if (active) void refresh()
    })
    return () => { active = false }
  }, [mode, refresh])

  return {
    snapshot,
    operation,
    isLoading: operation === 'loading' && snapshot === null,
    error,
    refresh,
    retry: refresh,
    borrow,
    repay,
    settleRound,
    clearError: () => setError(null),
  }
}
