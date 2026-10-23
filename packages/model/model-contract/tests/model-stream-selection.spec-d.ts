import { expectTypeOf, it } from 'vitest'
import type { Access } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { StreamObserver, StreamFrame, StreamRef } from '@omne-harness/stream-arrival'
import type {
  CallState,
  DispatchId,
  ModelFailure,
  ModelInvocationRef,
  ModelStreamDelta,
  ModelStreamObservation,
  ModelStreamReferences,
  ModelStreamSelection,
  ModelStreamSnapshot,
  Reply,
} from '@omne-harness/model-contract'

declare const references: ModelStreamReferences<{ subject: string }>
declare const access: Access<{ subject: string }>
declare const reference: ModelInvocationRef
declare const state: CallState
declare const ref: StreamRef
declare const dispatch: DispatchId
declare const signal: AbortSignal

it('C10 keeps the sole object signature and the full legacy Reply failure union', () => {
  expectTypeOf<Parameters<typeof references.current>>().toEqualTypeOf<
    [Readonly<{ access: Access<{ subject: string }>; reference: ModelInvocationRef }>]
  >()
  expectTypeOf(references.current({ access, reference })).toEqualTypeOf<
    Reply<ModelStreamSelection>
  >()
  expectTypeOf<Awaited<ReturnType<typeof references.current>>>().toEqualTypeOf<
    Outcome<ModelStreamSelection, ModelFailure>
  >()
  // @ts-expect-error no positional overload
  void references.current(access, reference)
  // @ts-expect-error no cancellation argument
  void references.current({ access, reference, signal })
  // @ts-expect-error no cursor argument
  void references.current({ access, reference, after: null })
  // @ts-expect-error no query revision
  void references.current({ access, reference, revision: 1 })
  // @ts-expect-error reference remains required
  void references.current({ access })
  const legacy: Awaited<ReturnType<typeof references.current>> = {
    failure: { kind: 'not-settled' },
  }
  expectTypeOf(legacy.failure).toEqualTypeOf<ModelFailure>()
})
it('C10 fixes the selection projection and aliases the common observer without a producer end', () => {
  expectTypeOf<ModelStreamSelection>().toEqualTypeOf<
    Readonly<{
      state: CallState
      current: Readonly<{
        ref: StreamRef
        dispatch: DispatchId
        projection: 'model-output-v1'
      }> | null
    }>
  >()
  expectTypeOf<ModelStreamObservation<string>>().toEqualTypeOf<
    StreamObserver<string, ModelStreamSnapshot, ModelStreamDelta>
  >()
  const valid: ModelStreamSelection = {
    state,
    current: { ref, dispatch, projection: 'model-output-v1' },
  }
  const foreign: ModelStreamSelection = {
    state,
    // @ts-expect-error foreign projection is not a Model output
    current: { ref, dispatch, projection: 'tool-output-v1' },
  }
  const revised: ModelStreamSelection = {
    state,
    // @ts-expect-error current does not publish a target revision
    current: { ref, dispatch, projection: 'model-output-v1', revision: 1 },
  }
  const end: StreamFrame<ModelStreamSnapshot, ModelStreamDelta> = {
    kind: 'ended',
    reason: 'producer-ended',
    // @ts-expect-error Model has no producer-ended value
    value: {},
  }
  void [valid, foreign, revised, end]
})
