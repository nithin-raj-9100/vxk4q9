import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endpoints, type Decision, type Vintages } from '../api'
import { Card, LegendKey, StatTile, Toggle, TooltipBox } from '../components/ui'
import {
  formatAge,
  formatGw,
  formatGwh,
  formatPct,
  formatSignedGw,
  gwAxis,
  longDate,
  niceTicks,
  ukDateTime,
  ukTime,
} from '../format'
import { useFetch } from '../useFetch'

const AXIS = { stroke: 'var(--axis)', tick: { fill: 'var(--text-muted)', fontSize: 12 }, tickLine: false }

interface Props {
  day: string
  cutoff: string
}

export function DecisionView({ day, cutoff }: Props) {
  const decision = useFetch<Decision>(endpoints.decision(day, cutoff))
  const [showActual, setShowActual] = useState(true)
  const d = decision.data

  if (decision.error && !d) return <p className="error">Could not load the forecast: {decision.error.message}</p>
  if (!d) return <p className="loading">Loading forecast…</p>

  return (
    <div className={decision.loading ? 'refreshing' : undefined}>
      <DecisionSummary d={d} showActual={showActual} />
      <Card
        title={`Wind generation outlook for ${longDate(d.deliveryDay)}`}
        subtitle={
          d.forecastPublishTime ? (
            <>
              Latest forecast available at {ukTime(d.decisionTime)} on {longDate(d.decisionDay)} was published{' '}
              {ukDateTime(d.forecastPublishTime)} (UK time). Shaded range is the P10–P90 uncertainty from past forecast
              errors.
            </>
          ) : (
            'No forecast had been published before this cutoff.'
          )
        }
        actions={<Toggle checked={showActual} onChange={setShowActual} label="Show actual (hindsight)" />}
      >
        <OutlookChart d={d} showActual={showActual} />
        <BandNote d={d} />
        <HourlyTable d={d} showActual={showActual} />
      </Card>
      <VintagesCard deliveryDay={d.deliveryDay} chosenPublish={d.forecastPublishTime} />
    </div>
  )
}

function DecisionSummary({ d, showActual }: { d: Decision; showActual: boolean }) {
  const e = d.energy
  const dailyErrorPct = e.actualMwh != null ? (100 * (e.actualMwh - e.forecastMwh)) / e.forecastMwh : null
  return (
    <div className="stat-row">
      <StatTile
        label="Forecast used"
        value={d.forecastPublishTime ? ukTime(d.forecastPublishTime) : '–'}
        detail={`${formatAge(d.forecastAgeMinutes)} old at the ${ukTime(d.decisionTime)} cutoff · ${d.hoursCovered}/${d.hoursInDay} h covered`}
      />
      <StatTile label="Forecast wind energy" value={formatGwh(e.forecastMwh)} detail="Raw Elexon forecast, delivery day" />
      <StatTile
        emphasis
        label="Expected (bias-adjusted)"
        value={formatGwh(e.expectedMwh)}
        detail="Forecast corrected by the typical (median) past error"
      />
      <StatTile
        label="Conservative (P10)"
        value={formatGwh(e.lowMwh)}
        detail="Wind delivered at least this in ~9 of 10 past hours"
      />
      {showActual && (
        <StatTile
          label="Actual (hindsight)"
          value={formatGwh(e.actualMwh)}
          detail={dailyErrorPct == null ? 'Not yet settled' : `${formatPct(dailyErrorPct)} vs raw forecast`}
        />
      )}
    </div>
  )
}

