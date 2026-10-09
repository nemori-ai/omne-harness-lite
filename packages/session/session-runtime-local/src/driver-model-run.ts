import type {
  SettlementRegistration,
  SettlementTask,
} from '@omne-harness-lite/model-request-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionLifecycleStep, StepCommit } from '@omne-harness-lite/session-runtime'
import { checkKey, type SourceToken } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { DriverRunStart } from './driver-run.ts'
import type { DriverTask } from './driver-tasks.ts'
import type { LocalSessionDriverOptions, SessionDriverRunSources } from './driver-types.ts'
import { createDriverModelSegment } from './driver-model.ts'
import {
  createSessionModelAttempt,
  createSessionModelObservations,
  type OriginalSessionModelWork,
  type SessionModelAttempt,
} from './model-attempt.ts'
import type { RetainedSessionModelTurn } from './model-turn.ts'

type Prepared = Extract<DriverRunStart, { kind: 'prepared' }>
type Inputs = Pick<LocalSessionDriverOptions, 'ingress' | 'identities' | 'model' | 'work'>

/** Takes responsibility for these original borrows before asynchronous Model construction. */
export function createDriverModelRunTask(input: {
  readonly options: Inputs
  readonly scope: SessionScope
  readonly prepared: Prepared
  readonly journal: BorrowedRunJournal
  readonly sources: SessionDriverRunSources
}): DriverTask {
  const task = new ModelRunTask(input)
  return Object.freeze({
    completion: Promise.resolve().then(() => task.run()),
    requestStop: task.requestStop,
    close: task.close,
  })
}

