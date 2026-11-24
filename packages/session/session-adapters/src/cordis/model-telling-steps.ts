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
  // Keep the exact command until its original commit has a definite answer.
  type Pending = Readonly<{ command: SessionCommand; advance: (() => void) | undefined }>
  const pending = new Map<string, Map<string, Pending>>()
  async function commit(book: B, domain: DomainRef, command: SessionCommand, advance?: () => void) {
    const outcome = await commitJournal({
      storage: ports.storage,
      domain,
      combination: ports.combination,
      operation: command.input.operation,
      recall: undefined,
      commands: sessionCommitCommands([sessionCommandFacts(command, [])]),
      generations: ports.generations,
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
        operations.set(command.input.operation, { command, advance })
      pending.set(key, operations)
    } else if (outcome.kind === 'committed' || outcome.kind === 'rolled-back') {
      held?.delete(command.input.operation)
      if (held?.size === 0) pending.delete(key)
      if (outcome.kind === 'committed') advance?.()
    }
    return outcome
  }

  async function recover(book: B, domain: DomainRef): Promise<Told> {
    const held = pending
      .get(JSON.stringify([book.tenantText, book.session]))
      ?.values()
      .next().value
    if (held === undefined) return null
    const settled = reminderOutcome(await commit(book, domain, held.command, held.advance))
    return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
  }

  async function refresh(
    book: B,
    domain: DomainRef,
    principal: P,
    snapshot: WorkSnapshot | null,
    step: string,
  ): Promise<Told> {
    const recovery = await recover(book, domain)
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
      await commit(book, domain, command),
      'the working directory step commit',
    )
    return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
  }

  return { commit, recover, refresh }
}
