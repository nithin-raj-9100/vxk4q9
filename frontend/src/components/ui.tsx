import type { CSSProperties, ReactNode } from 'react'

export function StatTile({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  emphasis?: boolean
}) {
  return (
    <div className={`stat-tile${emphasis ? ' stat-tile--emphasis' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  )
}

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

export function LegendKey({ items }: { items: { label: string; color: string; kind: 'line' | 'dashed' | 'area' | 'rect' }[] }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`legend-key legend-key--${item.kind}`} style={{ '--key-color': item.color } as CSSProperties} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export interface TooltipRow {
  label: string
  value: string
  color?: string
}

export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((row) => (
        <div className="chart-tooltip-row" key={row.label}>
          {row.color && <span className="chart-tooltip-key" style={{ background: row.color }} />}
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
