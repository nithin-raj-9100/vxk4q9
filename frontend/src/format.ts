const UK_TZ = 'Europe/London'

const gw = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export const formatGw = (mw: number | null | undefined) => (mw == null ? '–' : `${gw.format(mw / 1000)} GW`)

export const formatSignedGw = (mw: number | null | undefined) =>
  mw == null ? '–' : `${mw > 0 ? '+' : mw < 0 ? '−' : ''}${gw.format(Math.abs(mw) / 1000)} GW`

export const formatGwRange = (lowMw: number | null | undefined, highMw: number | null | undefined) =>
  lowMw == null || highMw == null ? '–' : `${formatSignedGw(lowMw).replace(' GW', '')} to ${formatSignedGw(highMw)}`

export const formatGwh = (mwh: number | null | undefined) => (mwh == null ? '–' : `${whole.format(mwh / 1000)} GWh`)

export const formatPct = (pct: number | null | undefined) => (pct == null ? '–' : `${gw.format(pct)}%`)

export const ukTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const ukDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

export const longDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )

export const shortDate = (isoDate: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  )

export const formatAge = (minutes: number | null) => {
  if (minutes == null) return '–'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export const gwAxis = (mw: number) => gw.format(mw / 1000)

export function niceTicks(minValue: number, maxValue: number, target = 5): number[] {
  const span = Math.max(maxValue - Math.min(minValue, 0), 1)
  const raw = span / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let t = Math.floor(Math.min(minValue, 0) / step) * step; t <= maxValue + step * 0.999; t += step) ticks.push(t)
  return ticks
}
