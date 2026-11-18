import { testExecutor } from './executor.ts'
import { join } from 'node:path'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import {
  createDefaultRetryPolicy,
  createModelRuntime,
  verifyRetryDecision,
  type ModelConfiguration,
} from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type FixedModelRequest,
  type ModelFailure,
} from '@omne-harness/model-contract'
import { type ModelSendBoundary, type TransportFact } from '@omne-harness/model-contract/provider'
import { anthropicTokenizerResources, createAnthropicFamily } from '@omne-harness/pi-ai-anthropic'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { composeFamilies, type ProxyConfig } from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import type { RetryPolicy } from '@omne-harness/retry'
import {
  assembleLocalModel,
  type LocalModelConfig,
  type ModelReceiveEvidenceReader,
} from '@omne-harness/model-host-local'
import { createTestCredentials } from './credentials.ts'
import { factorySupplier } from './profiles.ts'

export const PLACEHOLDER = 'placeholder-factory-credential'
export const ROUTE_PATH = '/api/v1/chat/completions'
export const MESSAGES_PATH = '/api/v1/messages'
export const RESPONSES_PATH = '/api/v1/responses'

/** Whether a request went to an interface of the test gateway. */
export function isGatewayPath(path: string | undefined): boolean {
  return path === ROUTE_PATH || path === MESSAGES_PATH || path === RESPONSES_PATH
}

/** The test gateway's route: the three interfaces at one origin. */
export function gatewayEndpoints(origin: string | URL) {
  return {
    'chat-completions': { url: new URL(ROUTE_PATH, origin).href, endMarker: GATEWAY_END_MARKER },
    messages: { url: new URL(MESSAGES_PATH, origin).href, endMarker: null },
    responses: { url: new URL(RESPONSES_PATH, origin).href, endMarker: GATEWAY_END_MARKER },
  }
}

const CONSUMER = 'local-model-consumer'
const TEST_ADOPTION: Adoption = {
  owner: 'model-host-local-tests',
  name: 'local-model',
  revision: '1',
  digest: '0'.repeat(64),
}
const FAMILY_LIMITS = {
  toolArguments: {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 1_024,
    maxMembers: 256,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  },
  maxReasoningText: 65_536,
}
export const MARGIN_PERCENT = 10n
const MARGIN = { percent: String(MARGIN_PERCENT), source: TEST_ADOPTION }
export const EXECUTOR = await testExecutor([
  openAiTokenizerResources(),
  anthropicTokenizerResources(),
])

export const FAMILIES = composeFamilies([
  createOpenAiFamily({
    tokenizer: openAiTokenizerResources(),
    executor: EXECUTOR,
    limits: FAMILY_LIMITS,
    margin: MARGIN,
  }),
  createAnthropicFamily({
    tokenizer: anthropicTokenizerResources(),
    executor: EXECUTOR,
    limits: FAMILY_LIMITS,
    margin: MARGIN,
  }),
])
export const TRANSPORT_LIMITS = {
  connectTimeoutMs: 5_000,
  maxErrorBodyBytes: 4_096,
  maxEventBytes: 1_048_576,
  json: {
    maxBytes: 1_048_576,
    maxDepth: 64,
    maxItems: 4_096,
    maxMembers: 1_024,
    maxStringLength: 1_048_576,
    maxNumberLength: 64,
  },
}
const CONFIGURATION: ModelConfiguration = {
  outputBatchBytes: 16_384,
  outputBatchDelayMs: 100,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  cleanupRetryMs: 0,
}

