import { expectTypeOf } from 'vitest'
import type { CallKey, SessionRef } from '@omne-harness-lite/messages'
import type {
  AnchoredInvocationHandle,
  ModelCallHost,
  ModelRuntimeExecutionObservation,
  ModelRuntimeCapturedExecution,
  ModelRuntimeExecutionSource,
  ModelRuntimeOperations,
  RuntimeCloseResult,
} from '../src/index.ts'

declare const source: ModelRuntimeExecutionSource
declare const key: CallKey
declare const session: SessionRef
expectTypeOf(source.snapshot(session)).toEqualTypeOf<readonly ModelRuntimeExecutionObservation[]>()
expectTypeOf(source.release()).toEqualTypeOf<RuntimeCloseResult>()
expectTypeOf<ModelRuntimeCapturedExecution['invocation']>().toEqualTypeOf<
  AnchoredInvocationHandle | undefined
>()
declare const observation: ModelRuntimeExecutionObservation
// @ts-expect-error Metadata cannot hand out an original invocation.
observation.invocation
const captured = source.capture(session)
if ('capture' in captured) {
  expectTypeOf(captured.capture.executions).toEqualTypeOf<
    readonly ModelRuntimeCapturedExecution[]
  >()
  expectTypeOf(captured.capture.release()).toEqualTypeOf<void>()
}
const lookup = source.lookup(key, {})
if ('execution' in lookup)
  expectTypeOf(lookup.execution).toEqualTypeOf<ModelRuntimeExecutionObservation>()
declare const service: ModelRuntimeOperations
declare const host: ModelCallHost
// @ts-expect-error Business operations do not convey the physical execution source.
service.executionSource
// @ts-expect-error A caller-supplied host receives only its original close capability.
host.register(async () => ({ released: true }), source)
