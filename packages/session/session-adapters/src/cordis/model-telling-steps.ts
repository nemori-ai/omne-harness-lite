import {
  guidanceReservation,
  guidanceStorageOperation,
  reconcileGuidanceSubmission,
} from './guidance-recovery.ts'
import type { Failure } from '@omne-harness/agent-contract'
import type { SessionCommand, WorkSnapshot } from '@omne-harness/session-contract'
import {
  afterSessionCommit,
  sessionCommandFacts,
  sessionCommitCommands,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef } from '@omne-harness/sql-contract'
import { commitJournal } from '../journal-commit.ts'
import { openContextScope, reminderOutcome } from './model-reminder-commit.ts'
import { workingDirectoryCommand } from './working-directory-commit.ts'
import type { Book, ModelTellingPorts, Told } from './model-telling.ts'

const failed = (failure: Failure): Extract<Told, { kind: 'answer' }> => ({
  kind: 'answer',
  value: { failure },
})
const down = (diagnostic: string) =>
  failed({ kind: 'unavailable', owner: 'session-log-journal', diagnostic })

export function createModelTellingSteps<P, B extends Book>(ports: ModelTellingPorts<P, B>) {
  const { directory } = ports
  const resolved = new WeakMap<Book, string>()
  // Keep the exact command until its original commit has a definite answer.
  type Pending = Readonly<{
    command: SessionCommand
    advance: (() => void) | undefined
    singleAttempt: boolean
  }>
  const pending = new Map<string, Map<string, Pending>>()
  async function commit(
    book: B,
    domain: DomainRef,
    command: SessionCommand,
    advance?: () => void,
    singleAttempt = false,
  ) {
    const operation =
      singleAttempt && 'expected' in command.input && command.input.expected !== undefined
        ? guidanceStorageOperation(book.session, command.input.operation, command.input.expected)
        : command.input.operation
    const outcome = await commitJournal({
      storage: ports.storage,
      domain,
      combination: ports.combination,
      operation,
      recall: undefined,
      commands: sessionCommitCommands([sessionCommandFacts(command, [])]),
      generations: ports.generations,
      ...(singleAttempt ? { singleAttempt: true } : {}),
    })
    await afterSessionCommit({
      storage: ports.storage,
      domain,
      tenant: book.tenantText,
      session: book.session,
      answer:
        outcome.kind === 'committed'
          ? { receipt: outcome.receipt, recalled: outcome.recalled }
          : null,
      journal: { published: book.published === null ? null : String(book.published) },
    })
    const key = JSON.stringify([book.tenantText, book.session])
    const held = pending.get(key)
    if (outcome.kind === 'unknown') {
      const operations = held ?? new Map<string, Pending>()
      if (!operations.has(command.input.operation))
        operations.set(command.input.operation, { command, advance, singleAttempt })
      pending.set(key, operations)
    } else if (outcome.kind === 'committed' || outcome.kind === 'rolled-back') {
      held?.delete(command.input.operation)
      if (held?.size === 0) pending.delete(key)
      if (singleAttempt) resolved.set(book, operation)
      if (outcome.kind === 'committed') advance?.()
    }
    return outcome
  }

  async function submitGuidance(
    book: B,
    domain: DomainRef,
    command: Extract<SessionCommand, { kind: 'change' | 'commitDerived' }>,
    advance?: () => void,
  ) {
    const prepared = guidanceReservation(command)
    const reservation = await commit(book, domain, prepared.reserve)
    if (reservation.kind !== 'committed') return reservation
    return commit(book, domain, prepared.candidate, advance, true)
  }

  async function recover(
    book: B,
    domain: DomainRef,
    snapshot?: WorkSnapshot | null,
  ): Promise<Told> {
    const key = JSON.stringify([book.tenantText, book.session])
    const held = pending.get(key)?.values().next().value
    if (held !== undefined) {
      const settled = reminderOutcome(
        await commit(book, domain, held.command, held.advance, held.singleAttempt),
      )
      return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
    }
    return snapshot
      ? reconcileGuidanceSubmission(book, domain, snapshot, ports.storage, resolved, command =>
          commit(book, domain, command),
        )
      : null
  }

  async function refresh(
    book: B,
    domain: DomainRef,
    principal: P,
    snapshot: WorkSnapshot | null,
    step: string,
  ): Promise<Told> {
    const recovery = await recover(book, domain, snapshot)
    if (recovery !== null) return recovery
    if (directory === undefined) return null
    if (snapshot === null) return down('no Session snapshot to take the working directory from')
    const scope = openContextScope({ tenant: book.tenant, session: book.session, snapshot })
    if (scope === null) return down('the session has no open context scope')
    const { tenant, session } = book
    const refreshed = await directory.refresh({ principal, tenant, session, scope, snapshot })
    if (refreshed.kind === 'refreshed') return null
    if (refreshed.kind === 'unavailable') return down(refreshed.diagnostic)
    const command = workingDirectoryCommand({
      tenant,
      session,
      scope,
      step,
      at: snapshot.revision,
      ...(refreshed.kind === 'guidance' ? { key: 'session.workspace-guidance' as const } : {}),
      value: refreshed.value,
    })
    const settled = reminderOutcome(
      await (refreshed.kind === 'guidance'
        ? submitGuidance(book, domain, command)
        : commit(book, domain, command)),
      'the working directory step commit',
    )
    return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
  }

  return { commit, submitGuidance, recover, refresh }
}
