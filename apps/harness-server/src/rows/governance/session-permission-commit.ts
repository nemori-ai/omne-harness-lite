import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type {
  GovernanceExternalWrites,
  GovernanceExternalWriteIntent,
  GovernanceExternalWriteOutcome,
} from '@omne-harness/governance-local'
import type { SqlStorage } from '@omne-harness/sql-contract'
import {
  mutationAccessRequest,
  type SessionCheckedAccess,
  type SessionTransactionPort,
  type SessionFailure,
  type SessionCommand,
  type SessionIntakeLimits,
  type CommitReceipt,
  type SessionOperationId,
} from '@omne-harness/session-contract'
import { classify } from '../authorization/principals.ts'
import { withinBinding } from '../session-storage/bound.ts'
import {
  sessionPermissionQualification,
  type SessionPermissionQualification,
} from './session-permission-qualification.ts'
import { SESSION_PERMISSION_WRITE_PROTOCOL } from './session-permission-result.ts'
import { sessionPermissionReply } from './session-permission-reply.ts'

export type SessionPermissionWriteContext = Readonly<{
  principal: ActingForTenantPrincipal
  qualification: SessionPermissionQualification
}>
export type SessionPermissionWriteBackend = Readonly<{
  writes: GovernanceExternalWrites<SessionPermissionWriteContext>
  storage: Pick<SqlStorage, 'query'>
}>
export type SessionPermissionBackendReader = (
  context: SessionPermissionWriteContext,
) => Promise<SessionPermissionWriteBackend | undefined>
type CommitInput = Parameters<SessionTransactionPort<unknown>['commit']>[0]
const unavailable = (): Outcome<never, SessionFailure> =>
  fail({
    kind: 'unavailable',
    owner: 'harness.session-permission-write',
    diagnostic: 'The protected Session permission writer is unavailable',
  })

function prepare(
  checked: SessionCheckedAccess<unknown>,
  input: CommitInput,
  limits?: SessionIntakeLimits,
) {
  const request = checked.request
  if (
    request.operation !== 'change' ||
    input.command.kind !== 'change' ||
    input.command.input.declaration.kind !== 'permission-assignment'
  )
    return null
  if (!withinBinding(request, mutationAccessRequest(input.access, input.command))) return null
  if (
    !tenantEquals(input.access.tenant, input.command.input.tenant) ||
    input.access.session !== input.command.input.session
  )
    return null
  const who = classify(request.access.principal)
  if (who?.column !== 'login') return null
  const command: Extract<SessionCommand, { kind: 'change' }> = {
    ...input.command,
    input: {
      ...input.command.input,
      declaration: structuredClone(input.command.input.declaration),
    },
  }
  const original = {
    ...checked,
    request: { ...request, access: { ...request.access, principal: who.principal } },
  }
  const qualification = sessionPermissionQualification(original, command, input.guards, limits)
  if (qualification === null) return null
  const encoded = qualification.commandFacts.facts['command']
  if (encoded === undefined) return null
  const intent: GovernanceExternalWriteIntent = {
    operationId: qualification.operation,
    write: {
      owner: 'session',
      protocol: SESSION_PERMISSION_WRITE_PROTOCOL,
      targetRef: qualification.session,
      commandDigest: qualification.commandDigest,
      command: encoded,
    },
  }
  return {
    command,
    intent,
    access: { ...input.access },
    context: { principal: who.principal, qualification },
  }
}

function refusal(
  result: Exclude<GovernanceExternalWriteOutcome, { kind: 'terminal' }>,
  operation: SessionOperationId,
): Outcome<never, SessionFailure> {
  switch (result.kind) {
    case 'denied':
      return fail({ kind: 'denied', action: 'change' })
    case 'conflict':
      return fail({ kind: 'conflict', operation })
    case 'invalid-input':
      return fail({
        kind: 'invalid',
        field: 'command',
        reason: 'The protected command is malformed',
      })
    case 'unavailable':
      return unavailable()
  }
}

async function committedReply(
  backend: SessionPermissionWriteBackend,
  terminal: Extract<GovernanceExternalWriteOutcome, { kind: 'terminal' }>,
  command: SessionCommand,
  previous: CommitReceipt | null,
): Promise<Outcome<unknown, SessionFailure>> {
  let receipt
  try {
    receipt = await backend.storage.query(terminal.sqlIdentity)
  } catch {
    return fail({ kind: 'commit-unknown', operation: command.input.operation })
  }
  if (receipt.kind === 'unknown')
    return fail({ kind: 'commit-unknown', operation: command.input.operation })
  const reply = sessionPermissionReply(terminal, receipt, command)
  switch (reply.kind) {
    case 'participated':
      return succeed(previous === null ? reply.result : { ...previous, recovered: true })
    case 'stopped':
      return fail(reply.failure)
    case 'unsupported':
      return fail({
        kind: 'invalid',
        field: 'command',
        reason: 'Session does not support the protected command',
      })
    case 'failed':
      return unavailable()
  }
}

export function withSessionPermissionCommit(
  port: SessionTransactionPort<unknown>,
  checked: SessionCheckedAccess<unknown>,
  select: SessionPermissionBackendReader,
  intakeLimits?: SessionIntakeLimits,
): SessionTransactionPort<unknown> {
  const commit = async (input: CommitInput): Promise<Outcome<unknown, SessionFailure>> => {
    if (
      input.command.kind !== 'change' ||
      input.command.input.declaration.kind !== 'permission-assignment'
    )
      return port.commit(input)
    try {
      const prepared = prepare(checked, input, intakeLimits)
      if (prepared === null) return fail({ kind: 'denied', action: 'change' })
      const backend = await select(prepared.context)
      if (backend === undefined) return unavailable()
      const observed = await port.queryOperation({
        ...prepared.access,
        operation: prepared.command.input.operation,
      })
      if ('failure' in observed) return observed
      const previous = observed.ok.kind === 'committed' ? observed.ok.receipt : null
      const result = await backend.writes.execute(prepared.context, prepared.intent)
      return result.kind === 'terminal'
        ? await committedReply(backend, result, prepared.command, previous)
        : refusal(result, prepared.command.input.operation)
    } catch {
      return unavailable()
    }
  }
  return { ...port, commit: commit as SessionTransactionPort<unknown>['commit'] }
}
