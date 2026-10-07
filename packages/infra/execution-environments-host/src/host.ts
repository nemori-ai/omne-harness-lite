import { randomUUID } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  EnvironmentDescription,
  EnvironmentLease,
  EnvironmentProvider,
  EnvironmentRejection,
} from '@omne-harness-lite/execution-environments'
import {
  captureCommandArguments,
  captureFileArguments,
  type CommandFacility,
  type FileFacility,
} from '@omne-harness-lite/execution-environments'
import type { SessionAccessOperations } from '@omne-harness-lite/session-tenancy'
import type { Storage } from '@omne-harness-lite/storage'
import { ownScope } from './values.ts'
import { captureAcquisition } from './acquisition.ts'
import { createHostOwner, type HostAcquireRequest } from './host-owner.ts'
import { createHostFiles } from './host-files.ts'
import { createHostTerminals } from './host-terminals.ts'
import {
  captureHostNativePolicy,
  defaultHostNativePolicy,
  type HostNativePolicy,
} from './native-policy.ts'

const reject = (reason: EnvironmentRejection['reason']): EnvironmentRejection => ({
  kind: 'rejected',
  reason,
})
/** The durable consumer of native actions. The assembly installs the exported migrations. */
export function createHostEnvironment(options: {
  readonly name: string
  readonly access: SessionAccessOperations
  readonly storage: Storage
  readonly policy?: HostNativePolicy
}): EnvironmentProvider {
  if (process.platform !== 'linux' || !process.getuid)
    throw new TypeError('Host execution requires Linux user scopes')
  if (!options.name || !options.storage)
    throw new TypeError('Host name and original Storage required')
  const generation = randomUUID(),
    policy = captureHostNativePolicy(options.policy ?? defaultHostNativePolicy)
  const owner = createHostOwner({
    name: options.name,
    generation,
    storage: options.storage,
    policy,
  })
  const terminals = createHostTerminals(owner, policy)
  const reference = Object.freeze({
    provider: options.name,
    reference: Object.freeze({ generation }),
  })
  const description: EnvironmentDescription = Object.freeze({
    reference,
    bindingLayer: 'host_machine',
    facilities: Object.freeze(['command', 'files']),
    instance: Object.freeze({ id: options.name, generation }),
    binding: Object.freeze({ kind: 'host_machine' as const }),
    continuity: Object.freeze({ kind: 'notGuaranteed' as const }),
  })
  const leases = new Set<EnvironmentLease['release']>()
  async function authorize(
    authorization: HostAcquireRequest['authorization'],
    scope: HostAcquireRequest['scope'],
    operation: 'environment.describe' | 'environment.acquire',
  ) {
    if (!owner.isActive()) return reject('ownerStopped')
    try {
      const decision = await options.access.authorize(authorization, scope, operation)
      if (!owner.isActive()) return reject('ownerStopped')
      return decision.kind === 'rejected' ? reject(decision.reason) : decision
    } catch {
      return reject('unavailable')
    }
  }
  function validateRequest(request: HostAcquireRequest) {
    const captured = captureAcquisition(request)
    if (!captured) return reject('invalidInput')
    if (captured.requirement.bindingLayer !== 'host_machine') return reject('noMatchingEnvironment')
    if (captured.requirement.facilities.some(name => name !== 'command' && name !== 'files'))
      return reject('missingFacility')
    if (
      captured.reference &&
      writeJsonLossless(captured.reference) !== writeJsonLossless(reference)
    )
      return reject('referenceExpired')
    return captured
  }
  function lease(request: HostAcquireRequest): EnvironmentLease {
    const invalidation = Promise.withResolvers<{ readonly reason: string }>()
    let held = true
    const open = () => held && owner.isActive() && !request.resources.closed.aborted
    const closure = new AbortController()
    const call = { ...request, resources: { ...request.resources, closed: closure.signal } }
    const files = createHostFiles(owner, call, policy)
    const command = {
      start: (value: Parameters<typeof owner.start>[1]) => owner.start(call, value),
      ...terminals.forCall(call),
    }
    function guard<T extends object>(port: T, kind: 'command' | 'files'): T {
      return Object.fromEntries(
        Object.entries(port).map(([key, operation]) => [
          key,
          async (...args: unknown[]) => {
            const captured =
              kind === 'command'
                ? captureCommandArguments(key as keyof CommandFacility, args)
                : captureFileArguments(key as keyof FileFacility, args)
            if (!captured) return { kind: 'rejected', reason: 'invalidInput' }
            if (!open()) return { kind: 'rejected', reason: 'closed' }
            const checked = await authorize(
              request.authorization,
              request.scope,
              'environment.acquire',
            )
            if (checked.kind === 'rejected')
              return {
                kind: 'rejected',
                reason: checked.reason === 'notAuthorized' ? 'notAuthorized' : 'unavailable',
              }
            if (!open()) return { kind: 'rejected', reason: 'closed' }
            return Reflect.apply(operation, port, captured)
          },
        ]),
      ) as T
    }
    async function release(): ReturnType<EnvironmentLease['release']> {
      held = false
      closure.abort()
      invalidation.resolve({ reason: 'ownerStopped' })
      request.resources.closed.removeEventListener('abort', invalidated)
      const pending = await owner.release(request)
      if (pending.length) return { kind: 'pending', resources: pending }
      leases.delete(release)
      return { kind: 'released' }
    }
    function invalidated() {
      held = false
      closure.abort()
      invalidation.resolve({ reason: 'ownerStopped' })
      // Retire retries this original lease if asynchronous release cannot complete.
      void release().catch(() => {
        /* The original release remains registered for explicit retire retry. */
      })
    }
    request.resources.closed.addEventListener('abort', invalidated, { once: true })
    leases.add(release)
    return Object.freeze({
      facilities: Object.freeze({
        description,
        command: guard(command, 'command'),
        files: guard(files, 'files'),
      }),
      invalidated: invalidation.promise,
      release,
    })
  }
  return Object.freeze({
    name: options.name,
    generation,
    async describe(rawScope, authorization) {
      const scope = ownScope(rawScope)
      if (!scope) return reject('invalidInput')
      const checked = await authorize(authorization, scope, 'environment.describe')
      return checked.kind === 'rejected' ? checked : { kind: 'descriptions', values: [description] }
    },
    async acquire(request) {
      const checked = validateRequest(request)
      if ('kind' in checked) return checked
      const decision = await authorize(request.authorization, checked.scope, 'environment.acquire')
      if (decision.kind === 'rejected') return decision
      if (request.resources.closed.aborted) return reject('ownerStopped')
      try {
        await owner.verify()
      } catch {
        return reject('unavailable')
      }
      return {
        kind: 'acquired',
        lease: lease({ ...request, ...checked }),
        evidence: {
          provider: options.name,
          generation,
          reference: reference.reference,
          facilities: description.facilities,
        },
      }
    },
    async listRecoveryResources(scope) {
      const captured = ownScope(scope)
      if (!captured) return { kind: 'unavailable' }
      try {
        return { kind: 'resources', values: await owner.list(captured) }
      } catch {
        return { kind: 'unavailable' }
      }
    },
    recover: owner.recover,
    async retire() {
      const resources = await owner.retire()
      let leasePending = false
      for (const release of [...leases]) {
        try {
          const result = await release()
          if (result.kind === 'pending') {
            leasePending = true
            resources.push(...result.resources)
          }
        } catch {
          leasePending = true
        }
      }
      return leasePending || resources.length || owner.hasPendingWork()
        ? {
            kind: 'pending',
            resources: [...new Map(resources.map(resource => [resource.key, resource])).values()],
          }
        : { kind: 'drained' }
    },
  } satisfies EnvironmentProvider)
}
