// Closed shapes of the reference values that definitions, states and results share.
import { judgeContentBlock, type ContentReference } from '@omne-harness/content-block'
import type { OrganizationId, TenantId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import type { SourceLayer, ToolSchemaIdentity, WorkspaceId } from './definitions.ts'
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts'
import { filled, literal, record, reject, variant, type Check } from './shape.ts'

/** The minted identity shapes of legal-identity, read as data: the brand is the `name` tag. */
const organizationId: Check<OrganizationId> = record({
  name: literal('OrganizationId'),
  text: filled,
})
const tenantId: Check<TenantId> = record({
  name: literal('TenantId'),
  organization: organizationId,
  account: record({ name: literal('AccountId'), text: filled }),
})
/** The opaque workspace brand is text here; the workspace owner defines it later (G7). */
const workspaceId: Check<WorkspaceId> = (value, at) => {
  const text = filled(value, at)
  // The brand has no run-time value; a filled text is all Tool reads at its boundary.
  return 'failure' in text ? text : succeed(text.ok as WorkspaceId)
}

/** The source layer of a contribution (G7): the position and the identity that holds it. */
export const sourceLayer: Check<SourceLayer> = variant('kind', {
  official: record({ kind: literal('official') }),
  organization: record({ kind: literal('organization'), organization: organizationId }),
  tenant: record({ kind: literal('tenant'), tenant: tenantId }),
  workspace: record({ kind: literal('workspace'), workspace: workspaceId }),
})

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
