export interface Meta {
  decisionFrom: string
  decisionTo: string
  defaultCutoff: string
  dataFetchedAt: string
  forecastRuns: number
  actualPeriods: number
}

export interface ErrorMetrics {
  count: number
  maeMw?: number
  rmseMw?: number
  biasMw?: number
  wapePct?: number | null
  p10Mw?: number
  p50Mw?: number
  p90Mw?: number
  maxAbsMw?: number
}

export interface DecisionHour {
  startTime: string
  forecastMw: number | null
  actualMw: number | null
  errorMw: number | null
  leadHours: number | null
  lowMw: number | null
  expectedMw: number | null
  highMw: number | null
}

export interface Decision {
  decisionDay: string
  decisionTime: string
  deliveryDay: string
  forecastPublishTime: string | null
  forecastAgeMinutes: number | null
  hoursCovered: number
  hoursInDay: number
  band: { basis: 'rolling' | 'pooled'; historyDays: number; p10Mw: number | null; p50Mw: number | null; p90Mw: number | null }
  energy: {
    forecastMwh: number
    lowMwh: number | null
    expectedMwh: number | null
    highMwh: number | null
    actualMwh: number | null
  }
  metrics: ErrorMetrics
  hours: DecisionHour[]
}

export interface DailyAccuracy extends ErrorMetrics {
  decisionDay: string
  deliveryDay: string
  forecastPublishTime: string | null
  forecastMwh: number
  actualMwh: number | null
}

export interface LeadTimeBucket extends ErrorMetrics {
  fromHours: number
  toHours: number
}

export interface Accuracy {
  cutoff: string
  overall: ErrorMetrics
  daily: DailyAccuracy[]
  byHourOfDay: (ErrorMetrics & { hour: number })[]
  byLeadTime: LeadTimeBucket[]
  errorHistogram: { fromMw: number; toMw: number; count: number }[]
  backtest: Backtest
}

export interface Backtest {
  hours: number
  days?: number
  rawMaeMw?: number
  adjustedMaeMw?: number
  bandCoveragePct?: number
  daysAdjustedBetter?: number
}

export interface Vintages {
  deliveryDay: string
  hours: string[]
  actualMw: (number | null)[]
  runs: { publishTime: string; values: (number | null)[] }[]
}

const url = (path: string, params: Record<string, string> = {}) => {
  const query = new URLSearchParams(params).toString()
  return `/api/${path}${query ? `?${query}` : ''}`
}

export const endpoints = {
  meta: () => url('meta'),
  decision: (day: string, cutoff: string) => url('decision', { day, cutoff }),
  accuracy: (cutoff: string) => url('accuracy', { cutoff }),
  vintages: (deliveryDay: string) => url('vintages', { deliveryDay }),
}
