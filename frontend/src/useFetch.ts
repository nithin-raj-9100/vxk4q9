import { useEffect, useState } from 'react'

interface Settled<T> {
  url: string
  data?: T
  error?: Error
}

export interface FetchState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

const responseCache = new Map<string, unknown>()

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export function useFetch<T>(url: string): FetchState<T> {
  const [settled, setSettled] = useState<Settled<T> | undefined>()
  const cached = responseCache.get(url) as T | undefined

  useEffect(() => {
    if (responseCache.has(url)) return
    let cancelled = false
    getJson<T>(url)
      .then((data) => {
        responseCache.set(url, data)
        if (!cancelled) setSettled({ url, data })
      })
      .catch((error: Error) => !cancelled && setSettled((prev) => ({ url, data: prev?.data, error })))
    return () => {
      cancelled = true
    }
  }, [url])

  if (cached !== undefined) return { data: cached, error: undefined, loading: false }
  return {
    data: settled?.data,
    error: settled?.url === url ? settled.error : undefined,
    loading: settled?.url !== url,
  }
}
