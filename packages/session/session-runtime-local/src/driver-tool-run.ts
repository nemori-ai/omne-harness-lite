import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger, checkKey, type SourceToken } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { FinalAction } from '@omne-harness-lite/tool-admission'
import type { SessionLifecycleStep, StepCommit } from '@omne-harness-lite/session-runtime'
import {
  prepareToolJournalEntry,
  projectToolJournal,
  type ExecutionSubmission,
  type ToolOriginalIssueParticipant,
  type ToolOriginalIssueClaim,
  type ToolOriginalIssueSupport,
  type ToolTerminalRecord,
} from '@omne-harness-lite/tool-execution-runtime'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type {
  LocalSessionDriverOptions,
  SessionDriverRunSources,
  SessionDriverToolBorrow,
  SessionDriverWorkToken,
} from './driver-types.ts'
import type {
  ToolResultInput,
  ToolResultStored,
  LocalToolResultCustody,
  ToolDeliveryInput,
  LocalToolResultDelivery,
} from './tool-result-types.ts'
import { deliverDriverToolWork } from './driver-tool-delivery.ts'
import { publishDriverActionBatch } from './driver-action-batch.ts'
import { inspectActionBatch } from './driver-action-facts.ts'
import { readDriverToolBatch, type DriverToolBatch } from './driver-tool-source.ts'
import { DriverHistoryInvalid, requireHistory } from './driver-model-history.ts'
import { prepareDriverToolRequest, type DriverToolResolution } from './driver-tool-request.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
type Inputs = Pick<LocalSessionDriverOptions, 'ingress' | 'identities' | 'tools' | 'work'>
type Input = {
  readonly options: Inputs
  readonly scope: SessionScope
  readonly journal: BorrowedRunJournal
  readonly sources: Pick<SessionDriverRunSources, 'toolAccess' | 'actions'>
  readonly message: string
  readonly permit: Preparation['permit']
  readonly signal: AbortSignal
}
export interface DriverToolWork {
  readonly request: ExecutionSubmission
  readonly resolution: DriverToolResolution
  readonly preparation: Preparation
  readonly identities: ReturnType<Inputs['identities']['tool']>
  readonly token: SessionDriverWorkToken
  prepared?: StepCommit
  participant?: ToolOriginalIssueParticipant
  terminal?: ToolTerminalRecord
  source?: SourceToken
  stopped: boolean
  stopFailure?: { readonly error: unknown }
  custodyInput?: ToolResultInput
  custodyResult?: Awaited<ReturnType<LocalToolResultCustody['store']>>
  custody?: ToolResultStored
  deliveryInput?: ToolDeliveryInput
  deliveryResult?: Awaited<ReturnType<LocalToolResultDelivery['confirm']>>
}

