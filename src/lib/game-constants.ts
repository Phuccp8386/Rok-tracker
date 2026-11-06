import constants from './game-constants.json'

/**
 * Verified Rise of Kingdoms game constants.
 *
 * These are not guesses - they are the published kill point values for each
 * troop tier. Ranged points are calculated by the game *separately* from kill
 * points, so they are excluded from the kill point reconciliation.
 */

export interface TierValues {
  t1: number
  t2: number
  t3: number
  t4: number
  t5: number
}

export const KILL_POINTS_PER_KILL = constants.killPointsPerKill as TierValues
export const TROOP_POWER_PER_UNIT = constants.troopPowerPerUnit as TierValues

export const LIMITS = constants.limits
export const TOLERANCE = constants.tolerance

/** The five troop tiers, in order. */
export const TIERS = ['t1', 't2', 't3', 't4', 't5'] as const
export type Tier = (typeof TIERS)[number]

/**
 * Expected kill points for a given set of tier kills.
 *
 * total = t1*0.2 + t2*2 + t3*4 + t4*10 + t5*20
 */
export function expectedKillPoints(kills: TierValues): number {
  return TIERS.reduce(
    (sum, tier) => sum + kills[tier] * KILL_POINTS_PER_KILL[tier],
    0,
  )
}

/**
 * Highest kill points achievable for a given number of total kills.
 *
 * Every kill is worth at most 20 points (a T5 kill). Used as an upper bound
 * when a scan only reports total kills and no tier breakdown.
 */
export function maxKillPointsForKills(totalKills: number): number {
  return totalKills * KILL_POINTS_PER_KILL.t5
}

/** Lowest kill points achievable for a given number of total kills. */
export function minKillPointsForKills(totalKills: number): number {
  return totalKills * KILL_POINTS_PER_KILL.t1
}
