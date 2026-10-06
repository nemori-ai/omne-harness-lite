import type {
  RetirementResult,
  AdaptationRegistration,
  AdaptationLease,
  ModelTransportService,
} from '@omne-harness-lite/model-request-runtime'
import { type RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { emptyReadFacts } from './read-facts.ts'
import { validate, type ModelAdaptationBinding } from '@omne-harness-lite/model-profile'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type {
  DiagnosticEmitter,
  DiagnosticEvent,
  DiagnosticFact,
  DiagnosticOutcome,
} from '@omne-harness-lite/model-request-runtime'
import type {
  TransportAdapter,
  PlanInput,
  TransportExecutionDiagnostics,
} from '@omne-harness-lite/model-request-runtime'
import { ownDefinitions, jsonEqual } from './definitions.ts'
import { type ModelDefinition } from '@omne-harness-lite/model-request-runtime'
import { interpretConfiguration } from './configuration.ts'
import { ownedObject } from './json.ts'
import { type PlannedRequest } from '@omne-harness-lite/model-request-runtime'
import { createOwnedTransport, type TransportOptions } from './transport.ts'
import type { RawResponse } from '@omne-harness-lite/model-request-runtime'
import { meterMatches, ownInputMeter } from './input-meter.ts'
import { type InputMeter } from '@omne-harness-lite/model-request-runtime'
import { registryDiagnosticReporter } from './diagnostics.ts'

interface User {
  readonly controller: AbortController
  readonly configurationRevision: string
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
  options: Omit<TransportOptions, 'definitions' | 'inputMeters'> & {
    /** Already scoped to this service generation by the owning assembly. */
    readonly registryDiagnostics?: Pick<DiagnosticEmitter, 'record'>
  },
): ModelTransportService {
  const { registryDiagnostics, ...transportOptions } = options
  const diagnostic = registryDiagnosticReporter(registryDiagnostics)
  const {
    transport: network,
    stopAdmission,
    claim,
    plan,
  } = createOwnedTransport({
    ...transportOptions,
    definitions: [],
    inputMeters: [],
  })
  const entries = new Map<string, Entry>()
  // Retiring does not authorize reusing a revision for different immutable content.
  const declarations = new Map<string, { definition: ModelDefinition; meter: InputMeter }>()
  const registrations = new WeakMap<AdaptationRegistration, Entry>()
  type RegistrationFact = Extract<DiagnosticFact, { kind: 'registration' }>
  function safeCount(value: number): JsonNumber | undefined {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined
  }
  function counts(entry: Entry): Pick<RegistrationFact, 'references' | 'executions'> {
    const references = safeCount(entry.users.size)
    const executions = safeCount([...entry.users].reduce((sum, user) => sum + user.executions, 0))
    return {
      ...(references === undefined ? {} : { references }),
      ...(executions === undefined ? {} : { executions }),
    }
  }
  function recordRegistry(
    stage: 'registration' | 'retirement',
    outcome: DiagnosticOutcome,
    facts: Omit<RegistrationFact, 'kind'>,
    entry?: Entry,
    configurationRevision?: string,
  ): void {
    const event: DiagnosticEvent = Object.freeze({
      source: 'transport',
      stage,
      outcome,
      ...(entry
        ? {
            binding: Object.freeze({
              implementation: entry.content.implementation.name,
              implementationRevision: entry.content.implementation.revision,
              modelId: entry.content.modelId,
              definitionRevision: entry.content.revision,
              ...(configurationRevision === undefined ? {} : { configurationRevision }),
            }),
          }
        : {}),
      facts: Object.freeze({ kind: 'registration', ...facts }),
    })
    diagnostic.record(event)
  }
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
    void network.close().then(() => {
      recordRegistry('retirement', 'stopped', { phase: 'closed' })
      resolveClosed()
    }, rejectClosed)
  }
  function finishEntry(entry: Entry): void {
    if (!entry.retiring || entry.users.size || entry.cleanupStarted) return
    entry.cleanupStarted = true
    void Promise.resolve()
      .then(entry.cleanup)
      .then(
        () => {
          if (entries.get(entry.key) === entry) entries.delete(entry.key)
          recordRegistry('retirement', 'stopped', { phase: 'closed', ...counts(entry) }, entry)
          entry.complete({ retired: true })
          finishNetwork()
        },
        () => {
          entry.cleanupFailed = true
          recordRegistry(
            'retirement',
            'failed',
            { phase: 'retiring', cancellation: 'cleanup_failed', ...counts(entry) },
            entry,
          )
          entry.complete({ cleanup_failed: true })
        },
      )
  }
  function dropUser(entry: Entry, user: User): void {
    if (user.released && user.executions === 0) {
      entry.users.delete(user)
      recordRegistry(
        entry.retiring ? 'retirement' : 'registration',
        'completed',
        { phase: entry.retiring ? 'retiring' : 'admitted', ...counts(entry) },
        entry,
        user.configurationRevision,
      )
      finishEntry(entry)
    }
  }
  function retain<T>(entry: Entry, user: User, completion: Promise<T>): Promise<T> {
    user.executions++
    recordRegistry(
      entry.retiring ? 'retirement' : 'registration',
      'accepted',
      { phase: entry.retiring ? 'retiring' : 'admitted', ...counts(entry) },
      entry,
      user.configurationRevision,
    )
    const finished = () => {
      user.executions--
      recordRegistry(
        entry.retiring ? 'retirement' : 'registration',
        'completed',
        { phase: entry.retiring ? 'retiring' : 'admitted', ...counts(entry) },
        entry,
        user.configurationRevision,
      )
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
      ...diagnostic.inspect(),
    })
  }
  async function retire(
    registration: AdaptationRegistration,
    policy: RetirementPolicy,
  ): Promise<RetirementResult> {
    const entry = registrations.get(registration)
    if (!entry || !retirementPolicyValid(policy)) {
      recordRegistry('retirement', 'rejected', {})
      return { rejected: 'invalidInput' }
    }
    const ownedPolicy = { ...policy }
    const wasRetiring = entry.retiring
    entry.retiring = true // Local linearization: no await before new acquisition is forbidden.
    if (!wasRetiring)
      recordRegistry('retirement', 'started', { phase: 'retiring', ...counts(entry) }, entry)
    if (ownedPolicy.force && !entry.cleanupStarted && entry.users.size > 0) {
      recordRegistry(
        'retirement',
        'cancel_requested',
        { phase: 'retiring', cancellation: 'requested', ...counts(entry) },
        entry,
      )
      for (const user of entry.users) user.controller.abort()
    }
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
      const result = await Promise.race([entry.completed, expired])
      if ('remaining_active' in result) {
        const references = safeCount(result.references)
        const executions = safeCount(result.executions)
        recordRegistry(
          'retirement',
          'waiting',
          {
            phase: 'retiring',
            cancellation: 'remaining_active',
            ...(references === undefined ? {} : { references }),
            ...(executions === undefined ? {} : { executions }),
          },
          entry,
        )
      }
      return result
    } finally {
      dispose()
    }
  }
  const service: ModelTransportService = {
    clearReuseScope: network.clearReuseScope,
    closed,
    inspect: status,
    diagnostics: network.diagnostics,
    retire,
    registerAdaptation(definition, meterSource, owner, cleanup) {
      if (!accepting || !owner || typeof owner !== 'object' || typeof cleanup !== 'function') {
        recordRegistry('registration', 'rejected', {})
        return { rejected: 'invalidInput' }
      }
      let owned: ModelDefinition | undefined
      try {
        owned = ownDefinitions([definition])[0]
      } catch (error) {
        if (error instanceof TypeError) {
          recordRegistry('registration', 'rejected', {})
          return { rejected: 'invalidInput' }
        }
        throw error
      }
      if (!owned) {
        recordRegistry('registration', 'rejected', {})
        return { rejected: 'invalidInput' }
      }
      const meter = ownInputMeter(meterSource)
      if (
        !meter ||
        !Object.hasOwn(owned.routes, meter.provider) ||
        !meterMatches(meter, owned, meter.provider)
      ) {
        recordRegistry('registration', 'rejected', {})
        return { rejected: 'invalidInput' }
      }
      return registerOwned(owned, meter)
      function registerOwned(
        owned: ModelDefinition,
        meter: InputMeter,
      ): ReturnType<ModelTransportService['registerAdaptation']> {
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
        if (
          declaration &&
          (!equivalent(declaration.definition) || declaration.meter !== meterSource)
        ) {
          recordRegistry('registration', 'rejected', {})
          return { rejected: 'invalidInput' }
        }
        const prior = entries.get(exact)
        if (prior) {
          if (
            !prior.retiring &&
            prior.owner === owner &&
            prior.cleanup === cleanup &&
            prior.meterSource === meterSource &&
            equivalent(prior.content)
          )
            return { registered: prior.registration }
          recordRegistry('registration', 'rejected', {}, prior)
          return { rejected: 'invalidInput' }
        }
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
        recordRegistry('registration', 'accepted', { phase: 'published', ...counts(entry) }, entry)
        return { registered: registration }
      }
    },
    acquire(binding, routeName) {
      const owned = ownBinding(binding)
      if (!owned || typeof routeName !== 'string' || owned.definition.modelId !== routeName) {
        recordRegistry('registration', 'rejected', {})
        return { rejected: 'invalidInput' }
      }
      const entry = entries.get(key(owned))
      if (!accepting || !entry || entry.retiring) {
        recordRegistry('registration', 'unavailable', {}, entry)
        return { rejected: 'unavailable' }
      }
      const definition = entry.registration.definition
      if (
        !Object.keys(definition.routes).some(
          provider =>
            'ok' in interpretConfiguration(definition, owned.configuration.values, provider),
        )
      ) {
        recordRegistry('registration', 'rejected', {}, entry)
        return { rejected: 'invalidInput' }
      }
      const user: User = {
        controller: new AbortController(),
        configurationRevision: owned.configuration.revision,
        executions: 0,
        released: false,
      }
      entry.users.add(user)
      recordRegistry(
        'registration',
        'accepted',
        { phase: 'admitted', ...counts(entry) },
        entry,
        owned.configuration.revision,
      )
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
        plan: async (input: PlanInput, execution) => {
          if (user.released || !sameBinding(input))
            return { rejected: 'invalidInput', reason: 'malformed' }
          if (!execution || !(execution.signal instanceof AbortSignal))
            return { rejected: 'invalidInput', reason: 'malformed' }
          const result = await retain(
            entry,
            user,
            plan(
              input,
              { ...execution, signal: AbortSignal.any([signal, execution.signal]) },
              [definition],
              entry.meter,
            ),
          )
          if ('planned' in result) {
            claim(result.planned)
            issuedPlans.add(result.planned)
          }
          return result
        },
        projectOutput: (planned, input) =>
          !user.released && issuedPlans.has(planned) && sameBinding(planned.input)
            ? network.projectOutput(planned, input)
            : { invalidInput: { reason: 'malformed' } },
        send: (planned, credential, cancellation, diagnostics?: TransportExecutionDiagnostics) => {
          if (
            user.released ||
            !issuedPlans.has(planned) ||
            !sameBinding(planned.input) ||
            !(cancellation instanceof AbortSignal)
          )
            return Promise.resolve({ rejected: 'invalidInput' })
          const completion = network
            .send(planned, credential, AbortSignal.any([signal, cancellation]), diagnostics)
            .then(result => {
              if ('response' in result) retain(entry, user, result.response.stopped)
              return result
            })
          return retain(entry, user, completion)
        },
        read: async function* (
          response,
          planned,
          cancellation,
          diagnostics?: TransportExecutionDiagnostics,
        ) {
          if (
            user.released ||
            !issuedPlans.has(planned) ||
            !sameBinding(planned.input) ||
            !(cancellation instanceof AbortSignal)
          )
            return { rejected: 'invalidInput', readFacts: emptyReadFacts() }
          let done = () => {}
          retain(
            entry,
            user,
            new Promise<void>(resolve => {
              done = resolve
            }),
          )
          try {
            return yield* network.read(
              response,
              planned,
              AbortSignal.any([signal, cancellation]),
              diagnostics,
            )
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
            if (user.executions)
              recordRegistry(
                'registration',
                'waiting',
                { phase: 'admitted', ...counts(entry) },
                entry,
                fixedBinding.configuration.revision,
              )
            dropUser(entry, user)
          }
        },
      })
      return { lease }
    },
    async close(policy) {
      if (!retirementPolicyValid(policy)) {
        recordRegistry('retirement', 'rejected', {})
        return { rejected: 'invalidInput' }
      }
      const wasAccepting = accepting
      accepting = false
      stopAdmission()
      if (wasAccepting) recordRegistry('retirement', 'started', { phase: 'retiring' })
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
