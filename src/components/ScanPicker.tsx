import type { ScanIndexEntry } from '../types'

interface Props {
  entries: ScanIndexEntry[]
  selected: ScanIndexEntry | null
  onSelect: (entry: ScanIndexEntry) => void
}

/** Dropdown to pick which scan to display. */
export default function ScanPicker({ entries, selected, onSelect }: Props) {
  const sorted = [...entries].sort((a, b) =>
    b.scannedAt.localeCompare(a.scannedAt),
  )

  return (
    <div className="control">
      <label htmlFor="scan">Scan</label>
      <select
        id="scan"
        value={selected?.file ?? ''}
        onChange={(e) => {
          const entry = sorted.find((x) => x.file === e.target.value)
          if (entry) onSelect(entry)
        }}
      >
        {sorted.map((entry) => (
          <option key={entry.file} value={entry.file}>
            {entry.label} · {entry.count} players ·{' '}
            {new Date(entry.scannedAt).toLocaleString()}
          </option>
        ))}
      </select>
    </div>
  )
}
