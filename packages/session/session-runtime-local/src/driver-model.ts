import { inspectToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { inspectRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger } from '@omne-harness-lite/session-log'
import type {
  OriginalIssueAdmission,
  OriginalIssueClaim,
  ModelCallHost,
  SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { createSessionRunModelBinding } from './model-binding.ts'
import type { SessionRunModelBinding } from './model-binding.ts'
import type { DriverRunStart } from './driver-run.ts'
import type { LocalSessionDriverOptions, SessionDriverRunSources } from './driver-types.ts'
import type { SessionModelTurnOptions } from './model-turn.ts'
import {
  persistDriverToolAdoption,
  readDriverToolAdoption,
  inspectSessionToolAdoption,
  sessionToolActionOwner,
} from './driver-tool-adoption.ts'
import { inspectActionBatch, sessionActionBatchOwner } from './driver-action-facts.ts'
import { DriverHistoryInvalid } from './driver-model-history.ts'
import type { SessionMessageProjections } from './message-projection.ts'

type Prepared = Extract<DriverRunStart, { kind: 'prepared' }>
type Inputs = Pick<LocalSessionDriverOptions, 'ingress' | 'identities' | 'model'>
type Failure = { readonly failure: 'unavailable' | 'denied' | 'invalidInput' }
export type DriverModelTurn = {
  readonly turn: SessionModelTurnOptions
  /** Call only after original work and applicable ACK have reliably stopped. */
  readonly release: () => Promise<void>
}

/** The task retains this object before build allocates any asynchronous borrow. */
export function createDriverModelSegment(
  options: Inputs,
  scope: SessionScope,
  prepared: Prepared,
  sources: SessionDriverRunSources,
  isOpen: () => boolean,
  retain: SessionModelTurnOptions['retain'],
  projections?: SessionMessageProjections,
): {
  readonly build: () => Promise<DriverModelTurn | Failure>
  readonly release: () => Promise<void>
} {
  if (
    sources.scope.session !== scope.session ||
    !tenantIdEquals(sources.scope.tenant, scope.tenant) ||
    sources.run !== prepared.preparation.run
  )
    throw new TypeError('actual original Run sources required')
  const segment = new ModelSegment(options, scope, prepared, sources, isOpen, retain, projections)
  return Object.freeze({ build: segment.build, release: segment.release })
}

class ModelSegment {
  linked?: SessionRunModelBinding
  readonly inputs: ReturnType<typeof scopedInputs>
  readonly callbacks = new Set<{ readonly close: Parameters<ModelCallHost['register']>[0] }>()
  readonly callSignal = new AbortController().signal
  closing = false
  issued = false
  building?: Promise<DriverModelTurn | Failure>
  closingBorrow?: Promise<void>
  returning?: Promise<void>
  constructor(
    readonly options: Inputs,
    readonly scope: SessionScope,
    readonly prepared: Prepared,
    readonly sources: SessionDriverRunSources,
    readonly isOpen: () => boolean,
    readonly retain: SessionModelTurnOptions['retain'],
    readonly projections?: SessionMessageProjections,
  ) {
    this.inputs = scopedInputs(sources.evaluation, options.model.maxCallReads)
  }
  available() {
    return !this.closing && (this.issued || this.isOpen())
  }
  readonly host: ModelCallHost = {
    signal: this.callSignal,
    stopping: () => !this.available(),
    register: close => {
      if (!this.available()) return { runtimeStopped: true }
      const original = Object.freeze({ close })
      this.callbacks.add(original)
      return { registration: { unregister: () => this.callbacks.delete(original) } }
    },
  }
  originalIssue(): OriginalIssueAdmission {
    return bindDriverOriginal({
      options: this.options,
      prepared: this.prepared,
      scope: this.scope,
      available: () => this.available(),
      retain: this.retain,
      launched: () => {
        this.issued = true
      },
    })
  }
  build = () => (this.building ??= this.create())
  async create(): Promise<DriverModelTurn | Failure> {
    if (this.closing || !this.isOpen()) return { failure: 'unavailable' }
    const { options, prepared, sources, scope } = this
    const acquired = await createSessionRunModelBinding({
      ingress: options.ingress,
      originalIssue: () => this.originalIssue(),
      scope,
      preparation: prepared.preparation,
      selection: sources.selection,
      providers: sources.providers,
      inputs: () => this.inputs,
      model: options.model.factory,
      host: {
        ...sources.host,
        identities: {
          ...options.identities.modelContent,
          call: () => prepared.identities.call,
        },
      },
      maxCallReads: options.model.maxCallReads,
    })
    if ('failure' in acquired) return acquired
    this.linked = acquired
    try {
      const turn = await this.describe()
      if ('failure' in turn) {
        this.closing = true
        await this.finishReturn()
        return turn
      }
      return Object.freeze({ turn, release: this.release })
    } catch (error) {
      try {
        this.closing = true
        await this.finishReturn()
      } catch (close) {
        throw new AggregateError([error, close], 'original model construction retained')
      }
      throw error
    }
  }
  async adoptedTable() {
    const { sources, scope, prepared } = this
    const preparation = prepared.preparation
    const original = await readDriverToolAdoption({
      scope,
      preparation,
      log: this.linked!.binding.log.log,
      parameters: sources.selection.evaluator?.parameters,
    })
    if (!('absent' in original)) return original
    const refreshed = await sources.registry.refreshAvailability(
      scope.session,
      { kind: 'start', runId: preparation.run },
      preparation.attempt,
    )
    if (!('report' in refreshed)) return { failure: 'unavailable' }
    const report = refreshed.report
    if (
      report.session !== scope.session ||
      report.runId !== preparation.run ||
      compareInteger(report.attempt, preparation.attempt) !== 0
    )
      throw new TypeError('actual original Run report required')
    const tools = await sources.registry.list(scope.session, 'tool', { kind: 'run', report })
    if (!('entries' in tools)) return { failure: 'unavailable' }
    if (!this.isOpen()) return { failure: 'unavailable' as const }
    const adoption = await persistDriverToolAdoption({
      scope,
      log: this.linked!.binding.log.log,
      preparation,
      report,
      entries: tools.entries,
      inputs: this.inputs,
      evaluator: this.sources.selection.evaluator,
    })
    return 'adoption' in adoption ? adoption : { failure: 'unavailable' as const }
  }
  async describe(): Promise<SessionModelTurnOptions | Failure> {
    const { sources, scope, prepared, options } = this
    if (this.closing || !this.isOpen()) return { failure: 'unavailable' }
    const adopted = await this.adoptedTable()
    if (!('adoption' in adopted)) return { failure: 'unavailable' }
    const { report, tools } = adopted.adoption
    const preparation = prepared.preparation
    const model = await this.linked!.operations.effectiveModel({ session: scope.session })
    if (!('effectiveModel' in model) || !this.isOpen()) return { failure: 'unavailable' }
    return Object.freeze<SessionModelTurnOptions>({
      ingress: options.ingress,
      scope,
      preparation,
      linked: this.linked!,
      source: options.model.results,
      projection: toolAdoptionProjection(scope, sources.projection, sources.selection.evaluator),
      ...(this.projections ? { projections: this.projections } : {}),
      resultKey: prepared.identities.resultKey,
      adoptionKey: prepared.identities.adoptionKey,
      call: {
        creationKey: prepared.identities.creationKey,
        report,
        target: model.effectiveModel.routeName,
        basis: model.effectiveModel,
        tools: tools.map(entry => entry.name),
        host: this.host,
      },
      settlement: {
        owner: sources.selection.owner,
        factory: {
          create: input =>
            options.model.settlement.create({
              ...input,
              owner: this.actualOwner(),
            }),
        },
      },
      retain: this.retain,
    })
  }
  actualOwner(): SettlementOwner {
    const source = this.options.model.executionSource()
    const found = source?.lookup({
      session: this.scope.session,
      callId: this.prepared.preparation.call,
    })
    if (
      !found ||
      !('execution' in found) ||
      found.execution.copyReleased ||
      found.execution.session.log !== this.linked!.binding.log
    )
      throw new TypeError('actual original physical model owner unavailable')
    return found.execution.owner
  }
  release = () => {
    this.closing = true
    this.closingBorrow ??= this.drain().finally(() => {
      delete this.closingBorrow
    })
    return this.closingBorrow
  }
  async drain() {
    if (this.building) await Promise.allSettled([this.building])
    await this.finishReturn()
  }
  finishReturn() {
    this.returning ??= this.returnOriginal().catch(error => {
      delete this.returning
      throw error
    })
    return this.returning
  }
  async returnOriginal() {
    for (const original of this.callbacks) {
      const ended = await original.close()
      if (!('released' in ended)) throw new Error('original model host callback retained')
      this.callbacks.delete(original)
    }
    await this.linked?.returnJournal()
  }
}

function toolAdoptionProjection(
  scope: SessionScope,
  projection: SessionDriverRunSources['projection'],
  evaluator: SessionDriverRunSources['selection']['evaluator'],
): SessionModelTurnOptions['projection'] {
  const factReaders = new Map(projection.options?.factReaders)
  factReaders.set(sessionToolActionOwner, (_value, entry) =>
    'adoption' in inspectSessionToolAdoption(scope, entry, evaluator?.parameters)
      ? 'valid'
      : 'invalid',
  )
  factReaders.set(sessionActionBatchOwner, (_value, entry) => {
    try {
      return inspectActionBatch({ scope }, entry) ? 'valid' : 'invalid'
    } catch (error) {
      if (error instanceof DriverHistoryInvalid) return 'invalid'
      throw error
    }
  })
  factReaders.set('tool-execution-runtime', (_value, entry) => {
    const inspected = inspectToolJournalEntry(scope, entry, evaluator?.parameters)
    return 'value' in inspected ? 'valid' : 'invalid'
  })
  factReaders.set('loop-extension-runner', (_value, entry) =>
    'conclusion' in inspectRunnerConclusion({ ...scope, entry }) ? 'valid' : 'invalid',
  )
  return { ...projection, options: { ...projection.options, factReaders } }
}

export function bindDriverOriginal(input: {
  readonly options: Pick<Inputs, 'ingress'> & { readonly model: Pick<Inputs['model'], 'original'> }
  readonly prepared: Pick<Prepared, 'preparation'>
  readonly scope: SessionScope
  readonly available: () => boolean
  readonly launched: () => void
  readonly retain: SessionModelTurnOptions['retain']
}): OriginalIssueAdmission {
  const claims = new WeakSet<OriginalIssueClaim>()
  const { options, prepared, scope, available, launched, retain } = input
  return Object.freeze({
    admitOriginal: async input => {
      if (!available()) return { kind: 'unavailable' }
      const preparedJob = options.model.original.prepareOriginal(input)
      if ('kind' in preparedJob) return preparedJob
      const issued = await options.ingress.modelInvocation.admit(
        options.ingress.coordinationAuthority,
        scope,
        input.source,
        prepared.preparation,
        preparedJob.job,
      )
      if ('failure' in issued) {
        if (issued.failure === 'retryFromFacts') return { kind: 'conflict' }
        if (issued.failure === 'terminal') return { kind: 'staleAttempt' }
        return { kind: issued.failure }
      }
      if (issued.kind === 'unknownCommit') {
        await retain({ stage: 'originalIssue', reason: issued })
        return { kind: 'unavailable' }
      }
      if (issued.kind === 'alreadyIssued') return { kind: 'conflict' }
      if (issued.kind !== 'issued') return issued
      claims.add(issued.claim)
      return { confirmed: true, positions: issued.positions, claim: issued.claim }
    },
    consumeOriginal: async claim => {
      if (!claims.has(claim)) return { kind: 'invalidInput' }
      if (!available()) return { kind: 'unavailable' }
      const outcome = await options.model.original.consumeOriginal(claim)
      if (outcome.kind === 'launch') launched()
      return outcome
    },
  } satisfies OriginalIssueAdmission)
}

function scopedInputs(source: CurrentEvaluationInputs, limit: number) {
  const active = new Set<Promise<unknown>>()
  let open = true
  return Object.freeze({
    async read(session: unknown, tenant: unknown) {
      if (!open || active.size >= limit) return { failure: 'unavailable' as const }
      const reading = source.read(session, tenant)
      active.add(reading)
      try {
        return await reading
      } finally {
        active.delete(reading)
      }
    },
    async close() {
      open = false
      const ends = await Promise.allSettled([...active])
      const failed = ends.flatMap(end => (end.status === 'rejected' ? [end.reason] : []))
      if (failed.length) throw new AggregateError(failed, 'original evaluation reads retained')
    },
  })
}
