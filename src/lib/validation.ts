import {
  KILL_POINTS_PER_KILL,
  LIMITS,
  TIERS,
  TOLERANCE,
  expectedKillPoints,
  maxKillPointsForKills,
  minKillPointsForKills,
  type TierValues,
} from './game-constants'
import type { Governor } from '../types'

/**
 * Data validation.
 *
 * The scanner reads the screen with OCR, so numbers can be misread. This
 * module cross-checks every row against the game's own arithmetic and reports
 * what it finds. It does not "fix" data silently - a row that fails is
 * surfaced so a human can look at the screenshot.
 */

export type Severity = 'ok' | 'warn' | 'error'

export type IssueCode =
  | 'kill-point-mismatch'
  | 'total-kills-mismatch'
  | 'kill-points-out-of-range'
  | 'power-out-of-range'
  | 'deaths-out-of-range'
  | 'rss-out-of-range'
  | 'helps-out-of-range'
  | 'no-kill-data'
  | 'tier-kills-zero'

export interface ValidationIssue {
  code: IssueCode
  severity: Severity
  /** Human readable explanation. */
  message: string
  /** The measured value. */
  actual: number
  /** The value the data implies it should have been, when known. */
  expected?: number
}

export interface ValidationResult {
  severity: Severity
  issues: ValidationIssue[]
  /** Expected kill points derived from the tier breakdown. */
  expectedKillPoints: number | null
  /** Difference between reported and expected kill points. */
  killPointDelta: number | null
  /** Relative difference, 0..1. Null when it cannot be computed. */
  killPointError: number | null
}

function relativeError(actual: number, expected: number): number | null {
  if (expected === 0) return actual === 0 ? 0 : null
  return Math.abs(actual - expected) / expected
}

function worst(issues: ValidationIssue[]): Severity {
  if (issues.some((i) => i.severity === 'error')) return 'error'
  if (issues.some((i) => i.severity === 'warn')) return 'warn'
  return 'ok'
}

/**
 * Validate a single governor row.
 *
 * The core check is the kill point reconciliation:
 *
 *     killPoints == t1*0.2 + t2*2 + t3*4 + t4*10 + t5*20
 *
 * Because the game computes kill points this way, a row whose reported kill
 * points do not match its tier breakdown cannot be right - one of the two was
 * misread.
 */
export function validateGovernor(g: Governor): ValidationResult {
  const issues: ValidationIssue[] = []

  const hasTierData = TIERS.some((tier) => g.kills[tier] > 0)
  const hasKillPoints = g.killPoints > 0

  // --- Kill point reconciliation -----------------------------------------
  let expectedKP: number | null = null
  let kpDelta: number | null = null
  let kpError: number | null = null

  if (hasTierData) {
    expectedKP = expectedKillPoints(g.kills)
    kpDelta = g.killPoints - expectedKP
    kpError = relativeError(g.killPoints, expectedKP)

    if (kpError !== null) {
      const severity: Severity =
        kpError > TOLERANCE.killPointError
          ? 'error'
          : kpError > TOLERANCE.killPointWarn
            ? 'warn'
            : 'ok'

      if (severity !== 'ok') {
        issues.push({
          code: 'kill-point-mismatch',
          severity,
          message:
            `Kill points ${format(g.killPoints)} do not match the T1-T5 breakdown ` +
            `(${format(expectedKP)} expected, ${(kpError * 100).toFixed(1)}% off)`,
          actual: g.killPoints,
          expected: expectedKP,
        })
      }
    }
  } else if (hasKillPoints) {
    issues.push({
      code: 'no-kill-data',
      severity: 'warn',
      message:
        'Kill points are present but the T1-T5 breakdown is missing, so the ' +
        'values cannot be cross-checked',
      actual: g.killPoints,
    })
  }

  // --- Total kills vs tier breakdown -------------------------------------
  const tierSum = TIERS.reduce((sum, tier) => sum + g.kills[tier], 0)
  if (hasTierData && g.totalKills > 0) {
    const err = relativeError(g.totalKills, tierSum)
    if (err !== null && err > TOLERANCE.totalKillsWarn) {
      issues.push({
        code: 'total-kills-mismatch',
        severity: err > TOLERANCE.totalKillsError ? 'error' : 'warn',
        message:
          `Total kills ${format(g.totalKills)} does not match the tier breakdown ` +
          `(${format(tierSum)})`,
        actual: g.totalKills,
        expected: tierSum,
      })
    }
  }

  // --- Kill points within the physical bounds ----------------------------
  // A kill is worth between 0.2 and 20 points, so total kill points must sit
  // inside that band derived from the reported total kills.
  if (g.totalKills > 0) {
    const maxKP = maxKillPointsForKills(g.totalKills)
    const minKP = minKillPointsForKills(g.totalKills)
    if (g.killPoints > maxKP * 1.02) {
      issues.push({
        code: 'kill-points-out-of-range',
        severity: 'error',
        message:
          `Kill points ${format(g.killPoints)} exceed the maximum possible ` +
          `${format(maxKP)} for ${format(g.totalKills)} kills`,
        actual: g.killPoints,
        expected: Math.round(maxKP),
      })
    } else if (g.killPoints < minKP * 0.98) {
      issues.push({
        code: 'kill-points-out-of-range',
        severity: 'warn',
        message:
          `Kill points ${format(g.killPoints)} are below the minimum possible ` +
          `${format(minKP)} for ${format(g.totalKills)} kills`,
        actual: g.killPoints,
        expected: Math.round(minKP),
      })
    }
  }

  // --- Ranged points sanity ----------------------------------------------
  // Ranged points are separate from kill points but cannot exceed a sane
  // multiple of them. A wild value means a misread digit.
  if (g.rangedPoints > 0 && g.killPoints > 0) {
    const ratio = g.rangedPoints / g.killPoints
    if (ratio > TOLERANCE.rangedToKillPointError) {
      issues.push({
        code: 'kill-points-out-of-range',
        severity: 'error',
        message:
          `Ranged points ${format(g.rangedPoints)} are implausible against ` +
          `${format(g.killPoints)} kill points`,
        actual: g.rangedPoints,
        expected: Math.round(g.killPoints * TOLERANCE.rangedToKillPointWarn),
      })
    }
  }

  // --- Range checks -------------------------------------------------------
  if (g.power < LIMITS.minPower || g.power > LIMITS.maxPower) {
    issues.push({
      code: 'power-out-of-range',
      severity: 'error',
      message: `Power ${format(g.power)} is outside the possible range`,
      actual: g.power,
    })
  }

  if (g.deadTroops < 0 || g.deadTroops > LIMITS.maxDeaths) {
    issues.push({
      code: 'deaths-out-of-range',
      severity: 'error',
      message: `Dead troops ${format(g.deadTroops)} is outside the possible range`,
      actual: g.deadTroops,
    })
  }

  if (g.rssGathered < 0 || g.rssGathered > LIMITS.maxRss) {
    issues.push({
      code: 'rss-out-of-range',
      severity: 'error',
      message: `RSS gathered ${format(g.rssGathered)} is outside the possible range`,
      actual: g.rssGathered,
    })
  }

  if (g.helps < 0 || g.helps > LIMITS.maxHelps) {
    issues.push({
      code: 'helps-out-of-range',
      severity: 'error',
      message: `Helps ${format(g.helps)} is outside the possible range`,
      actual: g.helps,
    })
  }

  // A governor with tier kills but no tier recorded at all is impossible.
  if (!hasTierData && g.totalKills > 0) {
    issues.push({
      code: 'tier-kills-zero',
      severity: 'warn',
      message: `${format(g.totalKills)} kills recorded but every tier is zero`,
      actual: g.totalKills,
    })
  }

  return {
    severity: worst(issues),
    issues,
    expectedKillPoints: expectedKP,
    killPointDelta: kpDelta,
    killPointError: kpError,
  }
}

