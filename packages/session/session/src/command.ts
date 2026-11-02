// The command handler pipeline of a command that Session commits (SPEC CP-01). One face operation
// asks the access check once, binds one delegated view, and does every later port call through
// that view, the `changed` retries included. `decide` is the only encoding of a command: the step
// outside the transaction only finds a refusal early; the storage participant decides again inside.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decide,
  mutationAccessRequest,
  type CommitReceipt,
  type GuardCommand,
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
import { denied, guarded, messageOf, OWNERS, unavailable } from './failures.ts'
import type { Lifecycle } from './lifecycle.ts'
import type { SchedulingPolicy } from './policy.ts'
import { qualify, readSnapshot } from './qualify.ts'

/** The commands that carry `expected` and so may meet `changed` at the commit (SPEC CP-01). */
const OPTIMISTIC: ReadonlySet<MutationName> = new Set([
  'reload',
  'release',
  'finishRun',
  'recordIdle',
  'bindExternalCall',
  'completeExternalConsumption',
  'commitDerived',
])

/**
 * Refusals that `decide` reads from the snapshot alone. The step outside the transaction returns
 * only these: any other refusal may come from material or same-root reads that only the storage
 * participant has, so the commit decides it.
 */
const STATE_REFUSALS: ReadonlySet<SessionFailure['kind']> = new Set([
  'archived',
  'frozen',
  'run-active',
  'no-input',
  'not-ready',
  'terminal',
  'stale-advance',
])

/** Commands whose material includes the evidence bridge (contract「身份桥、证据桥与 Context 输入」). */
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
/** The initialization recall still verifies its source guard (contract「结果同批与认回顺序」). */
const RECALL_WITH_MATERIAL: ReadonlySet<MutationName> = new Set([
  'create',
  'completeInitialization',
])

/** Kinds of committed entries that wake the advance trigger S1 (SPEC S1 触发源). */
export const ADVANCE_KINDS: ReadonlySet<string> = new Set([
  'intake.routed',
  'run.terminal',
  'session.unarchived',
  'session.initialization-item',
])

/** The page budget of the one history read that collects the event kinds of a notice. */
const NOTICE_PAGE_BYTES = 1_048_576

export type CommandAnswer = Outcome<unknown, SessionFailure>

export type CommandHandlerInput<P> = Readonly<{
  dependencies: SessionDependencies<P>
  policy: SchedulingPolicy
  lifecycle: Lifecycle
  /** Called after a commit of this instance that is not a recall, before the answer returns. */
  committed(command: SessionCommand): void
}>

export type CommandHandler<P> = (
  caller: SessionCallerClass,
  command: SessionCommand,
  principal: P,
) => Promise<CommandAnswer>

type Lookup = Readonly<{ kind: 'new' }> | Readonly<{ kind: 'held' }>

/** The `expected` the caller asserted, or undefined for a command that carries none. */
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

/** The commit receipt inside a command answer, when the answer carries one. */
export function receiptOf(value: unknown): CommitReceipt | null {
  if (isReceipt(value)) return value
  if (typeof value === 'object' && value !== null && 'receipt' in value) {
    const inner: unknown = value.receipt
    if (isReceipt(inner)) return inner
  }
  return null
}

