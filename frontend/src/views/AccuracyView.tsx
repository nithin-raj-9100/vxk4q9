import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { endpoints, type Accuracy, type DailyAccuracy, type LeadTimeBucket } from '../api'
import { Card, LegendKey, StatTile, TooltipBox } from '../components/ui'
import { formatGw, formatGwh, formatPct, formatSignedGw, gwAxis, longDate, niceTicks, shortDate, ukDateTime } from '../format'
import { useFetch } from '../useFetch'

const AXIS = { stroke: 'var(--axis)', tick: { fill: 'var(--text-muted)', fontSize: 12 }, tickLine: false }
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0]

export function AccuracyView({ cutoff }: { cutoff: string }) {
  const accuracy = useFetch<Accuracy>(endpoints.accuracy(cutoff))
  const a = accuracy.data

  if (accuracy.error && !a) return <p className="error">Could not load accuracy: {accuracy.error.message}</p>
  if (!a) return <p className="loading">Loading accuracy…</p>

  const o = a.overall
  return (
    <div className={accuracy.loading ? 'refreshing' : undefined}>
      <div className="stat-row">
        <StatTile label="Mean absolute error" value={formatGw(o.maeMw)} detail={`Across ${o.count} delivery hours`} />
        <StatTile
          emphasis
          label="Bias (actual − forecast)"
          value={formatSignedGw(o.biasMw)}
          detail={(o.biasMw ?? 0) < 0 ? 'Forecast over-predicts wind on average' : 'Forecast under-predicts wind on average'}
        />
        <StatTile label="RMSE" value={formatGw(o.rmseMw)} detail="Penalises large misses" />
        <StatTile label="WAPE" value={formatPct(o.wapePct)} detail="Total absolute error ÷ total wind" />
        <StatTile
          label="80% of hourly errors within"
          value={`${gwAxis(o.p10Mw ?? 0)} to +${gwAxis(o.p90Mw ?? 0)} GW`}
          detail="P10 to P90 of actual − forecast"
        />
      </div>
      <BacktestCard a={a} />
      <Insights a={a} />
      <DailyErrorCard daily={a.daily} />
      <div className="grid-2">
        <LeadTimeCard buckets={a.byLeadTime} cutoff={cutoff} />
        <HistogramCard a={a} />
      </div>
      <HourOfDayCard a={a} />
      <DailyTable daily={a.daily} />
    </div>
  )
}

function BacktestCard({ a }: { a: Accuracy }) {
  const b = a.backtest
  if (!b.hours || b.rawMaeMw == null || b.adjustedMaeMw == null) return null
  const improvement = (100 * (b.rawMaeMw - b.adjustedMaeMw)) / b.rawMaeMw
  return (
    <Card
      title="Backtest: decision desk vs raw forecast"
      subtitle={`Each January decision replayed at ${a.cutoff}, using only the errors that were known on that day. Covers ${b.days} delivery days (${b.hours} hours); the first few days are skipped while history builds up.`}
    >
      <div className="stat-row stat-row--flush">
        <StatTile label="Raw forecast error (MAE)" value={formatGw(b.rawMaeMw)} />
        <StatTile
          emphasis
          label="Bias-adjusted error (MAE)"
          value={formatGw(b.adjustedMaeMw)}
          detail={`${improvement.toFixed(0)}% lower than raw`}
        />
        <StatTile
          label="Days where adjusted was closer"
          value={`${b.daysAdjustedBetter} of ${b.days}`}
          detail="Delivery-day energy"
        />
        <StatTile
          label="P10–P90 range hit rate"
          value={formatPct(b.bandCoveragePct)}
          detail="Target 80%: the range is honestly sized"
        />
      </div>
    </Card>
  )
}

function decisionLeadWindow(cutoff: string): [number, number] {
  const [h, m] = cutoff.split(':').map(Number)
  const hoursToMidnight = 24 - (h + m / 60)
  return [hoursToMidnight, hoursToMidnight + 24]
}

