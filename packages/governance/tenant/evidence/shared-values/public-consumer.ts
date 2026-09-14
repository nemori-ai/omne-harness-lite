import type {
  Conditions,
  EvidenceRef,
  Instant,
  MembershipBasis,
  Validity,
  VersionSet,
} from '@omne-harness-lite/tenant'

const instant: Instant = '2030-01-01T00:00:00Z'
const validity: Validity = { notBefore: instant, expiresAt: null }
const membership: MembershipBasis = {
  member: { tenantId: 'tenant', userId: 'user' },
  joinedRevision: '1',
  observedRevision: '2',
}
const evidence: EvidenceRef = {
  authority: 'tenant',
  kind: 'membership',
  id: 'fact',
  revision: '3',
}
const versions: VersionSet = {
  definition: { ownerTenantId: 'tenant', definitionId: 'definition' },
  versions: ['version'],
}
const conditions: Conditions = {
  validity,
  membership: [membership],
  requiredFacts: [evidence],
}

const publicValues: readonly [
  VersionSet,
  Instant,
  Validity,
  MembershipBasis,
  EvidenceRef,
  Conditions,
] = [versions, instant, validity, membership, evidence, conditions]

void publicValues