/** Validate a whole scan and summarise the outcome. */
export interface ScanValidation {
  rows: number
  ok: number
  warn: number
  error: number
  /** Share of rows that are fully clean, 0..1. */
  cleanShare: number
  /** Rows that failed, with their issues. */
  failures: Array<{ governor: Governor; result: ValidationResult }>
}

export function validateScan(governors: Governor[]): ScanValidation {
  const failures: Array<{ governor: Governor; result: ValidationResult }> = []
  let ok = 0
  let warn = 0
  let error = 0

  for (const g of governors) {
    const result = validateGovernor(g)
    if (result.severity === 'error') error += 1
    else if (result.severity === 'warn') warn += 1
    else ok += 1

    if (result.severity !== 'ok') {
      failures.push({ governor: g, result })
    }
  }

  const rows = governors.length
  return {
    rows,
    ok,
    warn,
    error,
    cleanShare: rows > 0 ? ok / rows : 0,
    failures,
  }
}

/**
 * Reconstruct the tier breakdown that best explains the reported kill points.
 *
 * The scanner's own "kill reconstruction" feature does the same thing. Given
 * the reported kill points and total kills, we find the mix of tiers that
 * reproduces the kill points most closely.
 *
 * The search is a greedy ladder over the tiers from T5 downwards: it commits
 * as many high-tier kills as the kill point budget allows, then spends what
 * is left on the next tier down. This keeps the reconstructed mix as
 * high-tier as the data allows, which matches how real kill breakdowns look.
 *
 * Returns null when no reasonable mix exists.
 */
export function reconstructKills(
  killPoints: number,
  totalKills: number,
): TierValues | null {
  if (totalKills <= 0 || killPoints < 0) return null

  const perKill = killPoints / totalKills
  if (perKill < KILL_POINTS_PER_KILL.t1 || perKill > KILL_POINTS_PER_KILL.t5) {
    return null
  }

  const result: TierValues = { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 }
  let remainingKills = totalKills
  let remainingKP = killPoints

  for (const tier of TIERS) {
    if (remainingKills <= 0) break

    const perKillValue = KILL_POINTS_PER_KILL[tier]
    // How many kills of this tier can the remaining kill points afford?
    let affordable = Math.floor(remainingKP / perKillValue)
    // How many kills of this tier can we still place?
    let placeable = remainingKills

    // If we cannot afford to fill the remaining kills with this tier, fall
    // through to the next (cheaper) tier.
    if (affordable < placeable) {
      // Only commit what we can afford; the rest goes to cheaper tiers.
      const commit = Math.max(0, affordable)
      result[tier] = commit
      remainingKills -= commit
      remainingKP -= commit * perKillValue
      continue
    }

    // We can afford to fill everything with this tier, but a lower tier would
    // fit the budget better. Stop here and let the next tier take over.
    if (tier !== 't5' && perKillValue > remainingKP / remainingKills) {
      break
    }

    result[tier] = placeable
    remainingKills -= placeable
    remainingKP -= placeable * perKillValue
  }

  // Anything left over becomes the cheapest tier.
  if (remainingKills > 0) {
    result.t1 += remainingKills
  }

  const reconstructedKP = expectedKillPoints(result)
  const error = Math.abs(reconstructedKP - killPoints)
  if (error / Math.max(killPoints, 1) > 0.01) return null
  return result
}

function format(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}
