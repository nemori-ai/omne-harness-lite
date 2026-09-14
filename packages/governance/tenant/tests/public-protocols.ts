import type { GateFrame } from '@omne-harness-lite/admission'
import type { Principal } from '@omne-harness-lite/records'
import type { JsonValue, OpaqueId } from '@omne-harness-lite/work-data'
import type {
  AuthenticatedInvocation,
  IdentityInspection,
  IdentitySource,
  TenantAccess,
  TenantAccessCandidate,
  TenantAccessDecision,
  TenantAccessRequest,
} from '@omne-harness-lite/tenant'

declare const candidate: TenantAccessCandidate
declare const frame: GateFrame
declare const identity: IdentitySource
declare const invocation: AuthenticatedInvocation
declare const principal: Principal
declare const target: JsonValue
declare const tenantId: OpaqueId

const current: IdentityInspection = {
  status: 'current',
  principal,
  credentialRevision: 'credential-revision',
}
const request: TenantAccessRequest = {
  invocation,
  tenantId,
  operation: 'tenant.members',
  target,
}
const access: TenantAccess = {
  prepareAccess: value => ({
    status: 'prepared',
    candidate: value === request ? candidate : candidate,
  }),
  checkAccess: (gate, prepared) =>
    gate === frame && prepared === candidate
      ? {
          status: 'ready',
          basis: {
            principal: current.principal,
            credentialRevision: current.credentialRevision,
            membership: {
              member: { tenantId, userId: 'user' },
              joinedRevision: '1',
              observedRevision: '1',
            },
          },
        }
      : ({ status: 'prepare_again' } satisfies TenantAccessDecision),
}

identity.inspectCurrent(frame, invocation)
access.prepareAccess(request)
access.checkAccess(frame, candidate)

// @ts-expect-error AuthenticatedInvocation is an issuer-owned opaque object.
const forgedInvocation: AuthenticatedInvocation = {}
// @ts-expect-error TenantAccessCandidate is issued by the tenant implementation.
const forgedCandidate: TenantAccessCandidate = {}

void forgedInvocation
void forgedCandidate
