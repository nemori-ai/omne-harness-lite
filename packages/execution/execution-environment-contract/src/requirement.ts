import type { EnvironmentBinding } from './binding.ts'
import type { FacilityKey } from './facility.ts'

/**
 * Isolation claims a provider can confirm. Open vocabulary: an owner adds a claim with
 * `declare module '@omne-harness/execution-environment-contract'`.
 */
export interface IsolationClaims {
  readonly process: true
  readonly 'filesystem-root': true
  readonly 'network-none': true
  readonly 'restricted-js': true
}

export type IsolationClaim = keyof IsolationClaims & string

/** What the integrator allows for one acquisition. The environment never picks a layer outside the list. */
export interface EnvironmentRequirement {
  /** Ordered preference produced by the integrator. */
  readonly allowedBindings: readonly EnvironmentBinding[]
  readonly facilities: readonly FacilityKey[]
  readonly isolation: readonly IsolationClaim[]
}