export function createCommandHandler<P>(input: CommandHandlerInput<P>): CommandHandler<P> {
  const { dependencies, policy, lifecycle } = input

  /** Step 1, the recall part: one point lookup through the view. */
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
      // The identity belongs to the other form of record: the commit answers the conflict.
      case 'conflict':
        return succeed({ kind: 'held' })
      // No session under this tenant: indistinguishable from another tenant. Only create starts one.
      case 'denied':
        return command.kind === 'create' ? succeed({ kind: 'new' }) : fail(denied(command.kind))
      default:
        return fail(answer.failure)
    }
  }

  /** Step 4: the guard material of the command, from the owners its kind fixes. */
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
    const routedNotOrdinary = command.kind === 'accept' && command.input.value.kind !== 'ordinary'
    if (EVIDENCE.has(command.kind) || routedNotOrdinary) {
      const evidence = await guarded(OWNERS.evidence, 'evidence.prepare', () =>
        dependencies.evidence.prepare(command),
      )
      if ('failure' in evidence) return evidence
      guards.push(...evidence.ok)
    }
    if (
      command.kind === 'create' ||
      command.kind === 'change' ||
      command.kind === 'startRun' ||
      command.kind === 'reload'
    ) {
      const context = await guarded(OWNERS.context, 'context.prepare', () =>
        dependencies.context.prepare(access, command),
      )
      if ('failure' in context) return context
      guards.push(...context.ok)
    }
    if (command.kind === 'recordIdle' || command.kind === 'considerAutoArchive') {
      const idle = await guarded(OWNERS.idle, 'idle.prepare', () =>
        dependencies.idle.prepare(access, command),
      )
      if ('failure' in idle) return idle
      guards.push(...idle.ok)
    }
    if (command.kind === 'accept' && command.input.value.kind === 'ordinary') {
      const admitted = admission()
      if ('failure' in admitted) return admitted
    }
    return succeed(guards)
  }

  /**
   * EX-1 at the accept of an ordinary input. Null means admission is unavailable. An empty list
   * runs no slot. A non-empty list is not orchestrated yet: a slot may expand the submission, and
   * the delegated view is bound to the command that was checked, so an expanded command has no
   * accepted path (reported to the dispatcher; M2 assembles `admission: 'none'`).
   */
  const admission = (): Outcome<null, SessionFailure> => {
    let slots
    try {
      slots = dependencies.admission.current()
    } catch (error) {
      return fail(unavailable(OWNERS.admission, `admission.current threw: ${messageOf(error)}`))
    }
    if (slots === null)
      return fail(unavailable(OWNERS.admission, 'the before-admit slot list is absent'))
    if (slots.length > 0)
      return fail(
        unavailable(
          OWNERS.admission,
          'before-admit slots are not orchestrated by this member yet; only an empty list is accepted',
        ),
      )
    return succeed(null)
  }

  /** Step 3: a refusal that the snapshot alone decides, or null to go on. */
  const refusalOf = (snapshot: WorkSnapshot, command: SessionCommand): SessionFailure | null => {
    let decision
    try {
      decision = decide(snapshot, command, [], null, { compaction: null })
    } catch {
      // A defect of the early step must not refuse: the commit decides again.
      return null
    }
    return decision.kind === 'rejected' && STATE_REFUSALS.has(decision.failure.kind)
      ? decision.failure
      : null
  }

  /**
   * Steps 2 and 3: the authoritative read, then the early refusal. Null means go on. The caller's
   * `expected` is its own assertion: it is never replaced by the revision just read. A tail that
   * has moved on answers `changed` and commits nothing (SPEC CP-01 step 2); a state refusal comes
   * first, in the order of `decide`.
   */
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
    return expected !== undefined && expected !== snapshot.ok.revision
      ? fail({ kind: 'changed', revision: snapshot.ok.revision })
      : null
  }

  /** Step 5: the commit through the view. A throw leaves the outcome unknown. */
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

  /** Step 6: the notice after a durable commit. Its absence or failure changes no answer. */
  const notify = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    receipt: CommitReceipt,
  ): Promise<void> => {
    let notifier
    try {
      notifier = dependencies.notifier.current()
    } catch {
      return
    }
    if (notifier === null) return
    const page = await guarded(OWNERS.delegated, 'history.begin', () =>
      view.history.begin({
        ...access,
        kinds: [],
        from: receipt.first,
        direction: 'forward',
        pageBytes: NOTICE_PAGE_BYTES,
      }),
    )
    const kinds =
      'ok' in page
        ? [
            ...new Set(
              page.ok.entries
                .filter(entry => entry.revision === receipt.revision)
                .map(entry => entry.kind),
            ),
          ]
        : []
    const target = notifier
    lifecycle.spawn(() =>
      target.committed({
        tenant: access.tenant,
        session: access.session,
        revision: receipt.revision,
        source: receipt.source,
        kinds,
      }),
    )
  }

  /** Steps 1 (recall part) to 6 over one bound view. `retries` counts the `changed` redos so far. */
  const run = async (
    view: SessionTransactionPort<P>,
    access: SessionAccess<P>,
    command: SessionCommand,
    retries: number,
  ): Promise<CommandAnswer> => {
    // The Tool target is refused before the session or the operation is read (contract 控制与模型选择).
    if (command.kind === 'stopCall' && command.input.producer.kind === 'tool')
      return commit(view, access, command, [])
    const lookup = await lookUp(view, access, command)
    if ('failure' in lookup) return lookup
    if (lookup.ok.kind === 'held') {
      // The original answer comes back from the record; nothing new is committed or notified.
      if (!RECALL_WITH_MATERIAL.has(command.kind)) return commit(view, access, command, [])
      const recalled = await materials(access, command)
      return 'failure' in recalled ? recalled : commit(view, access, command, recalled.ok)
    }
    if (command.kind !== 'create') {
      const early = await readAndRefuse(view, access, command)
      if (early !== null) return early
    }
    const guards = await materials(access, command)
    if ('failure' in guards) return guards
    const answer = await commit(view, access, command, guards.ok)
    if ('failure' in answer) {
      if (
        answer.failure.kind === 'changed' &&
        OPTIMISTIC.has(command.kind) &&
        expectedOf(command) === undefined &&
        retries < policy.command.retriesOnChanged
      )
        return run(view, access, command, retries + 1)
      return answer
    }
    const receipt = receiptOf(answer.ok)
    if (receipt?.recovered === true) return answer
    if (receipt !== null) await notify(view, access, receipt)
    input.committed(command)
    return answer
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
    // Fixed before the first await: the decision covers exactly this command (contract 当前操作的访问裁定).
    const request: SessionAccessRequest<P> = mutationAccessRequest(access, command)
    return lifecycle.track(
      (async () => {
        const view = await qualify(dependencies, request)
        if ('failure' in view) return view
        return run(view.ok, access, command, 0)
      })(),
    )
  }
}