export function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture value refused: ${JSON.stringify(outcome.failure)}`)
}

function tenantOf(suffix: string) {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  return tenant(organization.value, account.value)
}

function recording<P>(send: ModelSendBoundary<P>) {
  const facts: TransportFact[] = []
  const boundary: ModelSendBoundary<P> = {
    async send(input, signal) {
      const result = await send.send(input, signal)
      if (result.kind !== 'started') return result
      const source = result.facts
      return {
        ...result,
        facts: {
          async *[Symbol.asyncIterator]() {
            for await (const fact of source) {
              facts.push(structuredClone(fact))
              yield fact
            }
          },
        },
      }
    },
  }
  return { boundary, facts }
}

export type LocalHostInput = Readonly<{
  request: FixedModelRequest
  requestDisclosure?: LocalModelConfig<unknown>['requestDisclosure']
  label: string
  directory: string
  gateway: Gateway
  retry?: RetryPolicy
}>

export type Gateway = Readonly<{
  url: URL
  ca?: Buffer
  proxy?: ProxyConfig
  connectTimeoutMs?: number
}>

export function assembleLocalHost(input: LocalHostInput) {
  const { request, label, gateway } = input
  const scope = tenantOf('5')
  const principal = Object.freeze({ subject: 'local-model-test' })
  const call = decoded(decodeModelCallId(`mcall_${label}`))
  const instance = decoded(decodeModelInstanceId(`minst_${label}`))
  const operation = (name: string) => decoded(decodeModelOperationId(`mop_${name}-${label}`))
  const evidence = (record: string) => ({
    owner: 'local-model-host',
    record,
    revision: '1',
    digest: '1'.repeat(64),
  })
  const unavailable = (): { failure: ModelFailure } => ({
    failure: { kind: 'unavailable', dependency: 'local-model-test', diagnostic: 'not-supplied' },
  })
  const receive: { reader: ModelReceiveEvidenceReader | undefined } = { reader: undefined }
  const memory = createTestModelDependencies<typeof principal>({
    start: '2026-10-23T00:00:00.000Z',
    maxWaiters: 32,
    maxQueued: 8,
    sends: [],
    owners: [{ consumerOwner: CONSUMER, work: { kind: 'exempt' }, evidence: TEST_ADOPTION }],
    limits: {
      scanPageCalls: 8,
      resultPageParts: 8,
      resultPageTargetBytes: 4096,
      readIdleMs: 1000,
      unacknowledgedResults: 10,
    },
    authority: {
      authorize: ({ access, action }) =>
        access.principal === principal && tenantEquals(access.tenant, scope)
          ? { ok: { owner: 'local-model-identity', subject: principal.subject, revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: given =>
        given.instance === instance && tenantEquals(given.tenant, scope)
          ? { ok: { owner: 'local-model-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption: TEST_ADOPTION,
        continuity: given =>
          given.source.owner === 'local-model-host' && given.source.record === call
            ? { ok: given.source }
            : unavailable(),
        materialization: given => ({ ok: evidence(`${given.call}/${given.dispatch}`) }),
        receive: given => receive.reader?.prove(given) ?? unavailable(),
        lateFact: unavailable,
        retry: input.retry === undefined ? unavailable : verifyRetryDecision,
        handoff: given =>
          given.call === call &&
          given.evidence.kind === 'processed' &&
          given.evidence.completion.owner === CONSUMER &&
          given.evidence.completion.record === `${call}/${given.result}`
            ? { ok: given.evidence.completion }
            : unavailable(),
      },
    ],
    sending: {
      maxRetainedAttempts: 1,
      credentials: {
        layerOf: () => ({ failure: { kind: 'unavailable' } }),
        resolve: () => ({ failure: { kind: 'unavailable' } }),
      },
      sources: request.suppliers.map(supplier => ({
        profile: request.profile,
        supplier: supplier.adoption,
        provider: supplier.provider,
        model: supplier.model,
        official: true,
        current: () => ({ ok: { authorized: true } }),
      })),
    },
  })
  const credentials = createTestCredentials<typeof principal>({
    path: join(input.directory, `${label}.vault.json`),
    secret: PLACEHOLDER,
    providers: ['openrouter'],
  })
  const host = assembleLocalModel({
    ...(input.requestDisclosure === undefined
      ? {}
      : { requestDisclosure: input.requestDisclosure }),
    credentials: credentials.port,
    materialization: {
      maxRecords: 4,
      execution: reference =>
        tenantEquals(reference.tenant, scope) && reference.instance === instance
          ? { ok: { owner: 'local-model-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    commands: memory.dependencies.commands,
    coordinator: memory.controls.send.coordinator,
    families: FAMILIES,
    network: {
      maxConnections: 2,
      idleConnectionTimeoutMs: 60_000,
      ...(gateway.ca === undefined ? {} : { tls: { ca: gateway.ca } }),
      ...(gateway.proxy === undefined ? {} : { proxy: gateway.proxy }),
    },
    routes: {
      openrouter: {
        endpoints: gatewayEndpoints(gateway.url),
        accounting: { place: 'openrouter', costUnit: 'openrouter-credit' },
        auth: { kind: 'bearer', item: 'apiKey' },
      },
    },
    transportLimits: {
      ...TRANSPORT_LIMITS,
      connectTimeoutMs: gateway.connectTimeoutMs ?? TRANSPORT_LIMITS.connectTimeoutMs,
    },
    maxRetainedAttempts: 4,
    preparation: { maxCitedCalls: 8, supplierOf: factorySupplier() },
  })
  receive.reader = host.receive
  const sent = recording(host.send)
  const retry =
    input.retry === undefined
      ? memory.dependencies.retry
      : createDefaultRetryPolicy<typeof principal>({
          adoption: request.retryPolicy,
          policy: input.retry,
          replayResend: { max: 1 },
          clock: memory.dependencies.clock,
          random: () => 0,
        })
  const provider = createModelRuntime(
    { ...memory.dependencies, send: sent.boundary, retry },
    CONFIGURATION,
  )
  const access = { principal, tenant: scope }
  return {
    access,
    foreign: { principal, tenant: tenantOf('6') },
    call,
    operation,
    evidence,
    completion: (result: string) => ({ ...evidence(`${call}/${result}`), owner: CONSUMER }),
    provider,
    host,
    commands: memory.dependencies.commands,
    facts: sent.facts,
    async drive() {
      const admitted = decoded(
        await provider.runtime.calls.admit({
          ...access,
          call,
          operation: operation('admit'),
          request,
          consumer: {
            owner: CONSUMER,
            work: 'work',
            position: 'answer',
            purpose: 'local-model-test',
          },
        }),
      )
      const driven = await provider.driver.drive(
        {
          ...access,
          call,
          instance,
          operation: operation('claim'),
          continuity: evidence(call),
        },
        new AbortController().signal,
      )
      return { driven, reference: admitted.reference }
    },
    async close() {
      try {
        await host.close()
      } finally {
        credentials.close()
      }
    },
  }
}
