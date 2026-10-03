import { projectOutput } from './projection.ts'
import { emptyReadFacts } from './read-facts.ts'
import { Agent, type RequestOptions } from 'node:https'
import type {
  TransportAdapter,
  TransportExecutionDiagnostics,
  PlanExecutionContext,
  PlanInput,
  PlanResult,
} from '@omne-harness-lite/model-request-runtime'
import { planRequest, claimPlan, planAvailable, type PlannedRequest } from './plan.ts'
import {
  sendRequest,
  type RawResponse,
  type NetworkResources,
  type TransportPolicy,
  type Diagnostic,
} from './http.ts'
import { readStream } from './stream.ts'
import { ownDefinitions, type ModelDefinition } from './definitions.ts'
import { ownCredentialConfiguration } from './credential-policy.ts'
import { connectionAdmission } from './connections.ts'
import { meterMatches, ownInputMeter, type InputMeter } from './input-meter.ts'
import { createImagePreparer } from './image-preparation/index.ts'
import type { ImagePreparePolicy, LoadedImageCodec } from './image-preparation/types.ts'
import { ownPolicy } from './image-preparation/validation.ts'
import { createScopeCleaner } from './scope-cleanup.ts'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/'
export interface TransportOptions {
  readonly policy: TransportPolicy
  /** Public function tests may use an explicit HTTPS endpoint; product plugin stays fixed. */
  readonly baseUrl?: string
  readonly tls?: Pick<RequestOptions, 'ca'>
  readonly definitions: readonly ModelDefinition[]
  readonly inputMeters: readonly InputMeter[]
  /** Codec loading belongs to the assembly; null explicitly means unavailable. */
  readonly imagePreparation?: {
    readonly policy: ImagePreparePolicy
    readonly codec: LoadedImageCodec | null
  }
  readonly onDiagnostic?: (event: Diagnostic) => void | Promise<void>
}
export interface PiAiTransport extends TransportAdapter<PlannedRequest, RawResponse> {
  readonly clearReuseScope: (scope: object) => void
  readonly close: () => Promise<void>
  readonly diagnostics: () => {
    readonly failed: number
    readonly pending: number
    readonly dropped: number
  }
}
export function createPiAiTransport(options: TransportOptions): PiAiTransport {
  return createOwnedTransport(options).transport
}

/** Module-internal owner controls keep stopping admission separate from pool destruction. */
export function createOwnedTransport(options: TransportOptions): {
  readonly transport: PiAiTransport
  readonly stopAdmission: () => void
  readonly claim: (planned: PlannedRequest) => void
  readonly plan: (
    input: PlanInput,
    execution: PlanExecutionContext,
    definitions: readonly ModelDefinition[],
    meter: InputMeter | undefined,
  ) => Promise<PlanResult<PlannedRequest>>
} {
  const policy = ownTransportPolicy(options)
  const baseUrl = transportBaseUrl(options)
  const definitions = ownDefinitions(options.definitions)
  const inputMeters = ownTransportMeters(options, definitions)
  const owner = Object.freeze({})
  const claim = (planned: PlannedRequest) => claimPlan(planned, owner)
  const preparer = transportImagePreparer(options)
  const scopeCleaner = createScopeCleaner(preparer ? [preparer] : [])
  const planningController = new AbortController()
  const planning = new Set<Promise<PlanResult<PlannedRequest>>>()
  const agent = new Agent({
    keepAlive: true,
    maxSockets: policy.maxConnections,
    maxTotalSockets: policy.maxConnections,
    timeout: policy.idleConnectionTimeoutMs,
  })
  let closed = false,
    failed = 0,
    pending = 0,
    dropped = 0
  const diagnostic = (event: Diagnostic) => {
    if (!options.onDiagnostic) return
    if (pending >= policy.maxConnections) {
      dropped++
      return
    }
    try {
      const result = options.onDiagnostic(Object.freeze(event))
      if (result !== undefined) {
        if (result === null || typeof result.then !== 'function') {
          failed++
          return
        }
        pending++
        void Promise.resolve(result).then(
          () => {
            pending--
          },
          () => {
            pending--
            failed++
          },
        )
      }
    } catch {
      failed++
    }
  }
  const active = new Set<Promise<void>>()
  const admission = connectionAdmission(policy.maxConnections)
  const stopAdmission = () => {
    closed = true
    admission.close()
    planningController.abort()
  }
  const resources: NetworkResources = {
    agent,
    baseUrl,
    policy,
    ...(options.tls ? { tls: Object.freeze({ ...options.tls }) } : {}),
    active,
    closed: () => closed,
    acquireConnection: signal => admission.acquire(signal),
    diagnostic,
  }
  const transport: PiAiTransport = {
    clearReuseScope: scopeCleaner.clear,
    plan: async (input, execution) => {
      if (closed) return { rejected: 'unavailable' }
      const definition = definitions.find(
        d =>
          d.modelId === input.routeName &&
          d.revision === input.snapshot?.adaptation?.definition?.revision &&
          d.implementation.name === input.snapshot?.adaptation?.implementation?.name &&
          d.implementation.revision === input.snapshot?.adaptation?.implementation?.revision,
      )
      const meter =
        definition &&
        inputMeters.find(candidate => meterMatches(candidate, definition, input.provider))
      return plan(input, execution, definitions, meter)
    },
    projectOutput: (planned, input) =>
      planAvailable(planned, owner, definitions, inputMeters)
        ? projectOutput(input)
        : { invalidInput: { reason: 'malformed' } },
    send: (planned, credential, signal, diagnostics) =>
      planAvailable(planned, owner, definitions, inputMeters)
        ? sendRequest(planned, credential, signal, resources, diagnostics)
        : Promise.resolve({ rejected: 'invalidInput' }),
    read: async function* (response, planned, signal, diagnostics?: TransportExecutionDiagnostics) {
      if (!planAvailable(planned, owner, definitions, inputMeters))
        return { rejected: 'invalidInput', readFacts: emptyReadFacts() }
      return yield* readStream(response, planned, signal, {
        maxSseEventBytes: policy.maxSseEventBytes,
        diagnostic,
        ...(diagnostics ? { executionDiagnostics: diagnostics } : {}),
      })
    },
    diagnostics: () => Object.freeze({ failed, pending, dropped }),
    close: () => (closePromise ??= drain()),
  }
  let closePromise: Promise<void> | undefined
  async function drain(): Promise<void> {
    stopAdmission()
    agent.destroy()
    await Promise.all([
      ...(preparer ? [preparer.close()] : []),
      scopeCleaner.drain(),
      ...planning,
      ...active,
    ])
  }
  function plan(
    input: PlanInput,
    execution: PlanExecutionContext,
    declarations: readonly ModelDefinition[],
    meter: InputMeter | undefined,
  ): Promise<PlanResult<PlannedRequest>> {
    if (closed) return Promise.resolve({ rejected: 'unavailable' })
    if (!execution || !(execution.signal instanceof AbortSignal))
      return Promise.resolve({ rejected: 'invalidInput', reason: 'malformed' })
    const completion = planRequest(
      input,
      declarations,
      meter,
      { ...execution, signal: AbortSignal.any([execution.signal, planningController.signal]) },
      preparer,
    ).then(result => {
      if ('planned' in result) claim(result.planned)
      return result
    })
    planning.add(completion)
    const finished = () => {
      planning.delete(completion)
    }
    void completion.then(finished, finished)
    return completion
  }
  return { transport: Object.freeze(transport), stopAdmission, claim, plan }
}