function OutlookChart({ d, showActual }: { d: Decision; showActual: boolean }) {
  const rows = d.hours.map((h) => ({
    time: ukTime(h.startTime),
    forecast: h.forecastMw,
    expected: h.expectedMw,
    actual: h.actualMw,
    band: h.lowMw != null && h.highMw != null ? [h.lowMw, h.highMw] : null,
    raw: h,
  }))
  const legend = [
    { label: 'Forecast', color: 'var(--series-1)', kind: 'line' as const },
    { label: 'Expected (bias-adjusted)', color: 'var(--series-1)', kind: 'dashed' as const },
    { label: 'P10–P90 range', color: 'var(--band)', kind: 'area' as const },
    ...(showActual ? [{ label: 'Actual', color: 'var(--series-2)', kind: 'line' as const }] : []),
  ]
  return (
    <>
      <LegendKey items={legend} />
      <div className="chart" role="img" aria-label="Hourly wind forecast with uncertainty range for the delivery day">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="time" {...AXIS} interval={2} />
            <YAxis {...AXIS} ticks={niceTicks(0, Math.max(...rows.map((r) => Math.max(r.band?.[1] ?? 0, r.forecast ?? 0, r.actual ?? 0))))} tickFormatter={gwAxis} width={48} label={{ value: 'GW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: 'var(--axis)' }}
              content={({ active, payload }) => {
                const h = active && payload?.[0]?.payload?.raw
                if (!h) return null
                return (
                  <TooltipBox
                    title={`${ukTime(h.startTime)} · ${h.leadHours != null ? `${h.leadHours.toFixed(1)} h ahead` : ''}`}
                    rows={[
                      { label: 'Forecast', value: formatGw(h.forecastMw), color: 'var(--series-1)' },
                      { label: 'Expected', value: formatGw(h.expectedMw), color: 'var(--series-1)' },
                      { label: 'P10–P90', value: `${formatGw(h.lowMw)} – ${formatGw(h.highMw)}`, color: 'var(--band)' },
                      ...(showActual
                        ? [
                            { label: 'Actual', value: formatGw(h.actualMw), color: 'var(--series-2)' },
                            { label: 'Error (actual − forecast)', value: formatSignedGw(h.errorMw) },
                          ]
                        : []),
                    ]}
                  />
                )
              }}
            />
            <Area dataKey="band" stroke="none" fill="var(--band)" fillOpacity={0.55} isAnimationActive={false} />
            <Line dataKey="forecast" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              dataKey="expected"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            {showActual && (
              <Line dataKey="actual" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function BandNote({ d }: { d: Decision }) {
  const b = d.band
  return (
    <p className="footnote">
      {b.basis === 'rolling'
        ? `Uncertainty learned from the ${b.historyDays} delivery days already settled before this decision (no hindsight).`
        : `Fewer than 3 settled days before this decision, so the range uses the whole January sample (in-sample).`}{' '}
      Typical hourly error: P10 {formatSignedGw(b.p10Mw)}, median {formatSignedGw(b.p50Mw)}, P90 {formatSignedGw(b.p90Mw)}.
    </p>
  )
}

function HourlyTable({ d, showActual }: { d: Decision; showActual: boolean }) {
  return (
    <details className="table-details">
      <summary>Hourly table</summary>
      <table className="data-table">
        <thead>
          <tr>
            <th>Hour (UK)</th>
            <th>Lead</th>
            <th>Forecast</th>
            <th>Expected</th>
            <th>P10</th>
            <th>P90</th>
            {showActual && <th>Actual</th>}
            {showActual && <th>Error</th>}
          </tr>
        </thead>
        <tbody>
          {d.hours.map((h) => (
            <tr key={h.startTime}>
              <td>{ukTime(h.startTime)}</td>
              <td>{h.leadHours != null ? `${h.leadHours.toFixed(1)} h` : '–'}</td>
              <td>{formatGw(h.forecastMw)}</td>
              <td>{formatGw(h.expectedMw)}</td>
              <td>{formatGw(h.lowMw)}</td>
              <td>{formatGw(h.highMw)}</td>
              {showActual && <td>{formatGw(h.actualMw)}</td>}
              {showActual && <td>{formatSignedGw(h.errorMw)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function VintagesCard({ deliveryDay, chosenPublish }: { deliveryDay: string; chosenPublish: string | null }) {
  const vintages = useFetch<Vintages>(endpoints.vintages(deliveryDay))
  const v = vintages.data
  const rows = useMemo(() => (v ? vintageRows(v) : []), [v])
  if (!v) return null
  return (
    <Card
      title="How the forecast for this day evolved"
      subtitle="Every forecast run that covered the delivery day. The highlighted run is the one available at your cutoff; later runs arrive after gate closure."
    >
      <LegendKey
        items={[
          { label: 'Run used for the decision', color: 'var(--series-1)', kind: 'line' },
          { label: 'Other runs', color: 'var(--muted-series)', kind: 'line' },
          { label: 'Actual', color: 'var(--series-2)', kind: 'line' },
        ]}
      />
      <div className="chart" role="img" aria-label="All forecast runs for the delivery day compared to actual">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="time" {...AXIS} interval={2} />
            <YAxis {...AXIS} ticks={niceTicks(0, Math.max(...rows.map((r) => Number(r.max ?? 0)), ...v.actualMw.map((x) => x ?? 0)))} tickFormatter={gwAxis} width={48} />
            <Tooltip
              cursor={{ stroke: 'var(--axis)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as Record<string, number | string | null>
                const chosen = chosenPublish ? row[chosenPublish] : null
                return (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      { label: 'Run used', value: formatGw(chosen as number | null), color: 'var(--series-1)' },
                      { label: 'Actual', value: formatGw(row.actual as number | null), color: 'var(--series-2)' },
                      { label: 'Range across runs', value: `${formatGw(row.min as number)} – ${formatGw(row.max as number)}` },
                    ]}
                  />
                )
              }}
            />
            {v.runs
              .filter((r) => r.publishTime !== chosenPublish)
              .map((r) => (
                <Line
                  key={r.publishTime}
                  dataKey={r.publishTime}
                  stroke="var(--muted-series)"
                  strokeWidth={1}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={false}
                />
              ))}
            {chosenPublish && (
              <Line dataKey={chosenPublish} stroke="var(--series-1)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            )}
            <Line dataKey="actual" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="footnote">{v.runs.length} forecast runs covered this day.</p>
    </Card>
  )
}

function vintageRows(v: Vintages) {
  return v.hours.map((hour, i) => {
    const row: Record<string, number | string | null> = { time: ukTime(hour), actual: v.actualMw[i] }
    const values: number[] = []
    for (const run of v.runs) {
      row[run.publishTime] = run.values[i]
      if (run.values[i] != null) values.push(run.values[i] as number)
    }
    row.min = values.length ? Math.min(...values) : null
    row.max = values.length ? Math.max(...values) : null
    return row
  })
}
