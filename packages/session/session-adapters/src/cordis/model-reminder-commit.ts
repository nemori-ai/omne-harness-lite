import { createHash } from 'node:crypto'
import type { Failure } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SystemReminderMessage } from '@omne-harness/message'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  contextScopeOf,
  deriveSessionOperation,
  type SessionCommand,
  type SessionFailure,
  type SessionId,
  type SessionRevision,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { decodeSessionReply } from '@omne-harness/session-storage-sql/participants'
import { refusalFailure, type JournalCommitResult } from '../journal-commit.ts'
import type { ModelReminderFailure } from './model-reminders.ts'

const OWNER = 'session-log-journal'

const down = (diagnostic: string): Failure => ({ kind: 'unavailable', owner: OWNER, diagnostic })

/** The Session command that writes one reminder, on the revision it was read for. */
export function reminderCommand(
  input: Readonly<{
    tenant: TenantId
    session: SessionId
    scope: ScopeRef
    at: SessionRevision
    viewRevision: string
    message: SystemReminderMessage
  }>,
): Extract<SessionCommand, { kind: 'commitDerived' }> {
  const source = {
    owner: 'runtime-context',
    record: `${input.scope.ref}/view/${input.viewRevision}/at/${String(input.at)}`,
    revision: input.viewRevision,
    digest: `sha256:${createHash('sha256').update(JSON.stringify(input.message)).digest('hex')}`,
  }
  return {
    kind: 'commitDerived',
    input: {
      tenant: input.tenant,
      session: input.session,
      operation: deriveSessionOperation({
        kind: 'context-reminder',
        session: input.session,
        source,
      }),
      expected: input.at,
      value: { kind: 'context-reminder', message: input.message, source },
    },
  }
}

export function reminderReadFailure(failure: ModelReminderFailure): Failure {
  return failure.kind === 'denied'
    ? { kind: 'denied', action: 'read-runtime-context' }
    : down(failure.diagnostic)
}

/** What the reminder commit answered: told, the Session moved on (read again), or a failure. */
export function reminderOutcome(outcome: JournalCommitResult): 'told' | 'changed' | Failure {
  switch (outcome.kind) {
    case 'committed':
      return 'told'
    case 'rolled-back': {
      const stop = outcome.receipt.responses.at(-1)?.reply
      const reply = stop === undefined ? null : decodeSessionReply(stop)
      return reply?.kind === 'stopped' && (reply.failure as SessionFailure).kind === 'changed'
        ? 'changed'
        : down('the Session refused the runtime context reminder')
    }
    case 'unknown':
    case 'unavailable':
      return down(`the runtime context reminder: ${outcome.diagnostic}`)
    case 'refused':
      return refusalFailure(outcome.reason)
  }
}

/** The context scope the model is told in: the latest one not ended; none when all have ended. */
export function openContextScope(
  input: Readonly<{ tenant: TenantId; session: SessionId; snapshot: WorkSnapshot }>,
): ScopeRef | null {
  const scopes = input.snapshot.contextScopes
  const open =
    scopes === undefined
      ? contextScopeOf({ tenant: input.tenant, session: input.session, generation: '1' })
      : scopes.findLast(item => item.ended === null)?.scope
  return open === undefined ? null : ({ ref: open } as ScopeRef)
}
