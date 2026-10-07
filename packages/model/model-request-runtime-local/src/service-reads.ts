import { retainRuntimeProjection, type ProjectedComponent } from './runtime-projection.ts'
import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as validateLoop } from '@omne-harness-lite/loop-extension'
import { createSessionModelSelection } from './session-selection.ts'
import {
  acknowledgedAsTerminal,
  rejectAcknowledgedHistory,
} from '@omne-harness-lite/model-request-runtime'
import { acknowledgedFactsFromHistory } from '@omne-harness-lite/model-request-runtime'
import { runtimeCustody, type AcknowledgementCustody } from './acknowledgement-custody.ts'
import {
  projectCallState,
  type LocalCallResponsibility,
} from '@omne-harness-lite/model-request-runtime'
import { dispatchGuard, type DispatchGuardFact } from '@omne-harness-lite/model-request-runtime'
import { createModelFailureSource, readFailureSubject } from './failure-subject.ts'
import {
  readSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SessionModelSelectionInput } from '@omne-harness-lite/model-request-runtime'
import type { SessionModelSelection } from './session-selection-types.ts'
import type {
  ModelRuntimeOperations,
  RuntimeCloseResult,
  SessionRuntimeBinding,
  ReadAttemptsResult,
  ReadAttemptDispatch,
  FailureConsumption,
  ModelFailureSource,
} from '@omne-harness-lite/model-request-runtime'
import type { CallKey } from '@omne-harness-lite/messages'
import type { RuntimeConstruction, CallContainerView } from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import type {
  CallHistoryDispatch,
  CallHistoryKnown,
  CallHistoryResult,
} from '@omne-harness-lite/model-request-runtime'
import type { CallAccessEvidence } from '@omne-harness-lite/model-request-runtime'
import type { CallFacts } from './reference-types.ts'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { requestStopAndWait } from './settlement-stop.ts'

type ReadMethods = Pick<
  ModelRuntimeOperations,
  | 'legalTargets'
  | 'displayList'
  | 'effectiveModel'
  | 'selectModel'
  | 'readAttempts'
  | 'canDispatchAgain'
>
type ReadOwner = {
  readonly input: SessionModelSelectionInput
  readonly selection: SessionModelSelection
}
const unavailable = () => ({ unavailable: true }) as const
const malformed = () => ({ invalidInput: { reason: 'malformed' } }) as const
function validCall(input: CallKey): boolean {
  return (
    'ok' in parseOpaqueIdentifier(input.session, 'SessionRef') &&
    'ok' in parseOpaqueIdentifier(input.callId, 'ModelCallId')
  )
}
function currentReadEvidence(
  evidence: CallAccessEvidence,
  input: CallKey,
  binding: SettlementLogBinding,
): boolean {
  return (
    evidence.action === 'read' &&
    evidence.ref.session === input.session &&
    evidence.ref.callId === input.callId &&
    evidence.source.generation === binding.generation &&
    typeof evidence.sourceVersion === 'string' &&
    evidence.sourceVersion.length > 0 &&
    evidence.revoked.aborted === false &&
    typeof evidence.revoked.addEventListener === 'function' &&
    typeof evidence.revoked.removeEventListener === 'function' &&
    settlementGenerationCurrent(binding)
  )
}
function sameReadAdmission(
  returned: { readonly evidence: CallAccessEvidence },
  admitted: CallAccessEvidence | undefined,
): boolean {
  return (
    returned.evidence.sourceVersion === admitted?.sourceVersion &&
    returned.evidence.revoked === admitted?.revoked
  )
}
function sameSelectionBinding(
  a: SessionModelSelectionInput,
  b: SessionModelSelectionInput,
): boolean {
  return (
    a.binding.session === b.binding.session &&
    tenantIdEquals(a.binding.tenant, b.binding.tenant) &&
    a.binding.generation === b.binding.generation &&
    a.binding.log === b.binding.log &&
    a.binding.currentGeneration === b.binding.currentGeneration
  )
}
function sameSelection(a: SessionModelSelectionInput, b: SessionModelSelectionInput): boolean {
  return (
    sameSelectionBinding(a, b) &&
    a.owner === b.owner &&
    a.concurrent === b.concurrent &&
    a.sessionTenancy === b.sessionTenancy &&
    a.catalog === b.catalog &&
    a.currentEvaluationInputs === b.currentEvaluationInputs &&
    a.projection === b.projection &&
    a.compatible === b.compatible &&
    a.now === b.now
  )
}