class ModelRunTask {
  readonly local = new AbortController()
  readonly ready = Promise.withResolvers<void>()
  token: ReturnType<Inputs['work']['begin']>
  segment: ReturnType<typeof createDriverModelSegment>
  reads: ReturnType<typeof createDriverReads>
  phase:
    | 'building'
    | 'driving'
    | 'original'
    | 'finishing'
    | 'returningModel'
    | 'returning'
    | 'retained'
    | 'released' = 'building'
  prepared: Prepared
  readonly tokens = new Set<ReturnType<Inputs['work']['begin']>>()
  readonly steps: {
    readonly source: SourceToken
    readonly step: SessionLifecycleStep
    readonly result: StepCommit
  }[] = []
  modelReturned = 0
  returningModel?: Promise<void>
  frame?: SessionModelAttempt
  original?: OriginalSessionModelWork
  readonly retained = new Set<RetainedSessionModelTurn>()
  finishing?: {
    readonly source: SourceToken
    readonly step: SessionLifecycleStep
    result?: StepCommit
  }
  driving?: ReturnType<SessionModelAttempt['drive']>
  returned = 0
  returning?: Promise<'released'>
  constructor(readonly input: Parameters<typeof createDriverModelRunTask>[0]) {
    const { options, scope, prepared, journal, sources } = input
    if (
      journal.scope.session !== scope.session ||
      !tenantIdEquals(journal.scope.tenant, scope.tenant) ||
      journal.run !== prepared.preparation.run
    )
      throw new TypeError('original Run journal required')
    this.prepared = prepared
    this.reads = createDriverReads(sources.selection)
    this.segment = createDriverModelSegment(
      options,
      scope,
      prepared,
      sources,
      () => !this.local.signal.aborted,
      async retained => {
        this.retained.add(retained)
      },
    )
    this.token = options.work.begin(scope, prepared.preparation)
    this.tokens.add(this.token)
  }
  requestStop = () => this.local.abort()
  async run(): Promise<'released' | 'retained'> {
    try {
      for (;;) {
        const result = await this.driveModel()
        if (result !== 'continue') return result
      }
    } catch (error) {
      if (this.phase !== 'returning' && this.phase !== 'returningModel') this.phase = 'retained'
      throw error
    } finally {
      this.ready.resolve()
    }
  }
  async driveModel(): Promise<'released' | 'retained' | 'continue'> {
    const built = await this.segment.build()
    if ('failure' in built) return this.hold()
    const { scope, sources } = this.input
    this.frame = createSessionModelAttempt({
      turn: built.turn,
      registration: this.reads.registration,
      current: createSessionModelObservations(built.turn, this.reads.registration, {
        scope,
        currentGeneration: sources.contextGeneration,
      }),
      transfer: async original => {
        if (this.original && this.original !== original)
          throw new Error('foreign original model work')
        this.original = original
        return 'retained'
      },
    })
    this.phase = 'driving'
    this.driving = this.frame.drive(this.local.signal)
    this.ready.resolve()
    const driven = await this.driving
    if (this.original) {
      this.phase = 'original'
      const original = await this.original.completion
      if (!('acknowledged' in original)) return this.hold()
    } else if (!('kind' in driven) || driven.kind !== 'committed') return this.hold()
    return await this.finish()
  }
  hold(): 'retained' {
    this.phase = 'retained'
    return 'retained'
  }
  async finish(): Promise<'released' | 'retained' | 'continue'> {
    this.phase = 'finishing'
    const { options, scope } = this.input
    const prepared = this.prepared
    const ingress = options.ingress
    const response = await ingress.modelResults.read(
      ingress.coordinationAuthority,
      scope,
      prepared.preparation.call,
      prepared.identities.resultKey,
    )
    if (
      !('pending' in response) ||
      response.pending.outcome !== 'complete' ||
      response.pending.reply.blocks.some(block => block.kind === 'tool_call')
    )
      return this.hold()
    const ended = await this.frame!.close()
    if (!('kind' in ended) || ended.kind !== 'released') return this.hold()
    // Only the original acknowledged turn reaches this point. Custody alone is not a stop proof.
    options.work.complete(this.token)
    this.phase = 'returningModel'
    await this.returnModel()
    const observed = await ingress.readWork(ingress.coordinationAuthority, scope, 1)
    if (!('kind' in observed)) return this.hold()
    const pending = observed.inputs[0]
    if (pending !== undefined) return this.continueInput(observed.source, pending)
    const step: SessionLifecycleStep = {
      kind: 'finish',
      stepKey: `${prepared.identities.prepareKey}:finish`,
      run: prepared.preparation.run,
      attempt: prepared.preparation.attempt,
      permit: prepared.preparation.permit,
      terminal: 'completed',
      reason: 'model_reply_complete',
    }
    this.finishing = { source: observed.source, step }
    const finished = await ingress.lifecycle.commitStep(
      ingress.coordinationAuthority,
      scope,
      observed.source,
      step,
    )
    this.finishing.result = finished
    if (!('kind' in finished) || finished.kind !== 'committed') return this.finishRefused(finished)
    this.phase = 'returning'
    return this.returnOriginal()
  }
  async finishRefused(result: StepCommit): Promise<'continue' | 'retained'> {
    if (!('failure' in result) || result.failure !== 'retryFromFacts') return this.hold()
    const { options, scope } = this.input
    const latest = await options.ingress.readWork(options.ingress.coordinationAuthority, scope, 1)
    if (!('kind' in latest) || latest.inputs[0] === undefined) return this.hold()
    // The refused finish made no commit. Read the new original input; never redispatch the old call.
    return this.continueInput(latest.source, latest.inputs[0])
  }
  returnModel() {
    this.returningModel ??= this.returnModelBorrows().catch(error => {
      delete this.returningModel
      throw error
    })
    return this.returningModel
  }
  async returnModelBorrows() {
    const returns = [this.reads.close, this.segment.release]
    while (this.modelReturned < returns.length) {
      await returns[this.modelReturned]!()
      this.modelReturned++
    }
  }
  async commitNext(source: SourceToken, step: SessionLifecycleStep) {
    if (this.local.signal.aborted) return undefined
    const { options, scope } = this.input
    const result = await options.ingress.lifecycle.commitStep(
      options.ingress.coordinationAuthority,
      scope,
      source,
      step,
    )
    this.steps.push({ source, step, result })
    return 'kind' in result && result.kind === 'committed' ? result : undefined
  }
  async continueInput(
    source: SourceToken,
    position: SourceToken['tail'],
  ): Promise<'continue' | 'retained'> {
    const { scope, options } = this.input
    const { preparation, identities } = this.prepared
    const adopted = await this.commitNext(source, {
      kind: 'adoptInput',
      stepKey: `${identities.prepareKey}:input:${position}`,
      run: preparation.run,
      attempt: preparation.attempt,
      permit: preparation.permit,
      inputPosition: position,
    })
    if (!adopted) return this.hold()
    if (this.local.signal.aborted) return this.hold()
    const next = Object.freeze({
      ...options.identities.model(
        scope,
        preparation.run,
        preparation.attempt,
        adopted.receipt.position,
      ),
    })
    if (!Object.values(next).every(checkKey))
      throw new TypeError('stable next original model identities required')
    const step = Object.freeze({
      kind: 'prepareCall' as const,
      stepKey: next.prepareKey,
      run: preparation.run,
      attempt: preparation.attempt,
      permit: preparation.permit,
      call: next.call,
      originalPosition: next.originalPosition,
    })
    const token = options.work.begin(scope, step)
    this.tokens.add(token)
    const prepared = await this.commitNext(adopted.source, step)
    if (!prepared) return this.hold()
    this.prepareModel(
      {
        kind: 'prepared',
        preparation: step,
        identities: next,
        source: prepared.source,
      },
      token,
    )
    return 'continue'
  }
  prepareModel(prepared: Prepared, token: ReturnType<Inputs['work']['begin']>) {
    const { options, scope, sources } = this.input
    this.prepared = prepared
    this.token = token
    this.reads = createDriverReads(sources.selection)
    this.segment = createDriverModelSegment(
      options,
      scope,
      prepared,
      sources,
      () => !this.local.signal.aborted,
      async retained => {
        this.retained.add(retained)
      },
    )
    delete this.original
    this.retained.clear()
    delete this.frame
    delete this.driving
    delete this.returningModel
    this.modelReturned = 0
    this.phase = 'building'
  }
  returnOriginal() {
    this.returning ??= this.returnBorrows().catch(error => {
      delete this.returning
      throw error
    })
    return this.returning
  }
  async returnBorrows(): Promise<'released'> {
    const { options, journal, sources } = this.input
    const returns = [() => this.returnModel(), sources.release, journal.close]
    while (this.returned < returns.length) {
      await returns[this.returned]!()
      this.returned++
    }
    for (const token of this.tokens) {
      options.work.release(token)
      this.tokens.delete(token)
    }
    this.phase = 'released'
    return 'released'
  }
  close = async (): Promise<'released' | 'pending'> => {
    this.requestStop()
    await this.ready.promise
    if (this.driving) await Promise.allSettled([this.driving])
    if (this.frame) await this.frame.close()
    await this.reads.close()
    if (this.phase === 'released') return 'released'
    if (this.phase === 'returning') return this.returnOriginal()
    if (this.phase === 'returningModel') {
      await this.returnModel()
      this.phase = 'retained'
    }
    return 'pending'
  }
}

