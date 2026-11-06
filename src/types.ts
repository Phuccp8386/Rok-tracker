/**
 * Data model shared by the scanner output and the dashboard.
 *
 * The scanner (see `tools/`) normalises whatever the source tracker produced
 * (XLSX / CSV / JSONL) into this shape, so the dashboard only ever deals
 * with one schema.
 */

export interface Governor {
  /** In-game governor id, e.g. "123456789" */
  id: string
  /** Governor nickname */
  name: string
  /** Alliance tag, e.g. "TITAN". Empty when unknown. */
  alliance: string
  /** Total power */
  power: number
  /** Lifetime kill points */
  killPoints: number
  /** Lifetime ranged points */
  rangedPoints: number
  /** Kills per troop tier, keyed T1..T5 */
  kills: {
    t1: number
    t2: number
    t3: number
    t4: number
    t5: number
  }
  /** Total troops killed */
  totalKills: number
  /** T4 + T5 kills combined */
  highTierKills: number
  /** Lifetime troops lost */
  deadTroops: number
  /** Resources gathered */
  rssGathered: number
  /** Resources sent as help */
  rssAssistance: number
  /** Help events given */
  helps: number
  /** Rank in the source leaderboard, 1-based */
  rank: number
  /** True when the account shows signs of being inactive. */
  inactive: boolean
  /** Kingdom the row came from. Set when scans from several kingdoms merge. */
  kingdom?: string
}

export interface Scan {
  /** ISO timestamp of the scan */
  scannedAt: string
  /** Human label, e.g. "KVK4 Pass 4" */
  label: string
  /** Which leaderboard was scanned */
  scope: 'kingdom' | 'alliance' | 'honor'
  /** Kingdom number, when known */
  kingdom?: string
  /** Alliance tag, when scanning an alliance */
  alliance?: string
  /** All governors in this scan */
  governors: Governor[]
}

/** Index file listing every scan available to the dashboard. */
export interface ScanIndexEntry {
  scannedAt: string
  label: string
  scope: Scan['scope']
  kingdom?: string
  alliance?: string
  /** Number of governors in the scan */
  count: number
  /** Path relative to the site root, e.g. "data/scans/2026-01-01T00-00-00Z.json" */
  file: string
}