function acquireRead(
  owner: SessionModelSelectionInput['owner'],
  binding: SessionRuntimeBinding,
): ReturnType<SessionModelSelectionInput['owner']['acquire']> {
  try {
    if (owner.admission() !== 'open') return unavailable()
    return owner.acquire(binding.selection.concurrent)
  } catch {
    return unavailable()
  }
}

function isReadyContent(read: Awaited<ReturnType<CallFacts['content']['read']>>): read is {
  readonly content: { readonly kind: 'reply_ready'; readonly value: PendingModelResponse }
} {
  return 'content' in read && read.content.kind === 'reply_ready'
}

function isFinalReady(final: CallHistoryDispatch | undefined): boolean {
  return final?.response === null && final.ready !== null
}

function localResponsibility<P extends PlannedSemantics, R>(
  input: CallKey,
  localView: CallContainerView<P, R> | undefined,
): LocalCallResponsibility | undefined {
  return localView?.operation.phase === 'ready'
    ? { session: input.session, callId: input.callId, phase: 'open' }
    : localView?.operation.phase === 'reply_pending'
      ? {
          session: input.session,
          callId: input.callId,
          phase: 'reply_pending',
          responseId: localView.operation.pending.id,
        }
      : undefined
}

type CompletedAttempts =
  | { readonly result: ReadAttemptsResult }
  | { readonly result: ReadAttemptsResult; readonly source: ModelFailureSource }

function acknowledgedAttempts(
  input: CallKey,
  raw: Extract<CallHistoryResult, { readonly known: unknown }>,
  prefix: SettlementPrefix,
  binding: SessionRuntimeBinding,
) {
  // RT12 S-100: the S-97 small sequence; no full dispatch record or failure subject.
  const facts = acknowledgedFactsFromHistory(input, raw.known, {
    generation: binding.log.generation,
    progress: prefix.tail,
  })
  return facts === undefined
    ? { result: unavailable() }
    : { acknowledged: { facts, log: binding.log } }
}

function withoutFailureSource<T>(requested: boolean, result: T): T | FailureConsumption<T> {
  return requested ? { result, consumption: { kind: 'notApplicable' } } : result
}

function acknowledgedResult(
  view: Awaited<ReturnType<AcknowledgementCustody['view']>> | undefined,
): ReadAttemptsResult {
  return view === undefined || 'unavailable' in view ? unavailable() : { acknowledged: view }
}

function completedRead(
  read: CompletedAttempts,
  requested: boolean,
): ReadAttemptsResult | FailureConsumption<ReadAttemptsResult> {
  const result: ReadAttemptsResult = read.result
  if (!requested) return result
  return 'source' in read
    ? { result, consumption: { kind: 'failure', source: read.source } }
    : { result, consumption: { kind: 'notApplicable' } }
}

function latestFailureFact(latest: CallHistoryDispatch | undefined): DispatchGuardFact<unknown> {
  const value = latest?.response?.value
  const failure =
    value !== null && typeof value === 'object' && !Array.isArray(value) && 'failure' in value
      ? value.failure
      : undefined
  return typeof failure === 'object' && failure !== null && 'cause' in failure
    ? { known: failure.cause }
    : { unknown: true }
}

function guardCall(input: CallKey, state: ReturnType<typeof projectCallState>) {
  return 'unavailable' in state
    ? ({ unknown: true } as const)
    : 'callNotFound' in state
      ? { known: null }
      : {
          known: {
            session: input.session,
            callId: input.callId,
            phase: { known: state.phase },
          },
        }
}

function guardDispatches(
  input: CallKey,
  known: CallHistoryKnown | null,
  history: CallHistoryResult,
) {
  return known === null && !('absent' in history)
    ? ({ unknown: true } as const)
    : {
        known: {
          session: input.session,
          callId: input.callId,
          opened: known?.dispatches.map(item => ({ known: item.opened !== null })) ?? [],
        },
      }
}

