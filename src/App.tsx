import { useEffect, useMemo, useState } from 'react'
import { loadIndex, loadScan } from './lib/data'
import {
  DEFAULT_DKP_WEIGHTS,
  scoreAll,
  sortGovernors,
  summariseAlliances,
  total,
  type SortKey,
} from './lib/metrics'
import type { Governor, Scan, ScanIndexEntry } from './types'
import GovernorTable from './components/GovernorTable'
import AllianceBreakdown from './components/AllianceBreakdown'
import SummaryCards from './components/SummaryCards'
import ScanPicker from './components/ScanPicker'
import KingdomFilter from './components/KingdomFilter'
import DataQuality from './components/DataQuality'

type Tab = 'governors' | 'alliances'

export default function App() {
  const [index, setIndex] = useState<ScanIndexEntry[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ScanIndexEntry | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('governors')
  const [hideInactive, setHideInactive] = useState(false)

  /**
   * Which kingdoms to show.
   * 'all' merges every scan in the index; a specific kingdom shows only that
   * kingdom's scans. Scans are merged so a multi-kingdom dashboard works even
   * though each scanner run only ever covers one kingdom.
   */
  const [kingdomFilter, setKingdomFilter] = useState<string>('all')

  // Load the index on mount.
  useEffect(() => {
    let cancelled = false
    loadIndex().then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.error) {
        setIndexError(res.error)
        return
      }
      setIndex(res.data ?? [])
      const entries = res.data ?? []
      if (entries.length > 0) {
        const newest = [...entries].sort((a, b) =>
          b.scannedAt.localeCompare(a.scannedAt),
        )[0]
        setSelected(newest)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * The set of scans to display.
   *
   * Only the newest scan of each kingdom is used. Merging several scans of
   * the same kingdom would duplicate every governor, and the older scans are
   * still reachable through the scan picker.
   */
  const activeEntries = useMemo(() => {
    if (!index) return []

    const newestPerKingdom = new Map<string, ScanIndexEntry>()
    for (const entry of [...index].sort((a, b) =>
      b.scannedAt.localeCompare(a.scannedAt),
    )) {
      const key = entry.kingdom ?? 'unknown'
      if (!newestPerKingdom.has(key)) newestPerKingdom.set(key, entry)
    }

    if (kingdomFilter === 'all') {
      return [...newestPerKingdom.values()]
    }
    const match = newestPerKingdom.get(kingdomFilter)
    return match ? [match] : []
  }, [index, kingdomFilter])

  // Load every active scan and merge them.
  const [scans, setScans] = useState<Scan[]>([])
  useEffect(() => {
    if (activeEntries.length === 0) {
      setScans([])
      return
    }
    let cancelled = false
    setScanError(null)

    Promise.all(
      activeEntries.map((entry) =>
        loadScan(entry).then((res) => ({ entry, res })),
      ),
    ).then((results) => {
      if (cancelled) return
      const errors = results.filter((r) => r.res.error)
      if (errors.length > 0) {
        setScanError(errors.map((e) => `${e.entry.label}: ${e.res.error}`).join('; '))
      }
      const loaded = results
        .map((r) => r.res.data)
        .filter((s): s is Scan => s !== null)
      setScans(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [activeEntries])

  const scored = useMemo(() => {
    const rows: Governor[] = scans.flatMap((s) =>
      s.governors.map((g) => ({
        ...g,
        // Keep the kingdom on the row so merged views stay readable.
        kingdom: s.kingdom,
      })),
    )
    return scoreAll(rows, DEFAULT_DKP_WEIGHTS)
  }, [scans])

  const filtered = useMemo(() => {
    let rows = scored
    if (hideInactive) rows = rows.filter((r) => !r.inactive)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.alliance.toLowerCase().includes(q) ||
          r.id.includes(q),
      )
    }
    return sortGovernors(rows, sortKey, sortDir)
  }, [scored, query, hideInactive, sortKey, sortDir])

  const alliances = useMemo(() => summariseAlliances(filtered), [filtered])

  /** Distinct kingdoms present in the index, used for the column toggle. */
  const kingdoms = useMemo(
    () => [...new Set((index ?? []).map((e) => e.kingdom ?? 'unknown'))],
    [index],
  )

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'alliance' ? 'asc' : 'desc')
    }
  }

  if (loading) {
    return (
      <div className="app">
        <div className="empty">Loading scans…</div>
      </div>
    )
  }

  if (indexError) {
    return (
      <div className="app">
        <Header count={0} kingdom="-" />
        <div className="error">
          <p>
            Could not load <code>data/index.json</code>: {indexError}
          </p>
          <p>
            Deploy your scan data into the <code>public/data</code> folder, or
            point the scanner at this repository and push the result.
          </p>
        </div>
      </div>
    )
  }

  if (!index || index.length === 0) {
    return (
      <div className="app">
        <Header count={0} kingdom="-" />
        <div className="empty">
          <p>No scans available yet.</p>
          <p>
            Run the scanner to produce <code>data/scans/*.json</code> and
            regenerate <code>data/index.json</code>, then push to GitHub.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        count={index.length}
        kingdom={
          kingdomFilter === 'all' ? 'all kingdoms' : `kingdom ${kingdomFilter}`
        }
      />

      <div className="controls">
        <ScanPicker
          entries={index}
          selected={selected}
          onSelect={setSelected}
        />
        <KingdomFilter
          entries={index}
          value={kingdomFilter}
          onChange={setKingdomFilter}
        />
        <div className="control">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            type="search"
            placeholder="name, alliance, id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="control">
          <label>Rows</label>
          <button
            className={hideInactive ? '' : 'on'}
            onClick={() => setHideInactive((v) => !v)}
            title="Hide accounts flagged as inactive"
          >
            {hideInactive ? 'Hide inactive: on' : 'Hide inactive: off'}
          </button>
        </div>
      </div>

      {scanError && <div className="error">Failed to load scan: {scanError}</div>}

      {scans.length > 0 && (
        <>
          <SummaryCards
            rows={scored}
            totalKillPoints={total(scored, 'killPoints')}
            totalPower={total(scored, 'power')}
            totalDeaths={total(scored, 'deadTroops')}
          />

          <DataQuality governors={scored} />

          <div className="tabs">
            <button
              className={tab === 'governors' ? 'on' : 'ghost'}
              onClick={() => setTab('governors')}
            >
              Governors
            </button>
            <button
              className={tab === 'alliances' ? 'on' : 'ghost'}
              onClick={() => setTab('alliances')}
            >
              Alliances
            </button>
          </div>

          {tab === 'governors' ? (
            <GovernorTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              showKingdom={kingdomFilter === 'all' && kingdoms.length > 1}
            />
          ) : (
            <AllianceBreakdown rows={filtered} alliances={alliances} />
          )}
        </>
      )}
    </div>
  )
}

function Header({
  count,
  kingdom,
}: {
  count: number
  kingdom: string
}) {
  return (
    <header className="header">
      <h1>
        RoK<span>Tracker</span>
      </h1>
      <div className="spacer" />
      <div className="header-meta">
        {kingdom} · {count} scan{count === 1 ? '' : 's'} available
      </div>
    </header>
  )
}
