import { parseOpaqueIdentifier, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { validate as validateLoop } from '@omne-harness-lite/loop-extension'
import { createSessionModelSelection } from './session-selection.ts'
import { projectCallState, type LocalCallResponsibility } from './call-state.ts'
import { dispatchGuard, type DispatchGuardFact } from './dispatch-guard.ts'
import { createModelFailureSource, readFailureSubject } from './failure-subject.ts'
import { readSettlementPrefix, type SettlementPrefix } from './settlement-prefix.ts'
import type {
  SessionModelSelection,
  SessionModelSelectionInput,
} from './session-selection-types.ts'
import type {
  CallKey,
  ModelRuntimeService,
  RuntimeCloseResult,
  RuntimeConstruction,
  SessionRuntimeBinding,
  ReadAttemptsResult,
  FailureConsumption,
  ModelFailureSource,
} from './service-types.ts'
import type { SettlementRegistration, SettlementTask } from './settlement-types.ts'
import type { PlannedSemantics } from './types.ts'

type ReadMethods = Pick<
  ModelRuntimeService,
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
function sameSelection(a: SessionModelSelectionInput, b: SessionModelSelectionInput): boolean {
  return (
    a.binding.session === b.binding.session &&
    tenantIdEquals(a.binding.tenant, b.binding.tenant) &&
    a.binding.generation === b.binding.generation &&
    a.binding.log === b.binding.log &&
    a.binding.currentGeneration === b.binding.currentGeneration &&
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

/** Owns selection writers and read registrations until their actual work stops. */
export function createRuntimeReads<P extends PlannedSemantics, R>(
  construction: RuntimeConstruction<P, R>,
): { readonly methods: ReadMethods; readonly close: () => Promise<RuntimeCloseResult> } {
  const selections = new Map<string, ReadOwner>()
  const selectionLocks = new Map<string, Promise<void>>()
  const active = new Set<{
    readonly tasks: Set<SettlementTask<unknown>>
    readonly done: Promise<void>
    readonly stop: () => void
  }>()
  const sources = new Set<ModelFailureSource>()
  let closed = false
  let readCleanupFailed = false
  let closing: Promise<RuntimeCloseResult> | undefined

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
    if (closed) return unavailable()
    const bound = await bind(session)
    if (!('binding' in bound)) return bound
    const next = bound.binding.selection
    const key = next.binding.session
    const preceding = selectionLocks.get(key)
    let release = () => {}
    const locked = new Promise<void>(resolve => {
      release = resolve
    })
    selectionLocks.set(key, locked)
    if (preceding !== undefined) await preceding
    try {
      if (closed) return unavailable()
      const previous = selections.get(key)
      if (previous !== undefined) {
        if (sameSelection(previous.input, next)) return { selection: previous.selection }
        const ended = await previous.selection.close()
        if (!('released' in ended)) return unavailable()
        selections.delete(key)
      }
      const created = createSessionModelSelection(next)
      selections.set(key, { input: next, selection: created })
      return { selection: created }
    } catch {
      return unavailable()
    } finally {
      if (selectionLocks.get(key) === locked) selectionLocks.delete(key)
      release()
    }
  }

  async function withPrefix<T>(
    input: CallKey,
    work: (prefix: SettlementPrefix, binding: SessionRuntimeBinding) => T,
  ): Promise<T | ReturnType<typeof unavailable> | ReturnType<typeof malformed>> {
    if (!validCall(input)) return malformed()
    const bound = await bind(input.session)
    if (!('binding' in bound)) return bound
    if (closed) return unavailable()
    const { binding } = bound
    const owner = binding.selection.owner
    let acquired: ReturnType<typeof owner.acquire>
    try {
      if (owner.admission() !== 'open') return unavailable()
      acquired = owner.acquire(binding.selection.concurrent)
    } catch {
      return unavailable()
    }
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
            readCleanupFailed = true
          }
        }
      },
    }
    active.add(operation)
    let result: T | ReturnType<typeof unavailable> = unavailable()
    try {
      if (!closed) {
        const read = await readSettlementPrefix({ binding: binding.log, registration })
        if ('prefix' in read && !closed) result = work(read.prefix, binding)
      }
    } catch {
      result = unavailable()
    } finally {
      const stopped = await Promise.all(
        [...tasks].map(task =>
          task.stopped.then(
            () => true,
            () => false,
          ),
        ),
      )
      if (stopped.every(Boolean)) {
        try {
          registration.release()
          active.delete(operation)
        } catch {
          readCleanupFailed = true
          result = unavailable()
        }
      } else {
        readCleanupFailed = true
        result = unavailable()
      }
      finish()
    }
    return result
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
    let createdSource: ModelFailureSource | undefined
    const read = await withPrefix(input, (prefix, binding) => {
      const history = construction.history.call(prefix, input.callId)
      const localView = construction.calls.find(input)?.view()
      const local: LocalCallResponsibility | undefined =
        localView?.operation.phase === 'ready'
          ? { session: input.session, callId: input.callId, phase: 'open' }
          : localView?.operation.phase === 'reply_pending'
            ? {
                session: input.session,
                callId: input.callId,
                phase: 'reply_pending',
                responseId: localView.operation.pending.id,
              }
            : undefined
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
      if (state.phase === 'awaiting_decision') {
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
        const source = createModelFailureSource({
          prefix,
          owner: binding.selection.owner,
          subject: subject.subject,
          usable: () =>
            !closed &&
            !localView?.request.host.stopping() &&
            !localView?.request.host.signal.aborted,
          retain: value => {
            sources.add(value)
          },
          forget: value => {
            sources.delete(value)
          },
        })
        if (source === null) return { result: unavailable() }
        createdSource = source
        return { result, source }
      }
      return { result: { state: state.phase, dispatches } }
    })
    if (!('result' in read)) {
      createdSource?.release()
      return requested ? { result: read, consumption: { kind: 'notApplicable' } } : read
    }
    const result: ReadAttemptsResult = read.result
    if (!requested) return result
    return 'source' in read
      ? { result, consumption: { kind: 'failure', source: read.source } }
      : { result, consumption: { kind: 'notApplicable' } }
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
      return await withPrefix(input, (prefix, _binding) => {
        const history = construction.history.call(prefix, input.callId)
        const localView = construction.calls.find(input)?.view()
        const local: LocalCallResponsibility | undefined =
          localView?.operation.phase === 'ready'
            ? { session: input.session, callId: input.callId, phase: 'open' }
            : localView?.operation.phase === 'reply_pending'
              ? {
                  session: input.session,
                  callId: input.callId,
                  phase: 'reply_pending',
                  responseId: localView.operation.pending.id,
                }
              : undefined
        const state = projectCallState({
          session: input.session,
          callId: input.callId,
          history,
          ...(local === undefined ? {} : { local }),
        })
        const known = 'known' in history ? history.known : null
        const latest = known?.dispatches.at(-1)
        const value = latest?.response?.value
        const failure =
          value !== null && typeof value === 'object' && !Array.isArray(value) && 'failure' in value
            ? value.failure
            : undefined
        const latestFailure: DispatchGuardFact<unknown> =
          typeof failure === 'object' && failure !== null && 'cause' in failure
            ? { known: failure.cause }
            : { unknown: true }
        const result = dispatchGuard({
          session: input.session,
          callId: input.callId,
          call:
            'unavailable' in state
              ? { unknown: true }
              : 'callNotFound' in state
                ? { known: null }
                : {
                    known: {
                      session: input.session,
                      callId: input.callId,
                      phase: { known: state.phase },
                    },
                  },
          dispatches:
            known === null && !('absent' in history)
              ? { unknown: true }
              : {
                  known: {
                    session: input.session,
                    callId: input.callId,
                    opened: known?.dispatches.map(item => ({ known: item.opened !== null })) ?? [],
                  },
                },
          latestFailure,
          snapshot:
            latest === undefined ? { unknown: true } : { known: latest.record.profileSnapshot },
          plan: input.plan,
        })
        if ('allowed' in result) return result
        if ('refused' in result) return result
        if (result.rejected === 'wrongPhase') return { wrongPhase: { phase: result.phase } }
        if (result.rejected === 'invalidInput') return malformed()
        if (result.rejected === 'callNotFound') return { callNotFound: true }
        if (result.rejected === 'alreadyEnded') return { alreadyEnded: true }
        return unavailable()
      })
    },
  }

  return {
    methods: Object.freeze(methods),
    close() {
      if (closing !== undefined) return closing
      closed = true
      for (const source of sources) source.release()
      for (const operation of active) operation.stop()
      closing = (async () => {
        try {
          await Promise.all([...active].map(item => item.done))
          await Promise.all([...selectionLocks.values()])
          const ended = await Promise.all(
            [...selections.values()].map(item => item.selection.close()),
          )
          const result =
            ended.every(item => 'released' in item) && active.size === 0 && !readCleanupFailed
              ? ({ released: true } as const)
              : unavailable()
          if ('unavailable' in result) closing = undefined
          return result
        } catch {
          closing = undefined
          return unavailable()
        }
      })()
      return closing
    },
  }
}