function ownTransportPolicy(options: TransportOptions) {
  const policy = Object.freeze({
    ...options.policy,
    credentialRedaction: ownCredentialConfiguration(options.policy.credentialRedaction),
  })
  for (const key of [
    'maxConnections',
    'idleConnectionTimeoutMs',
    'maxErrorBodyBytes',
    'maxSseEventBytes',
  ] as const)
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) throw new TypeError(`invalid ${key}`)
  if (
    policy.connectTimeoutMs !== null &&
    (!Number.isSafeInteger(policy.connectTimeoutMs) || policy.connectTimeoutMs < 1)
  )
    throw new TypeError('invalid connectTimeoutMs')
  return policy
}

function transportBaseUrl(options: TransportOptions): URL {
  const baseUrl = new URL(options.baseUrl ?? OPENROUTER_BASE_URL)
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    !baseUrl.pathname.endsWith('/')
  )
    throw new TypeError('explicit HTTPS base URL required')
  return baseUrl
}

function ownTransportMeters(options: TransportOptions, definitions: readonly ModelDefinition[]) {
  const inputMeters = options.inputMeters.map(value => {
    const meter = ownInputMeter(value)
    if (!meter) throw new TypeError('invalid input meter')
    if (
      !definitions.some(
        definition =>
          Object.hasOwn(definition.routes, meter.provider) &&
          meterMatches(meter, definition, meter.provider),
      )
    )
      throw new TypeError('input meter does not match a supplied definition')
    return meter
  })
  for (let index = 0; index < inputMeters.length; index++) {
    const meter = inputMeters[index]
    if (!meter) throw new Error('meter index invariant')
    if (
      inputMeters
        .slice(0, index)
        .some(
          other =>
            other.modelId === meter.modelId &&
            other.definitionRevision === meter.definitionRevision &&
            other.provider === meter.provider &&
            other.implementation.name === meter.implementation.name &&
            other.implementation.revision === meter.implementation.revision,
        )
    )
      throw new TypeError('duplicate exact input meter')
  }
  return inputMeters
}

function transportImagePreparer(options: TransportOptions) {
  if (
    options.imagePreparation !== undefined &&
    (!options.imagePreparation ||
      typeof options.imagePreparation !== 'object' ||
      Object.keys(options.imagePreparation).length !== 2 ||
      !Object.hasOwn(options.imagePreparation, 'policy') ||
      !Object.hasOwn(options.imagePreparation, 'codec'))
  )
    throw new TypeError('explicit image policy and codec required')
  const preparation =
    options.imagePreparation === undefined || options.imagePreparation.codec === null
      ? undefined
      : createImagePreparer(options.imagePreparation.policy, options.imagePreparation.codec)
  if (options.imagePreparation?.codec === null) ownPolicy(options.imagePreparation.policy)
  const preparer = preparation && 'ready' in preparation ? preparation.ready : undefined
  return preparer
}
