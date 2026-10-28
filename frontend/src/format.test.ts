import { describe, expect, it } from 'vitest'
import { formatGw, formatGwh, formatSignedGw, niceTicks, ukTime } from './format'

describe('format', () => {
  it('formats MW as GW', () => {
    expect(formatGw(12345)).toBe('12.3 GW')
    expect(formatGw(null)).toBe('–')
  })

  it('signs errors explicitly', () => {
    expect(formatSignedGw(-1500)).toBe('−1.5 GW')
    expect(formatSignedGw(800)).toBe('+0.8 GW')
  })

  it('formats MWh as GWh', () => {
    expect(formatGwh(190330)).toBe('190 GWh')
  })

  it('renders UK local time across clock changes', () => {
    expect(ukTime('2026-01-15T09:20:00Z')).toBe('09:20')
    expect(ukTime('2026-07-15T08:20:00Z')).toBe('09:20')
  })
})

describe('niceTicks', () => {
  it('starts at zero and covers the max with round steps', () => {
    expect(niceTicks(0, 2400)).toEqual([0, 500, 1000, 1500, 2000, 2500])
  })

  it('extends below zero for negative data', () => {
    const ticks = niceTicks(-130000, 20000)
    expect(ticks[0]).toBeLessThanOrEqual(-130000)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(20000)
    expect(ticks).toContain(0)
  })
})
