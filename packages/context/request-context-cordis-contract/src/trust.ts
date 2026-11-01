import type { ContextRegistryOptions } from '@omne-harness/request-context-contract'

/**
 * The two original ports that a trusted subtree hands to the source registry. Derived from the
 * registry options, so a field type changes only where the original port changes.
 */
export type RequestContextTrust<P> = Pick<
  ContextRegistryOptions<P>,
  'principalBinding' | 'registrationAuthority'
>
