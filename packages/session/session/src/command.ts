import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decide,
  expectedHolds,
  expectedRevision,
  mutationAccessRequest,
  type CommitReceipt,
  type GuardCommand,
  type HistoryEntry,
  type MutationName,
  type SessionAccess,
  type SessionAccessRequest,
  type SessionCallerClass,
  type SessionCommand,
  type SessionFailure,
  type SessionTransactionPort,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { admitsCommand } from './callers.ts'
import type { SessionDependencies } from './dependencies.ts'
import { denied, guarded, OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import { terminalOf, type SessionMeasurer } from './measure.ts'
import type { SchedulingPolicy } from './policy.ts'
import { qualify, readSnapshot } from './qualify.ts'
import { screenCommand } from './screening.ts'

const OPTIMISTIC: ReadonlySet<MutationName> = new Set([
  'claim',
  'reload',
  'release',
  'finishRun',
  'recordIdle',
  'bindExternalCall',
  'completeExternalConsumption',
  'commitDerived',
])

const STATE_REFUSALS: ReadonlySet<SessionFailure['kind']> = new Set([
  'archived',
  'frozen',
  'run-active',
  'no-input',
  'not-ready',
  'terminal',
  'stale-advance',
])

const EVIDENCE: ReadonlySet<MutationName> = new Set([
  'create',
  'completeInitialization',
  'change',
  'startRun',
  'reload',
  'claim',
  'freeze',
  'receive',
  'preserveResult',
  'completeConsumption',
  'completeExternalConsumption',
])
const RECALL_WITH_MATERIAL: ReadonlySet<MutationName> = new Set([
  'create',
  'completeInitialization',
])

export const ADVANCE_KINDS: ReadonlySet<string> = new Set([
  'intake.routed',
  'run.terminal',
  'session.unarchived',
  'session.initialization-item',
])

const ROUND_PAGE_BYTES = 1_048_576

export type CommandAnswer = Outcome<unknown, SessionFailure>

export type CommandHandlerInput<P> = Readonly<{
  dependencies: SessionDependencies<P>
  policy: SchedulingPolicy
  lifecycle: Lifecycle
  measurer: SessionMeasurer
  committed(command: SessionCommand): void
}>

export type CommandHandler<P> = (
  caller: SessionCallerClass,
  command: SessionCommand,
  principal: P,
) => Promise<CommandAnswer>

type Lookup = Readonly<{ kind: 'new' }> | Readonly<{ kind: 'held' }>

type ContextCommand = Extract<SessionCommand, { kind: 'create' | 'change' | 'startRun' | 'reload' }>
type IdleCommand = Extract<SessionCommand, { kind: 'recordIdle' | 'considerAutoArchive' }>

function preparesContext(command: SessionCommand): command is ContextCommand {
  return (
    command.kind === 'create' ||
    command.kind === 'change' ||
    command.kind === 'startRun' ||
    command.kind === 'reload'
  )
}

function preparesIdle(command: SessionCommand): command is IdleCommand {
  return command.kind === 'recordIdle' || command.kind === 'considerAutoArchive'
}

function expectedOf(command: SessionCommand): WorkSnapshot['revision'] | undefined {
  if (!OPTIMISTIC.has(command.kind) || !('expected' in command.input)) return undefined
  return command.input.expected
}

function isReceipt(value: unknown): value is CommitReceipt {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operation' in value &&
    'revision' in value &&
    'first' in value &&
    'last' in value &&
    'recovered' in value &&
    'source' in value
  )
}

export function receiptOf(value: unknown): CommitReceipt | null {
  if (isReceipt(value)) return value
  if (typeof value === 'object' && value !== null && 'receipt' in value) {
    const inner: unknown = value.receipt
    if (isReceipt(inner)) return inner
  }
  return null
}

