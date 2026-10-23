import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ConformanceOptions,
  type ConformanceReport,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import type { FragmentObservation } from './path-report.ts'
import type { ScenarioResult } from './scenarios.ts'

export type ModelInputs = Pick<ConformanceOptions<ScriptedPrincipal>, 'subject' | 'waitMs'>
export type ModelObservation = Readonly<{
  scenario: ScenarioResult
  fragments: readonly FragmentObservation[]
  structureErrors: readonly string[]
}>

export function inspectModelReport(report: ConformanceReport): ModelObservation {
  const structureErrors: string[] = []
  if (!Array.isArray(report.results)) throw new TypeError('Invalid conformance report')
  for (const obligation of CONFORMANCE_OBLIGATIONS) {
    const count = report.results.filter(result => result.obligation === obligation).length
    if (count !== 1) structureErrors.push(`${obligation}: expected once, observed ${count}`)
  }
  if (report.results.some(result => !CONFORMANCE_OBLIGATIONS.includes(result.obligation)))
    structureErrors.push('unknown-obligation')
  const fragments = report.results.map(result => {
    if (!['pass', 'fail', 'not-applicable'].includes(result.status))
      throw new TypeError('Invalid obligation status')
    return {
      fragmentId: result.obligation,
      status: result.status,
      evidence: `model-contract/testing:${result.obligation}:${result.status}`,
    }
  })
  const matchesExpected =
    report.ok &&
    structureErrors.length === 0 &&
    fragments.every(fragment => fragment.status === 'pass')
  return {
    scenario: {
      scenarioId: 'M-conformance',
      status: 'executed',
      matchesExpected,
      evidence: matchesExpected
        ? 'all-public-obligations-pass'
        : 'incomplete-or-failed-public-obligations',
    },
    fragments,
    structureErrors,
  }
}

export async function runModel(
  inputs: ModelInputs = { subject: createScriptedConformanceSubject, waitMs: 500 },
): Promise<ModelObservation> {
  try {
    return inspectModelReport(await checkModelProviderConformance(inputs))
  } catch {
    return {
      scenario: {
        scenarioId: 'M-conformance',
        status: 'exception',
        matchesExpected: false,
        evidence: 'public-conformance-call-threw',
      },
      fragments: [
        { fragmentId: 'M-conformance', status: 'fail', evidence: 'public-conformance-call-threw' },
      ],
      structureErrors: ['conformance-report-unavailable'],
    }
  }
}
