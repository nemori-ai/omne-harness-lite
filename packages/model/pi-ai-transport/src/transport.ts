import { Agent, type RequestOptions } from 'node:https'
import type { TransportAdapter } from '@omne-harness-lite/model-request-runtime'
import { planRequest, type PlannedRequest } from './plan.ts'
import {
  sendRequest,
  type RawResponse,
  type NetworkResources,
  type TransportPolicy,
  type Diagnostic,
} from './http.ts'
import { readStream } from './stream.ts'
import { pilotDefinitions, ownDefinitions, type ModelDefinition } from './definitions.ts'
import { connectionAdmission } from './connections.ts'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/'
export interface TransportOptions {
  readonly policy: TransportPolicy
  /** Public function tests may use an explicit HTTPS endpoint; product plugin stays fixed. */
  readonly baseUrl?: string
  readonly tls?: Pick<RequestOptions, 'ca'>
  readonly definitions?: readonly ModelDefinition[]
  readonly onDiagnostic?: (event: Diagnostic) => void | Promise<void>
}
export interface PiAiTransport extends TransportAdapter<PlannedRequest, RawResponse> {
  readonly close: () => Promise<void>
  readonly diagnostics: () => {
    readonly failed: number
    readonly pending: number
    readonly dropped: number
  }
}
export function createPiAiTransport(options: TransportOptions): PiAiTransport {
  const policy = Object.freeze({ ...options.policy })
  for (const key of [
    'maxConnections',
    'idleConnectionTimeoutMs',
    'maxErrorBodyBytes',
    'maxSseEventBytes',
    'credentialFragmentMinLength',
  ] as const)
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1) throw new TypeError(`invalid ${key}`)
  if (
    policy.connectTimeoutMs !== null &&
    (!Number.isSafeInteger(policy.connectTimeoutMs) || policy.connectTimeoutMs < 1)
  )
    throw new TypeError('invalid connectTimeoutMs')
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
  const definitions = ownDefinitions(options.definitions ?? pilotDefinitions)
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
      if (result) {
        pending++
        void result.then(
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
    plan: input => (closed ? { rejected: 'unavailable' } : planRequest(input, definitions)),
    send: (planned, credential, signal) => sendRequest(planned, credential, signal, resources),
    read: (response, planned, signal) =>
      readStream(response, planned, signal, {
        maxSseEventBytes: policy.maxSseEventBytes,
        diagnostic,
      }),
    diagnostics: () => Object.freeze({ failed, pending, dropped }),
    close: async () => {
      closed = true
      admission.close()
      agent.destroy()
      await Promise.all([...active])
    },
  }
  return Object.freeze(transport)
}
