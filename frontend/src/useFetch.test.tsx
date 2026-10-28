import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFetch } from './useFetch'

afterEach(() => vi.restoreAllMocks())

describe('useFetch', () => {
  it('serves a previously fetched URL from cache without refetching or loading', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))

    const first = renderHook(() => useFetch<{ ok: number }>('/api/cache-test'))
    await waitFor(() => expect(first.result.current.data).toEqual({ ok: 1 }))
    first.unmount()

    const second = renderHook(() => useFetch<{ ok: number }>('/api/cache-test'))
    expect(second.result.current).toEqual({ data: { ok: 1 }, error: undefined, loading: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
