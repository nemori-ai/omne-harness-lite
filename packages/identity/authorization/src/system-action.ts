// The system action decision (SPEC AU-12): a pure judgment over the request and the facts that the
// caller read for it. It reads nothing itself and keeps no state, so the same request with changed
// facts gives a changed decision: an allowed answer is never cached. The order is fixed, and the
// first failed step decides: principal, matrix, grant record, arguments.
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

/** Where a system action lands: a deployment-wide resource, or a resource in the partition of one tenant. */
export type SystemActionTarget =
  | Readonly<{ kind: 'system'; resource: AdmissionTarget }>
  | Readonly<{ kind: 'tenant'; tenant: TenantId; resource: AdmissionTarget }>

/** `component` of the principal is for diagnosis; the verifier, not the text, makes the principal trusted. */
export type SystemActionRequest = Readonly<{
  principal: SystemPrincipal
  scope: 'system'
  operation: AdmissionOperation
  target: SystemActionTarget
  /** The digest of the arguments; `noArguments()` for a row that takes none. */
  arguments: EffectiveArguments
}>

export type SystemActionDenial =
  | 'untrusted-principal'
  | 'operation-forbidden'
  | 'binding-mismatch'
  | 'grant-missing'
  | 'grant-revoked'
  | 'grant-expired'

/**
 * One maintenance grant record as its source holds it. `purposes` are purpose names of the matrix
 * rows. `generation` only enters the basis. `expiresAt` is judged by the trusted clock.
 */
export type MaintenanceGrant = Readonly<{
  source: string
  record: string
  revision: string
  purposes: readonly string[]
  revoked: boolean
  generation: string
  expiresAt?: string
}>

/** What the grant source answered: a record, no record, or no answer. */
export type MaintenanceGrantReading =
  | Readonly<{ kind: 'found'; grant: MaintenanceGrant }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** What the trusted clock answered about one end time. */
export type ExpiryReading =
  | Readonly<{ kind: 'reached' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The facts read for one request. `grant` and `expiry` are null when they were not read. */
export type SystemActionFacts = Readonly<{
  principal: PrincipalVerification
  grant: MaintenanceGrantReading | null
  expiry: ExpiryReading | null
}>

/** Everything the decision rested on. `principal` and `grant` are null until their step read them. */
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
  /** A necessary fact could not be read. Not a denial, and never a permission. */
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The port: one check, answered by the facts of now. */
export interface SystemActionAuthorization {
  check(input: SystemActionRequest): Promise<SystemActionDecision>
}

/**
 * An own frozen copy of the value fields of a request. The principal and the minted tenant keep
 * their original objects. `scope` is copied as given, so a foreign scope reaches the judgment.
 */
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

/** An own frozen copy of the value fields of a grant. */
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

/** Whether the verification is of the very principal of the request, and that principal is a system one. */
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

/** The matrix row that the request binds to, or the denial of step 2. */
export type MatrixStep =
  | Readonly<{ kind: 'row'; row: SystemActionRow }>
  | Readonly<{ kind: 'denied'; reason: 'operation-forbidden' | 'binding-mismatch' }>

/** Step 2. An operation outside the matrix is forbidden; a row whose scope, target, owner or kind differ is a mismatch. */
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

/** A record whose `revoked` is not a boolean cannot be read as a trusted fact. */
function recordReadable(grant: MaintenanceGrant): boolean {
  return typeof grant.revoked === 'boolean'
}

/** Whether step 3 reaches the end time: a record of this purpose that is not revoked and has one. */
export function expiryDecides(
  row: SystemActionRow,
  grant: MaintenanceGrantReading | null,
): boolean {
  return (
    grant?.kind === 'found' &&
    recordReadable(grant.grant) &&
    grant.grant.purposes.includes(row.purpose) &&
    grant.grant.revoked === false &&
    grant.grant.expiresAt !== undefined
  )
}

/** Step 3: the grant record holds the purpose, is not revoked, and has not reached its end time. */
function grantStep(
  row: SystemActionRow,
  facts: SystemActionFacts,
  basis: SystemActionBasis,
): SystemActionDecision | SystemActionBasis {
  const reading = facts.grant
  if (reading === null) return unavailable('the maintenance grant was not read')
  if (reading.kind === 'unavailable') return unavailable(reading.diagnostic)
  if (reading.kind === 'none') return denied('grant-missing', basis)
  const grant = grantSnapshot(reading.grant)
  const known = Object.freeze({ ...basis, grant })
  if (!recordReadable(grant))
    return unavailable('the maintenance grant record is not in the agreed shape')
  if (!grant.purposes.includes(row.purpose)) return denied('grant-missing', known)
  if (grant.revoked) return denied('grant-revoked', known)
  if (grant.expiresAt === undefined) return known
  const expiry = facts.expiry
  if (expiry === null) return unavailable('the end time of the grant was not checked')
  // Closed: any answer that is not `reached` or `pending` is not a trusted fact.
  switch (expiry.kind) {
    case 'reached':
      return denied('grant-expired', known)
    case 'pending':
      return known
    case 'unavailable':
      return unavailable(expiry.diagnostic)
    default:
      return unavailable('the trusted clock answered outside its contract')
  }
}

function isDecision(
  value: SystemActionDecision | SystemActionBasis,
): value is SystemActionDecision {
  return 'kind' in value
}

/**
 * Decides one system action from the request and the facts read for it. The order is fixed: the
 * verifier verified the very principal of the request; the operation is in the matrix and the
 * target matches its row; the grant source holds an open record of the row's purpose; the
 * arguments fit the row. The first failed step gives the denial; a fact that could not be read
 * gives `unavailable` at its step.
 */
export function decideSystemAction(
  request: SystemActionRequest,
  facts: SystemActionFacts,
): SystemActionDecision {
  const basis = initialBasis(request)
  const verified = facts.principal
  if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
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