/** Holds the actual native participant before its first admission; result and stopped remain separate. */
export function createDriverToolRun(input: Input) {
  const run = new ToolRun(input)
  return {
    completion: Promise.resolve().then(() => run.drive()),
    work: run.work as readonly DriverToolWork[],
    close: run.close,
  }
}
class ToolRun {
  readonly work: DriverToolWork[] = []
  readonly claims = new WeakMap<ToolOriginalIssueClaim, DriverToolWork>()
  open = true
  borrowed?: SessionDriverToolBorrow
  acquiring = false
  acquisitionUnconfirmed = false
  driving = true
  returning?: Promise<void>
  constructor(readonly input: Input) {
    if (
      input.journal.scope.session !== input.scope.session ||
      !tenantIdEquals(input.journal.scope.tenant, input.scope.tenant)
    )
      throw new TypeError('original Tool Run journal required')
  }
  available = () => this.open && !this.input.signal.aborted
  async drive(): Promise<'ended' | 'retained'> {
    try {
      if (!this.available() || !(await this.acquire())) return 'retained'
      const selected = await this.selectedBatch()
      if (!selected) return 'retained'
      const { published, found, record } = selected
      for (const item of published.completion.items) {
        if (!this.available()) return 'retained'
        const admission = published.admissions.find(value => value.callId === item.callId)
        const work = this.prepareItem(
          item,
          found.batch,
          record[0]!.entry.position,
          admission?.token,
        )
        if (!work) return 'retained'
        this.work.push(work)
        if (!(await this.executeAndDeliver(work))) return 'retained'
      }
      return 'ended'
    } catch (error) {
      if (error instanceof DriverHistoryInvalid) return 'retained'
      throw error
    } finally {
      this.driving = false
    }
  }
  prepareItem(
    item: FinalAction,
    batch: DriverToolBatch,
    position: SourceToken['tail'],
    token: ExecutionSubmission['admissionToken'],
  ) {
    const request: ExecutionSubmission = {
      scope: this.input.scope,
      access: this.input.sources.toolAccess,
      origin: batch.origin,
      adoption: batch.adoption.key,
      call: item.effectiveCall,
      ...(token === undefined ? {} : { admissionToken: token }),
    }
    const adopted = batch.adoption.adoption.tools.find(tool => tool.name === request.call.tool)
    if (item.decision.kind === 'notExecutable')
      return this.prepareWork(request, position, { notExecutable: item.decision.reason })
    if (!adopted) return
    const { capability, asset, version, definition } = adopted
    return this.prepareWork(request, position, {
      selected: { capability, asset, version, definition, adoption: request.adoption },
    })
  }
  async executeAndDeliver(work: DriverToolWork) {
    if (!(await this.execute(work))) return false
    const delivered = await deliverDriverToolWork({
      ...this.input,
      ingress: this.input.options.ingress,
      runner: this.input.sources.actions.runner,
      work,
    })
    return (
      'kind' in delivered &&
      (delivered.kind === 'confirmed' || delivered.kind === 'alreadyConfirmed')
    )
  }
  async selectedBatch() {
    const published = await publishDriverActionBatch({
      journal: this.input.journal,
      message: this.input.message,
      actions: this.input.sources.actions,
      signal: this.input.signal,
    })
    if (published.kind !== 'complete' || !this.available()) return undefined
    const prefix = await this.prefix()
    const found = readDriverToolBatch(prefix, this.input.message)
    requireHistory(found.kind === 'batch', 'actual original Tool batch required')
    const record = prefix.entries.flatMap(entry => {
      const record = inspectActionBatch(prefix, entry)
      return record?.value.origin.assistantMessage === this.input.message ? [record] : []
    })
    requireHistory(
      record.length === 1 && equal(record[0]!.value.completion, published.completion),
      'actual completed Tool batch required',
    )
    if (published.completion.items.some(item => item.decision.kind === 'denied')) return undefined
    return { published, found, record }
  }
  async prefix() {
    const read = await this.input.journal.readPrefix()
    requireHistory(!('failure' in read), 'actual original Tool prefix unavailable')
    return {
      scope: this.input.scope,
      ownerGeneration: read.source.journalGeneration,
      entries: read.entries,
      tail: read.tail,
      source: read.source,
    }
  }
  async acquire() {
    const { options, scope } = this.input
    const support = await options.ingress.toolInvocation.support(
      options.ingress.coordinationAuthority,
    )
    if ('unavailable' in support || !this.available()) return false
    this.acquiring = true
    this.acquisitionUnconfirmed = true
    try {
      const borrowed = await options.tools.acquire(this.watch(support))
      this.acquisitionUnconfirmed = false
      if ('unavailable' in borrowed) return false
      this.borrowed = borrowed
      if (!tenantIdEquals(scope.tenant, borrowed.tenant))
        throw new TypeError('original Tool tenant required')
      await borrowed.runtime.ready
      return this.available()
    } finally {
      this.acquiring = false
    }
  }
  watch(support: ToolOriginalIssueSupport): ToolOriginalIssueSupport {
    return Object.freeze<ToolOriginalIssueSupport>({
      ...support,
      admission: {
        admitOriginal: async participant => {
          const work = this.work.find(work => matches(work, participant))
          if (!work || !this.available()) return { kind: 'denied' }
          if (work.participant && work.participant !== participant) return { kind: 'conflict' }
          if (!work.participant) {
            work.participant = participant
            void participant.stopped.then(
              () => {
                work.stopped = true
              },
              error => {
                work.stopFailure = { error }
              },
            )
          }
          const issued = await support.admission.admitOriginal(participant)
          if (issued.kind === 'issued') this.claims.set(issued.claim, work)
          return issued
        },
        consumeOriginal: claim => {
          const work = this.claims.get(claim)
          return work && this.available()
            ? support.admission.consumeOriginal(claim)
            : Promise.resolve({ kind: 'denied' as const })
        },
      },
    })
  }
  prepareWork(
    request: ExecutionSubmission,
    position: SourceToken['tail'],
    resolution: DriverToolResolution,
  ): DriverToolWork {
    const { scope, options, permit } = this.input
    const identities = Object.freeze({
      ...options.identities.tool(
        scope,
        request.origin.run,
        request.origin.attempt,
        position,
        request.call.callId,
      ),
    })
    const intended = prepareToolJournalEntry({
      origin: request.origin,
      value: {
        kind: 'execution_intended',
        revision: 1,
        ref: { ...scope, callId: request.call.callId },
        origin: request.origin,
        input: {},
      },
    })
    requireHistory(
      Object.values(identities).every(checkKey) &&
        'entry' in intended &&
        identities.originalPosition === intended.entry.dedupeKey,
      'stable original native Tool identities required',
    )
    const preparation: Preparation = Object.freeze({
      kind: 'prepareCall',
      stepKey: identities.prepareKey,
      run: request.origin.run,
      attempt: request.origin.attempt,
      permit,
      call: request.call.callId,
      originalPosition: identities.originalPosition,
    })
    const token = options.work.begin(scope, preparation)
    return { request, resolution, preparation, identities, token, stopped: false }
  }
  async execute(work: DriverToolWork) {
    const { options, scope } = this.input
    const current = await this.prefix()
    if (!this.available()) return false
    work.prepared = await options.ingress.lifecycle.commitStep(
      options.ingress.coordinationAuthority,
      scope,
      current.source,
      work.preparation,
    )
    if (!('kind' in work.prepared) || work.prepared.kind !== 'committed' || !this.available())
      return false
    const submitted = await this.submitPrepared(work)
    if (!submitted || !('execution' in submitted) || !work.participant) return false
    requireHistory(
      equal(submitted.execution, work.participant.identity.ref),
      'foreign original Tool execution',
    )
    return this.observeResult(work, work.participant)
  }
  async observeResult(work: DriverToolWork, participant: ToolOriginalIssueParticipant) {
    const observed = await this.borrowed!.runtime.operations.acquire(
      work.request.access,
      participant.identity.ref,
    )
    if (observed.kind !== 'acquired') return false
    try {
      const ended = await observed.observer.waitForEnd()
      if (ended.kind !== 'found' || ended.snapshot.state.phase !== 'ended') return false
      await participant.stopped
      return await this.retainResult(work, participant)
    } finally {
      observed.observer.release()
    }
  }
  async submitPrepared(work: DriverToolWork) {
    const source = await this.prefix()
    const prepared = await prepareDriverToolRequest({
      request: work.request,
      ...work.resolution,
      source: source.source,
      host: this.input.sources.actions.host,
      signal: this.input.signal,
    })
    if (!prepared || !this.available()) return
    return this.borrowed!.runtime.operations.submit(prepared)
  }
  async retainResult(work: DriverToolWork, participant: ToolOriginalIssueParticipant) {
    if (!(await this.readTerminal(work, participant))) return false
    return await this.storeResult(work)
  }
  async readTerminal(work: DriverToolWork, participant: ToolOriginalIssueParticipant) {
    const { scope } = this.input
    const current = await this.prefix()
    const history = projectToolJournal(scope, current.entries)
    requireHistory('executions' in history, 'invalid actual native Tool history')
    const execution = history.executions.get(work.request.call.callId)
    requireHistory(
      execution?.terminal !== undefined &&
        execution.intent.key === participant.identity.originalPosition &&
        equal(execution.intent.value.origin, work.request.origin),
      'original native Tool terminal required',
    )
    work.terminal = execution.terminal
    work.source = current.source
    return true
  }
  async storeResult(work: DriverToolWork) {
    const { options, scope } = this.input
    requireHistory(
      work.terminal !== undefined && work.participant !== undefined,
      'original stopped Tool result required',
    )
    const current = await this.prefix()
    const input: ToolResultInput = Object.freeze({
      original: work.participant.identity,
      terminal: work.terminal,
      source: current.source,
      resultKey: work.identities.resultKey,
    })
    work.custodyInput = input
    const result = await options.ingress.toolResults.store(
      options.ingress.coordinationAuthority,
      scope,
      input,
    )
    work.custodyResult = result
    if (!('witness' in result)) return false
    work.custody = result
    return true
  }
  close = async (): Promise<'released' | 'pending'> => {
    this.open = false
    const failures = this.work.flatMap(work => (work.stopFailure ? [work.stopFailure.error] : []))
    if (failures.length) throw new AggregateError(failures, 'original Tool stop failed')
    if (
      this.acquiring ||
      this.acquisitionUnconfirmed ||
      this.driving ||
      this.work.some(work => !work.stopped || !work.terminal)
    )
      return 'pending'
    this.returning ??= Promise.resolve()
      .then(() => this.borrowed?.release())
      .catch(error => {
        delete this.returning
        throw error
      })
    await this.returning
    return 'released'
  }
}
function matches(work: DriverToolWork, participant: ToolOriginalIssueParticipant) {
  const identity = participant.identity
  return (
    tenantIdEquals(identity.ref.tenant, work.request.scope.tenant) &&
    identity.ref.session === work.request.scope.session &&
    identity.ref.callId === work.request.call.callId &&
    equal(identity.origin, work.request.origin) &&
    identity.adoption === work.request.adoption &&
    identity.originalPosition === work.identities.originalPosition &&
    compareInteger(identity.origin.attempt, work.preparation.attempt) === 0
  )
}
