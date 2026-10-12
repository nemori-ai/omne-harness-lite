import { narrow, type StorageUnit } from '@omne-harness-lite/storage'
import {
  compareInteger,
  factLogPayload,
  type SessionLogParticipant,
  type LogEntryInput,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StepReceipt, StepCommit } from '@omne-harness-lite/session-runtime'
import type { RuntimeOptions, SessionLifecycleStep } from './runtime-types.ts'
import type { runtimeAuthority } from './runtime-authority.ts'
import type { createLocalSessionState } from './state-participant.ts'
import type { createModelResultCustody } from './model-result-custody.ts'
import { CoordinationRejection } from './coordination-values.ts'
import { runtimeSemantic } from './runtime-values.ts'
import { saveStep } from './coordination-store.ts'

type Adoption = Extract<SessionLifecycleStep, { kind: 'adoptResult' }>
export interface ResultAdoptionHost {
  readonly options: RuntimeOptions
  readonly authority: ReturnType<typeof runtimeAuthority>
  readonly state: ReturnType<typeof createLocalSessionState>
  readonly log: SessionLogParticipant
  readonly readModelIn: ReturnType<typeof createModelResultCustody>['readIn']
  readonly append: (
    unit: StorageUnit,
    scope: SessionScope,
    entries: readonly LogEntryInput[],
  ) => Promise<{ readonly entries: readonly { readonly position: StepReceipt['position'] }[] }>
  readonly instant: () => Promise<string>
}
interface AdoptionDb {
  sr_result_adoption: {
    session: string
    call: string
    response: string
    result_key: string
    step_key: string
  }
}
/** Consumes only the coordination obligation. Original response/message settlement stays with its SDK. */
export async function adoptModelResultIn(
  unit: StorageUnit,
  host: ResultAdoptionHost,
  scope: SessionScope,
  step: Adoption,
  semantic: string,
): Promise<StepCommit> {
  if (!(await host.state.checkPermitIn(unit, step.permit, scope, step.run, step.attempt)))
    throw new CoordinationRejection('staleAttempt')
  const saved = await originalResultIn(unit, host, scope, step)
  await unusedResultIn(unit, scope, saved.pending.call.callId, saved.pending.id)
  const appended = await host.append(unit, scope, [
    {
      tenant: scope.tenant,
      run: step.run,
      attempt: step.attempt,
      readKeys: [],
      payload: factLogPayload('session-runtime-local', '1', {
        kind: 'result_adopted',
        call: step.result.call,
        resultKey: step.result.resultKey,
        resultPosition: step.result.position,
        response: saved.pending.id,
        stepKey: step.stepKey,
        at: await host.instant(),
      }),
    },
  ])
  const source = await host.log.sourceIn(unit, host.authority.logAccess, scope)
  if ('failure' in source) throw new CoordinationRejection(source.failure)
  const receipt: StepReceipt = {
    ...scope,
    run: step.run,
    attempt: step.attempt,
    step: step.kind,
    stepKey: step.stepKey,
    position: appended.entries[0]!.position,
    source: source.source,
  }
  await unit.mutate(tx =>
    narrow<AdoptionDb>(tx)
      .insertInto('sr_result_adoption')
      .values({
        session: scope.session,
        call: step.result.call,
        response: saved.pending.id,
        result_key: step.result.resultKey,
        step_key: step.stepKey,
      })
      .execute(),
  )
  await saveStep(unit, receipt, semantic, host.options)
  return { kind: 'committed', receipt, source: receipt.source, permit: null }
}
async function originalResultIn(
  unit: StorageUnit,
  host: ResultAdoptionHost,
  scope: SessionScope,
  step: Adoption,
) {
  const saved = await host.readModelIn(unit, scope, step.result.call, step.result.resultKey)
  if ('failure' in saved)
    throw new CoordinationRejection(saved.failure === 'denied' ? 'denied' : 'unavailable')
  if (saved.kind === 'absent') throw new CoordinationRejection('retryFromFacts')
  if (
    saved.pending.call.runId !== step.run ||
    compareInteger(saved.pending.attemptId!, step.attempt) !== 0 ||
    runtimeSemantic(saved.witness.receipt, host.options.policy.maxRecordBytes) !==
      runtimeSemantic(step.result, host.options.policy.maxRecordBytes)
  )
    throw new CoordinationRejection('retryFromFacts')
  return saved
}
async function unusedResultIn(
  unit: StorageUnit,
  scope: SessionScope,
  call: string,
  response: string,
) {
  const prior = await unit.query(tx =>
    narrow<AdoptionDb>(tx)
      .selectFrom('sr_result_adoption')
      .select('step_key')
      .where('session', '=', scope.session)
      .where('call', '=', call)
      .where('response', '=', response)
      .executeTakeFirst(),
  )
  if (prior) throw new CoordinationRejection('retryFromFacts')
}
