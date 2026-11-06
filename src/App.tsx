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
import type { Scan, ScanIndexEntry } from './types'
import GovernorTable from './components/GovernorTable'
import AllianceBreakdown from './components/AllianceBreakdown'
import SummaryCards from './components/SummaryCards'
import ScanPicker from './components/ScanPicker'

type Tab = 'governors' | 'alliances'

export default function App() {
  const [index, setIndex] = useState<ScanIndexEntry[] | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ScanIndexEntry | null>(null)
  const [scan, setScan] = useState<Scan | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('governors')
  const [hideInactive, setHideInactive] = useState(false)

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
      // Default to the newest scan.
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

  // Load the selected scan.
  useEffect(() => {
    if (!selected) {
      setScan(null)
      return
    }
    let cancelled = false
    setScanError(null)
    loadScan(selected).then((res) => {
      if (cancelled) return
      if (res.error) {
        setScanError(res.error)
        setScan(null)
        return
      }
      setScan(res.data)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  const scored = useMemo(
    () => (scan ? scoreAll(scan.governors, DEFAULT_DKP_WEIGHTS) : []),
    [scan],
  )

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
        <Header count={0} />
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
        <Header count={0} />
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
      <Header count={index.length} />

      <div className="controls">
        <ScanPicker
          entries={index}
          selected={selected}
          onSelect={setSelected}
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

      {scan && (
        <>
          <SummaryCards
            rows={scored}
            totalKillPoints={total(scored, 'killPoints')}
            totalPower={total(scored, 'power')}
            totalDeaths={total(scored, 'deadTroops')}
          />

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
            />
          ) : (
            <AllianceBreakdown rows={filtered} alliances={alliances} />
          )}
        </>
      )}
    </div>
  )
}

function Header({ count }: { count: number }) {
  return (
    <header className="header">
      <h1>
        RoK<span>Tracker</span>
      </h1>
      <div className="spacer" />
      <div className="header-meta">
        {count} scan{count === 1 ? '' : 's'} available
      </div>
    </header>
  )
}