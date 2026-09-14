import type { Counter } from '@omne-harness-lite/records'
import type { DefinitionRef, MembershipRef, OpaqueId } from '@omne-harness-lite/work-data'
import type {
  Conditions,
  EvidenceRef,
  Instant,
  MembershipBasis,
  Validity,
  VersionSet,
} from '@omne-harness-lite/tenant'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

type VersionDefinitionIsShared = Expect<Equal<VersionSet['definition'], DefinitionRef>>
type VersionIdsAreShared = Expect<Equal<VersionSet['versions'], readonly OpaqueId[]>>
type MemberIsShared = Expect<Equal<MembershipBasis['member'], MembershipRef>>
type JoinedRevisionIsShared = Expect<Equal<MembershipBasis['joinedRevision'], Counter>>
type ObservedRevisionIsShared = Expect<Equal<MembershipBasis['observedRevision'], Counter>>
type EvidenceIdIsShared = Expect<Equal<EvidenceRef['id'], OpaqueId>>
type EvidenceRevisionIsShared = Expect<Equal<EvidenceRef['revision'], OpaqueId>>

const definition: DefinitionRef = { ownerTenantId: 'tenant', definitionId: 'definition' }
const member: MembershipRef = { tenantId: 'tenant', userId: 'user' }
const revision: Counter = '3'
const opaqueId: OpaqueId = 'version'
const instant: Instant = '2030-01-01T00:00:00Z'
const validity: Validity = { notBefore: instant, expiresAt: null }
const membershipBasis: MembershipBasis = {
  member,
  joinedRevision: revision,
  observedRevision: revision,
}
const evidence: EvidenceRef = {
  authority: 'tenant',
  kind: 'membership',
  id: opaqueId,
  revision: opaqueId,
}
const versionSet: VersionSet = { definition, versions: [opaqueId] }
const conditions: Conditions = {
  validity,
  membership: [membershipBasis],
  requiredFacts: [evidence],
}

void conditions
void versionSet

const versionTypeProofs: readonly [VersionDefinitionIsShared, VersionIdsAreShared] = [true, true]
const membershipTypeProofs: readonly [
  MemberIsShared,
  JoinedRevisionIsShared,
  ObservedRevisionIsShared,
] = [true, true, true]
const evidenceTypeProofs: readonly [EvidenceIdIsShared, EvidenceRevisionIsShared] = [true, true]
void versionTypeProofs
void membershipTypeProofs
void evidenceTypeProofs

// @ts-expect-error VersionSet fields are immutable.
versionSet.definition = definition
// @ts-expect-error VersionSet uses an immutable versions array.
versionSet.versions.push(opaqueId)
// @ts-expect-error Validity fields are immutable.
validity.notBefore = instant
// @ts-expect-error MembershipBasis fields are immutable.
membershipBasis.observedRevision = revision
// @ts-expect-error EvidenceRef fields are immutable.
evidence.kind = 'other'
// @ts-expect-error Conditions fields are immutable.
conditions.validity = validity
// @ts-expect-error Conditions uses an immutable membership array.
conditions.membership.push(membershipBasis)
// @ts-expect-error Conditions uses an immutable evidence array.
conditions.requiredFacts.push(evidence)

// @ts-expect-error VersionSet requires its versions field.
const incompleteVersionSet: VersionSet = { definition }
// @ts-expect-error Validity requires an explicit expiresAt value, including null.
const incompleteValidity: Validity = { notBefore: instant }
// @ts-expect-error MembershipBasis requires the observed revision.
const incompleteMembership: MembershipBasis = { member, joinedRevision: revision }
const invalidEvidence: EvidenceRef = {
  authority: 'tenant',
  kind: 'fact',
  // @ts-expect-error EvidenceRef ids use the shared OpaqueId representation.
  id: 1,
  revision: opaqueId,
}
// @ts-expect-error Conditions requires its facts array.
const incompleteConditions: Conditions = { validity, membership: [] }

void incompleteVersionSet
void incompleteValidity
void incompleteMembership
void invalidEvidence
void incompleteConditions