/** Each full-prefix read borrows its actual owner slot and returns it only after actual stopped. */
export function createDriverReads(
  selection: Pick<SessionDriverRunSources['selection'], 'owner' | 'concurrent'>,
) {
  type Held = {
    readonly task: SettlementTask<unknown>
    readonly registration: SettlementRegistration
    returning?: Promise<void>
  }
  const held = new Set<Held>()
  const uncertain = new Set<{
    readonly registration: SettlementRegistration
    readonly error: unknown
  }>()
  let open = true
  function returnRead(original: Held) {
    original.returning ??= original.task.stopped
      .then(() => {
        original.registration.release()
        held.delete(original)
      })
      .catch(error => {
        delete original.returning
        throw error
      })
    return original.returning
  }
  const registration: SettlementRegistration = {
    start<T>(
      kind: Parameters<SettlementRegistration['start']>[0],
      operation: (signal: AbortSignal) => Promise<T>,
    ): SettlementTask<T> {
      if (!open || kind !== 'read') throw new TypeError('open driver read required')
      const borrowed = selection.owner.acquire(selection.concurrent)
      if (!('registration' in borrowed)) throw new Error('actual driver read owner unavailable')
      let task: SettlementTask<T>
      try {
        task = borrowed.registration.start(kind, operation)
      } catch (error) {
        // A defective starter might already have invoked the operation. No stop proof escaped.
        uncertain.add({ registration: borrowed.registration, error })
        throw error
      }
      const original: Held = { task, registration: borrowed.registration }
      held.add(original)
      const stopped = returnRead(original)
      return {
        completion: finishRead(task.completion, stopped),
        requestStop: task.requestStop,
        stopped,
      }
    },
    release() {
      if (held.size || uncertain.size) throw new Error('original driver read still held')
      open = false
    },
  }
  return {
    registration,
    close: async () => {
      open = false
      for (const original of held) original.task.requestStop()
      const results = await Promise.allSettled([...held].map(returnRead))
      const errors = [...uncertain].map(original => original.error)
      for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
      if (errors.length) throw new AggregateError(errors, 'original driver reads retained')
      registration.release()
    },
  }
}
async function finishRead<T>(completion: Promise<T>, stopped: Promise<void>): Promise<T> {
  const [completed, returned] = await Promise.allSettled([completion, stopped])
  if (returned.status === 'rejected') {
    if (completed.status === 'rejected')
      throw new AggregateError(
        [completed.reason, returned.reason],
        'driver read and original return failed',
      )
    throw returned.reason
  }
  if (completed.status === 'rejected') throw completed.reason
  return completed.value
}
