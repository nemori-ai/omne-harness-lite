import { validate, type ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { TransportAdapter, PlanInput } from '@omne-harness-lite/model-request-runtime'
import { ownDefinitions, jsonEqual, type ModelDefinition } from './definitions.ts'
import { interpretConfiguration } from './configuration.ts'
import { ownedObject } from './json.ts'
import { planRequest, type PlannedRequest } from './plan.ts'
import { createOwnedTransport, type TransportOptions } from './transport.ts'
import type { RawResponse } from './http.ts'
import { meterMatches, ownInputMeter, type InputMeter } from './input-meter.ts'

export interface RetirementPolicy {
  readonly waitMilliseconds: number
  readonly force: boolean
  readonly schedule: (milliseconds: number, callback: () => void) => () => void
}
export type RetirementResult =
  | { readonly retired: true }
  | { readonly remaining_active: true; readonly references: number; readonly executions: number }
  | { readonly cleanup_failed: true }
  | { readonly rejected: 'invalidInput' }
export interface AdaptationRegistration {
  readonly definition: ModelDefinition
}
export interface AdaptationLease {
  readonly binding: ModelAdaptationBinding
  readonly transport: TransportAdapter<PlannedRequest, RawResponse>
  readonly signal: AbortSignal
  /** Retains this lease until the registered callback/settlement work actually completes. */
  readonly track: <T>(completion: Promise<T>) => Promise<T>
  /** Stops admitting new work; pending executions retain the reference until they finish. */
  readonly release: () => void
}
export interface ModelTransportService {
  readonly registerAdaptation: (
    definition: ModelDefinition,
    meter: InputMeter,
    owner: object,
    cleanup: () => void | Promise<void>,
  ) => { readonly registered: AdaptationRegistration } | { readonly rejected: 'invalidInput' }
  readonly acquire: (
    binding: ModelAdaptationBinding,
    routeName: string,
  ) => { readonly lease: AdaptationLease } | { readonly rejected: 'invalidInput' | 'unavailable' }
  readonly retire: (
    registration: AdaptationRegistration,
    policy: RetirementPolicy,
  ) => Promise<RetirementResult>
  readonly close: (policy: RetirementPolicy) => Promise<RetirementResult>
  /** Only resolves after contributions, executions and the owned connection pool have stopped. */
  readonly closed: Promise<void>
  readonly inspect: () => {
    readonly accepting: boolean
    readonly registrations: number
    readonly retiring: number
    readonly references: number
    readonly executions: number
    readonly cleanupFailures: number
  }
}

interface User {
  readonly controller: AbortController
  executions: number
  released: boolean
}
interface Entry {
  readonly registration: AdaptationRegistration
  readonly owner: object
  readonly cleanup: () => void | Promise<void>
  readonly content: ModelDefinition
  readonly meter: InputMeter
  readonly meterSource: InputMeter
  readonly key: string
  readonly users: Set<User>
  readonly completed: Promise<RetirementResult>
  readonly complete: (result: RetirementResult) => void
  retiring: boolean
  cleanupStarted: boolean
  cleanupFailed: boolean
}
export function retirementPolicyValid(value: unknown): value is RetirementPolicy {
  return (
    !!value &&
    typeof value === 'object' &&
    'waitMilliseconds' in value &&
    typeof value.waitMilliseconds === 'number' &&
    Number.isSafeInteger(value.waitMilliseconds) &&
    value.waitMilliseconds > 0 &&
    'force' in value &&
    typeof value.force === 'boolean' &&
    'schedule' in value &&
    typeof value.schedule === 'function'
  )
}
function key(binding: Pick<ModelAdaptationBinding, 'implementation' | 'definition'>): string {
  return JSON.stringify([
    binding.implementation.name,
    binding.implementation.revision,
    binding.definition.modelId,
    binding.definition.revision,
  ])
}
function ownBinding(binding: ModelAdaptationBinding): ModelAdaptationBinding | undefined {
  if (!validate('ModelAdaptationBinding', binding).valid) return undefined
  const values = ownedObject(binding.configuration.values)
  if (!values) return undefined
  return Object.freeze({
    implementation: Object.freeze({ ...binding.implementation }),
    definition: Object.freeze({ ...binding.definition }),
    configuration: Object.freeze({ revision: binding.configuration.revision, values }),
  })
}
/** Process-local adaptation ownership. There is no directory, authorization or durable state. */
export function createModelTransportService(
  options: Omit<TransportOptions, 'definitions' | 'inputMeters'>,
): ModelTransportService {
  const {
    transport: network,
    stopAdmission,
    claim,
  } = createOwnedTransport({
    ...options,
    definitions: [],
    inputMeters: [],
  })
  const entries = new Map<string, Entry>()
  // Retiring does not authorize reusing a revision for different immutable content.
  const declarations = new Map<string, { definition: ModelDefinition; meter: InputMeter }>()
  const registrations = new WeakMap<AdaptationRegistration, Entry>()
  let accepting = true,
    networkClosing = false
  let resolveClosed: () => void = () => {}
  let rejectClosed: (error: unknown) => void = () => {}
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve
    rejectClosed = reject
  })
  // Preserve rejection for callers while preventing a detached lifecycle error.
  void closed.catch(() => {})
  function finishNetwork(): void {
    if (accepting || entries.size || networkClosing) return
    networkClosing = true
    void network.close().then(resolveClosed, rejectClosed)
  }
  function finishEntry(entry: Entry): void {
    if (!entry.retiring || entry.users.size || entry.cleanupStarted) return
    entry.cleanupStarted = true
    void Promise.resolve()
      .then(entry.cleanup)
      .then(
        () => {
          if (entries.get(entry.key) === entry) entries.delete(entry.key)
          entry.complete({ retired: true })
          finishNetwork()
        },
        () => {
          entry.cleanupFailed = true
          entry.complete({ cleanup_failed: true })
        },
      )
  }
  function dropUser(entry: Entry, user: User): void {
    if (user.released && user.executions === 0) {
      entry.users.delete(user)
      finishEntry(entry)
    }
  }
  function retain<T>(entry: Entry, user: User, completion: Promise<T>): Promise<T> {
    user.executions++
    const finished = () => {
      user.executions--
      dropUser(entry, user)
    }
    void completion.then(finished, finished)
    return completion
  }
  function status(): ReturnType<ModelTransportService['inspect']> {
    const all = [...entries.values()]
    const users = all.flatMap(entry => [...entry.users])
    return Object.freeze({
      accepting,
      registrations: all.length,
      retiring: all.filter(entry => entry.retiring).length,
      references: users.length,
      executions: users.reduce((sum, user) => sum + user.executions, 0),
      cleanupFailures: all.filter(entry => entry.cleanupFailed).length,
    })
  }
  async function retire(
    registration: AdaptationRegistration,
    policy: RetirementPolicy,
  ): Promise<RetirementResult> {
    const entry = registrations.get(registration)
    if (!entry || !retirementPolicyValid(policy)) return { rejected: 'invalidInput' }
    const ownedPolicy = { ...policy }
    entry.retiring = true // Local linearization: no await before new acquisition is forbidden.
    if (ownedPolicy.force) for (const user of entry.users) user.controller.abort()
    finishEntry(entry)
    let dispose = () => {}
    const expired = new Promise<RetirementResult>(resolve => {
      dispose = ownedPolicy.schedule(ownedPolicy.waitMilliseconds, () => {
        resolve({
          remaining_active: true,
          references: entry.users.size,
          executions: [...entry.users].reduce((sum, user) => sum + user.executions, 0),
        })
      })
    })
    try {
      return await Promise.race([entry.completed, expired])
    } finally {
      dispose()
    }
  }
  const service: ModelTransportService = {
    closed,
    inspect: status,
    retire,
    registerAdaptation(definition, meterSource, owner, cleanup) {
      if (!accepting || !owner || typeof owner !== 'object' || typeof cleanup !== 'function')
        return { rejected: 'invalidInput' }
      let owned: ModelDefinition | undefined
      try {
        owned = ownDefinitions([definition])[0]
      } catch (error) {
        if (error instanceof TypeError) return { rejected: 'invalidInput' }
        throw error
      }
      if (!owned) return { rejected: 'invalidInput' }
      const meter = ownInputMeter(meterSource)
      if (
        !meter ||
        !Object.hasOwn(owned.routes, meter.provider) ||
        !meterMatches(meter, owned, meter.provider)
      )
        return { rejected: 'invalidInput' }
      const exact = key({
        implementation: owned.implementation,
        definition: { modelId: owned.modelId, revision: owned.revision },
      })
      const content = owned
      const equivalent = (other: ModelDefinition) => {
        const left = copyJsonValue(content),
          right = copyJsonValue(other)
        return 'ok' in left && 'ok' in right && jsonEqual(left.ok, right.ok)
      }
      const declaration = declarations.get(exact)
      if (declaration && (!equivalent(declaration.definition) || declaration.meter !== meterSource))
        return { rejected: 'invalidInput' }
      const prior = entries.get(exact)
      if (prior)
        return !prior.retiring &&
          prior.owner === owner &&
          prior.cleanup === cleanup &&
          prior.meterSource === meterSource &&
          equivalent(prior.content)
          ? { registered: prior.registration }
          : { rejected: 'invalidInput' }
      const registration = Object.freeze({ definition: owned })
      let complete: Entry['complete'] = () => {}
      const completed = new Promise<RetirementResult>(resolve => {
        complete = resolve
      })
      const entry: Entry = {
        registration,
        owner,
        cleanup,
        key: exact,
        content,
        meter,
        meterSource,
        users: new Set(),
        completed,
        complete,
        retiring: false,
        cleanupStarted: false,
        cleanupFailed: false,
      }
      entries.set(exact, entry)
      registrations.set(registration, entry)
      declarations.set(exact, { definition: content, meter: meterSource })
      return { registered: registration }
    },
    acquire(binding, routeName) {
      const owned = ownBinding(binding)
      if (!owned || typeof routeName !== 'string' || owned.definition.modelId !== routeName)
        return { rejected: 'invalidInput' }
      const entry = entries.get(key(owned))
      if (!accepting || !entry || entry.retiring) return { rejected: 'unavailable' }
      const definition = entry.registration.definition
      if (
        !Object.keys(definition.routes).some(
          provider =>
            'ok' in interpretConfiguration(definition, owned.configuration.values, provider),
        )
      )
        return { rejected: 'invalidInput' }
      const user: User = { controller: new AbortController(), executions: 0, released: false }
      entry.users.add(user)
      const signal = user.controller.signal
      const fixedBinding = owned
      const issuedPlans = new WeakSet<PlannedRequest>()
      function sameBinding(input: PlanInput): boolean {
        // Exact configuration values remain those owned by this acquisition, even at an idle interval.
        if (!input || !input.snapshot) return false
        const actual = ownBinding(input.snapshot.adaptation)
        return (
          !!actual &&
          input.routeName === routeName &&
          key(actual) === key(fixedBinding) &&
          actual.configuration.revision === fixedBinding.configuration.revision &&
          jsonEqual(actual.configuration.values, fixedBinding.configuration.values)
        )
      }
      const transport = Object.freeze<AdaptationLease['transport']>({
        plan: (input: PlanInput) => {
          if (user.released || !sameBinding(input))
            return { rejected: 'invalidInput', reason: 'malformed' }
          const result = planRequest(input, [definition], entry.meter)
          if ('planned' in result) {
            claim(result.planned)
            issuedPlans.add(result.planned)
          }
          return result
        },
        send: (planned, credential, cancellation) => {
          if (
            user.released ||
            !issuedPlans.has(planned) ||
            !sameBinding(planned.input) ||
            !(cancellation instanceof AbortSignal)
          )
            return Promise.resolve({ rejected: 'invalidInput' })
          const completion = network
            .send(planned, credential, AbortSignal.any([signal, cancellation]))
            .then(result => {
              if ('response' in result) retain(entry, user, result.response.stopped)
              return result
            })
          return retain(entry, user, completion)
        },
        read: async function* (response, planned, cancellation) {
          if (
            user.released ||
            !issuedPlans.has(planned) ||
            !sameBinding(planned.input) ||
            !(cancellation instanceof AbortSignal)
          )
            return { rejected: 'invalidInput' }
          let done = () => {}
          retain(
            entry,
            user,
            new Promise<void>(resolve => {
              done = resolve
            }),
          )
          try {
            return yield* network.read(response, planned, AbortSignal.any([signal, cancellation]))
          } finally {
            done()
          }
        },
      })
      const lease: AdaptationLease = Object.freeze({
        binding: owned,
        transport,
        signal,
        track: <T>(completion: Promise<T>) => {
          if (user.released || !(completion instanceof Promise))
            throw new TypeError('active lease and completion promise required')
          return retain(entry, user, completion)
        },
        release: () => {
          if (!user.released) {
            user.released = true
            dropUser(entry, user)
          }
        },
      })
      return { lease }
    },
    async close(policy) {
      if (!retirementPolicyValid(policy)) return { rejected: 'invalidInput' }
      accepting = false
      stopAdmission()
      const results = await Promise.all(
        [...entries.values()].map(entry => retire(entry.registration, policy)),
      )
      finishNetwork()
      if (results.some(result => 'cleanup_failed' in result)) return { cleanup_failed: true }
      const current = status()
      if (entries.size)
        return {
          remaining_active: true,
          references: current.references,
          executions: current.executions,
        }
      await closed
      return { retired: true }
    },
  }
  return Object.freeze(service)
}
