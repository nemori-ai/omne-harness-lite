import type {
  EnvironmentAcquisition, EnvironmentDescription, EnvironmentProvider, EnvironmentProviderRegistrations,
  EnvironmentRejection, ExecutionEnvironmentOperations, ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import type { AccessOperation, SessionAccess, SessionAccessOperations, SessionScope } from '@omne-harness-lite/session-tenancy'
import { ownScope, ownDescription, ownReference, ownRequirement, ownResources } from './values.ts'

const reject = (reason: EnvironmentRejection['reason']): EnvironmentRejection => ({ kind: 'rejected', reason })
interface Entry { readonly provider: EnvironmentProvider; active: boolean; readonly jobs: Set<Promise<unknown>>; dispose(): Promise<void> }
export function createEnvironmentRegistry(deps: { readonly access: SessionAccessOperations; readonly recovery: ResourceRecoveryAuthority }) {
  let active = true
  const entries = new Map<string, Entry>(), retiring = new Set<Entry>()
  async function authorize(authorization: SessionAccess, scope: SessionScope, operation: AccessOperation) {
    if (!active) return reject('ownerStopped')
    try {
      const result = await deps.access.authorize(authorization, scope, operation)
      if (!active) return reject('ownerStopped')
      return result.kind === 'rejected' ? reject(result.reason) : result
    } catch { return reject('unavailable') }
  }
  async function observed<T>(entry: Entry, task: () => Promise<T>): Promise<T> {
    const job = Promise.resolve().then(task)
    entry.jobs.add(job)
    try { return await job } finally { entry.jobs.delete(job) }
  }
  async function descriptions(scope: SessionScope, authorization: SessionAccess) {
    const output: { readonly entry: Entry; readonly description: EnvironmentDescription }[] = []
    try {
      for (const entry of entries.values()) {
        const result = await observed(entry, () => entry.provider.describe(scope, authorization))
        if (!entry.active) return reject('providerUnavailable')
        if (result.kind === 'rejected') return result
        for (const raw of result.values) {
          const description = ownDescription(raw)
          if (!description) return reject('providerUnavailable')
          if (description.reference.provider !== entry.provider.name || new Set(description.facilities).size !== description.facilities.length) return reject('providerUnavailable')
          output.push({ entry, description })
        }
      }
      return { output }
    } catch { return reject('providerUnavailable') }
  }
  const registrations: EnvironmentProviderRegistrations = {
    registerProvider(input) {
      if (!active) throw new Error('environment registry stopped')
      if (!input.name || !input.generation || ![input.acquire, input.describe, input.recover, input.retire].every(value => typeof value === 'function')) throw new TypeError('invalid environment provider')
      if (entries.has(input.name)) throw new Error('duplicate environment provider')
      const provider = Object.freeze({ name: input.name, generation: input.generation,
        acquire: input.acquire.bind(input), describe: input.describe.bind(input), recover: input.recover.bind(input), retire: input.retire.bind(input) })
      let retirement: Promise<void> | undefined
      const entry: Entry = { provider, active: true, jobs: new Set(),
        dispose() {
          if (retirement) return retirement
          entry.active = false
          if (entries.get(provider.name) === entry) entries.delete(provider.name)
          retiring.add(entry)
          const task = (async () => {
            await Promise.allSettled([...entry.jobs])
            const result = await provider.retire()
            if (result.kind !== 'drained') throw new Error('environment cleanup pending; original provider retained')
            retiring.delete(entry)
          })()
          retirement = task
          void task.catch(() => { if (retirement === task) retirement = undefined })
          return task
        },
      }
      entries.set(provider.name, entry)
      return entry.dispose
    },
    async recover(inputScope, authorization, inputResources) {
      if (!active) return reject('ownerStopped')
      const scope = ownScope(inputScope), resources = ownResources(inputResources)
      if (!scope || !resources) return reject('invalidInput')
      try {
        const result = await deps.recovery.authorizeRecovery(authorization, scope, resources)
        if (!active) return reject('ownerStopped')
        if (result !== 'authorized') return reject(result)
        const values: {resource: (typeof resources)[number]; status: 'confirmedStopped' | 'pending' | 'unsupported'}[] = []
        for (const resource of resources) {
          const entry = entries.get(resource.provider)
          if (!entry) return reject('providerUnavailable')
          const status = await observed(entry, () => entry.provider.recover(resource))
          if (!['confirmedStopped', 'pending', 'unsupported'].includes(status)) return reject('providerUnavailable')
          values.push({ resource, status })
        }
        return Object.freeze(values)
      } catch { return reject('unavailable') }
    },
  }
  const operations: ExecutionEnvironmentOperations = {
    async describe(inputScope, authorization) {
      const scope = ownScope(inputScope)
      if (!scope) return reject('invalidInput')
      const access = await authorize(authorization, scope, 'environment.describe')
      if (access.kind === 'rejected') return access
      const result = await descriptions(scope, authorization)
      if ('kind' in result) return result
      const latest = await authorize(authorization, scope, 'environment.describe')
      if (latest.kind === 'rejected') return latest
      if (result.output.some(item => !item.entry.active)) return reject('providerUnavailable')
      return { kind: 'descriptions', values: Object.freeze(result.output.map(item => item.description)) }
    },
    async acquire(request): Promise<EnvironmentAcquisition> {
      if (request === null || typeof request !== 'object') return reject('invalidInput')
      const scope = ownScope(request.scope), requirement = ownRequirement(request.requirement)
      const reference = request.reference === undefined ? undefined : ownReference(request.reference)
      if (!scope || !requirement || (request.reference !== undefined && !reference) || !(request.resources?.closed instanceof AbortSignal) || ![request.resources.plan, request.resources.permit, request.resources.stopped].every(value => typeof value === 'function')) return reject('invalidInput')
      const resources = Object.freeze({ closed: request.resources.closed, plan: request.resources.plan.bind(request.resources), permit: request.resources.permit.bind(request.resources), stopped: request.resources.stopped.bind(request.resources) })
      const input = Object.freeze({ scope, requirement, resources, authorization: request.authorization, ...(reference ? { reference } : {}) })
      const access = await authorize(input.authorization, input.scope, 'environment.acquire')
      if (access.kind === 'rejected') return access
      if (input.resources.closed.aborted) return reject('ownerStopped')
      // An explicit reference selects its owner. Without one, only an unambiguous owner may decide.
      const entry = input.reference ? entries.get(input.reference.provider) : entries.size === 1 ? entries.values().next().value : undefined
      if (!entry) return reject('noMatchingEnvironment')
      if (!entry.active) return reject('providerUnavailable')
      try {
        const result = await observed(entry, () => entry.provider.acquire(input))
        if (result.kind !== 'acquired') return result
        if (!entry.active || !active || input.resources.closed.aborted) {
          await result.lease.release()
          return reject(active ? 'providerUnavailable' : 'ownerStopped')
        }
        return result
      } catch { return reject('providerUnavailable') }
    },
  }
  return { operations: Object.freeze(operations), registrations: Object.freeze(registrations),
    async close() {
      active = false
      const results = await Promise.allSettled([...new Set([...entries.values(), ...retiring])].map(entry => entry.dispose()))
      if (results.some(result => result.status === 'rejected')) throw new Error('environment registry retains unfinished cleanup')
    },
  }
}
