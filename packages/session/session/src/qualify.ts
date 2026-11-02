// The one access decision of a face operation and its delegated view (contract「当前操作的访问裁定」,
// SPEC CP-01 第 1 步核权). `check` is asked once; `allowed` binds a view that serves this face
// operation only and is never kept past it.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import type {
  SessionAccess,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionDelegatedTransactions,
  SessionAccessCheck,
  SessionFailure,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { denied, guarded, messageOf, OWNERS, unavailable } from './failures.ts'

type Qualifying<P> = Readonly<{
  accessCheck: SessionAccessCheck<P>
  transactions: SessionDelegatedTransactions<P>
}>

/**
 * Asks the access check once for `request`. `denied` answers `denied`; `unavailable` or a throw
 * answers `unavailable` with owner `sessionAccessCheck`. Only `allowed` binds the view.
 */
export async function qualify<P>(
  dependencies: Qualifying<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<SessionTransactionPort<P>, SessionFailure>> {
  let decision: SessionAccessDecision
  try {
    decision = await dependencies.accessCheck.check(request)
  } catch (error) {
    return fail(
      unavailable(
        OWNERS.accessCheck,
        `the access check threw for ${request.operation}: ${messageOf(error)}`,
      ),
    )
  }
  switch (decision.kind) {
    case 'denied':
      return fail(denied(request.operation))
    case 'unavailable':
      return fail(
        unavailable(
          OWNERS.accessCheck,
          `the access check is unavailable for ${request.operation}: ${decision.diagnostic}`,
        ),
      )
    case 'allowed':
      try {
        return succeed(dependencies.transactions.bind({ request, evidence: decision.evidence }))
      } catch (error) {
        return fail(unavailable(OWNERS.delegated, `bind threw: ${messageOf(error)}`))
      }
    default: {
      const exhaustive: never = decision
      return exhaustive
    }
  }
}

/**
 * The authoritative snapshot through the view. A snapshot that names another tenant or session
 * is never used: it answers `denied`, as for a session that does not exist under this tenant.
 */
export async function readSnapshot<P>(
  view: SessionTransactionPort<P>,
  access: SessionAccess<P>,
  action: string,
): Promise<Outcome<WorkSnapshot, SessionFailure>> {
  const read = await guarded(OWNERS.delegated, 'readWork', () => view.readWork(access))
  if ('failure' in read)
    return read.failure.kind === 'denied' ? fail(denied(action)) : fail(read.failure)
  if (!tenantEquals(read.ok.tenant, access.tenant) || read.ok.session !== access.session)
    return fail(denied(action))
  return read
}
