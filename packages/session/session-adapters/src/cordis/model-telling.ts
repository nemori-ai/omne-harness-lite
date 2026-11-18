import type { Failure } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionCommand, SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import {
  afterSessionCommit,
  sessionCommandFacts,
  sessionCommitCommands,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import {
  commitJournal,
  type GenerationMemory,
  type JournalCombination,
  type JournalCommitResult,
} from '../journal-commit.ts'
import type { PublishedBatch } from '../journal/index.ts'
import {
  openContextScope,
  reminderCommand,
  reminderOutcome,
  reminderReadFailure,
} from './model-reminder-commit.ts'
import type { ModelReminders } from './model-reminders.ts'

export type { ModelReminders } from './model-reminders.ts'

// Before a step takes its inputs the model is told the runtime context: the reminder is its own
// Session commit, and the step is written again on the revision it made.

type Book = Readonly<{
  tenant: TenantId
  tenantText: string
  session: SessionId
  published: number | null
}>
type Scratch = Readonly<{ snapshot: WorkSnapshot | null; commands: readonly SessionCommand[] }>
const principalOf = <P>(write: object): P => (write as Readonly<{ principal: P }>).principal

/** What the write does next: go on, write again, or answer with the failure. */
export type Told =
  | null
  | Readonly<{ kind: 'again' }>
  | Readonly<{ kind: 'answer'; value: Readonly<{ failure: Failure }> }>

export type ModelTellingPorts<P, B extends Book> = Readonly<{
  storage: SqlStorage
  combination: JournalCombination
  generations: GenerationMemory
  reminders?: ModelReminders<P> | undefined
  fault?: ((diagnostic: string) => void) | undefined
  read(book: B, domain: DomainRef): Promise<Outcome<WorkSnapshot | null, Failure>>
}>

export function beginsStep(appended: readonly PublishedBatch[]): boolean {
  return appended.some(batch => batch.facts.some(fact => fact.kind === 'step.begun'))
}

const failed = (failure: Failure): Told => ({ kind: 'answer', value: { failure } })
const down = (diagnostic: string): Told =>
  failed({ kind: 'unavailable', owner: 'session-log-journal', diagnostic })

export function createModelTelling<P, B extends Book>(ports: ModelTellingPorts<P, B>) {
  const { reminders } = ports

  async function tell(
    book: B,
    domain: DomainRef,
    principal: P,
    snapshot: WorkSnapshot | null,
  ): Promise<Told> {
    if (reminders === undefined) return null
    if (snapshot === null) return down('no Session snapshot to tell the model from')
    const scope = openContextScope({ tenant: book.tenant, session: book.session, snapshot })
    if (scope === null) return down('the session has no open context scope')
    const prepared = await reminders.prepare({
      principal,
      tenant: book.tenant,
      scope,
      at: String(snapshot.revision),
    })
    if ('failure' in prepared) return failed(reminderReadFailure(prepared.failure))
    const [message] = prepared.ok.messages
    if (message === undefined) {
      prepared.ok.advance()
      return null
    }
    const command = reminderCommand({
      tenant: book.tenant,
      session: book.session,
      scope,
      at: snapshot.revision,
      viewRevision: prepared.ok.viewRevision,
      message,
    })
    const outcome = await commitJournal({
      storage: ports.storage,
      domain,
      combination: ports.combination,
      operation: command.input.operation,
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
    const settled = reminderOutcome(outcome)
    if (settled === 'told') prepared.ok.advance()
    return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
  }

  return {
    /** A read that fails fails the step; nothing told moves on unless its commit is accepted. */
    async beforeStep(
      book: B,
      domain: DomainRef,
      write: object,
      scratch: Scratch,
      appended: readonly PublishedBatch[],
    ): Promise<Told> {
      return beginsStep(appended)
        ? tell(book, domain, principalOf<P>(write), scratch.snapshot)
        : null
    },
    /** The request after a compaction is prepared in the same step: tell it in full right away. */
    async afterCompaction(
      book: B,
      domain: DomainRef,
      write: object,
      scratch: Scratch,
      outcome: JournalCommitResult,
    ): Promise<void> {
      const compacted = scratch.commands.some(item => item.kind === 'commitDerived')
      if (reminders === undefined || !compacted || outcome.kind === 'refused') return
      const before =
        scratch.snapshot === null
          ? null
          : openContextScope({
              tenant: book.tenant,
              session: book.session,
              snapshot: scratch.snapshot,
            })
      if (before !== null) reminders.forget({ tenant: book.tenant, scope: before })
      if (outcome.kind !== 'committed') return
      const fresh = await ports.read(book, domain)
      const told =
        'failure' in fresh
          ? failed(fresh.failure)
          : await tell(book, domain, principalOf<P>(write), fresh.ok)
      // A failure here does not fail the committed compaction: the next step tells the model.
      if (told?.kind === 'answer')
        ports.fault?.(
          `the runtime context after a compaction is not told yet: ${JSON.stringify(told.value.failure)}`,
        )
    },
  }
}
