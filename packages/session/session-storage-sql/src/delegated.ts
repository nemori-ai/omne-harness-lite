// The delegated entry (session-contract SPEC「当前操作的访问裁定」, R1-D14 O1). The Session execution
// boundary checks one face operation once and binds a view with the allowed decision. The view is
// the port surface over the same context, with the binding as its access step: it never asks the
// access check, and it answers `denied` to a call outside the checked tenant, session or command.
import { tenantEquals } from '@omne-harness/legal-identity'
import { succeed } from '@omne-harness/operation-result'
import {
  commandDigest,
  type SessionAccessRequest,
  type SessionCheckedAccess,
  type SessionCommand,
  type SessionDelegatedTransactions,
  type SessionTransactionPort,
} from '@omne-harness/session-contract'
import { failure, type AccessStep, type Context } from './context.ts'
import { portOf } from './port.ts'

export function delegatedOf<P>(context: Context<P>): SessionDelegatedTransactions<P> {
  return {
    bind: checked => viewOf(portOf({ ...context, access: boundStep(checked) })),
  }
}

/**
 * The port surface of one view. `pending`, `references` and `releasedScopes` name no session, so
 * the binding denies them; `commitEntries` asks no access on the port, so the view denies it here.
 */
function viewOf<P>(port: SessionTransactionPort<P>): SessionTransactionPort<P> {
  return {
    ...port,
    commitEntries: () => Promise.resolve(failure({ kind: 'denied', action: 'commitEntries' })),
  }
}

/** The access step of a view: the bound evidence for a call inside the binding, else `denied`. */
function boundStep<P>(checked: SessionCheckedAccess<P>): AccessStep<P> {
  const { request: bound, evidence } = checked
  return request =>
    Promise.resolve(
      withinBinding(bound, request)
        ? succeed(evidence)
        : failure({ kind: 'denied', action: request.operation }),
    )
}

/** True when `request` names the tenant and session of `bound`, and for a commit its command. */
function withinBinding<P>(
  bound: SessionAccessRequest<P>,
  request: SessionAccessRequest<P>,
): boolean {
  if (bound.target.kind !== 'session' || request.target.kind !== 'session') return false
  if (!('tenant' in bound.access) || !('tenant' in request.access)) return false
  if (!tenantEquals(bound.access.tenant, request.access.tenant)) return false
  if (bound.target.session !== request.target.session) return false
  if (!('command' in request.target)) return true
  return 'command' in bound.target && sameCommand(bound.target.command, request.target.command)
}

/** The same command up to `expected`: a `changed` retry of the face operation stays bound. */
function sameCommand(left: SessionCommand, right: SessionCommand): boolean {
  return (
    left.kind === right.kind &&
    left.input.operation === right.input.operation &&
    commandDigest(withoutExpected(left)) === commandDigest(withoutExpected(right))
  )
}

function withoutExpected(command: SessionCommand): SessionCommand {
  const { expected: _expected, ...input } = command.input as Record<string, unknown>
  return { kind: command.kind, input } as SessionCommand
}
