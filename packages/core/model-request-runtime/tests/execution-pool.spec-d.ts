import type {
  ModelExecutionRecords,
  ModelDispatchResult,
  ModelExecutionRef,
  ModelPoolControls,
  ModelCallerAccess,
  ModelPoolAdmission,
  PreparedModelFirstDispatch,
  PreparedModelRetryDispatch,
  ModelExecutionObservation,
  ModelCapturedExecution,
  ModelPoolCallOpen,
  PreparedModelExecution,
} from '@omne-harness-lite/model-request-runtime'
declare const models: ModelExecutionRecords
// @ts-expect-error Model execution records do not expose Session selection.
models.selectModel()
// @ts-expect-error Model execution records cannot return a complete Session prefix.
models.readPrefix()
declare const ref: ModelExecutionRef
// @ts-expect-error A physical owner generation is not logical task identity.
ref.executionGeneration
declare const modelResult: ModelDispatchResult
if ('kind' in modelResult && modelResult.kind === 'unknownCommit') {
  modelResult.original.ref.tenant
  // @ts-expect-error Unknown admission has no launch claim.
  modelResult.claim
  // @ts-expect-error Unknown admission does not grant ACK.
  modelResult.acknowledgeCall()
}
declare const modelControls: ModelPoolControls
declare const callerAccess: ModelCallerAccess
declare const modelPool: ModelPoolAdmission
// @ts-expect-error Call control does not select the Session model.
modelControls.selectModel()
// @ts-expect-error Current caller qualification cannot borrow a Session binding.
callerAccess.bind()
// @ts-expect-error A business operation closure cannot stop the shared pool.
modelPool.closeAdmission()
declare const initial: PreparedModelFirstDispatch
declare const retry: PreparedModelRetryDispatch
// @ts-expect-error An explicit retry plan cannot enter the first-dispatch path.
modelPool.dispatch(retry)
// @ts-expect-error A retry requires the existing explicit RetryPlan.
modelPool.dispatchAgain(initial)
declare const observation: ModelExecutionObservation
// @ts-expect-error Original execution metadata cannot return the full Session binding.
observation.session
declare const captured: ModelCapturedExecution
// @ts-expect-error A captured invocation cannot lend the full settlement owner.
captured.invocation?.borrowControl()
declare const opening: ModelPoolCallOpen
// @ts-expect-error A business creation request cannot replace the native lifetime host.
opening.host
declare const openingFields: Omit<ModelPoolCallOpen, 'run' | 'attempt' | 'report'>
declare const runOrigin: Extract<
  PreparedModelExecution['origin'],
  { readonly kind: 'sessionAttempt' }
>
// @ts-expect-error The original Run/report association remains all-or-none.
const invalidOpening: ModelPoolCallOpen = {
  ...openingFields,
  run: runOrigin.run,
  attempt: runOrigin.attempt,
}
