import type { Failure } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  ModelViewBasis,
  SessionCommand,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import type {
  GenerationMemory,
  JournalCombination,
  JournalCommitResult,
} from '../journal-commit.ts'
import type { PublishedBatch } from '../journal/index.ts'
import { projectionCommand } from './model-projection-commit.ts'
import {
  openContextScope,
  reminderCommand,
  reminderOutcome,
  reminderReadFailure,
} from './model-reminder-commit.ts'
import type { ModelReminders } from './model-reminders.ts'
import { createModelTellingSteps } from './model-telling-steps.ts'
import { settleModelStep } from './model-step-settlement.ts'
import type { StepDirectory } from './working-directory-step.ts'

export type { ModelReminders } from './model-reminders.ts'

// Before a step takes its inputs the model is told the runtime context: the reminder is its own
// Session commit, and the step is written again on the revision it made.

export type Book = Readonly<{
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

type Preparation = Exclude<Told, null> | Readonly<{ kind: 'ready'; basis: ModelViewBasis | null }>
const stepTell = (prepared: Preparation): Told => (prepared.kind === 'ready' ? null : prepared)

export type StepOpening<P> = Readonly<{
  reminders?: ModelReminders<P> | undefined
  directory?: StepDirectory<P> | undefined
}>

export type ModelTellingPorts<P, B extends Book> = StepOpening<P> &
  Readonly<{
    storage: SqlStorage
    combination: JournalCombination
    generations: GenerationMemory
    fault?: ((diagnostic: string) => void) | undefined
    read(book: B, domain: DomainRef): Promise<Outcome<WorkSnapshot | null, Failure>>
  }>

function begunStep(appended: readonly PublishedBatch[]): string | null {
  for (const batch of appended)
    for (const fact of batch.facts) if (fact.kind === 'step.begun') return String(fact.step)
  return null
}

const failed = (failure: Failure): Extract<Told, { kind: 'answer' }> => ({
  kind: 'answer',
  value: { failure },
})
const down = (diagnostic: string) =>
  failed({ kind: 'unavailable', owner: 'session-log-journal', diagnostic })

export function createModelTelling<P, B extends Book>(ports: ModelTellingPorts<P, B>) {
  const { reminders } = ports
  const { commit, submitGuidance, recover, refresh } = createModelTellingSteps(ports)

  async function prepareTell(
    book: B,
    domain: DomainRef,
    principal: P,
    snapshot: WorkSnapshot | null,
  ): Promise<Preparation> {
    const recovery = await recover(book, domain, snapshot)
    if (recovery !== null) return recovery
    if (reminders === undefined) return { kind: 'ready', basis: null }
    if (snapshot === null) return down('no Session snapshot to tell the model from')
    const scope = openContextScope({ tenant: book.tenant, session: book.session, snapshot })
    if (scope === null) return down('the session has no open context scope')
    const prepared = await reminders.prepare({
      session: book.session,
      principal,
      tenant: book.tenant,
      scope,
      at: String(snapshot.revision),
    })
    if ('failure' in prepared) return failed(reminderReadFailure(prepared.failure))
    if (prepared.ok.projection !== undefined) {
      const command = projectionCommand({
        tenant: book.tenant,
        session: book.session,
        scope,
        at: snapshot.revision,
        projection: prepared.ok.projection,
      })
      const settled = reminderOutcome(await submitGuidance(book, domain, command))
      return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
    }
    const [message] = prepared.ok.messages
    if (message === undefined) {
      prepared.ok.advance()
      return { kind: 'ready', basis: prepared.ok.modelView ?? null }
    }
    const command = reminderCommand({
      tenant: book.tenant,
      session: book.session,
      scope,
      at: snapshot.revision,
      viewRevision: prepared.ok.viewRevision,
      message,
    })
    const submit = prepared.ok.modelView === undefined ? commit : submitGuidance
    const settled = reminderOutcome(await submit(book, domain, command, prepared.ok.advance))
    return typeof settled === 'string' ? { kind: 'again' } : failed(settled)
  }

  return {
    async ensureHistory(
      book: B,
      domain: DomainRef,
      principal: P,
      expectedScope: ScopeRef,
    ): Promise<Outcome<ModelViewBasis | null, Failure>> {
      for (let attempt = 0; attempt < 16; attempt++) {
        const before = await ports.read(book, domain)
        if ('failure' in before) return before
        if (before.ok === null)
          return fail({
            kind: 'unavailable',
            owner: 'session-log-journal',
            diagnostic: 'the Session snapshot is missing',
          })
        const scope = openContextScope({
          tenant: book.tenant,
          session: book.session,
          snapshot: before.ok,
        })
        if (scope?.ref !== expectedScope.ref) return fail({ kind: 'changed' })
        const refreshed = await refresh(book, domain, principal, before.ok, 'request')
        if (refreshed?.kind === 'answer') return refreshed.value
        if (refreshed?.kind === 'again') continue
        const prepared = await prepareTell(book, domain, principal, before.ok)
        if (prepared.kind === 'answer') return prepared.value
        if (prepared.kind === 'again') continue
        const current = await ports.read(book, domain)
        if ('failure' in current) return current
        if (current.ok?.revision === before.ok.revision) return succeed(prepared.basis)
      }
      return fail({
        kind: 'unavailable',
        owner: 'session-log-journal',
        diagnostic: 'the workspace guidance revision kept changing',
      })
    },
    /** A read that fails fails the step; nothing told moves on unless its commit is accepted. */
    async beforeStep(
      book: B,
      domain: DomainRef,
      write: object,
      scratch: Scratch,
      appended: readonly PublishedBatch[],
    ): Promise<Told> {
      const step = begunStep(appended)
      if (step === null) return null
      const principal = principalOf<P>(write)
      return settleModelStep(
        scratch.snapshot,
        async snapshot =>
          (await refresh(book, domain, principal, snapshot, step)) ??
          stepTell(await prepareTell(book, domain, principal, snapshot)),
        () => ports.read(book, domain),
      )
    },
    /** The request after a compaction is prepared in the same step: tell it in full right away. */
    async afterCompaction(
      book: B,
      domain: DomainRef,
      write: object,
      scratch: Scratch,
      outcome: JournalCommitResult,
    ): Promise<void> {
      const compacted = scratch.commands.some(
        item => item.kind === 'commitDerived' && item.input.value.kind === 'compaction',
      )
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
          : ((await refresh(book, domain, principalOf<P>(write), fresh.ok, 'compaction')) ??
            stepTell(await prepareTell(book, domain, principalOf<P>(write), fresh.ok)))
      // The original compaction remains committed. Resolving the next model view retries the repair.
      if (told?.kind === 'answer')
        ports.fault?.(
          `the runtime context after a compaction is not told yet: ${JSON.stringify(told.value.failure)}`,
        )
    },
  }
}
