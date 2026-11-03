import { isDeepStrictEqual } from 'node:util'
import {
  addDays,
  categoryAt,
  date,
  dates,
  finding,
  inCoverage,
  isoDate,
  normalizeCoverageIntervals,
  mergeDays,
} from './common.ts'
import { synthesizeCalendarCandidate } from './synthesis.ts'
import { invariantFindings } from './invariants.ts'
import { oracleFindings } from './reconciliation.ts'
import type {
  CalendarSupplyCandidate,
  SourceContribution,
  CalendarSupplyPolicy,
  SupplyFinding,
  SupplyOverlapChange,
  SupplyValidationResult,
  SupplyValidationInput,
} from './types.ts'

function anchorFindings(input: SupplyValidationInput): SupplyFinding[] {
  return input.policy.validation.anchors.flatMap(anchor => {
    const missing: string[] = []
    for (const interval of input.candidate.coverageIntervals)
      for (let year = date(interval.start).year; year <= date(interval.end).year; year++) {
        const target = `${year}-${anchor.monthDay}`
        const window = dates({
          start: addDays(target, -anchor.toleranceDays),
          end: addDays(target, anchor.toleranceDays),
        }).filter(day => inCoverage(day, input.candidate.coverageIntervals))
        if (
          window.length &&
          !window.some(day => categoryAt(input.candidate, day) === anchor.expectedCategory)
        )
          missing.push(target)
      }
    return [
      finding(
        anchor.anchorId,
        missing.length ? 'failed' : 'passed',
        'Declared anchor must appear inside its covered tolerance window',
        missing,
      ),
    ]
  })
}
function overlapChanges(
  candidate: CalendarSupplyCandidate,
  current: CalendarSupplyCandidate,
): SupplyOverlapChange[] {
  const oldRefs = new Set(
    current.days.flatMap(day => day.provenance.map(record => record.authorityRef)),
  )
  const changes: SupplyOverlapChange[] = []
  for (const interval of candidate.coverageIntervals)
    for (const day of dates(interval)) {
      if (!inCoverage(day, current.coverageIntervals)) continue
      const previousCategory = categoryAt(current, day)
      const candidateCategory = categoryAt(candidate, day)
      if (previousCategory !== candidateCategory)
        changes.push({
          date: day,
          previousCategory,
          candidateCategory,
          newAuthorityRefs:
            candidate.days
              .find(entry => entry.date === day)
              ?.provenance.map(record => record.authorityRef)
              .filter(ref => !oldRefs.has(ref)) ?? [],
        })
    }
  return changes
}
function validateOracleIntegrity(oracle: SourceContribution): void {
  normalizeCoverageIntervals(oracle.coverageIntervals)
  mergeDays(oracle.days)
  for (const day of oracle.days) {
    isoDate.parse(day.date)
    if (!inCoverage(day.date, oracle.coverageIntervals) || !day.provenance.length)
      throw new Error('oracle day lacks coverage/provenance')
  }
}
function shapeFindings(
  input: SupplyValidationInput,
  rebuilt: CalendarSupplyCandidate,
): SupplyFinding[] {
  for (const oracle of input.oracles) validateOracleIntegrity(oracle)
  const findings: SupplyFinding[] = []
  if (!isDeepStrictEqual(rebuilt, input.candidate))
    findings.push(
      finding(
        'candidate.incoherent',
        'failed',
        'Candidate must exactly represent its declared source contributions',
      ),
    )
  if (
    input.candidate.calendarId !== input.policy.calendarId ||
    input.candidate.timezone !== input.policy.timezone
  )
    findings.push(
      finding('candidate.identity', 'failed', 'Candidate and policy identity/timezone differ'),
    )
  return findings
}
function requiredFeedFindings(input: SupplyValidationInput): SupplyFinding[] {
  return input.policy.sources
    .filter(source => source.role === 'exceptionFeed')
    .filter(
      source =>
        !input.candidate.contributions.some(
          contribution =>
            contribution.sourceId === source.sourceId && contribution.role === 'exceptionFeed',
        ),
    )
    .map(source =>
      finding(
        'exception.unavailable',
        'unknown',
        `Missing declared exception-feed observation ${source.sourceId}`,
      ),
    )
}
function firstPartyUpdated(
  policy: CalendarSupplyPolicy,
  candidate: CalendarSupplyCandidate,
  current: CalendarSupplyCandidate,
): boolean {
  return candidate.contributions
    .filter(source => source.role === 'truth')
    .every(source => {
      const firstParty =
        policy.sources.find(spec => spec.sourceId === source.sourceId)?.provenanceClass ===
        'firstPartyAuthority'
      const changed = current.contributions.some(
        previous =>
          previous.sourceId === source.sourceId &&
          previous.material.rawSha256 !== source.material.rawSha256,
      )
      return firstParty && changed
    })
}
function currentFindings(input: SupplyValidationInput): {
  findings: SupplyFinding[]
  changes: SupplyOverlapChange[]
} {
  const current = input.current
  if (!current) return { findings: [], changes: [] }
  if (
    current.calendarId !== input.candidate.calendarId ||
    current.timezone !== input.candidate.timezone
  )
    throw new Error('current candidate identity differs')
  const findings: SupplyFinding[] = []
  const shrinking = current.coverageIntervals
    .flatMap(dates)
    .filter(day => !inCoverage(day, input.candidate.coverageIntervals))
  if (shrinking.length)
    findings.push(
      finding('coverage.shrink', 'failed', 'Published coverage cannot shrink', shrinking),
    )
  const changes = overlapChanges(input.candidate, current)
  const firstParty = firstPartyUpdated(input.policy, input.candidate, current)
  const unsourced = changes.filter(change => !change.newAuthorityRefs.length && !firstParty)
  if (unsourced.length)
    findings.push(
      finding(
        'overlap.unsourced',
        'failed',
        'Overlapping classification changed without a new authority reference or changed first-party truth material',
        unsourced.map(change => change.date),
        input.candidate.contributions.map(source => source.material.reference),
        'warning',
      ),
    )
  return { findings, changes }
}
function disposition(findings: readonly SupplyFinding[]): SupplyValidationResult['kind'] {
  if (findings.some(item => item.severity === 'blocker' && item.status === 'failed'))
    return 'rejected'
  if (
    findings.some(
      item => item.status === 'failed' && ['oracle.diff', 'overlap.unsourced'].includes(item.code),
    )
  )
    return 'withheld'
  if (findings.some(item => item.severity === 'blocker' && item.status === 'unknown'))
    return 'unknown'
  return 'success'
}
export function validateCalendarCandidate(input: SupplyValidationInput): SupplyValidationResult {
  const materials = [...input.candidate.contributions, ...input.oracles].map(
    source => source.material,
  )
  const findings: SupplyFinding[] = []
  let changes: SupplyOverlapChange[] = []
  try {
    const rebuilt = synthesizeCalendarCandidate({
      policy: input.policy,
      contributions: input.candidate.contributions,
    })
    if (rebuilt.kind !== 'success')
      return { kind: 'rejected', findings: rebuilt.findings, overlapChanges: [], materials }
    findings.push(
      ...shapeFindings(input, rebuilt.candidate),
      ...requiredFeedFindings(input),
      ...invariantFindings(input),
      ...anchorFindings(input),
      ...oracleFindings(input),
    )
    const previous = currentFindings(input)
    changes = previous.changes
    findings.push(...previous.findings)
    return { kind: disposition(findings), findings, overlapChanges: changes, materials }
  } catch (error) {
    return {
      kind: 'rejected',
      materials,
      overlapChanges: changes,
      findings: [
        ...findings,
        finding(
          'validation.invalid',
          'failed',
          error instanceof Error ? error.message : String(error),
          [],
          materials.map(material => material.reference),
        ),
      ],
    }
  }
}
