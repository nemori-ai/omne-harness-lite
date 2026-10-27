// Closed shapes of the reference values that definitions, states and results share.
import { judgeContentBlock, type ContentReference } from '@omne-harness/content-block'
import { workspaceCodec } from '@omne-harness/legal-identity'
import type { OrganizationId, TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import type { SourceLayer, ToolSchemaIdentity } from './definitions.ts'
import type { Adoption, ConsumerRef, DurableEvidence } from './identity.ts'
import { filled, literal, member, record, reject, variant, type Check } from './shape.ts'

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
const workspaceShape = record({ name: literal('WorkspaceId'), text: filled })
/**
 * The sixth legal-identity family (G7). The text must be accepted by `workspaceCodec`; the
 * check returns the value that the codec built, so `workspaceEquals` holds for judged values.
 */
export const workspaceId: Check<WorkspaceId> = (value, at) => {
  const shape = workspaceShape(value, at)
  if ('failure' in shape) return shape
  const parsed = workspaceCodec.parse(shape.ok.text)
  return parsed.ok ? succeed(parsed.value) : reject(member(at, 'text'), 'malformed')
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
