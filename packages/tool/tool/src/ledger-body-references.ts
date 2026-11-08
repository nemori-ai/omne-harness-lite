import type { ContentReference } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import { canonicalJson } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import { materialStorage } from './ledger-material-content.ts'

export function checkBodyReferences(
  snapshot: Snapshot,
  references: readonly ContentReference[],
): Outcome<void, ToolFailure> {
  if (references.length === 0) return succeed(undefined)
  const keys = new Set(
    references
      .filter(reference => reference.storage === materialStorage)
      .map(reference => reference.key),
  )
  for (const material of snapshot.materials.values()) {
    if (material.purpose !== 'body' && material.purpose !== 'body-fragment') continue
    if (keys.has(canonicalJson(material.material)))
      return invalid('content.ref', 'temporary-body-source-is-not-a-native-resource')
  }
  return succeed(undefined)
}
