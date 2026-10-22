import { judgeJsonValue } from '@omne-harness/json-text'
import type {
  EnvironmentProvider,
  EnvironmentFacilities,
  EnvironmentBinding,
  EnvironmentContinuity,
  FacilityGuard,
  FacilityKey,
  LeaseInvalidation,
  LeaseRelease,
  ManagedResource,
  ProviderAcquireInput,
  ProviderAcquisition,
  RecoveryAuthority,
  RecoveryListing,
  ResourceLedger,
  ResourceRecovery,
  Retirement,
} from '../index.ts'
export type ProviderScript = Readonly<{
  name?: string
  generation?: string
  version?: string
  bindingKinds?: EnvironmentProvider['bindingKinds']
  continuity?: EnvironmentContinuity
  facilities?: readonly FacilityKey[]
  isolation?: EnvironmentProvider['isolation']
  lease?: Partial<EnvironmentFacilities>
  acquire?: (input: ProviderAcquireInput) => Promise<ProviderAcquisition>
  receiptBinding?: EnvironmentBinding
  extraReceiptFields?: Readonly<Record<string, unknown>>
  release?: () => Promise<LeaseRelease>
  retire?: () => Promise<Retirement>
  recoverable?: {
    list(scope: ProviderAcquireInput['scope']): Promise<RecoveryListing>
    recover(resource: ManagedResource): Promise<ResourceRecovery>
  }
}>
export function createScriptedEnvironmentProvider(script: ProviderScript = {}) {
  const evidence = judgeJsonValue({ kind: 'boolean', value: true })
  if (!('ok' in evidence)) throw new TypeError('invalid test evidence')
  const calls = { acquire: 0, release: 0, retire: 0, start: 0, list: 0, recover: 0 }
  let retired = false
  const notices: ((value: LeaseInvalidation) => void)[] = []
  const unknown = async (request: { readonly requestId: string }) => ({
    kind: 'unknown' as const,
    requestId: request.requestId,
  })
  const facilities: Partial<EnvironmentFacilities> = script.lease ?? {
    terminal: { create: unknown, execute: unknown, close: unknown, list: unknown },
    command: {
      async start(request) {
        calls.start++
        return { kind: 'unknown', requestId: request.requestId }
      },
    },
  }
  const recoverable = script.recoverable
  const provider: EnvironmentProvider = {
    name: script.name ?? 'scripted',
    generation: script.generation ?? 'g1',
    version: script.version ?? '0.0.0',
    bindingKinds: script.bindingKinds ?? ['host_machine', 'session_sandbox'],
    continuity: script.continuity ?? { kind: 'not_guaranteed' },
    facilities: script.facilities ?? ['command', 'terminal'],
    isolation: script.isolation ?? [],
    async describe() {
      return {
        provider: this.name,
        generation: this.generation,
        version: this.version,
        platform: { os: 'test', release: '1' },
        facilities: this.facilities,
        isolation: this.isolation,
        prerequisites: 'unknown',
      }
    },
    async acquire(input) {
      calls.acquire++
      if (retired) return { kind: 'rejected', reason: 'providerUnavailable' }
      if (script.acquire) return script.acquire(input)
      if (!this.bindingKinds.includes(input.placement.binding.kind))
        return { kind: 'rejected', reason: 'noMatchingEnvironment' }
      const actual = {
        ...input.placement,
        binding: script.receiptBinding ?? input.placement.binding,
      }
      return {
        kind: 'acquired',
        evidence: evidence.ok,
        ...script.extraReceiptFields,
        lease: {
          placement: actual,
          instance: { id: 'instance', generation: '1' },
          continuity: this.continuity,
          facility(key) {
            return facilities[key]
          },
          invalidated: new Promise(resolve => notices.push(resolve)),
          async release() {
            calls.release++
            return script.release ? script.release() : { kind: 'released' }
          },
        },
      }
    },
    async retire() {
      calls.retire++
      retired = true
      return script.retire ? script.retire() : { kind: 'drained' }
    },
    ...(recoverable
      ? {
          async listRecoveryResources(scope: ProviderAcquireInput['scope']) {
            calls.list++
            return recoverable.list(scope)
          },
          async recover(resource: ManagedResource) {
            calls.recover++
            return recoverable.recover(resource)
          },
        }
      : {}),
  }
  return Object.assign(provider, {
    durability: 'none' as const,
    calls,
    invalidateLeases(value: LeaseInvalidation) {
      for (const settle of notices) settle(value)
    },
  })
}
export type ScriptedEnvironmentProvider = ReturnType<typeof createScriptedEnvironmentProvider>
export function createMemoryResourceLedger(
  answers: Partial<{
    plan: 'recorded' | 'conflict' | 'closed' | 'unavailable'
    permit: 'confirmed' | 'closed' | 'unavailable'
    adopt: 'confirmed' | 'closed' | 'unavailable'
    stopped: 'recorded' | 'unavailable'
  }> = {},
) {
  const controller = new AbortController()
  const calls: { method: 'plan' | 'permit' | 'adopt' | 'stopped'; key: string }[] = []
  const ledger: ResourceLedger = {
    closed: controller.signal,
    async plan(resource) {
      calls.push({ method: 'plan', key: resource.key })
      return controller.signal.aborted ? 'closed' : (answers.plan ?? 'recorded')
    },
    async permit(key) {
      calls.push({ method: 'permit', key })
      return controller.signal.aborted ? 'closed' : (answers.permit ?? 'confirmed')
    },
    async adopt(key) {
      calls.push({ method: 'adopt', key })
      return controller.signal.aborted ? 'closed' : (answers.adopt ?? 'confirmed')
    },
    async stopped(key) {
      calls.push({ method: 'stopped', key })
      return answers.stopped ?? 'recorded'
    },
  }
  return {
    durability: 'none' as const,
    ledger,
    calls,
    close() {
      controller.abort()
    },
  }
}
export type MemoryResourceLedger = ReturnType<typeof createMemoryResourceLedger>
export function createScriptedFacilityGuard<P>(
  answer: 'authorized' | 'notAuthorized' | 'unavailable' = 'authorized',
) {
  const calls: { facility: FacilityKey; operation: string }[] = []
  const guard: FacilityGuard<P> = {
    async authorize(facility, operation) {
      calls.push({ facility, operation })
      return answer
    },
  }
  return Object.assign(guard, { durability: 'none' as const, calls })
}
export function createScriptedRecoveryAuthority(
  answer: 'authorized' | 'notAuthorized' | 'unavailable' = 'authorized',
): RecoveryAuthority & { readonly durability: 'none' } {
  return {
    durability: 'none',
    async authorizeRecovery() {
      return answer
    },
  }
}

export type ScriptedFacilityGuard<P> = ReturnType<typeof createScriptedFacilityGuard<P>>
export type ScriptedRecoveryAuthority = ReturnType<typeof createScriptedRecoveryAuthority>
