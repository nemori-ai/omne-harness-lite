import { categoryAt, dates, finding, inCoverage } from './common.ts'
import { exceptionDates } from './invariants.ts'
import type { SourceContribution, SupplyFinding, SupplyValidationInput } from './types.ts'

function independenceFinding(
  input: SupplyValidationInput,
  truth: SourceContribution,
  oracle: SourceContribution,
): SupplyFinding {
  const registrations = input.independenceRegistry.filter(
    registration =>
      registration.truthSourceId === truth.sourceId &&
      registration.oracleSourceId === oracle.sourceId,
  )
  const registration = registrations.at(0)
  if (registrations.length !== 1 || !registration?.evidenceRef.trim())
    return finding(
      'oracle.independence',
      'unknown',
      `Engineering registration required for ${truth.sourceId} versus ${oracle.sourceId}`,
    )
  const sameLineage = !truth.lineageRef.trim() || truth.lineageRef === oracle.lineageRef
  return finding(
    'oracle.independence',
    registration.independent && !sameLineage ? 'passed' : 'failed',
    `Registered descent for ${truth.sourceId} versus ${oracle.sourceId}`,
    [],
    [registration.evidenceRef],
  )
}
function compareOracle(input: SupplyValidationInput, oracle: SourceContribution): SupplyFinding[] {
  const exceptions = exceptionDates(input.candidate)
  const differences: string[] = []
  const uncovered: string[] = []
  for (const interval of input.candidate.coverageIntervals)
    for (const day of dates(interval)) {
      if (exceptions.has(day)) continue
      if (!inCoverage(day, oracle.coverageIntervals)) uncovered.push(day)
      else if (categoryAt(input.candidate, day) !== categoryAt(oracle, day)) differences.push(day)
    }
  const references = [
    oracle.material.reference,
    ...input.candidate.contributions.map(source => source.material.reference),
  ]
  const findings = uncovered.length
    ? [
        finding(
          'oracle.coverage',
          'unknown',
          'Oracle does not cover this candidate range; agreement cannot be inferred',
          uncovered,
          references,
        ),
      ]
    : []
  findings.push(
    finding(
      'oracle.diff',
      differences.length ? 'failed' : uncovered.length ? 'unknown' : 'passed',
      'Daily oracle comparison excludes only explicitly attributed exception dates',
      differences,
      references,
      'warning',
    ),
  )
  return findings
}
export function oracleFindings(input: SupplyValidationInput): SupplyFinding[] {
  const findings: SupplyFinding[] = []
  const truths = input.candidate.contributions.filter(source => source.role === 'truth')
  for (const policySource of input.policy.sources.filter(source => source.role === 'oracle')) {
    const oracles = input.oracles.filter(
      source => source.sourceId === policySource.sourceId && source.role === 'oracle',
    )
    const oracle = oracles.at(0)
    if (oracles.length !== 1 || !oracle) {
      findings.push(
        finding(
          'oracle.unavailable',
          'unknown',
          `Expected one ${policySource.sourceId} contribution`,
        ),
      )
      continue
    }
    findings.push(
      ...truths.map(truth => independenceFinding(input, truth, oracle)),
      ...compareOracle(input, oracle),
    )
  }
  for (const oracle of input.oracles)
    if (
      !input.policy.sources.some(
        source =>
          source.sourceId === oracle.sourceId &&
          source.role === oracle.role &&
          source.role === 'oracle',
      )
    )
      findings.push(
        finding(
          'oracle.undeclared',
          'failed',
          `Unknown oracle ${oracle.sourceId}`,
          [],
          [oracle.material.reference],
        ),
      )
  return findings
}
