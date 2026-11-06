import type { AllianceSummary, ScoredGovernor } from '../lib/metrics'
import { formatCompact } from './SummaryCards'

interface Props {
  rows: ScoredGovernor[]
  alliances: AllianceSummary[]
}

/** Per-alliance aggregate cards. */
export default function AllianceBreakdown({ rows, alliances }: Props) {
  if (alliances.length === 0) {
    return <div className="empty">No alliance data in this scan.</div>
  }

  const maxDkp = Math.max(...alliances.map((a) => a.dkp), 1)

  return (
    <div className="alliances">
      {alliances.map((a) => (
        <div className="alliance-card" key={a.alliance}>
          <div className="top">
            <span className="name">{a.alliance}</span>
            <span className="share">{(a.dkpShare * 100).toFixed(1)}% DKP</span>
          </div>
          <div className="stats">
            <span>{a.members} members</span>
            <span>Power {formatCompact(a.power)}</span>
            <span>KP {formatCompact(a.killPoints)}</span>
            <span>T4+T5 {formatCompact(a.highTierKills)}</span>
            <span>Deaths {formatCompact(a.deadTroops)}</span>
            <span>RSS {formatCompact(a.rssGathered)}</span>
          </div>
          <div className="bar">
            <div style={{ width: `${(a.dkp / maxDkp) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="alliance-card" style={{ opacity: 0.7 }}>
        <div className="top">
          <span className="name">Total</span>
          <span className="share">{rows.length} governors</span>
        </div>
      </div>
    </div>
  )
}
