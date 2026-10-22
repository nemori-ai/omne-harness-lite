import { it, expectTypeOf } from 'vitest'
import type { Events, Service } from '@deepseek-ai/cordis'
import type {
  RegisterProducerResult,
  ScopeRef,
  ViewRevision,
} from '@omne-harness/runtime-context-contract'
import type {
  RuntimeContextService,
  RuntimeContextIntercept,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
declare const service: RuntimeContextService
it('retains the contract key generic, configuration and positional event arguments', () => {
  expectTypeOf<ReturnType<typeof service.registerProducer<'probe.value'>>>().toEqualTypeOf<
    Promise<RegisterProducerResult<'probe.value'>>
  >()
  expectTypeOf<
    RuntimeContextService[typeof Service.config]
  >().toEqualTypeOf<RuntimeContextIntercept>()
  expectTypeOf<Parameters<Events['runtime-context-cordis-contract/changed']>>().toEqualTypeOf<
    [scope: ScopeRef, revision: ViewRevision]
  >()
})
