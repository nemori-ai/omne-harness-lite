import { randomUUID } from 'node:crypto'
import type {
  BindingKind,
  EnvironmentContinuity,
  EnvironmentFacilities,
  EnvironmentLease,
  EnvironmentProvider,
  FacilityKey,
  ProviderFacts,
} from '@omne-harness/execution-environment-contract'
import { createHostFiles } from './host-files.ts'

/**
 * The host provider of the `files` facility. It serves the `host_machine` layer only, confirms no
 * isolation claim, gives no continuity guarantee and does not support recovery: its file operations
 * leave no managed resource behind.
 */
export function createHostFilesProvider(): EnvironmentProvider {
  const name = 'host-files'
  const generation = randomUUID()
  const files = createHostFiles()
  const available: Partial<EnvironmentFacilities> = { files }
  const facilities: readonly FacilityKey[] = ['files']
  const invalidations = new Set<(value: { readonly reason: string }) => void>()
  let retired = false

  const facts: ProviderFacts = Object.freeze({
    provider: name,
    generation,
    platform: process.platform,
    facilities,
    isolation: [],
    prerequisites: 'satisfied',
  })

  const bindingKinds: readonly BindingKind[] = Object.freeze(['host_machine'])
  const continuity: EnvironmentContinuity = Object.freeze({ kind: 'not_guaranteed' })

  const provider: EnvironmentProvider = {
    name,
    generation,
    bindingKinds,
    continuity,
    facilities,
    isolation: [],
    async describe() {
      return facts
    },
    async acquire(input) {
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (input.placement.binding.kind !== 'host_machine')
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      const invalidated = new Promise<{ readonly reason: string }>(resolve => {
        invalidations.add(resolve)
      })
      const lease: EnvironmentLease = {
        placement: input.placement,
        instance: { id: 'host', generation },
        continuity,
        invalidated,
        facility<F extends FacilityKey>(key: F) {
          return available[key]
        },
        async release() {
          return { kind: 'released' }
        },
      }
      return {
        kind: 'acquired',
        lease,
        evidence: {
          kind: 'object',
          entries: [
            { key: 'provider', value: { kind: 'string', value: name } },
            { key: 'generation', value: { kind: 'string', value: generation } },
          ],
        },
      }
    },
    async retire() {
      retired = true
      for (const invalidate of invalidations) invalidate({ reason: 'providerRetired' })
      invalidations.clear()
      return { kind: 'drained' }
    },
  }
  return Object.freeze(provider)
}
