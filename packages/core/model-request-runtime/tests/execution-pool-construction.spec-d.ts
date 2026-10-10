import type {
  ModelPoolConstruction,
  ModelRecoveryScope,
  ModelCredentialSource,
  PreparedModelFirstDispatch,
} from '@omne-harness-lite/model-request-runtime'
declare const model: ModelPoolConstruction
declare const recovery: ModelRecoveryScope
declare const credentials: ModelCredentialSource
declare const request: PreparedModelFirstDispatch
// @ts-expect-error Construction cannot lend a complete Session binding.
model.sessions.bind()
// @ts-expect-error The pool cannot retire the host's shared transport.
model.transport.close()
// @ts-expect-error Recovery cannot return a complete Session log binding.
recovery.binding.log
// @ts-expect-error Recovery has no arbitrary full-log writer owner.
recovery.owner
// @ts-expect-error Credentials are borrowed through a trusted source, not request data.
request.credential
// @ts-expect-error A credential value source cannot publish a new credential.
credentials.bindCredential()

// Existing leases, policies and invocation capability remain required.
model.transport.acquire(request.input.snapshot.adaptation, request.input.routeName)
model.support.policy.schedule(1, () => {})