function Insights({ a }: { a: Accuracy }) {
  const settled = a.daily.filter((d) => d.actualMwh != null)
  const overDays = settled.filter((d) => (d.actualMwh as number) < d.forecastMwh).length
  const worst = [...settled].sort((x, y) => (y.maeMw ?? 0) - (x.maeMw ?? 0))[0]
  const shortest = a.byLeadTime[0]
  const [from, to] = decisionLeadWindow(a.cutoff)
  const inWindow = a.byLeadTime.filter((b) => b.fromHours < to && b.toHours > from)
  const windowMae = inWindow.reduce((s, b) => s + (b.maeMw ?? 0) * b.count, 0) / inWindow.reduce((s, b) => s + b.count, 0)
  const peakHour = [...a.byHourOfDay].sort((x, y) => (y.maeMw ?? 0) - (x.maeMw ?? 0))[0]

  return (
    <Card title="What this means for day-ahead buying">
      <ul className="insights">
        <li>
          Wind came in <strong>below forecast on {overDays} of {settled.length}</strong> delivery days, by{' '}
          <strong>{formatGw(Math.abs(a.overall.biasMw ?? 0))}</strong> per hour on average. Buying against the raw
          forecast leaves a short position to cover in intraday or imbalance markets, usually at worse prices.
        </li>
        <li>
          At the {a.cutoff} cutoff, the hours you trade are {from.toFixed(1)}–{to.toFixed(1)} h ahead. Error at that
          range is <strong>{formatGw(windowMae)}</strong>, against <strong>{formatGw(shortest?.maeMw)}</strong> for
          forecasts 0–6 h ahead. Waiting for later runs gains little and cannot happen before gate closure.
        </li>
        {worst && (
          <li>
            The hardest day was <strong>{longDate(worst.deliveryDay)}</strong>, with a mean hourly miss of{' '}
            <strong>{formatGw(worst.maeMw)}</strong>. Days like this are what the P10–P90 range on the decision desk
            is sized for.
          </li>
        )}
        {peakHour && (
          <li>
            Errors peak around <strong>{String(peakHour.hour).padStart(2, '0')}:00</strong> UK time (
            {formatGw(peakHour.maeMw)} mean absolute error).
          </li>
        )}
      </ul>
    </Card>
  )
}

