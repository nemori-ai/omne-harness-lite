// The in-process reference check (SPEC AU-11): reads the facts from the installed identity
// verifier, the tenant standing source and the permit ledger, then decides. It keeps no state and
// reads again on every call. A dependency that throws is `unavailable`, never `allowed`.
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  PrincipalVerification,
  PrincipalVerifier,
  TenantStandingReading,
  TenantStandingSource,
} from '@omne-harness/identity'
import { decideAdmission, type AdmissionCheck, type AdmissionInput } from './admission.ts'
import type { PermitLedger, PermitLookup, PermitRef } from './permit.ts'

export type ReferenceAdmissionDependencies = Readonly<{
  verifier: PrincipalVerifier
  standing: TenantStandingSource
  /** Null when no permit ledger is installed; a presented permit is then `unavailable`. */
  permits: PermitLedger | null
}>

const THREW = 'threw an exception; its message is not reported'

async function verify(
  deps: ReferenceAdmissionDependencies,
  principal: unknown,
): Promise<PrincipalVerification> {
  try {
    return await deps.verifier.verify(principal)
  } catch {
    return { kind: 'unavailable', diagnostic: `the principal verifier ${THREW}` }
  }
}

async function readStanding(
  deps: ReferenceAdmissionDependencies,
  input: AdmissionInput,
): Promise<TenantStandingReading> {
  try {
    return await deps.standing.read({ tenant: input.access.tenant })
  } catch {
    return { kind: 'unavailable', diagnostic: `the tenant standing source ${THREW}` }
  }
}

async function lookupPermit(
  deps: ReferenceAdmissionDependencies,
  permit: PermitRef,
): Promise<PermitLookup> {
  if (deps.permits === null)
    return { kind: 'unavailable', diagnostic: 'no permit ledger is installed' }
  try {
    return await deps.permits.lookup({ permit })
  } catch {
    return { kind: 'unavailable', diagnostic: `the permit ledger ${THREW}` }
  }
}

/** Whether the permit is looked up: only under the tenant of the access, so a foreign ref is never read. */
function presentedPermit(input: AdmissionInput): PermitRef | null {
  if (input.permit === null) return null
  if (!tenantEquals(input.permit.tenant, input.access.tenant)) return null
  return { tenant: input.access.tenant, permit: input.permit.permit }
}

export function referenceAdmissionCheck(deps: ReferenceAdmissionDependencies): AdmissionCheck {
  const check: AdmissionCheck['check'] = async input => {
    const principal = await verify(deps, input.access.principal)
    const acting = principal.kind === 'verified' && principal.principal.kind === 'acting-for-tenant'
    const standing = acting ? await readStanding(deps, input) : null
    const permit = presentedPermit(input)
    const lookup = permit === null ? null : await lookupPermit(deps, permit)
    return decideAdmission(input, { principal, standing, permit: lookup })
  }
  return Object.freeze({ check })
}
