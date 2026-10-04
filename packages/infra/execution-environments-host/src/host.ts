import { randomUUID } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type { EnvironmentDescription, EnvironmentLease, EnvironmentProvider, EnvironmentRejection } from '@omne-harness-lite/execution-environments'
import type { AccessOperation, SessionAccess, SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import { ownScope, ownRequirement, ownReference } from './values.ts'
const reject = (reason: EnvironmentRejection['reason']): EnvironmentRejection => ({ kind: 'rejected', reason })

/** Phase 2 has no process/file facilities. Acquisition still uses real scope checks and leases. */
export function createHostEnvironment(options: { readonly name: string; readonly access: SessionAccessOperations }): EnvironmentProvider {
  if (!options.name) throw new TypeError('host provider name required')
  const generation = randomUUID()
  const reference = Object.freeze({ provider: options.name, reference: Object.freeze({ generation }) })
  const description: EnvironmentDescription = Object.freeze({ reference, bindingLayer: 'host_machine', facilities: Object.freeze([]) })
  const leases = new Set<() => void>()
  let active = true
  async function authorize(access: SessionAccess, scope: Parameters<EnvironmentProvider['describe']>[0], operation: AccessOperation) {
    if (!active) return reject('ownerStopped')
    try {
      const decision = await options.access.authorize(access, scope, operation)
      return !active ? reject('ownerStopped') : decision.kind === 'rejected' ? reject(decision.reason) : decision
    } catch { return reject('unavailable') }
  }
  return Object.freeze({
    name: options.name, generation,
    async describe(inputScope, authorization) {
      const scope = ownScope(inputScope)
      if (!scope) return reject('invalidInput')
      const checked = await authorize(authorization, scope, 'environment.describe')
      return checked.kind === 'rejected' ? checked : { kind: 'descriptions', values: [description] }
    },
    async acquire(request) {
      if (request === null || typeof request !== 'object') return reject('invalidInput')
      const scope = ownScope(request.scope), requirement = ownRequirement(request.requirement)
      const selected = request.reference === undefined ? undefined : ownReference(request.reference)
      const resources = request.resources
      if (!scope || !requirement || (request.reference !== undefined && !selected) || !(resources?.closed instanceof AbortSignal)) return reject('invalidInput')
      const checked = await authorize(request.authorization, scope, 'environment.acquire')
      if (checked.kind === 'rejected') return checked
      if (requirement.bindingLayer !== 'host_machine') return reject('noMatchingEnvironment')
      if (requirement.facilities.length) return reject('missingFacility')
      if (selected && (selected.provider !== options.name || writeJsonLossless(selected.reference) !== writeJsonLossless(reference.reference))) return reject('referenceExpired')
      if (resources.closed.aborted) return reject('ownerStopped')
      const invalidation = Promise.withResolvers<{readonly reason: string}>()
      let held = true
      const invalidate = () => { if (held) { held = false; leases.delete(invalidate); resources.closed.removeEventListener('abort', invalidate); invalidation.resolve({ reason: 'ownerStopped' }) } }
      leases.add(invalidate)
      resources.closed.addEventListener('abort', invalidate, { once: true })
      const lease: EnvironmentLease = Object.freeze({ facilities: Object.freeze({ description }), invalidated: invalidation.promise,
        async release() { invalidate(); return { kind: 'released' } as const } })
      return { kind: 'acquired', lease, evidence: Object.freeze({ provider: options.name, generation, reference: reference.reference, facilities: [] }) }
    },
    async recover() { return 'unsupported' },
    async retire() { active = false; for (const invalidate of [...leases]) invalidate(); return { kind: 'drained' } },
  } satisfies EnvironmentProvider)
}
