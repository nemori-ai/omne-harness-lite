import { expectTypeOf } from 'vitest'
import type {
  AssemblyPorts,
  PromptContributionRegistry,
  ScopeRef,
} from '@omne-harness/request-context-contract'
import type {
  AssemblyAccess,
  RequestContextService,
  RequestContextIntercept,
  RequestContextPolicySelection,
} from '@omne-harness/request-context-cordis-contract/cordis'
expectTypeOf<RequestContextService<unknown>['contributeVariable']>().toEqualTypeOf<
  PromptContributionRegistry['contributeVariable']
>()
expectTypeOf<RequestContextService<unknown>['assembly']>().toEqualTypeOf<
  (scope: ScopeRef, ports: AssemblyPorts<unknown>) => AssemblyAccess<unknown>
>()
expectTypeOf<RequestContextIntercept['scope']>().toEqualTypeOf<ScopeRef | null>()
expectTypeOf<
  RequestContextPolicySelection['compaction']['implementation']
>().toEqualTypeOf<string>()
// @ts-expect-error Missing scope is not a valid explicit configuration.
const missing: RequestContextIntercept = {}
void missing
