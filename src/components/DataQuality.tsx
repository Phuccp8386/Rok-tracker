import { useMemo, useState } from 'react'
import {
  validateScan,
  type ScanValidation,
  type ValidationIssue,
} from '../lib/validation'
import type { Governor } from '../types'
import { formatCompact } from './SummaryCards'

interface Props {
  governors: Governor[]
  /** Hide the detail table and only show the summary. */
  compact?: boolean
}

/**
 * Data quality panel.
 *
 * Every row is cross-checked against the game's own arithmetic: the kill
 * points must equal the tier breakdown weighted by the published per-tier
 * kill point values. Rows that fail are listed here so a human can compare
 * against the scanner's screenshot instead of trusting bad OCR.
 */
export default function DataQuality({ governors, compact = false }: Props) {
  const [showAll, setShowAll] = useState(false)

  const validation: ScanValidation = useMemo(
    () => validateScan(governors),
    [governors],
  )

  const cleanPct = (validation.cleanShare * 100).toFixed(1)
  const tone =
    validation.error > 0
      ? 'bad'
      : validation.warn > 0
        ? 'warn'
        : 'good'

  return (
    <div className="quality">
      <div className="quality-head">
        <div className="quality-title">
          <span className={`dot ${tone}`} />
          Data quality
        </div>
        <div className="quality-stats">
          <span className="good">{validation.ok} verified</span>
          {validation.warn > 0 && (
            <span className="warn">{validation.warn} suspect</span>
          )}
          {validation.error > 0 && (
            <span className="bad">{validation.error} failed</span>
          )}
          <span className="dim">{cleanPct}% clean</span>
        </div>
      </div>

      {validation.failures.length > 0 && (
        <>
          <button
            className="ghost quality-toggle"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? 'Hide details'
              : `Show ${validation.failures.length} flagged row${
                  validation.failures.length === 1 ? '' : 's'
                }`}
          </button>

          {showAll && (
            <div className="table-wrap quality-table">
              <table>
                <thead>
                  <tr>
                    <th className="left">Governor</th>
                    <th>Status</th>
                    <th className="left">Problem</th>
                    <th>Reported</th>
                    <th>Expected</th>
                    <th>Off by</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.failures.map(({ governor, result }) => (
                    <tr key={governor.id}>
                      <td className="left">
                        {governor.name}
                        <div className="dim" style={{ fontSize: 11 }}>
                          #{governor.rank} · {governor.alliance || 'no alliance'}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${result.severity}`}>
                          {result.severity}
                        </span>
                      </td>
                      <td className="left">
                        {result.issues.map((issue: ValidationIssue, i) => (
                          <div key={i} className="issue">
                            {issue.message}
                          </div>
                        ))}
                      </td>
                      <td>{formatCompact(governor.killPoints)}</td>
                      <td>
                        {result.expectedKillPoints !== null
                          ? formatCompact(result.expectedKillPoints)
                          : '-'}
                      </td>
                      <td>
                        {result.killPointError !== null
                          ? `${(result.killPointError * 100).toFixed(1)}%`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {compact && validation.failures.length === 0 && (
        <p className="dim" style={{ margin: '6px 0 0' }}>
          Every row reconciles with the game&apos;s kill point formula.
        </p>
      )}
    </div>
  )
}
