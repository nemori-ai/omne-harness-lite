import type { Access } from '@omne-harness/legal-identity'
import type { StreamObserver, StreamRef } from '@omne-harness/stream-arrival'
import type { ModelStreamDelta, ModelStreamSnapshot } from './model-stream-values.ts'
import type { ModelInvocationRef } from './reference.ts'
import type { CallState, Reply } from './result.ts'
import type { DispatchId } from './root.ts'

export type ModelStreamObservation<P> = StreamObserver<P, ModelStreamSnapshot, ModelStreamDelta>

export type ModelStreamSelection = Readonly<{
  state: CallState
  current: Readonly<{
    ref: StreamRef
    dispatch: DispatchId
    projection: 'model-output-v1'
  }> | null
}>

export interface ModelStreamReferences<P> {
  current(
    input: Readonly<{ access: Access<P>; reference: ModelInvocationRef }>,
  ): Reply<ModelStreamSelection>
}
