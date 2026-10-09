import { randomUUID } from 'node:crypto'
import { StorageDefect, StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  sessionFactPayload,
  attemptStartedPayload,
  type SessionStateChange,
  type SessionStateStage,
  type SessionHead,
  type StepCommit,
  type StepReceipt,
} from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  SourceToken,
  LogEntryInput,
  SessionLogParticipant,
} from '@omne-harness-lite/session-log'
import type { RuntimeOptions, LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
import type { createLocalSessionState } from './state-participant.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { AdmissionTicket } from './admission-types.ts'
import { AdmissionFailure } from './admission-types.ts'
import { InvalidStateInput, positionText } from './state-values.ts'
import { pendingPosition } from './state-store.ts'
import { RuntimeRejection } from './runtime-values.ts'
import { lifecycleInput, CoordinationRejection, usableSource } from './coordination-values.ts'
import { grantRun, readStep, saveStep, saveCallPreparation } from './coordination-store.ts'

import { adoptModelResultIn, type ResultAdoptionHost } from './result-adoption.ts'

interface Host extends ResultAdoptionHost {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly log: SessionLogParticipant
  readonly member: <T>(work: (unit: StorageUnit) => Promise<T>) => Promise<T>
  readonly head: (unit: StorageUnit, scope: SessionScope) => Promise<SessionHead | null>
  readonly append: (
    unit: StorageUnit,
    scope: SessionScope,
    entries: readonly LogEntryInput[],
  ) => Promise<{ readonly entries: readonly { readonly position: StepReceipt['position'] }[] }>
  readonly instant: () => Promise<string>
}
export function createSessionLifecycle(host: Host): LocalSessionIngress['lifecycle'] {
  const coordinator = new Lifecycle(host)
  return Object.freeze({ commitStep: coordinator.commitStep })
}
class Lifecycle {
  constructor(readonly host: Host) {}
  commitStep: LocalSessionIngress['lifecycle']['commitStep'] = async (
    authority,
    requested,
    expected,
    candidate,
  ) => {
    if (authority !== this.host.authority.coordination) return { failure: 'denied' }
    try {
      const input = lifecycleInput(
        requested,
        expected,
        candidate,
        this.host.options.policy.maxRecordBytes,
      )
      const scope = input.scope
      if (!tenantIdEquals(scope.tenant, this.host.options.tenant)) return { failure: 'denied' }
      return await this.commit(input)
    } catch (error) {
      return this.failure(error)
    }
  }
  failure(error: unknown): Extract<StepCommit, { failure: string }> {
    if (error instanceof StorageUnavailable) return { failure: 'unavailable' }
    if (error instanceof CoordinationRejection) return { failure: error.failure }
    if (error instanceof InvalidStateInput) return { failure: 'invalidInput' }
    if (error instanceof AdmissionFailure && error.reason === 'denied') return { failure: 'denied' }
    if (error instanceof RuntimeRejection)
      return { failure: error.failure === 'denied' ? 'denied' : 'unavailable' }
    throw error
  }
  async commit(input: ReturnType<typeof lifecycleInput>): Promise<StepCommit> {
    const { scope, source, step, semantic } = input
    const original = await this.host.options.storage.atomic(unit =>
      unit.run(async () => {
        const receipt = await readStep(unit, scope, step.stepKey, semantic, this.host.options)
        if (!receipt) return undefined
        return this.host.authority.withinRun(unit, scope, receipt.run!, async () => {
          usableSource(await this.source(unit, scope), source)
          return this.committed(receipt, null)
        })
      }),
    )
    if (original) return original
    if (step.kind === 'startRun') return this.startRun(input)
    try {
      return await this.host.options.storage.atomic(unit =>
        unit.run(() =>
          this.host.authority.withinRun(unit, scope, step.run, async () => {
            const previous = await readStep(unit, scope, step.stepKey, semantic, this.host.options)
            if (previous) return this.committed(previous, null)
            usableSource(await this.source(unit, scope), source)
            const head = await this.currentHead(unit, scope)
            if (!head.run || head.run.id !== step.run)
              throw new CoordinationRejection('retryFromFacts')
            if (['completed', 'failed', 'cancelled'].includes(head.run.state))
              throw new CoordinationRejection('terminal')
            return this.advance(unit, scope, head, step, semantic)
          }),
        ),
      )
    } catch (error) {
      if (error instanceof StorageUnavailable)
        return { kind: 'unknownCommit', scope, stepKey: step.stepKey }
      throw error
    }
  }
  async source(unit: StorageUnit, scope: SessionScope) {
    const result = await this.host.log.sourceIn(unit, this.host.authority.logAccess, scope)
    if ('failure' in result) throw new CoordinationRejection(result.failure)
    return result.source
  }
  async currentHead(unit: StorageUnit, scope: SessionScope) {
    const head = await this.host.head(unit, scope)
    if (!head || head.lifecycle !== 'active') throw new CoordinationRejection('retryFromFacts')
    return head
  }
  async startRun(input: ReturnType<typeof lifecycleInput>): Promise<StepCommit> {
    const { scope, source, step, semantic } = input
    if (step.kind !== 'startRun') throw new InvalidStateInput()
    await this.host.member(async unit => {
      usableSource(await this.source(unit, scope), source)
      const head = await this.currentHead(unit, scope)
      await this.initialInput(unit, scope, head, step.inputPosition)
    })
    const ticket = await this.admitRun(scope, step)
    const consumed = await this.consumeRun(input, ticket.ticket)
    if (consumed.kind === 'unknownCommit')
      return { kind: 'unknownCommit', scope, stepKey: step.stepKey }
    if (consumed.kind !== 'consumed') throw new CoordinationRejection('unavailable')
    try {
      const receipt = await this.host.options.storage.atomic(unit =>
        unit.run(() => readStep(unit, scope, step.stepKey, semantic, this.host.options)),
      )
      if (!receipt) throw new StorageDefect('committed Run missing original receipt')
      return this.committed(receipt, null)
    } catch (error) {
      if (error instanceof StorageUnavailable)
        return { kind: 'unknownCommit', scope, stepKey: step.stepKey }
      throw error
    }
  }
  async admitRun(scope: SessionScope, step: Extract<SessionLifecycleStep, { kind: 'startRun' }>) {
    const ticket = await this.host.options.admission.reserve(this.host.options.source, {
      tenant: scope.tenant,
      session: scope.session,
      purpose: 'startRun',
      operationKey: step.stepKey,
      inputPosition: positionText(step.inputPosition, this.host.options.policy.maxRecordBytes),
    })
    const checked = await this.host.options.admission.query(ticket.ticket)
    if (checked.state !== 'ready' && checked.state !== 'consumed')
      throw new CoordinationRejection(
        checked.state === 'rejected' || checked.state === 'memberRejected'
          ? 'denied'
          : 'unavailable',
      )
    return ticket
  }
  async consumeRun(input: ReturnType<typeof lifecycleInput>, ticket: AdmissionTicket) {
    const { scope, step, semantic } = input
    try {
      return await this.host.options.admission.consume(
        ticket,
        this.host.options.storage,
        (unit, guard) =>
          this.host.authority.within(unit, guard, async () => {
            const previous = await readStep(unit, scope, step.stepKey, semantic, this.host.options)
            if (!previous) await this.stageRun(unit, input, ticket)
            return step.stepKey
          }),
      )
    } catch (error) {
      if (!(error instanceof CoordinationRejection) && !(error instanceof RuntimeRejection))
        throw error
      // The tenant transaction has ended. Abandon still establishes actual quiescence under root order.
      const ended = await this.host.options.admission.abandon(ticket, this.host.options.storage)
      if (ended.kind === 'notUsed') throw error
      return ended
    }
  }
  async stageRun(
    unit: StorageUnit,
    input: ReturnType<typeof lifecycleInput>,
    ticket: AdmissionTicket,
  ) {
    const { scope, source, step, semantic } = input
    if (step.kind !== 'startRun') throw new InvalidStateInput()
    usableSource(await this.source(unit, scope), source)
    const head = await this.currentHead(unit, scope),
      run = `run:${randomUUID()}`
    await this.initialInput(unit, scope, head, step.inputPosition)
    this.requireStage(
      await this.host.state.participant.stageIn(
        unit,
        this.host.authority.coordination,
        scope,
        head.revision,
        { kind: 'startRun', stepKey: step.stepKey, run, position: step.inputPosition },
      ),
    )
    this.requireStage(
      await this.host.state.adoptInitialIn(
        unit,
        this.host.authority.coordination,
        scope,
        run,
        step.inputPosition,
      ),
    )
    await grantRun(unit, scope, run, ticket, this.host.options)
    const appended = await this.host.append(unit, scope, [
      {
        tenant: scope.tenant,
        readKeys: [],
        payload: sessionFactPayload({
          kind: 'run_started',
          run,
          inputPosition: step.inputPosition,
          stepKey: step.stepKey,
          at: await this.host.instant(),
        }),
      },
    ])
    const receipt: StepReceipt = {
      ...scope,
      run,
      attempt: null,
      stepKey: step.stepKey,
      step: step.kind,
      position: appended.entries[0]!.position,
      source: await this.source(unit, scope),
    }
    await saveStep(unit, receipt, semantic, this.host.options)
  }
  async initialInput(
    unit: StorageUnit,
    scope: SessionScope,
    head: SessionHead,
    position: StepReceipt['position'],
  ) {
    if (head.run && !['completed', 'failed', 'cancelled'].includes(head.run.state))
      throw new CoordinationRejection('retryFromFacts')
    const input = await pendingPosition(
      unit,
      scope,
      positionText(position, this.host.options.policy.maxRecordBytes),
    )
    if (!input || input.reserved_run !== null) throw new CoordinationRejection('retryFromFacts')
  }
  async advance(
    unit: StorageUnit,
    scope: SessionScope,
    head: SessionHead,
    step: Exclude<SessionLifecycleStep, { kind: 'startRun' }>,
    semantic: string,
  ): Promise<StepCommit> {
    if (step.kind === 'prepareCall') return this.prepareCall(unit, scope, head, step, semantic)
    if (step.kind === 'adoptResult')
      return adoptModelResultIn(unit, this.host, scope, step, semantic)
    const change = this.change(step),
      staged = this.requireStage(
        await this.host.state.participant.stageIn(
          unit,
          this.host.authority.coordination,
          scope,
          head.revision,
          change,
        ),
      )
    const appended = await this.host.append(unit, scope, [await this.entry(scope, step, change)])
    const receipt: StepReceipt = {
      ...scope,
      run: step.run,
      attempt: staged.head.run!.attempt,
      stepKey: step.stepKey,
      step: step.kind,
      position: appended.entries[0]!.position,
      source: await this.source(unit, scope),
    }
    await saveStep(unit, receipt, semantic, this.host.options)
    return this.committed(receipt, staged.permit)
  }
  async prepareCall(
    unit: StorageUnit,
    scope: SessionScope,
    head: SessionHead,
    step: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>,
    semantic: string,
  ): Promise<StepCommit> {
    if (!(await this.host.state.checkPermitIn(unit, step.permit, scope, step.run, step.attempt)))
      throw new CoordinationRejection('staleAttempt')
    const appended = await this.host.append(unit, scope, [
      {
        tenant: scope.tenant,
        run: step.run,
        attempt: step.attempt,
        readKeys: [],
        payload: sessionFactPayload({
          kind: 'call_prepared',
          run: step.run,
          attempt: step.attempt,
          call: step.call,
          originalPosition: step.originalPosition,
          stepKey: step.stepKey,
          at: await this.host.instant(),
        }),
      },
    ])
    const receipt: StepReceipt = {
      ...scope,
      run: head.run!.id,
      attempt: head.run!.attempt,
      stepKey: step.stepKey,
      step: step.kind,
      position: appended.entries[0]!.position,
      source: await this.source(unit, scope),
    }
    await saveCallPreparation(unit, scope, step, receipt.position, this.host.options)
    await saveStep(unit, receipt, semantic, this.host.options)
    return this.committed(receipt, null)
  }

  change(
    step: Exclude<SessionLifecycleStep, { kind: 'startRun' | 'prepareCall' | 'adoptResult' }>,
  ): Exclude<SessionStateChange, { kind: 'initialize' | 'acceptInput' | 'startRun' }> {
    if (step.kind === 'startAttempt') {
      if (step.reason !== 'first') throw new CoordinationRejection('retryFromFacts')
      return { ...step, attempt: 1, executionGeneration: `generation:${randomUUID()}` }
    }
    if (step.kind === 'adoptInput')
      return {
        kind: 'adoptInput',
        stepKey: step.stepKey,
        run: step.run,
        attempt: step.attempt,
        permit: step.permit,
        position: step.inputPosition,
      }
    return {
      kind: 'finish',
      stepKey: step.stepKey,
      run: step.run,
      attempt: step.attempt,
      permit: step.permit,
      terminal: step.terminal,
    }
  }
  async entry(
    scope: SessionScope,
    step: Exclude<SessionLifecycleStep, { kind: 'startRun' | 'prepareCall' | 'adoptResult' }>,
    change: ReturnType<Lifecycle['change']>,
  ): Promise<LogEntryInput> {
    const attempt = change.attempt,
      at = await this.host.instant()
    let payload: unknown
    if (step.kind === 'startAttempt')
      payload = attemptStartedPayload({
        kind: 'attempt_started',
        run: step.run,
        attempt,
        reason: step.reason,
        at,
      })
    else if (step.kind === 'adoptInput')
      payload = sessionFactPayload({
        kind: 'input_adopted',
        run: step.run,
        attempt,
        inputPosition: step.inputPosition,
        stepKey: step.stepKey,
        at,
      })
    else
      payload = sessionFactPayload({
        kind: 'run_finished',
        run: step.run,
        attempt,
        terminal: step.terminal,
        reason: step.reason,
        stepKey: step.stepKey,
        at,
      })
    return { tenant: scope.tenant, run: step.run, attempt, readKeys: [], payload }
  }
  requireStage(result: SessionStateStage) {
    if (!('failure' in result)) return result
    if (result.failure === 'conflict' || result.failure === 'pendingInput')
      throw new CoordinationRejection('retryFromFacts')
    throw new CoordinationRejection(result.failure)
  }
  committed(
    receipt: StepReceipt,
    permit: Extract<StepCommit, { kind: 'committed' }>['permit'],
  ): StepCommit {
    return { kind: 'committed', receipt, source: receipt.source, permit }
  }
}
