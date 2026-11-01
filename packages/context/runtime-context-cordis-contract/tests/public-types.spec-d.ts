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

import type { RuntimeContextTrust } from '@omne-harness/runtime-context-contract'
import type { RuntimeContextTrustService } from '@omne-harness/runtime-context-cordis-contract/cordis'
it('RuntimeContextTrustService projects the two ports of the root trust type', () => {
  expectTypeOf<RuntimeContextTrustService<string>>().toExtend<RuntimeContextTrust<string>>()
  expectTypeOf<RuntimeContextTrustService<string>['authority']>().toEqualTypeOf<
    RuntimeContextTrust<string>['authority']
  >()
  expectTypeOf<RuntimeContextTrustService<string>['bindings']>().toEqualTypeOf<
    RuntimeContextTrust<string>['bindings']
  >()
})
