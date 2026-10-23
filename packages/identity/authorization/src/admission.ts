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
import { decisionEvidence, type DecisionEvidence, type EffectiveArguments } from './evidence.ts'
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
  /** The digest of the effective arguments the action will run with; `noArguments()` for an operation without any. */
  arguments: EffectiveArguments
  /** The named qualifications the resource owner requires for this operation; empty when membership is enough. */
  requires: readonly Qualification[]
  /** The permit the caller presents, or null when the resource owner needs none for this operation. */
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
  arguments: EffectiveArguments
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
    operation: Object.freeze({ owner: input.operation.owner, name: input.operation.name }),
    target: Object.freeze({
      owner: input.target.owner,
      kind: input.target.kind,
      key: input.target.key,
    }),
    tenant: input.access.tenant,
    arguments: Object.freeze({ digest: input.arguments.digest }),
    principal: null,
    standing: null,
    required: Object.freeze([...input.requires]),
    permit:
      input.permit === null
        ? null
        : Object.freeze({
            tenant: input.permit.tenant,
            permit: input.permit.permit,
          }),
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

/** Null when the permit step passes; otherwise the denial or the unavailable fact. */
type PermitFailure =
  | Readonly<{ kind: 'denied'; reason: DenialReason }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

function permitMatches(input: AdmissionInput, lookup: PermitLookup & { kind: 'found' }): boolean {
  return (
    input.permit !== null &&
    lookup.grant.ref.permit === input.permit.permit &&
    operationEquals(lookup.grant.operation, input.operation) &&
    targetEquals(lookup.grant.target, input.target) &&
    lookup.grant.arguments.digest === input.arguments.digest
  )
}

function permitFailure(input: AdmissionInput, lookup: PermitLookup | null): PermitFailure | null {
  if (input.permit === null) return null
  if (!tenantEquals(input.permit.tenant, input.access.tenant))
    return { kind: 'denied', reason: 'permit-mismatch' }
  if (lookup === null) return { kind: 'unavailable', diagnostic: 'the permit was not looked up' }
  if (lookup.kind === 'unavailable') return { kind: 'unavailable', diagnostic: lookup.diagnostic }
  if (lookup.kind === 'unknown') return { kind: 'denied', reason: 'permit-unknown' }
  if (!permitMatches(input, lookup)) return { kind: 'denied', reason: 'permit-mismatch' }
  if (lookup.state.kind === 'consumed') return { kind: 'denied', reason: 'permit-consumed' }
  return null
}

/** The outcome of one step: the basis to continue with, or the decision that ends the judgment. */
type Step = Readonly<{ kind: 'continue'; basis: AdmissionBasis }> | AdmissionDecision

function next(basis: AdmissionBasis): Step {
  return { kind: 'continue', basis }
}

/** Steps 1 and 2: the verifier verified the very principal of the access, and it acts in the tenant of the access. */
function principalStep(input: AdmissionInput, facts: AdmissionFacts, basis: AdmissionBasis): Step {
  const verified = facts.principal
  if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
  if (verified.kind === 'rejected' || verified.principal !== input.access.principal)
    return denied('untrusted-principal', basis)
  const known = Object.freeze({ ...basis, principal: verified.principal })
  const scope = scopeDenial(verified.principal, input.access.tenant)
  return scope === null ? next(known) : denied(scope, known)
}

export function standingSnapshot(standing: StandingBasis): StandingBasis {
  const evidence = Object.freeze({
    record: standing.evidence.record,
    revision: standing.evidence.revision,
  })
  if (standing.kind === 'not-member') return Object.freeze({ kind: 'not-member', evidence })
  return Object.freeze({
    kind: 'member',
    role: Object.freeze({
      role: standing.role.role,
      model: Object.freeze({
        model: standing.role.model.model,
        revision: standing.role.model.revision,
      }),
    }),
    qualifications: Object.freeze([...standing.qualifications]),
    evidence,
  })
}

/** Steps 3 and 4: the tenant's account is a member now and holds every required qualification. */
function membershipStep(input: AdmissionInput, facts: AdmissionFacts, basis: AdmissionBasis): Step {
  const standing = facts.standing
  if (standing === null) return unavailable('the standing of the tenant was not read')
  if (standing.kind === 'unavailable') return unavailable(standing.diagnostic)
  const known = Object.freeze({ ...basis, standing: standingSnapshot(standing) })
  if (standing.kind === 'not-member') return denied('not-member', known)
  if (!hasAll(standing.qualifications, input.requires))
    return denied('qualification-missing', known)
  return next(known)
}

/** Step 5: a presented permit is known, bound to the same operation, target and arguments, and open. */
function permitStep(
  input: AdmissionInput,
  facts: AdmissionFacts,
  basis: AdmissionBasis,
): AdmissionDecision {
  const permit = permitFailure(input, facts.permit)
  if (permit === null) return allowed(basis)
  switch (permit.kind) {
    case 'denied':
      return denied(permit.reason, basis)
    case 'unavailable':
      return unavailable(permit.diagnostic)
  }
}

/**
 * Decides one admission from the input and the facts read for it. The order is fixed: the
 * principal of the access must be the one the verifier verified, it must act in the tenant of
 * the access, the tenant's account must be a member now, it must hold every required
 * qualification, and a presented permit must be known, bound to the same operation, target and
 * arguments, and still open. The first failed step gives the denial; a fact that could not be
 * read gives `unavailable` at its step.
 */
export function decideAdmission(input: AdmissionInput, facts: AdmissionFacts): AdmissionDecision {
  const principal = principalStep(input, facts, initialBasis(input))
  if (principal.kind !== 'continue') return principal
  const membership = membershipStep(input, facts, principal.basis)
  if (membership.kind !== 'continue') return membership
  return permitStep(input, facts, membership.basis)
}
