import type {
  ModelExecutionRecords,
  OriginalIssueOwner,
  ModelExecutionRef,
  ModelPoolInstance,
  ModelExecutionObservation,
  ModelExecutionRequest,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
declare const models: ModelExecutionRecords
declare const nativeOriginal: OriginalIssueOwner &
  Pick<ModelExecutionRecords, 'stageOriginalIn' | 'stageConsumeIn'>
const nativeRecords: ModelExecutionRecords = nativeOriginal
nativeRecords.prepareOriginal
nativeRecords.consumeOriginal
// @ts-expect-error Session log reads are owned by Session.
models.readOriginalIn
// @ts-expect-error Record ownership cannot select the Session model.
models.selectModel()
declare const ref: ModelExecutionRef
ref.tenant
ref.session
ref.callId
ref.dispatch
declare const pool: ModelPoolInstance
// @ts-expect-error The execution pool does not open Session calls.
pool.openCall
// @ts-expect-error The execution pool does not plan retries.
pool.dispatchAgain
// @ts-expect-error The execution pool does not reconcile Session state.
pool.reconcile
// @ts-expect-error The execution pool cannot acknowledge Session results.
pool.acknowledgeCall
declare const observation: ModelExecutionObservation
// @ts-expect-error Observations cannot return the Session binding.
observation.session
// @ts-expect-error Metadata does not retain results or invocations.
observation.invocation
declare const request: ModelExecutionRequest<PlannedSemantics, object>
pool.execute(request)
// @ts-expect-error Every physical execution needs explicit scope and dispatch identity.
pool.execute({ input: request.input })
