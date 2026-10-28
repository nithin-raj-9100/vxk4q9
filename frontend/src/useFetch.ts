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

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export function useFetch<T>(url: string): FetchState<T> {
  const [settled, setSettled] = useState<Settled<T> | undefined>()

  useEffect(() => {
    let cancelled = false
    getJson<T>(url)
      .then((data) => !cancelled && setSettled({ url, data }))
      .catch((error: Error) => !cancelled && setSettled((prev) => ({ url, data: prev?.data, error })))
    return () => {
      cancelled = true
    }
  }, [url])

  return { data: settled?.data, error: settled?.error, loading: settled?.url !== url }
}
