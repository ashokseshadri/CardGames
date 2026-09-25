import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CareerRepository } from './careerRepository'
import { useCareer } from './useCareer'

function repositoryMock(): CareerRepository {
  return {
    getCareer: vi.fn(),
    borrow: vi.fn(),
    repay: vi.fn(),
    settleRound: vi.fn(),
  }
}

describe('useCareer practice isolation', () => {
  it('does not read or mutate career data while practice mode is active', async () => {
    const repository = repositoryMock()
    const { result } = renderHook(() => useCareer({ mode: 'practice', repository }))

    await act(async () => {
      await result.current.refresh()
      await result.current.borrow()
      await result.current.repay()
      await result.current.settleRound('practice-hand', 'win', 25, 90)
    })

    expect(repository.getCareer).not.toHaveBeenCalled()
    expect(repository.borrow).not.toHaveBeenCalled()
    expect(repository.repay).not.toHaveBeenCalled()
    expect(repository.settleRound).not.toHaveBeenCalled()
    expect(result.current.snapshot).toBeNull()
  })
})
