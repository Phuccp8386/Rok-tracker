import { looksSuspicious, type ScoredGovernor, type SortKey } from '../lib/metrics'
import { formatCompact, formatFull } from './SummaryCards'

interface Props {
  rows: ScoredGovernor[]
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  /** Show the kingdom column. Only useful when several kingdoms are merged. */
  showKingdom?: boolean
}

interface Column {
  key: SortKey
  label: string
  left?: boolean
  /** Compact formatting for large numbers. */
  compact?: boolean
  title?: string
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', title: 'Rank in the scanned leaderboard' },
  { key: 'name', label: 'Governor', left: true },
  { key: 'alliance', label: 'Alliance', left: true },
  { key: 'power', label: 'Power', compact: true },
  { key: 'killPoints', label: 'Kill Points', compact: true },
  { key: 'rangedPoints', label: 'Ranged', compact: true },
  { key: 'totalKills', label: 'Kills', compact: true },
  { key: 'highTierKills', label: 'T4+T5', compact: true },
  { key: 'deadTroops', label: 'Deaths', compact: true },
  { key: 'rssGathered', label: 'RSS', compact: true },
  { key: 'rssAssistance', label: 'Assist', compact: true },
  { key: 'helps', label: 'Helps', compact: true },
  { key: 'dkp', label: 'DKP', compact: true, title: 'Dominion Kill Points score' },
]

export default function GovernorTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  showKingdom = false,
}: Props) {
  // Governor ids are unique per kingdom, not globally, so the row key has to
  // include the kingdom when several kingdoms are merged.
  const rowKey = (row: ScoredGovernor) => `${row.kingdom ?? '-'}:${row.id}`

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showKingdom && (
              <th className="left" title="Kingdom the scan came from">
                KD
              </th>
            )}
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={[col.left ? 'left' : '', sortKey === col.key ? 'sorted' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSort(col.key)}
                title={col.title}
              >
                {col.label}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={looksSuspicious(row) ? 'flagged' : undefined}
            >
              {showKingdom && <td className="left">{row.kingdom ?? '-'}</td>}
              <td>{row.rank}</td>
              <td className="left">
                {row.name}
                {row.inactive && (
                  <span className="badge inactive" style={{ marginLeft: 6 }}>
                    inactive
                  </span>
                )}
              </td>
              <td className="left">
                {row.alliance ? (
                  <span className="badge tag">{row.alliance}</span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>-</span>
                )}
              </td>
              <td>{formatCompact(row.power)}</td>
              <td>{formatCompact(row.killPoints)}</td>
              <td>{formatCompact(row.rangedPoints)}</td>
              <td>{formatCompact(row.totalKills)}</td>
              <td>{formatCompact(row.highTierKills)}</td>
              <td>{formatCompact(row.deadTroops)}</td>
              <td>{formatCompact(row.rssGathered)}</td>
              <td>{formatCompact(row.rssAssistance)}</td>
              <td>{formatFull(row.helps)}</td>
              <td>{formatCompact(row.dkp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