function guardResult(
  result: ReturnType<typeof dispatchGuard>,
): Awaited<ReturnType<ReadMethods['canDispatchAgain']>> {
  if ('allowed' in result) return result
  if ('refused' in result) return result
  if (result.rejected === 'wrongPhase') return { wrongPhase: { phase: result.phase } }
  if (result.rejected === 'invalidInput') return malformed()
  if (result.rejected === 'callNotFound') return { callNotFound: true }
  if (result.rejected === 'alreadyEnded') return { alreadyEnded: true }
  return unavailable()
}

/** Owns selection writers and read registrations until their actual work stops. */
export function createRuntimeReads<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
  sharedCustody?: AcknowledgementCustody,
): ProjectedComponent<
  { readonly methods: ReadMethods; readonly close: () => Promise<RuntimeCloseResult> },
  RuntimeConstruction<P, R>
> {
  return buildRuntimeReads(construction, sharedCustody)
}

class RuntimeReadsState {
  readonly selections = new Map<string, ReadOwner>()
  readonly selectionLocks = new Map<string, Promise<void>>()
  readonly active = new Set<{
    readonly tasks: Set<SettlementTask<unknown>>
    readonly done: Promise<void>
    readonly stop: () => void
  }>()
  readonly sources = new Set<ModelFailureSource>()
  readonly admissions = new Set<Promise<void>>()
  closed = false
  readCleanupFailed = false
  closing: Promise<RuntimeCloseResult> | undefined
}

function buildRuntimeReads<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
  sharedCustody?: AcknowledgementCustody,
  physical: RuntimeReadsState = new RuntimeReadsState(),
): ProjectedComponent<
  { readonly methods: ReadMethods; readonly close: () => Promise<RuntimeCloseResult> },
  RuntimeConstruction<P, R>
