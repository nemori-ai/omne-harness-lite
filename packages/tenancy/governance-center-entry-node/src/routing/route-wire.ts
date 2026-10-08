import { formatInstant } from '../ops/wire.ts'
import type { Payload } from './routes.ts'
import { record, list } from './value-shapes.ts'

function instant(value: unknown): string {
  if (typeof value !== 'number') throw new TypeError('expected an instant')
  return formatInstant(value)
}

/** IV `TenantId`：organization、account。 */
function tenantWire(value: unknown): unknown {
  const tenant = record(value)
  return { organization: tenant['organization'], account: tenant['account'] }
}

/** IV `MembershipStanding` 两支。 */
function standingWire(value: unknown): unknown {
  const standing = record(value)
  if (standing['standing'] === 'effective') return { standing: 'effective', role: standing['role'] }
  if (standing['standing'] === 'ineffective') return { standing: 'ineffective' }
  throw new TypeError('expected a membership standing')
}

/** IV `ScopeLayerIdentity` 两支。 */
function scopeLayerWire(value: unknown): unknown {
  const layer = record(value)
  if (layer['layer'] === 'organization') {
    return { layer: 'organization', organization: layer['organization'] }
  }
  if (layer['layer'] === 'tenant') return { layer: 'tenant', tenant: tenantWire(layer['tenant']) }
  throw new TypeError('expected a scope layer identity')
}

/** OE `OfferTiming`：issuedAt、expiresAt。 */
function timingWire(value: unknown): unknown {
  const timing = record(value)
  return { issuedAt: instant(timing['issuedAt']), expiresAt: instant(timing['expiresAt']) }
}

/** `OrganizationView`：「无上级」⇒ `parentOrganization` 不出现。 */
function organizationWire(value: unknown): unknown {
  const organization = record(value)
  const parent = organization['parent']
  if (parent === undefined) throw new TypeError('expected parent or null')
  return parent === null
    ? {
        organization: organization['id'],
        organizationKind: organization['kind'],
        name: organization['name'],
      }
    : {
        organization: organization['id'],
        organizationKind: organization['kind'],
        name: organization['name'],
        parentOrganization: parent,
      }
}

/** `InvitationView`。 */
function invitationWire(value: unknown): unknown {
  const invitation = record(value)
  return {
    invitation: invitation['id'],
    issuerOrganization: invitation['issuer'],
    invitedAccount: invitation['invitedAccount'],
    role: invitation['role'],
    offerTiming: timingWire(invitation['timing']),
    offerState: invitation['state'],
  }
}

/** `AffiliationRequestView`。 */
function affiliationRequestWire(value: unknown): unknown {
  const request = record(value)
  return {
    affiliationRequest: request['id'],
    issuerOrganization: request['initiator'],
    recipientOrganization: request['recipient'],
    direction: request['direction'],
    offerTiming: timingWire(request['timing']),
    offerState: request['state'],
  }
}

/** `IncomingAffiliationRequestView`：没有接收方组织（接收方就是调用方自己）。 */
function incomingAffiliationRequestWire(value: unknown): unknown {
  const request = record(value)
  return {
    affiliationRequest: request['id'],
    issuerOrganization: request['initiator'],
    direction: request['direction'],
    offerTiming: timingWire(request['timing']),
    offerState: request['state'],
  }
}

/** `MemberView`。 */
function memberWire(value: unknown): unknown {
  const member = record(value)
  return {
    tenant: tenantWire(member['tenant']),
    role: member['role'],
    effective: member['effective'],
  }
}

const ok = (value: unknown): unknown => value
const constOk = (value: unknown): unknown => {
  if (value !== 'ok') throw new TypeError('expected ok')
  return 'ok'
}

const PROJECTIONS: Readonly<Record<string, (ok: unknown, payload: Payload) => unknown>> = {
  AR_S8: value => {
    if (value !== 'registered') throw new TypeError('expected registered')
    return 'registered'
  },
  AI_S15: value => {
    const issued = record(value)
    return { loginState: issued['presentation'], loginStateHandle: issued['loginStateId'] }
  },
  AI_S16: constOk,
  AI_S37: value =>
    list(value).map(item => {
      const state = record(item)
      return {
        loginStateHandle: state['loginStateId'],
        issuedAt: instant(state['issuedAt']),
        lastActivityAt: instant(state['lastActivityAt']),
        absoluteExpiresAt: instant(state['absoluteExpiresAt']),
        idleExpiresAt: instant(state['idleExpiresAt']),
      }
    }),
  OG_S21: value => record(value)['organization'],
  OG_S22: organizationWire,
  OG_S23: ok,
  OG_S24: constOk,
  OG_S25: tenantWire,
  OG_S26: standingWire,
  OG_S27: value => list(value).map(tenantWire),
  OG_S28: constOk,
  OG_S29: constOk,
  OG_S30: ok,
  OG_S31: constOk,
  OG_S32: constOk,
  OG_S33: constOk,
  OG_S34: (value, payload) => {
    if (list(payload['organizations']).length === 1) return list(value)
    if (typeof value !== 'boolean') throw new TypeError('expected a boolean')
    return value
  },
  OG_S35: value => {
    const layers = record(value)
    return {
      organizationLayer: scopeLayerWire(layers['organization']),
      tenantLayer: scopeLayerWire(layers['tenant']),
    }
  },
  OG_S36: tenantWire,
  OG_S37: constOk,
  OG_S55: invitationWire,
  OG_S56: affiliationRequestWire,
  OG_S57: value => list(value).map(invitationWire),
  OG_S58: value => {
    const issued = record(value)
    return {
      invitations: list(issued['invitations']).map(invitationWire),
      affiliationRequests: list(issued['affiliationRequests']).map(affiliationRequestWire),
    }
  },
  OG_S59: value => list(value).map(memberWire),
  OG_S60: value => list(value).map(incomingAffiliationRequestWire),
  AI_S50: constOk,
  OG_S61: constOk,
  OG_S62: constOk,
  ENTRY_S50: ok,
}

export function project(schema: string, ok: unknown, payload: Payload): unknown {
  const projection = PROJECTIONS[schema]
  if (projection === undefined) throw new Error('route projection missing')
  return projection(ok, payload)
}
