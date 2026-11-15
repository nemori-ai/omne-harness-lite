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

function viewOf<P>(port: SessionTransactionPort<P>): SessionTransactionPort<P> {
  return {
    ...port,
    commitEntries: () => Promise.resolve(failure({ kind: 'denied', action: 'commitEntries' })),
    commitLog: () => Promise.resolve(failure({ kind: 'denied', action: 'commitLog' })),
  }
}

function boundStep<P>(checked: SessionCheckedAccess<P>): AccessStep<P> {
  const { request: bound, evidence, writeQualification } = checked
  const allowed = writeQualification === undefined ? { evidence } : { evidence, writeQualification }
  return request =>
    Promise.resolve(
      withinBinding(bound, request)
        ? succeed(allowed)
        : failure({ kind: 'denied', action: request.operation }),
    )
}

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
