import { useEffect, useState } from 'react'
import { endpoints, type Meta } from './api'
import { longDate, ukDateTime } from './format'
import { useFetch } from './useFetch'
import { AccuracyView } from './views/AccuracyView'
import { DecisionView } from './views/DecisionView'

type Tab = 'desk' | 'accuracy'

const CUTOFF_PRESETS = [
  { label: 'EPEX 09:20', value: '09:20' },
  { label: 'N2EX 09:50', value: '09:50' },
]

function readParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    tab: (p.get('tab') === 'accuracy' ? 'accuracy' : 'desk') as Tab,
    day: p.get('day'),
    cutoff: p.get('cutoff'),
  }
}

function daysBetween(from: string, to: string): string[] {
  const days = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export default function App() {
  const meta = useFetch<Meta>(endpoints.meta())
  const initial = readParams()
  const [tab, setTab] = useState<Tab>(initial.tab)
  const [day, setDay] = useState<string | null>(initial.day)
  const [cutoff, setCutoff] = useState<string | null>(initial.cutoff)
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  const m = meta.data
  const activeDay = day ?? m?.decisionFrom ?? null
  const activeCutoff = cutoff ?? m?.defaultCutoff ?? null

  useEffect(() => {
    if (!activeDay || !activeCutoff) return
    const params = new URLSearchParams({ tab, day: activeDay, cutoff: activeCutoff })
    window.history.replaceState(null, '', `?${params}`)
  }, [tab, activeDay, activeCutoff])

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => {
    const current = theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <div>
            <h1>Wind Forecast Desk</h1>
            <p>GB national wind · day-ahead purchase support · January 2026 pilot</p>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'desk'} onClick={() => setTab('desk')}>
            Decision desk
          </button>
          <button role="tab" aria-selected={tab === 'accuracy'} onClick={() => setTab('accuracy')}>
            Forecast accuracy
          </button>
        </nav>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
          ◐
        </button>
      </header>

      {meta.error && <p className="error">Could not reach the API: {meta.error.message}</p>}

      {m && activeDay && activeCutoff && (
        <>
          <div className="filters">
            {tab === 'desk' && (
              <label>
                Decision day
                <select value={activeDay} onChange={(e) => setDay(e.target.value)}>
                  {daysBetween(m.decisionFrom, m.decisionTo).map((d) => (
                    <option key={d} value={d}>
                      {longDate(d)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Decision cutoff (UK)
              <input type="time" value={activeCutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} />
            </label>
            <div className="presets">
              {CUTOFF_PRESETS.map((p) => (
                <button
                  key={p.value}
                  className={p.value === activeCutoff ? 'active' : undefined}
                  onClick={() => setCutoff(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <main>
            {tab === 'desk' ? (
              <DecisionView day={activeDay} cutoff={activeCutoff} />
            ) : (
              <AccuracyView cutoff={activeCutoff} />
            )}
          </main>

          <footer className="app-footer">
            Data: Elexon BMRS FUELHH (wind actuals) and WINDFOR (wind forecasts) · {m.forecastRuns} forecast runs,{' '}
            {m.actualPeriods} settlement periods · snapshot taken {ukDateTime(m.dataFetchedAt)}
          </footer>
        </>
      )}
    </div>
  )
}
