import type { ScoredGovernor } from '../lib/metrics'

interface Props {
  rows: ScoredGovernor[]
  totalKillPoints: number
  totalPower: number
  totalDeaths: number
}

/** Headline numbers for the selected scan. */
export default function SummaryCards({
  rows,
  totalKillPoints,
  totalPower,
  totalDeaths,
}: Props) {
  const avgPower = rows.length > 0 ? Math.round(totalPower / rows.length) : 0
  const active = rows.filter((r) => !r.inactive).length
  const topDkp = rows.reduce((max, r) => Math.max(max, r.dkp), 0)

  return (
    <div className="cards">
      <div className="card">
        <div className="k">Players</div>
        <div className="v">{rows.length}</div>
      </div>
      <div className="card">
        <div className="k">Total Kill Points</div>
        <div className="v">{formatCompact(totalKillPoints)}</div>
      </div>
      <div className="card">
        <div className="k">Total Power</div>
        <div className="v">{formatCompact(totalPower)}</div>
      </div>
      <div className="card">
        <div className="k">Avg Power</div>
        <div className="v">{formatCompact(avgPower)}</div>
      </div>
      <div className="card">
        <div className="k">Total Deaths</div>
        <div className="v">{formatCompact(totalDeaths)}</div>
      </div>
      <div className="card">
        <div className="k">Active / Inactive</div>
        <div className="v">
          {active} / {rows.length - active}
        </div>
      </div>
      <div className="card">
        <div className="k">Top DKP</div>
        <div className="v">{formatCompact(topDkp)}</div>
      </div>
    </div>
  )
}

/** Compact number formatting: 1.2M, 345K, 1.5B. */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '-'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

/** Full number with thousands separators. */
export function formatFull(n: number): string {
  if (!Number.isFinite(n)) return '-'
  return Math.round(n).toLocaleString()
}
