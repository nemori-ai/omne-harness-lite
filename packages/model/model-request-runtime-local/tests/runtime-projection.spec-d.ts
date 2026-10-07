import { expectTypeOf } from 'vitest'
import type {
  ModelRuntimeHostInputs,
  ModelRuntimeOperations,
  RuntimeRecoveryAccess,
  PlannedSemantics,
} from '@omne-harness-lite/model-request-runtime'
import { createModelRuntime } from '../src/service-runtime.ts'
import { createModelCallFacts } from '../src/reference-facts.ts'
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
  ReturnType<typeof createModelCallFacts>['project']
>().returns.toEqualTypeOf<CallFactsView>()
