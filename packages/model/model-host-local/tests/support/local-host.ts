// Test support of the slow layer: one local host over a vault, the two real families and the
// in-memory ModelCommands of model, assembled with `assembleLocalModel` and driven by the real
// Model runtime. The vault holds a placeholder. The gateway is a local HTTPS server that the spec
// starts; only the recorder of real requests points it beyond the machine, through the proxy.
import { join } from 'node:path'
import { accountCodec, organizationCodec, tenant, tenantEquals } from '@omne-harness/legal-identity'
import { createModelRuntime, type ModelConfiguration } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import {
  decodeCredentialId,
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type FixedModelRequest,
  type ModelFailure,
  type ModelSendBoundary,
  type TransportFact,
} from '@omne-harness/model-contract'
import { anthropicTokenizerResources, createAnthropicFamily } from '@omne-harness/pi-ai-anthropic'
import { createOpenAiFamily, openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import { composeFamilies, type ProxyConfig } from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import { assembleLocalModel, createLocalCustodian } from '@omne-harness/model-host-local'
import { factorySupplier } from './profiles.ts'

/** The value the vault holds in this environment: a placeholder, never a real key. */
export const PLACEHOLDER = 'placeholder-factory-credential'
export const ROUTE_PATH = '/api/v1/chat/completions'

/** The consumer owner of every call, and the owner of its completion evidence. */
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
/** The margin of both families: 10 percent of the estimated part. A test parameter. */
export const MARGIN_PERCENT = 10n
const MARGIN = { percent: String(MARGIN_PERCENT), source: TEST_ADOPTION }
/** The two real families with their tokenizers, the test limits and the test margin. */
export const FAMILIES = composeFamilies([
  createOpenAiFamily({
    tokenizer: openAiTokenizerResources(),
    limits: FAMILY_LIMITS,
    margin: MARGIN,
  }),
  createAnthropicFamily({
    tokenizer: anthropicTokenizerResources(),
    limits: FAMILY_LIMITS,
    margin: MARGIN,
  }),
])
const TRANSPORT_LIMITS = {
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
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 4096,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  retryBackoffMs: 0,
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

/** The send boundary, with every fact it hands to the runtime kept in order. */
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
  /** Names the call, the instance, the operations and the vault file. */
  label: string
  /** A private directory for the vault file. */
  directory: string
  gateway: Gateway
}>

/**
 * Where the route of the host points. A local server gives its own certificate as `ca`; without
 * `ca` the host trusts Node's default certificate authorities. `proxy` and `connectTimeoutMs` are
 * for a gateway beyond the machine, reached through the environment's proxy.
 */
export type Gateway = Readonly<{
  url: URL
  ca?: Buffer
  proxy?: ProxyConfig
  connectTimeoutMs?: number
}>

/**
 * One local host for one call: the vault, the assembled send path with its preparation
 * resources, an in-memory ModelCommands and the Model runtime over them. `drive` admits and
 * drives the call; the consumer evidence accepts a processed completion of this call.
 */
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
      capacity: { bytes: '1000000', blocks: '100', attachmentBytes: '0' },
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
        receive: given => ({
          ok: {
            window: given.window,
            batchDigest: given.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        // The consumer of these tests vouches for a processed completion of this call only.
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
      // The runtime's own sender is not used: the assembled send boundary replaces it.
      credentials: {
        present: () => ({ kind: 'unavailable' }),
        resolve: () => ({ kind: 'unavailable' }),
      },
      sources: request.suppliers.map(supplier => ({
        profile: request.profile,
        supplier: supplier.adoption,
        recipient: supplier.recipient,
        model: supplier.model,
        credential: {
          kind: 'factory',
          official: true,
          queryId: decoded(decodeCredentialId('local-model-query')),
        },
        current: () => ({ ok: { authorized: true, noTenantBinding: true } }),
      })),
    },
  })
  const custodian = createLocalCustodian({
    path: join(input.directory, `${label}.vault.json`),
    factorySecret: PLACEHOLDER,
  })
  const host = assembleLocalModel({
    credentials: custodian,
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
        url: new URL(ROUTE_PATH, gateway.url).href,
        endMarker: GATEWAY_END_MARKER,
      },
    },
    transportLimits: {
      ...TRANSPORT_LIMITS,
      connectTimeoutMs: gateway.connectTimeoutMs ?? TRANSPORT_LIMITS.connectTimeoutMs,
    },
    maxRetainedAttempts: 4,
    preparation: { maxCitedCalls: 8, supplierOf: factorySupplier() },
  })
  const sent = recording(host.send)
  const provider = createModelRuntime(
    { ...memory.dependencies, send: sent.boundary },
    CONFIGURATION,
  )
  const access = { principal, tenant: scope }
  return {
    access,
    /** The same principal in another tenant: the authority denies it everything. */
    foreign: { principal, tenant: tenantOf('6') },
    call,
    operation,
    evidence,
    /** The completion evidence of the consumer for this result version of the call. */
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
          capacity: { bytes: '100000', blocks: '20', attachmentBytes: '0' },
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
      await host.close()
      custodian.close()
    },
  }
}