export function createCommandHandler<P>(input: CommandHandlerInput<P>): CommandHandler<P> {
  const { dependencies, policy, lifecycle, measurer } = input

  const lookUp = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
  ): Promise<Outcome<Lookup, SessionFailure>> => {
    const control = command.kind === 'cancelRun' || command.kind === 'stopCall'
    const operation = command.input.operation
    const answer = control
      ? await guarded(OWNERS.delegated, 'queryControlOperation', () =>
          view.queryControlOperation({ ...access, operation }),
        )
      : await guarded(OWNERS.delegated, 'queryOperation', () =>
          view.queryOperation({ ...access, operation }),
        )
    if ('ok' in answer)
      return succeed(answer.ok.kind === 'committed' ? { kind: 'held' } : { kind: 'new' })
    switch (answer.failure.kind) {
      case 'conflict':
        return succeed({ kind: 'held' })
      case 'denied':
        return command.kind === 'create' ? succeed({ kind: 'new' }) : fail(denied(command.kind))
      default:
        return fail(answer.failure)
    }
  }

  const guardSteps = (
    access: SessionAccess<P>,
    command: SessionCommand,
  ): readonly (() => Promise<Outcome<readonly GuardCommand[], SessionFailure>>)[] => {
    const steps: (() => Promise<Outcome<readonly GuardCommand[], SessionFailure>>)[] = []
    const routedNotOrdinary = command.kind === 'accept' && command.input.value.kind !== 'ordinary'
    if (EVIDENCE.has(command.kind) || routedNotOrdinary)
      steps.push(() =>
        guarded(OWNERS.evidence, 'evidence.prepare', () =>
          dependencies.evidence.prepare(command, access),
        ),
      )
    if (preparesContext(command))
      steps.push(() =>
        guarded(OWNERS.context, 'context.prepare', () =>
          dependencies.context.prepare(access, command),
        ),
      )
    if (preparesIdle(command))
      steps.push(() =>
        guarded(OWNERS.idle, 'idle.prepare', () => dependencies.idle.prepare(access, command)),
      )
    return steps
  }

  const materials = async (
    access: SessionAccess<P>,
    command: SessionCommand,
  ): Promise<Outcome<readonly GuardCommand[], SessionFailure>> => {
    const guards: GuardCommand[] = []
    const identity = await guarded(OWNERS.identity, 'identity.prepare', () =>
      dependencies.identity.prepare(access, command),
    )
    if ('failure' in identity) return identity
    guards.push(identity.ok)
    for (const step of guardSteps(access, command)) {
      const prepared = await step()
      if ('failure' in prepared) return prepared
      guards.push(...prepared.ok)
    }
    return succeed(guards)
  }

  const refusalOf = (snapshot: WorkSnapshot, command: SessionCommand): SessionFailure | null => {
    let decision
    try {
      decision = decide(snapshot, command, [], null, { compaction: null })
    } catch {
      return null
    }
    return decision.kind === 'rejected' && STATE_REFUSALS.has(decision.failure.kind)
      ? decision.failure
      : null
  }

  const readAndRefuse = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
  ): Promise<CommandAnswer | null> => {
    const snapshot = await readSnapshot(view, access, command.kind)
    if ('failure' in snapshot) return snapshot
    const refusal = refusalOf(snapshot.ok, command)
    if (refusal !== null) return fail(refusal)
    const expected = expectedOf(command)
    return expected !== undefined && !expectedHolds(snapshot.ok, command.kind, expected)
      ? fail({ kind: 'changed', revision: expectedRevision(snapshot.ok, command.kind) })
      : null
  }

  const commit = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
    guards: readonly GuardCommand[],
  ): Promise<CommandAnswer> => {
    try {
      return await view.commit({ access, command, guards })
    } catch {
      return fail({ kind: 'commit-unknown', operation: command.input.operation })
    }
  }

  const entriesOf = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    receipt: CommitReceipt,
  ): Promise<readonly HistoryEntry[]> => {
    let page = await guarded(OWNERS.delegated, 'history.begin', () =>
      view.history.begin({
        ...access,
        kinds: [],
        from: null,
        direction: 'backward',
        pageBytes: ROUND_PAGE_BYTES,
      }),
    )
    const entries: HistoryEntry[] = []
    while ('ok' in page) {
      entries.push(...page.ok.entries.filter(entry => entry.revision === receipt.revision))
      if (page.ok.entries.some(entry => entry.id === receipt.first)) return entries.reverse()
      const cursor = page.ok.next
      if (cursor === null) break
      page = await guarded(OWNERS.delegated, 'history.next', () =>
        view.history.next({ ...access, cursor }),
      )
    }
    return []
  }

  const afterCommit = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
    receipt: CommitReceipt,
  ): Promise<void> => {
    if (!measurer.active) return
    const entries = await entriesOf(view, access, receipt)
    for (const entry of entries.filter(candidate => candidate.kind === 'run.terminal'))
      measurer.roundComplete({
        session: access.session,
        tenant: access.tenant,
        ...terminalOf(entry.payload),
        revision: receipt.revision,
        entry: entry.id,
        operation: command.input.operation,
      })
  }

  const recall = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
  ): Promise<CommandAnswer> => {
    if (!RECALL_WITH_MATERIAL.has(command.kind)) return commit(view, access, command, [])
    const recalled = await materials(access, command)
    return 'failure' in recalled ? recalled : commit(view, access, command, recalled.ok)
  }

  const redoable = (command: SessionCommand, failure: SessionFailure, retries: number): boolean =>
    failure.kind === 'changed' &&
    OPTIMISTIC.has(command.kind) &&
    expectedOf(command) === undefined &&
    retries < policy.command.retriesOnChanged

  const settle = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
    answer: CommandAnswer & Readonly<{ ok: unknown }>,
  ): Promise<CommandAnswer> => {
    const receipt = receiptOf(answer.ok)
    if (receipt?.recovered === true) return answer
    if (receipt !== null) await afterCommit(view, access, command, receipt)
    input.committed(command)
    return answer
  }

  const run = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
    retries: number,
  ): Promise<CommandAnswer> => {
    const lookup = await lookUp(view, access, command)
    if ('failure' in lookup) return lookup
    if (lookup.ok.kind === 'held') return recall(view, access, command)
    if (command.kind !== 'create') {
      const early = await readAndRefuse(view, access, command)
      if (early !== null) return early
    }
    const screened = await screenCommand(dependencies, access, command)
    if ('failure' in screened) return screened
    const guards = await materials(access, screened.ok)
    if ('failure' in guards) return guards
    const answer = await commit(view, access, screened.ok, guards.ok)
    if ('failure' in answer)
      return redoable(command, answer.failure, retries)
        ? run(view, access, command, retries + 1)
        : answer
    return settle(view, access, screened.ok, answer)
  }

  return async (caller, command, principal) => {
    if (lifecycle.closed) return fail(unavailable(OWNERS.session, 'the session instance is closed'))
    if (!admitsCommand(caller, command)) return fail(denied(command.kind))
    const tenant: unknown = command.input.tenant
    if (tenant === undefined || tenant === null)
      return fail({ kind: 'invalid', field: 'tenant', reason: 'the access names no tenant' })
    const access: SessionAccess<P> = {
      principal,
      tenant: command.input.tenant,
      session: command.input.session,
    }
    const request: SessionAccessRequest<P> = mutationAccessRequest(access, command)
    return lifecycle.track(
      measurer.segment(
        command.kind,
        access.session,
        async () => {
          const view = await qualify(dependencies, request)
          if ('failure' in view) return view
          return run(view.ok, access, command, 0)
        },
        answer => 'failure' in answer,
        access.tenant,
      ),
    )
  }
}
