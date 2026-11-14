import type { TenantId } from '@omne-harness/legal-identity'
import type { PrincipalVerification, SystemPrincipal } from '@omne-harness/identity'
import {
  decisionEvidence,
  noArguments,
  type DecisionEvidence,
  type EffectiveArguments,
} from './evidence.ts'
import type { AdmissionOperation, AdmissionTarget } from './operation.ts'
import { systemActionRowOf, type SystemActionRow } from './system-matrix.ts'

export type SystemActionTarget =
  | Readonly<{ kind: 'system'; resource: AdmissionTarget }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId; resource: AdmissionTarget }>

export type SystemActionRequest = Readonly<{
  principal: SystemPrincipal
  scope: 'system'
  operation: AdmissionOperation
  target: SystemActionTarget
  arguments: EffectiveArguments
}>

export type SystemActionDenial =
  | 'untrusted-principal'
  | 'operation-forbidden'
  | 'binding-mismatch'
  | 'grant-missing'
  | 'grant-revoked'
  | 'grant-expired'

export type MaintenanceGrant = Readonly<{
  source: string
  record: string
  revision: string
  purposes: readonly string[]
  revoked: boolean
  generation: string
  expiresAt?: string
}>

export type MaintenanceGrantReading =
  | Readonly<{ kind: 'found'; grant: MaintenanceGrant }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type ExpiryReading =
  | Readonly<{ kind: 'reached' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type SystemActionFacts = Readonly<{
  principal: PrincipalVerification
  grant: MaintenanceGrantReading | null
  expiry: ExpiryReading | null
}>

export type SystemActionBasis = Readonly<{
  operation: AdmissionOperation
  target: SystemActionTarget
  arguments: EffectiveArguments
  principal: SystemPrincipal | null
  grant: MaintenanceGrant | null
}>

export type SystemActionDecision =
  | Readonly<{ kind: 'allowed'; basis: SystemActionBasis; evidence: DecisionEvidence }>
  | Readonly<{
      kind: 'denied'
      reason: SystemActionDenial
      basis: SystemActionBasis
      evidence: DecisionEvidence
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export interface SystemActionAuthorization {
  check(input: SystemActionRequest): Promise<SystemActionDecision>
}

export function requestSnapshot(request: SystemActionRequest): SystemActionRequest {
  const { resource } = request.target
  const frozen = Object.freeze({ owner: resource.owner, kind: resource.kind, key: resource.key })
  return Object.freeze({
    principal: request.principal,
    scope: request.scope,
    operation: Object.freeze({ owner: request.operation.owner, name: request.operation.name }),
    target:
      request.target.kind === 'system'
        ? Object.freeze({ kind: 'system', resource: frozen })
        : Object.freeze({ kind: 'tenant', tenant: request.target.tenant, resource: frozen }),
    arguments: Object.freeze({ digest: request.arguments.digest }),
  })
}

export function grantSnapshot(grant: MaintenanceGrant): MaintenanceGrant {
  return Object.freeze({
    source: grant.source,
    record: grant.record,
    revision: grant.revision,
    purposes: Object.freeze([...grant.purposes]),
    revoked: grant.revoked,
    generation: grant.generation,
    ...(grant.expiresAt === undefined ? {} : { expiresAt: grant.expiresAt }),
  })
}

const OUTSIDE_VERIFIER_CONTRACT = 'the principal verifier answered outside its contract'

function initialBasis(input: SystemActionRequest): SystemActionBasis {
  const request = requestSnapshot(input)
  return Object.freeze({
    operation: request.operation,
    target: request.target,
    arguments: request.arguments,
    principal: null,
    grant: null,
  })
}

function recordOf(basis: SystemActionBasis): string {
  return basis.grant?.record ?? `system-admission/${basis.operation.owner}/${basis.operation.name}`
}

function denied(reason: SystemActionDenial, basis: SystemActionBasis): SystemActionDecision {
  const evidence = decisionEvidence(recordOf(basis), basis.grant?.revision ?? '0', {
    kind: 'denied',
    reason,
    basis,
  })
  return Object.freeze({ kind: 'denied', reason, basis, evidence })
}

function allowed(basis: SystemActionBasis): SystemActionDecision {
  const evidence = decisionEvidence(recordOf(basis), basis.grant?.revision ?? '0', {
    kind: 'allowed',
    basis,
  })
  return Object.freeze({ kind: 'allowed', basis, evidence })
}

function unavailable(diagnostic: string): SystemActionDecision {
  return Object.freeze({ kind: 'unavailable', diagnostic })
}

export function principalTrusted(
  request: SystemActionRequest,
  verified: PrincipalVerification,
): boolean {
  return (
    verified.kind === 'verified' &&
    verified.principal === request.principal &&
    request.principal.kind === 'system'
  )
}

export type MatrixStep =
  | Readonly<{ kind: 'row'; row: SystemActionRow }>
  | Readonly<{ kind: 'denied'; reason: 'operation-forbidden' | 'binding-mismatch' }>

export function matrixStep(request: SystemActionRequest): MatrixStep {
  const row = systemActionRowOf(request.operation)
  if (row === null) return { kind: 'denied', reason: 'operation-forbidden' }
  const { target } = request
  const bound =
    request.scope === 'system' &&
    target.kind === row.target &&
    target.resource.owner === row.resource.owner &&
    target.resource.kind === row.resource.kind
  return bound ? { kind: 'row', row } : { kind: 'denied', reason: 'binding-mismatch' }
}

function recordReadable(grant: unknown): grant is MaintenanceGrant {
  if (typeof grant !== 'object' || grant === null) return false
  const { revoked, purposes } = grant as Partial<Record<keyof MaintenanceGrant, unknown>>
  return (
    typeof revoked === 'boolean' &&
    Array.isArray(purposes) &&
    purposes.every(purpose => typeof purpose === 'string')
  )
}

export function expiryDecides(
  row: SystemActionRow,
  grant: MaintenanceGrantReading | null,
): boolean {
  return (
    typeof grant === 'object' &&
    grant?.kind === 'found' &&
    recordReadable(grant.grant) &&
    grant.grant.purposes.includes(row.purpose) &&
    grant.grant.revoked === false &&
    grant.grant.expiresAt !== undefined
  )
}

const OUTSIDE_GRANT_CONTRACT = 'the maintenance grant source answered outside its contract'

function grantStep(
  row: SystemActionRow,
  facts: SystemActionFacts,
  basis: SystemActionBasis,
): SystemActionDecision | SystemActionBasis {
  const reading = facts.grant
  if (reading === null) return unavailable('the maintenance grant was not read')
  if (typeof reading !== 'object') return unavailable(OUTSIDE_GRANT_CONTRACT)
  if (reading.kind === 'unavailable') return unavailable(reading.diagnostic)
  if (reading.kind === 'none') return denied('grant-missing', basis)
  if (reading.kind !== 'found') return unavailable(OUTSIDE_GRANT_CONTRACT)
  if (!recordReadable(reading.grant))
    return unavailable('the maintenance grant record is not in the agreed shape')
  const grant = grantSnapshot(reading.grant)
  const known = Object.freeze({ ...basis, grant })
  if (!grant.purposes.includes(row.purpose)) return denied('grant-missing', known)
  if (grant.revoked) return denied('grant-revoked', known)
  if (grant.expiresAt === undefined) return known
  const expiry = facts.expiry
  if (expiry === null) return unavailable('the end time of the grant was not checked')
  switch (expiry.kind) {
    case 'reached':
      return denied('grant-expired', known)
    case 'pending':
      return known
    case 'unavailable':
      return unavailable(expiry.diagnostic)
    default:
      return unavailable('the expiry clock answered outside its contract')
  }
}

function isDecision(
  value: SystemActionDecision | SystemActionBasis,
): value is SystemActionDecision {
  return 'kind' in value
}

export function decideSystemAction(
  request: SystemActionRequest,
  facts: SystemActionFacts,
): SystemActionDecision {
  const basis = initialBasis(request)
  const verified = facts.principal
  if (typeof verified !== 'object' || verified === null)
    return unavailable(OUTSIDE_VERIFIER_CONTRACT)
  if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
  if (verified.kind === 'verified') {
    if (typeof verified.principal !== 'object' || verified.principal === null)
      return unavailable(OUTSIDE_VERIFIER_CONTRACT)
  } else if (verified.kind !== 'rejected') return unavailable(OUTSIDE_VERIFIER_CONTRACT)
  if (!principalTrusted(request, verified)) return denied('untrusted-principal', basis)
  const known = Object.freeze({ ...basis, principal: request.principal })
  const matrix = matrixStep(request)
  if (matrix.kind === 'denied') return denied(matrix.reason, known)
  const granted = grantStep(matrix.row, facts, known)
  if (isDecision(granted)) return granted
  const fixed = matrix.row.arguments === 'none'
  if (fixed && request.arguments.digest !== noArguments().digest)
    return denied('binding-mismatch', granted)
  return allowed(granted)
}
