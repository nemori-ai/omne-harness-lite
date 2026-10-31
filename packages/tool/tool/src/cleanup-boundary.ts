import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import type { ReleaseProgress } from '@omne-harness/tool-contract/provider'
import { readOwnSlot } from '@omne-harness/tool-contract/binding'
import { invalid, judgeEvidenceField } from './boundary.ts'
import { copyData } from './facts-boundary.ts'

/** Freeze only protocol fields. Opaque principals do not enter the data copy or digest. */
export function fixCleanupFields(
  input: unknown,
  keys: readonly string[],
): Outcome<Readonly<Record<string, unknown>>, ToolFailure> {
  try {
    if (typeof input !== 'object' || input === null) return invalid('input', 'type')
    const fields: Record<string, unknown> = {}
    for (const key of keys) {
      const slot = readOwnSlot(input, key)
      if (slot.kind !== 'value') return invalid(key, 'own-data-required')
      fields[key] = copyData(slot.value)
    }
    return succeed(fields)
  } catch {
    return invalid('input', 'invalid-cleanup-data')
  }
}

export function fixReleaseOutcome(value: unknown): Outcome<ReleaseProgress, ToolFailure> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 2 ||
    !('kind' in value)
  )
    return invalid('outcome', 'shape')
  if (value.kind === 'released' && 'evidence' in value) {
    const evidence = judgeEvidenceField(value.evidence, 'outcome.evidence')
    return 'failure' in evidence ? evidence : succeed({ kind: 'released', evidence: evidence.ok })
  }
  if (
    (value.kind === 'pending' || value.kind === 'unknown' || value.kind === 'rejected') &&
    'diagnostic' in value &&
    typeof value.diagnostic === 'string'
  )
    return succeed({ kind: value.kind, diagnostic: `environment-release-${value.kind}` })
  return invalid('outcome', 'shape')
}
