import type { ScanIndexEntry } from '../types'

interface Props {
  entries: ScanIndexEntry[]
  value: string
  onChange: (value: string) => void
}

/**
 * Kingdom selector.
 *
 * "All kingdoms" merges the newest scan of every kingdom into one view;
 * picking a specific kingdom shows only that kingdom's scans.
 */
export default function KingdomFilter({ entries, value, onChange }: Props) {
  const kingdoms = [...new Set(entries.map((e) => e.kingdom ?? 'unknown'))].sort(
    (a, b) => a.localeCompare(b),
  )

  return (
    <div className="control">
      <label htmlFor="kd">Kingdom</label>
      <select
        id="kd"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">All kingdoms ({kingdoms.length})</option>
        {kingdoms.map((kd) => (
          <option key={kd} value={kd}>
            Kingdom {kd}
          </option>
        ))}
      </select>
    </div>
  )
}
