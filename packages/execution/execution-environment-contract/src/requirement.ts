import type { EnvironmentBinding } from './binding.ts'
import type { FacilityKey } from './facility.ts'

export interface IsolationClaims {
  readonly process: true
  readonly 'filesystem-root': true
  readonly 'network-none': true
  readonly 'restricted-js': true
}

export type IsolationClaim = keyof IsolationClaims & string

/** What the integrator allows for one acquisition. The environment never picks a layer outside the list. */
export interface EnvironmentRequirement {
  readonly allowedBindings: readonly EnvironmentBinding[]
  readonly facilities: readonly FacilityKey[]
  readonly isolation: readonly IsolationClaim[]
}
