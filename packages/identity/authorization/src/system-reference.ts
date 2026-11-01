// The in-process reference system action authorization (SPEC AU-12): reads the facts from the
// installed identity verifier, the maintenance grant source and the trusted clock, then decides.
// It keeps no state and reads again on every call. A dependency that throws is `unavailable`,
// never `allowed`. A fact is read only when the steps before it passed, so a request outside the
// matrix never reaches the grant source.
import type { PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import {
  decideSystemAction,
  expiryDecides,
  grantSnapshot,
  matrixStep,
  principalTrusted,
  requestSnapshot,
  type ExpiryReading,
  type MaintenanceGrantReading,
  type SystemActionAuthorization,
  type SystemActionRequest,
  type SystemActionTarget,
} from './system-action.ts'
import type { SystemActionRow } from './system-matrix.ts'

/** The trusted clock: whether the end time `expiresAt` of a grant is reached now. */
export interface SystemActionClock {
  reached(expiresAt: string): Promise<ExpiryReading>
}

/** The read port for grant records. Authorization reads grants only through it; it has no write side. */
export interface MaintenanceGrantSource {
  read(
    input: Readonly<{
      principal: SystemActionRequest['principal']
      operation: SystemActionRequest['operation']
      target: SystemActionTarget
    }>,
  ): Promise<MaintenanceGrantReading>
}

export type SystemActionDependencies = Readonly<{
  verifier: PrincipalVerifier
  /** Null when no maintenance grant source is installed; every action of the matrix is then `unavailable`. */
  grants: MaintenanceGrantSource | null
  /** Null when no trusted clock is installed; a grant with an end time is then `unavailable`. */
  clock: SystemActionClock | null
}>

const THREW = 'threw an exception; its message is not reported'

async function verify(
  deps: SystemActionDependencies,
  principal: unknown,
): Promise<PrincipalVerification> {
  try {
    return Object.freeze({ ...(await deps.verifier.verify(principal)) })
  } catch {
    return { kind: 'unavailable', diagnostic: `the principal verifier ${THREW}` }
  }
}

async function readGrant(
  deps: SystemActionDependencies,
  request: SystemActionRequest,
): Promise<MaintenanceGrantReading> {
  if (deps.grants === null)
    return { kind: 'unavailable', diagnostic: 'no maintenance grant source is installed' }
  try {
    const reading = await deps.grants.read({
      principal: request.principal,
      operation: request.operation,
      target: request.target,
    })
    switch (reading.kind) {
      case 'found':
        return Object.freeze({ kind: 'found', grant: grantSnapshot(reading.grant) })
      case 'none':
        return Object.freeze({ kind: 'none' })
      case 'unavailable':
        return Object.freeze({ kind: 'unavailable', diagnostic: reading.diagnostic })
      default:
        return {
          kind: 'unavailable',
          diagnostic: 'the maintenance grant source answered outside its contract',
        }
    }
  } catch {
    return { kind: 'unavailable', diagnostic: `the maintenance grant source ${THREW}` }
  }
}

async function readExpiry(
  deps: SystemActionDependencies,
  expiresAt: string,
): Promise<ExpiryReading> {
  if (deps.clock === null)
    return { kind: 'unavailable', diagnostic: 'no trusted clock is installed' }
  try {
    const reading = await deps.clock.reached(expiresAt)
    switch (reading.kind) {
      case 'reached':
        return Object.freeze({ kind: 'reached' })
      case 'pending':
        return Object.freeze({ kind: 'pending' })
      case 'unavailable':
        return Object.freeze({ kind: 'unavailable', diagnostic: reading.diagnostic })
      default:
        return {
          kind: 'unavailable',
          diagnostic: 'the trusted clock answered outside its contract',
        }
    }
  } catch {
    return { kind: 'unavailable', diagnostic: `the trusted clock ${THREW}` }
  }
}

/** The row of the request when the steps before the grant passed: a verified request principal and a matrix match. */
function rowToRead(
  request: SystemActionRequest,
  principal: PrincipalVerification,
): SystemActionRow | null {
  if (!principalTrusted(request, principal)) return null
  const matrix = matrixStep(request)
  return matrix.kind === 'row' ? matrix.row : null
}

export function referenceSystemActionAuthorization(
  deps: SystemActionDependencies,
): SystemActionAuthorization {
  const check: SystemActionAuthorization['check'] = async input => {
    const request = requestSnapshot(input)
    const principal = await verify(deps, request.principal)
    const row = rowToRead(request, principal)
    const grant = row === null ? null : await readGrant(deps, request)
    const endTime = grant?.kind === 'found' ? grant.grant.expiresAt : undefined
    const expiry =
      row !== null && endTime !== undefined && expiryDecides(row, grant)
        ? await readExpiry(deps, endTime)
        : null
    return decideSystemAction(request, { principal, grant, expiry })
  }
  return Object.freeze({ check })
}