function DailyErrorCard({ daily }: { daily: DailyAccuracy[] }) {
  const rows = daily
    .filter((d) => d.actualMwh != null)
    .map((d) => ({ day: shortDate(d.deliveryDay), error: (d.actualMwh as number) - d.forecastMwh, d }))
  return (
    <Card
      title="Daily forecast error by delivery day"
      subtitle="Delivery-day wind energy, actual minus the forecast available at the cutoff. Below zero means less wind than forecast, so more power to buy."
    >
      <LegendKey
        items={[
          { label: 'Less wind than forecast (shortfall)', color: 'var(--negative)', kind: 'rect' },
          { label: 'More wind than forecast (surplus)', color: 'var(--positive)', kind: 'rect' },
        ]}
      />
      <div className="chart" role="img" aria-label="Daily energy forecast error across January">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="day" {...AXIS} interval={2} />
            <YAxis
              {...AXIS}
              ticks={niceTicks(Math.min(...rows.map((r) => r.error)), Math.max(...rows.map((r) => r.error)))}
              tickFormatter={(v: number) => String(Math.round(v / 1000))}
              width={48} label={{ value: 'GWh', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ fill: 'var(--hover-wash)' }}
              content={({ active, payload }) => {
                const row = active && payload?.[0]?.payload
                if (!row) return null
                const d: DailyAccuracy = row.d
                return (
                  <TooltipBox
                    title={`Delivery ${longDate(d.deliveryDay)}`}
                    rows={[
                      { label: 'Error (actual − forecast)', value: `${row.error > 0 ? '+' : ''}${formatGwh(row.error)}` },
                      { label: 'Forecast', value: formatGwh(d.forecastMwh), color: 'var(--series-1)' },
                      { label: 'Actual', value: formatGwh(d.actualMwh), color: 'var(--series-2)' },
                      { label: 'Mean abs. hourly error', value: formatGw(d.maeMw) },
                      { label: 'Forecast run', value: d.forecastPublishTime ? ukDateTime(d.forecastPublishTime) : '–' },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="error" radius={BAR_RADIUS} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.day} fill={r.error < 0 ? 'var(--negative)' : 'var(--positive)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function LeadTimeCard({ buckets, cutoff }: { buckets: LeadTimeBucket[]; cutoff: string }) {
  const [from, to] = decisionLeadWindow(cutoff)
  const rows = buckets.map((b) => ({
    label: `${b.fromHours}–${b.toHours}`,
    mae: b.maeMw,
    inWindow: b.fromHours < to && b.toHours > from,
    b,
  }))
  return (
    <Card
      title="Error vs forecast lead time"
      subtitle="Mean absolute error of all January forecast runs, grouped by hours between publication and delivery. Highlighted: lead times you trade on at this cutoff."
    >
      <LegendKey
        items={[
          { label: 'Day-ahead decision window', color: 'var(--series-1)', kind: 'rect' },
          { label: 'Other lead times', color: 'var(--muted-series)', kind: 'rect' },
        ]}
      />
      <div className="chart" role="img" aria-label="Mean absolute error by forecast lead time">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 16, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval={0} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} label={{ value: 'Hours ahead', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 12 }} />
            <YAxis {...AXIS} ticks={niceTicks(0, Math.max(...rows.map((r) => r.mae ?? 0)))} tickFormatter={gwAxis} width={40} />
            <Tooltip
              cursor={{ fill: 'var(--hover-wash)' }}
              content={({ active, payload }) => {
                const row = active && payload?.[0]?.payload
                if (!row) return null
                return (
                  <TooltipBox
                    title={`${row.label} h ahead`}
                    rows={[
                      { label: 'Mean abs. error', value: formatGw(row.b.maeMw) },
                      { label: 'Bias', value: formatSignedGw(row.b.biasMw) },
                      { label: 'Hours sampled', value: String(row.b.count) },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="mae" radius={BAR_RADIUS} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.label} fill={r.inWindow ? 'var(--series-1)' : 'var(--muted-series)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function HistogramCard({ a }: { a: Accuracy }) {
  const rows = a.errorHistogram.map((b) => ({ label: b.fromMw % 2000 === 0 ? String(b.fromMw / 1000) : '', ...b }))
  return (
    <Card title="Distribution of hourly errors" subtitle="Actual minus forecast for every delivery hour, in 0.5 GW bins.">
      <div className="chart" role="img" aria-label="Histogram of hourly forecast errors">
        <ResponsiveContainer width="100%" height={286}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 16, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval={0} label={{ value: 'GW (actual − forecast), bin start', position: 'insideBottom', offset: -10, fill: 'var(--text-muted)', fontSize: 12 }} />
            <YAxis {...AXIS} width={40} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--hover-wash)' }}
              content={({ active, payload }) => {
                const row = active && payload?.[0]?.payload
                if (!row) return null
                return (
                  <TooltipBox
                    title={`${formatSignedGw(row.fromMw)} to ${formatSignedGw(row.toMw)}`}
                    rows={[{ label: 'hours', value: String(row.count) }]}
                  />
                )
              }}
            />
            <Bar dataKey="count" fill="var(--series-1)" radius={BAR_RADIUS} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function HourOfDayCard({ a }: { a: Accuracy }) {
  const rows = a.byHourOfDay.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, ...h }))
  const ticks = niceTicks(0, Math.max(...rows.map((r) => r.maeMw ?? 0)))
  return (
    <Card title="Error by hour of day" subtitle="Mean absolute error for each delivery hour (UK time).">
      <div className="chart" role="img" aria-label="Mean absolute error by hour of day">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval={2} />
            <YAxis {...AXIS} ticks={ticks} tickFormatter={gwAxis} width={48} />
            <Tooltip
              cursor={{ fill: 'var(--hover-wash)' }}
              content={({ active, payload }) => {
                const row = active && payload?.[0]?.payload
                if (!row) return null
                return (
                  <TooltipBox
                    title={row.label}
                    rows={[
                      { label: 'Mean abs. error', value: formatGw(row.maeMw) },
                      { label: 'Bias', value: formatSignedGw(row.biasMw) },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="maeMw" fill="var(--series-1)" radius={BAR_RADIUS} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function DailyTable({ daily }: { daily: DailyAccuracy[] }) {
  return (
    <Card title="Daily detail">
      <details className="table-details">
        <summary>Show table ({daily.length} decision days)</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Decision day</th>
              <th>Delivery day</th>
              <th>Forecast run</th>
              <th>Forecast</th>
              <th>Actual</th>
              <th>MAE</th>
              <th>Bias</th>
              <th>WAPE</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.decisionDay}>
                <td>{longDate(d.decisionDay)}</td>
                <td>{longDate(d.deliveryDay)}</td>
                <td>{d.forecastPublishTime ? ukDateTime(d.forecastPublishTime) : '–'}</td>
                <td>{formatGwh(d.forecastMwh)}</td>
                <td>{formatGwh(d.actualMwh)}</td>
                <td>{formatGw(d.maeMw)}</td>
                <td>{formatSignedGw(d.biasMw)}</td>
                <td>{formatPct(d.wapePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  )
}
