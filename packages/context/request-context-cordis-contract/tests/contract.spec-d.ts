import { expectTypeOf } from 'vitest'
import type {
  AssemblyOperations,
  ContextSourceRegistry,
  ContextTarget,
  PromptContributionRegistry,
  ScopeRef,
} from '@omne-harness/request-context-contract'
import type {
  RequestContextService,
  RequestContextIntercept,
  RequestContextPolicySelection,
} from '@omne-harness/request-context-cordis-contract/cordis'
expectTypeOf<RequestContextService<unknown>['contributeVariable']>().toEqualTypeOf<
  PromptContributionRegistry['contributeVariable']
>()
// The service projects the registry signatures one to one; the scope is no access grant.
expectTypeOf<RequestContextService<unknown>['assembly']>().toEqualTypeOf<
  (target: ContextTarget) => AssemblyOperations<unknown>
>()
expectTypeOf<RequestContextService<unknown>['register']>().toEqualTypeOf<
  ContextSourceRegistry<unknown>['register']
>()
expectTypeOf<RequestContextService<unknown>['replace']>().toEqualTypeOf<
  ContextSourceRegistry<unknown>['replace']
>()
expectTypeOf<RequestContextIntercept['scope']>().toEqualTypeOf<ScopeRef | null>()
expectTypeOf<
  RequestContextPolicySelection['compaction']['implementation']
>().toEqualTypeOf<string>()
// @ts-expect-error Missing scope is not a valid explicit configuration.
const missing: RequestContextIntercept = {}
void missing