> {
  const ownCustody = sharedCustody === undefined ? runtimeCustody(construction) : undefined
  const custody = sharedCustody ?? ownCustody

  async function bind(
    session: unknown,
  ): Promise<
    | { readonly binding: SessionRuntimeBinding }
    | { readonly invalidInput: { readonly reason: 'malformed' } }
    | { readonly unavailable: true }
  > {
    const parsed = parseOpaqueIdentifier(session, 'SessionRef')
    if (!('ok' in parsed)) return malformed()
    try {
      const answer = await construction.sessions.bind(parsed.ok)
      if ('failure' in answer)
        return answer.failure === 'invalidInput' ? malformed() : unavailable()
      const binding = answer.binding
      if (
        binding.log.session !== parsed.ok ||
        binding.selection.binding.session !== parsed.ok ||
        binding.log.generation !== binding.selection.binding.generation ||
        !tenantIdEquals(binding.log.tenant, binding.selection.binding.tenant)
      )
        return unavailable()
      return { binding }
    } catch {
      return unavailable()
    }
  }

  async function selection(
    session: unknown,
  ): Promise<
    | { readonly selection: SessionModelSelection }
    | { readonly invalidInput: { readonly reason: 'malformed' } }
    | { readonly unavailable: true }
  > {
    if (physical.closed) return unavailable()
    const bound = await bind(session)
    if (!('binding' in bound)) return bound
    const next = bound.binding.selection
    const key = next.binding.session
    const preceding = physical.selectionLocks.get(key)
    let release = () => {}
    const locked = new Promise<void>(resolve => {
      release = resolve
    })
    physical.selectionLocks.set(key, locked)
    if (preceding !== undefined) await preceding
    try {
      if (physical.closed) return unavailable()
      const previous = physical.selections.get(key)
      if (previous !== undefined) {
        if (sameSelection(previous.input, next)) return { selection: previous.selection }
        const ended = await previous.selection.close()
        if (!('released' in ended)) return unavailable()
        physical.selections.delete(key)
      }
      const created = createSessionModelSelection(next)
      physical.selections.set(key, { input: next, selection: created })
      return { selection: created }
    } catch {
      return unavailable()
    } finally {
      if (physical.selectionLocks.get(key) === locked) physical.selectionLocks.delete(key)
      release()
    }
  }

  async function withReadAccess<T>(
    input: CallKey,
    work: (
      binding: SessionRuntimeBinding,
      current: () => boolean,
      evidence: CallAccessEvidence,
    ) => Promise<T>,
  ): Promise<T | ReturnType<typeof unavailable> | ReturnType<typeof malformed>> {
    if (!validCall(input)) return malformed()
    if (physical.closed) return unavailable()
    const ref = Object.freeze({ session: input.session, callId: input.callId })
    let finish = () => {}
    const done = new Promise<void>(resolve => {
      finish = resolve
    })
    physical.admissions.add(done)
    try {
      const bound = await bind(ref.session)
      if (!('binding' in bound)) return bound
      if (physical.closed) return unavailable()
      const { binding } = bound
      let current = () => false
      let admittedEvidence: CallAccessEvidence | undefined
      const admitted = await construction.callAccess.check(
        { binding: binding.log, ref, action: 'read' },
        async evidence => {
          admittedEvidence = evidence
          current = () => !physical.closed && currentReadEvidence(evidence, ref, binding.log)
          if (!current()) return unavailable()
          return await work(binding, current, evidence)
        },
      )
      return 'allowed' in admitted &&
        current() &&
        currentReadEvidence(admitted.evidence, ref, binding.log) &&
        sameReadAdmission(admitted, admittedEvidence)
        ? admitted.allowed
        : unavailable()
    } catch {
      return unavailable()
    } finally {
      physical.admissions.delete(done)
      finish()
    }
  }

  async function withPrefix<T>(
    input: CallKey,
    work: (prefix: SettlementPrefix, binding: SessionRuntimeBinding) => T,
  ) {
    return await withReadAccess(
      input,
      async (binding, current) => await readAuthorizedPrefix(binding, current, work),
    )
  }

  async function readAuthorizedPrefix<T>(
    binding: SessionRuntimeBinding,
    current: () => boolean,
    work: (prefix: SettlementPrefix, binding: SessionRuntimeBinding) => T,
  ): Promise<T | ReturnType<typeof unavailable>> {
    const owner = binding.selection.owner
    const acquired = acquireRead(owner, binding)
    if (!('registration' in acquired)) return unavailable()
    const tasks = new Set<SettlementTask<unknown>>()
    const original = acquired.registration
    const registration: SettlementRegistration = {
      start(kind, operation) {
        const task = original.start(kind, operation)
        tasks.add(task)
        return task
      },
      release: () => original.release(),
    }
    let finish = () => {}
    const done = new Promise<void>(resolve => {
      finish = resolve
    })
    const operation = {
      tasks,
      done,
      stop() {
        for (const task of tasks) {
          try {
            task.requestStop()
          } catch {
            physical.readCleanupFailed = true
          }
        }
      },
    }
    physical.active.add(operation)
    let result: T | ReturnType<typeof unavailable> = unavailable()
    try {
      if (current()) {
        const read = await readSettlementPrefix({ binding: binding.log, registration })
        if ('prefix' in read && current()) result = work(read.prefix, binding)
      }
    } catch {
      result = unavailable()
    } finally {
      const stopped = await Promise.all(
        [...tasks].map(task =>
          requestStopAndWait(task).then(
            () => true,
            () => false,
          ),
        ),
      )
      if (stopped.every(Boolean)) {
        try {
          registration.release()
          physical.active.delete(operation)
        } catch {
          physical.readCleanupFailed = true
          result = unavailable()
        }
      } else {
        physical.readCleanupFailed = true
        result = unavailable()
      }
      finish()
    }
    return current() ? result : unavailable()
  }

  /** Reads each ready-only dispatch's immutable content row; any gap is unavailable, not partial. */
  async function readyAttempts(
    input: CallKey,
    dispatches: readonly CallHistoryDispatch[],
    log: SettlementLogBinding,
    current: () => boolean,
  ): Promise<ReadAttemptsResult> {
    const attempts: ReadAttemptDispatch[] = []
    let last: PendingModelResponse | undefined
    for (const item of dispatches) {
      if (!current()) return unavailable()
      if (item.ready === null || item.response !== null) {
        attempts.push(item)
        continue
      }
      let read: Awaited<ReturnType<CallFacts['content']['read']>>
      try {
        read = await construction.callFacts.content.read({
          binding: log,
          call: input.callId,
          ref: item.ready.record.payload,
        })
      } catch {
        return unavailable()
      }
      if (
        !isReadyContent(read) ||
        read.content.value.id !== item.ready.record.response ||
        read.content.value.call.callId !== input.callId
      )
        return unavailable()
      last = read.content.value
      attempts.push({ ...item, result: { disposition: 'disposition_pending', pending: last } })
    }
    const final = dispatches.at(-1)
    if (last === undefined || !isFinalReady(final)) return unavailable()
    return {
      state: last.outcome === 'interrupted' ? 'interrupted' : 'complete',
      dispatches: Object.freeze(attempts),
    }
  }

  function readAttempts(input: CallKey): Promise<ReadAttemptsResult>
  function readAttempts(
    input: CallKey,
    options: { readonly consumeFailure: true },
  ): Promise<FailureConsumption<ReadAttemptsResult>>
  async function readAttempts(
    input: CallKey,
    options?: { readonly consumeFailure: true },
  ): Promise<ReadAttemptsResult | FailureConsumption<ReadAttemptsResult>> {
    const requested = options?.consumeFailure === true
    if (options !== undefined && (!requested || Object.keys(options).length !== 1))
      return malformed()
    input = Object.freeze({ session: input.session, callId: input.callId })
    let createdSource: ModelFailureSource | undefined
    const read = await withReadAccess(input, async (binding, current, evidence) => {
      function failedAttempts(
        prefix: SettlementPrefix,
        binding: SessionRuntimeBinding,
        dispatches: readonly CallHistoryDispatch[],
        localView: CallContainerView<P, R> | undefined,
      ) {
        const subject = readFailureSubject({
          prefix,
          callId: input.callId,
          dispatches,
          source: construction.history.failure,
        })
        if (!('subject' in subject)) return { result: unavailable() }
        const result = {
          state: 'awaiting_decision' as const,
          dispatches,
          failureSubject: subject.subject,
        }
        if (!requested) return { result }
        const revoke = () => createdSource?.release()
        const source = createModelFailureSource({
          prefix,
          callId: input.callId,
          owner: binding.selection.owner,
          subject: subject.subject,
          usable: () =>
            current() &&
            !localView?.request.host.stopping() &&
            !localView?.request.host.signal.aborted,
          retain: value => {
            createdSource = value
            physical.sources.add(value)
            evidence.revoked.addEventListener('abort', revoke, { once: true })
          },
          forget: value => {
            physical.sources.delete(value)
            evidence.revoked.removeEventListener('abort', revoke)
          },
        })
        if (source === null) return { result: unavailable() }
        createdSource = source
        if (!current()) {
          source.release()
          return { result: unavailable() }
        }
        return { result: { ...result, failureSubject: source.subject }, source }
      }
      function attemptsFromPrefix(prefix: SettlementPrefix, binding: SessionRuntimeBinding) {
        const raw = construction.history.call(prefix, input.callId)
        if ('known' in raw && raw.known.acknowledged !== null) {
          return acknowledgedAttempts(input, raw, prefix, binding)
        }
        const history = rejectAcknowledgedHistory(raw)
        const localView = construction.calls.find(input)?.view()
        const local = localResponsibility(input, localView)
        const state = projectCallState({
          session: input.session,
          callId: input.callId,
          history,
          ...(local === undefined ? {} : { local }),
        })
        if (!('phase' in state)) return { result: state }
        if (state.phase === 'open')
          return { result: { state: 'open' as const, dispatches: [] as const } }
        if (!('known' in history)) return { result: unavailable() }
        const dispatches = history.known.dispatches
        if (state.phase === 'awaiting_decision')
          return failedAttempts(prefix, binding, dispatches, localView)
        // RT11/RT12 S-86: the durable ready is the complete/interrupted terminal fact with
        // disposition_pending; its outcome and full original value live in the content row.
        if (state.source === 'durable' && state.phase === 'reply_pending')
          return { ready: { dispatches, log: binding.log } }
        return { result: { state: state.phase, dispatches } }
      }
      const projected = await readAuthorizedPrefix(binding, current, attemptsFromPrefix)
      if (!current()) return unavailable()
      // The prefix reader has actually stopped. Access admission still protects the async view.
      if ('ready' in projected && projected.ready !== undefined) {
        return {
          result: await readyAttempts(
            input,
            projected.ready.dispatches,
            projected.ready.log,
            current,
          ),
        }
      }
      if ('acknowledged' in projected && projected.acknowledged !== undefined) {
        const { facts, log } = projected.acknowledged
        const view = custody === undefined ? undefined : await custody.view(log, facts)
        return {
          result: acknowledgedResult(view),
        }
      }
      return projected
    })
    if (!('result' in read)) {
      createdSource?.release()
      return withoutFailureSource(requested, read)
    }
    return completedRead(read, requested)
  }

  const methods: ReadMethods = {
    async legalTargets(input) {
      const selected = await selection(input.session)
      if (!('selection' in selected)) return selected
      const answer = await selected.selection.legalTargets()
      return 'ok' in answer ? { legalTargets: answer.ok } : answer
    },
    async displayList(input) {
      const selected = await selection(input.session)
      if (!('selection' in selected)) return selected
      const answer = await selected.selection.displayList()
      return 'ok' in answer ? { displayList: answer.ok } : answer
    },
    async effectiveModel(input) {
      const selected = await selection(input.session)
      if (!('selection' in selected)) return selected
      const answer = await selected.selection.effectiveModel()
      return 'ok' in answer ? { effectiveModel: answer.ok } : answer
    },
    async selectModel(input) {
      const selected = await selection(input.session)
      if (!('selection' in selected)) return selected
      return await selected.selection.selectModel(input.routeName)
    },
    readAttempts,
    async canDispatchAgain(input) {
      if (!validateLoop('RetryPlan', input.plan).valid) return malformed()
      input = Object.freeze({ ...input, session: input.session, callId: input.callId })
      return await withPrefix(input, (prefix, _binding) => {
        // RT12 S-100: an acknowledged call is its real terminal state (S-50⑥ alreadyEnded).
        const history = acknowledgedAsTerminal(construction.history.call(prefix, input.callId))
        const localView = construction.calls.find(input)?.view()
        const local = localResponsibility(input, localView)
        const state = projectCallState({
          session: input.session,
          callId: input.callId,
          history,
          ...(local === undefined ? {} : { local }),
        })
        const known = 'known' in history ? history.known : null
        const latest = known?.dispatches.at(-1)
        const latestFailure = latestFailureFact(latest)
        const result = dispatchGuard({
          session: input.session,
          callId: input.callId,
          call: guardCall(input, state),
          dispatches: guardDispatches(input, known, history),
          latestFailure,
          snapshot:
            latest === undefined ? { unknown: true } : { known: latest.record.profileSnapshot },
          plan: input.plan,
        })
        return guardResult(result)
      })
    },
  }

  return retainRuntimeProjection(
    {
      methods: Object.freeze(methods),
      close() {
        if (physical.closing !== undefined) return physical.closing
        physical.closed = true
        for (const source of physical.sources) source.release()
        for (const operation of physical.active) operation.stop()
        physical.closing = (async () => {
          try {
            await Promise.all([...physical.admissions])
            await Promise.all([...physical.active].map(item => item.done))
            await Promise.all([...physical.selectionLocks.values()])
            const ended = await Promise.all([
              ...[...physical.selections.values()].map(item => item.selection.close()),
              ...(ownCustody === undefined ? [] : [ownCustody.close()]),
            ])
            const result =
              ended.every(item => 'released' in item) &&
              physical.active.size === 0 &&
              !physical.readCleanupFailed
                ? ({ released: true } as const)
                : unavailable()
            if ('unavailable' in result) physical.closing = undefined
            return result
          } catch {
            physical.closing = undefined
            return unavailable()
          }
        })()
        return physical.closing
      },
    },
    (next: RuntimeConstruction<P, R>) => buildRuntimeReads(next, sharedCustody, physical),
  )
}
