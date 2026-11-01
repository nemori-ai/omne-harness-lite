import { expectTypeOf } from 'vitest'
import type {
  ContextRegistryOptions,
  PrincipalBinding,
  SourceRegistrationAuthority,
} from '@omne-harness/request-context-contract'
import type {
  ContextAccountingInboxService,
  RequestContextTrustService,
} from '@omne-harness/request-context-cordis-contract/cordis'
import type { RequestContextTrust } from '@omne-harness/request-context-cordis-contract'

// C1: the trust object is derived from the original options, never a copy of the field types.
expectTypeOf<RequestContextTrust<string>>().toEqualTypeOf<
  Pick<ContextRegistryOptions<string>, 'principalBinding' | 'registrationAuthority'>
>()
expectTypeOf<RequestContextTrust<string>['principalBinding']>().toEqualTypeOf<
  PrincipalBinding<string>
>()
expectTypeOf<RequestContextTrust<string>['registrationAuthority']>().toEqualTypeOf<
  SourceRegistrationAuthority<string>
>()
declare const trust: RequestContextTrust<string>
declare const policies: ContextRegistryOptions<string>['policies']
const options: ContextRegistryOptions<string> = { ...trust, policies }
void options

// One missing field, one extra field and one wrong field type each violate only their own rule.
// @ts-expect-error The registration authority is missing.
const missingAuthority: RequestContextTrust<string> = { principalBinding: trust.principalBinding }
// @ts-expect-error The principal binding is missing.
const missingBinding: RequestContextTrust<string> = {
  registrationAuthority: trust.registrationAuthority,
}
const extra: RequestContextTrust<string> = {
  ...trust,
  // @ts-expect-error A trust object carries no policies.
  policies,
}
const wrongType: RequestContextTrust<string> = {
  ...trust,
  // @ts-expect-error The binding has the original port type.
  principalBinding: {},
}
void [missingAuthority, missingBinding, extra, wrongType]

// C2: the services project the original ports property by property.
expectTypeOf<RequestContextTrustService<string>['principalBinding']>().toEqualTypeOf<
  RequestContextTrust<string>['principalBinding']
>()
expectTypeOf<RequestContextTrustService<string>['registrationAuthority']>().toEqualTypeOf<
  RequestContextTrust<string>['registrationAuthority']
>()
expectTypeOf<ContextAccountingInboxService<string>['receive']>().parameters.toEqualTypeOf<
  Parameters<
    import('@omne-harness/request-context-contract').ContextAccountingInbox<string>['receive']
  >
>()
