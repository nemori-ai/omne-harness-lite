import { expectTypeOf } from 'vitest'
import type {
  SessionRuntime,
  SessionIngressOperations,
  SessionCoordination,
  SessionLifecycle,
  SessionLifecycleStep,
  CoordinationStep,
} from '../src/index.ts'

expectTypeOf<keyof SessionIngressOperations>().toEqualTypeOf<
  'createSession' | 'readSession' | 'submitInput' | 'readReceipt' | 'readProgress'
>()
expectTypeOf<SessionRuntime>().toExtend<SessionIngressOperations>()
expectTypeOf<SessionIngressOperations>().not.toExtend<SessionRuntime>()

declare const ingress: SessionIngressOperations
// @ts-expect-error A five-operation ingress cannot advertise archive support.
ingress.setArchived
// @ts-expect-error A five-operation ingress cannot advertise cancellation support.
ingress.cancelRun

expectTypeOf<SessionLifecycleStep['kind']>().toEqualTypeOf<
  'startRun' | 'startAttempt' | 'adoptInput' | 'prepareCall' | 'adoptResult' | 'finish'
>()
expectTypeOf<SessionLifecycleStep>().toExtend<CoordinationStep>()
expectTypeOf<CoordinationStep>().not.toExtend<SessionLifecycleStep>()
expectTypeOf<SessionCoordination>().toExtend<SessionLifecycle>()
expectTypeOf<SessionLifecycle>().not.toExtend<SessionCoordination>()

declare const cancellation: Extract<CoordinationStep, { kind: 'cancelStage' }>
// @ts-expect-error A lifecycle subset cannot consume a cancellation stage.
const unsupported: SessionLifecycleStep = cancellation
void unsupported
