// The admission decision (SPEC AU-11): a pure judgment over the input and the facts that the
// caller read for it. It never reads anything itself and keeps no state, so the same input with
// changed facts gives a changed decision: an allowed answer is never cached.
import { tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import type {
  Principal,
  PrincipalVerification,
  Qualification,
  TenantStandingReading,
} from '@omne-harness/identity'
import { decisionEvidence, type DecisionEvidence } from './evidence.ts'
import {
  operationEquals,
  targetEquals,
  type AdmissionOperation,
  type AdmissionTarget,
} from './operation.ts'
import type { PermitLookup, PermitRef } from './permit.ts'

export type AdmissionInput = Readonly<{
  access: Access<Principal>
  operation: AdmissionOperation
  target: AdmissionTarget
  /** The named qualifications the resource owner requires for this operation; empty when membership is enough. */
  requires: readonly Qualification[]
  /** The permit the caller presents, or null for an operation that needs no permit. */
  permit: PermitRef | null
}>

/** The facts read for one input. `standing` is read for `access.tenant`; `permit` for `input.permit` under `access.tenant`. */
export type AdmissionFacts = Readonly<{
  principal: PrincipalVerification
  standing: TenantStandingReading | null
  permit: PermitLookup | null
}>

export type StandingBasis = Exclude<TenantStandingReading, { kind: 'unavailable' }>

/** Everything the decision rested on. A reader checks it against the owners' records. */
export type AdmissionBasis = Readonly<{
  operation: AdmissionOperation
  target: AdmissionTarget
  tenant: TenantId
  principal: Principal | null
  standing: StandingBasis | null
  required: readonly Qualification[]
  permit: PermitRef | null
}>

export type DenialReason =
  | 'untrusted-principal'
  | 'scope-mismatch'
  | 'tenant-mismatch'
  | 'not-member'
  | 'qualification-missing'
  | 'permit-mismatch'
  | 'permit-unknown'
  | 'permit-consumed'

export type AdmissionDecision =
  | Readonly<{ kind: 'allowed'; evidence: DecisionEvidence; basis: AdmissionBasis }>
  | Readonly<{
      kind: 'denied'
      reason: DenialReason
      evidence: DecisionEvidence
      basis: AdmissionBasis
    }>
  /** A necessary fact could not be read. Not a denial, and never a permission. */
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The port the consumer contracts adapt: one check, answered by the facts of now. */
export interface AdmissionCheck {
  check(input: AdmissionInput): Promise<AdmissionDecision>
}

function recordOf(basis: AdmissionBasis): string {
  return `admission/${basis.operation.owner}/${basis.operation.name}`
}

function revisionOf(basis: AdmissionBasis): string {
  return basis.standing?.evidence.revision ?? '0'
}

function unavailable(diagnostic: string): AdmissionDecision {
  return Object.freeze({ kind: 'unavailable', diagnostic })
}

function denied(reason: DenialReason, basis: AdmissionBasis): AdmissionDecision {
  const content = { kind: 'denied', reason, basis }
  const evidence = decisionEvidence(recordOf(basis), revisionOf(basis), content)
  return Object.freeze({ kind: 'denied', reason, evidence, basis })
}

function allowed(basis: AdmissionBasis): AdmissionDecision {
  const content = { kind: 'allowed', basis }
  const evidence = decisionEvidence(recordOf(basis), revisionOf(basis), content)
  return Object.freeze({ kind: 'allowed', evidence, basis })
}

function initialBasis(input: AdmissionInput): AdmissionBasis {
  return Object.freeze({
    operation: input.operation,
    target: input.target,
    tenant: input.access.tenant,
    principal: null,
    standing: null,
    required: input.requires,
    permit: input.permit,
  })
}

/** Why the verified principal cannot act in the tenant of the access, or null when it can. */
function scopeDenial(principal: Principal, tenant: TenantId): DenialReason | null {
  if (principal.kind === 'system') return 'scope-mismatch'
  return tenantEquals(principal.tenant, tenant) ? null : 'tenant-mismatch'
}

function hasAll(held: readonly Qualification[], required: readonly Qualification[]): boolean {
  return required.every(qualification => held.includes(qualification))
}

type PermitVerdict =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'denied'; reason: DenialReason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const PERMIT_OK: PermitVerdict = Object.freeze({ kind: 'ok' })

function permitMatches(input: AdmissionInput, lookup: PermitLookup & { kind: 'found' }): boolean {
  return (
    input.permit !== null &&
    lookup.grant.ref.permit === input.permit.permit &&
    operationEquals(lookup.grant.operation, input.operation) &&
    targetEquals(lookup.grant.target, input.target)
  )
}

function permitVerdict(input: AdmissionInput, lookup: PermitLookup | null): PermitVerdict {
  if (input.permit === null) return PERMIT_OK
  if (!tenantEquals(input.permit.tenant, input.access.tenant))
    return { kind: 'denied', reason: 'permit-mismatch' }
  if (lookup === null) return { kind: 'unavailable', diagnostic: 'the permit was not looked up' }
  if (lookup.kind === 'unavailable') return { kind: 'unavailable', diagnostic: lookup.diagnostic }
  if (lookup.kind === 'unknown') return { kind: 'denied', reason: 'permit-unknown' }
  if (!permitMatches(input, lookup)) return { kind: 'denied', reason: 'permit-mismatch' }
  if (lookup.state.kind === 'consumed') return { kind: 'denied', reason: 'permit-consumed' }
  return PERMIT_OK
}

/**
 * Decides one admission from the input and the facts read for it. The order is fixed: the
 * principal must be verified, it must act in the tenant of the access, the tenant's account must
 * be a member now, it must hold every required qualification, and a presented permit must be
 * known, matching and still open. The first failed step gives the denial; a fact that could not
 * be read gives `unavailable` at its step.
 */
export function decideAdmission(input: AdmissionInput, facts: AdmissionFacts): AdmissionDecision {
  let basis = initialBasis(input)
  const verified = facts.principal
  if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
  if (verified.kind === 'rejected') return denied('untrusted-principal', basis)
  basis = Object.freeze({ ...basis, principal: verified.principal })
  const scope = scopeDenial(verified.principal, input.access.tenant)
  if (scope !== null) return denied(scope, basis)
  const standing = facts.standing
  if (standing === null) return unavailable('the standing of the tenant was not read')
  if (standing.kind === 'unavailable') return unavailable(standing.diagnostic)
  basis = Object.freeze({ ...basis, standing })
  if (standing.kind === 'not-member') return denied('not-member', basis)
  if (!hasAll(standing.qualifications, input.requires))
    return denied('qualification-missing', basis)
  const permit = permitVerdict(input, facts.permit)
  if (permit.kind === 'denied') return denied(permit.reason, basis)
  if (permit.kind === 'unavailable') return unavailable(permit.diagnostic)
  return allowed(basis)
}
