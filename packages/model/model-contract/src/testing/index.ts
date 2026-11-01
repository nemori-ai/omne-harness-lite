// The `./testing` entry: a scripted provider and a scripted transport for tests of the Model
// contract, a conformance subject built from them, the doubles of the push and observation
// protocols, and the doubles of the profile and request preparation ports. The provider
// obligation suite itself is the `./conformance` entry. The scripted pair exercises the failure
// paths that a coordinator must decide on, and gives the result the script says. It is not a
// provider: nothing here is durable, and a scripted answer proves nothing about a real provider.
export { createScriptedModelProvider } from './provider.ts'
export type { ScriptedModelProvider, ScriptedModelProviderOptions } from './provider.ts'
export type { ScriptController, ScriptedCall } from './controller.ts'
export type { ScriptedAction } from './core.ts'
export type { WriteAction as ScriptedWriteAction } from './writes.ts'
export { createScriptedTransport } from './transport.ts'
export type {
  ScriptedTransport,
  ScriptedTransportCounts,
  ScriptedTransportEnding,
  ScriptedTransportScript,
} from './transport.ts'
export { ScriptedModelError } from './error.ts'
export type { ScriptedModelErrorReason } from './error.ts'
export { createScriptedConformanceSubject } from './conformance-scripted.ts'
export type { ScriptedPrincipal } from './conformance-scripted.ts'
// The three public doubles of the result push and public observation protocols. They prove
// what a consumer sees on the contract face; none of them is durable or a production capability.
export { createScriptedResultPusher } from './pusher.ts'
export type {
  AckRecord,
  PushFailure,
  PushRecord,
  ScriptedResultPusher,
  ScriptedResultPusherOptions,
} from './pusher.ts'
export { createScriptedStreamReferences } from './stream-references.ts'
export type { ScriptedEvent, ScriptedStreamReferences } from './stream-references.ts'
export { createScriptedStreamObservation } from './stream-observation.ts'
export type {
  ScriptedStreamObservation,
  ScriptedStreamObservationOptions,
} from './stream-observation.ts'
// The two doubles of the profile and request preparation ports. Each answers from tables the test
// fills and records every call; neither evaluates profiles, runs parameter rules or holds secrets.
export { createScriptedModelProfiles } from './profiles.ts'
export type { ScriptedModelProfileCall, ScriptedModelProfiles } from './profiles.ts'
export { createScriptedModelRequestPreparation } from './preparation.ts'
export type {
  ScriptedModelPreparationCall,
  ScriptedModelPreparationMatch,
  ScriptedModelPreparationPlan,
  ScriptedModelRequestPreparation,
  ScriptedModelRequestPreparationOptions,
} from './preparation.ts'
export type { ScriptedAccessDecision } from './access.ts'
