// @module-tag slow — starts an openssl child process and a real local HTTPS server, writes a vault
// file, and drives one Model call of each pi family through the assembled send path.
//
// The real request path of the local host: the local custodian resolves the credential inside the
// send fence, the Model send boundary starts the pi transport, the composed families encode the
// request and decode the recorded gateway stream, and the Model runtime preserves every fact in the
// injected in-memory ModelCommands. The server stands in for the gateway only; it answers with the
// recorded SSE body of the model that the request names.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
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
import {
  ANTHROPIC_RECORDS,
  anthropicTokenizerResources,
  createAnthropicFamily,
} from '@omne-harness/pi-ai-anthropic'
import {
  createOpenAiFamily,
  OPENAI_RECORDS,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import { assembleLocalModel, createLocalCustodian } from '@omne-harness/model-host-local'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { readRecordFixture, type FamilyName } from './support/records.ts'

/** The value the vault holds in this environment: a placeholder, never a real key. */
const PLACEHOLDER = 'placeholder-factory-credential'
const ROUTE_PATH = '/api/v1/chat/completions'

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
const MARGIN = { percent: '10', source: TEST_ADOPTION }
const FAMILIES = composeFamilies([
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

type Case = Readonly<{
  family: FamilyName
  name: string
  /** The gateway cost of the recorded stream, in OpenRouter credit. */
  payable: string
  /**
   * Whether the call is expected to settle. An output that holds a reasoning state needs the
   * replay of its message at the finish; the in-memory ModelCommands does not form it yet, so the
   * settlement of such a call is not judged here. The send path and the account are judged.
   */
  settles: boolean
}>

const CASES: readonly Case[] = [
  {
    family: 'pi-ai-openai',
    name: 'openai/gpt-6-sol',
    payable: '0.000123456789123456789',
    settles: true,
  },
  {
    family: 'pi-ai-anthropic',
    name: 'anthropic/claude-sonnet-5',
    payable: '0.000858',
    settles: false,
  },
]

function recordOf(item: Case) {
  const records =
    item.family === 'pi-ai-openai'
      ? OPENAI_RECORDS.filter(record => record.name === item.name)
      : ANTHROPIC_RECORDS.filter(record => record.name === item.name)
  const [record] = records
  if (record === undefined) throw new Error(`no record ${item.name}`)
  return readRecordFixture(item.family, record)
}

function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture value refused: ${JSON.stringify(outcome.failure)}`)
}

const certificate = createCertificate()
let server: HttpsFixture
let directory: string
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-host-local-assembly-')))
  const streams = new Map(
    CASES.map(item => [item.name, recordOf(item).stream] satisfies [string, string]),
  )
  server = await startHttpsServer(certificate, (res, request) => {
    const model: unknown = Reflect.get(Object(JSON.parse(request.body)), 'model')
    const stream = typeof model === 'string' ? streams.get(model) : undefined
    if (request.path !== ROUTE_PATH || stream === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(stream)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
  rmSync(directory, { recursive: true, force: true })
})

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

/** One local host over the vault, the families and an in-memory ModelCommands for one call. */
function assemble(request: FixedModelRequest, label: string) {
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  if (!account.ok || !organization.ok) throw new Error('fixture tenant')
  const scope = tenant(organization.value, account.value)
  const principal = Object.freeze({ subject: 'local-model-test' })
  const call = decoded(decodeModelCallId(`mcall_${label}`))
  const instance = decoded(decodeModelInstanceId(`minst_${label}`))
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
    owners: [
      { consumerOwner: 'local-model-consumer', work: { kind: 'exempt' }, evidence: TEST_ADOPTION },
    ],
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
      execution: input =>
        input.instance === instance && tenantEquals(input.tenant, scope)
          ? { ok: { owner: 'local-model-host', subject: 'local-channel', revision: '1' } }
          : { failure: { kind: 'denied', action: 'execution-channel' } },
    },
    evidence: [
      {
        adoption: TEST_ADOPTION,
        continuity: input =>
          input.source.owner === 'local-model-host' && input.source.record === call
            ? { ok: input.source }
            : unavailable(),
        materialization: input => ({ ok: evidence(`${input.call}/${input.dispatch}`) }),
        receive: input => ({
          ok: {
            window: input.window,
            batchDigest: input.batchDigest,
            paused: true,
            noPrefetch: true,
          },
        }),
        lateFact: unavailable,
        retry: unavailable,
        handoff: unavailable,
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
    path: join(directory, `${label}.vault.json`),
    factorySecret: PLACEHOLDER,
  })
  const host = assembleLocalModel({
    credentials: custodian,
    commands: memory.dependencies.commands,
    coordinator: memory.controls.send.coordinator,
    families: FAMILIES,
    network: { maxConnections: 2, idleConnectionTimeoutMs: 60_000, tls: { ca: certificate.cert } },
    routes: {
      openrouter: { url: new URL(ROUTE_PATH, server.url).href, endMarker: GATEWAY_END_MARKER },
    },
    transportLimits: TRANSPORT_LIMITS,
    maxRetainedAttempts: 4,
  })
  const sent = recording(host.send)
  const provider = createModelRuntime(
    { ...memory.dependencies, send: sent.boundary },
    CONFIGURATION,
  )
  const access = { principal, tenant: scope }
  return {
    access,
    call,
    provider,
    commands: memory.dependencies.commands,
    facts: sent.facts,
    async drive() {
      const admitted = await provider.runtime.calls.admit({
        ...access,
        call,
        operation: decoded(decodeModelOperationId(`mop_admit-${label}`)),
        request,
        consumer: {
          owner: 'local-model-consumer',
          work: 'work',
          position: 'answer',
          purpose: 'local-model-test',
        },
        capacity: { bytes: '100000', blocks: '20', attachmentBytes: '0' },
      })
      if ('failure' in admitted) throw new Error(`admit: ${JSON.stringify(admitted.failure)}`)
      return provider.driver.drive(
        {
          ...access,
          call,
          instance,
          operation: decoded(decodeModelOperationId(`mop_claim-${label}`)),
          continuity: evidence(call),
        },
        new AbortController().signal,
      )
    },
    async close() {
      await host.close()
      custodian.close()
    },
  }
}

describe('one call of each family through the assembled local send path', () => {
  it.each(CASES.map((item): [string, Case] => [item.name, item]))(
    '%s: the custodian credential reaches the gateway and the account reaches ModelCommands',
    async (name, item) => {
      const { request } = recordOf(item)
      const label = name.replace(/[^a-z0-9]/gu, '-')
      const local = assemble(request, label)
      try {
        const before = server.requests.length
        const driven = await local.drive()
        if (item.settles) expect(driven).toEqual({ ok: undefined })

        // The request carried the value the custodian resolved, inside the send fence.
        const received = server.requests.slice(before)
        expect(received).toHaveLength(1)
        expect(received[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

        // The facts the boundary handed out end with exactly one termination.
        expect(local.facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
        expect(local.facts.at(-1)?.kind).toBe('ended')
        const reported = local.facts.filter(fact => fact.kind === 'account')
        expect(reported).toHaveLength(1)

        // ModelCommands completed the account with this call and the receipt.
        const dispatches = decoded(
          await local.commands.dispatches({ ...local.access, call: local.call }),
        )
        expect(dispatches).toHaveLength(1)
        const ended = local.facts.find(
          (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
        )
        if (item.settles) expect(dispatches[0]?.terminal).toEqual(ended?.termination)
        const account = dispatches[0]?.account
        expect(account).toEqual({
          ...reported[0]?.value,
          subject: { kind: 'model_call', id: local.call },
          receipt: 'received',
        })
        expect(payableAmount(account)).toEqual({
          ok: { state: 'known', lexeme: item.payable, unit: 'openrouter-credit' },
        })

        // The secret entered neither the facts nor the kept records.
        expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
        expect(JSON.stringify(dispatches)).not.toContain(PLACEHOLDER)
      } finally {
        await local.close()
      }
    },
  )
})
