import type { ContextRegistryOptions } from '@omne-harness/request-context-contract'

export type RequestContextTrust<P> = Pick<
  ContextRegistryOptions<P>,
  'principalBinding' | 'registrationAuthority'
>
