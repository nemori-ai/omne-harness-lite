import { expectTypeOf, test } from 'vitest'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'
import type {
  CallKey,
  DispatchAgainInput,
  DispatchInput,
  FailureConsumption,
  ModelFailureExecution,
  ModelFailureSource,
  ModelRuntimeService,
  ReadAttemptsResult,
} from '../src/service-types.ts'

declare const service: ModelRuntimeService
declare const key: CallKey
declare const dispatchInput: DispatchInput
declare const againInput: DispatchAgainInput
declare const source: ModelFailureSource
declare const subject: AfterModelCallFailureSubject

test('F18-V4 the failure source has one required execution-bound verify form', () => {
  expectTypeOf<Parameters<ModelFailureSource['verify']>['length']>().toEqualTypeOf<2>()
  expectTypeOf<Parameters<ModelFailureSource['verify']>[1]>().toEqualTypeOf<ModelFailureExecution>()
  // @ts-expect-error the pre-v18 subject-only verification is not callable
  source.verify(subject)
  // @ts-expect-error a noRun execution has no Run to bind
  source.verify(subject, { attempt: 1 })
  // @ts-expect-error the current attempt is required, not inferred from the original dispatch
  source.verify(subject, { run: 'run' })
})

test('M17-V8/V12 ordinary calls return only business values; the technical form is explicit', () => {
  expectTypeOf(service.readAttempts(key)).resolves.toEqualTypeOf<ReadAttemptsResult>()
  expectTypeOf(service.readAttempts(key, { consumeFailure: true })).resolves.toEqualTypeOf<
    FailureConsumption<ReadAttemptsResult>
  >()
  expectTypeOf<ReadAttemptsResult>().not.toHaveProperty('consumption')
  expectTypeOf(service.dispatch(dispatchInput)).resolves.not.toHaveProperty('consumption')
  expectTypeOf(service.dispatchAgain(againInput)).resolves.not.toHaveProperty('consumption')
  expectTypeOf(service.dispatch(dispatchInput, { consumeFailure: true })).resolves.toHaveProperty(
    'consumption',
  )
  // @ts-expect-error only the literal technical request selects the resource-bearing overload
  void service.readAttempts(key, { consumeFailure: false })
})
