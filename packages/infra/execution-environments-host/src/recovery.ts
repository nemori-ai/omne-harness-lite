import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type {
  EnvironmentProviderRegistrations,
  ResourceRecoveryAuthority,
  ResourceRecoveryResult,
  OwnedRecoveryResult,
  ManagedResource,
} from '@omne-harness-lite/execution-environments'
import { ownScope, ownResources } from './values.ts'
import { observeProvider, rejectEnvironment, type ProviderEntry } from './provider-work.ts'

function captureResult(input: unknown): ResourceRecoveryResult | undefined {
  const copied = copyJsonValue(input)
  if ('failed' in copied) return undefined
  const value = copied.ok
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (
    !('status' in value) ||
    !['confirmedStopped', 'pending', 'unsupported'].includes(String(value.status))
  )
    return undefined
  if (Object.keys(value).some(key => key !== 'status' && key !== 'evidence')) return undefined
  return value as unknown as ResourceRecoveryResult
}

export function createRecoveryOperations(input: {
  readonly active: () => boolean
  readonly entries: () => readonly ProviderEntry[]
  readonly provider: (name: string) => ProviderEntry | undefined
  readonly authority: ResourceRecoveryAuthority
}): Pick<EnvironmentProviderRegistrations, 'recover' | 'recoverOwned'> {
  const authorize = input.authority.authorizeRecovery.bind(input.authority)
  async function recoverOne(entry: ProviderEntry, resource: ManagedResource) {
    return captureResult(await observeProvider(entry, () => entry.provider.recover(resource)))
  }
  return {
    async recover(rawScope, access, rawResources) {
      if (!input.active()) return rejectEnvironment('ownerStopped')
      const scope = ownScope(rawScope),
        resources = ownResources(rawResources)
      if (!scope || !resources) return rejectEnvironment('invalidInput')
      try {
        const decision = await authorize(access, scope, resources)
        if (!input.active()) return rejectEnvironment('ownerStopped')
        if (decision !== 'authorized') return rejectEnvironment(decision)
        const values: ({ resource: ManagedResource } & ResourceRecoveryResult)[] = []
        for (const resource of resources) {
          const entry = input.provider(resource.provider)
          if (!entry) return rejectEnvironment('providerUnavailable')
          const result = await recoverOne(entry, resource)
          if (!result) return rejectEnvironment('providerUnavailable')
          values.push({ resource, ...result })
        }
        return Object.freeze(values)
      } catch {
        return rejectEnvironment('unavailable')
      }
    },
    async recoverOwned(rawScope, access): Promise<OwnedRecoveryResult> {
      if (!input.active()) return rejectEnvironment('ownerStopped')
      const scope = ownScope(rawScope)
      if (!scope) return rejectEnvironment('invalidInput')
      try {
        const decision = await authorize(access, scope, [])
        if (!input.active()) return rejectEnvironment('ownerStopped')
        if (decision !== 'authorized') return rejectEnvironment(decision)
      } catch {
        return rejectEnvironment('unavailable')
      }
      const values: ({ resource: ManagedResource } & ResourceRecoveryResult)[] = []
      const failures: Extract<OwnedRecoveryResult, { kind: 'recovered' }>['failures'][number][] = []
      async function group(entry: ProviderEntry) {
        try {
          const enumerated = await observeProvider(entry, () =>
            entry.provider.listRecoveryResources(scope!),
          )
          const resources =
            enumerated.kind === 'resources' ? ownResources(enumerated.values) : undefined
          if (!resources || resources.some(resource => resource.provider !== entry.provider.name)) {
            failures.push({ provider: entry.provider.name, reason: 'providerUnavailable' })
            return
          }
          let decision: Awaited<ReturnType<typeof authorize>>
          try {
            decision = await authorize(access, scope!, resources)
          } catch {
            failures.push({ provider: entry.provider.name, reason: 'unavailable' })
            return
          }
          if (decision !== 'authorized') {
            failures.push({ provider: entry.provider.name, reason: decision })
            return
          }
          await recoverGroup(entry, resources)
        } catch {
          failures.push({ provider: entry.provider.name, reason: 'providerUnavailable' })
        }
      }
      async function recoverGroup(entry: ProviderEntry, resources: readonly ManagedResource[]) {
        for (const resource of resources) {
          try {
            if (!input.active()) throw new Error('Registry recovery admission closed')
            const result = await recoverOne(entry, resource)
            if (!result) throw new Error('Provider recovery result invalid')
            values.push({ resource, ...result })
          } catch {
            values.push({ resource, status: 'pending' })
            failures.push({ provider: entry.provider.name, reason: 'providerUnavailable' })
          }
        }
      }
      for (const entry of input.entries()) await group(entry)
      return Object.freeze({
        kind: 'recovered',
        values: Object.freeze(values),
        failures: Object.freeze(failures),
      })
    },
  }
}
