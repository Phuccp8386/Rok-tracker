import type { Governor } from '../types'
import { KILL_POINTS_PER_KILL } from './game-constants'

/**
 * DKP (Dominion Kill Points) style score.
 *
 * The exact weights are configurable because every alliance runs its own
 * scoring policy. The defaults below follow the community's standard KvK
 * contribution formula:
 *
 *   - T4 kill = 1 point, T5 kill = 2 points
 *   - Dead troop = 10 points (you did fight, even if you lost)
 *   - RSS gathered = 1 point per 10,000
 *
 * Kill points themselves are weighted lightly because they are already the
 * game's own measure of combat contribution and are enormous numbers, which
 * would otherwise swamp every other term.
 */
export interface DkpWeights {
  killPoints: number
  highTierKills: number
  rssGathered: number
  rssAssistance: number
  helps: number
  /** Multiplier applied to dead troops. Negative values penalise deaths. */
  deadTroops: number
}

export const DEFAULT_DKP_WEIGHTS: DkpWeights = {
  killPoints: 0.001,
  highTierKills: 1,
  rssGathered: 1 / 10_000,
  rssAssistance: 0,
  helps: 0,
  deadTroops: 10,
}

/** Kill point value of a T4 and T5 kill, used by the DKP formula. */
export const DKP_T4_POINTS = 1
export const DKP_T5_POINTS = 2

export interface ScoredGovernor extends Governor {
  dkp: number
}

/** Compute the DKP score for a single governor. */
export function scoreGovernor(
  g: Governor,
  weights: DkpWeights = DEFAULT_DKP_WEIGHTS,
): number {
  const raw =
    g.killPoints * weights.killPoints +
    g.highTierKills * weights.highTierKills +
    g.rssGathered * weights.rssGathered +
    g.rssAssistance * weights.rssAssistance +
    g.helps * weights.helps +
    g.deadTroops * weights.deadTroops

  return Math.max(0, Math.round(raw))
}

/** Score every governor in a scan. */
export function scoreAll(
  governors: Governor[],
  weights: DkpWeights = DEFAULT_DKP_WEIGHTS,
): ScoredGovernor[] {
  return governors.map((g) => ({ ...g, dkp: scoreGovernor(g, weights) }))
}

/**
 * Kill point per kill, used to sanity-check OCR output.
 * A governor killing T4/T5 troops earns far more kill points per kill,
 * so a low ratio suggests a misread value.
 */
export function killPointRatio(g: Governor): number | null {
  if (!g.totalKills) return null
  return g.killPoints / g.totalKills
}

/**
 * Expected kill points for a row, derived from its tier breakdown.
 * Mirrors the game's own arithmetic.
 */
export function expectedKillPointsFor(g: Governor): number {
  return (
    g.kills.t1 * KILL_POINTS_PER_KILL.t1 +
    g.kills.t2 * KILL_POINTS_PER_KILL.t2 +
    g.kills.t3 * KILL_POINTS_PER_KILL.t3 +
    g.kills.t4 * KILL_POINTS_PER_KILL.t4 +
    g.kills.t5 * KILL_POINTS_PER_KILL.t5
  )
}

export type SortKey =
  | 'rank'
  | 'name'
  | 'alliance'
  | 'power'
  | 'killPoints'
  | 'rangedPoints'
  | 'totalKills'
  | 'highTierKills'
  | 'deadTroops'
  | 'rssGathered'
  | 'rssAssistance'
  | 'helps'
  | 'dkp'

export const SORTABLE_KEYS: SortKey[] = [  'rank',
  'name',
  'alliance',
  'power',
  'killPoints',
  'rangedPoints',
  'totalKills',
  'highTierKills',
  'deadTroops',
  'rssGathered',
  'rssAssistance',
  'helps',
  'dkp',
]

/** Sort governors by a column. Numeric columns sort descending by default. */
export function sortGovernors(
  rows: ScoredGovernor[],
  key: SortKey,
  direction: 'asc' | 'desc' = 'desc',
): ScoredGovernor[] {
  const numeric = key !== 'name' && key !== 'alliance'
  const sign = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    let cmp: number
    if (key === 'name' || key === 'alliance') {
      cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
    } else {
      cmp = (a[key] as number) - (b[key] as number)
    }
    if (cmp === 0) return a.rank - b.rank
    return numeric ? cmp * sign : cmp
  })
}

/** Per-alliance aggregate used by the alliance breakdown view. */
export interface AllianceSummary {
  alliance: string
  members: number
  power: number
  killPoints: number
  highTierKills: number
  deadTroops: number
  rssGathered: number
  dkp: number
  /** Share of the kingdom's total DKP, 0..1 */
  dkpShare: number
}

export function summariseAlliances(rows: ScoredGovernor[]): AllianceSummary[] {
  const byAlliance = new Map<string, AllianceSummary>()

  for (const row of rows) {
    const tag = row.alliance || 'Unaligned'
    let entry = byAlliance.get(tag)
    if (!entry) {
      entry = {
        alliance: tag,
        members: 0,
        power: 0,
        killPoints: 0,
        highTierKills: 0,
        deadTroops: 0,
        rssGathered: 0,
        dkp: 0,
        dkpShare: 0,
      }
      byAlliance.set(tag, entry)
    }
    entry.members += 1
    entry.power += row.power
    entry.killPoints += row.killPoints
    entry.highTierKills += row.highTierKills
    entry.deadTroops += row.deadTroops
    entry.rssGathered += row.rssGathered
    entry.dkp += row.dkp
  }

  const totalDkp = [...byAlliance.values()].reduce((sum, a) => sum + a.dkp, 0)
  for (const a of byAlliance.values()) {
    a.dkpShare = totalDkp > 0 ? a.dkp / totalDkp : 0
  }

  return [...byAlliance.values()].sort((a, b) => b.dkp - a.dkp)
}

/** Sum of a numeric column across a set of governors. */
export function total(rows: ScoredGovernor[], key: SortKey): number {
  if (key === 'name' || key === 'alliance') return 0
  return rows.reduce((sum, r) => sum + (r[key] as number), 0)
}
