import {
  captureEnvironmentCall,
  environmentVisibleInScope,
} from '@omne-harness-lite/execution-environments'
import { createPlacementAuthority } from './placement.ts'
import { createRecoveryOperations } from './recovery.ts'
import { createEnvironmentAcquirer } from './acquire.ts'
import {
  observeProvider as observed,
  rejectEnvironment as reject,
  releaseProvisional,
  type ProviderEntry as Entry,
} from './provider-work.ts'
import type {
  EnvironmentDescription,
  EnvironmentProviderRegistrations,
  ExecutionEnvironmentOperations,
  ResourceRecoveryAuthority,
} from '@omne-harness-lite/execution-environments'
import type {
  AccessOperation,
  SessionAccess,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'
import { ownScope, ownDescription } from './values.ts'

export function createEnvironmentRegistry(deps: {
  readonly access: SessionAccessOperations
  readonly recovery: ResourceRecoveryAuthority
}) {
  let active = true
  const placement = createPlacementAuthority(() => active)
  const entries = new Map<string, Entry>(),
    retiring = new Set<Entry>()
  async function authorize(
    authorization: SessionAccess,
    scope: SessionScope,
    operation: AccessOperation,
  ) {
    if (!active) return reject('ownerStopped')
    try {
      const result = await deps.access.authorize(authorization, scope, operation)
      if (!active) return reject('ownerStopped')
      return result.kind === 'rejected' ? reject(result.reason) : result
    } catch {
      return reject('unavailable')
    }
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
          if (
            description.reference.provider !== entry.provider.name ||
            !environmentVisibleInScope(description, scope) ||
            new Set(description.facilities).size !== description.facilities.length
          )
            return reject('providerUnavailable')
          output.push({ entry, description })
        }
      }
      return { output }
    } catch {
      return reject('providerUnavailable')
    }
  }
  const registrations: EnvironmentProviderRegistrations = {
    ...createRecoveryOperations({
      active: () => active,
      entries: () => [...entries.values(), ...retiring],
      provider: name => entries.get(name),
      authority: deps.recovery,
    }),
    registerProvider(input) {
      if (!active) throw new Error('environment registry stopped')
      if (
        !input.name ||
        !input.generation ||
        ![
          input.acquire,
          input.describe,
          input.listRecoveryResources,
          input.recover,
          input.retire,
        ].every(value => typeof value === 'function')
      )
        throw new TypeError('invalid environment provider')
      if (entries.has(input.name)) throw new Error('duplicate environment provider')
      const provider = Object.freeze({
        name: input.name,
        generation: input.generation,
        acquire: input.acquire.bind(input),
        describe: input.describe.bind(input),
        recover: input.recover.bind(input),
        listRecoveryResources: input.listRecoveryResources.bind(input),
        retire: input.retire.bind(input),
      })
      let retirement: Promise<void> | undefined
      const entry: Entry = {
        provider,
        active: true,
        jobs: new Set(),
        provisional: new Set(),
        dispose() {
          if (retirement) return retirement
          entry.active = false
          if (entries.get(provider.name) === entry) entries.delete(provider.name)
          retiring.add(entry)
          const task = (async () => {
            await Promise.allSettled([...entry.jobs])
            await releaseProvisional(entry)
            const result = await provider.retire()
            if (result.kind !== 'drained')
              throw new Error('environment cleanup pending; original provider retained')
            retiring.delete(entry)
          })()
          retirement = task
          void task.catch(() => {
            if (retirement === task) retirement = undefined
          })
          return task
        },
      }
      entries.set(provider.name, entry)
      return entry.dispose
    },
  }

  const operations: ExecutionEnvironmentOperations = {
    async resolvePlacement(inputScope, authorization, inputCall) {
      const scope = ownScope(inputScope),
        call = captureEnvironmentCall(inputCall)
      if (!scope || !call) return reject('invalidInput')
      const before = await authorize(authorization, scope, 'environment.acquire')
      if (before.kind === 'rejected') return before
      const ticket = await placement.read({ scope, authorization, call })
      const after = await authorize(authorization, scope, 'environment.acquire')
      if (after.kind === 'rejected') return after
      if ('kind' in ticket)
        return ticket.reason === 'notApplicable'
          ? { kind: 'notApplicable' }
          : { kind: 'rejected', reason: ticket.reason }
      if (!placement.current(ticket)) return reject('placementChanged')
      return { kind: 'placement', placement: ticket.placement }
    },
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
      return {
        kind: 'descriptions',
        values: Object.freeze(result.output.map(item => item.description)),
      }
    },
    acquire: createEnvironmentAcquirer({
      active: () => active,
      placement,
      providers: reference => {
        if (!reference) return [...entries.values()]
        const entry = entries.get(reference.provider)
        return entry ? [entry] : []
      },
      authorize: (authorization, scope) => authorize(authorization, scope, 'environment.acquire'),
    }),
  }
  return {
    operations: Object.freeze(operations),
    registrations: Object.freeze(registrations),
    placements: Object.freeze(placement.registrations),
    async close() {
      active = false
      const results = await Promise.allSettled([
        placement.drain(),
        ...[...new Set([...entries.values(), ...retiring])].map(entry => entry.dispose()),
      ])
      if (results.some(result => result.status === 'rejected'))
        throw new Error('environment registry retains unfinished cleanup')
    },
  }
}
