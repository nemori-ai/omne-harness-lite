import { expectTypeOf, test } from 'vitest'
import type {
  PlanExecutionContext,
  PlanInput,
  PlanResult,
  PlannedSemantics,
  TransportAdapter,
} from '@omne-harness-lite/model-request-runtime'

test('D109 requires an asynchronous plan with explicit execution context', () => {
  expectTypeOf<Parameters<TransportAdapter<PlannedSemantics, object>['plan']>>().toEqualTypeOf<
    [PlanInput, PlanExecutionContext]
  >()
  expectTypeOf<ReturnType<TransportAdapter<PlannedSemantics, object>['plan']>>().toEqualTypeOf<
    Promise<PlanResult<PlannedSemantics>>
  >()
  expectTypeOf<PlanExecutionContext['reuseScope']>().toEqualTypeOf<object | undefined>()
})
