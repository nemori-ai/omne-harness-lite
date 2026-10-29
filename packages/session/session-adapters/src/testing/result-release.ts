import type { ProducerFact } from '@omne-harness/session-contract'
import { corrupt, normalizedResult, unavailable } from './history.ts'
import type { MemoryExecution } from './journal.ts'
import type { CommonRoot } from './root.ts'
import { canonical } from './session-values.ts'

export type ToolRelease = Extract<ProducerFact, { kind: 'release' }>

export function toolReleases(root: CommonRoot, execution: MemoryExecution): ToolRelease[] {
  const facts: ToolRelease[] = []
  for (const responsibility of execution.results) {
    if (
      responsibility.result.producer.kind !== 'tool' ||
      responsibility.release.kind !== 'confirmed'
    )
      continue
    const value = normalizedResult(
        root,
        execution,
        responsibility.consumption,
        responsibility.result,
      ),
      consumption = root.session?.snapshot.consumptions.find(
        item => String(item.id) === String(responsibility.consumption),
      ),
      result = consumption?.results.find(
        item => item.result.version === responsibility.result.version,
      )
    if (!consumption || !result) unavailable('Tool release original Session custody or processing')
    if (
      canonical(consumption.binding) !== canonical(value.binding) ||
      canonical(result.result) !== canonical(value.result)
    )
      corrupt('Tool release changed original binding or complete result')
    if (result.release === 'confirmed') continue
    facts.push({
      kind: 'release',
      consumption: consumption.id,
      result: value.result,
      source: responsibility.release.receipt,
    })
  }
  return facts
}
