// Closed shapes of the reference values that definitions, states and results share.
import { judgeContentBlock, type ContentReference } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import type { ToolSchemaIdentity } from './definitions.ts'
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts'
import { filled, record, reject, type Check } from './shape.ts'

export const adoption: Check<Adoption> = record({
  owner: filled,
  name: filled,
  revision: filled,
  digest: filled,
})

export const durableEvidence: Check<DurableEvidence> = record({
  owner: filled,
  record: filled,
  revision: filled,
  digest: filled,
})

export const consumerRef: Check<ConsumerRef> = record({
  owner: filled,
  work: filled,
  position: filled,
  purpose: filled,
})

export const schemaIdentity: Check<ToolSchemaIdentity> = record({
  id: filled,
  revision: filled,
  digest: filled,
})

export function sameAdoption(left: Adoption, right: Adoption): boolean {
  return (
    left.owner === right.owner &&
    left.name === right.name &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

export function sameSchemaIdentity(left: ToolSchemaIdentity, right: ToolSchemaIdentity): boolean {
  return left.id === right.id && left.revision === right.revision && left.digest === right.digest
}

/**
 * A content reference, judged by the one rule of @omne-harness/content-block: the reference is
 * checked as the `ref` of a reference block, so this module keeps no second copy of that rule.
 */
export const contentReference: Check<ContentReference> = (value, at) => {
  const probe = {
    kind: 'file',
    id: 'reference',
    visibility: { toHuman: false, toModel: false },
    ref: value,
    transcript: null,
  }
  const judged = judgeContentBlock(probe)
  if ('rejected' in judged) return reject(at, judged.rejected)
  if (!('ref' in judged.ok)) return reject(at, 'ref')
  return succeed(Object.freeze(judged.ok.ref))
}
