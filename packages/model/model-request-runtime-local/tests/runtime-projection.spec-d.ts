import { createSessionModelCallFacts } from '@omne-harness-lite/session-runtime-local'
import { expectTypeOf } from 'vitest'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
  RuntimeRecoveryAccess,
  PlannedSemantics,
  ModelRuntimeExecutionSource,
} from '@omne-harness-lite/model-request-runtime'
import { createModelRuntime } from '../src/service-runtime.ts'

import type { CallFactsView } from '../src/reference-types.ts'

declare const runtime: ReturnType<typeof createModelRuntime<PlannedSemantics, never>>
declare const inputs: ModelRuntimeHostInputs
declare const facts: CallFactsView
expectTypeOf(runtime.project).parameter(0).toEqualTypeOf<ModelRuntimeHostInputs>()
expectTypeOf(runtime.project).parameter(1).toEqualTypeOf<CallFactsView>()
expectTypeOf(runtime.project(inputs, facts)).toEqualTypeOf<ModelRuntimeOperations>()
// @ts-expect-error A projection needs an explicit borrowed facts view.
runtime.project(inputs)
// @ts-expect-error A projection does not own overall runtime close.
runtime.project(inputs, facts).close()
// @ts-expect-error A borrowed facts view has no overall close.
facts.close()
// @ts-expect-error Current qualification is mandatory, not inferred from a retained scope.
const incompleteRecovery: RuntimeRecoveryAccess = {
  enter: async () => ({ unavailable: true }),
}
void incompleteRecovery
expectTypeOf<
  ReturnType<typeof createSessionModelCallFacts>['project']
>().returns.toEqualTypeOf<CallFactsView>()

expectTypeOf(runtime.executionSource).toEqualTypeOf<ModelRuntimeExecutionSource>()
// @ts-expect-error Fixed-subject business projections do not carry assembly execution capabilities.
runtime.project(inputs, facts).executionSource
